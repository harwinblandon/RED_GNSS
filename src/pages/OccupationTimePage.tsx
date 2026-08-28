import { useMemo, useState } from 'react'
import { PageHeader, Card, Field, TextInput, Select, DataRow } from '../components/ui'
import { ExternalLink } from '../components/ui'
import {
  CAPTURE_PARAMS,
  ORDER_SPECS,
  occupationTimeAlturas,
  orderSpec,
  type NormMode,
} from '../lib/igacNorms'
import { formatMinutes } from '../lib/format'

export default function OccupationTimePage() {
  const [mode, setMode] = useState<NormMode>('alturas')

  return (
    <div>
      <PageHeader
        title="Tiempo de ocupación"
        status="beta"
        subtitle="Dos marcos normativos del IGAC para planear el tiempo mínimo de rastreo en estático diferencial. Elige el que corresponda al objetivo del levantamiento."
      />

      <div className="mb-6 inline-flex rounded-lg border border-slate-300 p-1 dark:border-slate-700">
        <ModeTab active={mode === 'alturas'} onClick={() => setMode('alturas')}>
          Guía de alturas (15 + 5·d)
        </ModeTab>
        <ModeTab active={mode === 'res1468'} onClick={() => setMode('res1468')}>
          Resolución 1468/2021 (por orden)
        </ModeTab>
      </div>

      {mode === 'alturas' ? <AlturasCalculator /> : <Res1468Reference />}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-brand-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function AlturasCalculator() {
  const [baseline, setBaseline] = useState('8')
  const [excellent, setExcellent] = useState(false)

  const result = useMemo(() => {
    const d = Number(baseline)
    if (!Number.isFinite(d) || d < 0) return null
    return occupationTimeAlturas(d, { excellentConfig: excellent })
  }, [baseline, excellent])

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card>
        <div className="space-y-4">
          <Field label="Longitud de línea base (km)" hint="Distancia del rover a la estación base.">
            <TextInput
              type="number"
              min={0}
              step={0.1}
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={excellent}
              onChange={(e) => setExcellent(e.target.checked)}
              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Configuración del sistema excelente (3 min/km)
          </label>
        </div>
      </Card>

      <Card>
        {result ? (
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Tiempo mínimo de rastreo</p>
            <p className="mt-1 text-4xl font-bold tabular text-brand-600 dark:text-brand-400">
              {Math.round(result.minutes)} min
            </p>
            <p className="tabular text-sm text-slate-500">{formatMinutes(result.minutes)}</p>

            <div className="mt-4">
              <DataRow label="Fórmula" value={`15 + ${result.ratePerKm} · d`} />
              <DataRow label="Piso normativo (18 min)" value={result.flooredTo18 ? 'aplicado' : 'no aplica'} />
              <DataRow
                label="Línea base ≤ 20 km"
                value={result.exceedsRecommendedBaseline ? '⚠ supera lo recomendado' : 'ok'}
              />
            </div>

            {result.exceedsRecommendedBaseline && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                La guía recomienda evitar rastreos sobre líneas base mayores a 20 km.
                Considera una base más cercana o divide el trabajo en circuitos.
              </p>
            )}

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Se recomienda rastreo doble sobre cada punto. El conteo inicia tras la
              estabilización del equipo y con disponibilidad mínima de 4 satélites.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Ingresa una longitud de línea base válida.</p>
        )}
      </Card>

      <div className="lg:col-span-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Fuente:{' '}
          <ExternalLink href="https://redgeodesica.igac.gov.co/documentos/GUIA_METODOLOGICA_PARA_LA_OBTENCION_DE_ALTURAS_A_PARTIR_DE%20DATOS_GNSS_SWLEON.pdf">
            Guía metodológica para la obtención de alturas a partir de datos GNSS (IGAC)
          </ExternalLink>
          . Modelo orientado a traslado de alturas (orden trigonométrico); hoy el modelo
          geoidal vigente es QGeoidCOL2023.
        </p>
      </div>
    </div>
  )
}

function Res1468Reference() {
  const [order, setOrder] = useState<'2' | '3' | '4'>('3')
  const spec = orderSpec(Number(order) as 2 | 3 | 4)

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card>
        <Field
          label="Orden del vértice a establecer"
          hint="Órdenes 0 y 1 corresponden a estaciones de operación continua (MAGNA-ECO)."
        >
          <Select value={order} onChange={(e) => setOrder(e.target.value as '2' | '3' | '4')}>
            <option value="2">Orden 2</option>
            <option value="3">Orden 3</option>
            <option value="4">Orden 4</option>
          </Select>
        </Field>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900 dark:text-white">{spec.label}</h3>
        <div className="mt-3">
          <DataRow label="Tiempo de medición" value={spec.timeText} />
          <DataRow label="Rango" value={`${formatMinutes(spec.minMinutes)} – ${formatMinutes(spec.maxMinutes)}`} />
          <DataRow label="Vértices simultáneos (orden superior)" value={`≥ ${spec.simultaneousVertices}`} />
          <DataRow label="Software de proceso" value={spec.software} />
          <DataRow label="Máscara de elevación" value={`${CAPTURE_PARAMS.elevationMaskDeg.min}°–${CAPTURE_PARAMS.elevationMaskDeg.max}°`} />
          <DataRow label="Intervalo de registro" value={`${CAPTURE_PARAMS.recordingIntervalSec} s (remuestreo ${CAPTURE_PARAMS.resamplingSec.join('/')} s)`} />
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{spec.precisionNote}</p>
      </Card>

      <div className="lg:col-span-2">
        <Card>
          <h4 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Todos los órdenes
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-4 font-medium">Orden</th>
                  <th className="py-2 pr-4 font-medium">Tiempo de medición</th>
                  <th className="py-2 pr-4 font-medium">Simult.</th>
                  <th className="py-2 font-medium">Software</th>
                </tr>
              </thead>
              <tbody>
                {ORDER_SPECS.map((s) => (
                  <tr key={s.order} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{s.order}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{s.timeText}</td>
                    <td className="py-2 pr-4 tabular text-slate-600 dark:text-slate-400">
                      {s.simultaneousVertices || '—'}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{s.software}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Fuente:{' '}
          <ExternalLink href="https://redgeodesica.igac.gov.co/documentos/resolucion_1468_de_2021.pdf">
            Resolución IGAC 1468 de 2021
          </ExternalLink>
          , artículo 8 (vértices geodésicos de control horizontal y vertical GNSS).
        </p>
      </div>
    </div>
  )
}
