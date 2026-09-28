import { useId, useState, type ReactNode } from 'react'
import { dayState, type DayState } from '../lib/availability'

/*
 * Gráficos del histórico de disponibilidad. Un día con dato es tinta gris
 * (lo normal no debe llamar la atención); un hueco es rosa; los días aún no
 * publicados por el IGAC van rayados. Siempre con leyenda y tooltip.
 */

const STATE_CLASS: Record<DayState, string> = {
  data: 'fill-brand-400 dark:fill-slate-500',
  gap: 'fill-rose-500 dark:fill-rose-400',
  pending: '',
  before: 'fill-slate-100 dark:fill-slate-800',
}

const STATE_LABEL: Record<DayState, string> = {
  data: 'Con datos',
  gap: 'Sin datos',
  pending: 'Pendiente de publicación',
  before: 'Antes del primer dato',
}

function Hatch({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" className="fill-slate-100 dark:fill-slate-800" />
        <line x1="0" y1="0" x2="0" y2="4" strokeWidth="1.5" className="stroke-slate-300 dark:stroke-slate-600" />
      </pattern>
    </defs>
  )
}

function Tooltip({ x, children }: { x: number; children: ReactNode }) {
  // x en fracción (0–1) del ancho; se ancla al lado que tenga sitio.
  const left = x < 0.6
  return (
    <div
      className="pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
      style={left ? { left: `${x * 100}%` } : { right: `${(1 - x) * 100}%` }}
    >
      {children}
    </div>
  )
}

