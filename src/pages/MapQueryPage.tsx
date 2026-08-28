import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  LayersControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, Field, TextInput, Select, Button } from '../components/ui'
import { PlaceSearch } from '../components/PlaceSearch'
import { STATIONS, ACTIVE_STATIONS, type GnssStation } from '../data/stations'
import { nearestStations, type LatLon } from '../lib/geodesy'
import { project } from '../lib/coords'
import { formatDms } from '../lib/format'
import { COLOMBIA_CENTER, COLOMBIA_BOUNDS } from '../lib/colombia'

const ORDER_COLOR = ['#111318', '#8b93a2'] // 0 = tinta · 1 = gris

const DEPARTMENTS = [...new Set(STATIONS.map((s) => s.department))].filter(Boolean).sort()

function ClickHandler({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) })
  return null
}

function FlyTo({ target }: { target: LatLon | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 13, { duration: 0.8 })
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

export default function MapQueryPage() {
  const [point, setPoint] = useState<LatLon | null>(null)
  const [place, setPlace] = useState<{ lat: number; lon: number; label: string } | null>(null)
  const [flyTarget, setFlyTarget] = useState<LatLon | null>(null)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [order, setOrder] = useState<'all' | '0' | '1'>('all')
  const [status, setStatus] = useState<'active' | 'all'>('active')
  const [dept, setDept] = useState('')

  const visible = useMemo(
    () =>
      STATIONS.filter(
        (s) =>
          (status === 'all' || s.status === 'active') &&
          (order === 'all' || String(s.order) === order) &&
          (dept === '' || s.department === dept),
      ),
    [order, status, dept],
  )

  const ranked = useMemo(
    () => (point ? nearestStations(point, ACTIVE_STATIONS, 6) : []),
    [point],
  )

  function applyManual() {
    const lat = Number(latInput)
    const lon = Number(lonInput)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const p = { lat, lon }
      setPoint(p)
      setFlyTarget({ ...p })
    }
  }

  return (
    <div>
      <PageHeader
        title="Mapa de consulta"
        status="beta"
        subtitle="Busca un lugar, toca el mapa o ingresa coordenadas para ver las estaciones MAGNA-ECO más cercanas, con línea base geodésica y azimut."
      />

      <div className="mb-4 max-w-xl">
        <PlaceSearch
          onPick={(r) => {
            setPlace({ lat: r.lat, lon: r.lon, label: r.label })
            setPoint({ lat: r.lat, lon: r.lon })
            setFlyTarget({ lat: r.lat, lon: r.lon })
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <MapContainer center={COLOMBIA_CENTER} zoom={6} style={{ height: '32rem', width: '100%' }}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satélite (Esri)">
                <TileLayer
                  attribution='Imagery &copy; Esri, Maxar, Earthstar Geographics'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Relieve (OpenTopoMap)">
                <TileLayer
                  attribution='&copy; OpenTopoMap (CC-BY-SA)'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <FitColombia />
            <FlyTo target={flyTarget} />
            <ClickHandler onPick={setPoint} />

            {visible.map((s) => (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.lon]}
                radius={s.status === 'active' ? 6 : 4}
                pathOptions={{
                  color: ORDER_COLOR[s.order],
                  fillColor: ORDER_COLOR[s.order],
                  fillOpacity: s.status === 'active' ? 0.85 : 0.25,
                  weight: 1,
                }}
              >
                <Popup>
                  <StationPopup s={s} />
                </Popup>
              </CircleMarker>
            ))}

            {place && (
              <CircleMarker
                center={[place.lat, place.lon]}
                radius={7}
                pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.4 }}
              >
                <Popup>{place.label}</Popup>
              </CircleMarker>
            )}

            {point && (
              <CircleMarker
                center={[point.lat, point.lon]}
                radius={8}
                pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.5 }}
              >
                <Popup>
                  Punto de consulta
                  <br />
                  {point.lat.toFixed(6)}, {point.lon.toFixed(6)}
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud (°)">
                <TextInput type="number" step="any" placeholder="4.65" value={latInput}
                  onChange={(e) => setLatInput(e.target.value)} />
              </Field>
              <Field label="Longitud (°)">
                <TextInput type="number" step="any" placeholder="-74.09" value={lonInput}
                  onChange={(e) => setLonInput(e.target.value)} />
              </Field>
            </div>
            <Button onClick={applyManual} className="mt-3 w-full">
              Consultar
            </Button>
          </Card>

          <Card>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Filtros</p>
            <div className="space-y-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'all')}>
                <option value="active">Solo activas</option>
                <option value="all">Activas e inactivas</option>
              </Select>
              <Select value={order} onChange={(e) => setOrder(e.target.value as 'all' | '0' | '1')}>
                <option value="all">Todos los órdenes</option>
                <option value="0">Solo orden 0</option>
                <option value="1">Solo orden 1</option>
              </Select>
              <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">Todos los departamentos</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </div>
            <Legend />
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Mostrando {visible.length} de {STATIONS.length} estaciones.
            </p>
          </Card>

          {point && (
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                Estaciones activas más cercanas
              </h3>
              <ol className="space-y-2">
                {ranked.map(({ station, distanceKm, azimuthDeg }) => (
                  <li key={station.id} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {station.id}
                      </span>
                      <span className="tabular text-slate-600 dark:text-slate-400">
                        {distanceKm < 10 ? distanceKm.toFixed(2) : distanceKm.toFixed(1)} km
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {station.name}, {station.department} · Az {azimuthDeg.toFixed(0)}° · orden{' '}
                      {station.order}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                La Resolución 1468/2021 exige medición simultánea con ≥ 2 vértices de
                orden superior. Distancias geodésicas (Karney, GRS80).
              </p>
            </Card>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        {ACTIVE_STATIONS.length} estaciones activas · datos y coordenadas oficiales del{' '}
        <a
          href="https://ccg.igac.gov.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:underline dark:text-brand-400"
        >
          Centro de Control Geodésico del IGAC
        </a>
        .
      </p>
    </div>
  )
}

function Legend() {
  const items = [
    ['#111318', 'Orden 0'],
    ['#8b93a2', 'Orden 1'],
    ['#dc2626', 'Punto de consulta'],
    ['#7c3aed', 'Lugar buscado'],
  ] as const
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
      {items.map(([c, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="size-2.5 rounded-full" style={{ background: c }} />
          {label}
        </span>
      ))}
    </div>
  )
}

function StationPopup({ s }: { s: GnssStation }) {
  return (
    <div className="text-xs leading-relaxed">
      <strong>
        {s.id} — {s.name}, {s.department}
      </strong>
      <br />
      Orden {s.order} · {s.status === 'active' ? 'activa' : 'inactiva'}
      {s.networks.length > 0 && ` · ${s.networks.join(', ')}`}
      <br />
      {formatDms(s.lat, 'lat')}
      <br />
      {formatDms(s.lon, 'lon')}
      <br />
      {(() => {
        const p = project(s.lat, s.lon, 'EPSG:9377')
        return (
          <>
            CTM12: {p.easting.toFixed(2)} E · {p.northing.toFixed(2)} N
            <br />
          </>
        )
      })()}
      {s.heightM != null && <>h = {s.heightM} m · </>}
      {s.domes ? `DOMES ${s.domes}` : 'sin DOMES'}
      {s.receiver && (
        <>
          <br />
          {s.receiver} / {s.antenna}
        </>
      )}
      <br />
      <a href={`#/rinex?station=${s.id}`} style={{ color: '#2057d4', fontWeight: 600 }}>
        Ver / descargar RINEX →
      </a>
    </div>
  )
}
