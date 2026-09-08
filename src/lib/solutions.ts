/**
 * Enlaces y disponibilidad de las soluciones de coordenadas de las estaciones:
 * SIRGAS (semanales y multianuales) e IGAC (soluciones semanales `.CRD`).
 *
 * Las páginas de SIRGAS tienen protección anti-bot; se abren con enlaces
 * directos (el navegador del usuario pasa la verificación). La lista de
 * soluciones semanales del IGAC sí es consultable (CORS abierto), pero el
 * archivo `.CRD` no tiene descarga pública directa conocida.
 */
import { unzipSync, strFromU8 } from 'fflate'
import { dateFromGpsWeek, isoDate } from './gpsTime'

/** Página de la estación en SIRGAS (coordenadas oficiales + serie temporal). */
export function sirgasStationUrl(id: string): string {
  return `https://sirgas.ipgh.org/en/sirgas-con-stations/${id.toLowerCase()}/`
}

export const SIRGAS_LINKS = {
  coordinates: 'https://sirgas.ipgh.org/en/gnss-network/coordinates/',
  weekly: 'https://sirgas.ipgh.org/en/gnss-network/coordinates/loosely-constrained-weekly-solutions/',
  weeklyPositions: 'https://sirgas.ipgh.org/en/gnss-network/coordinates/weekly-positions/',
  multiYear: 'https://sirgas.ipgh.org/en/gnss-network/coordinates/multi-year-solutions/',
  ftp: 'https://ftp.sirgas.org/pub/gps/SIRGAS/',
} as const

export const IGAC_LINKS = {
  redGeodesica: 'https://redgeodesica.igac.gov.co/',
  datosAbiertos: 'https://geoportal.igac.gov.co/contenido/datos-abiertos-geodesia',
} as const

/* --------------------- soluciones semanales del IGAC -------------------- */

const IGAC_COORDS_API = 'https://ccg.igac.gov.co/api/coordenadas'

export interface WeeklySolution {
  /** Semana GPS. */
  gpsWeek: number
  /** Nombre del archivo, p. ej. IGA2424.CRD */
  name: string
  /** Fecha de publicación (ISO). */
  published: string
  /** Fecha (lunes) de inicio de esa semana GPS. */
  weekStart: string
}

interface RawSolution {
  t_id: number
  nombre: string
  semana: string
  fecha_creacion: string
}

export async function fetchIgacWeeklySolutions(signal?: AbortSignal): Promise<WeeklySolution[]> {
  const res = await fetch(IGAC_COORDS_API, { signal })
  if (!res.ok) throw new Error(`IGAC: HTTP ${res.status}`)
  const raw = (await res.json()) as RawSolution[]
  return raw
    .map((r): WeeklySolution => {
      const gpsWeek = parseInt(r.semana, 10)
      return {
        gpsWeek,
        name: r.nombre,
        published: r.fecha_creacion.slice(0, 10),
        weekStart: isoDate(dateFromGpsWeek(gpsWeek, 1)),
      }
    })
    .filter((s) => Number.isFinite(s.gpsWeek))
    .sort((a, b) => b.gpsWeek - a.gpsWeek)
}

/* -------------- descarga y lectura de la solución semanal .CRD --------- */

// El mismo endpoint que sirve los RINEX entrega los .CRD como ZIP.
const RINEX_API = 'https://ccg.igac.gov.co/api/rinex'
const IGA_WEEKLY_PREFIX = './CoordenadasSemanales/'

/** Descarga el ZIP de una solución semanal del IGAC (contiene el archivo .CRD). */
export async function downloadIgacWeeklyZip(name: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(RINEX_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datos: [IGA_WEEKLY_PREFIX + name] }),
    signal,
  })
  if (!res.ok) throw new Error(`IGAC: HTTP ${res.status}`)
  return res.blob()
}

export interface IgacWeeklyCoord {
  /** Marco de referencia del archivo (p. ej. IGS20 ≈ ITRF2020). */
  frame: string
  /** Época del archivo (fecha-hora de observación). */
  epoch: string
  /** Coordenadas geocéntricas [X, Y, Z] en metros. */
  xyz: [number, number, number]
}

/**
 * Descarga la solución semanal, descomprime el `.CRD` y extrae la coordenada
 * de una estación. Devuelve `null` si la estación no está en ese archivo
 * (las estaciones SIRGAS-CON no se incluyen; su solución la publica SIRGAS).
 */
export async function fetchIgacWeeklyCoord(
  name: string,
  stationId: string,
  signal?: AbortSignal,
): Promise<IgacWeeklyCoord | null> {
  const blob = await downloadIgacWeeklyZip(name, signal)
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  const crd = Object.keys(files).find((f) => f.toUpperCase().endsWith('.CRD'))
  if (!crd) return null
  const text = strFromU8(files[crd])
  const frame = text.match(/\b(IGS\d{2,}|ITRF\d{2,})\b/)?.[1] ?? '—'
  const epoch = text.match(/POCA:\s*([\d:\- ]+)/)?.[1]?.trim() ?? '—'
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/)
    if (p.length >= 5 && p[1] === stationId && /^-?\d/.test(p[2])) {
      return { frame, epoch, xyz: [Number(p[2]), Number(p[3]), Number(p[4])] }
    }
  }
  return null
}