export function Legend({ pending = true }: { pending?: boolean }) {
  const hatch = useId()
  const items: DayState[] = pending ? ['data', 'gap', 'pending'] : ['data', 'gap']
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true">
            {s === 'pending' && <Hatch id={hatch} />}
            <rect
              width="10"
              height="10"
              rx="2"
              className={STATE_CLASS[s]}
              fill={s === 'pending' ? `url(#${hatch})` : undefined}
            />
          </svg>
          {STATE_LABEL[s]}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------- franja ------------------------------- */

/**
 * Franja de días [from, to] de una estación. Las rachas del mismo estado se
 * dibujan como un solo rectángulo; el tooltip sale de la posición del cursor.
 */
export function AvailabilityStrip({
  bits,
  dates,
  horizon,
  from,
  to,
  first,
  height = 14,
}: {
  bits: boolean[]
  dates: string[]
  horizon: number
  from: number
  to: number
  first: number
  height?: number
}) {
  const hatch = useId()
  const [hover, setHover] = useState<number | null>(null)
  const n = to - from + 1

  const runs: { start: number; len: number; state: DayState }[] = []
  for (let i = from; i <= to; i++) {
    const st = dayState(bits, i, horizon, first < 0 ? Infinity : first)
    const prev = runs[runs.length - 1]
    if (prev && prev.state === st) prev.len++
    else runs.push({ start: i, len: 1, state: st })
  }

  return (
    <div
      className="relative"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const k = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)))
        setHover(from + k)
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${n} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label={`Disponibilidad del ${dates[from]} al ${dates[to]}`}
      >
        <Hatch id={hatch} />
        {runs.map((r) => (
          <rect
            key={r.start}
            x={r.start - from}
            width={r.len}
            height={height}
            className={STATE_CLASS[r.state]}
            fill={r.state === 'pending' ? `url(#${hatch})` : undefined}
          />
        ))}
        {hover != null && (
          <rect x={hover - from} width={1} height={height} className="fill-slate-900/40 dark:fill-white/50" />
        )}
      </svg>
      {hover != null && (
        <Tooltip x={(hover - from + 0.5) / n}>
          <span className="tabular font-medium">{dates[hover]}</span> ·{' '}
          {STATE_LABEL[dayState(bits, hover, horizon, first < 0 ? Infinity : first)]}
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------- calendario anual ---------------------------- */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['L', '', 'X', '', 'V', '', '']

/** Calendario tipo "contribuciones": columnas = semanas (lunes a domingo). */
export function AvailabilityCalendar({
  bits,
  dates,
  horizon,
  first,
}: {
  bits: boolean[]
  dates: string[]
  horizon: number
  first: number
}) {
  const hatch = useId()
  const [hover, setHover] = useState<number | null>(null)
  const CELL = 11
  const GAP = 2
  const STEP = CELL + GAP
  const LEFT = 16
  const TOP = 14

  // Día de la semana (0 = lunes) del primer día del histórico.
  const offset = (new Date(dates[0] + 'T00:00:00Z').getUTCDay() + 6) % 7
  const weeks = Math.ceil((dates.length + offset) / 7)
  const width = LEFT + weeks * STEP
  const height = TOP + 7 * STEP

  const pos = (i: number) => {
    const k = i + offset
    return { col: Math.floor(k / 7), row: k % 7 }
  }

  const monthLabels: { col: number; label: string }[] = []
  dates.forEach((d, i) => {
    if (d.endsWith('-01') || i === 0) {
      const { col } = pos(i)
      const last = monthLabels[monthLabels.length - 1]
      if (!last || col - last.col >= 3) monthLabels.push({ col, label: MONTHS[Number(d.slice(5, 7)) - 1] })
    }
  })

  const firstIdx = first < 0 ? Infinity : first

  return (
    <div className="relative overflow-x-auto">
      <svg
        width={width}
        height={height}
        className="block"
        role="img"
        aria-label={`Calendario de disponibilidad del ${dates[0]} al ${dates[dates.length - 1]}`}
        onMouseLeave={() => setHover(null)}
      >
        <Hatch id={hatch} />
        {monthLabels.map((m) => (
          <text key={m.col} x={LEFT + m.col * STEP} y={9} className="fill-slate-500 text-[9px] dark:fill-slate-400">
            {m.label}
          </text>
        ))}
        {WEEKDAYS.map((w, r) =>
          w ? (
            <text key={r} x={0} y={TOP + r * STEP + 9} className="fill-slate-400 text-[9px]">
              {w}
            </text>
          ) : null,
        )}
        {dates.map((_, i) => {
          const { col, row } = pos(i)
          const st = dayState(bits, i, horizon, firstIdx)
          return (
            <rect
              key={i}
              x={LEFT + col * STEP}
              y={TOP + row * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              className={`${STATE_CLASS[st]} ${hover === i ? 'stroke-slate-900 dark:stroke-white' : ''}`}
              strokeWidth={hover === i ? 1.5 : 0}
              fill={st === 'pending' ? `url(#${hatch})` : undefined}
              onMouseEnter={() => setHover(i)}
            />
          )
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          style={{
            left: Math.min(LEFT + pos(hover).col * STEP, width - 180),
            top: TOP + pos(hover).row * STEP - 28,
          }}
        >
          <span className="tabular font-medium">{dates[hover]}</span> ·{' '}
          {STATE_LABEL[dayState(bits, hover, horizon, firstIdx)]}
        </div>
      )}
    </div>
  )
}

/* --------------------- cobertura diaria de la red ---------------------- */

/** Barras: porcentaje de estaciones con dato cada día. Una sola serie. */
export function CoverageChart({
  coverage,
  dates,
  horizon,
  from,
  to,
  total,
}: {
  coverage: number[]
  dates: string[]
  horizon: number
  from: number
  to: number
  total: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = to - from + 1
  const W = 1000
  const H = 160
  const PAD_L = 34
  const PAD_B = 18
  const plotW = W - PAD_L
  const plotH = H - PAD_B - 6
  const bw = plotW / n
  const gap = n <= 120 ? Math.min(2, bw * 0.25) : 0
  const y = (v: number) => 6 + plotH * (1 - v)

  const ticks: number[] = []
  const tickEvery = n <= 31 ? 7 : n <= 120 ? 14 : 61
  for (let i = to; i >= from; i -= tickEvery) ticks.push(i)

  return (
    <div
      className="relative"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width) * W - PAD_L
        if (px < 0) return setHover(null)
        setHover(from + Math.min(n - 1, Math.floor(px / bw)))
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-44 w-full" preserveAspectRatio="none" role="img"
        aria-label="Porcentaje de estaciones con datos por día">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {Array.from({ length: n }, (_, k) => {
          const i = from + k
          const pending = i > horizon
          const v = coverage[i]
          const x = PAD_L + k * bw + gap / 2
          const h = Math.max(0, plotH * v)
          return pending ? (
            <rect key={i} x={x} y={y(1)} width={bw - gap} height={plotH}
              className="fill-none stroke-slate-300 dark:stroke-slate-600" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : (
            <rect key={i} x={x} y={y(v)} width={bw - gap} height={h}
              className={hover === i ? 'fill-slate-900 dark:fill-white' : 'fill-brand-400 dark:fill-slate-500'} />
          )
        })}
      </svg>
      {/* Etiquetas en HTML para que no se deformen con el SVG estirado */}
      <div className="pointer-events-none absolute inset-0">
        {[0, 0.5, 1].map((v) => (
          <span key={v} className="tabular absolute left-0 -translate-y-1/2 text-[10px] text-slate-400"
            style={{ top: `${(y(v) / H) * 100}%` }}>
            {v * 100} %
          </span>
        ))}
        {ticks.map((i) => (
          <span key={i}
            className={`tabular absolute bottom-0 whitespace-nowrap text-[10px] text-slate-400 ${i === to ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${((PAD_L + (i - from + 0.5) * bw) / W) * 100}%` }}>
            {dates[i].slice(5)}
          </span>
        ))}
      </div>
      {hover != null && (
        <Tooltip x={(PAD_L + (hover - from + 0.5) * bw) / W}>
          <span className="tabular font-medium">{dates[hover]}</span> ·{' '}
          {hover > horizon
            ? 'pendiente de publicación'
            : `${Math.round(coverage[hover] * 100)} % (${Math.round(coverage[hover] * total)} de ${total} estaciones)`}
        </Tooltip>
      )}
    </div>
  )
}
