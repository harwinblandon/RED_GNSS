/**
 * Memoria de cálculo de la transformación de época: texto plano listo para
 * pegar en un informe técnico como sustento del modelo de velocidades usado.
 */
import type { VemosMeta, Velocity } from './vemos'
import { crsByCode } from './coords'
import { formatDms } from './format'

export interface ReportPoint {
  id: string
  /** Sistema en que se ingresó el punto (etiqueta). */
  entrada: string
  /** Coordenadas geográficas de entrada (época origen). */
  in: { lat: number; lon: number; h: number }
  vel: Velocity
  /** Desplazamiento aplicado [ΔN, ΔE, ΔU] en metros. */
  shiftNEU: [number, number, number]
  /** Coordenadas geográficas resultantes (época destino). */
  out: { lat: number; lon: number; h: number }
  xyz: { x: number; y: number; z: number }
  ctm12: { easting: number; northing: number }
  gk: { code: string; label: string; easting: number; northing: number }
  utm: { code: string; label: string; easting: number; northing: number }
}

export interface ReportInput {
  meta: VemosMeta
  fromEpoch: number
  toEpoch: number
  /** Lo que escribió el usuario en "época destino" (fecha o año decimal). */
  toInput: string
  generated: Date
  points: ReportPoint[]
}

const RULE = '='.repeat(72)
const SUB = '-'.repeat(72)
const sgn = (v: number, d: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const dec = (v: number, d: number) => v.toFixed(d)

function pointBlock(p: ReportPoint, dt: number, toEpoch: number, frame: string): string {
  const L: string[] = []
  L.push(SUB)
  L.push(`PUNTO  ${p.id}     (entrada: ${p.entrada})`)
  L.push(SUB)
  L.push('  Coordenadas de entrada (época origen)')
  L.push(`    Latitud ......... ${formatDms(p.in.lat, 'lat')}   ( ${dec(p.in.lat, 9)}° )`)
  L.push(`    Longitud ........ ${formatDms(p.in.lon, 'lon')}   ( ${dec(p.in.lon, 9)}° )`)
  L.push(`    Altura elipsoidal ${dec(p.in.h, 3)} m`)
  L.push('')

  L.push(`  Velocidad ${p.vel.method === 'bilineal' ? '(interpolación bilineal)' : '(nodo más cercano — punto fuera de la rejilla)'}`)
  L.push('    Nodos de la rejilla VEMOS2022 utilizados:')
  L.push('      latitud   longitud   vN[mm/a]   vE[mm/a]   peso')
  for (const n of p.vel.nodes) {
    L.push(
      `      ${n.lat.toFixed(1).padStart(7)}  ${n.lon.toFixed(1).padStart(8)}   ` +
        `${n.vnMm.toFixed(2).padStart(7)}   ${n.veMm.toFixed(2).padStart(7)}   ${n.weight.toFixed(4)}`,
    )
  }
  L.push(
    `    Velocidad en el punto:  vN = ${sgn(p.vel.vn * 1000, 2)} mm/a   ` +
      `vE = ${sgn(p.vel.ve * 1000, 2)} mm/a   vU = 0 (no modelada)`,
  )
  L.push('')

  L.push(`  Desplazamiento aplicado  (Δt = ${sgn(dt, 3)} años)`)
  L.push(
    `    ΔN = ${sgn(p.shiftNEU[0], 4)} m     ΔE = ${sgn(p.shiftNEU[1], 4)} m     ` +
      `ΔU = ${dec(p.shiftNEU[2], 4)} m`,
  )
  L.push('')

  L.push(`  Coordenadas resultantes  (época ${toEpoch.toFixed(4)} · marco ${frame})`)
  L.push('    Geográficas')
  L.push(`      Latitud ....... ${formatDms(p.out.lat, 'lat')}   ( ${dec(p.out.lat, 9)}° )`)
  L.push(`      Longitud ...... ${formatDms(p.out.lon, 'lon')}   ( ${dec(p.out.lon, 9)}° )`)
  L.push(`      Altura ........ ${dec(p.out.h, 3)} m`)
  L.push('    Geocéntricas ECEF (m)')
  L.push(`      X = ${dec(p.xyz.x, 3)}   Y = ${dec(p.xyz.y, 3)}   Z = ${dec(p.xyz.z, 3)}`)
  for (const c of [
    { code: 'EPSG:9377', label: 'Origen Nacional CTM12', e: p.ctm12.easting, n: p.ctm12.northing },
    { code: p.gk.code, label: p.gk.label, e: p.gk.easting, n: p.gk.northing },
    { code: p.utm.code, label: p.utm.label, e: p.utm.easting, n: p.utm.northing },
  ]) {
    L.push(`    ${c.label}  (${c.code})`)
    L.push(`      E = ${dec(c.e, 3)}   N = ${dec(c.n, 3)}`)
    L.push(`      proj4: ${crsByCode(c.code).proj.replace(/\s+/g, ' ').trim()}`)
  }
  L.push('')
  return L.join('\n')
}

export function buildEpochReport(r: ReportInput): string {
  const dt = r.toEpoch - r.fromEpoch
  const m = r.meta
  const dateStr = r.generated.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  const head = [
    RULE,
    'MEMORIA DE CÁLCULO — TRANSFORMACIÓN DE COORDENADAS ENTRE ÉPOCAS',
    `H_TOPOGRAFÍA · generada ${dateStr}`,
    RULE,
    '',
    'MODELO DE VELOCIDADES',
    `  Modelo .............. ${m.model}`,
    `  Marco de referencia . ${m.frame}`,
    `  Intervalo de datos .. ${m.timespan}`,
    '  Tipo ................ rejilla regular 1° × 1°; componentes horizontales',
    '                       (velocidad vertical vU = 0, no modelada)',
    '  Interpolación ....... bilineal con los 4 nodos que rodean el punto;',
    '                       nodo más cercano si el punto cae fuera de la rejilla',
    `  Fuente .............. ${m.source}`,
    `  Cita ............... ${m.citation}`,
    `  Subconjunto local .. Colombia, extraído el ${m.generated}`,
    '',
    'MÉTODO DE PROPAGACIÓN',
    '  Propagación cinemática lineal por velocidad:',
    '      X(t2) = X(t1) + V · (t2 − t1)',
    '  con V interpolado de VEMOS2022. Los desplazamientos horizontales',
    '  ΔN, ΔE se llevan a Δφ, Δλ con los radios de curvatura del elipsoide',
    '  GRS80 (a = 6 378 137 m, 1/f = 298.257222101):',
    '      Δφ = ΔN / (M + h)      Δλ = ΔE / ((N + h) · cos φ)',
    '  Es una propagación por velocidad, NO una transformación de datum:',
    '  dentro de Colombia ITRF2020 ≈ MAGNA-SIRGAS a nivel de centímetro.',
    '',
    'ÉPOCAS',
    `  Origen ............. ${r.fromEpoch.toFixed(4)}   (MAGNA-SIRGAS 2018.4 si aplica; Res. IGAC 715/2018)`,
    `  Destino ........... ${r.toEpoch.toFixed(4)}${/^\d{4}-\d{2}-\d{2}$/.test(r.toInput.trim()) ? `   (fecha ${r.toInput.trim()} → año decimal)` : ''}`,
    `  Intervalo Δt ....... ${sgn(dt, 4)} años`,
    '',
    `PUNTOS  (${r.points.length})`,
    '',
  ].join('\n')

  const body = r.points.map((p) => pointBlock(p, dt, r.toEpoch, m.frame)).join('\n')

  const foot = [
    RULE,
    'Herramienta de apoyo. Verifique los resultados contra las fuentes',
    'oficiales (IGAC, SIRGAS). El operador es responsable del uso de estos',
    'valores en productos oficiales.',
    RULE,
  ].join('\n')

  return `${head}${body}${foot}\n`
}
