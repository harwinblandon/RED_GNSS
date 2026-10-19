/**
 * Alturas físicas a partir de alturas elipsoidales GNSS.
 *
 * Modelo oficial: QGeoidCOL2023 (Resolución IGAC 515 de 2026), cuasigeoide
 * gravimétrico → anomalía de altura ζ y altura normal H* = h − ζ. Marea cero,
 * GRS80, W0 del IHRS.
 *
 * El cuasigeoide no coincide con el datum de la red de nivelación nacional
 * (Buenaventura): frente a los puntos GNSS/nivelación del IGAC hay un desfase
 * medio de ~0,2 m con tendencia regional (σ ≈ 0,24 m). Para entregar alturas
 * compatibles con las placas de nivelación se estima un desfase local δ:
 *   - automático: puntos GNSS/nivelación cercanos (Red Vertical ∩ Red Pasiva),
 *     con rechazo robusto de atípicos e interpolación IDW;
 *   - con placa medida: el usuario ocupó con GNSS una placa de nivelación.
 * Altura compatible con la red: H = h − ζ − δ.
 *
 * GEOCOL2004 (geoide, 2') se ofrece solo como referencia de la transición
 * (válido hasta mayo de 2027).
 */
import { distanceKm, type LatLon } from './geodesy'

export interface GeoidGrid {
  model: string
  kind: 'quasigeoid' | 'geoid'
  source: string
  license: string
  lat0: number
  lon0: number
  dlat: number
  dlon: number
  nrows: number
  ncols: number
  scale: number
  data: number[]
}

export type GridName = 'qgeoidcol2023' | 'geocol2004'

const gridCache = new Map<GridName, Promise<GeoidGrid>>()

export function loadGrid(name: GridName): Promise<GeoidGrid> {
  let p = gridCache.get(name)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}geoid/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      return r.json() as Promise<GeoidGrid>
    })
    p.catch(() => gridCache.delete(name))
    gridCache.set(name, p)
  }
  return p
}

/** Interpolación bilineal (convención ISG). null fuera de la rejilla. */
export function interpolate(g: GeoidGrid, lat: number, lon: number): number | null {
  const i = (lat - g.lat0) / g.dlat
  const j = (lon - g.lon0) / g.dlon
  if (i < 0 || j < 0 || i > g.nrows - 1 || j > g.ncols - 1) return null
  const i0 = Math.min(Math.floor(i), g.nrows - 2)
  const j0 = Math.min(Math.floor(j), g.ncols - 2)
  const di = i - i0
  const dj = j - j0
  const v = (r: number, c: number) => g.data[r * g.ncols + c] * g.scale
  return (
    v(i0, j0) * (1 - di) * (1 - dj) +
    v(i0 + 1, j0) * di * (1 - dj) +
    v(i0, j0 + 1) * (1 - di) * dj +
    v(i0 + 1, j0 + 1) * di * dj
  )
}

/* --------------------------- red de nivelación -------------------------- */

export interface Benchmark {
  id: string
  lat: number
  lon: number
  /** Altura nivelada (datum vertical Buenaventura), m. */
  H: number
  /** Altura elipsoidal MAGNA-SIRGAS (Red Pasiva), si la placa es GNSS/nivelación. */
  h: number | null
  /** true = coordenada calculada; false = aproximada. */
  calculated: boolean
  state: 'materializado' | 'destruido' | 'sin dato'
  municipio: string
  departamento: string
}

let levelingPromise: Promise<Benchmark[]> | null = null

