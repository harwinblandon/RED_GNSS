import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, Card, Field, TextInput, Select, DataRow, ExternalLink, Button } from '../components/ui'
import { CoordinateEntry, type Geodetic } from '../components/CoordinateEntry'
import { parseCoordinates, type ParsedPoint, type ParseResult } from '../lib/coordParse'
import { loadVemos, velocityAt, type VemosMeta, type Velocity } from '../lib/vemos'
import { MAGNA_SIRGAS_EPOCH, propagate, decimalYear } from '../lib/epoch'
import {
  PROJECTED_CRS,
  project,
  toGeocentric,
  recommendedGkZone,
  recommendedUtmZone,
} from '../lib/coords'
import { formatDms } from '../lib/format'
import { downloadText } from '../lib/planning'
import { isoDate } from '../lib/gpsTime'
import { buildEpochReport } from '../lib/epochReport'

/** Familia de entrada: los sistemas planos (EPSG:*, UTM*) comparten formato. */
const familyOf = (s: string) =>
  s === 'auto' || s === 'geo-dec' || s === 'geo-dms' || s === 'ecef' ? s : 'proj'

const EXAMPLES: Record<string, string> = {
  auto: `id,lat,lon,h\nP1,4.596200,-74.077508,2550\nP2,10.391335,-75.533853,4.06`,
  'geo-dec': `id,lat,lon,h\nP1,4.596200,-74.077508,2550\nP2,10.391335,-75.533853,4.06`,
  'geo-dms': `id, lat N/S  lon E/W  [h]\nP1, 4 35 46.3 N  74 04 39.0 W  2550\nP2, 10 23 28.8 N  75 32 01.9 W  4.06`,
  ecef: `id,X,Y,Z\nP1,1744865.220,-6116283.189,507891.840`,
  proj: `id,Este,Norte,h\nP1,4880524.169,2065965.397,2550`,
}

const HINTS: Record<string, string> = {
  auto: 'Una por línea: [id,] lat, lon [, h]  ó  [id,] X, Y, Z. Separador coma, ; , tab o espacios.',
  'geo-dec': 'Una por línea: [id,] latitud, longitud [, altura elipsoidal]. Longitud negativa al oeste.',
  'geo-dms': `Una por línea: [id,] <lat> N/S  <lon> E/W  [altura]. Acepta ° ' " y comas.`,
  ecef: 'Una por línea: [id,] X, Y, Z (metros).',
  proj: 'Una por línea: [id,] Este, Norte [, altura elipsoidal] (metros).',
}

const exampleFor = (s: string) => EXAMPLES[familyOf(s)]
const hintFor = (s: string) => HINTS[familyOf(s)]

interface QueueItem {
  id: string
  lat: number
  lon: number
  h: number
  entrada: string
}

const QUEUE_KEY = 'htopo.epoca.lista'

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => Number.isFinite(x?.lat) && Number.isFinite(x?.lon)) : []
  } catch {
    return []
  }
}

