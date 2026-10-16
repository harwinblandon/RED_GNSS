import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Card, Field, Select } from './ui'
import {
  SYSTEMS,
  bestWindow,
  computeVisibility,
  formatMinuteOfDay,
  loadOrbits,
  pdopQuality,
  type DopSample,
  type GnssSystem,
  type ObservationWindow,
  type OrbitSet,
} from '../lib/satVisibility'
import { formatMinutes } from '../lib/format'

/*
 * Ventana horaria óptima: PDOP y satélites visibles a lo largo del día
 * (hora de Colombia), la mejor ventana para el tiempo de ocupación y el
 * skyplot. Dos gráficas apiladas con el mismo eje horario (nunca doble eje)
 * y un cursor compartido.
 */

const PDOP_MAX = 8
const MASKS = [0, 5, 10, 15, 20, 25, 30]

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export function SatelliteWindow({
  lat,
  lon,
  date,
  durationMin,
}: {
  lat: number
  lon: number
  date: string
  /** Tiempo de ocupación a cubrir con la ventana. */
  durationMin: number
}) {
  const [orbits, setOrbits] = useState<OrbitSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mask, setMask] = useState(10)
  const [systems, setSystems] = useState<GnssSystem[]>(['G', 'R', 'E', 'C'])
  const [fromH, setFromH] = useState(6)
  const [toH, setToH] = useState(18)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    loadOrbits().then(setOrbits, (e: Error) => setError(e.message))
  }, [])

  const samples = useMemo(
    () =>
      orbits && systems.length > 0
        ? computeVisibility(orbits.satellites, { lat, lon, date, maskDeg: mask, systems })
        : [],
    [orbits, lat, lon, date, mask, systems],
  )

  const fullDay = durationMin >= 24 * 60
  const best = useMemo(
    () => (fullDay ? null : bestWindow(samples, durationMin, fromH * 60, toH * 60)),
    [samples, durationMin, fromH, toH, fullDay],
  )

  const focus = hover ?? (best ? nearestIndex(samples, (best.startMinute + best.endMinute) / 2) : null)

  function toggleSystem(id: GnssSystem, on: boolean) {
    setSystems((prev) => SYSTEMS.map((s) => s.id).filter((s) => (s === id ? on : prev.includes(s))))
  }

  return (
    <Card>
      <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">Ventana horaria de observación</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Geometría satelital prevista en el punto para {date} (hora de Colombia, UTC−5). El
        trazado es teórico: no considera obstrucciones locales; súbele la máscara para simularlas.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <Field label="Máscara de elevación">
          <Select value={String(mask)} onChange={(e) => setMask(Number(e.target.value))}>
            {MASKS.map((m) => (
              <option key={m} value={m}>{m}°</option>
            ))}
          </Select>
        </Field>
        <Field label="Jornada desde">
          <Select value={String(fromH)} onChange={(e) => setFromH(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h} disabled={h >= toH}>{formatMinuteOfDay(h * 60)}</option>
            ))}
          </Select>
        </Field>
        <Field label="hasta">
          <Select value={String(toH)} onChange={(e) => setToH(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
              <option key={h} value={h} disabled={h <= fromH}>{formatMinuteOfDay(h * 60)}</option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Constelaciones</legend>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {SYSTEMS.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={systems.includes(s.id)}
                  onChange={(e) => toggleSystem(s.id, e.target.checked)}
                  className="size-4 accent-brand-600"
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {error && <p className="text-sm text-rose-600">No se pudieron cargar las órbitas: {error}</p>}
      {!orbits && !error && <p className="text-sm text-slate-500">Cargando órbitas…</p>}
      {orbits && systems.length === 0 && <p className="text-sm text-slate-500">Elige al menos una constelación.</p>}

      {samples.length > 0 && (
        <>
          <WindowSummary best={best} durationMin={durationMin} fullDay={fullDay} fromH={fromH} toH={toH} />

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_22rem]">
            <TimeCharts
              samples={samples}
              best={best}
              fromMin={fromH * 60}
              toMin={toH * 60}
              hover={hover}
              onHover={setHover}
            />
            {focus != null && <SkyPlot sample={samples[focus]} hovering={hover != null} />}
          </div>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Órbitas: {orbits!.source === 'celestrak' ? 'CelesTrak (en vivo)' : 'snapshot diario de CelesTrak'},
            elementos del {new Date(orbits!.generatedAt).toLocaleDateString('es-CO')}; propagación SGP4.
            DOP con un reloj por constelación. Calidad orientativa: PDOP ≤ 2 excelente, ≤ 4 buena,
            ≤ 6 aceptable.
          </p>
        </>
      )}
    </Card>
  )
}

