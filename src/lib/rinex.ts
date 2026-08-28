/**
 * Acceso a los archivos RINEX de la Red MAGNA-ECO a través de la API pública
 * del Centro de Control Geodésico del IGAC (CORS abierto).
 *
 *   GET  https://ccg.igac.gov.co/api/rinex?id=<tId>   → archivos disponibles
 *   POST https://ccg.igac.gov.co/api/rinex  {datos:[url,…]}  → ZIP con los archivos
 *
 * La descarga en el sitio del IGAC limita la selección a 5 archivos; se respeta
 * el mismo límite.
 */
import { dateFromDoy, isoDate } from './gpsTime'

const API = 'https://ccg.igac.gov.co/api/rinex'
export const MAX_FILES = 5

export type RinexKind = 'obs' | 'nav-gps' | 'nav-glonass' | 'nav-mixed' | 'otro'
export type RinexVersion = '2.11' | '3.0' | 'otra'

export interface RinexFile {
  name: string
  url: string
  year: number
  doy: number
  date: string
  gpsWeek: number
  version: RinexVersion
  kind: RinexKind
  kindLabel: string
  sampleRateS: number
}

interface RawRinex {
  nombre: string
  url: string
  año: number
  dia_del_año: string
  semana_gps: number
  version_rinex: string
  tipo_rinex: string
  tasa_muestreo: number
}

function classifyKind(tipo: string): { kind: RinexKind; label: string } {
  const t = tipo.toLowerCase()
  if (t.includes('observ')) return { kind: 'obs', label: 'Observación' }
  if (t.includes('glonass')) return { kind: 'nav-glonass', label: 'Navegación GLONASS' }
  if (t.includes('mixt') || t.includes('mixed')) return { kind: 'nav-mixed', label: 'Navegación mixta' }
  if (t.includes('gps')) return { kind: 'nav-gps', label: 'Navegación GPS' }
  return { kind: 'otro', label: tipo }
}

function classifyVersion(v: string): RinexVersion {
  if (v.includes('2.11') || v.includes('2.1')) return '2.11'
  if (v.includes('3.0') || v.includes('3.')) return '3.0'
  return 'otra'
}

export async function fetchAvailable(tId: number, signal?: AbortSignal): Promise<RinexFile[]> {
  const res = await fetch(`${API}?id=${tId}`, { signal })
  if (!res.ok) throw new Error(`IGAC RINEX: HTTP ${res.status}`)
  const json = (await res.json()) as Array<{ datos: RawRinex[] | null }>
  const raw = json?.[0]?.datos ?? []
  return raw
    .map((r): RinexFile => {
      const doy = parseInt(r.dia_del_año, 10)
      const { kind, label } = classifyKind(r.tipo_rinex)
      return {
        name: r.nombre,
        url: r.url,
        year: r.año,
        doy,
        date: isoDate(dateFromDoy(r.año, doy)),
        gpsWeek: r.semana_gps,
        version: classifyVersion(r.version_rinex),
        kind,
        kindLabel: label,
        sampleRateS: r.tasa_muestreo,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
}

/** Descarga un ZIP con los archivos indicados (por su `url` relativa). */
export async function downloadZip(urls: string[], signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datos: urls.slice(0, MAX_FILES) }),
    signal,
  })
  if (!res.ok) throw new Error(`IGAC RINEX: HTTP ${res.status}`)
  return res.blob()
}

/** Página de descarga del IGAC (alternativa manual). */
export function rinexDeepLink(id: string, tId: number): string {
  return `https://redgeodesica.igac.gov.co/rinex.html?id=${tId}&identificador=${id}`
}

export interface Freshness {
  lastDate: string | null
  latencyDays: number | null
  level: 'ok' | 'warn' | 'stale' | 'unknown'
}

/** Evalúa qué tan recientes son los datos disponibles. */
export function freshness(files: RinexFile[], today = new Date()): Freshness {
  if (files.length === 0) return { lastDate: null, latencyDays: null, level: 'unknown' }
  const last = files.reduce((m, f) => (f.date > m ? f.date : m), files[0].date)
  const days = Math.round((today.getTime() - new Date(last + 'T00:00:00Z').getTime()) / 86_400_000)
  const level = days <= 7 ? 'ok' : days <= 20 ? 'warn' : 'stale'
  return { lastDate: last, latencyDays: days, level }
}
