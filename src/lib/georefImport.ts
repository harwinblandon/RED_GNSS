/**
 * Lectura de los archivos de puntos del post-proceso:
 *  - Exportación CSV de Leica Infinity (UTF-16 con "sep=;", columnas "Point Id",
 *    "Start Time", "WGS84 Cartesian X [m]"…).
 *  - CSV genérico con encabezado: id, fecha[, hora], X, Y, Z  (o lat, lon, h).
 * Además, coordenadas de bases desde archivos de solución semanal (.CRD del
 * IGAC o de SIRGAS).
 */
import { decimalYear } from './gpsTime'
import { toGeocentric } from './coords'
import { parseAngle } from './guideAdjust'
import type { BaseVertex, ObsPoint } from './georef'

/**
 * Corrige texto UTF-8 leído como Latin-1 ("mojÃ³n" → "mojón"), como el que
 * exporta Leica Infinity dentro de un archivo UTF-16.
 */
function fixMojibake(s: string): string {
  // Solo las secuencias de 2 bytes UTF-8 leídas como Latin-1; un "°" correcto en la misma línea no se toca.
  return s.replace(/[Â-ß][\u0080-¿]/g, (pair) => {
    const ch = new TextDecoder('utf-8').decode(new Uint8Array([pair.charCodeAt(0), pair.charCodeAt(1)]))
    return ch.includes('�') ? pair : ch
  })
}

/** Decodifica respetando BOM UTF-16/UTF-8; si UTF-8 trae caracteres inválidos, usa Windows-1252. */
export function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let text: string
  if (b[0] === 0xff && b[1] === 0xfe) text = new TextDecoder('utf-16le').decode(b.subarray(2))
  else if (b[0] === 0xfe && b[1] === 0xff) text = new TextDecoder('utf-16be').decode(b.subarray(2))
  else {
    const utf8 = new TextDecoder('utf-8').decode(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b)
    text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(b) : utf8
  }
  return text.split('\n').map(fixMojibake).join('\n')
}

/** Separa una línea CSV con comillas dobles. */
function splitCsv(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

const num = (s: string | undefined) => (s == null || s.trim() === '' ? NaN : Number(s.replace(',', '.').trim()))

/** "28/11/2025 07:59:37", "2025-11-28 07:59", "2025-11-28T07:59:37" → Date (hora local Colombia, UTC−5). */
export function parseDateTime(s: string): Date | null {
  const t = s.trim()
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 12) + 5, +(m[5] ?? 0), +(m[6] ?? 0)))
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12) + 5, +(m[5] ?? 0), +(m[6] ?? 0)))
  return null
}

const fmtLocal = (d: Date | null) =>
  d ? new Date(d.getTime() - 5 * 3600_000).toISOString().replace('T', ' ').slice(0, 16) : ''

export interface ImportResult {
  format: 'Leica Infinity' | 'CSV genérico'
  points: ObsPoint[]
  warnings: string[]
}

/** Asigna ids únicos: "mojón", "mojón (2)", … (el usuario puede renombrarlos). */
function uniqueIds(points: ObsPoint[], warnings: string[]) {
  const seen = new Map<string, number>()
  let dup = 0
  for (const p of points) {
    const n = (seen.get(p.id) ?? 0) + 1
    seen.set(p.id, n)
    if (n > 1) {
      p.id = `${p.id} (${n})`
      dup++
    }
  }
  if (dup) warnings.push(`${dup} punto(s) tenían el mismo nombre; se numeraron. Revisa y renombra en la tabla.`)
}

