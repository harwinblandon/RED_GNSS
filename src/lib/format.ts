/** Formatea una duración en minutos a un texto legible (p. ej. "2 h 15 min"). */
export function formatMinutes(totalMinutes: number): string {
  const mins = Math.round(totalMinutes)
  if (mins < 60) return `${mins} min`
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const rem = mins % 60
  const parts: string[] = []
  if (days) parts.push(`${days} d`)
  if (hours) parts.push(`${hours} h`)
  if (rem) parts.push(`${rem} min`)
  return parts.join(' ')
}

/** Coordenada decimal a grados-minutos-segundos con hemisferio. */
export function formatDms(value: number, axis: 'lat' | 'lon'): string {
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  const d = Math.floor(abs)
  const mFloat = (abs - d) * 60
  const m = Math.floor(mFloat)
  const s = (mFloat - m) * 60
  const hemi = axis === 'lat' ? (sign < 0 ? 'S' : 'N') : sign < 0 ? 'W' : 'E'
  return `${d}° ${String(m).padStart(2, '0')}' ${s.toFixed(3).padStart(6, '0')}" ${hemi}`
}

export function formatDecimal(value: number, decimals = 6): string {
  return value.toFixed(decimals)
}
