/**
 * Cálculos geodésicos para el buscador de estaciones y las líneas base.
 *
 * Usa el algoritmo de Karney (librería geographiclib-geodesic) sobre el
 * elipsoide GRS80 — el de MAGNA-SIRGAS. Precisión ~nm en la distancia, muy por
 * debajo de lo relevante para planeación de campo.
 */
import { Geodesic } from 'geographiclib-geodesic'

// GRS80 (MAGNA-SIRGAS / SIRGAS). a = 6378137 m, f = 1/298.257222101
const GRS80 = new Geodesic.Geodesic(6378137, 1 / 298.257222101)

export interface LatLon {
  lat: number
  lon: number
}

export interface GeodesicResult {
  /** Distancia geodésica (línea base) en metros. */
  distanceM: number
  /** Azimut directo en el punto de partida, grados [0, 360). */
  azimuthDeg: number
  /** Azimut inverso (de llegada), grados [0, 360). */
  reverseAzimuthDeg: number
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Problema geodésico inverso entre dos puntos (elipsoide GRS80). */
export function geodesicInverse(a: LatLon, b: LatLon): GeodesicResult {
  const r = GRS80.Inverse(a.lat, a.lon, b.lat, b.lon)
  return {
    distanceM: r.s12 ?? 0,
    azimuthDeg: norm360(r.azi1 ?? 0),
    reverseAzimuthDeg: norm360((r.azi2 ?? 0) + 180),
  }
}

/** Distancia geodésica en kilómetros. */
export function distanceKm(a: LatLon, b: LatLon): number {
  return geodesicInverse(a, b).distanceM / 1000
}

export interface RankedStation<T> {
  station: T
  distanceKm: number
  azimuthDeg: number
}

/** Ordena estaciones por distancia geodésica a un punto; devuelve las `n` más cercanas. */
export function nearestStations<T extends LatLon>(
  point: LatLon,
  stations: readonly T[],
  n = 5,
): RankedStation<T>[] {
  return stations
    .map((station) => {
      const g = geodesicInverse(point, station)
      return { station, distanceKm: g.distanceM / 1000, azimuthDeg: g.azimuthDeg }
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n)
}

/* -------------------------------------------------------------------------- */
/*  Sexagesimal <-> decimal                                                    */
/* -------------------------------------------------------------------------- */

export function dmsToDecimal(d: number, m: number, s: number, hemi: 1 | -1 = 1): number {
  return hemi * (Math.abs(d) + m / 60 + s / 3600)
}

export function decimalToDms(value: number): { d: number; m: number; s: number; sign: 1 | -1 } {
  const sign: 1 | -1 = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  const d = Math.floor(abs)
  const mFloat = (abs - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  return { d, m, s, sign }
}
