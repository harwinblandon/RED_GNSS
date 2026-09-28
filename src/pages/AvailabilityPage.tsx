import { useEffect, useMemo, useState } from 'react'
import { PageHeader, Card, Select, TextInput, Button } from '../components/ui'
import { AvailabilityStrip, CoverageChart, Legend } from '../components/AvailabilityCharts'
import { ACTIVE_STATIONS, STATIONS, type GnssStation } from '../data/stations'
import {
  ALERT_HELP,
  ALERT_LABEL,
  loadHistory,
  networkAlerts,
  stationStats,
  type AlertKind,
  type NetworkHistory,
  type StationAlert,
  type StationStats,
} from '../lib/availability'
import { downloadText } from '../lib/planning'

type Window = 30 | 90 | 365

const ALERT_STYLE: Record<AlertKind, string> = {
  outage: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  down: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  flaky: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  recovered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}
// Marca además de color, para no depender solo de él.
const ALERT_MARK: Record<AlertKind, string> = { outage: '▼', down: '■', flaky: '◆', recovered: '▲' }

const DEPARTMENTS = [...new Set(STATIONS.map((s) => s.department))].filter(Boolean).sort()
const OPERATORS = [...new Set(STATIONS.map((s) => s.operator))].filter(Boolean).sort()
const BY_ID = new Map(STATIONS.map((s) => [s.id, s]))

const fmtPct = (v: number | null) =>
  v == null ? '—' : `${v >= 99.5 ? 100 : v === 0 || v >= 10 ? Math.round(v) : v.toFixed(1)} %`

interface Row {
  s: GnssStation
  bits: boolean[]
  st: StationStats
  alert: StationAlert | undefined
}

