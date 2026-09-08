/**
 * Enlaces y disponibilidad de las soluciones de coordenadas de las estaciones:
 * SIRGAS (semanales y multianuales) e IGAC (soluciones semanales `.CRD`).
 *
 * Las páginas de SIRGAS tienen protección anti-bot; se abren con enlaces
 * directos (el navegador del usuario pasa la verificación). La lista de
 * soluciones semanales del IGAC sí es consultable (CORS abierto), pero el
 * archivo `.CRD` no tiene descarga pública directa conocida.
 */
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
