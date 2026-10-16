/**
 * Visibilidad satelital y DOP para planear la hora de ocupación.
 *
 * Órbitas: TLE de CelesTrak propagados con SGP4 (satellite.js). Un TLE trae
 * errores de unos km, irrelevantes para elevación/azimut y DOP. Se usa el
 * snapshot diario `public/gnss-orbits.json`; si tiene más de dos días se
 * intenta CelesTrak en vivo (CORS abierto) y, si falla, se usa el snapshot.
 *
 * DOP: mínimos cuadrados en ENU con un sesgo de reloj por constelación (lo
 * habitual en multi-GNSS: cada sistema tiene su propia escala de tiempo).
 */
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  degreesToRadians,
  type SatRec,
} from 'satellite.js'

export type GnssSystem = 'G' | 'R' | 'E' | 'C'

export const SYSTEMS: { id: GnssSystem; label: string; group: string }[] = [
  { id: 'G', label: 'GPS', group: 'gps-ops' },
  { id: 'R', label: 'GLONASS', group: 'glo-ops' },
  { id: 'E', label: 'Galileo', group: 'galileo' },
  { id: 'C', label: 'BeiDou', group: 'beidou' },
]

/** Colombia no tiene horario de verano: COT = UTC−5 todo el año. */
export const COT_OFFSET_MIN = -5 * 60

export interface Satellite {
  system: GnssSystem
  /** Etiqueta corta: PRN cuando el nombre lo trae (G22, C04), si no el nombre. */
  label: string
  name: string
  satrec: SatRec
}

export interface OrbitSet {
  satellites: Satellite[]
  /** Fecha (ISO) de los elementos usados. */
  generatedAt: string
  source: 'snapshot' | 'celestrak'
}

type RawSystems = Partial<Record<GnssSystem, [string, string, string][]>>

function shortLabel(system: GnssSystem, name: string): string {
  const prn = name.match(/PRN\s*(\d+)/i)
  if (system === 'G' && prn) return `G${prn[1].padStart(2, '0')}`
  const bds = name.match(/\((C\d+)\)/)
  if (system === 'C' && bds) return bds[1]
  return name.replace(/\s*\(.*\)\s*/, '').trim()
}

function toSatellites(raw: RawSystems): Satellite[] {
  const out: Satellite[] = []
  for (const { id } of SYSTEMS) {
    for (const [name, l1, l2] of raw[id] ?? []) {
      try {
        const satrec = twoline2satrec(l1, l2)
        if (satrec.error) continue
        out.push({ system: id, name, label: shortLabel(id, name), satrec })
      } catch {
        /* TLE mal formado: se omite */
      }
    }
  }
  return out
}

async function fetchCelestrak(signal?: AbortSignal): Promise<RawSystems> {
  const entries = await Promise.all(
    SYSTEMS.map(async ({ id, group }) => {
      const res = await fetch(
        `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`,
        { signal },
      )
      if (!res.ok) throw new Error(`CelesTrak ${group}: HTTP ${res.status}`)
      const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim())
      const sats: [string, string, string][] = []
      for (let i = 0; i + 2 < lines.length; i += 3) {
        if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 '))
          sats.push([lines[i].trim(), lines[i + 1], lines[i + 2]])
      }
      return [id, sats] as const
    }),
  )
  const raw = Object.fromEntries(entries) as RawSystems
  if (Object.values(raw).reduce((n, v) => n + (v?.length ?? 0), 0) < 40)
    throw new Error('CelesTrak devolvió muy pocos satélites')
  return raw
}

const MAX_SNAPSHOT_AGE_MS = 2 * 86_400_000
let orbitsPromise: Promise<OrbitSet> | null = null

export function loadOrbits(): Promise<OrbitSet> {
  if (!orbitsPromise) {
    orbitsPromise = (async () => {
      let snap: { generatedAt: string; systems: RawSystems } | null = null
      try {
        const res = await fetch('./gnss-orbits.json', { cache: 'no-cache' })
        if (res.ok) snap = await res.json()
      } catch {
        /* sin snapshot: se intenta en vivo */
      }
      const fresh = snap && Date.now() - Date.parse(snap.generatedAt) < MAX_SNAPSHOT_AGE_MS
      if (!fresh) {
        try {
          const raw = await fetchCelestrak()
          return { satellites: toSatellites(raw), generatedAt: new Date().toISOString(), source: 'celestrak' }
        } catch (e) {
          if (!snap) throw e
        }
      }
      return { satellites: toSatellites(snap!.systems), generatedAt: snap!.generatedAt, source: 'snapshot' }
    })()
    orbitsPromise.catch(() => {
      orbitsPromise = null
    })
  }
  return orbitsPromise
}

/* ------------------------------ cálculo -------------------------------- */

export interface SatLook {
  sat: Satellite
  azDeg: number
  elDeg: number
}

export interface DopSample {
  /** Instante (UTC). */
  time: Date
  /** Minutos desde la medianoche local (COT) del día consultado. */
  minute: number
  visible: SatLook[]
  bySystem: Record<GnssSystem, number>
  pdop: number | null
  hdop: number | null
  vdop: number | null
}

export interface VisibilityOptions {
  lat: number
  lon: number
  heightM?: number
  /** Fecha civil local (YYYY-MM-DD); se calcula de 00:00 a 24:00 COT. */
  date: string
  maskDeg: number
  systems: GnssSystem[]
  stepMin?: number
}

