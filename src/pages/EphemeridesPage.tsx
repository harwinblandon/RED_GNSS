import { useMemo, useState } from 'react'
import { PageHeader, Card, Field, TextInput, DataRow, ExternalLink } from '../components/ui'
import { ExternalIcon } from '../components/icons'
import { isoDate } from '../lib/gpsTime'
import { ephemerisFor, type EphemProduct } from '../lib/ephemeris'
import { dayOfWeekLabel } from '../lib/gpsTime'

const defaultDate = isoDate(new Date(Date.now() - 2 * 86_400_000))

export default function EphemeridesPage() {
  const [dateStr, setDateStr] = useState(defaultDate)

  const info = useMemo(() => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return null
    const base = new Date(Date.UTC(y, m - 1, d))
    if (Number.isNaN(base.getTime())) return null
    return ephemerisFor(base)
  }, [dateStr])

  return (
    <div>
      <PageHeader
        title="Efemérides"
        status="beta"
        subtitle="Enlaces a las efemérides transmitidas y precisas del IGS según la fecha del levantamiento, con el nombre de archivo y varios espejos de descarga."
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-4">
          <Card>
            <Field label="Fecha de observación (UTC)">
              <TextInput type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </Field>
            <div className="mt-3 flex gap-2">
              <Quick label="Hoy" onClick={() => setDateStr(isoDate(new Date()))} />
              <Quick label="−2 d" onClick={() => setDateStr(defaultDate)} />
              <Quick label="−20 d" onClick={() => setDateStr(isoDate(new Date(Date.now() - 20 * 86_400_000)))} />
            </div>
          </Card>

          {info && (
            <Card>
              <DataRow label="Semana GPS" value={info.gpsWeek} />
              <DataRow label="Día GPS" value={`${info.dayOfWeek} · ${dayOfWeekLabel(info.dayOfWeek)}`} />
              <DataRow label="DOY" value={`${info.year}-${String(info.doy).padStart(3, '0')}`} />
              <DataRow label="Antigüedad" value={`${info.ageDays} día(s)`} />
              <DataRow label="Nomenclatura" value={info.longNames ? 'larga (IGS20)' : 'corta'} />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {info?.products.map((p) => <ProductCard key={p.key} p={p} />)}

          <Card>
            <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Referencia</h3>
            <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <ExternalLink href="https://igs.org/products/">
                  IGS — descripción de productos, precisión y latencias
                </ExternalLink>
              </li>
              <li>
                <ExternalLink href="https://cddis.nasa.gov/Data_and_Derived_Products/CreateNetrcFile.html">
                  CDDIS — cómo crear el acceso Earthdata (.netrc)
                </ExternalLink>
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Para post-proceso estático diferencial contra MAGNA-ECO suelen bastar las
              efemérides <strong>rápidas</strong>; usa <strong>finales</strong> si buscas
              la máxima exactitud y la fecha ya las tiene disponibles.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ProductCard({ p }: { p: EphemProduct }) {
  return (
    <Card className={p.recommended ? 'ring-2 ring-brand-500' : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-900 dark:text-white">{p.label}</h3>
        {p.recommended && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            recomendada
          </span>
        )}
        {!p.likelyAvailable && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            aún no disponible
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latencia: {p.latency}</p>

      <div className="mt-3 space-y-1">
        {p.files.map((f) => (
          <code
            key={f}
            className="block overflow-x-auto rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {f}
          </code>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {p.mirrors.map((m) => (
          <div key={m.host} className="flex items-center gap-1">
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {m.host}
              <ExternalIcon width={12} height={12} />
            </a>
            <button
              onClick={() => navigator.clipboard?.writeText(m.url)}
              title="Copiar URL"
              className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              copiar
            </button>
            {m.note && <span className="text-xs text-slate-400">{m.note}</span>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function Quick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {label}
    </button>
  )
}