export default function AvailabilityPage() {
  const [h, setH] = useState<NetworkHistory | null | undefined>(undefined)
  const [win, setWin] = useState<Window>(90)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [op, setOp] = useState('')
  const [alertFilter, setAlertFilter] = useState<'' | AlertKind | 'any'>('')
  const [sort, setSort] = useState<'pct' | 'gap' | 'id'>('pct')
  const [limit, setLimit] = useState(40)
  const [showDown, setShowDown] = useState(false)

  useEffect(() => {
    loadHistory().then(setH)
  }, [])

  useEffect(() => setLimit(40), [q, dept, op, alertFilter, sort])

  const alerts = useMemo(
    () => (h ? networkAlerts(h, ACTIVE_STATIONS.map((s) => s.id)) : []),
    [h],
  )
  const alertById = useMemo(() => new Map(alerts.map((a) => [a.id, a])), [alerts])

  const rows = useMemo<Row[]>(() => {
    if (!h) return []
    return ACTIVE_STATIONS.filter((s) => h.stations[s.id]).map((s) => ({
      s,
      bits: h.stations[s.id],
      st: stationStats(h.stations[s.id], h.horizon),
      alert: alertById.get(s.id),
    }))
  }, [h, alertById])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = rows.filter(
      ({ s, alert }) =>
        (dept === '' || s.department === dept) &&
        (op === '' || s.operator === op) &&
        (alertFilter === '' || (alertFilter === 'any' ? !!alert : alert?.kind === alertFilter)) &&
        (needle === '' || s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)),
    )
    const pctKey = (r: Row) => r.st.pct[win] ?? -1
    return out.sort((a, b) =>
      sort === 'id'
        ? a.s.id.localeCompare(b.s.id)
        : sort === 'gap'
          ? b.st.currentGap - a.st.currentGap || pctKey(a) - pctKey(b)
          : pctKey(a) - pctKey(b) || a.s.id.localeCompare(b.s.id),
    )
  }, [rows, q, dept, op, alertFilter, sort, win])

  if (h === undefined) {
    return <div className="py-20 text-center text-sm text-slate-400">Cargando histórico…</div>
  }
  if (h === null) {
    return (
      <div>
        <PageHeader title="Histórico de disponibilidad" />
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aún no hay histórico publicado. Se genera a diario con el snapshot de estado de estaciones.
          </p>
        </Card>
      </div>
    )
  }

  const from = Math.max(0, h.dates.length - win)
  const to = h.dates.length - 1
  const netFrom = Math.max(0, h.horizon - 29)
  const net30 =
    h.coverage.slice(netFrom, h.horizon + 1).reduce((a, b) => a + b, 0) / (h.horizon - netFrom + 1)
  const count = (k: AlertKind) => alerts.filter((a) => a.kind === k).length

  function exportCsv() {
    const head = [
      'estacion', 'municipio', 'departamento', 'operador', 'orden',
      'pct_30d', 'pct_90d', 'pct_365d', 'dias_sin_datos', 'hueco_mas_largo_d',
      'hueco_mas_largo_desde', 'ultimo_dato', 'alerta',
    ]
    const lines = filtered.map(({ s, st, alert }) =>
      [
        s.id, s.name, s.department, s.operator, s.order,
        st.pct[30]?.toFixed(1) ?? '', st.pct[90]?.toFixed(1) ?? '', st.pct[365]?.toFixed(1) ?? '',
        st.currentGap, st.longestGap.days,
        st.longestGap.from >= 0 ? h!.dates[st.longestGap.from] : '',
        st.last >= 0 ? h!.dates[st.last] : '',
        alert ? ALERT_LABEL[alert.kind] : '',
      ]
        .map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v))
        .join(','),
    )
    downloadText(
      `disponibilidad-magna-eco-${h!.dates[h!.horizon]}.csv`,
      [head.join(','), ...lines].join('\n'),
      'text/csv',
    )
  }

  const groups = (['outage', 'flaky', 'recovered', 'down'] as AlertKind[])
    .map((k) => ({ k, items: alerts.filter((a) => a.kind === k) }))
    .filter((g) => g.items.length)

  return (
    <div>
      <PageHeader
        title="Histórico de disponibilidad"
        subtitle="Qué días publicó datos de observación cada estación MAGNA-ECO en el último año, según el listado de archivos RINEX del IGAC. Se actualiza a diario."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200 dark:bg-[#1f2124] dark:ring-[#2c2e32]">
          <p className="tabular text-2xl font-bold text-slate-900 dark:text-white">{Math.round(net30 * 100)} %</p>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Disponibilidad de la red (30 d)</p>
        </div>
        {(['outage', 'flaky', 'down'] as AlertKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setAlertFilter((f) => (f === k ? '' : k))}
            className={`rounded-xl px-4 py-3 text-left transition hover:-translate-y-px ${ALERT_STYLE[k]} ${alertFilter === k ? 'ring-2 ring-current' : ''}`}
          >
            <p className="tabular text-2xl font-bold">{count(k)}</p>
            <p className="text-xs font-medium">
              {ALERT_MARK[k]} {ALERT_LABEL[k]}
            </p>
          </button>
        ))}
      </div>

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900 dark:text-white">Alertas</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Datos publicados hasta el {h.dates[h.horizon]}
          </span>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">Sin alertas: todas las estaciones activas publican con normalidad.</p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ k, items }) => {
              const collapsed = k === 'down' && !showDown
              return (
                <section key={k}>
                  <h3 className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ALERT_STYLE[k]}`}>
                      {ALERT_MARK[k]} {ALERT_LABEL[k]} · {items.length}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{ALERT_HELP[k]}</span>
                    {k === 'down' && (
                      <button onClick={() => setShowDown((v) => !v)} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                        {showDown ? 'Ocultar' : 'Mostrar'}
                      </button>
                    )}
                  </h3>
                  {!collapsed && (
                    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                      {items.map((a) => {
                        const s = BY_ID.get(a.id)
                        return (
                          <li key={a.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
                            <a href={`#/estacion?station=${a.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                              {a.id}
                            </a>
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {s?.name}, {s?.department}
                            </span>
                            <span className="tabular w-full text-xs text-slate-600 sm:w-auto sm:shrink-0 dark:text-slate-300">{a.text}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">Cobertura diaria de la red</h2>
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700" role="group" aria-label="Ventana">
            {([30, 90, 365] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${win === w ? 'bg-brand-700 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {w === 365 ? '1 año' : `${w} días`}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Porcentaje de las {h.alive} estaciones con datos en el año que publicaron cada día.
        </p>
        <CoverageChart coverage={h.coverage} dates={h.dates} horizon={h.horizon} from={from} to={to} total={h.alive} />
      </Card>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput placeholder="Buscar código o municipio" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Todos los departamentos</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select value={op} onChange={(e) => setOp(e.target.value)}>
            <option value="">Todos los operadores</option>
            {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Select value={alertFilter} onChange={(e) => setAlertFilter(e.target.value as typeof alertFilter)}>
            <option value="">Todas las estaciones</option>
            <option value="any">Solo con alerta</option>
            {(Object.keys(ALERT_LABEL) as AlertKind[]).map((k) => (
              <option key={k} value={k}>{ALERT_LABEL[k]}</option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto!">
            <option value="pct">Menor disponibilidad primero</option>
            <option value="gap">Más días sin datos primero</option>
            <option value="id">Por código</option>
          </Select>
          <span className="text-sm text-slate-500">{filtered.length} estaciones</span>
          <div className="ml-auto flex items-center gap-4">
            <Legend />
            <Button variant="secondary" onClick={exportCsv}>Exportar CSV</Button>
          </div>
        </div>
      </Card>

      {/* Móvil: tarjetas */}
      <ul className="space-y-2 sm:hidden">
        {filtered.slice(0, limit).map((r) => (
          <li key={r.s.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2c2e32] dark:bg-[#1f2124]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a href={`#/estacion?station=${r.s.id}`} className="font-medium text-slate-900 dark:text-slate-100">{r.s.id}</a>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.s.name}, {r.s.department}</p>
              </div>
              <div className="text-right">
                <p className="tabular text-sm font-semibold text-slate-900 dark:text-slate-100">{fmtPct(r.st.pct[win])}</p>
                {r.alert && <AlertBadge kind={r.alert.kind} />}
              </div>
            </div>
            <div className="mt-2">
              <AvailabilityStrip bits={r.bits} dates={h.dates} horizon={h.horizon} from={from} to={to} first={r.st.first} />
            </div>
          </li>
        ))}
      </ul>

      {/* Escritorio: tabla */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block dark:border-slate-800 dark:bg-[#1f2124]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="p-3 font-medium">Estación</th>
              <th className="w-[38%] p-3 font-medium">
                {win === 365 ? 'Último año' : `Últimos ${win} días`}
              </th>
              <th className="p-3 text-right font-medium">30 d</th>
              <th className="p-3 text-right font-medium">90 d</th>
              <th className="whitespace-nowrap p-3 text-right font-medium">1 año</th>
              <th className="p-3 font-medium">Hueco más largo</th>
              <th className="p-3 font-medium">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.s.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <a href={`#/estacion?station=${r.s.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                    {r.s.id}
                  </a>
                  <p className="max-w-[14rem] truncate text-xs text-slate-500 dark:text-slate-400">
                    {r.s.name}, {r.s.department}
                  </p>
                </td>
                <td className="p-3">
                  <AvailabilityStrip bits={r.bits} dates={h.dates} horizon={h.horizon} from={from} to={to} first={r.st.first} />
                </td>
                {([30, 90, 365] as Window[]).map((w) => (
                  <td key={w} className={`tabular whitespace-nowrap p-3 text-right ${w === win ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                    {fmtPct(r.st.pct[w])}
                  </td>
                ))}
                <td className="tabular whitespace-nowrap p-3 text-slate-600 dark:text-slate-400">
                  {r.st.longestGap.days > 0 ? (
                    <>
                      {r.st.longestGap.days} d
                      <span className="block text-xs text-slate-400">desde {h.dates[r.st.longestGap.from]}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="p-3">{r.alert && <AlertBadge kind={r.alert.kind} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button
          onClick={() => setLimit((n) => n + 60)}
          className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Ver más ({filtered.length - limit} restantes)
        </button>
      )}

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Histórico generado el {h.generated.slice(0, 10)}. Un día cuenta con datos si el IGAC publicó
        al menos un archivo de observación de la estación. Los porcentajes se calculan hasta el{' '}
        {h.dates[h.horizon]} (último día que ya publicó la mayoría de la red) y, en estaciones
        instaladas durante el periodo, desde su primer dato. Días posteriores: pendientes de publicación.
      </p>
    </div>
  )
}

function AlertBadge({ kind }: { kind: AlertKind }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ALERT_STYLE[kind]}`}>
      {ALERT_MARK[kind]} {ALERT_LABEL[kind]}
    </span>
  )
}
