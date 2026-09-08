/**
 * Lectura de coordenadas pegadas o de un archivo CSV/TXT.
 *
 * Con `system = 'auto'` (por defecto) acepta filas con separador coma, punto y
 * coma, tab o espacios y detecta el tipo por la magnitud de los valores:
 *   - geográficas:  [id,] lat, lon [, h]
 *   - geocéntricas: [id,] X, Y, Z
 * Indicando un `system` concreto, todas las filas se interpretan en ese sistema
 * (grados decimales, G° M' S", geocéntricas o cualquier sistema plano) y se
 * convierten a geográficas MAGNA-SIRGAS.
 */
import { fromGeocentric, unproject } from './coords'
import { dmsToDecimal } from './geodesy'

/** `'auto' | 'geo-dec' | 'geo-dms' | 'ecef'` o un código de `PROJECTED_CRS`. */
export type InputSystem = string

export interface ParsedPoint {
  id: string
  lat: number
  lon: number
  h: number
  /** 'geo' si el resultado quedó en geográficas, 'xyz' si la entrada era geocéntrica. */
  kind: 'geo' | 'xyz'
}

export interface ParseResult {
  points: ParsedPoint[]
  errors: string[]
}

const num = (s: string) => Number(s.replace(',', '.').trim())

const numsIn = (s: string) =>
  (s.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(',', '.')))

function toDeg(arr: number[], sign: 1 | -1): number | null {
  if (arr.length === 0 || arr.some((n) => !Number.isFinite(n))) return null
  const [d = 0, m = 0, s = 0] = arr.map(Math.abs)
  return dmsToDecimal(d, m, s, sign)
}

/**
 * Latitud y longitud (y lo que sobre) de un texto en G° M' S". Requiere los
 * hemisferios N/S y E/W. `rest` son los números que quedan tras el hemisferio
 * de longitud (p. ej. una altura).
 */
export function parseDmsPair(text: string): { lat: number; lon: number; rest: number[] } | null {
  const idxNS = text.search(/[NSns]/)
  const idxEW = text.search(/[EWew]/)
  if (idxNS < 0 || idxEW <= idxNS) return null
  const latH: 1 | -1 = text[idxNS].toUpperCase() === 'S' ? -1 : 1
  const lonH: 1 | -1 = text[idxEW].toUpperCase() === 'W' ? -1 : 1
  const lat = toDeg(numsIn(text.slice(0, idxNS)), latH)
  const lon = toDeg(numsIn(text.slice(idxNS + 1, idxEW)), lonH)
  if (lat == null || lon == null) return null
  return { lat, lon, rest: numsIn(text.slice(idxEW + 1)) }
}

function splitRow(line: string): string[] {
  const t = line.trim()
  if (t.includes(';')) return t.split(';')
  if (t.includes('\t')) return t.split('\t')
  if (t.includes(',') && !/^\s*-?\d+,\d+\s/.test(t)) return t.split(',')
  return t.split(/\s+/)
}

function looksNumeric(cells: string[]): boolean {
  return cells.slice(-3).every((c) => Number.isFinite(num(c)))
}

const PROJECTED_PREFIXES = ['EPSG:', 'UTM']
const isProjected = (s: InputSystem) => PROJECTED_PREFIXES.some((p) => s.startsWith(p))

export function parseCoordinates(text: string, system: InputSystem = 'auto'): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const errors: string[] = []
  const points: ParsedPoint[] = []
  if (lines.length === 0) return { points, errors: ['Sin datos.'] }

  if (system === 'geo-dms') {
    const start = /\d/.test(lines[0]) ? 0 : 1 // salta encabezado sin dígitos
    for (let i = start; i < lines.length; i++) {
      let id: string | undefined
      let body = lines[i]
      // Un token inicial que no empiece por dígito ni signo es el identificador.
      const m = body.match(/^\s*([^\s,]+)[\s,]+(.*)$/)
      if (m && !/^[-\d]/.test(m[1])) {
        id = m[1]
        body = m[2]
      }
      const p = parseDmsPair(body)
      if (!p) {
        errors.push(`Fila ${i + 1}: no se reconoció "lat N/S  lon E/W".`)
        continue
      }
      points.push({
        id: id ?? `P${points.length + 1}`,
        lat: p.lat,
        lon: p.lon,
        h: p.rest[0] ?? 0,
        kind: 'geo',
      })
    }
    return { points, errors }
  }

  let start = 0
  if (!looksNumeric(splitRow(lines[0]))) start = 1 // encabezado

  const crs = isProjected(system) ? system : null

  for (let i = start; i < lines.length; i++) {
    const cells = splitRow(lines[i]).map((c) => c.trim()).filter((c) => c !== '')
    const minCells = crs ? 2 : 3
    if (cells.length < minCells) {
      errors.push(`Fila ${i + 1}: se esperaban ${crs ? '2 o 3' : '3 o 4'} valores.`)
      continue
    }
    const hasId =
      cells.length >= (crs ? 3 : 4) || !Number.isFinite(num(cells[0]))
    const id = hasId ? cells[0] : `P${points.length + 1}`
    const vals = (hasId ? cells.slice(1) : cells).map(num)
    if (vals.length < minCells || vals.some((v) => !Number.isFinite(v))) {
      errors.push(`Fila ${i + 1}: valores no numéricos.`)
      continue
    }

    const [a, b, c] = vals

    if (crs) {
      try {
        const g = unproject(crs, a, b)
        points.push({ id, lat: g.lat, lon: g.lon, h: c ?? 0, kind: 'geo' })
      } catch {
        errors.push(`Fila ${i + 1}: no se pudo proyectar en ${crs}.`)
      }
      continue
    }

    if (system === 'ecef') {
      const g = fromGeocentric(a, b, c)
      points.push({ id, lat: g.lat, lon: g.lon, h: g.h, kind: 'xyz' })
      continue
    }

    if (system === 'geo-dec') {
      if (Math.abs(a) > 90 || Math.abs(b) > 180) {
        errors.push(`Fila ${i + 1}: lat/lon fuera de rango.`)
        continue
      }
      points.push({ id, lat: a, lon: b, h: c ?? 0, kind: 'geo' })
      continue
    }

    // system === 'auto': detección por magnitud
    const geocentric = Math.abs(a) > 1000 || Math.abs(b) > 1000
    if (geocentric) {
      const g = fromGeocentric(a, b, c)
      points.push({ id, lat: g.lat, lon: g.lon, h: g.h, kind: 'xyz' })
    } else {
      if (Math.abs(a) > 90 || Math.abs(b) > 180) {
        errors.push(`Fila ${i + 1}: lat/lon fuera de rango.`)
        continue
      }
      points.push({ id, lat: a, lon: b, h: c ?? 0, kind: 'geo' })
    }
  }

  return { points, errors }
}
