/**
 * Modelos normativos del IGAC para tiempo de ocupación en posicionamiento
 * GNSS estático diferencial.
 *
 * Fuentes:
 *  - Resolución IGAC 1468 de 2021 — "Red Geodésica Nacional".
 *    https://redgeodesica.igac.gov.co/documentos/resolucion_1468_de_2021.pdf
 *  - Guía metodológica para la obtención de alturas a partir de datos GNSS (IGAC, S. W. León).
 *    https://redgeodesica.igac.gov.co/documentos/GUIA_METODOLOGICA_PARA_LA_OBTENCION_DE_ALTURAS_A_PARTIR_DE%20DATOS_GNSS_SWLEON.pdf
 */

export type NormMode = 'alturas' | 'res1468'

/* -------------------------------------------------------------------------- */
/*  Modelo 1: Guía metodológica de alturas GNSS  (t = 15 + k·d)               */
/* -------------------------------------------------------------------------- */

export interface AlturasResult {
  minutes: number
  ratePerKm: number
  /** Se aplicó el piso normativo de 18 min. */
  flooredTo18: boolean
  /** La línea base supera los 20 km recomendados. */
  exceedsRecommendedBaseline: boolean
}

/**
 * Tiempo de rastreo según la guía de alturas:
 *  - 15 min mínimos sobre el punto (tras estabilización y con ≥ 4 satélites).
 *  - + 5 min por cada km de distancia a la base (3 min/km si la configuración
 *    del sistema es excelente).
 *  - Nunca menos de 18 min.
 *  - Evitar líneas base > 20 km.
 */
export function occupationTimeAlturas(
  baselineKm: number,
  opts: { excellentConfig?: boolean } = {},
): AlturasResult {
  const ratePerKm = opts.excellentConfig ? 3 : 5
  const raw = 15 + ratePerKm * Math.max(0, baselineKm)
  const minutes = Math.max(18, raw)
  return {
    minutes,
    ratePerKm,
    flooredTo18: raw < 18,
    exceedsRecommendedBaseline: baselineKm > 20,
  }
}

/* -------------------------------------------------------------------------- */
/*  Modelo 2: Resolución 1468 de 2021  (por orden del vértice a establecer)   */
/* -------------------------------------------------------------------------- */

export interface OrderSpec {
  order: 0 | 1 | 2 | 3 | 4
  label: string
  /** Rango de tiempo de medición continua, en minutos. */
  minMinutes: number
  maxMinutes: number
  /** Texto normativo del rango de tiempo. */
  timeText: string
  /** Nº mínimo de vértices de orden superior con medición simultánea. */
  simultaneousVertices: number
  software: 'Científico' | 'Científico o comercial' | 'Comercial'
  /** Nota de precisión aproximada (según la resolución). */
  precisionNote: string
  permanent: boolean
}

const HOUR = 60
const DAY = 24 * HOUR

export const ORDER_SPECS: OrderSpec[] = [
  {
    order: 0,
    label: 'Orden 0 — Estación de operación continua (marco de referencia)',
    minMinutes: 90 * DAY,
    maxMinutes: 90 * DAY,
    timeText: '24 h continuas durante un periodo ≥ 3 meses',
    simultaneousVertices: 0,
    software: 'Científico',
    precisionNote: 'Nivel milimétrico; equipo registrado ante IGS y NOAA, antena tipo choke ring.',
    permanent: true,
  },
  {
    order: 1,
    label: 'Orden 1 — Estación continua (en validación) / red semilibre',
    minMinutes: 30 * DAY,
    maxMinutes: 30 * DAY,
    timeText: '24 h continuas durante un periodo ≥ 30 días',
    simultaneousVertices: 0,
    software: 'Científico',
    precisionNote: 'Ajuste de red semilibre (loosely constrained) con efemérides precisas IGS y ERP.',
    permanent: true,
  },
  {
    order: 2,
    label: 'Orden 2 — Base para densificación de orden 3',
    minMinutes: 1 * DAY,
    maxMinutes: 10 * DAY,
    timeText: 'Medición continua > 24 h y < 10 días, simultánea',
    simultaneousVertices: 2,
    software: 'Científico',
    precisionNote: 'Precisión relativa de la posición vertical (2σ): 0,015 m.',
    permanent: false,
  },
  {
    order: 3,
    label: 'Orden 3 — Base para densificación de orden 4',
    minMinutes: 8 * HOUR,
    maxMinutes: 24 * HOUR,
    timeText: 'Medición continua > 8 h y ≤ 24 h, simultánea',
    simultaneousVertices: 2,
    software: 'Científico o comercial',
    precisionNote: 'Precisión relativa de la posición vertical (1σ): 0,045 m.',
    permanent: false,
  },
  {
    order: 4,
    label: 'Orden 4 — Base para control topográfico y cartografía',
    minMinutes: 1 * HOUR,
    maxMinutes: 8 * HOUR,
    timeText: 'Medición entre 1 h y 8 h, simultánea',
    simultaneousVertices: 2,
    software: 'Comercial',
    precisionNote: 'Precisión absoluta de la posición horizontal (1σ): 0,070 m.',
    permanent: false,
  },
]

export function orderSpec(order: OrderSpec['order']): OrderSpec {
  const spec = ORDER_SPECS.find((s) => s.order === order)
  if (!spec) throw new Error(`Orden geodésico no válido: ${order}`)
  return spec
}

/** Parámetros de captura comunes a la Resolución 1468 de 2021. */
export const CAPTURE_PARAMS = {
  elevationMaskDeg: { min: 0, max: 10 },
  clearHorizonDeg: 5,
  recordingIntervalSec: 1,
  resamplingSec: [15, 30],
} as const
