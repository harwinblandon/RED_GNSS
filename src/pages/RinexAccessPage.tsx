import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Card, Select, ExternalLink, Button } from '../components/ui'
import { StationPicker } from '../components/StationPicker'
import { STATIONS, type GnssStation } from '../data/stations'
import {
  fetchAvailable,
  downloadZip,
  freshness,
  rinexDeepLink,
  MAX_FILES,
  type RinexFile,
} from '../lib/rinex'

const FRESH_STYLE = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  stale: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  unknown: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
} as const

export default function RinexAccessPage() {
  const [params, setParams] = useSearchParams()
  const [station, setStation] = useState<GnssStation | null>(
    () => STATIONS.find((s) => s.id === params.get('station')) ?? null,
  )
  const [files, setFiles] = useState<RinexFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [version, setVersion] = useState<'all' | '2.11' | '3.0'>('all')
  const [kind, setKind] = useState<'all' | 'obs' | 'nav'>('all')
  const [days, setDays] = useState('30')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!station) return
    const ctl = new AbortController()
    setLoading(true)
    setError(null)
    setFiles([])
    setSelected(new Set())
    fetchAvailable(station.tId, ctl.signal)
      .then(setFiles)
      .catch((e) => {
        if (!ctl.signal.aborted) setError('No se pudo consultar el IGAC. ' + e.message)
      })
      .finally(() => {
        if (!ctl.signal.aborted) setLoading(false)
      })
    return () => ctl.abort()
  }, [station])

  const fresh = useMemo(() => freshness(files), [files])

  const shown = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(days) * 86_400_000).toISOString().slice(0, 10)
    return files.filter(
      (f) =>
        (days === '0' || f.date >= cutoff) &&
        (version === 'all' || f.version === version) &&
        (kind === 'all' ||
          (kind === 'obs' && f.kind === 'obs') ||
          (kind === 'nav' && f.kind.startsWith('nav'))),
    )
  }, [files, days, version, kind])

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else if (next.size < MAX_FILES) next.add(url)
      return next
    })
  }

  async function doDownload() {
    if (!station || selected.size === 0) return
    setDownloading(true)
    setError(null)
    try {
      const blob = await downloadZip([...selected])
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `RINEX_${station.id}_${selected.size}archivos.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError('Falló la descarga desde el IGAC. Usa el enlace directo más abajo. ' + (e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Acceso a RINEX"
        status="beta"
        subtitle="Consulta y descarga los archivos RINEX de las estaciones MAGNA-ECO. Datos servidos por la API del Centro de Control Geodésico del IGAC."
      />

      <Card className="mb-6">
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Estación
        </label>
        <StationPicker
          value={station}
          includeInactive
          onChange={(s) => {
            setStation(s)
            setParams(s ? { station: s.id } : {}, { replace: true })
          }}
        />
      </Card>

      {station && (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {station.id} — {station.name}, {station.department}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Orden {station.order} · {station.id}00COL · id IGAC {station.tId}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${FRESH_STYLE[fresh.level]}`}>
                {fresh.level === 'unknown'
                  ? 'Sin datos'
                  : `Último dato: ${fresh.lastDate} · latencia ${fresh.latencyDays} d`}
              </span>
            </div>
          </Card>

          <Card>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <LabeledSelect label="Periodo" value={days} onChange={setDays}
                options={[['7', 'Últimos 7 días'], ['15', 'Últimos 15 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['0', 'Todo']]} />
              <LabeledSelect label="Versión" value={version} onChange={(v) => setVersion(v as typeof version)}
                options={[['all', 'Todas'], ['3.0', 'RINEX 3.0'], ['2.11', 'RINEX 2.11']]} />
              <LabeledSelect label="Tipo" value={kind} onChange={(v) => setKind(v as typeof kind)}
                options={[['all', 'Todos'], ['obs', 'Observación'], ['nav', 'Navegación']]} />
            </div>

            {loading && <p className="text-sm text-slate-500">Consultando disponibilidad…</p>}
            {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

            {!loading && !error && (
              <>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    {shown.length} archivo(s){files.length ? ` de ${files.length}` : ''} · selecciona hasta {MAX_FILES}
                  </span>
                  <Button onClick={doDownload} disabled={selected.size === 0 || downloading}>
                    {downloading ? 'Descargando…' : `Descargar ZIP (${selected.size})`}
                  </Button>
                </div>

                <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                      <tr>
                        <th className="w-8 p-2" />
                        <th className="p-2 font-medium">Archivo</th>
                        <th className="p-2 font-medium">Fecha</th>
                        <th className="p-2 font-medium">DOY</th>
                        <th className="p-2 font-medium">Sem. GPS</th>
                        <th className="p-2 font-medium">Ver.</th>
                        <th className="p-2 font-medium">Tipo</th>
                        <th className="p-2 font-medium">Tasa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((f) => {
                        const on = selected.has(f.url)
                        return (
                          <tr
                            key={f.url}
                            onClick={() => toggle(f.url)}
                            className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${
                              on ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="p-2">
                              <input type="checkbox" readOnly checked={on} className="size-4 accent-brand-600" />
                            </td>
                            <td className="tabular p-2 text-slate-800 dark:text-slate-200">{f.name}</td>
                            <td className="tabular p-2">{f.date}</td>
                            <td className="tabular p-2">{String(f.doy).padStart(3, '0')}</td>
                            <td className="tabular p-2">{f.gpsWeek}</td>
                            <td className="p-2">{f.version}</td>
                            <td className="p-2 text-slate-600 dark:text-slate-400">{f.kindLabel}</td>
                            <td className="tabular p-2">{f.sampleRateS}s</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Alternativa: <ExternalLink href={rinexDeepLink(station.id, station.tId)}>
                página de descarga del IGAC
              </ExternalLink>{' '}
              (puede requerir registro). Publicación con 3–5 días de latencia; histórico anterior
              a 60 días vía magnaeco@igac.gov.co.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </label>
  )
}
