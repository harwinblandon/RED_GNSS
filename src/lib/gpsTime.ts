/**
 * Utilidades de tiempo GPS.
 *
 * La época GPS es 1980-01-06 00:00:00 UTC. Para efectos de calendario
 * (semana GPS / día de la semana / DOY, tal como se usan en los nombres de
 * archivos IGS/RINEX) se ignoran los segundos intercalares: se trabaja con
 * medianoche UTC de la fecha civil.
 */

export const GPS_EPOCH_UTC = Date.UTC(1980, 0, 6, 0, 0, 0)
const MS_PER_DAY = 86_400_000
const MS_PER_WEEK = 7 * MS_PER_DAY

export interface GpsTimeInfo {
  /** Fecha civil (medianoche UTC del día consultado). */
  date: Date
  /** Semana GPS continua (sin reinicio de 1024). */
  gpsWeek: number
  /** Semana GPS módulo 1024 (formato de 10 bits del mensaje de navegación). */
  gpsWeekRollover: number
  /** Día de la semana GPS: 0 = domingo … 6 = sábado. */
  dayOfWeek: number
  /** Segundos transcurridos desde el inicio de la semana GPS. */
  secondsOfWeek: number
  /** Día del año (DOY), 1–366. */
  dayOfYear: number
  /** Año civil (UTC). */
  year: number
  /** Fecha juliana. */
  julianDate: number
  /** Fecha juliana modificada (MJD = JD − 2400000.5). */
  modifiedJulianDate: number
  /** Identificador de sesión RINEX (a–x) según la hora UTC; 'x' si es día completo. */
  sessionLetter: string
}

const DOW_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function dayOfWeekLabel(dow: number): string {
  return DOW_LABELS[((dow % 7) + 7) % 7]
}

/** Fecha juliana a partir de un instante UTC (en ms desde el epoch Unix). */
export function julianDateFromMs(ms: number): number {
  return ms / MS_PER_DAY + 2_440_587.5
}

/** Día del año (1–366) para una fecha, en UTC. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.floor((current - start) / MS_PER_DAY) + 1
}

/** Letra de sesión RINEX (a=00h … x=23h UTC). */
export function sessionLetter(hourUtc: number): string {
  if (!Number.isFinite(hourUtc)) return 'x'
  const h = Math.max(0, Math.min(23, Math.floor(hourUtc)))
  return String.fromCharCode(97 + h)
}

/**
 * Deriva toda la información de tiempo GPS a partir de un instante.
 * Si `instant` no trae hora, se asume el día completo (letra de sesión 'x').
 */
export function gpsTimeFromDate(input: Date, opts?: { hourUtc?: number }): GpsTimeInfo {
  const year = input.getUTCFullYear()
  const month = input.getUTCMonth()
  const day = input.getUTCDate()
  const midnightUtc = Date.UTC(year, month, day)

  const elapsed = midnightUtc - GPS_EPOCH_UTC
  const gpsWeek = Math.floor(elapsed / MS_PER_WEEK)
  const dow = Math.floor((elapsed - gpsWeek * MS_PER_WEEK) / MS_PER_DAY)
  const hour = opts?.hourUtc
  const secondsOfWeek =
    dow * 86_400 + (typeof hour === 'number' ? Math.round(hour * 3600) : 0)

  const jd = julianDateFromMs(midnightUtc)
  const date = new Date(midnightUtc)

  return {
    date,
    gpsWeek,
    gpsWeekRollover: gpsWeek % 1024,
    dayOfWeek: dow,
    secondsOfWeek,
    dayOfYear: dayOfYear(date),
    year,
    julianDate: jd,
    modifiedJulianDate: jd - 2_400_000.5,
    sessionLetter: typeof hour === 'number' ? sessionLetter(hour) : 'x',
  }
}

/** Convierte semana GPS + día de la semana a fecha civil (medianoche UTC). */
export function dateFromGpsWeek(gpsWeek: number, dayOfWeek = 0): Date {
  return new Date(GPS_EPOCH_UTC + gpsWeek * MS_PER_WEEK + dayOfWeek * MS_PER_DAY)
}

/** Convierte año + día del año a fecha civil (medianoche UTC). */
export function dateFromDoy(year: number, doy: number): Date {
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * MS_PER_DAY)
}

/** Formatea una fecha como YYYY-MM-DD (UTC). */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
