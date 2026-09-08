import { useEffect, useMemo, useRef, useState } from 'react'
import { Field, TextInput, Select } from './ui'
import { PROJECTED_CRS, unproject, fromGeocentric } from '../lib/coords'
import { dmsToDecimal } from '../lib/geodesy'

export interface Geodetic {
  lat: number
  lon: number
  h: number
}

/** `'geo-dec' | 'geo-dms' | 'ecef'` o un código de `PROJECTED_CRS`. */
export type EntrySystem = string

export const isProjectedSystem = (s: string) => s.startsWith('EPSG:') || s.startsWith('UTM')

const n = (v: string) => Number(v.replace(',', '.').trim())
const filled = (v: string) => v.trim() !== ''

interface DmsParts {
  d: string
  m: string
  s: string
  hem: string
}

/**
 * Entrada de un punto en el sistema elegido, con una casilla por componente
 * (grados/minutos/segundos, X/Y/Z o Este/Norte/altura). Emite el punto ya
 * reducido a geográficas por `onChange`.
 */
export function CoordinateEntry({
  system,
  onSystemChange,
  onChange,
  idValue,
  onIdChange,
}: {
  system: EntrySystem
  onSystemChange: (s: EntrySystem) => void
  onChange: (g: Geodetic | null) => void
  idValue?: string
  onIdChange?: (v: string) => void
}) {
  const [latDec, setLatDec] = useState('4.5962000')
  const [lonDec, setLonDec] = useState('-74.0775080')
  const [lat, setLat] = useState<DmsParts>({ d: '4', m: '35', s: '46.320', hem: 'N' })
  const [lon, setLon] = useState<DmsParts>({ d: '74', m: '4', s: '39.029', hem: 'W' })
  const [xyz, setXyz] = useState({ x: '', y: '', z: '' })
  const [en, setEn] = useState({ e: '', nn: '' })
  const [h, setH] = useState('2550')

  const geo = useMemo<Geodetic | null>(() => {
    const ht = filled(h) ? n(h) : 0
    if (!Number.isFinite(ht)) return null

    if (system === 'geo-dec') {
      if (!filled(latDec) || !filled(lonDec)) return null
      const la = n(latDec)
      const lo = n(lonDec)
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null
      return { lat: la, lon: lo, h: ht }
    }

    if (system === 'geo-dms') {
      if (!filled(lat.d) || !filled(lon.d)) return null
      const la = dmsToDecimal(Math.abs(n(lat.d)) || 0, n(lat.m) || 0, n(lat.s) || 0, lat.hem === 'S' ? -1 : 1)
      const lo = dmsToDecimal(Math.abs(n(lon.d)) || 0, n(lon.m) || 0, n(lon.s) || 0, lon.hem === 'W' ? -1 : 1)
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null
      return { lat: la, lon: lo, h: ht }
    }

    if (system === 'ecef') {
      if (![xyz.x, xyz.y, xyz.z].every(filled)) return null
      const v = [n(xyz.x), n(xyz.y), n(xyz.z)]
      if (!v.every(Number.isFinite)) return null
      const g = fromGeocentric(v[0], v[1], v[2])
      return Number.isFinite(g.lat) && Number.isFinite(g.lon) ? { lat: g.lat, lon: g.lon, h: g.h } : null
    }

    if (!filled(en.e) || !filled(en.nn)) return null
    const e = n(en.e)
    const north = n(en.nn)
    if (!Number.isFinite(e) || !Number.isFinite(north)) return null
    try {
      const g = unproject(system, e, north)
      return Number.isFinite(g.lat) && Number.isFinite(g.lon) ? { lat: g.lat, lon: g.lon, h: ht } : null
    } catch {
      return null
    }
  }, [system, latDec, lonDec, lat, lon, xyz, en, h])

  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => {
    cb.current(geo)
  }, [geo])

  const num = { type: 'number' as const, step: 'any', inputMode: 'decimal' as const }

  return (
    <div className="space-y-3">
      <Field label="Sistema de entrada">
        <Select value={system} onChange={(e) => onSystemChange(e.target.value)}>
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

      {onIdChange && (
        <Field label="Identificador (opcional)">
          <TextInput value={idValue ?? ''} onChange={(e) => onIdChange(e.target.value)} placeholder="P1" />
        </Field>
      )}

      {system === 'geo-dec' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Latitud (°)" hint="+ norte">
            <TextInput {...num} value={latDec} onChange={(e) => setLatDec(e.target.value)} />
          </Field>
          <Field label="Longitud (°)" hint="− oeste">
            <TextInput {...num} value={lonDec} onChange={(e) => setLonDec(e.target.value)} />
          </Field>
        </div>
      )}

      {system === 'geo-dms' && (
        <div className="space-y-2">
          <DmsRow label="Latitud" v={lat} set={setLat} hems={['N', 'S']} />
          <DmsRow label="Longitud" v={lon} set={setLon} hems={['E', 'W']} />
        </div>
      )}

      {system === 'ecef' && (
        <div className="space-y-2">
          <Field label="X (m)">
            <TextInput {...num} value={xyz.x} onChange={(e) => setXyz({ ...xyz, x: e.target.value })} />
          </Field>
          <Field label="Y (m)">
            <TextInput {...num} value={xyz.y} onChange={(e) => setXyz({ ...xyz, y: e.target.value })} />
          </Field>
          <Field label="Z (m)">
            <TextInput {...num} value={xyz.z} onChange={(e) => setXyz({ ...xyz, z: e.target.value })} />
          </Field>
        </div>
      )}

      {isProjectedSystem(system) && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Este (E, m)">
            <TextInput {...num} value={en.e} onChange={(e) => setEn({ ...en, e: e.target.value })} />
          </Field>
          <Field label="Norte (N, m)">
            <TextInput {...num} value={en.nn} onChange={(e) => setEn({ ...en, nn: e.target.value })} />
          </Field>
        </div>
      )}

      {system !== 'ecef' && (
        <Field label="Altura elipsoidal (m)" hint="Necesaria para las geocéntricas; si falta se usa 0.">
          <TextInput {...num} value={h} onChange={(e) => setH(e.target.value)} />
        </Field>
      )}
    </div>
  )
}

function DmsRow({
  label,
  v,
  set,
  hems,
}: {
  label: string
  v: DmsParts
  set: (x: DmsParts) => void
  hems: [string, string]
}) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="grid grid-cols-[1fr_1fr_1.4fr_4rem] gap-1.5">
        <TextInput type="number" step="any" inputMode="decimal" aria-label={`${label} grados`} placeholder="grados" value={v.d} onChange={(e) => set({ ...v, d: e.target.value })} />
        <TextInput type="number" step="any" inputMode="decimal" aria-label={`${label} minutos`} placeholder="min" value={v.m} onChange={(e) => set({ ...v, m: e.target.value })} />
        <TextInput type="number" step="any" inputMode="decimal" aria-label={`${label} segundos`} placeholder="seg" value={v.s} onChange={(e) => set({ ...v, s: e.target.value })} />
        <Select aria-label={`${label} hemisferio`} value={v.hem} onChange={(e) => set({ ...v, hem: e.target.value })} className="px-2">
          <option value={hems[0]}>{hems[0]}</option>
          <option value={hems[1]}>{hems[1]}</option>
        </Select>
      </div>
      <span className="mt-1 block text-xs text-slate-400">grados · minutos · segundos · hemisferio</span>
    </div>
  )
}
