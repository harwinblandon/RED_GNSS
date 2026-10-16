import { useMemo, useState } from 'react'
import { Marker, Popup, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { GnssStation } from '../data/stations'
import { classify, daysSince, type FreshLevel } from '../lib/stationStatus'
import { geodesicInverse, type LatLon } from '../lib/geodesy'
import { project } from '../lib/coords'
import { formatDms } from '../lib/format'

/*
 * Red MAGNA-ECO sobre el mapa: círculo verde con el glifo de antena GNSS.
 * Orden 0 (marco de operación continua) en verde oscuro y más grande;
 * orden 1 (densificación) en verde medio; inactivas huecas. Contorno blanco
 * y sombra para leerse sobre calles y sobre satélite. El tamaño crece con el
 * zoom y desde LABEL_ZOOM se rotula el código de cada estación.
 *
 * Se usan `Marker` y no `CircleMarker`: los marcadores no propagan el clic
 * al mapa, así que tocar una estación abre su ficha sin mover el punto.
 */

const GREEN = ['#15803d', '#22c55e'] as const
const RING = '#14532d'
const LABEL_ZOOM = 9

/** Diámetro (px) del símbolo de orden 0 según el zoom; el de orden 1 es ~80 %. */
function baseSize(zoom: number): number {
  if (zoom <= 6) return 16
  if (zoom <= 8) return 20
  if (zoom <= 11) return 26
  return 32
}

function antennaSvg(fill: string, size: number, opts: { hollow?: boolean; ring?: boolean } = {}): string {
  const glyph = opts.hollow ? fill : '#ffffff'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    ${opts.ring ? `<circle cx="12" cy="12" r="11.2" fill="#ffffff" stroke="${RING}" stroke-width="1.6"/>` : ''}
    <circle cx="12" cy="12" r="${opts.ring ? 8.4 : 10}" fill="${opts.hollow ? '#ffffff' : fill}" stroke="${opts.hollow ? fill : '#ffffff'}" stroke-width="${opts.ring ? 1.6 : 2.4}"/>
    <path d="M8.2 9.6a5.4 5.4 0 0 1 7.6 0M9.9 11.6a2.9 2.9 0 0 1 4.2 0" fill="none" stroke="${glyph}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="14.9" r="1.7" fill="${glyph}"/>
  </svg>`
}

const iconCache = new Map<string, L.DivIcon>()

function stationIcon(order: 0 | 1, active: boolean, highlight: boolean, zoom: number): L.DivIcon {
  const base = baseSize(zoom)
  const s = Math.round(highlight ? base * 1.3 : order === 0 ? base : base * 0.8)
  const key = `${order}${active}${highlight}${s}`
  let icon = iconCache.get(key)
  if (icon) return icon
  icon = L.divIcon({
    html: antennaSvg(GREEN[order], s, { hollow: !active, ring: highlight }),
    className: 'station-icon',
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -s / 2],
    tooltipAnchor: [s / 2, 0],
  })
  iconCache.set(key, icon)
  return icon
}

function useZoom(): number {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const [zoom, setZoom] = useState(() => map.getZoom())
  return zoom
}

export function StationMarkers({
  stations,
  latest,
  highlight,
  from,
}: {
  stations: GnssStation[]
  latest: Record<string, string | null>
  /** Estaciones resaltadas (p. ej. las de apoyo del plan). */
  highlight?: Set<string>
  /** Punto de consulta, para la distancia y el azimut en la ficha. */
  from?: LatLon | null
}) {
  const zoom = useZoom()
  // Orden 1 primero para que las de orden 0 queden encima.
  const sorted = useMemo(
    () => [...stations].sort((a, b) => b.order - a.order || Number(highlight?.has(a.id)) - Number(highlight?.has(b.id))),
    [stations, highlight],
  )
  return (
    <>
      {sorted.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lon]}
          icon={stationIcon(s.order, s.status === 'active', highlight?.has(s.id) ?? false, zoom)}
          title={`${s.id} · ${s.name}`}
          zIndexOffset={highlight?.has(s.id) ? 1000 : s.order === 0 ? 500 : 0}
        >
          {zoom >= LABEL_ZOOM && (
            <Tooltip permanent direction="right" className="station-label" interactive={false}>
              {s.id}
            </Tooltip>
          )}
          <Popup minWidth={260} maxWidth={300}>
            <StationCard s={s} lastDate={latest[s.id] ?? null} from={from ?? null} />
          </Popup>
        </Marker>
      ))}
    </>
  )
}

const FRESH: Record<FreshLevel, { label: string; dot: string }> = {
  ok: { label: 'Publicando datos', dot: '#16a34a' },
  warn: { label: 'Datos con retraso', dot: '#d97706' },
  stale: { label: 'Sin datos recientes', dot: '#dc2626' },
  unknown: { label: 'Estado sin verificar', dot: '#9ca3af' },
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{k}</span>
      <span className="tabular text-right font-medium text-slate-900">{children}</span>
    </div>
  )
}

/** Ficha emergente de una estación (el popup de Leaflet siempre es claro). */
export function StationCard({ s, lastDate, from }: { s: GnssStation; lastDate: string | null; from: LatLon | null }) {
  const ctm = project(s.lat, s.lon, 'EPSG:9377')
  const fresh = s.status === 'active' ? classify(lastDate) : null
  const days = daysSince(lastDate)
  const g = from ? geodesicInverse(from, s) : null

  return (
    <div className="station-card -mx-1 text-xs leading-snug text-slate-700">
      <div className="mb-2 flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
        <div>
          <div className="text-base font-bold tracking-wide text-slate-900">{s.id}</div>
          <div className="text-slate-600">
            {s.name}, {s.department}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            s.order === 0 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-800'
          }`}
        >
          Orden {s.order}
        </span>
      </div>

      <div className="mb-2 text-slate-600">
        {s.order === 0 ? 'Operación continua del marco de referencia' : 'Estación de densificación'}
        {' · '}
        {[s.operator, ...s.networks].filter(Boolean).join(' · ')}
      </div>

      {fresh && (
        <div className="mb-2">
          <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: FRESH[fresh].dot }} />
          <span className="font-medium text-slate-900">{FRESH[fresh].label}</span>
          {lastDate && (
            <span className="text-slate-500">
              {' '}· último RINEX {lastDate}
              {days != null && days > 0 ? ` (hace ${days} d)` : ''}
            </span>
          )}
        </div>
      )}
      {s.status !== 'active' && <div className="mb-2 font-medium text-slate-900">Estación inactiva</div>}

      <div className="mb-2">
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">MAGNA-SIRGAS · época 2018.4</div>
        <Row k="Latitud">{formatDms(s.lat, 'lat')}</Row>
        <Row k="Longitud">{formatDms(s.lon, 'lon')}</Row>
        {s.heightM != null && <Row k="h elipsoidal">{s.heightM.toFixed(3)} m</Row>}
        <Row k="CTM12 E · N">
          {ctm.easting.toFixed(2)} · {ctm.northing.toFixed(2)}
        </Row>
      </div>

      {(s.receiver || s.domes || s.sampleRateS) && (
        <div className="mb-2">
          {s.receiver && <Row k="Receptor">{s.receiver}</Row>}
          {s.antenna && <Row k="Antena">{s.antenna}</Row>}
          {s.sampleRateS != null && <Row k="Muestreo">{s.sampleRateS} s</Row>}
          {s.domes && <Row k="DOMES">{s.domes}</Row>}
        </div>
      )}

      {g && (
        <div className="mb-2 rounded bg-slate-100 px-2 py-1">
          <Row k="Desde el punto">
            {(g.distanceM / 1000).toFixed(2)} km · Az {g.azimuthDeg.toFixed(0)}°
          </Row>
        </div>
      )}

      <div className="flex gap-3 border-t border-slate-200 pt-2">
        <a href={`#/estacion?station=${s.id}`} className="font-semibold !text-slate-900 underline-offset-2 hover:underline">
          Ficha completa →
        </a>
        <a href={`#/rinex?station=${s.id}`} className="font-semibold !text-slate-900 underline-offset-2 hover:underline">
          RINEX →
        </a>
      </div>
    </div>
  )
}

