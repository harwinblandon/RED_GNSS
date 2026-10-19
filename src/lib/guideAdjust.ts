/**
 * Alturas niveladas GNSS según la "Guía metodológica para la obtención de
 * alturas utilizando el sistema GNSS" del IGAC (S. W. León, actualización del
 * documento de L. Sánchez, 2004), con el modelo QGeoidCOL2023 adoptado por la
 * Resolución IGAC 515 de 2026 (o GEOCOL2004 durante la transición).
 *
 * Metodología en oficina de la guía:
 *   (1) Δh_i = h_Ri − h_Base
 *   (2) ΔN_i = N_Ri − N_Base            (con QGeoidCOL2023, N → ζ)
 *   (3) ΔH_GNSS,i = Δh_i − ΔN_i
 *   (4) H°_GNSS,i = H_Base + ΔH_GNSS,i
 *   (6–8) ajuste por mínimos cuadrados con las alturas niveladas de los NP fijas
 *   (9) H_GNSS,final = H_nivelada base + ΔH ajustada
 *
 * La guía plantea el ajuste por el método correlativo (ecuaciones de
 * condición). Aquí se resuelve por el método paramétrico (observaciones
 * indirectas), que es equivalente: con los mismos pesos da las mismas
 * correcciones v y las mismas alturas. Verificado con el ejemplo del Caso 1 de
 * la guía (TG13 = 3 194,0653 m).
 */
import { distanceKm } from './geodesy'
import { interpolate, type GeoidGrid } from './heights'

export type GuideCase = 'punto' | 'superficie' | 'perfil'
export type WeightMode = 'iguales' | 'distancia'

export interface CampaignPoint {
  id: string
  lat: number
  lon: number
  /** Altura elipsoidal ajustada del post-proceso (m). */
  h: number
  /** Altura nivelada si el punto es un NP (vértice de nivelación). */
  H: number | null
  /** De dónde sale H: la escribió el usuario o se tomó de la Red Vertical. */
  Hsource: 'usuario' | 'red-vertical' | null
  /** Tiempo de rastreo (min), opcional. */
  tMin: number | null
}

export interface Observation {
  from: string
  to: string
  km: number
  dh: number
  dN: number
  /** ΔH_GNSS = Δh − ΔN (observación). */
  L: number
  weight: number
  /** Corrección v del ajuste. */
  v: number
  /** Observación ajustada L* = L + v. */
  Ladj: number
}

export interface AdjustedPoint {
  id: string
  isNP: boolean
  H: number
  /** σ de la altura ajustada (m); null si no hay redundancia o es NP. */
  sigma: number | null
  /** Altura inicial H° = H_base + ΔH_GNSS desde el NP más cercano. */
  Hinitial: number | null
  baseId: string | null
  nearestNPkm: number | null
}

export interface NpCheck {
  a: string
  b: string
  km: number
  /** (Δh − ΔN) GNSS entre los dos NP. */
  gnss: number
  /** ΔH nivelado entre los dos NP. */
  leveled: number
  /** Discrepancia gnss − leveled (m). */
  diff: number
}

export interface ComplianceItem {
  ok: boolean | null
  text: string
}

export interface GuideResult {
  model: string
  guideCase: GuideCase
  weights: WeightMode
  maxKm: number
  zeta: Record<string, number>
  observations: Observation[]
  points: AdjustedPoint[]
  /** n observaciones, u incógnitas, r redundancia. */
  n: number
  u: number
  r: number
  /** Desviación estándar a posteriori de la unidad de peso (m), si r > 0. */
  sigma0: number | null
  npChecks: NpCheck[]
  compliance: ComplianceItem[]
  errors: string[]
}

/** Resuelve N·x = b (N simétrica definida positiva) y devuelve también N⁻¹. */
function solve(N: number[][], b: number[]): { x: number[]; inv: number[][] } | null {
  const n = N.length
  const m = N.map((row, i) => [...row, b[i], ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  const W = 2 * n + 1
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-12) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    const d = m[c][c]
    for (let j = 0; j < W; j++) m[c][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c]
      if (f) for (let j = 0; j < W; j++) m[r][j] -= f * m[c][j]
    }
  }
  return { x: m.map((row) => row[n]), inv: m.map((row) => row.slice(n + 1)) }
}

