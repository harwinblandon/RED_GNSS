import { useState } from 'react'
import { CrosshairIcon } from './icons'
import type { LatLon } from '../lib/geodesy'

/**
 * Botón "Usar mi ubicación" — toma la posición del GPS del dispositivo.
 * Útil en campo: se abre la app estando en el punto y se consulta directo.
 */
export function LocateButton({
  onLocate,
  className = '',
}: {
  onLocate: (p: LatLon) => void
  className?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function locate() {
    if (!('geolocation' in navigator)) {
      setError('Este dispositivo no permite ubicación.')
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false)
        onLocate({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      (err) => {
        setLoading(false)
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado.'
            : 'No se pudo obtener la ubicación.',
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={locate}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <CrosshairIcon width={16} height={16} />
        {loading ? 'Ubicando…' : 'Usar mi ubicación'}
      </button>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
