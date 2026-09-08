import { useMemo, useState } from 'react'
import { PageHeader, Card, Field, TextInput, Select, ExternalLink } from '../components/ui'
import {
  PROJECTED_CRS,
  project,
  unproject,
  toGeocentric,
  fromGeocentric,
  recommendedGkZone,
  recommendedUtmZone,
} from '../lib/coords'
import { dmsToDecimal } from '../lib/geodesy'
import { formatDms } from '../lib/format'

type InputKind = 'geo-dec' | 'geo-dms' | 'ecef' | string // string = PROJECTED_CRS code

interface Geodetic {
  lat: number
  lon: number
  h: number
}

const numsIn = (s: string) =>
  (s.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(',', '.')))

/** [d, m, s] (con m/s opcionales) → grados decimales, aplicando el signo del hemisferio. */
function toDeg(arr: number[], sign: 1 | -1): number | null {
  if (arr.length === 0 || arr.some((n) => !Number.isFinite(n))) return null
  const [d = 0, m = 0, s = 0] = arr.map(Math.abs)
  return dmsToDecimal(d, m, s, sign)
}

/**
 * Extrae latitud y longitud de un texto en G° M' S" pegado. Acepta símbolos
 * (° ' "), comas decimales y los hemisferios N/S/E/W. Ejemplos válidos:
 *   4 35 46.3 N  74 04 39.0 W
 *   4°35'46.3"N, 74°04'39.0"W
 *   -4 35 46.3 ; -74 04 39.0
 */
function parseDmsPair(text: string): { lat: number; lon: number } | null {
  const t = text.trim()
  if (!t) return null

  const idxNS = t.search(/[NSns]/)
  const idxEW = t.search(/[EWew]/)
  if (idxNS >= 0 && idxEW > idxNS) {
    const latH: 1 | -1 = t[idxNS].toUpperCase() === 'S' ? -1 : 1
    const lonH: 1 | -1 = t[idxEW].toUpperCase() === 'W' ? -1 : 1
    const lat = toDeg(numsIn(t.slice(0, idxNS)), latH)
    const lon = toDeg(numsIn(t.slice(idxNS + 1, idxEW)), lonH)
    if (lat != null && lon != null) return { lat, lon }
    return null
  }

  // sin hemisferios: dos grupos separados por coma, punto y coma o salto de línea
  const groups = t
    .split(/[;,\n]/)
    .map((g) => g.trim())
    .filter(Boolean)
  if (groups.length >= 2) {
    const a = numsIn(groups[0])
    const b = numsIn(groups[1])
    const lat = toDeg(a, a[0] < 0 ? -1 : 1)
    const lon = toDeg(b, b[0] < 0 ? -1 : 1)
    if (lat != null && lon != null) return { lat, lon }
  }
  return null
}

export default function CoordinatesPage() {
  const [kind, setKind] = useState<InputKind>('geo-dec')

  // geográficas decimales / altura común
  const [lat, setLat] = useState('4.596200')
  const [lon, setLon] = useState('-74.077508')
  const [h, setH] = useState('2550')
  // GMS
  const [dms, setDms] = useState('4 35 46.320 N  74 04 39.029 W')
  // geocéntricas
  const [x, setX] = useState('1744865.220')
  const [y, setY] = useState('-6116283.189')
  const [z, setZ] = useState('507891.840')
  // proyectadas
  const [easting, setEasting] = useState('4880524.169')
  const [northing, setNorthing] = useState('2065965.397')

  const geo: Geodetic | null = useMemo(() => {
    const ht = Number(h) || 0
    if (kind === 'geo-dec') {
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null
      return { lat: la, lon: lo, h: ht }
    }
    if (kind === 'geo-dms') {
      const p = parseDmsPair(dms)
      return p ? { lat: p.lat, lon: p.lon, h: ht } : null
    }
    if (kind === 'ecef') {
      const nx = Number(x)
      const ny = Number(y)
      const nz = Number(z)
      if (![nx, ny, nz].every(Number.isFinite)) return null
      const g = fromGeocentric(nx, ny, nz)
      return { lat: g.lat, lon: g.lon, h: g.h }
    }
    // proyectada
    const e = Number(easting)
    const n = Number(northing)
    if (!Number.isFinite(e) || !Number.isFinite(n)) return null
    try {
      const g = unproject(kind, e, n)
      return { lat: g.lat, lon: g.lon, h: ht }
    } catch {
      return null
    }
  }, [kind, lat, lon, h, dms, x, y, z, easting, northing])

  return (
    <div>
      <PageHeader
        title="Conversión de coordenadas"
        subtitle={`Ingresa coordenadas en cualquier sistema (geográficas en grados o G° M' S", geocéntricas o planas) y obtén todas las representaciones.`}
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <div className="space-y-3">
            <Field label="Sistema de entrada">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
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

            {kind === 'geo-dec' && (
              <>
                <Field label="Latitud (°)" hint="Positiva al norte.">
                  <TextInput type="number" step="any" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
                </Field>
                <Field label="Longitud (°)" hint="Negativa al oeste.">
                  <TextInput type="number" step="any" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
                </Field>
              </>
            )}

            {kind === 'geo-dms' && (
              <Field
                label={`Latitud y longitud en G° M' S"`}
                hint={`Pega o escribe, p. ej. 4 35 46.3 N 74 04 39.0 W  (también acepta °, ' " y comas).`}
              >
                <TextInput value={dms} onChange={(e) => setDms(e.target.value)} placeholder={`4°35'46.3"N 74°04'39.0"W`} />
              </Field>
            )}

            {kind === 'ecef' && (
              <>
                <Field label="X (m)"><TextInput type="number" step="any" inputMode="decimal" value={x} onChange={(e) => setX(e.target.value)} /></Field>
                <Field label="Y (m)"><TextInput type="number" step="any" inputMode="decimal" value={y} onChange={(e) => setY(e.target.value)} /></Field>
                <Field label="Z (m)"><TextInput type="number" step="any" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} /></Field>
              </>
            )}

            {kind !== 'geo-dec' && kind !== 'geo-dms' && kind !== 'ecef' && (
              <>
                <Field label="Este / E (m)"><TextInput type="number" step="any" inputMode="decimal" value={easting} onChange={(e) => setEasting(e.target.value)} /></Field>
                <Field label="Norte / N (m)"><TextInput type="number" step="any" inputMode="decimal" value={northing} onChange={(e) => setNorthing(e.target.value)} /></Field>
              </>
            )}

            {kind !== 'ecef' && (
              <Field label="Altura elipsoidal (m)" hint="Necesaria para las geocéntricas; si no la das se usa 0.">
                <TextInput type="number" step="any" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} />
              </Field>
            )}
          </div>
        </Card>

        <div>{geo ? <Output geo={geo} /> : <Card><p className="text-sm text-slate-500">Ingresa coordenadas válidas.</p></Card>}</div>
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