/** Leyenda flotante de la red sobre el mapa (esquina inferior izquierda). */
export function NetworkLegend({ point = true, highlight = false, inactive = false }: { point?: boolean; highlight?: boolean; inactive?: boolean }) {
  const icon = (svg: string) => <span className="inline-block" dangerouslySetInnerHTML={{ __html: svg }} />
  return (
    <div className="pointer-events-none absolute bottom-6 left-2.5 z-[1000] rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] leading-5 text-slate-700 shadow-md backdrop-blur-sm max-sm:hidden">
      <p className="font-semibold text-slate-900">Red MAGNA-ECO</p>
      <p className="flex items-center gap-1.5">{icon(antennaSvg(GREEN[0], 16))} Orden 0 · operación continua</p>
      <p className="flex items-center gap-1.5">{icon(antennaSvg(GREEN[1], 16))} Orden 1 · densificación</p>
      {inactive && <p className="flex items-center gap-1.5">{icon(antennaSvg(GREEN[1], 16, { hollow: true }))} Inactiva</p>}
      {highlight && <p className="flex items-center gap-1.5">{icon(antennaSvg(GREEN[0], 16, { ring: true }))} Estación de apoyo del plan</p>}
      {point && (
        <p className="flex items-center gap-1.5">
          <span className="mx-[3px] inline-block size-2.5 rounded-full border-2 border-white bg-red-600 shadow" /> Punto de consulta
        </p>
      )}
    </div>
  )
}
