/**
 * Modelos de velocidades VEMOS de SIRGAS (2017 y 2022) para el cambio de época.
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
  source: string
  citation: string
  generated: string
}

/** Nodo de la rejilla usado en el cálculo, con su peso en la interpolación. */
export interface VelNode {
  lat: number
  lon: number
  /** Velocidad Norte del nodo, mm/año (como en el archivo VEMOS). */
  vnMm: number
  /** Velocidad Este del nodo, mm/año. */
  veMm: number
  /** Peso en la combinación (bilineal: suman 1; nodo más cercano: 1). */
  weight: number
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
  /** Cómo se obtuvo el valor. */
  method: 'bilineal' | 'nodo-cercano'
  /** Nodos de la rejilla que intervinieron (4 en bilineal, 1 en nodo más cercano). */
  nodes: VelNode[]
}

type Node = [lat: number, lon: number, vnMm: number, veMm: number]

/** Modelos disponibles (rejillas 1°×1° de SIRGAS, subconjunto de Colombia). */
export type VemosModel = 'VEMOS2022' | 'VEMOS2017'
export const VEMOS_MODELS: { id: VemosModel; label: string }[] = [
  { id: 'VEMOS2022', label: 'VEMOS2022 (ITRF2020, 2017.1–2022.0)' },
  { id: 'VEMOS2017', label: 'VEMOS2017 (ITRF2014, 2014.0–2017.1)' },
]

interface Loaded {
  meta: VemosMeta
  nodes: Node[]
  byKey: Map<string, Node>
}
const loaded = new Map<VemosModel, Loaded>()
const pending = new Map<VemosModel, Promise<void>>()

const key = (lat: number, lon: number) => `${lat.toFixed(1)},${lon.toFixed(1)}`

async function ensureLoaded(model: VemosModel): Promise<Loaded> {
  const have = loaded.get(model)
  if (have) return have
  let p = pending.get(model)
  if (!p) {
    const file = `${model.toLowerCase()}.json`
    p = fetch(`${import.meta.env.BASE_URL}${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
        return r.json()
      })
      .then((d: VemosMeta & { grid: Node[] }) => {
        const byKey = new Map<string, Node>()
        for (const n of d.grid) byKey.set(key(n[0], n[1]), n)
        loaded.set(model, { meta: d, nodes: d.grid, byKey })
      })
    p.catch(() => pending.delete(model))
    pending.set(model, p)
  }
  await p
  return loaded.get(model)!
}

export async function loadVemos(model: VemosModel = 'VEMOS2022'): Promise<VemosMeta> {
  return (await ensureLoaded(model)).meta
}

/** Velocidad interpolada (bilineal) en un punto; nodo más cercano si está fuera. */
export async function velocityAt(lat: number, lon: number, model: VemosModel = 'VEMOS2022'): Promise<Velocity> {
  const { byKey, nodes } = await ensureLoaded(model)

  const lat0 = Math.floor(lat)
  const lon0 = Math.floor(lon)
  const c00 = byKey.get(key(lat0, lon0))
  const c10 = byKey.get(key(lat0 + 1, lon0))
  const c01 = byKey.get(key(lat0, lon0 + 1))
  const c11 = byKey.get(key(lat0 + 1, lon0 + 1))

  if (c00 && c10 && c01 && c11) {
    const fy = lat - lat0
    const fx = lon - lon0
    const w00 = (1 - fy) * (1 - fx)
    const w01 = (1 - fy) * fx
    const w10 = fy * (1 - fx)
    const w11 = fy * fx
    const asNode = (c: Node, weight: number): VelNode => ({
      lat: c[0],
      lon: c[1],
      vnMm: c[2],
      veMm: c[3],
      weight,
    })
    const grid: VelNode[] = [
      asNode(c00, w00),
      asNode(c01, w01),
      asNode(c10, w10),
      asNode(c11, w11),
    ]
    const vn = grid.reduce((s, n) => s + n.vnMm * n.weight, 0) / 1000
    const ve = grid.reduce((s, n) => s + n.veMm * n.weight, 0) / 1000
    return { vn, ve, vu: 0, extrapolated: false, method: 'bilineal', nodes: grid }
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
  const nearest: VelNode[] = best
    ? [{ lat: best[0], lon: best[1], vnMm: best[2], veMm: best[3], weight: 1 }]
    : []
  return best
    ? { vn: best[2] / 1000, ve: best[3] / 1000, vu: 0, extrapolated: true, method: 'nodo-cercano', nodes: nearest }
    : { vn: 0, ve: 0, vu: 0, extrapolated: true, method: 'nodo-cercano', nodes: nearest }
}
