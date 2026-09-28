/**
 * Histórico de disponibilidad de datos RINEX por estación.
 *
 * Fuente: `public/stations-history.json`, generado a diario por
 * `scripts/status-snapshot.py` (GitHub Action) a partir del listado de archivos
 * del IGAC. Cada estación trae un mapa de bits en hexadecimal: un bit por día
 * desde `start`, 1 = hay archivo de observación ese día.
 *
 * El IGAC publica con 3–5 días de latencia, así que los últimos días aparecen
 * vacíos en toda la red. Para no leerlos como caídas se calcula un "horizonte":
 * el último día que ya publicó la mayoría de estaciones. Lo posterior queda
 * como pendiente de publicación y no cuenta en porcentajes ni alertas.
 */

export interface HistoryFile {
  generated: string
  start: string
  days: number
  stations: Record<string, string>
}

export interface NetworkHistory {
  generated: string
  /** Fechas ISO, una por día del histórico. */
  dates: string[]
  /** Índice del último día considerado publicado (horizonte). */
  horizon: number
  /** Días con dato por estación (true = hay observación). */
  stations: Record<string, boolean[]>
  /** Fracción de estaciones con dato por día (0–1). */
  coverage: number[]
  /** Estaciones con algún dato en el histórico (base de la cobertura). */
  alive: number
}

export type DayState = 'data' | 'gap' | 'pending' | 'before'

/** Días de hueco a partir de los cuales se considera caída (no retraso). */
const OUTAGE_DAYS = 3
/** Por encima de esto la estación se considera fuera de servicio. */
const LONG_OUTAGE_DAYS = 30
/** Fracción mínima de la red con dato para dar un día por publicado. */
const HORIZON_COVERAGE = 0.5

export async function loadHistory(): Promise<NetworkHistory | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}stations-history.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    return decodeHistory((await res.json()) as HistoryFile)
  } catch {
    return null
  }
}

export function decodeHistory(file: HistoryFile): NetworkHistory {
  const start = new Date(file.start + 'T00:00:00Z').getTime()
  const dates = Array.from({ length: file.days }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  )

  const stations: Record<string, boolean[]> = {}
  for (const [id, hex] of Object.entries(file.stations)) {
    const bits: boolean[] = new Array(file.days)
    for (let i = 0; i < file.days; i++) {
      const nibble = parseInt(hex[i >> 2] ?? '0', 16)
      bits[i] = ((nibble >> (3 - (i & 3))) & 1) === 1
    }
    stations[id] = bits
  }

  // Cobertura: sobre las estaciones que tuvieron algún dato en el último año.
  const alive = Object.values(stations).filter((b) => b.some(Boolean))
  const coverage = dates.map((_, i) =>
    alive.length ? alive.reduce((n, b) => n + (b[i] ? 1 : 0), 0) / alive.length : 0,
  )

  let horizon = dates.length - 1
  while (horizon > 0 && coverage[horizon] < HORIZON_COVERAGE) horizon--

  return { generated: file.generated, dates, horizon, stations, coverage, alive: alive.length }
}

export function dayState(bits: boolean[], i: number, horizon: number, first: number): DayState {
  if (i < first) return 'before'
  if (bits[i]) return 'data'
  return i > horizon ? 'pending' : 'gap'
}

/* ------------------------------ métricas ------------------------------- */

export interface StationStats {
  /** Primer día con dato dentro del histórico (−1 si nunca). */
  first: number
  /** Último día con dato (−1 si nunca). */
  last: number
  /** Porcentaje de días con dato en la ventana (0–100), o null sin datos. */
  pct: Record<30 | 90 | 365, number | null>
  /** Días seguidos sin dato hasta el horizonte. */
  currentGap: number
  /** Hueco más largo dentro del histórico (días) y su inicio. */
  longestGap: { days: number; from: number }
  /** Número de huecos (rachas sin dato) en los últimos 30 días. */
  gaps30: number
}

