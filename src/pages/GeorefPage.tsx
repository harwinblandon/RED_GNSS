import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, Field, TextInput, Select, Button } from '../components/ui'
import { ReportMetaCard } from '../components/ReportMetaCard'
import { ExcelProtectField } from '../components/ExcelProtectField'
import { ClientLogosField } from '../components/ClientLogosField'
import { useClientLogos } from '../lib/clientLogos'
import { BaseLayers, FullscreenButton } from '../components/MapLayers'
import { useReportMeta } from '../lib/reportMeta'
import { ACTIVE_STATIONS } from '../data/stations'
import { fetchIgacWeeklySolutions, fetchIgacWeeklyCoord } from '../lib/solutions'
import { fromGeocentric, PROJECTED_CRS, recommendedGkZone, recommendedUtmZone } from '../lib/coords'
import { VEMOS_MODELS, type VemosModel } from '../lib/vemos'
import { CARTESIAN_PRESETS, type CartesianOrigin } from '../lib/colUrban'
import { cartesianSys, projectOut, sysFromCode, type OutputSys } from '../lib/outputCrs'
import { decimalYear } from '../lib/gpsTime'
import { downloadText } from '../lib/planning'
import { loadGrid, loadLeveling, type Benchmark, type GeoidGrid } from '../lib/heights'
import {
  REF_EPOCH,
  computeGeoref,
  finalHeight,
  heightTypeLabel,
  type BaseVertex,
  type GeorefResult,
  type HeightMode,
  type ObsPoint,
} from '../lib/georef'
import { parseAngle } from '../lib/guideAdjust'
import { baseFromCrd, decodeText, importPoints, parseCrd, parseDateTime, type CrdFile } from '../lib/georefImport'

const STORE = 'htopo.georef.v1'

interface OutSel {
  /** '' = no, 'auto' = origen recomendado, o código EPSG del origen. */
  gk: string
  utm: boolean
  cart: boolean
  cartOrigin: CartesianOrigin
}

const DEFAULT_OUT: OutSel = { gk: '', utm: false, cart: false, cartOrigin: CARTESIAN_PRESETS[0] }

interface Saved {
  bases: BaseVertex[]
  points: ObsPoint[]
  ubicacion: string
  heightMode: HeightMode
  velModel: VemosModel
  out: OutSel
}

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}')
    return {
      bases: s.bases ?? [],
      points: s.points ?? [],
      ubicacion: s.ubicacion ?? '',
      heightMode: s.heightMode ?? 'ajuste',
      velModel: s.velModel ?? 'VEMOS2022',
      out: { ...DEFAULT_OUT, ...(s.out ?? {}) },
    }
  } catch {
    return { bases: [], points: [], ubicacion: '', heightMode: 'ajuste', velModel: 'VEMOS2022', out: DEFAULT_OUT }
  }
}

const f3 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3))
const f4 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(4))

