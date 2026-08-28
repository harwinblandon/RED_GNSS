import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, Card, Select, TextInput, ExternalLink, Button } from '../components/ui'
import { STATIONS, ACTIVE_STATIONS, type GnssStation } from '../data/stations'
import {
  classify,
  daysSince,
  getCached,
  fetchLatency,
  loadSnapshot,
  scanMany,
  type FreshLevel,
} from '../lib/stationStatus'

type Row = { last: string | null; checking: boolean }
type StatusMap = Record<string, Row>

const LEVEL_STYLE: Record<FreshLevel, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  stale: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  unknown: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}
const LEVEL_LABEL: Record<FreshLevel, string> = {
  ok: 'Al día', warn: 'Con retraso', stale: 'Sin datos recientes', unknown: 'Sin verificar',
}

const DEPARTMENTS = [...new Set(STATIONS.map((s) => s.department))].filter(Boolean).sort()
const OPERATORS = [...new Set(STATIONS.map((s) => s.operator))].filter(Boolean).sort()

export default function StationStatusPage() {
  const [status, setStatus] = useState<StatusMap>({})
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [op, setOp] = useState('')
  const [order, setOrder] = useState<'all' | '0' | '1'>('all')
  const [scope, setScope] = useState<'active' | 'all'>('active')
  const [scan, setScan] = useState<{ running: boolean; done: number; total: number }>({
    running: false, done: 0, total: 0,
  })
  const abortRef = useRef<AbortController | null>(null)

  // Estado inicial: snapshot (si existe) + caché local
  useEffect(() => {
    const seed: StatusMap = {}
    for (const s of STATIONS) {
      const c = getCached(s.tId)
      if (c) seed[s.id] = { last: c.lastDate, checking: false }
    }
    setStatus(seed)
    loadSnapshot().then((snap) => {
      if (!snap) return
      setSnapshotDate(snap.generated)
      setStatus((prev) => {
        const next = { ...prev }
        for (const [id, v] of Object.entries(snap.stations)) {
          if (!next[id]) next[id] = { last: v.lastDate, checking: false }
        }
        return next
      })
    })
  }, [])

  const pool = scope === 'active' ? ACTIVE_STATIONS : STATIONS
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return pool.filter(
      (s) =>
        (order === 'all' || String(s.order) === order) &&
        (dept === '' || s.department === dept) &&
        (op === '' || s.operator === op) &&
        (needle === '' ||
          s.id.toLowerCase().includes(needle) ||
          s.name.toLowerCase().includes(needle)),
    )
  }, [pool, q, dept, op, order])

  const sorted = useMemo(() => {
    const rank = (s: GnssStation) => {
      const last = status[s.id]?.last ?? null
      const d = daysSince(last)
      return d == null ? 1e9 : d
    }
    return [...filtered].sort((a, b) => rank(b) - rank(a))
  }, [filtered, status])

  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, stale: 0, unknown: 0 }
    for (const s of filtered) c[classify(status[s.id]?.last ?? null)]++
    return c
  }, [filtered, status])

  async function checkOne(s: GnssStation) {
    setStatus((p) => ({ ...p, [s.id]: { last: p[s.id]?.last ?? null, checking: true } }))
    try {
      const r = await fetchLatency(s.tId)
      setStatus((p) => ({ ...p, [s.id]: { last: r.lastDate, checking: false } }))
    } catch {
      setStatus((p) => ({ ...p, [s.id]: { last: p[s.id]?.last ?? null, checking: false } }))
    }
  }

  async function scanVisible() {
    const targets = sorted.filter((s) => !status[s.id]?.last)
    if (targets.length === 0) return
    if (
      targets.length > 15 &&
      !window.confirm(
        `Se consultarán ${targets.length} estaciones al servidor del IGAC ` +
          `(varios MB cada una). Puede tardar y consumir datos. ¿Continuar?`,
      )
    )
      return

    const ctl = new AbortController()
    abortRef.current = ctl
    setScan({ running: true, done: 0, total: targets.length })
    await scanMany(
      targets.map((s) => s.tId),
      {
        concurrency: 5,
        signal: ctl.signal,
        onResult: (r) => {
          const st = STATIONS.find((s) => s.tId === r.tId)
          if (st) setStatus((p) => ({ ...p, [st.id]: { last: r.lastDate, checking: false } }))
        },
        onProgress: (p) => setScan({ running: true, done: p.done, total: p.total }),
      },
    )
    setScan({ running: false, done: 0, total: 0 })
    abortRef.current = null
  }

  return (
    <div>
      <PageHeader
        title="Estado de estaciones"
        status="beta"
        subtitle="Qué tan recientes son los datos RINEX de cada estación. La fecha del último dato se consulta a la API del IGAC bajo demanda."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['ok', 'warn', 'stale', 'unknown'] as FreshLevel[]).map((lv) => (
          <div key={lv} className={`rounded-xl px-4 py-3 ${LEVEL_STYLE[lv]}`}>
            <p className="text-2xl font-bold tabular">{counts[lv]}</p>
            <p className="text-xs font-medium">{LEVEL_LABEL[lv]}</p>
          </div>
        ))}
      </div>

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
          <Select value={order} onChange={(e) => setOrder(e.target.value as typeof order)}>
            <option value="all">Todos los órdenes</option>
            <option value="0">Orden 0</option>
            <option value="1">Orden 1</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="w-auto">
            <option value="active">Solo activas</option>
            <option value="all">Activas e inactivas</option>
          </Select>
          <span className="text-sm text-slate-500">{filtered.length} estaciones</span>
          <div className="ml-auto flex items-center gap-3">
            {scan.running && (
              <>
                <span className="text-xs text-slate-500">{scan.done}/{scan.total}</span>
                <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                  Detener
                </Button>
              </>
            )}
            <Button onClick={scanVisible} disabled={scan.running}>
              Verificar sin datos
            </Button>
          </div>
        </div>
        {scan.running && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(scan.done / Math.max(1, scan.total)) * 100}%` }}
            />
          </div>
        )}
      </Card>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="p-3 font-medium">Estación</th>
              <th className="p-3 font-medium">Ubicación</th>
              <th className="p-3 font-medium">Orden</th>
              <th className="p-3 font-medium">Operador</th>
              <th className="p-3 font-medium">Último dato</th>
              <th className="p-3 font-medium">Estado</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const row = status[s.id]
              const last = row?.last ?? null
              const level = classify(last)
              const d = daysSince(last)
              return (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-medium text-slate-900 dark:text-slate-100">
                    {s.id}
                    {s.status === 'inactive' && (
                      <span className="ml-1 text-xs font-normal text-slate-400">inactiva</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">
                    {s.name}, {s.department}
                  </td>
                  <td className="tabular p-3">{s.order}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{s.operator}</td>
                  <td className="tabular p-3">
                    {last ?? '—'}
                    {d != null && <span className="ml-1 text-xs text-slate-400">({d} d)</span>}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[level]}`}>
                      {LEVEL_LABEL[level]}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => checkOne(s)}
                        disabled={row?.checking}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        {row?.checking ? '…' : 'Verificar'}
                      </button>
                      <a
                        href={`#/rinex?station=${s.id}`}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        RINEX
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        {snapshotDate
          ? `Estado inicial del snapshot del ${snapshotDate.slice(0, 10)}. `
          : 'Sin snapshot precomputado — verifica las estaciones que te interesen. '}
        Umbrales: al día ≤ 7 días · con retraso ≤ 20 días · sin datos recientes &gt; 20 días.
        Publicación del IGAC con 3–5 días de latencia normal. Estado administrativo oficial en la{' '}
        <ExternalLink href="https://estadoestacionesgnss.igac.gov.co/">
          plataforma del IGAC
        </ExternalLink>
        .
      </p>
    </div>
  )
}
