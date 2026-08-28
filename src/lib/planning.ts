/**
 * Planeación de una sesión de medición GNSS estática: a partir de un punto,
 * una fecha y un orden objetivo, arma el plan (estaciones de apoyo, líneas
 * base, tiempo de ocupación, efemérides) y lo exporta a CSV / KML.
 */
import type { GnssStation } from '../data/stations'
import { geodesicInverse } from './geodesy'
import { occupationTimeAlturas, orderSpec, type OrderSpec } from './igacNorms'
import { project } from './coords'
import { ephemerisFor } from './ephemeris'
import { formatDms } from './format'
import { rinexDeepLink } from './rinex'

export interface PlanPoint {
  lat: number
  lon: number
  label?: string
}

export interface PlanStation {
  station: GnssStation
  baselineKm: number
  azimuthDeg: number
  /** Tiempo de rastreo por el modelo de la Guía de alturas para esta línea base. */
  alturasMinutes: number
  /** Fecha del último dato conocido (del snapshot / verificación), si la hay. */
  lastData: string | null
  ctm12: { easting: number; northing: number }
  rinexUrl: string
}

export interface Plan {
  project: string
  generatedAt: string
  point: PlanPoint & {
    dms: { lat: string; lon: string }
    ctm12: { easting: number; northing: number }
  }
  date: string
  endDate: string | null
  targetOrder: OrderSpec
  excellentConfig: boolean
  stations: PlanStation[]
  /** Tiempo de ocupación gobernante (modelo alturas): la línea base más larga manda. */
  alturasGoverningMinutes: number
  ephemeris: ReturnType<typeof ephemerisFor>
}

export interface PlanOptions {
  project?: string
  date: string
  endDate?: string | null
  targetOrder: 2 | 3 | 4
  excellentConfig?: boolean
  latencyLookup?: (id: string) => string | null
}

export function buildPlan(
  point: PlanPoint,
  stations: GnssStation[],
  opts: PlanOptions,
): Plan {
  const excellentConfig = opts.excellentConfig ?? false
  const planStations: PlanStation[] = stations.map((station) => {
    const g = geodesicInverse(point, station)
    const baselineKm = g.distanceM / 1000
    const p = project(station.lat, station.lon, 'EPSG:9377')
    return {
      station,
      baselineKm,
      azimuthDeg: g.azimuthDeg,
      alturasMinutes: occupationTimeAlturas(baselineKm, { excellentConfig }).minutes,
      lastData: opts.latencyLookup?.(station.id) ?? null,
      ctm12: { easting: p.easting, northing: p.northing },
      rinexUrl: rinexDeepLink(station.id, station.tId),
    }
  })

  const alturasGoverningMinutes = planStations.reduce(
    (m, s) => Math.max(m, s.alturasMinutes),
    0,
  )

  const [y, m, d] = opts.date.split('-').map(Number)
  const pointCtm = project(point.lat, point.lon, 'EPSG:9377')

  return {
    project: opts.project?.trim() || 'Sesión GNSS',
    generatedAt: new Date().toISOString(),
    point: {
      ...point,
      dms: { lat: formatDms(point.lat, 'lat'), lon: formatDms(point.lon, 'lon') },
      ctm12: { easting: pointCtm.easting, northing: pointCtm.northing },
    },
    date: opts.date,
    endDate: opts.endDate || null,
    targetOrder: orderSpec(opts.targetOrder),
    excellentConfig,
    stations: planStations,
    alturasGoverningMinutes,
    ephemeris: ephemerisFor(new Date(Date.UTC(y, (m || 1) - 1, d || 1))),
  }
}

/* ------------------------------- exportadores --------------------------- */

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function planToCsv(plan: Plan): string {
  const head = [
    'estacion', 'municipio', 'departamento', 'orden', 'operador',
    'lat', 'lon', 'altura_elip_m', 'ctm12_e', 'ctm12_n',
    'linea_base_km', 'azimut_deg', 'rastreo_alturas_min', 'ultimo_dato', 'domes', 'rinex',
  ]
  const rows = plan.stations.map((s) =>
    [
      s.station.id, s.station.name, s.station.department, s.station.order, s.station.operator,
      s.station.lat, s.station.lon, s.station.heightM ?? '',
      s.ctm12.easting.toFixed(3), s.ctm12.northing.toFixed(3),
      s.baselineKm.toFixed(3), s.azimuthDeg.toFixed(1), Math.round(s.alturasMinutes),
      s.lastData ?? '', s.station.domes ?? '', s.rinexUrl,
    ]
      .map(csvCell)
      .join(','),
  )
  const meta = [
    `# Proyecto,${csvCell(plan.project)}`,
    `# Generado,${plan.generatedAt}`,
    `# Punto,${plan.point.lat},${plan.point.lon}`,
    `# Fecha,${plan.date}${plan.endDate ? ` a ${plan.endDate}` : ''}`,
    `# Orden objetivo,${plan.targetOrder.order}`,
  ]
  return [...meta, head.join(','), ...rows].join('\n')
}

export function planToKml(plan: Plan): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  const placemarks = plan.stations
    .map(
      (s) => `    <Placemark>
      <name>${esc(s.station.id)}</name>
      <description>${esc(
        `${s.station.name}, ${s.station.department} · orden ${s.station.order}\n` +
          `Línea base ${s.baselineKm.toFixed(2)} km · Az ${s.azimuthDeg.toFixed(0)}°\n` +
          `${s.lastData ? `Último dato: ${s.lastData}` : ''}`,
      )}</description>
      <styleUrl>#station</styleUrl>
      <Point><coordinates>${s.station.lon},${s.station.lat},0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Línea base ${esc(s.station.id)}</name>
      <styleUrl>#baseline</styleUrl>
      <LineString><tessellate>1</tessellate><coordinates>${plan.point.lon},${plan.point.lat},0 ${s.station.lon},${s.station.lat},0</coordinates></LineString>
    </Placemark>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(plan.project)}</name>
    <Style id="point"><IconStyle><color>ff0000ff</color><scale>1.2</scale></IconStyle></Style>
    <Style id="station"><IconStyle><color>ffd4571f</color></IconStyle></Style>
    <Style id="baseline"><LineStyle><color>aa1f57d4</color><width>2</width></LineStyle></Style>
    <Placemark>
      <name>${esc(plan.point.label || 'Punto de consulta')}</name>
      <description>${esc(`${plan.point.dms.lat}\n${plan.point.dms.lon}`)}</description>
      <styleUrl>#point</styleUrl>
      <Point><coordinates>${plan.point.lon},${plan.point.lat},0</coordinates></Point>
    </Placemark>
${placemarks}
  </Document>
</kml>`
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
