import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Card, DataRow, ExternalLink } from '../components/ui'
import { StationPicker } from '../components/StationPicker'
import { STATIONS, type GnssStation } from '../data/stations'
import { project, recommendedGkZone, recommendedUtmZone } from '../lib/coords'
import { formatDms } from '../lib/format'
import { rinexDeepLink } from '../lib/rinex'
import { getCached, loadSnapshot, classify, daysSince } from '../lib/stationStatus'
import {
  sirgasStationUrl,
  SIRGAS_LINKS,
  IGAC_LINKS,
  fetchIgacWeeklySolutions,
  type WeeklySolution,
} from '../lib/solutions'

export default function StationPage() {
  const [params, setParams] = useSearchParams()
  const station = useMemo(
    () => STATIONS.find((s) => s.id === params.get('station')) ?? null,
    [params],
  )

  return (
    <div>
      <PageHeader
        title="Ficha de estación"
        status="beta"
        subtitle="Identidad, coordenadas oficiales, equipo y enlaces a las soluciones de coordenadas (SIRGAS e IGAC)."
      />

      <Card className="mb-6">
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Estación
        </label>
        <StationPicker
          value={station}
          includeInactive
          onChange={(s) => setParams({ station: s.id }, { replace: true })}
        />
      </Card>

      {station && <StationDetail station={station} />}
    </div>
  )
}

