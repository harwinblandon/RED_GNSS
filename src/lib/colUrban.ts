/**
 * Coordenadas planas cartesianas locales del IGAC — método EPSG 1052
 * "Colombia Urban" (IOGP Guidance Note 7-2), igual que PROJ `+proj=col_urban`.
 * Plano tangente al elipsoide elevado a la altura media de la zona (h0).
 */

const A = 6378137.0
const F = 1 / 298.257222101
const ES = F * (2 - F)
const D2R = Math.PI / 180

export interface CartesianOrigin {
  name: string
  /** Latitud y longitud del origen (grados decimales). */
  lat0: number
  lon0: number
  /** Falso norte y falso este (m). */
  fn: number
  fe: number
  /** Altura del plano de proyección (m). */
  h0: number
}

/** Orígenes de referencia conocidos (EPSG). Para otros municipios, ingresar el origen del IGAC. */
export const CARTESIAN_PRESETS: CartesianOrigin[] = [
  {
    name: 'Bogotá D.C. (EPSG:6247)',
    lat0: 4 + 40 / 60 + 49.75 / 3600,
    lon0: -(74 + 8 / 60 + 47.73 / 3600),
    fn: 109320.965,
    fe: 92334.879,
    h0: 2550,
  },
]

function consts(o: CartesianOrigin) {
  const phi0 = o.lat0 * D2R
  const h0 = o.h0 / A
  const s0 = Math.sin(phi0)
  const nu0 = 1 / Math.sqrt(1 - ES * s0 * s0)
  const rho0 = (1 - ES) / Math.pow(1 - ES * s0 * s0, 1.5)
  return {
    phi0,
    h0,
    A: 1 + h0 / nu0,
    rho0,
    B: Math.tan(phi0) / (2 * rho0 * nu0),
    C: 1 + h0,
    D: rho0 * (1 + h0 / (1 - ES)),
  }
}

export function cartesianForward(o: CartesianOrigin, lat: number, lon: number): { north: number; east: number } {
  const k = consts(o)
  const phi = lat * D2R
  const lam = (lon - o.lon0) * D2R
  const s = Math.sin(phi)
  const nu = 1 / Math.sqrt(1 - ES * s * s)
  const lnc = lam * nu * Math.cos(phi)
  const sm = Math.sin(0.5 * (phi + k.phi0))
  const rhoM = (1 - ES) / Math.pow(1 - ES * sm * sm, 1.5)
  const G = 1 + k.h0 / rhoM
  return {
    east: o.fe + A * k.A * lnc,
    north: o.fn + A * G * k.rho0 * (phi - k.phi0 + k.B * lnc * lnc),
  }
}

export function cartesianInverse(o: CartesianOrigin, north: number, east: number): { lat: number; lon: number } {
  const k = consts(o)
  const x = (east - o.fe) / A
  const y = (north - o.fn) / A
  const phi = k.phi0 + y / k.D - k.B * (x / k.C) * (x / k.C)
  const s = Math.sin(phi)
  const nu = 1 / Math.sqrt(1 - ES * s * s)
  return { lat: phi / D2R, lon: o.lon0 + x / (k.C * nu * Math.cos(phi)) / D2R }
}
