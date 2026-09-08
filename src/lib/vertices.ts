/**
 * Red Geodésica Pasiva del IGAC — mojones/placas de control (órdenes 2, 3, 4).
 *
 * El listado se carga una vez desde `public/vertices.json` (generado por
 * `scripts/build-vertices.py`). La reseña (monografía) de cada vértice es un
 * PDF servido por la API del IGAC.
 */
import { geodesicInverse, type LatLon } from './geodesy'

export interface Vertice {
  id: string
  lat: number
  lon: number
  h: number
  municipio: string
  departamento: string
  materializado: boolean
  hasPdf: boolean
}

type RawVertice = [string, number, number, number, string, string, number, number]

let cache: Vertice[] | null = null
let pending: Promise<Vertice[]> | null = null

export async function loadVertices(): Promise<Vertice[]> {
  if (cache) return cache
  if (pending) return pending
  pending = fetch(`${import.meta.env.BASE_URL}vertices.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`vertices.json: HTTP ${r.status}`)
      return r.json() as Promise<{ vertices: RawVertice[] }>
    })
    .then((d) => {
      cache = d.vertices.map(
        ([id, lat, lon, h, municipio, departamento, mat, pdf]): Vertice => ({
          id,
          lat,
          lon,
          h,
          municipio,
          departamento,
          materializado: mat === 1,
          hasPdf: pdf === 1,
        }),
      )
      return cache
    })
  return pending
}

/** URL del PDF de reseña (monografía) del vértice. */
export function verticePdfUrl(id: string): string {
  return `https://ccg.igac.gov.co/api/descargar/${encodeURIComponent(id)}.pdf`
}

/** Foto de campo del vértice (n = 1..4). */
export function verticePhotoUrl(id: string, n = 1): string {
  return `https://ccg.igac.gov.co/api/imagenes/${encodeURIComponent(id)}_${n}.jpg`
}

export interface RankedVertice {
  v: Vertice
  distanceKm: number
  azimuthDeg: number
}

export function nearestVertices(point: LatLon, list: Vertice[], n = 8): RankedVertice[] {
  return list
    .map((v) => {
      const g = geodesicInverse(point, v)
      return { v, distanceKm: g.distanceM / 1000, azimuthDeg: g.azimuthDeg }
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n)
}
