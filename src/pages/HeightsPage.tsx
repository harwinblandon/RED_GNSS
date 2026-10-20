import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClientLogosField } from '../components/ClientLogosField'
import { useClientLogos } from '../lib/clientLogos'
import { ExcelProtectField } from '../components/ExcelProtectField'
import { MapContainer, CircleMarker, Popup, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, Field, TextInput, Select, DataRow, Button, ExternalLink } from '../components/ui'
import { CoordinateEntry, type Geodetic } from '../components/CoordinateEntry'
import { BaseLayers, FullscreenButton } from '../components/MapLayers'
import { GuideCampaign } from '../components/GuideCampaign'
import { ReportMetaCard } from '../components/ReportMetaCard'
import { useReportMeta } from '../lib/reportMeta'
import { quickReportDoc } from '../lib/quickReport'
import { parseCoordinates, type InputSystem } from '../lib/coordParse'
import { PROJECTED_CRS } from '../lib/coords'
import { downloadText } from '../lib/planning'
import { COLOMBIA_CENTER } from '../lib/colombia'
import {
  autoCorrection,
  benchmarkCorrection,
  benchmarksNear,
  computeHeight,
  correctionQuality,
  interpolate,
  loadGrid,
  loadLeveling,
  type Benchmark,
  type GeoidGrid,
  type HeightResult,
} from '../lib/heights'

type CorrectionMode = 'auto' | 'benchmark' | 'none'

const MAP_RADIUS_KM = 30
const m3 = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(3)} m`)
const signed = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)} m`)


function Intro({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 max-w-4xl rounded-lg border-l-4 border-brand-600 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm print:hidden dark:border-slate-300 dark:bg-[#1f2124] dark:text-slate-300">
      {children}
    </p>
  )
}

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lon], 12, { duration: 0.6 })
  }, [lat, lon, map])
  return null
}

