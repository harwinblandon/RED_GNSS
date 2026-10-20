/**
 * Sistemas de coordenadas planas del reporte final: CTM12 (oficial), Gauss-
 * Krüger MAGNA (5 orígenes), UTM y planas cartesianas locales (Colombia Urban).
 */
import { crsByCode, project } from './coords'
import { cartesianForward, type CartesianOrigin } from './colUrban'

export interface OutputSys {
  id: string
  /** Nombre corto para encabezados de columna. */
  short: string
  label: string
  kind: 'ctm12' | 'gk' | 'utm' | 'cart'
  code?: string
  origin?: CartesianOrigin
}

export function sysFromCode(code: string): OutputSys {
  const c = crsByCode(code)
  const short =
    c.kind === 'ctm12' ? 'CTM12' : c.kind === 'gk' ? `GK ${c.label.replace('GK MAGNA ', '').replace(/ \(.*/, '')}` : c.label.replace(' (GRS80)', '')
  return { id: code, short, label: `${c.label} (${code})`, kind: c.kind, code }
}

export function cartesianSys(o: CartesianOrigin): OutputSys {
  return {
    id: `cart:${o.name}`,
    short: `Cartesianas ${o.name.replace(/ \(.*/, '')}`,
    label: `Planas cartesianas ${o.name} · origen ${o.lat0.toFixed(8)}°, ${o.lon0.toFixed(8)}° · FN ${o.fn} · FE ${o.fe} · plano ${o.h0} m`,
    kind: 'cart',
    origin: o,
  }
}

export function projectOut(s: OutputSys, lat: number, lon: number): { north: number; east: number } {
  if (s.kind === 'cart') return cartesianForward(s.origin!, lat, lon)
  const p = project(lat, lon, s.code!)
  return { north: p.northing, east: p.easting }
}