function nearestIndex(samples: DopSample[], minute: number): number {
  if (samples.length < 2) return 0
  const step = samples[1].minute - samples[0].minute
  return Math.min(samples.length - 1, Math.max(0, Math.round(minute / step)))
}

function WindowSummary({
  best,
  durationMin,
  fullDay,
  fromH,
  toH,
}: {
  best: ObservationWindow | null
  durationMin: number
  fullDay: boolean
  fromH: number
  toH: number
}) {
  if (fullDay)
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        El tiempo de ocupación ({formatMinutes(durationMin)}) cubre el día completo: la hora de
        inicio no cambia la geometría promedio. Usa la gráfica para identificar tramos débiles.
      </p>
    )
  if (!best)
    return (
      <p className="text-sm text-rose-600">
        No cabe una ventana de {formatMinutes(durationMin)} con solución continua entre{' '}
        {formatMinuteOfDay(fromH * 60)} y {formatMinuteOfDay(toH * 60)}. Amplía la jornada o
        baja la máscara.
      </p>
    )
  const q = pdopQuality(best.maxPdop)
  const utc = (m: number) => formatMinuteOfDay(m + 5 * 60)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label={`Ventana recomendada (${formatMinutes(durationMin)})`}>
        {formatMinuteOfDay(best.startMinute)} – {formatMinuteOfDay(best.endMinute)}
        <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">COT</span>
      </Stat>
      <Stat label="En UTC">
        {utc(best.startMinute)} – {utc(best.endMinute)}
      </Stat>
      <Stat label="PDOP máximo · medio" note={q.label}>
        {best.maxPdop.toFixed(2)} · {best.meanPdop.toFixed(2)}
      </Stat>
      <Stat label="Satélites visibles (mínimo)">{best.minSats}</Stat>
    </div>
  )
}

function Stat({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold text-slate-900 dark:text-white">{children}</p>
      {note && <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{note}</p>}
    </div>
  )
}

/* ------------------------------ gráficas ------------------------------- */

const M = { left: 38, right: 8, top: 10, bottom: 24 }
const H_PDOP = 200
const H_SATS = 150