export function stationStats(bits: boolean[], horizon: number): StationStats {
  const first = bits.indexOf(true)
  const last = bits.lastIndexOf(true)

  const pct = { 30: null, 90: null, 365: null } as StationStats['pct']
  for (const w of [30, 90, 365] as const) {
    const from = Math.max(horizon - w + 1, first, 0)
    if (first < 0 || from > horizon) continue
    let n = 0
    for (let i = from; i <= horizon; i++) if (bits[i]) n++
    pct[w] = (100 * n) / (horizon - from + 1)
  }

  let currentGap = 0
  for (let i = horizon; i >= 0 && !bits[i]; i--) currentGap++

  const longestGap = { days: 0, from: -1 }
  let run = 0
  for (let i = Math.max(first, 0); i <= horizon && first >= 0; i++) {
    if (bits[i]) {
      run = 0
      continue
    }
    run++
    if (run > longestGap.days) {
      longestGap.days = run
      longestGap.from = i - run + 1
    }
  }

  let gaps30 = 0
  for (let i = Math.max(horizon - 29, first, 1); i <= horizon && first >= 0; i++) {
    if (!bits[i] && bits[i - 1]) gaps30++
  }

  return { first, last, pct, currentGap, longestGap, gaps30 }
}

/* ------------------------------- alertas ------------------------------- */

export type AlertKind = 'outage' | 'down' | 'flaky' | 'recovered'

export interface StationAlert {
  id: string
  kind: AlertKind
  /** Resumen en una línea. */
  text: string
  /** Para ordenar dentro del grupo (más relevante primero). */
  weight: number
}

export const ALERT_LABEL: Record<AlertKind, string> = {
  outage: 'Caída reciente',
  down: 'Fuera de servicio',
  flaky: 'Intermitente',
  recovered: 'Recuperada',
}

export const ALERT_HELP: Record<AlertKind, string> = {
  outage: `Sin datos entre ${OUTAGE_DAYS} y ${LONG_OUTAGE_DAYS} días, después de haber estado publicando.`,
  down: `Más de ${LONG_OUTAGE_DAYS} días sin datos.`,
  flaky: 'Publica, pero con menos del 80 % de los días en el último mes.',
  recovered: `Volvió a publicar en las últimas dos semanas tras un hueco de ${OUTAGE_DAYS} días o más.`,
}

export function stationAlert(
  id: string,
  bits: boolean[],
  st: StationStats,
  dates: string[],
  horizon: number,
): StationAlert | null {
  if (st.first < 0) return null

  if (st.currentGap > LONG_OUTAGE_DAYS) {
    return { id, kind: 'down', text: `Último dato ${dates[st.last]}`, weight: -st.currentGap }
  }
  if (st.currentGap >= OUTAGE_DAYS) {
    return {
      id,
      kind: 'outage',
      text: `${st.currentGap} días sin datos · último ${dates[st.last]}`,
      weight: -st.currentGap,
    }
  }

  const gap = lastClosedGap(bits, st, horizon)
  if (gap && gap.days >= OUTAGE_DAYS && horizon - gap.end <= 14) {
    return {
      id,
      kind: 'recovered',
      text: `Tras ${gap.days} días sin datos (${dates[gap.end - gap.days + 1]} a ${dates[gap.end]})`,
      weight: -gap.end,
    }
  }

  const p30 = st.pct[30]
  if (p30 != null && p30 < 80) {
    return {
      id,
      kind: 'flaky',
      text: `${Math.round(p30)} % de días con dato en 30 d · ${st.gaps30} huecos`,
      weight: p30,
    }
  }
  return null
}

/** Último hueco ya cerrado (seguido de datos) antes del horizonte. */
function lastClosedGap(
  bits: boolean[],
  st: StationStats,
  horizon: number,
): { days: number; end: number } | null {
  let i = horizon - st.currentGap
  while (i >= st.first && bits[i]) i--
  if (i < st.first) return null
  const end = i
  while (i >= st.first && !bits[i]) i--
  return { days: end - i, end }
}

/** Alertas de toda la red, agrupadas por tipo y ordenadas. */
export function networkAlerts(h: NetworkHistory, ids: string[]): StationAlert[] {
  const out: StationAlert[] = []
  for (const id of ids) {
    const bits = h.stations[id]
    if (!bits) continue
    const a = stationAlert(id, bits, stationStats(bits, h.horizon), h.dates, h.horizon)
    if (a) out.push(a)
  }
  const order: AlertKind[] = ['outage', 'flaky', 'recovered', 'down']
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.weight - b.weight)
}
