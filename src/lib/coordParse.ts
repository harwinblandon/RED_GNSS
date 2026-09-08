/**
 * Lectura de coordenadas pegadas o de un archivo CSV/TXT.
 *
 * Acepta filas con separador coma, punto y coma, tab o espacios:
 *   - geográficas:  [id,] lat, lon [, h]
 *   - geocéntricas: [id,] X, Y, Z
 * Detecta automáticamente el tipo por la magnitud de los valores y salta
 * una fila de encabezado si la primera fila no es numérica.
 */
import { fromGeocentric } from './coords'

export interface ParsedPoint {
  id: string
  lat: number
  lon: number
  h: number
  /** 'geo' si venía en geográficas, 'xyz' si venía en geocéntricas. */
  kind: 'geo' | 'xyz'
}

export interface ParseResult {
  points: ParsedPoint[]
  errors: string[]
}

const num = (s: string) => Number(s.replace(',', '.').trim())

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

export function parseCoordinates(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const errors: string[] = []
  const points: ParsedPoint[] = []
  if (lines.length === 0) return { points, errors: ['Sin datos.'] }

  let start = 0
  if (!looksNumeric(splitRow(lines[0]))) start = 1 // encabezado

  for (let i = start; i < lines.length; i++) {
    const cells = splitRow(lines[i]).map((c) => c.trim()).filter((c) => c !== '')
    if (cells.length < 3) {
      errors.push(`Fila ${i + 1}: se esperaban 3 o 4 valores.`)
      continue
    }
    const hasId = cells.length >= 4 || !Number.isFinite(num(cells[0]))
    const id = hasId ? cells[0] : `P${points.length + 1}`
    const vals = (hasId ? cells.slice(1) : cells).map(num)
    if (vals.length < 3 || vals.some((v) => !Number.isFinite(v))) {
      errors.push(`Fila ${i + 1}: valores no numéricos.`)
      continue
    }

    const [a, b, c] = vals
    const geocentric = Math.abs(a) > 1000 || Math.abs(b) > 1000
    if (geocentric) {
      const g = fromGeocentric(a, b, c)
      points.push({ id, lat: g.lat, lon: g.lon, h: g.h, kind: 'xyz' })
    } else {
      if (Math.abs(a) > 90 || Math.abs(b) > 180) {
        errors.push(`Fila ${i + 1}: lat/lon fuera de rango.`)
        continue
      }
      points.push({ id, lat: a, lon: b, h: vals[3] ?? 0, kind: 'geo' })
    }
  }

  return { points, errors }
}