function TimeCharts({
  samples,
  best,
  fromMin,
  toMin,
  hover,
  onHover,
}: {
  samples: DopSample[]
  best: ObservationWindow | null
  fromMin: number
  toMin: number
  hover: number | null
  onHover: (i: number | null) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const iw = width - M.left - M.right
  const x = (minute: number) => M.left + (minute / 1440) * iw
  const maxSats = Math.max(4, ...samples.map((s) => s.visible.length))
  const satTop = Math.ceil((maxSats + 2) / 5) * 5

  // Escala adaptativa (hasta PDOP_MAX) para que la curva no quede aplastada.
  const worst = Math.max(0, ...samples.map((s) => s.pdop ?? 0))
  const pdopTop = Math.min(PDOP_MAX, Math.max(3, Math.ceil(worst + 0.5)))
  const pdopY = (p: number) => M.top + (1 - Math.min(p, pdopTop) / pdopTop) * (H_PDOP - M.top - M.bottom)
  const satY = (n: number) => M.top + (1 - n / satTop) * (H_SATS - M.top - M.bottom)

  const pdopPath = linePath(samples, x, (s) => (s.pdop == null ? null : pdopY(s.pdop)))
  const satPath = stepPath(samples, x, (s) => satY(s.visible.length))

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const minute = ((e.clientX - r.left - M.left) / iw) * 1440
    if (minute < 0 || minute > 1440) return onHover(null)
    onHover(nearestIndex(samples, minute))
  }

  const h = hover != null ? samples[hover] : null
  const hx = h ? x(h.minute) : 0

  const frame = (height: number, children: ReactNode, ticks: number[], fmt: (v: number) => string, y: (v: number) => number, label: string) => (
    <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={label}>
      {/* fuera de jornada */}
      <rect x={x(0)} y={M.top} width={x(fromMin) - x(0)} height={height - M.top - M.bottom} className="fill-slate-100 dark:fill-white/[0.04]" />
      <rect x={x(toMin)} y={M.top} width={x(1440) - x(toMin)} height={height - M.top - M.bottom} className="fill-slate-100 dark:fill-white/[0.04]" />
      {best && (
        <rect
          x={x(best.startMinute)}
          y={M.top}
          width={x(best.endMinute) - x(best.startMinute)}
          height={height - M.top - M.bottom}
          className="fill-brand-500/15 stroke-brand-500/50 dark:fill-slate-300/15 dark:stroke-slate-300/40"
          strokeWidth={1}
        />
      )}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1} />
          <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-xs tabular dark:fill-slate-400">
            {fmt(t)}
          </text>
        </g>
      ))}
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hh) => (
        <text
          key={hh}
          x={x(hh * 60)}
          y={height - 6}
          textAnchor="middle"
          className={`fill-slate-500 text-xs tabular dark:fill-slate-400 ${hh % 6 !== 0 ? 'max-sm:hidden' : ''}`}
        >
          {String(hh).padStart(2, '0')}h
        </text>
      ))}
      {children}
      {h && <line x1={hx} x2={hx} y1={M.top} y2={height - M.bottom} className="stroke-slate-900/50 dark:stroke-white/60" strokeWidth={1} />}
    </svg>
  )

  return (
    <div ref={ref} className="relative min-w-0 touch-none" onPointerMove={move} onPointerLeave={() => onHover(null)}>
      <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-400">PDOP</p>
      {frame(
        H_PDOP,
        <>
          <path d={pdopPath} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-slate-900 dark:stroke-slate-100" />
          {h?.pdop != null && <circle cx={hx} cy={pdopY(h.pdop)} r={4} strokeWidth={2} className="fill-slate-900 stroke-white dark:fill-slate-100 dark:stroke-[#1f2124]" />}
        </>,
        Array.from({ length: pdopTop + 1 }, (_, i) => i).filter((v) => pdopTop <= 4 || v % 2 === 0),
        (v) => (v === PDOP_MAX ? `≥${v}` : String(v)),
        pdopY,
        'PDOP a lo largo del día',
      )}
      <p className="mb-1 mt-4 text-sm font-medium text-slate-700 dark:text-slate-400">Satélites visibles</p>
      {frame(
        H_SATS,
        <>
          <path d={satPath} fill="none" strokeWidth={2} className="stroke-slate-900 dark:stroke-slate-100" />
          {h && <circle cx={hx} cy={satY(h.visible.length)} r={4} strokeWidth={2} className="fill-slate-900 stroke-white dark:fill-slate-100 dark:stroke-[#1f2124]" />}
        </>,
        ticksFor(satTop),
        String,
        satY,
        'Número de satélites visibles a lo largo del día',
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {best && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm border border-brand-500/50 bg-brand-500/15 dark:border-slate-300/40 dark:bg-slate-300/15" />
            Ventana recomendada
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-slate-100 dark:bg-white/[0.08]" />
          Fuera de jornada
        </span>
      </div>

      {h && (
        <div
          className="pointer-events-none absolute top-0 z-20 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1.5 text-xs text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          style={hx < width * 0.6 ? { left: hx + 10 } : { right: width - hx + 10 }}
        >
          <p className="tabular font-medium">
            {formatMinuteOfDay(h.minute)} COT · {formatMinuteOfDay(h.minute + 300)} UTC
          </p>
          <p className="tabular">
            PDOP {h.pdop?.toFixed(2) ?? '—'} · HDOP {h.hdop?.toFixed(2) ?? '—'} · VDOP {h.vdop?.toFixed(2) ?? '—'}
          </p>
          <p className="tabular">
            {h.visible.length} satélites ·{' '}
            {SYSTEMS.filter((s) => h.bySystem[s.id] > 0)
              .map((s) => `${s.id} ${h.bySystem[s.id]}`)
              .join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}

function ticksFor(top: number): number[] {
  const step = top <= 10 ? 2 : top <= 25 ? 5 : 10
  const out: number[] = []
  for (let v = 0; v <= top; v += step) out.push(v)
  return out
}

function linePath(samples: DopSample[], x: (m: number) => number, y: (s: DopSample) => number | null): string {
  let d = ''
  let pen = false
  for (const s of samples) {
    const yy = y(s)
    if (yy == null) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${x(s.minute).toFixed(1)},${yy.toFixed(1)}`
    pen = true
  }
  return d
}

function stepPath(samples: DopSample[], x: (m: number) => number, y: (s: DopSample) => number): string {
  let d = ''
  samples.forEach((s, i) => {
    const xx = x(s.minute).toFixed(1)
    const yy = y(s).toFixed(1)
    d += i === 0 ? `M${xx},${yy}` : `H${xx}V${yy}`
  })
  return d
}

/* ------------------------------- skyplot ------------------------------- */

function SkyPlot({ sample, hovering }: { sample: DopSample; hovering: boolean }) {
  const [pick, setPick] = useState<string | null>(null)
  const R = 100
  const C = 112
  const pos = (az: number, el: number) => {
    const r = ((90 - el) / 90) * R
    const a = (az * Math.PI) / 180
    return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) }
  }
  const picked = sample.visible.find((v) => v.sat.name === pick)

  return (
    <div className="mx-auto w-full max-w-88">
      <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-400">
        Cielo a las {formatMinuteOfDay(sample.minute)} COT{' '}
        <span className="font-normal">{hovering ? '' : '(mitad de la ventana)'}</span>
      </p>
      <svg viewBox="0 0 224 224" className="block w-full" role="img" aria-label="Skyplot de satélites visibles">
        {[0, 30, 60].map((el) => (
          <circle key={el} cx={C} cy={C} r={((90 - el) / 90) * R} fill="none" strokeWidth={1} className="stroke-slate-200 dark:stroke-slate-700" />
        ))}
        <line x1={C - R} x2={C + R} y1={C} y2={C} strokeWidth={1} className="stroke-slate-200 dark:stroke-slate-700" />
        <line x1={C} x2={C} y1={C - R} y2={C + R} strokeWidth={1} className="stroke-slate-200 dark:stroke-slate-700" />
        {[
          ['N', C, C - R - 4],
          ['E', C + R + 6, C + 3],
          ['S', C, C + R + 10],
          ['O', C - R - 6, C + 3],
        ].map(([t, xx, yy]) => (
          <text key={t as string} x={xx} y={yy} textAnchor="middle" className="fill-slate-500 text-[9px] font-medium dark:fill-slate-400">
            {t}
          </text>
        ))}
        {[30, 60].map((el) => (
          <text key={el} x={C + 2} y={C - ((90 - el) / 90) * R - 2} className="fill-slate-400 text-[7px] dark:fill-slate-500">
            {el}°
          </text>
        ))}
        {sample.visible.map((v) => {
          const p = pos(v.azDeg, v.elDeg)
          return (
            <g
              key={v.sat.name}
              onPointerEnter={() => setPick(v.sat.name)}
              onPointerLeave={() => setPick(null)}
              className="cursor-default"
            >
              <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={6.5} strokeWidth={1.5} className="fill-white stroke-slate-800 dark:fill-[#1f2124] dark:stroke-slate-200" />
              <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle" className="pointer-events-none fill-slate-800 text-[7px] font-semibold dark:fill-slate-200">
                {v.sat.system}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="tabular mt-1 min-h-8 text-center text-xs text-slate-500 dark:text-slate-400">
        {picked
          ? `${picked.sat.label} · Az ${picked.azDeg.toFixed(0)}° · El ${picked.elDeg.toFixed(0)}°`
          : `${sample.visible.length} satélites · G GPS · R GLONASS · E Galileo · C BeiDou`}
      </p>
    </div>
  )
}
