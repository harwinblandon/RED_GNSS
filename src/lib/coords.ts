/**
 * Conversión de coordenadas para Colombia.
 *
 * Sistemas soportados (todos sobre el elipsoide GRS80 / datum MAGNA-SIRGAS):
 *  - Geográficas MAGNA-SIRGAS (EPSG:4686, ≈ WGS84)
 *  - Origen Nacional CTM12 (EPSG:9377) — sistema plano vigente (Res. IGAC 471/2020)
 *  - Gauss-Krüger MAGNA-SIRGAS, 5 orígenes (EPSG:3114–3118)
 *  - UTM 17N / 18N / 19N sobre GRS80
 *  - Geocéntricas ECEF (X, Y, Z)
 */
import proj4 from 'proj4'

const GRS80 = '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
const GK_LAT0 = 4.596200416666666 // 4°35'46.3215" N (Observatorio de Bogotá)

export interface Crs {
  code: string
  label: string
  proj: string
  /** Meridiano central (para elegir el origen Gauss-Krüger por cercanía). */
  lon0?: number
  kind: 'gk' | 'ctm12' | 'utm'
}

export const PROJECTED_CRS: Crs[] = [
  {
    code: 'EPSG:9377',
    label: 'Origen Nacional CTM12',
    kind: 'ctm12',
    proj: `+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 ${GRS80}`,
  },
  { code: 'EPSG:3114', label: 'GK MAGNA Oeste-Oeste (−80°04′39″)', kind: 'gk', lon0: -80.07750791666666,
    proj: `+proj=tmerc +lat_0=${GK_LAT0} +lon_0=-80.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 ${GRS80}` },
  { code: 'EPSG:3115', label: 'GK MAGNA Oeste (−77°04′39″)', kind: 'gk', lon0: -77.07750791666666,
    proj: `+proj=tmerc +lat_0=${GK_LAT0} +lon_0=-77.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 ${GRS80}` },
  { code: 'EPSG:3116', label: 'GK MAGNA Bogotá (−74°04′39″)', kind: 'gk', lon0: -74.07750791666666,
    proj: `+proj=tmerc +lat_0=${GK_LAT0} +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 ${GRS80}` },
  { code: 'EPSG:3117', label: 'GK MAGNA Este-Central (−71°04′39″)', kind: 'gk', lon0: -71.07750791666666,
    proj: `+proj=tmerc +lat_0=${GK_LAT0} +lon_0=-71.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 ${GRS80}` },
  { code: 'EPSG:3118', label: 'GK MAGNA Este-Este (−68°04′39″)', kind: 'gk', lon0: -68.07750791666666,
    proj: `+proj=tmerc +lat_0=${GK_LAT0} +lon_0=-68.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 ${GRS80}` },
  { code: 'UTM17N', label: 'UTM 17N (GRS80)', kind: 'utm', lon0: -81,
    proj: `+proj=utm +zone=17 ${GRS80}` },
  { code: 'UTM18N', label: 'UTM 18N (GRS80)', kind: 'utm', lon0: -75,
    proj: `+proj=utm +zone=18 ${GRS80}` },
  { code: 'UTM19N', label: 'UTM 19N (GRS80)', kind: 'utm', lon0: -69,
    proj: `+proj=utm +zone=19 ${GRS80}` },
]

const WGS84 = 'EPSG:4326' // lon, lat
const GEOCENT = `+proj=geocent ${GRS80}`

for (const c of PROJECTED_CRS) proj4.defs(c.code, c.proj)

export function crsByCode(code: string): Crs {
  const c = PROJECTED_CRS.find((x) => x.code === code)
  if (!c) throw new Error(`CRS desconocido: ${code}`)
  return c
}

/** Origen Gauss-Krüger MAGNA recomendado según la longitud. */
export function recommendedGkZone(lon: number): Crs {
  return PROJECTED_CRS.filter((c) => c.kind === 'gk').reduce((best, c) =>
    Math.abs(lon - (c.lon0 ?? 0)) < Math.abs(lon - (best.lon0 ?? 0)) ? c : best,
  )
}

export function recommendedUtmZone(lon: number): Crs {
  const zone = Math.floor((lon + 180) / 6) + 1
  return crsByCode(`UTM${zone}N`)
}

export interface ProjectedPoint {
  crs: Crs
  easting: number
  northing: number
}

/** Geográficas → una proyección. */
export function project(lat: number, lon: number, code: string): ProjectedPoint {
  const [easting, northing] = proj4(WGS84, code, [lon, lat])
  return { crs: crsByCode(code), easting, northing }
}

/** Proyección → geográficas. */
export function unproject(code: string, easting: number, northing: number): { lat: number; lon: number } {
  const [lon, lat] = proj4(code, WGS84, [easting, northing])
  return { lat, lon }
}

/** Geográficas + altura elipsoidal → geocéntricas ECEF (m). */
export function toGeocentric(lat: number, lon: number, h = 0): { x: number; y: number; z: number } {
  const [x, y, z] = proj4(WGS84, GEOCENT, [lon, lat, h])
  return { x, y, z }
}

/** Geocéntricas ECEF → geográficas + altura elipsoidal. */
export function fromGeocentric(x: number, y: number, z: number): { lat: number; lon: number; h: number } {
  const [lon, lat, h] = proj4(GEOCENT, WGS84, [x, y, z])
  return { lat, lon, h }
}

/** Convierte a todos los sistemas planos de interés en Colombia. */
export function projectAll(lat: number, lon: number): ProjectedPoint[] {
  return PROJECTED_CRS.map((c) => project(lat, lon, c.code))
}
