import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, Field, TextInput, Select, DataRow, Button } from '../components/ui'
import { PlaceSearch } from '../components/PlaceSearch'
import { ACTIVE_STATIONS } from '../data/stations'
import { nearestStations, type LatLon } from '../lib/geodesy'
import { loadSnapshot, getCached } from '../lib/stationStatus'
import { CAPTURE_PARAMS } from '../lib/igacNorms'
import { formatMinutes } from '../lib/format'
import { buildPlan, planToCsv, planToKml, downloadText } from '../lib/planning'
import { isoDate } from '../lib/gpsTime'
import { COLOMBIA_CENTER, COLOMBIA_BOUNDS } from '../lib/colombia'

const today = isoDate(new Date())

function MapClick({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) })
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

function FlyTo({ target }: { target: LatLon | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 11, { duration: 0.8 })
  }, [target, map])
  return null
}

export default function PlanningPage() {
  const [projectName, setProjectName] = useState('')
  const [point, setPoint] = useState<(LatLon & { label?: string }) | null>(null)
  const [flyTarget, setFlyTarget] = useState<LatLon | null>(null)
  const [latIn, setLatIn] = useState('')
  const [lonIn, setLonIn] = useState('')
  const [date, setDate] = useState(today)
  const [endDate, setEndDate] = useState('')
  const [order, setOrder] = useState<'2' | '3' | '4'>('3')
  const [nStations, setNStations] = useState(3)
  const [excellent, setExcellent] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [latency, setLatency] = useState<Record<string, string | null>>({})

  useEffect(() => {
    loadSnapshot().then((snap) => {
      const map: Record<string, string | null> = {}
      if (snap) for (const [id, v] of Object.entries(snap.stations)) map[id] = v.lastDate
      for (const s of ACTIVE_STATIONS) {
        const c = getCached(s.tId)
        if (c) map[s.id] = c.lastDate
      }
      setLatency(map)
    })
  }, [])

  const candidates = useMemo(
    () => (point ? nearestStations(point, ACTIVE_STATIONS, 8) : []),
    [point],
  )

  const selected = useMemo(
    () => candidates.filter((c) => !excluded.has(c.station.id)).slice(0, nStations),
    [candidates, excluded, nStations],
  )

  const plan = useMemo(() => {
    if (!point || selected.length === 0) return null
    return buildPlan(
      point,
      selected.map((s) => s.station),
      {
        project: projectName,
        date,
        endDate: endDate || null,
        targetOrder: Number(order) as 2 | 3 | 4,
        excellentConfig: excellent,
        latencyLookup: (id) => latency[id] ?? null,
      },
    )
  }, [point, selected, projectName, date, endDate, order, excellent, latency])

  function setQueryPoint(p: LatLon & { label?: string }) {
    setPoint(p)
    setFlyTarget({ lat: p.lat, lon: p.lon })
  }

  function applyManual() {
    if (latIn.trim() === '' || lonIn.trim() === '') return
    const la = Number(latIn)
    const lo = Number(lonIn)
    if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      setQueryPoint({ lat: la, lon: lo })
    }
  }

  return (
    <div>
      <PageHeader
        title="Planeación de sesión"
        status="beta"
        subtitle="Define el punto, la fecha y el orden objetivo; obtén las estaciones de apoyo, tiempos de ocupación y efemérides, y exporta el plan."
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] print:block">
        <div className="space-y-4 print:hidden">
          <Card>
            <div className="space-y-3">
              <Field label="Proyecto">
                <TextInput value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nombre del trabajo" />
              </Field>
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Punto</span>
                <PlaceSearch onPick={(r) => setQueryPoint({ lat: r.lat, lon: r.lon, label: r.label })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextInput type="number" step="any" placeholder="lat" value={latIn} onChange={(e) => setLatIn(e.target.value)} />
                <TextInput type="number" step="any" placeholder="lon" value={lonIn} onChange={(e) => setLonIn(e.target.value)} />
              </div>
              <Button variant="secondary" onClick={applyManual} className="w-full">
                Usar coordenadas
              </Button>
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fecha inicio"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Fecha fin"><TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
              </div>
              <Field label="Orden objetivo">
                <Select value={order} onChange={(e) => setOrder(e.target.value as '2' | '3' | '4')}>
                  <option value="2">Orden 2</option>
                  <option value="3">Orden 3</option>
                  <option value="4">Orden 4</option>
                </Select>
              </Field>
              <Field label="Estaciones de apoyo">
                <Select value={String(nStations)} onChange={(e) => setNStations(Number(e.target.value))}>
                  {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={excellent} onChange={(e) => setExcellent(e.target.checked)} className="size-4 accent-brand-600" />
                Configuración excelente (3 min/km)
              </label>
            </div>
          </Card>

          {candidates.length > 0 && (
            <Card>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Estaciones candidatas</p>
              <ul className="space-y-1.5">
                {candidates.map(({ station, distanceKm }) => {
                  const inPlan = selected.some((s) => s.station.id === station.id)
                  return (
                    <li key={station.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!excluded.has(station.id)}
                        onChange={(e) =>
                          setExcluded((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.delete(station.id)
                            else next.add(station.id)
                            return next
                          })
                        }
                        className="size-4 accent-brand-600"
                      />
                      <span className={inPlan ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-500'}>
                        {station.id}
                      </span>
                      <span className="tabular ml-auto text-slate-500">{distanceKm.toFixed(1)} km</span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </div>

        <div>
          <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 print:hidden dark:border-slate-800">
            <MapContainer center={COLOMBIA_CENTER} zoom={6} style={{ height: '20rem', width: '100%' }}>
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <FitColombia />
              <FlyTo target={flyTarget} />
              <MapClick onPick={(p) => setQueryPoint(p)} />

              {ACTIVE_STATIONS.map((s) => (
                <CircleMarker
                  key={s.id}
                  center={[s.lat, s.lon]}
                  radius={3}
                  pathOptions={{ color: '#8b93a2', fillColor: '#8b93a2', fillOpacity: 0.6, weight: 0 }}
                />
              ))}

              {selected.map(({ station }) =>
                point ? (
                  <div key={station.id}>
                    <Polyline
                      positions={[[point.lat, point.lon], [station.lat, station.lon]]}
                      pathOptions={{ color: '#111318', weight: 1.5, dashArray: '4 3' }}
                    />
                    <CircleMarker
                      center={[station.lat, station.lon]}
                      radius={5}
                      pathOptions={{ color: '#111318', fillColor: '#4b5563', fillOpacity: 0.95 }}
                    >
                      <Popup>{station.id} — {station.name}</Popup>
                    </CircleMarker>
                  </div>
                ) : null,
              )}

              {point && (
                <CircleMarker
                  center={[point.lat, point.lon]}
                  radius={7}
                  pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.5 }}
                />
              )}
            </MapContainer>
          </div>

          {!point && (
            <Card className="print:hidden">
              <p className="text-sm text-slate-500">
                Toca el mapa, busca un lugar o ingresa coordenadas para generar el plan.
              </p>
            </Card>
          )}

          {plan && <PlanReport plan={plan} />}
        </div>
      </div>
    </div>
  )
}

function PlanReport({ plan }: { plan: ReturnType<typeof buildPlan> }) {
  const rec = plan.ephemeris.products.find((p) => p.recommended)
  return (
    <div className="report space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Plan de sesión</h2>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>Imprimir / PDF</Button>
          <Button variant="secondary" onClick={() => downloadText(`plan_${plan.date}.csv`, planToCsv(plan), 'text/csv')}>
            CSV
          </Button>
          <Button variant="secondary" onClick={() => downloadText(`plan_${plan.date}.kml`, planToKml(plan), 'application/vnd.google-earth.kml+xml')}>
            KML
          </Button>
        </div>
      </div>

      <Card>
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{plan.project}</h3>
        <DataRow label="Generado" value={new Date(plan.generatedAt).toLocaleString('es-CO')} />
        <DataRow label="Punto" value={`${plan.point.dms.lat} · ${plan.point.dms.lon}`} />
        <DataRow label="Punto CTM12" value={`${plan.point.ctm12.easting.toFixed(2)} E · ${plan.point.ctm12.northing.toFixed(2)} N`} />
        <DataRow label="Fecha(s)" value={plan.endDate ? `${plan.date} a ${plan.endDate}` : plan.date} />
        <DataRow label="Orden objetivo" value={plan.targetOrder.label} />
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Estaciones de apoyo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                <th className="py-2 pr-3 font-medium">Estación</th>
                <th className="py-2 pr-3 font-medium">Ubicación</th>
                <th className="py-2 pr-3 font-medium">Orden</th>
                <th className="py-2 pr-3 font-medium">Línea base</th>
                <th className="py-2 pr-3 font-medium">Azimut</th>
                <th className="py-2 pr-3 font-medium">Rastreo (alturas)</th>
                <th className="py-2 font-medium">Último dato</th>
              </tr>
            </thead>
            <tbody>
              {plan.stations.map((s) => (
                <tr key={s.station.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{s.station.id}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{s.station.name}, {s.station.department}</td>
                  <td className="tabular py-2 pr-3">{s.station.order}</td>
                  <td className="tabular py-2 pr-3">{s.baselineKm.toFixed(2)} km</td>
                  <td className="tabular py-2 pr-3">{s.azimuthDeg.toFixed(0)}°</td>
                  <td className="tabular py-2 pr-3">{Math.round(s.alturasMinutes)} min</td>
                  <td className="tabular py-2 text-slate-600 dark:text-slate-400">{s.lastData ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.stations.length < plan.targetOrder.simultaneousVertices && (
          <p className="mt-2 text-xs text-rose-600">
            La Resolución 1468/2021 exige ≥ {plan.targetOrder.simultaneousVertices} vértices de orden superior
            simultáneos para el orden {plan.targetOrder.order}.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Tiempo de ocupación</h3>
        <DataRow
          label={`Resolución 1468/2021 · orden ${plan.targetOrder.order}`}
          value={plan.targetOrder.timeText}
        />
        <DataRow
          label="Rango normativo"
          value={`${formatMinutes(plan.targetOrder.minMinutes)} – ${formatMinutes(plan.targetOrder.maxMinutes)}`}
        />
        <DataRow
          label={`Guía de alturas (línea base más larga, ${plan.excellentConfig ? '3' : '5'} min/km)`}
          value={`${Math.round(plan.alturasGoverningMinutes)} min · ${formatMinutes(plan.alturasGoverningMinutes)}`}
        />
        <DataRow label="Máscara de elevación" value={`${CAPTURE_PARAMS.elevationMaskDeg.min}°–${CAPTURE_PARAMS.elevationMaskDeg.max}°`} />
        <DataRow label="Intervalo de registro" value={`${CAPTURE_PARAMS.recordingIntervalSec} s`} />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Todas las estaciones (punto y apoyos) deben registrar de forma simultánea.
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Efemérides</h3>
        <DataRow label="Semana GPS / DOY" value={`${plan.ephemeris.gpsWeek} / ${String(plan.ephemeris.doy).padStart(3, '0')}`} />
        <DataRow label="Producto recomendado" value={rec ? rec.label : '—'} />
        {rec && <DataRow label="Latencia" value={rec.latency} />}
        {rec?.files[0] && <DataRow label="Archivo" value={rec.files[0]} />}
      </Card>

      <Card className="print:hidden">
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">RINEX de las estaciones</h3>
        <ul className="space-y-1 text-sm">
          {plan.stations.map((s) => (
            <li key={s.station.id}>
              <a href={`#/rinex?station=${s.station.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                {s.station.id}
              </a>
              <span className="text-slate-500"> — descargar RINEX</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