export function importPoints(text: string, fallbackDate?: string): ImportResult {
  let lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  let sep = ','
  if (/^"?sep=(.)"?$/.test(lines[0]?.trim() ?? '')) {
    sep = lines[0].trim().replace(/"/g, '')[4]
    lines = lines.slice(1)
  } else if (lines[0]?.includes(';')) sep = ';'
  else if (lines[0]?.includes('\t')) sep = '\t'
  const head = splitCsv(lines[0] ?? '', sep)
  const warnings: string[] = []
  const col = (...names: (string | RegExp)[]) =>
    head.findIndex((h) => names.some((n) => (typeof n === 'string' ? h.toLowerCase() === n.toLowerCase() : n.test(h))))

  // ---------- Leica Infinity ----------
  if (col('Point Id') >= 0 && col(/WGS84 Cartesian X/i) >= 0) {
    const c = {
      id: col('Point Id'),
      from: col('From Station'),
      sol: col('Solution Type'),
      start: col('Start Time'),
      end: col('End Time'),
      dur: col('Duration'),
      ah: col(/Antenna Height/i),
      an: col('Antenna Name'),
      x: col(/WGS84 Cartesian X/i),
      y: col(/WGS84 Cartesian Y/i),
      z: col(/WGS84 Cartesian Z/i),
      ortho: col(/Ortho\. Height/i),
      sep: col(/Geoid Separation/i),
    }
    const points: ObsPoint[] = []
    lines.slice(1).forEach((line, k) => {
      const r = splitCsv(line, sep)
      const x = num(r[c.x])
      const y = num(r[c.y])
      const z = num(r[c.z])
      if (![x, y, z].every(Number.isFinite)) {
        warnings.push(`Fila ${k + 2}: sin coordenadas cartesianas; se omitió.`)
        return
      }
      const t0 = c.start >= 0 ? parseDateTime(r[c.start]) : null
      const t1 = c.end >= 0 ? parseDateTime(r[c.end]) : null
      const mid = t0 && t1 ? new Date((t0.getTime() + t1.getTime()) / 2) : t0
      const dateFallback = !mid && fallbackDate ? parseDateTime(fallbackDate) : null
      if (!mid && !dateFallback) warnings.push(`Fila ${k + 2}: sin fecha de observación.`)
      points.push({
        id: (r[c.id] || `${points.length + 1}`).trim(),
        x,
        y,
        z,
        tObs: decimalYear(mid ?? dateFallback ?? new Date()),
        inicio: fmtLocal(t0),
        fin: fmtLocal(t1),
        duracion: c.dur >= 0 ? r[c.dur] : '',
        base: c.from >= 0 ? r[c.from] : '',
        antena: c.an >= 0 ? r[c.an] : '',
        alturaAntena: c.ah >= 0 && Number.isFinite(num(r[c.ah])) ? num(r[c.ah]) : null,
        solucion: c.sol >= 0 ? r[c.sol] : '',
        orthoSoftware: c.ortho >= 0 && Number.isFinite(num(r[c.ortho])) ? num(r[c.ortho]) : null,
        geoidSepSoftware: c.sep >= 0 && Number.isFinite(num(r[c.sep])) ? num(r[c.sep]) : null,
      })
    })
    uniqueIds(points, warnings)
    return { format: 'Leica Infinity', points, warnings }
  }

  // ---------- CSV genérico ----------
  const c = {
    id: col('id', 'punto', 'nombre', 'name'),
    fecha: col('fecha', 'date', 'fecha_hora', 'datetime'),
    hora: col('hora', 'time'),
    x: col('x', 'x (m)'),
    y: col('y', 'y (m)'),
    z: col('z', 'z (m)'),
    lat: col('lat', 'latitud'),
    lon: col('lon', 'longitud'),
    h: col('h', 'h_elip', 'altura_elipsoidal'),
  }
  const useXyz = c.x >= 0 && c.y >= 0 && c.z >= 0
  if (!useXyz && !(c.lat >= 0 && c.lon >= 0 && c.h >= 0))
    return {
      format: 'CSV genérico',
      points: [],
      warnings: ['Encabezado no reconocido. Usa: id, fecha, X, Y, Z  (o id, fecha, lat, lon, h). Opcional: hora.'],
    }
  const points: ObsPoint[] = []
  lines.slice(1).forEach((line, k) => {
    const r = splitCsv(line, sep)
    let x: number, y: number, z: number
    if (useXyz) {
      x = num(r[c.x])
      y = num(r[c.y])
      z = num(r[c.z])
    } else {
      const la = parseAngle(r[c.lat] ?? '', 'lat')
      const lo = parseAngle(r[c.lon] ?? '', 'lon')
      const h = num(r[c.h])
      if (la == null || lo == null || !Number.isFinite(h)) {
        warnings.push(`Fila ${k + 2}: coordenadas incompletas; se omitió.`)
        return
      }
      ;({ x, y, z } = toGeocentric(la, lo, h))
    }
    if (![x, y, z].every(Number.isFinite)) {
      warnings.push(`Fila ${k + 2}: coordenadas incompletas; se omitió.`)
      return
    }
    const ds = c.fecha >= 0 ? `${r[c.fecha] ?? ''}${c.hora >= 0 && r[c.hora] ? ` ${r[c.hora]}` : ''}` : fallbackDate ?? ''
    const d = parseDateTime(ds) ?? (fallbackDate ? parseDateTime(fallbackDate) : null)
    if (!d) warnings.push(`Fila ${k + 2}: sin fecha de observación válida (usa AAAA-MM-DD o DD/MM/AAAA).`)
    points.push({
      id: (c.id >= 0 && r[c.id] ? r[c.id] : `${points.length + 1}`).trim(),
      x,
      y,
      z,
      tObs: decimalYear(d ?? new Date()),
      inicio: fmtLocal(d),
      fin: '',
      duracion: '',
      base: '',
      antena: '',
      alturaAntena: null,
      solucion: '',
    })
  })
  uniqueIds(points, warnings)
  return { format: 'CSV genérico', points, warnings }
}

/* ------------------------- soluciones semanales ------------------------- */

export interface CrdFile {
  frame: string
  /** Época del archivo (año decimal). */
  epoch: number | null
  epochText: string
  label: string
  stations: Map<string, [number, number, number]>
}

/** Lee un .CRD del IGAC (tabulado) o de SIRGAS/Bernese (columnas fijas). */
export function parseCrd(text: string, fileName = ''): CrdFile {
  const frame = text.match(/\b(IGS\d{2,}|IGb\d{2,}|ITRF\d{2,})\b/)?.[1] ?? '—'
  const et = text.match(/(?:POCA|EPOCH):\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/)
  const d = et ? parseDateTime(`${et[1]} ${et[2] ?? '12:00'}`) : null
  const stations = new Map<string, [number, number, number]>()
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/)
    // IGAC: n  ID  X Y Z   ·  SIRGAS: n  ID  DOMES  X Y Z  FLAG
    const iX = /^-?\d+\.\d+$/.test(p[2] ?? '') ? 2 : /^-?\d+\.\d+$/.test(p[3] ?? '') ? 3 : -1
    if (iX < 0 || !/^\d+$/.test(p[0]) || !/^[A-Z0-9]{4}$/i.test(p[1])) continue
    const xyz: [number, number, number] = [Number(p[iX]), Number(p[iX + 1]), Number(p[iX + 2])]
    if (xyz.every(Number.isFinite) && Math.hypot(...xyz) > 6e6) stations.set(p[1].toUpperCase(), xyz)
  }
  // La hora local se sumó en parseDateTime (+5 h); la época de los CRD es UTC.
  const epoch = d ? decimalYear(new Date(d.getTime() - 5 * 3600_000)) : null
  return { frame, epoch, epochText: et?.[1] ?? '—', label: fileName, stations }
}

export function baseFromCrd(id: string, crd: CrdFile, tipo: BaseVertex['tipo'] = 'CORS activa'): BaseVertex | null {
  const xyz = crd.stations.get(id.toUpperCase())
  if (!xyz) return null
  return {
    id: id.toUpperCase(),
    tipo,
    x: xyz[0],
    y: xyz[1],
    z: xyz[2],
    epoch: crd.epoch,
    fuente: `${crd.label || 'Solución semanal'} · ${crd.frame} · época ${crd.epochText}`,
  }
}