/** Tiempo mínimo de rastreo de la guía: 15 min + 5 min/km (3 si excelente), nunca < 18. */
export const guideMinMinutes = (km: number, excellent = false) => Math.max(18, 15 + (excellent ? 3 : 5) * km)

export function adjustCampaign(
  pts: CampaignPoint[],
  grid: GeoidGrid,
  { guideCase, weights, maxKm = 20 }: { guideCase: GuideCase; weights: WeightMode; maxKm?: number },
): GuideResult {
  const errors: string[] = []
  const zeta: Record<string, number> = {}
  for (const p of pts) {
    const z = interpolate(grid, p.lat, p.lon)
    if (z == null) errors.push(`${p.id}: fuera de la cobertura del modelo ${grid.model}.`)
    else zeta[p.id] = z
  }
  const valid = pts.filter((p) => zeta[p.id] != null)
  const nps = valid.filter((p) => p.H != null)
  const unknowns = valid.filter((p) => p.H == null)
  const byId = new Map(valid.map((p) => [p.id, p]))
  const idx = new Map(unknowns.map((p, i) => [p.id, i]))

  const empty = (extra: string): GuideResult => ({
    model: grid.model, guideCase, weights, maxKm, zeta, observations: [], points: [], n: 0, u: unknowns.length, r: 0,
    sigma0: null, npChecks: [], compliance: [], errors: [...errors, extra],
  })
  if (nps.length === 0)
    return empty(
      'Siguiente paso: agrega a la tabla las placas de nivelación (NP) que ocupaste en la campaña, con la h que mediste en cada una y su cota H del certificado IGAC. La guía exige al menos 2 NP (punto), 4 (superficie) o NP al inicio y fin (perfil).',
    )
  if (unknowns.length === 0) return empty('Todos los puntos tienen H: no hay alturas por determinar.')

  const obsLink = (a: CampaignPoint, b: CampaignPoint) => {
    const km = distanceKm(a, b)
    const dh = b.h - a.h
    const dN = zeta[b.id] - zeta[a.id]
    return { from: a.id, to: b.id, km, dh, dN, L: dh - dN, weight: weights === 'distancia' ? 1 / Math.max(0.1, km) : 1, v: 0, Ladj: 0 }
  }

  // --- Topología de observaciones según el caso de la guía ---
  const obs: Observation[] = []
  if (guideCase === 'perfil') {
    for (let i = 1; i < valid.length; i++) obs.push(obsLink(valid[i - 1], valid[i]))
  } else {
    for (const u of unknowns) {
      const near = nps.map((np) => ({ np, km: distanceKm(np, u) })).sort((a, b) => a.km - b.km)
      const within = near.filter((x) => x.km <= maxKm)
      // Si ningún NP está dentro del límite, se usa el más cercano (y se advierte).
      for (const { np } of within.length ? within : near.slice(0, 1)) obs.push(obsLink(np, u))
    }
  }

  // --- Ajuste paramétrico: v = H_to − H_from − L, incógnitas = H de los puntos nuevos ---
  const u = unknowns.length
  const N = Array.from({ length: u }, () => new Array<number>(u).fill(0))
  const b = new Array<number>(u).fill(0)
  for (const o of obs) {
    const a = new Array<number>(u).fill(0)
    let l = o.L // l = L − (H_to − H_from) de los términos fijos
    const ti = idx.get(o.to)
    const fi = idx.get(o.from)
    if (ti != null) a[ti] += 1
    else l -= byId.get(o.to)!.H!
    if (fi != null) a[fi] -= 1
    else l += byId.get(o.from)!.H!
    for (let i = 0; i < u; i++) {
      if (!a[i]) continue
      b[i] += a[i] * o.weight * l
      for (let j = 0; j < u; j++) if (a[j]) N[i][j] += a[i] * o.weight * a[j]
    }
  }
  const sol = solve(N, b)
  if (!sol) {
    return empty(
      guideCase === 'perfil'
        ? 'El perfil no queda amarrado: debe empezar o terminar en un NP (la guía exige ambos).'
        : 'Hay puntos sin conexión con un NP.',
    )
  }
  const Hof = (id: string) => {
    const i = idx.get(id)
    return i != null ? sol.x[i] : byId.get(id)!.H!
  }
  let vpv = 0
  for (const o of obs) {
    o.Ladj = Hof(o.to) - Hof(o.from)
    o.v = o.Ladj - o.L
    vpv += o.weight * o.v * o.v
  }
  const r = obs.length - u
  const sigma0 = r > 0 ? Math.sqrt(vpv / r) : null

  // Altura inicial H° desde el NP más cercano (fórmula 4 de la guía), para el informe.
  const points: AdjustedPoint[] = valid.map((p) => {
    const near = nps.map((np) => ({ np, km: distanceKm(np, p) })).filter((x) => x.np.id !== p.id).sort((a, b) => a.km - b.km)[0]
    const i = idx.get(p.id)
    return {
      id: p.id,
      isNP: p.H != null,
      H: Hof(p.id),
      sigma: i != null && sigma0 != null ? sigma0 * Math.sqrt(sol.inv[i][i]) : null,
      Hinitial: p.H == null && near ? near.np.H! + (p.h - near.np.h) - (zeta[p.id] - zeta[near.np.id]) : null,
      baseId: p.H == null && near ? near.np.id : null,
      nearestNPkm: near ? near.km : null,
    }
  })

  // --- Consistencia entre NP: (Δh − ΔN) GNSS vs ΔH nivelado ---
  const npChecks: NpCheck[] = []
  for (let i = 0; i < nps.length; i++)
    for (let j = i + 1; j < nps.length; j++) {
      const a = nps[i]
      const c = nps[j]
      const gnss = c.h - a.h - (zeta[c.id] - zeta[a.id])
      const leveled = c.H! - a.H!
      npChecks.push({ a: a.id, b: c.id, km: distanceKm(a, c), gnss, leveled, diff: gnss - leveled })
    }

  // --- Verificación frente a la guía ---
  const compliance: ComplianceItem[] = []
  if (guideCase === 'punto')
    compliance.push({ ok: nps.length >= 2, text: `Caso 1 (punto): al menos 2 NP ocupados — ${nps.length} NP.` })
  if (guideCase === 'superficie')
    compliance.push({ ok: nps.length >= 4, text: `Caso 3 (superficie): al menos 4 NP ocupados — ${nps.length} NP.` })
  if (guideCase === 'perfil') {
    const first = valid[0]
    const last = valid[valid.length - 1]
    compliance.push({
      ok: first.H != null && last.H != null,
      text: `Caso 2 (perfil): inicia y termina en NP — inicio ${first.id}${first.H != null ? ' (NP)' : ''}, fin ${last.id}${last.H != null ? ' (NP)' : ''}.`,
    })
    const longLegs = obs.filter((o) => o.km > maxKm)
    compliance.push({
      ok: longLegs.length === 0,
      text: longLegs.length
        ? `Tramos del perfil mayores a ${maxKm} km: ${longLegs.map((o) => `${o.from}–${o.to} (${o.km.toFixed(1)} km)`).join(', ')}.`
        : `Todos los tramos del perfil ≤ ${maxKm} km.`,
    })
  } else {
    const far = points.filter((p) => !p.isNP && (p.nearestNPkm ?? 0) > maxKm)
    compliance.push({
      ok: far.length === 0,
      text: far.length
        ? `Puntos a más de ${maxKm} km del NP más cercano: ${far.map((p) => `${p.id} (${p.nearestNPkm!.toFixed(1)} km)`).join(', ')}.`
        : `Todos los puntos a ≤ ${maxKm} km de un NP.`,
    })
  }
  const withT = valid.filter((p) => p.tMin != null)
  if (withT.length) {
    const short = withT.filter((p) => {
      const km = guideCase === 'perfil' ? obs.find((o) => o.to === p.id || o.from === p.id)?.km ?? 0 : points.find((x) => x.id === p.id)?.nearestNPkm ?? 0
      return p.tMin! < guideMinMinutes(km)
    })
    compliance.push({
      ok: short.length === 0,
      text: short.length
        ? `Tiempos de rastreo menores al mínimo de la guía (15 min + 5 min/km, ≥ 18 min): ${short.map((p) => p.id).join(', ')}.`
        : `Tiempos de rastreo ≥ mínimo de la guía en los ${withT.length} puntos con tiempo reportado.`,
    })
  } else {
    compliance.push({ ok: null, text: 'Tiempos de rastreo no reportados (columna t_min opcional).' })
  }
  compliance.push({
    ok: r > 0,
    text: r > 0 ? `Ajuste con redundancia r = ${r}: permite estimar σ₀ y residuos.` : 'Sin redundancia (r = 0): el resultado no tiene control. Ocupa más NP.',
  })
  const worst = npChecks.reduce((m, c) => Math.max(m, Math.abs(c.diff)), 0)
  if (npChecks.length)
    compliance.push({
      ok: worst <= 0.1,
      text: `Consistencia entre NP: discrepancia máxima ${worst.toFixed(4)} m${worst > 0.1 ? ' (> 0,10 m: revisa la H o la identificación de los NP)' : ''}.`,
    })

  return { model: grid.model, guideCase, weights, maxKm, zeta, observations: obs, points, n: obs.length, u, r, sigma0, npChecks, compliance, errors }
}

