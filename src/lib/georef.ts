/**
 * Cálculo de coordenadas finales de una georreferenciación GNSS.
 *
 * Flujo (el mismo de la hoja "Reporte Final de Coordenadas"):
 *   1. Coordenadas del post-proceso (época de observación de cada punto), con
 *      las bases fijadas en la última solución semanal.
 *   2. Velocidad VEMOS (2022 o 2017) interpolada en cada punto (Norte/Este; VEMOS no
 *      modela la vertical) → componentes geocéntricas Vx, Vy, Vz.
 *   3. Δt = t_obs − t_ref ;  D = V · Δt ;  X_ref = X − D   (t_ref = 2018.0).
 *   4. Geográficas y CTM12 (EPSG:9377) en ambas épocas.
 *   5. Cota con QGeoidCOL2023 (y ajuste a la red de nivelación si se elige).
 */
import { fromGeocentric, project } from './coords'
import { MAGNA_SIRGAS_EPOCH } from './epoch'
import { velocityAt, type VemosModel } from './vemos'
import {
  autoCorrection,
  computeHeight,
  type Benchmark,
  type GeoidGrid,
  type HeightResult,
} from './heights'

export const REF_EPOCH = MAGNA_SIRGAS_EPOCH

export interface BaseVertex {
  id: string
  tipo: 'CORS activa' | 'Pasiva'
  x: number
  y: number
  z: number
  /** Época (año decimal) de las coordenadas usadas en el post-proceso. */
  epoch: number | null
  fuente: string
}

export interface ObsPoint {
  id: string
  x: number
  y: number
  z: number
  /** Época de observación (año decimal, instante medio de la sesión). */
  tObs: number
  /** Inicio y fin de la sesión (texto legible), si se conocen. */
  inicio: string
  fin: string
  duracion: string
  base: string
  antena: string
  alturaAntena: number | null
  solucion: string
  /** Separación geoidal y cota ortométrica reportadas por el software (p. ej. Infinity con GEOCOL2004). */
  geoidSepSoftware?: number | null
  orthoSoftware?: number | null
}

export type HeightMode = 'ajuste' | 'modelo' | 'geocol2004' | 'software' | 'ninguna'

export interface Xyz {
  x: number
  y: number
  z: number
}

export interface GeorefResult {
  p: ObsPoint
  obs: Xyz & { lat: number; lon: number; h: number; north: number; east: number }
  /** Velocidad VEMOS2022: Norte/Este (m/año) y geocéntrica (m/año). */
  vel: { model: VemosModel; vn: number; ve: number; vx: number; vy: number; vz: number; method: string; extrapolated: boolean }
  /** Δt = t_obs − t_ref (años). */
  dt: number
  /** Desplazamiento D = V · Δt (m). */
  disp: Xyz
  ref: Xyz & { lat: number; lon: number; h: number; north: number; east: number }
  height: HeightResult | null
}

const D2R = Math.PI / 180

/** Velocidad topocéntrica (N, E, U) → geocéntrica (X, Y, Z). */
export function enuToXyz(lat: number, lon: number, vn: number, ve: number, vu = 0): Xyz {
  const p = lat * D2R
  const l = lon * D2R
  return {
    x: -Math.sin(l) * ve - Math.sin(p) * Math.cos(l) * vn + Math.cos(p) * Math.cos(l) * vu,
    y: Math.cos(l) * ve - Math.sin(p) * Math.sin(l) * vn + Math.cos(p) * Math.sin(l) * vu,
    z: Math.cos(p) * vn + Math.sin(p) * vu,
  }
}

function withGeo(xyz: Xyz) {
  const g = fromGeocentric(xyz.x, xyz.y, xyz.z)
  const c = project(g.lat, g.lon, 'EPSG:9377')
  return { ...xyz, lat: g.lat, lon: g.lon, h: g.h, north: c.northing, east: c.easting }
}

export async function computeGeoref(
  points: ObsPoint[],
  opts: {
    refEpoch?: number
    velModel?: VemosModel
    heightMode: HeightMode
    qgrid: GeoidGrid | null
    g04?: GeoidGrid | null
    leveling: Benchmark[] | null
  },
): Promise<GeorefResult[]> {
  const tRef = opts.refEpoch ?? REF_EPOCH
  const model = opts.velModel ?? 'VEMOS2022'
  const out: GeorefResult[] = []
  for (const p of points) {
    const obs = withGeo(p)
    const v = await velocityAt(obs.lat, obs.lon, model)
    const vxyz = enuToXyz(obs.lat, obs.lon, v.vn, v.ve, 0)
    const dt = p.tObs - tRef
    const disp = { x: vxyz.x * dt, y: vxyz.y * dt, z: vxyz.z * dt }
    const ref = withGeo({ x: p.x - disp.x, y: p.y - disp.y, z: p.z - disp.z })
    let height: HeightResult | null = null
    if (opts.heightMode !== 'ninguna' && opts.qgrid) {
      const pt = { id: p.id, lat: obs.lat, lon: obs.lon, h: obs.h }
      const correction = opts.heightMode === 'ajuste' && opts.leveling ? autoCorrection(pt, opts.leveling, opts.qgrid) : null
      height = computeHeight(pt, opts.qgrid, { correction, g04: opts.heightMode === 'geocol2004' ? opts.g04 ?? null : null })
    }
    out.push({
      p,
      obs,
      vel: { model, vn: v.vn, ve: v.ve, vx: vxyz.x, vy: vxyz.y, vz: vxyz.z, method: v.method, extrapolated: v.extrapolated },
      dt,
      disp,
      ref,
      height,
    })
  }
  return out
}

/** Cota final según el método elegido. */
export function finalHeight(r: GeorefResult, mode: HeightMode): number | null {
  if (mode === 'software') return r.p.geoidSepSoftware != null ? r.obs.h - r.p.geoidSepSoftware : r.p.orthoSoftware ?? null
  if (!r.height || mode === 'ninguna') return null
  if (mode === 'geocol2004') return r.height.h04
  return mode === 'ajuste' ? r.height.leveled ?? r.height.normal : r.height.normal
}

export function heightTypeLabel(r: GeorefResult, mode: HeightMode): string {
  if (mode === 'software') return 'GEOCOL2004 (software de post-proceso)'
  if (mode === 'ninguna' || !r.height) return 'Elipsoidal'
  if (mode === 'geocol2004') return 'GEOCOL2004 (modelo)'
  if (mode === 'ajuste' && r.height.leveled != null) return 'QGeoidCOL2023 ajustada a la red'
  return 'QGeoidCOL2023 (modelo)'
}
