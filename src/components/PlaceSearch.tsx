import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceResult } from '../lib/geocoding'
import { CrosshairIcon } from './icons'

export function PlaceSearch({ onPick }: { onPick: (p: PlaceResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      setError(null)
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await searchPlaces(q, ctl.signal)
        setResults(r)
        setOpen(true)
      } catch {
        if (!ctl.signal.aborted) setError('No se pudo buscar. Reintenta.')
      } finally {
        if (!ctl.signal.aborted) setLoading(false)
      }
    }, 350)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(r: PlaceResult) {
    onPick(r)
    setQuery(r.detail ? `${r.label}, ${r.detail}` : r.label)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <CrosshairIcon
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Buscar lugar: p. ej. Universidad del Quindío, Armenia"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>
        )}
      </div>

      {open && (results.length > 0 || error) && (
        <ul className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {error && <li className="px-3 py-2 text-sm text-rose-600">{error}</li>}
          {results.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => pick(r)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">{r.label}</span>
                {r.detail && <span className="text-slate-500"> · {r.detail}</span>}
                {r.kind && <span className="block text-xs text-slate-400">{r.kind}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-400">
        Geocodificación por Photon / OpenStreetMap · resultado aproximado
      </p>
    </div>
  )
}
