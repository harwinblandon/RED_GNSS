import { useCallback, useState } from 'react'
import { PageHeader, Card, ExternalLink } from '../components/ui'
import { CoordinateEntry, type Geodetic } from '../components/CoordinateEntry'
import {
  PROJECTED_CRS,
  project,
  toGeocentric,
  recommendedGkZone,
  recommendedUtmZone,
} from '../lib/coords'
import { formatDms } from '../lib/format'

export default function CoordinatesPage() {
  const [system, setSystem] = useState('geo-dms')
  const [geo, setGeo] = useState<Geodetic | null>(null)
  const onChange = useCallback((g: Geodetic | null) => setGeo(g), [])

  return (
    <div>
      <PageHeader
        title="Conversión de coordenadas"
        subtitle={`Ingresa un punto en cualquier sistema (geográficas en grados o G° M' S", geocéntricas o planas) y obtén todas las representaciones.`}
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CoordinateEntry system={system} onSystemChange={setSystem} onChange={onChange} />
        </Card>

        <div>
          {geo ? (
            <Output geo={geo} />
          ) : (
            <Card>
              <p className="text-sm text-slate-500 dark:text-slate-400">Completa las coordenadas de entrada.</p>
            </Card>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Cálculo con proj4 sobre el elipsoide GRS80. El Origen Nacional CTM12 (EPSG:9377)
        es el sistema plano vigente según la{' '}
        <ExternalLink href="https://www.igac.gov.co/">Resolución IGAC 471 de 2020</ExternalLink>.
      </p>
    </div>
  )
}

function Output({ geo }: { geo: Geodetic }) {
  const { lat, lon, h } = geo
  const gk = recommendedGkZone(lon)
  const utm = recommendedUtmZone(lon)
  const ecef = toGeocentric(lat, lon, h)
  const gkAll = PROJECTED_CRS.filter((c) => c.kind === 'gk')

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Geográficas</h3>
        <CopyRow label={`Latitud (G° M' S")`} value={formatDms(lat, 'lat')} />
        <CopyRow label={`Longitud (G° M' S")`} value={formatDms(lon, 'lon')} />
        <CopyRow label="Latitud (dec.)" value={lat.toFixed(9)} />
        <CopyRow label="Longitud (dec.)" value={lon.toFixed(9)} />
        <CopyRow label="Altura elipsoidal" value={`${h.toFixed(3)} m`} />
        <CopyRow label="Copiar lat, lon" value={`${lat.toFixed(9)}, ${lon.toFixed(9)}`} />
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Origen Nacional CTM12</h3>
        {(() => {
          const p = project(lat, lon, 'EPSG:9377')
          return (
            <>
              <CopyRow label="Este (E)" value={`${p.easting.toFixed(3)}`} />
              <CopyRow label="Norte (N)" value={`${p.northing.toFixed(3)}`} />
              <CopyRow label="Copiar E, N" value={`${p.easting.toFixed(3)}, ${p.northing.toFixed(3)}`} />
              <p className="mt-1 text-xs text-slate-400">EPSG:9377 · metros</p>
            </>
          )
        })()}
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">
          Gauss-Krüger MAGNA — {gk.label}
        </h3>
        <p className="mb-2 text-xs text-slate-400">Origen recomendado por longitud · {gk.code}</p>
        {(() => {
          const p = project(lat, lon, gk.code)
          return (
            <>
              <CopyRow label="Este (E)" value={`${p.easting.toFixed(3)}`} />
              <CopyRow label="Norte (N)" value={`${p.northing.toFixed(3)}`} />
            </>
          )
        })()}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-brand-600 dark:text-brand-400">Ver los 5 orígenes</summary>
          <div className="mt-2">
            {gkAll.map((c) => {
              const p = project(lat, lon, c.code)
              return <CopyRow key={c.code} label={c.label} value={`${p.easting.toFixed(3)}, ${p.northing.toFixed(3)}`} />
            })}
          </div>
        </details>
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{utm.label.replace(' (GRS80)', '')} · GRS80</h3>
        {(() => {
          const p = project(lat, lon, utm.code)
          return (
            <>
              <CopyRow label="Este (E)" value={`${p.easting.toFixed(3)}`} />
              <CopyRow label="Norte (N)" value={`${p.northing.toFixed(3)}`} />
            </>
          )
        })()}
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Geocéntricas (ECEF)</h3>
        <CopyRow label="X" value={`${ecef.x.toFixed(3)}`} />
        <CopyRow label="Y" value={`${ecef.y.toFixed(3)}`} />
        <CopyRow label="Z" value={`${ecef.z.toFixed(3)}`} />
        <CopyRow label="Copiar X, Y, Z" value={`${ecef.x.toFixed(3)}, ${ecef.y.toFixed(3)}, ${ecef.z.toFixed(3)}`} />
      </Card>
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      },
      () => {},
    )
  }
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <button
        onClick={copy}
        title="Copiar"
        className="tabular text-right text-sm font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
      >
        {copied ? '¡copiado!' : value}
      </button>
    </div>
  )
}