function Step({ n, title, children, hint, className = '' }: { n: number; title: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">{n}</span>
        <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      {hint && <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {children}
    </Card>
  )
}

function FitTo({ pts }: { pts: { lat: number; lon: number }[] }) {
  const map = useMap()
  const key = pts.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|')
  useEffect(() => {
    if (pts.length === 0) return
    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [40, 40], maxZoom: 15 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

export default function GeorefPage() {
  const [meta, setMeta] = useReportMeta()
  const [saved] = useState(loadSaved)
  const [bases, setBases] = useState<BaseVertex[]>(saved.bases)
  const [points, setPoints] = useState<ObsPoint[]>(saved.points)
  const [ubicacion, setUbicacion] = useState(saved.ubicacion)
  const [heightMode, setHeightMode] = useState<HeightMode>(saved.heightMode)
  const [velModel, setVelModel] = useState<VemosModel>(saved.velModel)
  const [out, setOut] = useState<OutSel>(saved.out)
  const [g04, setG04] = useState<GeoidGrid | null>(null)
  const [importInfo, setImportInfo] = useState<string[]>([])
  const [fallbackDate, setFallbackDate] = useState('')
  const [crd, setCrd] = useState<CrdFile | null>(null)
  const [crdPick, setCrdPick] = useState('')
  const [corsPick, setCorsPick] = useState('')
  const [corsMsg, setCorsMsg] = useState<string | null>(null)
  const [manual, setManual] = useState({ id: '', x: '', y: '', z: '', epoch: '', fuente: '' })
  const [qgrid, setQgrid] = useState<GeoidGrid | null>(null)
  const [leveling, setLeveling] = useState<Benchmark[] | null>(null)
  const [computed, setComputed] = useState<GeorefResult[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [xlsPassword, setXlsPassword] = useState('')
  const [logos, setLogos] = useClientLogos()
  const ptsFile = useRef<HTMLInputElement>(null)
  const crdFile = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ bases, points, ubicacion, heightMode, velModel, out }))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [bases, points, ubicacion, heightMode, velModel, out])

  useEffect(() => {
    loadGrid('qgeoidcol2023').then(setQgrid, () => {})
    loadLeveling().then(setLeveling, () => {})
  }, [])

  useEffect(() => {
    if (heightMode === 'geocol2004' && !g04) loadGrid('geocol2004').then(setG04, () => {})
  }, [heightMode, g04])

  useEffect(() => {
    let alive = true
    if (points.length === 0) return
    computeGeoref(points, { heightMode, velModel, qgrid, g04, leveling }).then(
      (r) => alive && setComputed(r),
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
  }, [points, heightMode, velModel, qgrid, g04, leveling])

  const systems = useMemo<OutputSys[]>(() => {
    const list: OutputSys[] = []
    const lons = points.map((p) => fromGeocentric(p.x, p.y, p.z).lon)
    const midLon = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : -74
    if (out.gk) list.push(sysFromCode(out.gk === 'auto' ? recommendedGkZone(midLon).code : out.gk))
    if (out.utm) list.push(sysFromCode(recommendedUtmZone(midLon).code))
    if (out.cart) list.push(cartesianSys(out.cartOrigin))
    return list
  }, [out, points])

  const results = useMemo(() => (points.length ? computed : []), [points.length, computed])

  /* ------------------------------- puntos ------------------------------- */

  async function onPointsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = importPoints(decodeText(await f.arrayBuffer()), fallbackDate || undefined)
    if (r.points.length) setPoints(r.points)
    setImportInfo([`${f.name}: formato ${r.format}, ${r.points.length} punto(s).`, ...r.warnings])
  }

  function rename(i: number, id: string) {
    setPoints((ps) => ps.map((p, k) => (k === i ? { ...p, id } : p)))
  }

  function setDate(i: number, s: string) {
    const d = parseDateTime(s)
    if (!d) return
    setPoints((ps) => ps.map((p, k) => (k === i ? { ...p, tObs: decimalYear(d), inicio: s, fin: '' } : p)))
  }

  /* -------------------------------- bases ------------------------------- */

  function addBase(b: BaseVertex) {
    setBases((bs) => [...bs.filter((x) => x.id !== b.id), b])
  }

  async function addCors() {
    if (!corsPick) return
    setCorsMsg('Consultando la última solución semanal del IGAC…')
    try {
      const list = await fetchIgacWeeklySolutions()
      const latest = list[0]
      const c = latest ? await fetchIgacWeeklyCoord(latest.name, corsPick) : null
      if (!c) {
        setCorsMsg(`${corsPick} no está en la solución semanal del IGAC (las estaciones SIRGAS-CON las publica SIRGAS): carga el archivo .crd de SIRGAS.`)
        return
      }
      const d = parseDateTime(c.epoch.replace(/(\d{4}-\d{2}-\d{2}).*/, '$1'))
      addBase({
        id: corsPick,
        tipo: 'CORS activa',
        x: c.xyz[0],
        y: c.xyz[1],
        z: c.xyz[2],
        epoch: d ? decimalYear(new Date(d.getTime() - 5 * 3600_000)) : null,
        fuente: `Solución semanal IGAC ${latest!.name} · ${c.frame} · época ${c.epoch}`,
      })
      setCorsMsg(null)
    } catch (e) {
      setCorsMsg(`No se pudo consultar el IGAC: ${(e as Error).message}`)
    }
  }

  async function onCrdFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setCrd(parseCrd(decodeText(await f.arrayBuffer()), f.name))
  }

  function addManual() {
    const x = Number(manual.x.replace(',', '.'))
    const y = Number(manual.y.replace(',', '.'))
    const z = Number(manual.z.replace(',', '.'))
    if (!manual.id.trim() || ![x, y, z].every(Number.isFinite)) return
    const ep = manual.epoch.trim()
    const d = parseDateTime(ep)
    addBase({
      id: manual.id.trim(),
      tipo: 'Pasiva',
      x,
      y,
      z,
      epoch: d ? decimalYear(d) : ep ? Number(ep.replace(',', '.')) || null : null,
      fuente: manual.fuente || 'Ajuste de red del proyecto',
    })
    setManual({ id: '', x: '', y: '', z: '', epoch: '', fuente: '' })
  }

  /* ------------------------------ descargas ----------------------------- */

  async function download(kind: 'xlsx' | 'pdf') {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'xlsx') {
        const { exportGeorefExcel } = await import('../lib/georefExcel')
        await exportGeorefExcel(
          { meta, ubicacion, bases, results, refEpoch: REF_EPOCH, heightMode, velModel, systems, logos },
          { password: xlsPassword, author: meta.responsable, matricula: meta.matricula },
        )
      } else {
        const [{ exportPdf }, { georefReportDoc }] = await Promise.all([import('../lib/guideReportExport'), import('../lib/georefPdf')])
        await exportPdf(georefReportDoc({ meta, ubicacion, bases, results, refEpoch: REF_EPOCH, heightMode, velModel, systems, logos }))
      }
    } catch (e) {
      setError(`No se pudo generar el archivo: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  function exportCsv() {
    const head = ['punto', 't_obs', 'X_obs', 'Y_obs', 'Z_obs', 'vN_mm_a', 'vE_mm_a', 'X_2018', 'Y_2018', 'Z_2018', 'lat_2018', 'lon_2018', 'h_2018', 'norte_ctm12', 'este_ctm12', 'cota', 'tipo_altura']
    const rows = results.map((r) =>
      [
        r.p.id, r.p.tObs.toFixed(4), r.p.x.toFixed(4), r.p.y.toFixed(4), r.p.z.toFixed(4),
        (r.vel.vn * 1000).toFixed(2), (r.vel.ve * 1000).toFixed(2),
        r.ref.x.toFixed(4), r.ref.y.toFixed(4), r.ref.z.toFixed(4), r.ref.lat.toFixed(9), r.ref.lon.toFixed(9), r.ref.h.toFixed(4),
        r.ref.north.toFixed(4), r.ref.east.toFixed(4), finalHeight(r, heightMode)?.toFixed(4) ?? '', heightTypeLabel(r, heightMode),
      ].join(','),
    )
    downloadText('coordenadas_finales_2018.csv', [head.join(','), ...rows].join('\n'), 'text/csv')
  }

  const mapPts = useMemo(
    () => [
      ...results.map((r) => ({ id: r.p.id, lat: r.obs.lat, lon: r.obs.lon, kind: 'p' as const })),
      ...bases.map((b) => {
        const g = fromGeocentric(b.x, b.y, b.z)
        return { id: b.id, lat: g.lat, lon: g.lon, kind: 'b' as const }
      }),
    ],
    [results, bases],
  )

  const dupIds = useMemo(() => {
    const s = new Set<string>()
    const d = new Set<string>()
    for (const p of points) (s.has(p.id) ? d : s).add(p.id)
    return d
  }, [points])

  return (
    <div>
      <PageHeader title="Georreferenciación — Reporte Final" />

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <ReportMetaCard meta={meta} onChange={setMeta} withObservaciones />
          <Card>
            <ClientLogosField logos={logos} onChange={setLogos} />
          </Card>
          <Card>
            <Field label="Ubicación de los puntos"><TextInput value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Anapoima, Cundinamarca" /></Field>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5 2xl:grid-cols-2">
          <Step n={1} className="2xl:col-span-2" title="Bases del post-proceso" hint="Las coordenadas con las que fijaste las bases en el software (última solución semanal). Quedan documentadas en el reporte.">
            {bases.length > 0 && (
              <div className="mb-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                      <th className="py-1.5 pr-2 font-medium">Base</th><th className="py-1.5 pr-2 font-medium">Tipo</th>
                      <th className="py-1.5 pr-2 text-right font-medium">X</th><th className="py-1.5 pr-2 text-right font-medium">Y</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Z</th><th className="py-1.5 pr-2 text-right font-medium">Época</th>
                      <th className="py-1.5 pr-2 font-medium">Fuente</th><th />
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {bases.map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-2 font-semibold">{b.id}</td>
                        <td className="py-1.5 pr-2">
                          <select value={b.tipo} onChange={(e) => addBase({ ...b, tipo: e.target.value as BaseVertex['tipo'] })} className="rounded border border-slate-300 bg-transparent px-1 text-xs dark:border-slate-700">
                            <option>CORS activa</option><option>Pasiva</option>
                          </select>
                        </td>
                        <td className="py-1.5 pr-2 text-right">{f4(b.x)}</td><td className="py-1.5 pr-2 text-right">{f4(b.y)}</td>
                        <td className="py-1.5 pr-2 text-right">{f4(b.z)}</td><td className="py-1.5 pr-2 text-right">{f4(b.epoch)}</td>
                        <td className="max-w-64 truncate py-1.5 pr-2 font-sans text-xs text-slate-500" title={b.fuente}>{b.fuente}</td>
                        <td><button onClick={() => setBases((bs) => bs.filter((x) => x.id !== b.id))} className="text-xs text-rose-600 hover:underline">Quitar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">CORS MAGNA-ECO (solución IGAC)</p>
                <Select value={corsPick} onChange={(e) => setCorsPick(e.target.value)}>
                  <option value="">Elige la estación…</option>
                  {ACTIVE_STATIONS.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
                </Select>
                <Button variant="secondary" onClick={addCors} disabled={!corsPick} className="w-full">Agregar</Button>
                {corsMsg && <p className="text-xs text-slate-600 dark:text-slate-400">{corsMsg}</p>}
              </div>
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Archivo .CRD (SIRGAS o IGAC)</p>
                <Button variant="secondary" onClick={() => crdFile.current?.click()} className="w-full">{crd ? crd.label : 'Cargar .crd'}</Button>
                <input ref={crdFile} type="file" accept=".crd,.CRD,.txt" className="hidden" onChange={onCrdFile} />
                {crd && (
                  <>
                    <p className="text-xs text-slate-500">{crd.stations.size} estaciones · {crd.frame} · época {crd.epochText}</p>
                    <div className="flex gap-2">
                      <TextInput list="crd-ids" value={crdPick} onChange={(e) => setCrdPick(e.target.value.toUpperCase())} placeholder="ABCC" />
                      <datalist id="crd-ids">{[...crd.stations.keys()].map((k) => <option key={k} value={k} />)}</datalist>
                      <Button variant="secondary" onClick={() => { const b = baseFromCrd(crdPick, crd); if (b) { addBase(b); setCrdPick('') } }} disabled={!crd.stations.has(crdPick)}>+</Button>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Base pasiva / manual</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <TextInput value={manual.id} onChange={(e) => setManual({ ...manual, id: e.target.value })} placeholder="Nombre" />
                  <TextInput value={manual.epoch} onChange={(e) => setManual({ ...manual, epoch: e.target.value })} placeholder="Época / fecha" />
                  <TextInput value={manual.x} onChange={(e) => setManual({ ...manual, x: e.target.value })} placeholder="X" />
                  <TextInput value={manual.y} onChange={(e) => setManual({ ...manual, y: e.target.value })} placeholder="Y" />
                  <TextInput value={manual.z} onChange={(e) => setManual({ ...manual, z: e.target.value })} placeholder="Z" />
                  <Button variant="secondary" onClick={addManual}>Agregar</Button>
                </div>
              </div>
            </div>
          </Step>

          <Step n={2} className="2xl:col-span-2" title="Puntos del post-proceso" hint="Exportación CSV de Leica Infinity (con fecha y hora de cada sesión) o CSV genérico con encabezado: id, fecha, hora, X, Y, Z (o lat, lon, h).">
            <div className="flex flex-wrap items-end gap-3">
              <Button onClick={() => ptsFile.current?.click()}>Cargar archivo de puntos</Button>
              <input ref={ptsFile} type="file" accept=".csv,.txt" className="hidden" onChange={onPointsFile} />
              <Field label="Fecha si el archivo no la trae">
                <TextInput type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} />
              </Field>
              {points.length > 0 && <Button variant="ghost" onClick={() => setPoints([])}>Vaciar</Button>}
            </div>
            {importInfo.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">{importInfo.map((t) => <li key={t}>• {t}</li>)}</ul>
            )}
            {points.length > 0 && (
              <div className="mt-3 max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[#1f2124]">
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                      <th className="py-1.5 pr-2 font-medium">Nombre (editable)</th><th className="py-1.5 pr-2 font-medium">Sesión</th>
                      <th className="py-1.5 pr-2 text-right font-medium">t_obs</th><th className="py-1.5 pr-2 text-right font-medium">X</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Y</th><th className="py-1.5 pr-2 text-right font-medium">Z</th>
                      <th className="py-1.5 font-medium">Base · antena</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {points.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1 pr-2">
                          <input value={p.id} onChange={(e) => rename(i, e.target.value)} className={`w-36 rounded border px-1.5 py-0.5 font-sans text-sm ${dupIds.has(p.id) ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'} bg-transparent`} />
                        </td>
                        <td className="py-1 pr-2 font-sans text-xs text-slate-500">
                          {p.inicio ? `${p.inicio}${p.fin ? ` → ${p.fin.slice(11)}` : ''}` : (
                            <input type="date" onChange={(e) => setDate(i, e.target.value)} className="rounded border border-rose-400 bg-transparent px-1 text-xs" />
                          )}
                        </td>
                        <td className="py-1 pr-2 text-right">{p.tObs.toFixed(4)}</td>
                        <td className="py-1 pr-2 text-right">{f4(p.x)}</td><td className="py-1 pr-2 text-right">{f4(p.y)}</td><td className="py-1 pr-2 text-right">{f4(p.z)}</td>
                        <td className="py-1 font-sans text-xs text-slate-500">{[p.base, p.antena, p.alturaAntena != null ? `${p.alturaAntena} m` : ''].filter(Boolean).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Step>

          <Step n={3} title="Cambio de época y sistema de coordenadas">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Modelo de velocidades" hint="El cambio de época usa un modelo de velocidades (no un modelo geoidal).">
                <Select value={velModel} onChange={(e) => setVelModel(e.target.value as VemosModel)}>
                  {VEMOS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Época de referencia">
                <TextInput value={`MAGNA-SIRGAS ${REF_EPOCH.toFixed(1)} (ITRF2014)`} readOnly />
              </Field>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-medium text-slate-700 dark:text-slate-300">Coordenadas planas del reporte final</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked readOnly className="size-4 accent-brand-600" /> Origen Nacional CTM12 (oficial, siempre incluido)</label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!out.gk} onChange={(e) => setOut({ ...out, gk: e.target.checked ? 'auto' : '' })} className="size-4 accent-brand-600" />
                  Gauss-Krüger MAGNA-SIRGAS
                </label>
                {out.gk && (
                  <Select value={out.gk} onChange={(e) => setOut({ ...out, gk: e.target.value })} className="!w-auto">
                    <option value="auto">Origen recomendado según la zona</option>
                    {PROJECTED_CRS.filter((c) => c.kind === 'gk').map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </Select>
                )}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={out.utm} onChange={(e) => setOut({ ...out, utm: e.target.checked })} className="size-4 accent-brand-600" />
                UTM (zona según la ubicación)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={out.cart} onChange={(e) => setOut({ ...out, cart: e.target.checked })} className="size-4 accent-brand-600" />
                Planas cartesianas locales (origen municipal IGAC)
              </label>
              {out.cart && (
                <div className="ml-6 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Origen:</span>
                    {CARTESIAN_PRESETS.map((o) => (
                      <Button key={o.name} variant="secondary" onClick={() => setOut({ ...out, cartOrigin: o })}>{o.name}</Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                    {(
                      [
                        ['name', 'Nombre'],
                        ['lat0', 'Latitud origen (°)'],
                        ['lon0', 'Longitud origen (°)'],
                        ['fn', 'Falso Norte (m)'],
                        ['fe', 'Falso Este (m)'],
                        ['h0', 'Altura plano (m)'],
                      ] as const
                    ).map(([k, label]) => (
                      <Field key={k} label={label}>
                        <TextInput
                          defaultValue={String(out.cartOrigin[k])}
                          key={`${out.cartOrigin.name}-${k}`}
                          onBlur={(e) => {
                            const raw = e.target.value
                            const v =
                              k === 'name' ? raw : k === 'lat0' || k === 'lon0' ? parseAngle(raw, k === 'lat0' ? 'lat' : 'lon') ?? NaN : Number(raw.replace(',', '.'))
                            if (k !== 'name' && !Number.isFinite(v as number)) return
                            setOut({ ...out, cartOrigin: { ...out.cartOrigin, [k]: v } })
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Método «Colombia Urban» (EPSG 1052). Usa el origen del municipio según el IGAC. Latitud y longitud del
                    origen en grados decimales o G M S con hemisferio (p. ej. 4 40 49.75 N · 74 08 47.73 W).
                  </p>
                </div>
              )}
            </div>
          </Step>

          <Step n={4} title="Alturas">
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['ajuste', 'QGeoidCOL2023 ajustada a la red de nivelación (recomendado)'],
                  ['modelo', 'Solo modelo QGeoidCOL2023 (h − ζ)'],
                  ['software', 'GEOCOL2004 del software de post-proceso (h − N de Infinity)'],
                  ['geocol2004', 'GEOCOL2004 de la rejilla ISG (h − N)'],
                  ['ninguna', 'Sin alturas físicas'],
                ] as const
              )
                .filter(([v]) => v !== 'software' || points.some((p) => p.geoidSepSoftware != null))
                .map(([v, l]) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" checked={heightMode === v} onChange={() => setHeightMode(v)} className="size-4 accent-brand-600" />
                  {l}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Si ocupaste placas de nivelación (NP) y debes cumplir la Guía del IGAC, calcula las cotas en el módulo{' '}
              <a href="#/alturas" className="font-medium text-slate-700 underline dark:text-slate-200">Alturas → Campaña e informe</a>.
            </p>
          </Step>

          {results.length > 0 && (
            <Step n={5} className="2xl:col-span-2" title={`Coordenadas finales — época ${REF_EPOCH.toFixed(1)}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                      <th className="py-1.5 pr-2 font-medium">Punto</th><th className="py-1.5 pr-2 text-right font-medium">t_obs</th>
                      <th className="py-1.5 pr-2 text-right font-medium">vN / vE (mm/a)</th><th className="py-1.5 pr-2 text-right font-medium">Desplaz. (m)</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Norte CTM12</th><th className="py-1.5 pr-2 text-right font-medium">Este CTM12</th>
                      {systems.map((y) => (
                        <th key={y.id} colSpan={2} className="py-1.5 pr-2 text-right font-medium">Norte · Este {y.short}</th>
                      ))}
                      <th className="py-1.5 pr-2 text-right font-medium">Cota</th><th className="py-1.5 font-medium">Tipo de altura</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {results.map((r) => (
                      <tr key={r.p.id + r.p.tObs} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-2 font-sans font-semibold">{r.p.id}</td>
                        <td className="py-1.5 pr-2 text-right">{r.p.tObs.toFixed(4)}</td>
                        <td className="py-1.5 pr-2 text-right">{(r.vel.vn * 1000).toFixed(1)} / {(r.vel.ve * 1000).toFixed(1)}</td>
                        <td className="py-1.5 pr-2 text-right">{Math.hypot(r.disp.x, r.disp.y, r.disp.z).toFixed(3)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold">{f3(r.ref.north)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold">{f3(r.ref.east)}</td>
                        {systems.map((y) => {
                          const o = projectOut(y, r.ref.lat, r.ref.lon)
                          return [
                            <td key={y.id + 'n'} className="py-1.5 pr-2 text-right">{f3(o.north)}</td>,
                            <td key={y.id + 'e'} className="py-1.5 pr-2 text-right">{f3(o.east)}</td>,
                          ]
                        })}
                        <td className="py-1.5 pr-2 text-right font-semibold">{f3(finalHeight(r, heightMode))}</td>
                        <td className="py-1.5 font-sans text-xs text-slate-500">{heightTypeLabel(r, heightMode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {velModel} · Δt = t_obs − {REF_EPOCH.toFixed(1)} · D = V·Δt · X₂₀₁₈ = X − D. El detalle (velocidades, desplazamientos y fórmulas) va en el Excel.
              </p>
            </Step>
          )}

          {mapPts.length > 0 && (
            <div className="relative h-[28rem] overflow-hidden rounded-xl 2xl:h-auto 2xl:min-h-[24rem] border border-slate-200 dark:border-slate-800">
              <MapContainer center={[4.6, -74.1]} zoom={8} style={{ height: '100%', width: '100%' }}>
                <BaseLayers />
                <FullscreenButton />
                <FitTo pts={mapPts} />
                {mapPts.map((m) => (
                  <CircleMarker
                    key={m.kind + m.id}
                    center={[m.lat, m.lon]}
                    radius={m.kind === 'b' ? 9 : 6}
                    pathOptions={{ color: '#ffffff', weight: 2, fillColor: m.kind === 'b' ? '#15803d' : '#dc2626', fillOpacity: 0.95 }}
                  >
                    <Popup>{m.kind === 'b' ? `Base ${m.id}` : m.id}</Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          )}

          {results.length > 0 && (
            <Step n={6} title="Descargar el reporte">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => download('xlsx')} disabled={busy != null || dupIds.size > 0}>{busy === 'xlsx' ? 'Generando…' : 'Excel de entrega (.xlsx)'}</Button>
                <Button onClick={() => download('pdf')} disabled={busy != null || dupIds.size > 0}>{busy === 'pdf' ? 'Generando…' : 'PDF'}</Button>
                <Button variant="secondary" onClick={exportCsv}>CSV</Button>
              </div>
              <div className="mt-3"><ExcelProtectField value={xlsPassword} onChange={setXlsPassword} /></div>
              {dupIds.size > 0 && <p className="mt-2 text-xs text-rose-600">Hay nombres de punto repetidos ({[...dupIds].join(', ')}): renómbralos antes de descargar.</p>}
              {bases.length === 0 && <p className="mt-2 text-xs text-amber-700">Aún no agregaste las bases: el reporte quedará sin esa sección documentada.</p>}
              {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            </Step>
          )}
        </div>
      </div>
    </div>
  )
}
