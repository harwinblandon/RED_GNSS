import { useEffect, useRef, useState } from 'react'
import { searchPlaces, searchPlacesNominatim, withTimeout, type PlaceResult } from '../lib/geocoding'
import { CrosshairIcon } from './icons'

type Status = 'idle' | 'loading' | 'done' | 'empty' | 'error' | 'slow'

/**
 * Buscador de lugares. Mientras se escribe sugiere con Photon (a veces lento);
 * Enter o el botón buscan con Nominatim (rápido). Un segundo Enter elige el
 * primer resultado.
 */
export function PlaceSearch({ onPick }: { onPick: (p: PlaceResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [searchedFor, setSearchedFor] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const ctlRef = useRef<AbortController | null>(null)
  const typedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function run(q: string, engine: 'photon' | 'nominatim') {
    ctlRef.current?.abort()
    const ctl = new AbortController()
    ctlRef.current = ctl
    setStatus('loading')
    setOpen(true)
    try {
      const search = engine === 'photon' ? searchPlaces(q, ctl.signal) : searchPlacesNominatim(q, ctl.signal)
      const r = await withTimeout(search, 8000, ctl)
      if (ctlRef.current !== ctl) return
      setResults(r)
      setSearchedFor(q)
      setStatus(r.length ? 'done' : 'empty')
    } catch {
      if (ctlRef.current !== ctl) return
      setStatus(ctl.signal.aborted ? 'slow' : 'error')
    }
  }

  // Sugerencias mientras se escribe (tras una pausa).
  useEffect(() => {
    if (!typedRef.current) return
    const q = query.trim()
    if (q.length < 3) return
    timerRef.current = setTimeout(() => run(q, 'photon'), 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('mousedown', onClick)
      ctlRef.current?.abort()
    }
  }, [])

  function pick(r: PlaceResult) {
    ctlRef.current?.abort()
    typedRef.current = false
    onPick(r)
    setQuery(r.detail ? `${r.label}, ${r.detail}` : r.label)
    setOpen(false)
    setStatus('idle')
  }

  function submit() {
    const q = query.trim()
    if (q.length < 3) return
    // La búsqueda explícita manda: se anula la sugerencia automática pendiente.
    if (timerRef.current) clearTimeout(timerRef.current)
    if (status === 'done' && searchedFor === q && results[0]) pick(results[0])
    else run(q, 'nominatim')
  }

  const short = query.trim().length < 3
  const message = short
    ? null
    : status === 'loading'
      ? 'Buscando…'
      : status === 'empty'
        ? 'Sin resultados en Colombia. Prueba con el municipio o el departamento.'
        : status === 'slow'
          ? 'El servicio tarda en responder. Pulsa Enter o «Buscar» para intentarlo de nuevo.'
          : status === 'error'
            ? 'No se pudo buscar. Revisa la conexión e inténtalo de nuevo.'
            : null
  const shown = short || status === 'loading' ? [] : results

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <CrosshairIcon
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => {
              typedRef.current = true
              setQuery(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') setOpen(false)
            }}
            onFocus={() => (shown.length > 0 || message) && setOpen(true)}
            placeholder="Buscar lugar: p. ej. Universidad del Quindío, Armenia"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={short || status === 'loading'}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {status === 'loading' ? '…' : 'Buscar'}
        </button>
      </div>

      {open && (shown.length > 0 || message) && (
        <ul className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {message && (
            <li className={`px-3 py-2 text-sm ${status === 'error' ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>
              {message}
            </li>
          )}
          {shown.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => pick(r)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${i === 0 ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">{r.label}</span>
                {r.detail && <span className="text-slate-500"> · {r.detail}</span>}
                {r.kind && <span className="block text-xs text-slate-400">{r.kind}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-400">Búsqueda en OpenStreetMap · Enter para buscar · ubicación aproximada</p>
    </div>
  )
}