/** Inversa por Gauss-Jordan de una matriz simétrica pequeña; null si es singular. */
function invert(a: number[][]): number[][] | null {
  const n = a.length
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-10) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    const d = m[c][c]
    for (let j = 0; j < 2 * n; j++) m[c][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c]
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j]
    }
  }
  return m.map((row) => row.slice(n))
}

function dop(visible: SatLook[]): Pick<DopSample, 'pdop' | 'hdop' | 'vdop'> {
  const systems = [...new Set(visible.map((v) => v.sat.system))]
  const n = 3 + systems.length
  if (visible.length < n) return { pdop: null, hdop: null, vdop: null }
  const N = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (const v of visible) {
    const az = degreesToRadians(v.azDeg)
    const el = degreesToRadians(v.elDeg)
    const row = new Array<number>(n).fill(0)
    row[0] = -Math.cos(el) * Math.sin(az)
    row[1] = -Math.cos(el) * Math.cos(az)
    row[2] = -Math.sin(el)
    row[3 + systems.indexOf(v.sat.system)] = 1
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) N[i][j] += row[i] * row[j]
  }
  const Q = invert(N)
  if (!Q) return { pdop: null, hdop: null, vdop: null }
  return {
    pdop: Math.sqrt(Q[0][0] + Q[1][1] + Q[2][2]),
    hdop: Math.sqrt(Q[0][0] + Q[1][1]),
    vdop: Math.sqrt(Q[2][2]),
  }
}

export function computeVisibility(satellites: Satellite[], opts: VisibilityOptions): DopSample[] {
  const step = opts.stepMin ?? 5
  const [y, mo, d] = opts.date.split('-').map(Number)
  const start = Date.UTC(y, mo - 1, d) - COT_OFFSET_MIN * 60_000
  const observer = {
    latitude: degreesToRadians(opts.lat),
    longitude: degreesToRadians(opts.lon),
    height: (opts.heightM ?? 0) / 1000,
  }
  const sats = satellites.filter((s) => opts.systems.includes(s.system))
  const samples: DopSample[] = []
  for (let minute = 0; minute <= 24 * 60; minute += step) {
    const time = new Date(start + minute * 60_000)
    const gmst = gstime(time)
    const visible: SatLook[] = []
    const bySystem: Record<GnssSystem, number> = { G: 0, R: 0, E: 0, C: 0 }
    for (const sat of sats) {
      const pv = propagate(sat.satrec, time)
      if (!pv || typeof pv.position !== 'object') continue
      const look = ecfToLookAngles(observer, eciToEcf(pv.position, gmst))
      const elDeg = (look.elevation * 180) / Math.PI
      if (elDeg < opts.maskDeg) continue
      visible.push({ sat, azDeg: ((look.azimuth * 180) / Math.PI + 360) % 360, elDeg })
      bySystem[sat.system]++
    }
    samples.push({ time, minute, visible, bySystem, ...dop(visible) })
  }
  return samples
}

/* ---------------------------- mejor ventana ---------------------------- */

export interface ObservationWindow {
  startMinute: number
  endMinute: number
  maxPdop: number
  meanPdop: number
  minSats: number
}

/**
 * Ventana de `durationMin` dentro de [fromMinute, toMinute] (hora local) que
 * minimiza el PDOP máximo; a igualdad (±0,05), el PDOP medio. Devuelve null si
 * la ventana no cabe en el horario o si en todas hay instantes sin solución.
 */
export function bestWindow(
  samples: DopSample[],
  durationMin: number,
  fromMinute = 0,
  toMinute = 24 * 60,
): ObservationWindow | null {
  if (samples.length < 2) return null
  const step = samples[1].minute - samples[0].minute
  const span = Math.max(1, Math.ceil(durationMin / step))
  let best: ObservationWindow | null = null
  for (let i = 0; i + span < samples.length; i++) {
    const startMinute = samples[i].minute
    const endMinute = samples[i + span].minute
    if (startMinute < fromMinute || endMinute > toMinute) continue
    let max = 0
    let sum = 0
    let minSats = Infinity
    let ok = true
    for (let k = i; k <= i + span; k++) {
      const p = samples[k].pdop
      if (p == null) {
        ok = false
        break
      }
      max = Math.max(max, p)
      sum += p
      minSats = Math.min(minSats, samples[k].visible.length)
    }
    if (!ok) continue
    const cand = { startMinute, endMinute, maxPdop: max, meanPdop: sum / (span + 1), minSats }
    if (
      !best ||
      cand.maxPdop < best.maxPdop - 0.05 ||
      (Math.abs(cand.maxPdop - best.maxPdop) <= 0.05 && cand.meanPdop < best.meanPdop)
    )
      best = cand
  }
  return best
}

/** Calidad orientativa del PDOP (práctica habitual en levantamientos GNSS). */
export function pdopQuality(p: number | null): { label: string; level: 0 | 1 | 2 | 3 } {
  if (p == null) return { label: 'Sin solución', level: 3 }
  if (p <= 2) return { label: 'Excelente', level: 0 }
  if (p <= 4) return { label: 'Buena', level: 1 }
  if (p <= 6) return { label: 'Aceptable', level: 2 }
  return { label: 'Pobre', level: 3 }
}

export function formatMinuteOfDay(m: number): string {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440
  const h = m >= 1440 && mm === 0 ? 24 : Math.floor(mm / 60)
  return `${String(h).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}
