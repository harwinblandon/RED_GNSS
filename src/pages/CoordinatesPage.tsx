import { useMemo, useState } from 'react'
import { PageHeader, Card, Field, TextInput, Select, DataRow, ExternalLink } from '../components/ui'
import {
  PROJECTED_CRS,
  project,
  unproject,
  toGeocentric,
  recommendedGkZone,
  recommendedUtmZone,
} from '../lib/coords'
import { formatDms } from '../lib/format'

export default function CoordinatesPage() {
  const [mode, setMode] = useState<'fwd' | 'inv'>('fwd')
  return (
    <div>
      <PageHeader
        title="Conversión de coordenadas"
        status="beta"
        subtitle="Entre coordenadas geográficas MAGNA-SIRGAS y los sistemas planos usados en Colombia: Origen Nacional CTM12, Gauss-Krüger (5 orígenes), UTM y geocéntricas."
      />

      <div className="mb-6 inline-flex rounded-lg border border-slate-300 p-1 dark:border-slate-700">
        <Tab active={mode === 'fwd'} onClick={() => setMode('fwd')}>Geográficas → planas</Tab>
        <Tab active={mode === 'inv'} onClick={() => setMode('inv')}>Planas → geográficas</Tab>
      </div>

      {mode === 'fwd' ? <Forward /> : <Inverse />}

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Cálculo con proj4js sobre el elipsoide GRS80. El Origen Nacional CTM12 (EPSG:9377)
        es el sistema plano vigente según la{' '}
        <ExternalLink href="https://www.igac.gov.co/">Resolución IGAC 471 de 2020</ExternalLink>.
      </p>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function Forward() {
  const [lat, setLat] = useState('4.596200')
  const [lon, setLon] = useState('-74.077508')
  const [h, setH] = useState('2550')

  const out = useMemo(() => {
    const la = Number(lat)
    const lo = Number(lon)
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null
    const ht = Number(h) || 0
    const gk = recommendedGkZone(lo)
    const utm = recommendedUtmZone(lo)
    return {
      la, lo, ht,
      ctm12: project(la, lo, 'EPSG:9377'),
      gk: project(la, lo, gk.code),
      gkZone: gk,
      utm: project(la, lo, utm.code),
      utmZone: utm,
      ecef: toGeocentric(la, lo, ht),
      all: PROJECTED_CRS.filter((c) => c.kind === 'gk').map((c) => ({ c, p: project(la, lo, c.code) })),
    }
  }, [lat, lon, h])

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card>
        <div className="space-y-3">
          <Field label="Latitud (°)" hint="Positiva al norte.">
            <TextInput type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
          </Field>
          <Field label="Longitud (°)" hint="Negativa al oeste.">
            <TextInput type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} />
          </Field>
          <Field label="Altura elipsoidal (m)" hint="Solo para las geocéntricas.">
            <TextInput type="number" step="any" value={h} onChange={(e) => setH(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="space-y-4">
        {out ? (
          <>
            <Card>
              <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Geográficas</h3>
              <DataRow label="Latitud" value={formatDms(out.la, 'lat')} />
              <DataRow label="Longitud" value={formatDms(out.lo, 'lon')} />
            </Card>

            <Card>
              <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Origen Nacional CTM12</h3>
              <DataRow label="Este (X)" value={`${out.ctm12.easting.toFixed(3)} m`} />
              <DataRow label="Norte (Y)" value={`${out.ctm12.northing.toFixed(3)} m`} />
              <p className="mt-1 text-xs text-slate-400">EPSG:9377</p>
            </Card>

            <Card>
              <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">
                Gauss-Krüger MAGNA — {out.gkZone.label}
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                Origen recomendado por longitud · {out.gkZone.code}
              </p>
              <DataRow label="Este (E)" value={`${out.gk.easting.toFixed(3)} m`} />
              <DataRow label="Norte (N)" value={`${out.gk.northing.toFixed(3)} m`} />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-brand-600 dark:text-brand-400">
                  Ver los 5 orígenes
                </summary>
                <div className="mt-2">
                  {out.all.map(({ c, p }) => (
                    <DataRow
                      key={c.code}
                      label={c.label}
                      value={`E ${p.easting.toFixed(2)} · N ${p.northing.toFixed(2)}`}
                    />
                  ))}
                </div>
              </details>
            </Card>

            <Card>
              <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">
                {out.utmZone.label.replace(' (GRS80)', '')} · GRS80
              </h3>
              <DataRow label="Este (E)" value={`${out.utm.easting.toFixed(3)} m`} />
              <DataRow label="Norte (N)" value={`${out.utm.northing.toFixed(3)} m`} />
            </Card>

            <Card>
              <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Geocéntricas (ECEF)</h3>
              <DataRow label="X" value={`${out.ecef.x.toFixed(3)} m`} />
              <DataRow label="Y" value={`${out.ecef.y.toFixed(3)} m`} />
              <DataRow label="Z" value={`${out.ecef.z.toFixed(3)} m`} />
            </Card>
          </>
        ) : (
          <Card><p className="text-sm text-slate-500">Ingresa coordenadas válidas.</p></Card>
        )}
      </div>
    </div>
  )
}

function Inverse() {
  const [code, setCode] = useState('EPSG:9377')
  const [easting, setEasting] = useState('4859853.6')
  const [northing, setNorthing] = useState('2069625.6')

  const out = useMemo(() => {
    const e = Number(easting)
    const n = Number(northing)
    if (!Number.isFinite(e) || !Number.isFinite(n)) return null
    try {
      return unproject(code, e, n)
    } catch {
      return null
    }
  }, [code, easting, northing])

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card>
        <div className="space-y-3">
          <Field label="Sistema plano">
            <Select value={code} onChange={(e) => setCode(e.target.value)}>
              {PROJECTED_CRS.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Este / X (m)">
            <TextInput type="number" step="any" value={easting} onChange={(e) => setEasting(e.target.value)} />
          </Field>
          <Field label="Norte / Y (m)">
            <TextInput type="number" step="any" value={northing} onChange={(e) => setNorthing(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        {out ? (
          <div>
            <DataRow label="Latitud" value={`${out.lat.toFixed(8)}°`} />
            <DataRow label="Longitud" value={`${out.lon.toFixed(8)}°`} />
            <DataRow label="Latitud (GMS)" value={formatDms(out.lat, 'lat')} />
            <DataRow label="Longitud (GMS)" value={formatDms(out.lon, 'lon')} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Ingresa valores válidos.</p>
        )}
      </Card>
    </div>
  )
}
