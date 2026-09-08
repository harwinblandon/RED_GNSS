/**
 * Propagación de coordenadas entre épocas usando la velocidad de la estación.
 *
 * Las coordenadas oficiales del IGAC están en la época de referencia de
 * MAGNA-SIRGAS 2018.4 (Marco Geocéntrico Nacional de Referencia 2018,
 * Resolución IGAC 715 de 2018). Para comparar contra un procesamiento hecho
 * con productos SIRGAS/IGS (que están en ITRF y en la época de observación),
 * conviene propagar la posición a esa época con la velocidad de la estación.
 */

/** Época de referencia de las coordenadas oficiales MAGNA-SIRGAS. */
export const MAGNA_SIRGAS_EPOCH = 2018.4

const A = 6378137.0
const F = 1 / 298.257222101
const E2 = F * (2 - F)
const D2R = Math.PI / 180

/** Año decimal de una fecha (UTC). */
export function decimalYear(date: Date): number {
  const y = date.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  const end = Date.UTC(y + 1, 0, 1)
  return y + (date.getTime() - start) / (end - start)
}

export interface PropagatedPoint {
  lat: number
  lon: number
  h: number
  /** Desplazamiento aplicado [Norte, Este, Arriba] en metros. */
  shiftNEU: [number, number, number]
  years: number
}

/**
 * Propaga (lat, lon, h) desde `fromEpoch` a `toEpoch` con la velocidad
 * `velNEU` = [vNorte, vEste, vArriba] en m/año.
 */
export function propagate(
  lat: number,
  lon: number,
  h: number,
  velNEU: [number, number, number],
  fromEpoch: number,
  toEpoch: number,
): PropagatedPoint {
  const years = toEpoch - fromEpoch
  const [vn, ve, vu] = velNEU
  const dN = vn * years
  const dE = ve * years
  const dU = vu * years

  const phi = lat * D2R
  const sinP = Math.sin(phi)
  const w = Math.sqrt(1 - E2 * sinP * sinP)
  const M = (A * (1 - E2)) / (w * w * w) // radio meridiano
  const N = A / w // radio primer vertical

  const newLat = lat + (dN / (M + h)) / D2R
  const newLon = lon + (dE / ((N + h) * Math.cos(phi))) / D2R
  const newH = h + dU

  return { lat: newLat, lon: newLon, h: newH, shiftNEU: [dN, dE, dU], years }
}
