/**
 * Estado operativo de las estaciones: qué tan recientes son sus datos RINEX.
 *
 * La API del IGAC no expone la fecha del último dato; hay que deducirla del
 * listado de archivos (`/api/rinex?id=<tId>`), que puede pesar varios MB por
 * estación. Por eso:
 *   - Se consulta bajo demanda (al abrir una estación) y en lotes pequeños.
 *   - Se cachea en localStorage con vencimiento.
 *   - Si existe `public/stations-status.json` (generado por una GitHub Action)
 *     se usa como estado inicial de toda la red sin coste de red.
 */
import { dateFromDoy, isoDate } from './gpsTime'

const RINEX_API = 'https://ccg.igac.gov.co/api/rinex'
const CACHE_KEY = 'gnss-igac-latency-v1'
const CACHE_TTL_MS = 12 * 3600 * 1000

export type FreshLevel = 'ok' | 'warn' | 'stale' | 'unknown'

export interface StationLatency {
  tId: number
  lastDate: string | null
  fileCount: number
  checkedAt: string
  source: 'api' | 'snapshot' | 'cache'
}

export function classify(lastDate: string | null, today = new Date()): FreshLevel {
  if (!lastDate) return 'unknown'
  const days = Math.round((today.getTime() - new Date(lastDate + 'T00:00:00Z').getTime()) / 86_400_000)
  if (days <= 7) return 'ok'
  if (days <= 20) return 'warn'
  return 'stale'
}

export function daysSince(lastDate: string | null, today = new Date()): number | null {
  if (!lastDate) return null
  return Math.round((today.getTime() - new Date(lastDate + 'T00:00:00Z').getTime()) / 86_400_000)
}

/* --------------------------------- caché ---------------------------------- */

type CacheShape = Record<string, StationLatency>

function readCache(): CacheShape {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as CacheShape
  } catch {
    return {}
  }
}

function writeCache(cache: CacheShape) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* almacenamiento no disponible */
  }
}

export function getCached(tId: number): StationLatency | null {
  const hit = readCache()[String(tId)]
  if (!hit) return null
  if (Date.now() - new Date(hit.checkedAt).getTime() > CACHE_TTL_MS) return null
  return { ...hit, source: 'cache' }
}

/* ----------------------------- consulta a la API ------------------------- */

// Coincide con  "año":YYYY,"dia_del_año":"DDD"   (el punto cubre la ñ)
const DATE_RE = /"a.o":(\d{4}),"dia_del_a.o":"(\d{1,3})"/g

/** Descarga el listado de archivos de una estación y extrae la fecha más reciente. */
export async function fetchLatency(tId: number, signal?: AbortSignal): Promise<StationLatency> {
  const res = await fetch(`${RINEX_API}?id=${tId}`, { signal })
  if (!res.ok) throw new Error(`IGAC: HTTP ${res.status}`)
  const text = await res.text()

  let best = -1
  let count = 0
  for (const m of text.matchAll(DATE_RE)) {
    count++
    const key = Number(m[1]) * 1000 + Number(m[2])
    if (key > best) best = key
  }

  let lastDate: string | null = null
  if (best > 0) {
    lastDate = isoDate(dateFromDoy(Math.floor(best / 1000), best % 1000))
  }

  const entry: StationLatency = {
    tId,
    lastDate,
    fileCount: count,
    checkedAt: new Date().toISOString(),
    source: 'api',
  }
  const cache = readCache()
  cache[String(tId)] = entry
  writeCache(cache)
  return entry
}

/* ------------------------- escaneo por lotes ----------------------------- */

export interface ScanProgress {
  done: number
  total: number
}

export async function scanMany(
  tIds: number[],
  opts: {
    concurrency?: number
    onResult: (r: StationLatency) => void
    onProgress?: (p: ScanProgress) => void
    signal?: AbortSignal
  },
): Promise<void> {
  const { concurrency = 5, onResult, onProgress, signal } = opts
  const queue = [...tIds]
  let done = 0

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) return
      const tId = queue.shift()!
      try {
        const cached = getCached(tId)
        const r = cached ?? (await fetchLatency(tId, signal))
        onResult(r)
      } catch {
        /* estación que falla: se ignora, quedará como desconocida */
      } finally {
        done++
        onProgress?.({ done, total: tIds.length })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tIds.length) }, worker))
}

/* --------------------------- snapshot precomputado ---------------------- */

export interface Snapshot {
  generated: string
  stations: Record<string, { lastDate: string | null; files?: number }>
}

/** Carga public/stations-status.json si existe (generado por GitHub Action). */
export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}stations-status.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as Snapshot
  } catch {
    return null
  }
}