export default function HeightsPage() {
  const [q, setQ] = useState<GeoidGrid | null>(null)
  const [g04, setG04] = useState<GeoidGrid | null>(null)
  const [leveling, setLeveling] = useState<Benchmark[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [entrySystem, setEntrySystem] = useState('geo-dms')
  const [singleGeo, setSingleGeo] = useState<Geodetic | null>(null)
  const onSingleGeo = useCallback((g: Geodetic | null) => setSingleGeo(g), [])
  const [singleId, setSingleId] = useState('1')
  const [text, setText] = useState('')
  const [batchSystem, setBatchSystem] = useState<InputSystem>('auto')

  const [corrMode, setCorrMode] = useState<CorrectionMode>('auto')
  const [bmId, setBmId] = useState('')
  const [bmH, setBmH] = useState('')
  const [show04, setShow04] = useState(false)
  const [tab, setTab] = useState<'rapido' | 'campana'>('rapido')
  /** Puntos enviados desde el cálculo rápido a la campaña (cambia la key para reiniciarla). */
  const [seed, setSeed] = useState({ text: '', key: 0 })
  const [meta, setMeta] = useReportMeta()
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [xlsPassword, setXlsPassword] = useState('')
  const [logos, setLogos] = useClientLogos()
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    loadGrid('qgeoidcol2023').then(setQ, (e: Error) => setError(e.message))
    loadLeveling().then(setLeveling, (e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (show04 && !g04) loadGrid('geocol2004').then(setG04, () => setShow04(false))
  }, [show04, g04])

  const parsed = useMemo(() => {
    if (mode === 'single') {
      return singleGeo
        ? { points: [{ id: singleId.trim() || '1', lat: singleGeo.lat, lon: singleGeo.lon, h: singleGeo.h }], errors: [] as string[] }
        : { points: [], errors: ['Completa las coordenadas.'] }
    }
    const r = parseCoordinates(text, batchSystem, '')
    return { points: r.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, h: p.h })), errors: r.errors }
  }, [mode, singleGeo, singleId, text, batchSystem])

  const focus = parsed.points[0] ?? null

  /** Placas a menos de MAP_RADIUS_KM del primer punto (mapa y selector de placa). */
  const nearby = useMemo(
    () => (focus && leveling ? benchmarksNear(focus, leveling, MAP_RADIUS_KM) : []),
    [focus, leveling],
  )

  const selectedBm = useMemo(() => leveling?.find((b) => b.id === bmId) ?? null, [leveling, bmId])
  const bmDelta = useMemo(() => {
    const hv = Number(bmH.replace(',', '.'))
    if (!q || !selectedBm || bmH.trim() === '' || !Number.isFinite(hv)) return null
    return benchmarkCorrection(selectedBm, hv, q)
  }, [q, selectedBm, bmH])

  const results = useMemo<HeightResult[]>(() => {
    if (!q || !leveling) return []
    return parsed.points.map((p) => {
      const correction = corrMode === 'auto' ? autoCorrection(p, leveling, q) : null
      const delta = corrMode === 'benchmark' ? bmDelta : corrMode === 'auto' ? correction?.delta ?? null : null
      return computeHeight(p, q, { correction, delta, g04: show04 ? g04 : null })
    })
  }, [q, leveling, parsed.points, corrMode, bmDelta, g04, show04])

  const first = results[0] ?? null

  function pickBenchmark(id: string) {
    setCorrMode('benchmark')
    setBmId(id)
  }

  async function downloadReport(kind: 'pdf' | 'xlsx') {
    if (!q || results.length === 0) return
    setBusy(kind)
    setExportError(null)
    try {
      const { exportPdf, exportExcel } = await import('../lib/guideReportExport')
      const doc = quickReportDoc({
        meta,
        results,
        mode: corrMode,
        benchmark: corrMode === 'benchmark' ? selectedBm : null,
        benchmarkH: corrMode === 'benchmark' && bmH.trim() !== '' ? Number(bmH.replace(',', '.')) : null,
        benchmarkZeta: corrMode === 'benchmark' && selectedBm ? interpolate(q, selectedBm.lat, selectedBm.lon) : null,
        generated: new Date(),
      })
      doc.extraLogos = logos
      await (kind === 'pdf' ? exportPdf(doc) : exportExcel(doc, { password: xlsPassword, author: meta.responsable, matricula: meta.matricula }))
    } catch (e) {
      setExportError(`No se pudo generar el archivo: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  /** Lleva los puntos calculados a la pestaña de campaña (Guía IGAC) para agregar los NP. */
  function sendToCampaign() {
    const lines = ['id,lat,lon,h,H,t_min', ...parsed.points.map((p) => `${p.id},${p.lat.toFixed(9)},${p.lon.toFixed(9)},${p.h.toFixed(4)},,`)]
    if (corrMode === 'benchmark' && selectedBm && bmH.trim() !== '' && !parsed.points.some((p) => p.id === selectedBm.id))
      lines.push(`${selectedBm.id},${selectedBm.lat.toFixed(9)},${selectedBm.lon.toFixed(9)},${Number(bmH.replace(',', '.')).toFixed(4)},${selectedBm.H.toFixed(4)},`)
    setSeed((prev) => ({ text: lines.join('\n'), key: prev.key + 1 }))
    setTab('campana')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function exportCsv() {
    const head = ['id', 'lat', 'lon', 'h_elip', 'zeta_QGeoidCOL2023', 'H_normal', 'delta_red', 'H_red_nivelacion', 'puntos_correccion', 'N_GEOCOL2004', 'H_GEOCOL2004']
    const rows = results.map((r) =>
      [
        r.id, r.lat.toFixed(9), r.lon.toFixed(9), r.h.toFixed(3),
        r.zeta?.toFixed(3) ?? '', r.normal?.toFixed(3) ?? '', r.delta?.toFixed(3) ?? '', r.leveled?.toFixed(3) ?? '',
        corrMode === 'auto' ? r.correction?.used ?? 0 : corrMode === 'benchmark' ? `placa ${bmId}` : '',
        r.n04?.toFixed(3) ?? '', r.h04?.toFixed(3) ?? '',
      ].join(','),
    )
    const meta = [
      `# Modelo,QGeoidCOL2023 (Resolución IGAC 515 de 2026)`,
      `# Corrección,${corrMode === 'auto' ? 'automática con puntos GNSS/nivelación del IGAC' : corrMode === 'benchmark' ? `placa ${bmId} medida con GNSS` : 'ninguna'}`,
      `# Generado,${new Date().toISOString()}`,
    ]
    downloadText('alturas_qgeoidcol2023.csv', [...meta, head.join(','), ...rows].join('\n'), 'text/csv')
  }

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Alturas físicas (QGeoidCOL2023)"
          subtitle="Convierte la altura elipsoidal de tu levantamiento GNSS en altura física con el modelo oficial QGeoidCOL2023: cálculo rápido ajustado a la red de nivelación, o cálculo de una campaña con NP e informe según la guía del IGAC."
        />
        <div className="mb-5 inline-grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {(
            [
              ['rapido', 'Cálculo rápido'],
              ['campana', 'Campaña e informe (Guía IGAC)'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`rounded-md px-4 py-1.5 font-medium transition ${
                tab === v ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-rose-600">No se pudieron cargar los datos: {error}</p>
        </Card>
      )}

      {tab === 'campana' ? (
        <>
          <Intro>
            <strong>Para entregables con interventoría.</strong> Aplica la <em>Guía metodológica del IGAC</em>: necesitas haber
            ocupado en campo vértices de nivelación (NP) con cota conocida — al menos 2 para un punto, 4 para una superficie, o
            inicio y fin de un perfil. Agrega los NP con su cota <strong>H</strong> a la tabla y descarga el informe.
          </Intro>
          <GuideCampaign key={seed.key} leveling={leveling} initialText={seed.text} />
        </>
      ) : (
      <>
      <Intro>
        <strong>Para conocer la cota de tus puntos.</strong> Ingresa coordenadas y altura elipsoidal: obtienes la cota con el
        modelo oficial y ajustada a la red de nivelación del IGAC, y puedes descargar el informe del cálculo. Si tu entregable
        debe cumplir la Guía metodológica del IGAC (con NP ocupados), pasa los puntos a la pestaña de campaña.
      </Intro>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          {/* Entrada */}
          <Card>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
              {(['single', 'batch'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    mode === m ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  {m === 'single' ? 'Un punto' : 'Varios puntos'}
                </button>
              ))}
            </div>
            {mode === 'single' ? (
              <CoordinateEntry
                system={entrySystem}
                onSystemChange={setEntrySystem}
                onChange={onSingleGeo}
                idValue={singleId}
                onIdChange={setSingleId}
              />
            ) : (
              <div className="space-y-3">
                <Field label="Sistema de entrada">
                  <Select value={batchSystem} onChange={(e) => setBatchSystem(e.target.value as InputSystem)}>
                    <option value="auto">Automático (lat, lon, h ó X, Y, Z)</option>
                    <option value="geo-dec">Geográficas (grados decimales)</option>
                    <option value="geo-dms">Geográficas (G° M' S")</option>
                    <option value="ecef">Geocéntricas X, Y, Z</option>
                    {PROJECTED_CRS.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Puntos" hint="Una línea por punto: id, lat, lon, h (altura elipsoidal). Separador coma, punto y coma, tab o espacios.">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder={'id,lat,lon,h\n1,4.596200,-74.077508,2575.42\n2,6.251840,-75.563590,1520.10'}
                    className="tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </Field>
                {parsed.errors.length > 0 && text.trim() !== '' && (
                  <p className="text-xs text-rose-600">{parsed.errors.length} fila(s) con problemas: {parsed.errors[0]}</p>
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              La altura debe ser <strong>elipsoidal</strong> (h) en MAGNA-SIRGAS, tal como sale del
              post-proceso GNSS.
            </p>
          </Card>

          {/* Corrección */}
          <Card>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Ajuste a la red de nivelación</p>
            <div className="space-y-2 text-sm">
              {(
                [
                  ['auto', 'Automático', 'Con los puntos GNSS/nivelación del IGAC cercanos.'],
                  ['benchmark', 'Con una placa que medí', 'Ocupaste con GNSS una placa de nivelación: el amarre más preciso.'],
                  ['none', 'Sin ajuste', 'Solo la cota del modelo QGeoidCOL2023 (h − ζ).'],
                ] as const
              ).map(([v, label, hint]) => (
                <label key={v} className="flex gap-2">
                  <input type="radio" name="corr" checked={corrMode === v} onChange={() => setCorrMode(v)} className="mt-1 size-4 accent-brand-600" />
                  <span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {corrMode === 'benchmark' && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Field label="Placa de nivelación" hint={`Placas a menos de ${MAP_RADIUS_KM} km del punto; también puedes elegirla en el mapa.`}>
                  <Select value={bmId} onChange={(e) => setBmId(e.target.value)}>
                    <option value="">Elige una placa…</option>
                    {selectedBm && !nearby.some((n) => n.b.id === selectedBm.id) && (
                      <option value={selectedBm.id}>{selectedBm.id}</option>
                    )}
                    {nearby.slice(0, 60).map(({ b, km }) => (
                      <option key={b.id} value={b.id}>
                        {b.id} · {km.toFixed(1)} km · H {b.H.toFixed(3)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="h elipsoidal medida en la placa (m)">
                  <TextInput inputMode="decimal" value={bmH} onChange={(e) => setBmH(e.target.value)} placeholder="2575.120" />
                </Field>
                {selectedBm && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    H nivelada de la placa: <span className="tabular font-medium text-slate-700 dark:text-slate-200">{selectedBm.H.toFixed(3)} m</span>
                    {bmDelta != null && <> · δ = <span className="tabular font-medium text-slate-700 dark:text-slate-200">{signed(bmDelta)}</span></>}
                  </p>
                )}
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
              <input type="checkbox" checked={show04} onChange={(e) => setShow04(e.target.checked)} className="size-4 accent-brand-600" />
              Comparar con GEOCOL2004 (transición)
            </label>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {!q || !leveling ? (
            <Card><p className="text-sm text-slate-500">Cargando modelo y red de nivelación…</p></Card>
          ) : mode === 'single' && first ? (
            <SingleResult r={first} mode={corrMode} bmId={bmId} />
          ) : null}

          {/* Mapa */}
          {focus && leveling && (
            <div className="relative h-[26rem] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <MapContainer center={COLOMBIA_CENTER} zoom={6} preferCanvas style={{ height: '100%', width: '100%' }}>
                <BaseLayers />
                <FullscreenButton />
                <FlyTo lat={focus.lat} lon={focus.lon} />
                <Circle
                  center={[focus.lat, focus.lon]}
                  radius={(first?.correction?.radiusKm ?? 25) * 1000}
                  pathOptions={{ color: '#15803d', weight: 1, dashArray: '4 4', fillOpacity: 0.03 }}
                />
                {nearby.map(({ b, km }) => (
                  <BenchmarkMarker
                    key={b.id}
                    b={b}
                    km={km}
                    zeta={q ? interpolate(q, b.lat, b.lon) : null}
                    used={first?.correction?.points.find((x) => x.b.id === b.id) ?? null}
                    selected={corrMode === 'benchmark' && bmId === b.id}
                    onUse={() => pickBenchmark(b.id)}
                  />
                ))}
                {parsed.points.map((p) => (
                  <CircleMarker
                    key={p.id}
                    center={[p.lat, p.lon]}
                    radius={8}
                    pathOptions={{ color: '#ffffff', fillColor: '#dc2626', fillOpacity: 0.9, weight: 2 }}
                  >
                    <Popup>{p.id}</Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
              <MapLegend />
            </div>
          )}

          {mode === 'batch' && results.length > 0 && <BatchTable results={results} />}

          {results.some((r) => r.zeta != null) && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Informe de este cálculo</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {results.length} punto(s) · método: {corrMode === 'auto' ? 'ajuste automático a la red' : corrMode === 'benchmark' ? 'amarre a placa medida' : 'solo modelo QGeoidCOL2023 (h − ζ)'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => downloadReport('pdf')} disabled={busy != null}>{busy === 'pdf' ? 'Generando…' : 'PDF'}</Button>
                  <Button onClick={() => downloadReport('xlsx')} disabled={busy != null}>{busy === 'xlsx' ? 'Generando…' : 'Excel (.xlsx)'}</Button>
                  <Button variant="secondary" onClick={exportCsv}>CSV</Button>
                </div>
              </div>
              <div className="mt-3">
                <ExcelProtectField value={xlsPassword} onChange={setXlsPassword} />
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <ClientLogosField logos={logos} onChange={setLogos} />
              </div>
              {exportError && <p className="mt-2 text-xs text-rose-600">{exportError}</p>}
              <details className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                  Datos del proyecto para el encabezado {meta.proyecto ? `· ${meta.proyecto}` : '(opcional)'}
                </summary>
                <div className="mt-3">
                  <ReportMetaCard meta={meta} onChange={setMeta} withObservaciones />
                </div>
              </details>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <p className="text-xs text-slate-600 dark:text-slate-300">¿Ocupaste placas de nivelación (NP) en la campaña? Calcula con el método de la Guía IGAC.</p>
                <Button variant="secondary" onClick={sendToCampaign}>Pasar estos puntos a la campaña →</Button>
              </div>
            </Card>
          )}

          <MethodNote />
        </div>
      </div>
      </>
      )}
    </div>
  )
}


/* ------------------------------ resultado ------------------------------- */

function Stat({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${strong ? 'border-emerald-700/40 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700/70'}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold text-slate-900 dark:text-white">{value}</p>
      {note && <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p>}
    </div>
  )
}

function SingleResult({ r, mode, bmId }: { r: HeightResult; mode: CorrectionMode; bmId: string }) {
  if (r.zeta == null)
    return (
      <Card>
        <p className="text-sm text-rose-600">El punto está fuera de la cobertura de QGeoidCOL2023 (Colombia y zonas marinas vecinas).</p>
      </Card>
    )
  const q = mode === 'auto' ? correctionQuality(r.correction) : null
  return (
    <Card>
      <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Punto {r.id}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {mode !== 'none' && (
          <Stat
            strong
            label="Cota ajustada a la red de nivelación"
            value={r.leveled == null ? '—' : `${r.leveled.toFixed(3)} m`}
            note={`H = h − ζ − δ · ${mode === 'auto' ? `ajuste ${q!.label}` : bmId ? `amarrada a la placa ${bmId}` : 'elige la placa y su h medida'}`}
          />
        )}
        <Stat label="Cota modelo QGeoidCOL2023" value={m3(r.normal)} note="H* = h − ζ · sin ajuste a la red" />
        <Stat label="Anomalía de altura ζ (QGeoidCOL2023)" value={m3(r.zeta)} note="Interpolación bilineal (rejilla 5′)" />
      </div>

      <div className="mt-4">
        <DataRow label="Altura elipsoidal h (dato GNSS)" value={m3(r.h)} />
        <DataRow label="Anomalía de altura ζ (modelo QGeoidCOL2023)" value={m3(r.zeta)} />
        <DataRow label="Cota modelo QGeoidCOL2023 · H* = h − ζ" value={m3(r.normal)} />
        {mode !== 'none' && (
          <>
            <DataRow label="Ajuste a la red de nivelación δ (desfase local modelo → placas)" value={signed(r.delta)} />
            <DataRow label="Cota ajustada a la red de nivelación · H = h − ζ − δ" value={m3(r.leveled)} />
          </>
        )}
        {mode === 'auto' && r.correction && (
          <DataRow
            label="Puntos GNSS/nivelación usados"
            value={`${r.correction.used} en ${r.correction.radiusKm.toFixed(0)} km · σ ${r.correction.spread.toFixed(3)} m`}
          />
        )}
        {r.n04 != null && (
          <>
            <DataRow label="Ondulación N (modelo GEOCOL2004, transición)" value={m3(r.n04)} />
            <DataRow label="Cota modelo GEOCOL2004 · h − N" value={`${m3(r.h04)} · ${signed(r.h04! - (r.leveled ?? r.normal!))} vs. resultado`} />
          </>
        )}
      </div>
      {q && <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{q.note}</p>}
    </Card>
  )
}

function BatchTable({ results }: { results: HeightResult[] }) {
  const has04 = results.some((r) => r.h04 != null)
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">{results.length} puntos</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-3 font-medium">Punto</th>
              <th className="py-2 pr-3 text-right font-medium">h elipsoidal</th>
              <th className="py-2 pr-3 text-right font-medium">ζ QGeoidCOL2023</th>
              <th className="py-2 pr-3 text-right font-medium">Cota modelo QGeoidCOL2023</th>
              <th className="py-2 pr-3 text-right font-medium">Ajuste δ</th>
              <th className="py-2 pr-3 text-right font-medium">Cota ajustada a la red</th>
              {has04 && <th className="py-2 text-right font-medium">Cota GEOCOL2004</th>}
            </tr>
          </thead>
          <tbody className="tabular">
            {results.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-1.5 pr-3 font-medium text-slate-900 dark:text-slate-100">{r.id}</td>
                <td className="py-1.5 pr-3 text-right">{r.h.toFixed(3)}</td>
                <td className="py-1.5 pr-3 text-right">{r.zeta?.toFixed(3) ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right">{r.normal?.toFixed(3) ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right">{r.delta?.toFixed(3) ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right font-semibold text-slate-900 dark:text-white">{r.leveled?.toFixed(3) ?? '—'}</td>
                {has04 && <td className="py-1.5 text-right text-slate-500">{r.h04?.toFixed(3) ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tabular mt-3 text-xs text-slate-600 dark:text-slate-400">
        Cota modelo QGeoidCOL2023: H* = h − ζ · Cota ajustada a la red: H = h − ζ − δ (δ: desfase local entre el modelo y las
        placas niveladas){has04 && ' · Cota GEOCOL2004: h − N'}. Valores en metros.
      </p>
      {results.some((r) => r.zeta != null && r.leveled == null) && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          «—» en la cota ajustada: no hay puntos GNSS/nivelación a menos de 60 km (o falta la placa de amarre). Usa la cota
          del modelo o amarra el levantamiento a una placa de nivelación medida con GNSS.
        </p>
      )}
    </Card>
  )
}

/* --------------------------------- mapa --------------------------------- */

const BM_STYLE = {
  used: { fillColor: '#15803d', radius: 8, opacity: 1 },
  rejected: { fillColor: '#f59e0b', radius: 6, opacity: 1 },
  gnss: { fillColor: '#4ade80', radius: 4, opacity: 0.7 },
  leveling: { fillColor: '#2563eb', radius: 3.5, opacity: 0.7 },
} as const

function BenchmarkMarker({
  b,
  km,
  zeta,
  used,
  selected,
  onUse,
}: {
  b: Benchmark
  km: number
  zeta: number | null
  used: { offset: number; rejected: boolean } | null
  selected: boolean
  onUse: () => void
}) {
  const kind = used ? (used.rejected ? 'rejected' : 'used') : b.h != null ? 'gnss' : 'leveling'
  const s = BM_STYLE[kind]
  const offset = b.h != null && zeta != null ? b.h - b.H - zeta : null
  return (
    <CircleMarker
      center={[b.lat, b.lon]}
      radius={selected ? 9 : s.radius}
      pathOptions={{
        color: selected ? '#111318' : '#ffffff',
        weight: selected ? 3 : 1.5,
        fillColor: s.fillColor,
        fillOpacity: b.state === 'destruido' ? 0.3 : s.opacity,
      }}
    >
      <Popup minWidth={230}>
        <div className="text-xs leading-snug text-slate-700">
          <div className="text-sm font-bold text-slate-900">{b.id}</div>
          <div className="mb-1.5 text-slate-500">
            {[b.municipio, b.departamento].filter(Boolean).join(', ')} · a {km.toFixed(1)} km
          </div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">H nivelada</span><span className="tabular font-medium">{b.H.toFixed(3)} m</span></div>
          {b.h != null && (
            <div className="flex justify-between gap-3"><span className="text-slate-500">h elipsoidal</span><span className="tabular font-medium">{b.h.toFixed(3)} m</span></div>
          )}
          {offset != null && (
            <div className="flex justify-between gap-3"><span className="text-slate-500">Desfase (h − H − ζ)</span><span className="tabular font-medium">{signed(offset)}</span></div>
          )}
          <div className="flex justify-between gap-3"><span className="text-slate-500">Coordenada</span><span>{b.calculated ? 'calculada' : 'aproximada'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-slate-500">Estado</span><span>{b.state}</span></div>
          {used?.rejected && <div className="mt-1 font-medium text-amber-700">Descartada como atípica en el ajuste</div>}
          {b.state !== 'destruido' && (
            <button onClick={onUse} className="mt-2 w-full rounded bg-slate-900 px-2 py-1 font-semibold text-white hover:bg-slate-700">
              Usar como placa de amarre
            </button>
          )}
        </div>
      </Popup>
    </CircleMarker>
  )
}

function MapLegend() {
  const items = [
    [BM_STYLE.used.fillColor, 'GNSS/nivelación usada en el ajuste'],
    [BM_STYLE.rejected.fillColor, 'GNSS/nivelación descartada (atípica)'],
    [BM_STYLE.gnss.fillColor, 'GNSS/nivelación'],
    [BM_STYLE.leveling.fillColor, 'Placa de nivelación'],
    ['#dc2626', 'Punto'],
  ] as const
  return (
    <div className="pointer-events-none absolute bottom-6 left-2.5 z-[1000] rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] leading-5 text-slate-700 shadow-md backdrop-blur-sm max-sm:hidden">
      <p className="font-semibold text-slate-900">Red vertical IGAC · {MAP_RADIUS_KM} km</p>
      {items.map(([c, l]) => (
        <p key={l} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-white shadow" style={{ background: c }} />
          {l}
        </p>
      ))}
    </div>
  )
}

/* ------------------------------ metodología ----------------------------- */

function MethodNote() {
  return (
    <Card>
      <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Cómo se calcula</h3>
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        <p>
          <strong className="text-slate-800 dark:text-slate-200">QGeoidCOL2023</strong> es el modelo oficial
          desde la Resolución IGAC 515 de 2026 (reemplaza a GEOCOL2004; este puede usarse durante la
          transición hasta mayo de 2027). Es un <em>cuasigeoide</em>: da la anomalía de altura ζ y la
          altura normal <span className="tabular">H* = h − ζ</span>. Sistema de marea cero, elipsoide GRS80.
        </p>
        <p>
          El modelo no coincide exactamente con el datum de la red de nivelación (Buenaventura): frente a
          los puntos GNSS/nivelación del IGAC hay un desfase medio de ~0,2 m que cambia por regiones. El
          <strong className="text-slate-800 dark:text-slate-200"> ajuste automático</strong> estima ese
          desfase δ con los puntos cercanos (descarta atípicos, pondera por distancia) y entrega
          <span className="tabular"> H = h − ζ − δ</span>, compatible con las placas. En una prueba con 873
          placas de la red (cada una calculada sin usarla), el error típico bajó de 0,23 m a 0,04 m.
        </p>
        <p>
          El amarre más confiable es ocupar con GNSS una placa de nivelación cercana, en la misma sesión que
          el punto: elige <em>Con una placa que medí</em>. Para trabajos de precisión, la nivelación
          geométrica sigue siendo la referencia.
        </p>
        <p className="text-xs">
          Fuentes:{' '}
          <ExternalLink href="https://redgeodesica.igac.gov.co/documentos/QGeoidCOL2023.txt">QGeoidCOL2023 (IGAC, CC BY 4.0)</ExternalLink>
          {' · '}
          <ExternalLink href="https://doi.org/10.1186/s40623-024-01981-1">Liu et al. (2024)</ExternalLink>
          {' · '}Red Vertical y Red Pasiva del IGAC{' · '}
          <ExternalLink href="https://www.isgeoid.polimi.it/Geoid/America/Colombia/colombia04_g.html">GEOCOL2004 (ISG)</ExternalLink>
        </p>
      </div>
    </Card>
  )
}