function StationDetail({ station: s }: { station: GnssStation }) {
  const [last, setLast] = useState<string | null>(null)
  const [sol, setSol] = useState<{ list: WeeklySolution[]; error: string | null } | null>(null)

  useEffect(() => {
    const cached = getCached(s.tId)
    setLast(cached?.lastDate ?? null)
    loadSnapshot().then((snap) => {
      const d = snap?.stations[s.id]?.lastDate
      if (d) setLast((prev) => prev ?? d)
    })
  }, [s.id, s.tId])

  useEffect(() => {
    const ctl = new AbortController()
    setSol(null)
    fetchIgacWeeklySolutions(ctl.signal)
      .then((list) => setSol({ list, error: null }))
      .catch((e) => {
        if (!ctl.signal.aborted) setSol({ list: [], error: e.message })
      })
    return () => ctl.abort()
  }, [])

  const gk = recommendedGkZone(s.lon)
  const utm = recommendedUtmZone(s.lon)
  const pCtm = project(s.lat, s.lon, 'EPSG:9377')
  const pGk = project(s.lat, s.lon, gk.code)
  const pUtm = project(s.lat, s.lon, utm.code)

  const freshLevel = classify(last)
  const d = daysSince(last)
  const latest = sol?.list[0]

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {s.id} — {s.name}, {s.department}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {s.id}00COL · orden {s.order} · {s.status === 'active' ? 'activa' : 'inactiva'}
        </p>
        <div className="mt-3">
          <DataRow label="DOMES / IERS" value={s.domes ?? '—'} />
          <DataRow label="Redes" value={s.networks.join(', ') || '—'} />
          <DataRow label="Operador" value={s.operator || '—'} />
          <DataRow label="Municipio (DANE)" value={`${s.name}${s.daneCode ? ` · ${s.daneCode}` : ''}`} />
          <DataRow label="Materialización" value={s.materialized ?? '—'} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">
          Coordenadas oficiales
        </h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Coordenadas geodésicas ajustadas (no navegadas) en el marco MAGNA-SIRGAS
          {s.datum ? ` (EPSG:${s.datum})` : ''}, calculadas por el Centro de Control
          Geodésico del IGAC. Están en una época de referencia fija de la realización
          MAGNA-SIRGAS (~2018.4), sin propagar a la fecha actual. Para la posición en
          tu época de observación y la velocidad de la estación, usa la solución
          multianual de SIRGAS (abajo).
        </p>
        <DataRow label="Latitud" value={formatDms(s.lat, 'lat')} />
        <DataRow label="Longitud" value={formatDms(s.lon, 'lon')} />
        <DataRow label="Lat / Lon (dec.)" value={`${s.lat.toFixed(7)} · ${s.lon.toFixed(7)}`} />
        <DataRow label="Altura elipsoidal" value={s.heightM != null ? `${s.heightM} m` : '—'} />
        {s.xyz && (
          <>
            <DataRow label="X geocéntrico" value={`${s.xyz[0].toFixed(3)} m`} />
            <DataRow label="Y geocéntrico" value={`${s.xyz[1].toFixed(3)} m`} />
            <DataRow label="Z geocéntrico" value={`${s.xyz[2].toFixed(3)} m`} />
          </>
        )}
        <DataRow label="CTM12 (EPSG:9377)" value={`${pCtm.easting.toFixed(3)} E · ${pCtm.northing.toFixed(3)} N`} />
        <DataRow label={gk.label} value={`${pGk.easting.toFixed(3)} E · ${pGk.northing.toFixed(3)} N`} />
        <DataRow label={utm.label.replace(' (GRS80)', '')} value={`${pUtm.easting.toFixed(3)} E · ${pUtm.northing.toFixed(3)} N`} />
        <p className="mt-2 text-xs text-slate-400">
          Proyecciones calculadas con proj4 a partir de las geográficas oficiales.
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Equipo</h3>
        <DataRow label="Receptor" value={s.receiver ?? '—'} />
        <DataRow label="Antena" value={s.antenna ?? '—'} />
        <DataRow label="Altura ARP" value={s.arpHeightM != null ? `${s.arpHeightM} m` : '—'} />
        <DataRow label="Tasa de muestreo" value={s.sampleRateS != null ? `${s.sampleRateS} s` : '—'} />
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Datos y disponibilidad</h3>
        <DataRow
          label="Último RINEX conocido"
          value={
            last
              ? `${last}${d != null ? ` (${d} d)` : ''} · ${
                  freshLevel === 'ok' ? 'al día' : freshLevel === 'warn' ? 'con retraso' : 'sin datos recientes'
                }`
              : 'sin verificar'
          }
        />
        <p className="mt-3 flex flex-wrap gap-3 text-sm">
          <a href={`#/rinex?station=${s.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Descargar RINEX →
          </a>
          <a href={`#/estado`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Estado de la red →
          </a>
          <ExternalLink href={rinexDeepLink(s.id, s.tId)}>Página de RINEX del IGAC</ExternalLink>
        </p>
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">Soluciones SIRGAS</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Coordenadas en el marco SIRGAS y serie temporal (posiciones semanales y
          solución multianual con velocidades).
        </p>
        <ul className="space-y-1.5 text-sm">
          <li>
            <ExternalLink href={sirgasStationUrl(s.id)}>
              Estación {s.id} en SIRGAS — coordenadas y serie temporal
            </ExternalLink>
          </li>
          <li><ExternalLink href={SIRGAS_LINKS.weekly}>Soluciones semanales (loosely constrained, SINEX)</ExternalLink></li>
          <li><ExternalLink href={SIRGAS_LINKS.multiYear}>Soluciones multianuales (posiciones + velocidades)</ExternalLink></li>
          <li><ExternalLink href={SIRGAS_LINKS.ftp}>Repositorio FTP de SIRGAS</ExternalLink></li>
        </ul>
        {!s.domes && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Sin número DOMES; puede que la estación no esté en SIRGAS-CON.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">Soluciones semanales del IGAC</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Archivos <code>IGA&lt;semana&gt;.CRD</code> (formato Bernese) con las
          coordenadas de toda la Red MAGNA-ECO por semana GPS.
        </p>
        {sol == null && <p className="text-sm text-slate-500">Consultando disponibilidad…</p>}
        {sol?.error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            No se pudo consultar el IGAC. {sol.error}
          </p>
        )}
        {latest && (
          <>
            <DataRow label="Última publicada" value={`${latest.name} · semana GPS ${latest.gpsWeek}`} />
            <DataRow label="Semana desde" value={latest.weekStart} />
            <DataRow label="Publicada el" value={latest.published} />
            <DataRow label="Semanas disponibles" value={`${sol!.list.length} (desde la ${sol!.list.at(-1)?.gpsWeek})`} />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              El IGAC no ofrece descarga pública directa de los <code>.CRD</code>. Solicítalos en{' '}
              <ExternalLink href={IGAC_LINKS.datosAbiertos}>Datos Abiertos — Geodesia</ExternalLink>{' '}
              o a magnaeco@igac.gov.co.
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
