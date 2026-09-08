/**
 * VEMOS2022 — modelo de velocidades de SIRGAS para epoch transformations.
 *
 * Rejilla 1°×1° (subconjunto de Colombia) en marco ITRF2020, velocidades
 * horizontales en mm/año. Fuente: DGFI-TUM / SIRGAS
 * (Sánchez et al. 2022, doi:10.1515/jogs-2022-0138).
 *
 * El modelo es solo horizontal: la componente vertical se asume 0.
 */

export interface VemosMeta {
  model: string
  frame: string
  timespan: string
  citation: string
  generated: string
}

export interface Velocity {
  /** Velocidad Norte, m/año. */
  vn: number
  /** Velocidad Este, m/año. */
  ve: number
  /** Velocidad vertical (VEMOS2022 no la modela). */
  vu: 0
  /** `true` si el punto quedó fuera de la rejilla y se usó el nodo más cercano. */
  extrapolated: boolean
}

type Node = [lat: number, lon: number, vnMm: number, veMm: number]

let data: { meta: VemosMeta; nodes: Node[]; byKey: Map<string, Node> } | null = null
let pending: Promise<void> | null = null

const key = (lat: number, lon: number) => `${lat.toFixed(1)},${lon.toFixed(1)}`

async function ensureLoaded(): Promise<void> {
  if (data) return
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}vemos2022.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`vemos2022.json: HTTP ${r.status}`)
        return r.json()
      })
      .then((d: VemosMeta & { grid: Node[] }) => {
        const byKey = new Map<string, Node>()
        for (const n of d.grid) byKey.set(key(n[0], n[1]), n)
        data = { meta: d, nodes: d.grid, byKey }
      })
  }
  return pending
}

export async function loadVemos(): Promise<VemosMeta> {
  await ensureLoaded()
  return data!.meta
}

/** Velocidad interpolada (bilineal) en un punto; nodo más cercano si está fuera. */
export async function velocityAt(lat: number, lon: number): Promise<Velocity> {
  await ensureLoaded()
  const { byKey, nodes } = data!

  const lat0 = Math.floor(lat)
  const lon0 = Math.floor(lon)
  const c00 = byKey.get(key(lat0, lon0))
  const c10 = byKey.get(key(lat0 + 1, lon0))
  const c01 = byKey.get(key(lat0, lon0 + 1))
  const c11 = byKey.get(key(lat0 + 1, lon0 + 1))

  if (c00 && c10 && c01 && c11) {
    const fy = lat - lat0
    const fx = lon - lon0
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const vn = lerp(lerp(c00[2], c01[2], fx), lerp(c10[2], c11[2], fx), fy) / 1000
    const ve = lerp(lerp(c00[3], c01[3], fx), lerp(c10[3], c11[3], fx), fy) / 1000
    return { vn, ve, vu: 0, extrapolated: false }
  }

  // Fuera de la rejilla: nodo más cercano.
  let best: Node | null = null
  let bestD = Infinity
  for (const n of nodes) {
    const d = (n[0] - lat) ** 2 + (n[1] - lon) ** 2
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
    ? { vn: best[2] / 1000, ve: best[3] / 1000, vu: 0, extrapolated: true }
    : { vn: 0, ve: 0, vu: 0, extrapolated: true }
}
