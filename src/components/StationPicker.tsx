import { useMemo, useRef, useState } from 'react'
import { ACTIVE_STATIONS, STATIONS, type GnssStation } from '../data/stations'

export function StationPicker({
  value,
  onChange,
  includeInactive = false,
}: {
  value: GnssStation | null
  onChange: (s: GnssStation) => void
  includeInactive?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const pool = includeInactive ? STATIONS : ACTIVE_STATIONS

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pool.slice(0, 30)
    return pool
      .filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q),
      )
      .slice(0, 30)
  }, [query, pool])

  return (
    <div ref={boxRef} className="relative">
      <input
        value={open ? query : value ? `${value.id} — ${value.name}, ${value.department}` : query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Estación: código, municipio o departamento"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {matches.map((s) => (
            <li key={s.id}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(s)
                  setOpen(false)
                  setQuery('')
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">{s.id}</span>
                <span className="text-slate-500">
                  {' '}
                  — {s.name}, {s.department} · orden {s.order}
                  {s.status === 'inactive' && ' · inactiva'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