function saveQueue(q: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Incrementa el sufijo numérico de un identificador ("P1" → "P2"). */
function nextId(id: string, fallbackIndex: number): string {
  const m = id.match(/^(.*?)(\d+)\s*$/)
  return m ? `${m[1]}${Number(m[2]) + 1}` : `P${fallbackIndex + 1}`
}

function systemLabel(s: string): string {
  if (s === 'auto') return 'auto'
  if (s === 'geo-dec') return 'geográficas (grados)'
  if (s === 'geo-dms') return `geográficas (G° M' S")`
  if (s === 'ecef') return 'geocéntricas'
  return PROJECTED_CRS.find((c) => c.code === s)?.label ?? s
}

/** Acepta "2018.4" o "2018-05-26" → año decimal. */
function parseEpoch(s: string): number | null {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return decimalYear(new Date(`${t}T00:00:00Z`))
  const n = Number(t)
  return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null
}

interface ResultRow {
  point: ParsedPoint
  vel: Velocity
  lat: number
  lon: number
  h: number
  shiftNEU: [number, number, number]
  xyz: { x: number; y: number; z: number }
  ctm12: { easting: number; northing: number }
  gk: { code: string; label: string; easting: number; northing: number }
  utm: { code: string; label: string; easting: number; northing: number }
  entrada: string
}

export default function EpochTransformPage() {
  const [meta, setMeta] = useState<VemosMeta | null>(null)
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [text, setText] = useState('')
  const [system, setSystem] = useState('auto')
  const [entrySystem, setEntrySystem] = useState('geo-dms')
  const [singleGeo, setSingleGeo] = useState<Geodetic | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>(() => loadQueue())
  const [singleId, setSingleId] = useState(() =>
    queue.length ? nextId(queue[queue.length - 1].id, queue.length) : 'P1',
  )
  const onSingleGeo = useCallback((g: Geodetic | null) => setSingleGeo(g), [])
  const [fromStr, setFromStr] = useState(String(MAGNA_SIRGAS_EPOCH))
  const [toStr, setToStr] = useState(isoDate(new Date()))
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadVemos().then(setMeta).catch(() => setMsg('No se pudo cargar el modelo VEMOS.'))
  }, [])

  const fromEpoch = parseEpoch(fromStr)
  const toEpoch = parseEpoch(toStr)

  /** Puntos del modo manual: la lista guardada + el punto en edición (si es válido y su id no está ya). */
  const { singlePoints, entradaById } = useMemo(() => {
    const points: ParsedPoint[] = []
    const map = new Map<string, string>()
    for (const it of queue) {
      points.push({ id: it.id, lat: it.lat, lon: it.lon, h: it.h, kind: 'geo' })
      map.set(it.id, it.entrada)
    }
    if (singleGeo) {
      const id = singleId.trim() || `P${points.length + 1}`
      if (!map.has(id)) {
        points.push({ id, lat: singleGeo.lat, lon: singleGeo.lon, h: singleGeo.h, kind: 'geo' })
        map.set(id, systemLabel(entrySystem))
      }
    }
    return { singlePoints: points, entradaById: map }
  }, [queue, singleGeo, singleId, entrySystem])

  const parsed = useMemo<ParseResult>(() => {
    if (mode === 'batch') return parseCoordinates(text, system)
    if (singlePoints.length === 0) return { points: [], errors: ['Completa las coordenadas.'] }
    return { points: singlePoints, errors: [] }
  }, [mode, text, system, singlePoints])

  const entradaLabel = systemLabel(mode === 'single' ? entrySystem : system)

  function addToQueue() {
    if (!singleGeo) {
      setMsg('Completa el punto antes de agregarlo a la lista.')
      return
    }
    const id = singleId.trim() || `P${queue.length + 1}`
    const next = [
      ...queue.filter((q) => q.id !== id),
      { id, lat: singleGeo.lat, lon: singleGeo.lon, h: singleGeo.h, entrada: systemLabel(entrySystem) },
    ]
    setQueue(next)
    saveQueue(next)
    setSingleId(nextId(id, next.length))
    setMsg(null)
  }

  function removeFromQueue(id: string) {
    const next = queue.filter((q) => q.id !== id)
    setQueue(next)
    saveQueue(next)
  }

  function clearQueue() {
    setQueue([])
    saveQueue([])
  }

  async function transform() {
    if (fromEpoch == null || toEpoch == null) {
      setMsg('Épocas no válidas. Usa año decimal (2018.4) o fecha (2026-09-08).')
      return
    }
    if (parsed.points.length === 0) {
      setMsg(parsed.errors[0] ?? 'Ingresa al menos un punto.')
      return
    }
    setBusy(true)
    setMsg(null)
    const out: ResultRow[] = []
    for (const p of parsed.points) {
      const vel = await velocityAt(p.lat, p.lon)
      const pr = propagate(p.lat, p.lon, p.h, [vel.vn, vel.ve, vel.vu], fromEpoch, toEpoch)
      const gk = recommendedGkZone(pr.lon)
      const utm = recommendedUtmZone(pr.lon)
      const pGk = project(pr.lat, pr.lon, gk.code)
      const pUtm = project(pr.lat, pr.lon, utm.code)
      out.push({
        point: p,
        vel,
        lat: pr.lat,
        lon: pr.lon,
        h: pr.h,
        shiftNEU: pr.shiftNEU,
        xyz: toGeocentric(pr.lat, pr.lon, pr.h),
        ctm12: project(pr.lat, pr.lon, 'EPSG:9377'),
        gk: { code: gk.code, label: gk.label, easting: pGk.easting, northing: pGk.northing },
        utm: { code: utm.code, label: utm.label.replace(' (GRS80)', ''), easting: pUtm.easting, northing: pUtm.northing },
        entrada: mode === 'single' ? entradaById.get(p.id) ?? entradaLabel : entradaLabel,
      })
    }
    setRows(out)
    if (meta) {
      setReport(
        buildEpochReport({
          meta,
          fromEpoch,
          toEpoch,
          toInput: toStr,
          generated: new Date(),
          points: out.map((r) => ({
            id: r.point.id,
            entrada: r.entrada,
            in: { lat: r.point.lat, lon: r.point.lon, h: r.point.h },
            vel: r.vel,
            shiftNEU: r.shiftNEU,
            out: { lat: r.lat, lon: r.lon, h: r.h },
            xyz: r.xyz,
            ctm12: r.ctm12,
            gk: r.gk,
            utm: r.utm,
          })),
        }),
      )
    }
    setBusy(false)
    if (parsed.errors.length) setMsg(`${parsed.errors.length} fila(s) con problemas: ${parsed.errors[0]}`)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(setText)
  }

  function exportCsv() {
    if (!rows) return
    const head = [
      'id', 'lat', 'lon', 'h_elip', 'X', 'Y', 'Z',
      'ctm12_E', 'ctm12_N', 'gk_E', 'gk_N', 'utm_E', 'utm_N',
      'vN_mm_a', 'vE_mm_a', 'epoca_origen', 'epoca_destino',
    ]
    const lines = rows.map((r) =>
      [
        r.point.id, r.lat.toFixed(9), r.lon.toFixed(9), r.h.toFixed(4),
        r.xyz.x.toFixed(4), r.xyz.y.toFixed(4), r.xyz.z.toFixed(4),
        r.ctm12.easting.toFixed(4), r.ctm12.northing.toFixed(4),
        r.gk.easting.toFixed(4), r.gk.northing.toFixed(4),
        r.utm.easting.toFixed(4), r.utm.northing.toFixed(4),
        (r.vel.vn * 1000).toFixed(2), (r.vel.ve * 1000).toFixed(2),
        fromEpoch?.toFixed(4), toEpoch?.toFixed(4),
      ].join(','),
    )
    downloadText(`epoca_${toEpoch?.toFixed(2)}.csv`, [head.join(','), ...lines].join('\n'), 'text/csv')
  }

  return (
    <div>
      <PageHeader
        title="Transformación de época"
        subtitle="Propaga coordenadas entre épocas con el modelo de velocidades VEMOS2022 de SIRGAS. Entrega geográficas, geocéntricas y planas en la época destino."
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Época origen" hint="Año decimal o fecha.">
                  <TextInput value={fromStr} onChange={(e) => setFromStr(e.target.value)} placeholder="2018.4" />
                </Field>
                <Field label="Época destino" hint="Año decimal o fecha.">
                  <TextInput value={toStr} onChange={(e) => setToStr(e.target.value)} placeholder="2026-09-08" />
                </Field>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Las coordenadas oficiales del IGAC están en <strong>MAGNA-SIRGAS época 2018.4</strong>.
              </p>
            </div>
          </Card>

          <Card>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
              {(['single', 'batch'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    mode === m
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {m === 'single' ? 'Un punto' : 'Varios / archivo'}
                </button>
              ))}
            </div>

            {mode === 'single' ? (
              <>
                <CoordinateEntry
                  system={entrySystem}
                  onSystemChange={setEntrySystem}
                  onChange={onSingleGeo}
                  idValue={singleId}
                  onIdChange={setSingleId}
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={addToQueue} disabled={!singleGeo}>
                    + Agregar a la lista
                  </Button>
                  {queue.length > 0 && (
                    <Button variant="ghost" onClick={clearQueue}>
                      Limpiar lista
                    </Button>
                  )}
                </div>

                {queue.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <p className="border-b border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Lista de puntos ({queue.length})
                    </p>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {queue.map((q) => (
                        <li key={q.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                          <span className="min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{q.id}</span>{' '}
                            <span className="tabular text-slate-500 dark:text-slate-400">
                              {formatDms(q.lat, 'lat')} · {formatDms(q.lon, 'lon')} · {q.h.toFixed(3)} m
                            </span>
                          </span>
                          <button
                            onClick={() => removeFromQueue(q.id)}
                            className="shrink-0 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                            aria-label={`Quitar ${q.id}`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Agrega los puntos uno a uno; la lista se guarda en este navegador. Al
                  transformar se procesan todos juntos (lista + el punto en pantalla).
                </p>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <Field label="Sistema de entrada">
                    <Select value={system} onChange={(e) => setSystem(e.target.value)}>
                      <option value="auto">Auto (geográficas o geocéntricas)</option>
                      <option value="geo-dec">Geográficas (grados decimales)</option>
                      <option value="geo-dms">Geográficas (G° M' S&quot;)</option>
                      <option value="ecef">Geocéntricas (X, Y, Z)</option>
                      {PROJECTED_CRS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Coordenadas" hint={hintFor(system)}>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    placeholder={exampleFor(system)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </Field>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
                  <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                    Cargar CSV / TXT
                  </Button>
                  <Button variant="secondary" onClick={() => setText(exampleFor(system))}>
                    Ejemplo
                  </Button>
                </div>
                {text && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {parsed.points.length} punto(s) leído(s)
                    {parsed.errors.length ? ` · ${parsed.errors.length} con problemas` : ''}
                  </p>
                )}
              </>
            )}

            <Button onClick={transform} disabled={busy || parsed.points.length === 0} className="mt-3 w-full">
              {busy
                ? 'Calculando…'
                : parsed.points.length > 1
                  ? `Transformar ${parsed.points.length} puntos`
                  : 'Transformar'}
            </Button>
          </Card>

          {meta && (
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Modelo</h3>
              <DataRow label="Modelo" value={meta.model} />
              <DataRow label="Marco" value={meta.frame} />
              <DataRow label="Intervalo de datos" value={meta.timespan} />
              <DataRow label="Rejilla" value="1° × 1° · horizontal" />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {meta.citation}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                <ExternalLink href={meta.source}>Archivo VEMOS2022 (SIRGAS)</ExternalLink>
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Al transformar se genera una <strong>memoria de cálculo</strong> con todo el
                sustento para el informe.
              </p>
            </Card>
          )}
        </div>

        <div>
          {msg && (
            <Card className="mb-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">{msg}</p>
            </Card>
          )}

          {!rows && (
            <Card>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ingresa coordenadas y las épocas, y pulsa <strong>Transformar</strong>. El
                resultado queda en la época destino, en el marco {meta?.frame ?? 'ITRF2020'}{' '}
                (≈ MAGNA-SIRGAS a nivel de cm dentro de Colombia; es una propagación por
                velocidad, no una transformación de datum completa).
              </p>
            </Card>
          )}

          {rows && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {rows.length} punto(s) · época {toEpoch?.toFixed(3)}
                </p>
                <Button variant="secondary" onClick={exportCsv}>Descargar CSV</Button>
              </div>
              <div className="space-y-4">
                {rows.map((r) => <ResultCard key={r.point.id} r={r} />)}
              </div>

              {report && <ReportPanel text={report} epoch={toEpoch} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReportPanel({ text, epoch }: { text: string; epoch: number | null }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }
  return (
    <Card className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          Memoria de cálculo (sustento del modelo)
        </h3>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copy}>
            {copied ? '¡Copiado!' : 'Copiar'}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(`memoria_epoca_${epoch?.toFixed(2) ?? 'calc'}.txt`, text, 'text/plain')
            }
          >
            Descargar .txt
          </Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Texto listo para pegar en un informe: modelo VEMOS2022 y su cita, método de
        propagación, épocas, nodos de la rejilla y pesos usados, velocidad, desplazamiento
        y parámetros de cada proyección.
      </p>
      <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed whitespace-pre text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
        {text}
      </pre>
    </Card>
  )
}

function ResultCard({ r }: { r: ResultRow }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white">{r.point.id}</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">entrada: {r.entrada}</span>
      </div>
      <div className="mt-2">
        <DataRow label="Latitud" value={formatDms(r.lat, 'lat')} />
        <DataRow label="Longitud" value={formatDms(r.lon, 'lon')} />
        <DataRow label="Lat / Lon (dec.)" value={`${r.lat.toFixed(8)} · ${r.lon.toFixed(8)}`} />
        <DataRow label="Altura elipsoidal" value={`${r.h.toFixed(3)} m`} />
        <DataRow label="X · Y · Z" value={`${r.xyz.x.toFixed(3)} · ${r.xyz.y.toFixed(3)} · ${r.xyz.z.toFixed(3)} m`} />
        <DataRow label="CTM12" value={`${r.ctm12.easting.toFixed(3)} E · ${r.ctm12.northing.toFixed(3)} N`} />
        <DataRow label={r.gk.label} value={`${r.gk.easting.toFixed(3)} E · ${r.gk.northing.toFixed(3)} N`} />
        <DataRow label={r.utm.label} value={`${r.utm.easting.toFixed(3)} E · ${r.utm.northing.toFixed(3)} N`} />
        <DataRow
          label="Velocidad (VEMOS2022)"
          value={`N ${(r.vel.vn * 1000).toFixed(1)} · E ${(r.vel.ve * 1000).toFixed(1)} mm/a${r.vel.extrapolated ? ' (nodo más cercano)' : ''}`}
        />
      </div>
    </Card>
  )
}
