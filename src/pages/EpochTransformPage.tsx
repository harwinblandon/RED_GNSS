import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, Card, Field, TextInput, DataRow, ExternalLink, Button } from '../components/ui'
import { parseCoordinates, type ParsedPoint } from '../lib/coordParse'
import { loadVemos, velocityAt, type VemosMeta, type Velocity } from '../lib/vemos'
import { MAGNA_SIRGAS_EPOCH, propagate, decimalYear } from '../lib/epoch'
import {
  project,
  toGeocentric,
  recommendedGkZone,
  recommendedUtmZone,
} from '../lib/coords'
import { formatDms } from '../lib/format'
import { downloadText } from '../lib/planning'
import { isoDate } from '../lib/gpsTime'

const EXAMPLE = `id,lat,lon,h
P1,4.596200,-74.077508,2550
P2,10.391335,-75.533853,4.06`

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
  xyz: { x: number; y: number; z: number }
  ctm12: { easting: number; northing: number }
  gk: { label: string; easting: number; northing: number }
  utm: { label: string; easting: number; northing: number }
}

export default function EpochTransformPage() {
  const [meta, setMeta] = useState<VemosMeta | null>(null)
  const [text, setText] = useState('')
  const [fromStr, setFromStr] = useState(String(MAGNA_SIRGAS_EPOCH))
  const [toStr, setToStr] = useState(isoDate(new Date()))
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadVemos().then(setMeta).catch(() => setMsg('No se pudo cargar el modelo VEMOS.'))
  }, [])

  const fromEpoch = parseEpoch(fromStr)
  const toEpoch = parseEpoch(toStr)

  const parsed = useMemo(() => parseCoordinates(text), [text])

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
        xyz: toGeocentric(pr.lat, pr.lon, pr.h),
        ctm12: project(pr.lat, pr.lon, 'EPSG:9377'),
        gk: { label: gk.label, easting: pGk.easting, northing: pGk.northing },
        utm: { label: utm.label.replace(' (GRS80)', ''), easting: pUtm.easting, northing: pUtm.northing },
      })
    }
    setRows(out)
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
            <Field
              label="Coordenadas"
              hint="Una por línea: [id,] lat, lon [, h]  ó  [id,] X, Y, Z. Separador coma, ; , tab o espacios."
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={EXAMPLE}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>
            <div className="mt-2 flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Cargar CSV / TXT
              </Button>
              <Button variant="secondary" onClick={() => setText(EXAMPLE)}>
                Ejemplo
              </Button>
            </div>
            {text && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {parsed.points.length} punto(s) leído(s)
                {parsed.errors.length ? ` · ${parsed.errors.length} con problemas` : ''}
              </p>
            )}
            <Button onClick={transform} disabled={busy || parsed.points.length === 0} className="mt-3 w-full">
              {busy ? 'Calculando…' : 'Transformar'}
            </Button>
          </Card>

          {meta && (
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Modelo</h3>
              <DataRow label="Modelo" value={meta.model} />
              <DataRow label="Marco" value={meta.frame} />
              <DataRow label="Intervalo" value={meta.timespan} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Solo velocidades horizontales (vertical = 0). Rejilla 1°×1°, interpolación bilineal.{' '}
                <ExternalLink href="https://sirgas.ipgh.org/en/products/vemos/">VEMOS (SIRGAS)</ExternalLink>.
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultCard({ r }: { r: ResultRow }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white">{r.point.id}</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          entrada: {r.point.kind === 'xyz' ? 'geocéntricas' : 'geográficas'}
        </span>
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