export function loadLeveling(): Promise<Benchmark[]> {
  if (!levelingPromise) {
    levelingPromise = fetch(`${import.meta.env.BASE_URL}leveling.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`leveling.json: HTTP ${r.status}`)
        return r.json()
      })
      .then((doc: { points: [string, number, number, number, number | null, number, number, string, string][] }) =>
        doc.points.map(([id, lat, lon, H, h, calc, st, municipio, departamento]) => ({
          id,
          lat,
          lon,
          H,
          h,
          calculated: calc === 1,
          state: st === 1 ? 'materializado' : st === 0 ? 'destruido' : 'sin dato',
          municipio,
          departamento,
        })),
      )
    levelingPromise.catch(() => {
      levelingPromise = null
    })
  }
  return levelingPromise
}

/** Placas dentro de `radiusKm` del punto, ordenadas por distancia. */
export function benchmarksNear(p: LatLon, all: Benchmark[], radiusKm: number): { b: Benchmark; km: number }[] {
  const dLat = radiusKm / 110.6
  const dLon = radiusKm / (111.3 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)))
  const out: { b: Benchmark; km: number }[] = []
  for (const b of all) {
    if (Math.abs(b.lat - p.lat) > dLat || Math.abs(b.lon - p.lon) > dLon) continue
    const km = distanceKm(p, b)
    if (km <= radiusKm) out.push({ b, km })
  }
  return out.sort((a, b) => a.km - b.km)
}

/* ------------------------- corrección local δ --------------------------- */

export interface CorrectionPoint {
  b: Benchmark
  km: number
  /** Desfase observado: (h − H) − ζ, en m. */
  offset: number
  rejected: boolean
}

export interface LocalCorrection {
  /** Desfase δ estimado (m): H_red = h − ζ − δ. */
  delta: number
  /** Dispersión (σ) de los desfases usados, m. */
  spread: number
  used: number
  radiusKm: number
  nearestKm: number
  points: CorrectionPoint[]
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * δ automático con los puntos GNSS/nivelación cercanos. Busca en `radiusKm`;
 * si hay menos de `minPoints`, amplía hasta `maxKm`. Rechaza atípicos a más de
 * max(3·1,4826·MAD, 0,15 m) de la mediana e interpola por distancia inversa².
 */
export function autoCorrection(
  p: LatLon,
  all: Benchmark[],
  zetaGrid: GeoidGrid,
  { radiusKm = 25, maxKm = 60, minPoints = 3 } = {},
): LocalCorrection | null {
  const gnss = all.filter((b) => b.h != null && b.state !== 'destruido')
  let radius = radiusKm
  let near = benchmarksNear(p, gnss, radius)
  while (near.length < minPoints && radius < maxKm) {
    radius = Math.min(maxKm, radius * 1.6)
    near = benchmarksNear(p, gnss, radius)
  }
  near = near.slice(0, 30)
  const pts: CorrectionPoint[] = []
  for (const { b, km } of near) {
    const z = interpolate(zetaGrid, b.lat, b.lon)
    if (z == null) continue
    pts.push({ b, km, offset: b.h! - b.H - z, rejected: false })
  }
  if (pts.length === 0) return null
  const m = median(pts.map((x) => x.offset))
  const mad = median(pts.map((x) => Math.abs(x.offset - m))) * 1.4826
  const tol = Math.max(3 * mad, 0.15)
  for (const x of pts) x.rejected = Math.abs(x.offset - m) > tol
  const ok = pts.filter((x) => !x.rejected)
  let wSum = 0
  let vSum = 0
  for (const x of ok) {
    const w = 1 / Math.max(0.5, x.km) ** 2
    wSum += w
    vSum += w * x.offset
  }
  const delta = vSum / wSum
  const mean = ok.reduce((s, x) => s + x.offset, 0) / ok.length
  const spread = ok.length > 1 ? Math.sqrt(ok.reduce((s, x) => s + (x.offset - mean) ** 2, 0) / (ok.length - 1)) : 0
  return { delta, spread, used: ok.length, radiusKm: radius, nearestKm: pts[0].km, points: pts }
}

/** Calidad orientativa del ajuste automático (para pantalla e informe). */
export function correctionQuality(c: LocalCorrection | null): { label: string; note: string } {
  if (!c) return { label: 'sin puntos cercanos', note: 'No hay puntos GNSS/nivelación a menos de 60 km.' }
  if (c.used >= 3 && c.nearestKm <= 10 && c.spread <= 0.15)
    return { label: 'buena', note: `${c.used} puntos GNSS/nivelación coherentes; el más cercano a ${c.nearestKm.toFixed(1)} km.` }
  if (c.used >= 2 && c.nearestKm <= 25)
    return { label: 'aceptable', note: `${c.used} puntos, dispersión ${c.spread.toFixed(2)} m; el más cercano a ${c.nearestKm.toFixed(1)} km.` }
  return {
    label: 'débil',
    note: `Pocos puntos o lejanos (${c.used}, el más cercano a ${c.nearestKm.toFixed(1)} km). Ocupa con GNSS una placa de nivelación cercana.`,
  }
}

/** δ a partir de una placa de nivelación ocupada con GNSS (h medido por el usuario). */
export function benchmarkCorrection(b: Benchmark, hMeasured: number, zetaGrid: GeoidGrid): number | null {
  const z = interpolate(zetaGrid, b.lat, b.lon)
  return z == null ? null : hMeasured - b.H - z
}

/* ------------------------------ resultado ------------------------------- */

export interface HeightResult {
  id: string
  lat: number
  lon: number
  h: number
  zeta: number | null
  /** Altura normal QGeoidCOL2023: h − ζ. */
  normal: number | null
  delta: number | null
  /** Altura compatible con la red de nivelación: h − ζ − δ. */
  leveled: number | null
  n04: number | null
  /** Altura con GEOCOL2004: h − N. */
  h04: number | null
  correction: LocalCorrection | null
}

export function computeHeight(
  pt: { id: string; lat: number; lon: number; h: number },
  q: GeoidGrid,
  opts: { delta?: number | null; correction?: LocalCorrection | null; g04?: GeoidGrid | null },
): HeightResult {
  const zeta = interpolate(q, pt.lat, pt.lon)
  const normal = zeta == null ? null : pt.h - zeta
  const delta = opts.delta ?? opts.correction?.delta ?? null
  const n04 = opts.g04 ? interpolate(opts.g04, pt.lat, pt.lon) : null
  return {
    ...pt,
    zeta,
    normal,
    delta,
    leveled: normal != null && delta != null ? normal - delta : null,
    n04,
    h04: n04 == null ? null : pt.h - n04,
    correction: opts.correction ?? null,
  }
}
