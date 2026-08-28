import { useMemo, useState } from 'react'
import { PageHeader, Card, Field, TextInput, DataRow } from '../components/ui'
import {
  dateFromDoy,
  dateFromGpsWeek,
  dayOfWeekLabel,
  gpsTimeFromDate,
  isoDate,
} from '../lib/gpsTime'

const todayIso = isoDate(new Date())

export default function GpsCalendarPage() {
  const [dateStr, setDateStr] = useState(todayIso)
  const [hour, setHour] = useState('')

  const info = useMemo(() => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return null
    const base = new Date(Date.UTC(y, m - 1, d))
    if (Number.isNaN(base.getTime())) return null
    const hourNum = hour.trim() === '' ? undefined : Number(hour)
    return gpsTimeFromDate(base, {
      hourUtc: hourNum !== undefined && Number.isFinite(hourNum) ? hourNum : undefined,
    })
  }, [dateStr, hour])

  return (
    <div>
      <PageHeader
        title="Calendario GPS"
        status="listo"
        subtitle="Conversión entre fecha civil (UTC) y tiempo GPS: semana GPS, día de la semana, DOY, MJD y fecha juliana. Los nombres de archivos IGS/RINEX se construyen con estos valores."
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card>
          <div className="space-y-4">
            <Field label="Fecha (UTC)">
              <TextInput
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              />
            </Field>
            <Field label="Hora UTC (opcional)" hint="0–24. Define los segundos de la semana y la letra de sesión.">
              <TextInput
                type="number"
                min={0}
                max={24}
                step={1}
                placeholder="día completo"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              <QuickButton label="Hoy" onClick={() => setDateStr(todayIso)} />
              <QuickButton
                label="Ayer"
                onClick={() =>
                  setDateStr(isoDate(new Date(Date.now() - 86_400_000)))
                }
              />
            </div>
          </div>
        </Card>

        <Card>
          {info ? (
            <div>
              <DataRow label="Fecha civil (UTC)" value={isoDate(info.date)} />
              <DataRow
                label="Día de la semana"
                value={`${dayOfWeekLabel(info.dayOfWeek)} (${info.dayOfWeek})`}
              />
              <DataRow label="Semana GPS" value={info.gpsWeek} />
              <DataRow label="Semana GPS (mód. 1024)" value={info.gpsWeekRollover} />
              <DataRow
                label="GPSW + día"
                value={`${info.gpsWeek}${info.dayOfWeek}`}
              />
              <DataRow
                label="Segundos de la semana"
                value={`${info.secondsOfWeek.toLocaleString('en-US').replace(/,/g, ' ')} s`}
              />
              <DataRow label="Día del año (DOY)" value={String(info.dayOfYear).padStart(3, '0')} />
              <DataRow label="Año-DOY" value={`${info.year}-${String(info.dayOfYear).padStart(3, '0')}`} />
              <DataRow label="Letra de sesión RINEX" value={info.sessionLetter} />
              <DataRow label="Fecha juliana (JD)" value={info.julianDate.toFixed(1)} />
              <DataRow label="Fecha juliana modificada (MJD)" value={info.modifiedJulianDate.toFixed(1)} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Ingresa una fecha válida.</p>
          )}
        </Card>
      </div>

      <ReverseLookup />

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        El cálculo de semana GPS / DOY se hace a medianoche UTC e ignora los
        segundos intercalares (convención de nomenclatura IGS). El tiempo GPS real
        va adelantado respecto a UTC por los segundos intercalares acumulados.
      </p>
    </div>
  )
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {label}
    </button>
  )
}

function ReverseLookup() {
  const [week, setWeek] = useState('')
  const [dow, setDow] = useState('0')
  const [year, setYear] = useState('')
  const [doy, setDoy] = useState('')

  const fromWeek = useMemo(() => {
    const w = Number(week)
    const d = Number(dow)
    if (!Number.isFinite(w) || week.trim() === '') return null
    return dateFromGpsWeek(w, Number.isFinite(d) ? d : 0)
  }, [week, dow])

  const fromDoy = useMemo(() => {
    const y = Number(year)
    const d = Number(doy)
    if (!y || !d || year.trim() === '' || doy.trim() === '') return null
    return dateFromDoy(y, d)
  }, [year, doy])

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Semana GPS → fecha</h3>
        <div className="flex gap-3">
          <Field label="Semana GPS">
            <TextInput type="number" value={week} onChange={(e) => setWeek(e.target.value)} />
          </Field>
          <Field label="Día (0–6)">
            <TextInput type="number" min={0} max={6} value={dow} onChange={(e) => setDow(e.target.value)} />
          </Field>
        </div>
        <p className="tabular mt-3 text-sm text-slate-900 dark:text-slate-100">
          {fromWeek ? isoDate(fromWeek) : '—'}
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Año + DOY → fecha</h3>
        <div className="flex gap-3">
          <Field label="Año">
            <TextInput type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="DOY">
            <TextInput type="number" min={1} max={366} value={doy} onChange={(e) => setDoy(e.target.value)} />
          </Field>
        </div>
        <p className="tabular mt-3 text-sm text-slate-900 dark:text-slate-100">
          {fromDoy ? isoDate(fromDoy) : '—'}
        </p>
      </Card>
    </div>
  )
}