/* ------------------------ lectura de la tabla de campaña ------------------------ */

const num = (s: string) => Number(s.replace(',', '.').trim())

/** Ángulo decimal o en G M S (con °'" y hemisferio N/S/E/W/O). */
export function parseAngle(s: string, axis: 'lat' | 'lon'): number | null {
  const t = s.trim()
  if (t === '') return null
  if (/^[-+]?\d+([.,]\d+)?$/.test(t)) return num(t)
  const parts = t.match(/[-+]?\d+(?:[.,]\d+)?/g)
  if (!parts) return null
  const [d, m = '0', sec = '0'] = parts
  let v = Math.abs(num(d)) + num(m) / 60 + num(sec) / 3600
  const neg = /^-/.test(t) || (axis === 'lat' ? /S/i.test(t) : /[WO]/i.test(t))
  if (neg) v = -v
  return Number.isFinite(v) ? v : null
}

/**
 * Lee la tabla de la campaña. Encabezado obligatorio con: id, lat, lon, h y
 * opcionalmente H (o H_niv) y t (o t_min). Separador coma, punto y coma o tab.
 */
export function parseCampaign(text: string): { points: CampaignPoint[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const errors: string[] = []
  if (lines.length < 2) return { points: [], errors: ['Pega el encabezado y al menos un punto.'] }
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const head = lines[0].split(sep).map((h) => h.trim())
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const ci = {
    id: find('id', 'ID', 'punto', 'Punto', 'nombre'),
    lat: find('lat', 'latitud', 'Lat', 'Latitud'),
    lon: find('lon', 'longitud', 'Lon', 'Longitud'),
    h: find('h', 'h_elip', 'h_elipsoidal', 'altura_elipsoidal'),
    H: find('H', 'H_niv', 'H_nivelada', 'cota', 'altura_nivelada'),
    t: find('t', 't_min', 'tiempo'),
  }
  if (ci.id < 0 || ci.lat < 0 || ci.lon < 0 || ci.h < 0) {
    return { points: [], errors: ['El encabezado debe incluir las columnas id, lat, lon, h (y opcionalmente H, t_min).'] }
  }
  const points: CampaignPoint[] = []
  const seen = new Set<string>()
  lines.slice(1).forEach((line, k) => {
    const c = line.split(sep).map((x) => x.trim())
    const id = c[ci.id]
    const lat = parseAngle(c[ci.lat] ?? '', 'lat')
    const lon = parseAngle(c[ci.lon] ?? '', 'lon')
    const h = num(c[ci.h] ?? '')
    const Hs = ci.H >= 0 ? (c[ci.H] ?? '').trim() : ''
    const ts = ci.t >= 0 ? (c[ci.t] ?? '').trim() : ''
    if (!id || lat == null || lon == null || !Number.isFinite(h)) {
      errors.push(`Fila ${k + 2}: datos incompletos.`)
      return
    }
    if (seen.has(id)) {
      errors.push(`Fila ${k + 2}: el id ${id} está repetido.`)
      return
    }
    seen.add(id)
    const H = Hs === '' ? null : num(Hs)
    const t = ts === '' ? null : num(ts)
    points.push({
      id,
      lat,
      lon,
      h,
      H: H != null && Number.isFinite(H) ? H : null,
      Hsource: H != null && Number.isFinite(H) ? 'usuario' : null,
      tMin: t != null && Number.isFinite(t) ? t : null,
    })
  })
  return { points, errors }
}
