import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, TextInput } from '../components/ui'
import { PlaceSearch } from '../components/PlaceSearch'
import { LocateButton } from '../components/LocateButton'
import { COLOMBIA_CENTER, COLOMBIA_BOUNDS } from '../lib/colombia'
import { project } from '../lib/coords'
import { formatDms } from '../lib/format'
import type { LatLon } from '../lib/geodesy'
import {
  loadVertices,
  nearestVertices,
  verticePdfUrl,
  type Vertice,
} from '../lib/vertices'

const MAX_MARKERS = 500

function BoundsWatcher({ onBounds }: { onBounds: (b: LatLngBounds) => void }) {
  const map = useMap()
  useEffect(() => {
    onBounds(map.getBounds())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useMapEvents({
    moveend: () => onBounds(map.getBounds()),
    zoomend: () => onBounds(map.getBounds()),
  })
  return null
}

function FlyTo({ target }: { target: LatLon | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 15, { duration: 0.8 })
  }, [target, map])
  return null
}

function FitColombia() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(COLOMBIA_BOUNDS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function PassiveNetworkPage() {
  const [all, setAll] = useState<Vertice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bounds, setBounds] = useState<LatLngBounds | null>(null)
  const [point, setPoint] = useState<LatLon | null>(null)
  const [flyTarget, setFlyTarget] = useState<LatLon | null>(null)
  const [code, setCode] = useState('')
  const [onlyMat, setOnlyMat] = useState(true)

  useEffect(() => {
    loadVertices().then(setAll).catch((e) => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    if (!all) return []
    const q = code.trim().toUpperCase()
    return all.filter((v) => (!onlyMat || v.materializado) && (q === '' || v.id.toUpperCase().includes(q)))
  }, [all, code, onlyMat])

  const inView = useMemo(() => {
    if (!bounds) return []
    const list = filtered.filter((v) => bounds.contains([v.lat, v.lon]))
    return list
  }, [filtered, bounds])

  const nearby = useMemo(
    () => (point ? nearestVertices(point, filtered, 10) : []),
    [point, filtered],
  )

  function goTo(p: LatLon) {
    setPoint(p)
    setFlyTarget({ ...p })
  }

  const shown = inView.slice(0, MAX_MARKERS)

  return (
    <div>
      <PageHeader
        title="Red pasiva del IGAC"
        subtitle="Mojones y placas de control geodésico (órdenes 2, 3 y 4). Ubícalos en el mapa y descarga su reseña (monografía)."
      />

      <div className="mb-4 max-w-xl space-y-3">
        <PlaceSearch onPick={(r) => goTo({ lat: r.lat, lon: r.lon })} />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <TextInput
            placeholder="Buscar por código (p. ej. 05001001)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="w-40 shrink-0">
            <LocateButton onLocate={goTo} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={onlyMat}
            onChange={(e) => setOnlyMat(e.target.checked)}
            className="size-4 accent-brand-600"
          />
          Solo materializados
        </label>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-rose-600 dark:text-rose-400">
            No se pudo cargar el listado de vértices. {error}
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="order-2 h-[58vh] min-h-80 overflow-hidden rounded-xl border border-slate-200 sm:h-[32rem] lg:order-1 lg:row-span-2 dark:border-slate-800">
          <MapContainer center={COLOMBIA_CENTER} zoom={6} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <FitColombia />
            <FlyTo target={flyTarget} />
            <BoundsWatcher onBounds={setBounds} />

            {shown.map((v) => (
              <CircleMarker
                key={v.id}
                center={[v.lat, v.lon]}
                radius={4}
                pathOptions={{
                  color: v.materializado ? '#111318' : '#9ca3af',
                  fillColor: v.materializado ? '#111318' : '#9ca3af',
                  fillOpacity: 0.8,
                  weight: 1,
                }}
              >
                <Popup>
                  <VerticePopup v={v} />
                </Popup>
              </CircleMarker>
            ))}

            {point && (
              <CircleMarker
                center={[point.lat, point.lon]}
                radius={7}
                pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.5 }}
              />
            )}
          </MapContainer>
        </div>

        <div className="order-1 lg:order-2">
          <Card>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {all == null
                ? 'Cargando vértices…'
                : `${filtered.length.toLocaleString('es-CO')} vértices`}
            </p>
            {bounds && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {inView.length} en la vista
                {inView.length > MAX_MARKERS && ` · mostrando ${MAX_MARKERS}, acércate para ver el resto`}
              </p>
            )}
          </Card>
        </div>

        {point && (
          <div className="order-3 lg:order-3">
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                Vértices más cercanos
              </h3>
              <ol className="space-y-2">
                {nearby.map(({ v, distanceKm, azimuthDeg }) => (
                  <li key={v.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{v.id}</span>
                      <span className="tabular text-slate-500">
                        {distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)} m` : `${distanceKm.toFixed(2)} km`}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {v.municipio}, {v.departamento} · Az {azimuthDeg.toFixed(0)}°
                      {!v.materializado && ' · destruido'}
                    </div>
                    {v.hasPdf && (
                      <a
                        href={verticePdfUrl(v.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Reseña PDF ↗
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Datos: <a href="https://ccg.igac.gov.co/api/vertices" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-400">Centro de Control Geodésico del IGAC</a>.
        Coordenadas geocéntricas oficiales convertidas a geográficas (GRS80).
        La reseña incluye el croquis de acceso y el estado del monumento.
      </p>
    </div>
  )
}

function VerticePopup({ v }: { v: Vertice }) {
  const p = project(v.lat, v.lon, 'EPSG:9377')
  return (
    <div className="text-xs leading-relaxed">
      <strong>{v.id}</strong>
      <br />
      {v.municipio}, {v.departamento}
      <br />
      {v.materializado ? 'Materializado' : 'Destruido'}
      <br />
      {formatDms(v.lat, 'lat')}
      <br />
      {formatDms(v.lon, 'lon')}
      <br />
      CTM12: {p.easting.toFixed(2)} E · {p.northing.toFixed(2)} N
      <br />
      h = {v.h} m
      {v.hasPdf && (
        <>
          <br />
          <a href={verticePdfUrl(v.id)} target="_blank" rel="noopener noreferrer" style={{ color: '#2057d4', fontWeight: 600 }}>
            Descargar reseña (PDF) ↗
          </a>
        </>
      )}
    </div>
  )
}
