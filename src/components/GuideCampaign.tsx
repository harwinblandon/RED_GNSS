import { useEffect, useMemo, useRef, useState } from 'react'
import { ClientLogosField } from './ClientLogosField'
import { useClientLogos } from '../lib/clientLogos'
import { ExcelProtectField } from './ExcelProtectField'
import { Card, Field, TextInput, Select, Button } from './ui'
import {
  adjustCampaign,
  parseCampaign,
  type CampaignPoint,
  type GuideCase,
  type GuideResult,
  type WeightMode,
} from '../lib/guideAdjust'
import { autoCorrection, computeHeight, loadGrid, type Benchmark, type GeoidGrid, type GridName } from '../lib/heights'
import { formatDms } from '../lib/format'
import { downloadText } from '../lib/planning'
import { useReportMeta } from '../lib/reportMeta'
import { ReportMetaCard } from './ReportMetaCard'
import { exportExcel, exportPdf, guideReportDoc, type ReportData } from '../lib/guideReportExport'

/*
 * Campaña de alturas niveladas GNSS e informe según la Guía metodológica del
 * IGAC. El informe se imprime a PDF con la hoja de estilos de impresión
 * (solo .report queda visible).
 */

// Placas reales de la Red Vertical IGAC (Cartagena). P-01 y P-02 son placas
// niveladas tratadas como puntos nuevos (1 y 2): H real 3,853 m y 60,087 m.
const EXAMPLE = `id,lat,lon,h,H,t_min
13001028,10.643411,-75.402598,-3.530,3.122,60
13001030,10.654466,-75.377741,2.830,9.515,60
13001035,10.676480,-75.321778,66.240,72.947,60
13001036,10.683413,-75.311151,55.320,62.030,60
1,10.654671,-75.393274,-2.830,,45
2,10.659875,-75.344358,53.430,,45`

type Meta = ReportData['meta']

const f4 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(4))
const s4 = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(4)}`)
const CASE_LABEL: Record<GuideCase, string> = {
  punto: 'Caso 1 — Punto',
  superficie: 'Caso 3 — Superficie',
  perfil: 'Caso 2 — Perfil',
}

export function GuideCampaign({ leveling, initialText = '' }: { leveling: Benchmark[] | null; initialText?: string }) {
  const [meta, setMeta] = useReportMeta()
  const [text, setText] = useState(initialText)
  const [guideCase, setGuideCase] = useState<GuideCase>('superficie')
  const [modelName, setModelName] = useState<GridName>('qgeoidcol2023')
  const [weights, setWeights] = useState<WeightMode>('iguales')
  const [maxKm, setMaxKm] = useState('20')
  const [grid, setGrid] = useState<GeoidGrid | null>(null)
  const [qgrid, setQgrid] = useState<GeoidGrid | null>(null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [xlsPassword, setXlsPassword] = useState('')
  const [logos, setLogos] = useClientLogos()
  const [exportError, setExportError] = useState<string | null>(null)


  useEffect(() => {
    loadGrid(modelName).then(setGrid)
  }, [modelName])
  useEffect(() => {
    loadGrid('qgeoidcol2023').then(setQgrid)
  }, [])

  const parsed = useMemo(() => parseCampaign(text), [text])

  /** Puntos con H aplicada desde la Red Vertical (sobre lo que escribió el usuario). */
  const points = useMemo<CampaignPoint[]>(
    () =>
      parsed.points.map((p) =>
        p.H == null && overrides[p.id] != null ? { ...p, H: overrides[p.id], Hsource: 'red-vertical' } : p,
      ),
    [parsed.points, overrides],
  )

  const matches = useMemo(() => {
    if (!leveling) return []
    const byId = new Map(leveling.map((b) => [b.id, b]))
    return parsed.points.filter((p) => p.H == null && byId.has(p.id)).map((p) => byId.get(p.id)!)
  }, [parsed.points, leveling])

  const result = useMemo<GuideResult | null>(() => {
    if (!grid || points.length === 0) return null
    const mk = Number(maxKm.replace(',', '.'))
    return adjustCampaign(points, grid, { guideCase, weights, maxKm: Number.isFinite(mk) && mk > 0 ? mk : 20 })
  }, [grid, points, guideCase, weights, maxKm])

  /** Contraste independiente con el ajuste regional de la red GNSS/nivelación del IGAC. */
  const contrast = useMemo(() => {
    if (!result || !leveling || !qgrid || result.points.length === 0) return null
    return result.points
      .filter((p) => !p.isNP)
      .map((p) => {
        const src = points.find((x) => x.id === p.id)!
        const corr = autoCorrection(src, leveling, qgrid)
        const r = computeHeight(src, qgrid, { correction: corr })
        return { id: p.id, H: p.H, regional: r.leveled, used: corr?.used ?? 0 }
      })
  }, [result, leveling, qgrid, points])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) f.text().then(setText)
  }

  function fillFromNetwork() {
    setOverrides(Object.fromEntries(matches.map((b) => [b.id, b.H])))
  }

  async function download(kind: 'pdf' | 'xlsx') {
    if (!result) return
    const data: ReportData = { meta, result, points, contrast, generated: new Date() }
    setBusy(kind)
    setExportError(null)
    try {
      const doc = { ...guideReportDoc(data), extraLogos: logos }
      await (kind === 'pdf' ? exportPdf(doc) : exportExcel(doc, { password: xlsPassword, author: meta.responsable, matricula: meta.matricula }))
    } catch (e) {
      setExportError(`No se pudo generar el archivo: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  function exportCsv() {
    if (!result) return
    const head = ['id', 'tipo', 'lat', 'lon', 'h', result.model === 'GEOCOL2004' ? 'N' : 'zeta', 'H_inicial', 'H_GNSS_final', 'sigma']
    const rows = result.points.map((p) => {
      const src = points.find((x) => x.id === p.id)!
      return [p.id, p.isNP ? 'NP' : 'nuevo', src.lat.toFixed(9), src.lon.toFixed(9), src.h.toFixed(4), result.zeta[p.id].toFixed(4), p.Hinitial?.toFixed(4) ?? '', p.H.toFixed(4), p.sigma?.toFixed(4) ?? ''].join(',')
    })
    downloadText(`alturas_guia_igac_${meta.proyecto || 'campana'}.csv`.replace(/\s+/g, '_'), [head.join(','), ...rows].join('\n'), 'text/csv')
  }


  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr] print:hidden">
        <div className="space-y-4">
          <ReportMetaCard meta={meta} onChange={setMeta} withPartida />

          <Card>
            <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Método</p>
            <div className="space-y-2.5">
              <Field label="Caso de la guía">
                <Select value={guideCase} onChange={(e) => setGuideCase(e.target.value as GuideCase)}>
                  <option value="punto">Caso 1 — Punto (≥ 2 NP)</option>
                  <option value="superficie">Caso 3 — Superficie (≥ 4 NP)</option>
                  <option value="perfil">Caso 2 — Perfil (orden de la tabla)</option>
                </Select>
              </Field>
              <Field label="Modelo geoidal">
                <Select value={modelName} onChange={(e) => setModelName(e.target.value as GridName)}>
                  <option value="qgeoidcol2023">QGeoidCOL2023 (Res. 515 de 2026)</option>
                  <option value="geocol2004">GEOCOL2004 (transición)</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pesos">
                  <Select value={weights} onChange={(e) => setWeights(e.target.value as WeightMode)}>
                    <option value="iguales">Iguales (guía)</option>
                    <option value="distancia">1 / distancia</option>
                  </Select>
                </Field>
                <Field label="Línea base máx. (km)"><TextInput inputMode="decimal" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} /></Field>
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Puntos de la campaña</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setText(EXAMPLE)}>Ejemplo</Button>
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>Cargar CSV/TXT</Button>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setOverrides({})
              }}
              rows={10}
              placeholder={'id,lat,lon,h,H,t_min\nNP-1,4.6210,-74.0610,2697.2876,2673.2700,45\n1,4.6120,-74.0750,2601.4500,,30'}
              className="tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Columnas: <strong>id, lat, lon, h</strong> (altura elipsoidal ajustada del post-proceso) y, para los NP,
              <strong> H</strong> (altura nivelada del certificado IGAC). Opcional <strong>t_min</strong> (tiempo de rastreo).
              Latitud/longitud en grados decimales o G M S con hemisferio. En el Caso 2 el orden de las filas es el
              orden del perfil.
            </p>
            {parsed.errors.length > 0 && text.trim() !== '' && (
              <p className="mt-2 text-xs text-rose-600">{parsed.errors.slice(0, 3).join(' · ')}</p>
            )}
            {matches.length > 0 && Object.keys(overrides).length === 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
                <span>
                  {matches.length} punto(s) sin H coinciden con placas de la Red Vertical del IGAC ({matches.map((m) => m.id).join(', ')}).
                </span>
                <Button variant="secondary" onClick={fillFromNetwork}>Usar su H nivelada</Button>
              </div>
            )}
          </Card>

          {result && result.errors.length > 0 && (
            <Card><p className="text-sm text-rose-600">{result.errors.join(' ')}</p></Card>
          )}

          {result && result.points.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Descargar el informe</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Con tu logo, numeración de páginas y tablas. La vista previa está abajo.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => download('pdf')} disabled={busy != null}>{busy === 'pdf' ? 'Generando…' : 'PDF'}</Button>
                  <Button onClick={() => download('xlsx')} disabled={busy != null}>{busy === 'xlsx' ? 'Generando…' : 'Excel (.xlsx)'}</Button>
                  <Button variant="secondary" onClick={exportCsv}>CSV</Button>
                </div>
              </div>
              <div className="mt-3">
                <ExcelProtectField value={xlsPassword} onChange={setXlsPassword} />
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <ClientLogosField logos={logos} onChange={setLogos} />
              </div>
              {exportError && <p className="mt-2 text-xs text-rose-600">{exportError}</p>}
            </Card>
          )}
        </div>
      </div>

      {result && result.points.length > 0 && (
        <Report meta={meta} onObs={(v) => setMeta({ ...meta, observaciones: v })} result={result} points={points} contrast={contrast} />
      )}
    </div>
  )
}

/* -------------------------------- informe -------------------------------- */

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`border-b border-slate-300 px-2 py-1.5 font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}
function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return <td className={`border-b border-slate-100 px-2 py-1 ${right ? 'tabular text-right' : ''} ${strong ? 'font-semibold' : ''}`}>{children}</td>
}
function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mt-6 mb-2 border-b border-slate-300 pb-1 text-base font-bold text-slate-900">
      {n}. {children}
    </h2>
  )
}

function Report({
  meta,
  onObs,
  result,
  points,
  contrast,
}: {
  meta: Meta
  onObs: (v: string) => void
  result: GuideResult
  points: CampaignPoint[]
  contrast: { id: string; H: number; regional: number | null; used: number }[] | null
}) {
  const isQ = result.model === 'QGeoidCOL2023'
  const Nsym = isQ ? 'ζ' : 'N'
  const nps = points.filter((p) => p.H != null)
  const fresh = result.points.filter((p) => !p.isNP)
  const today = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
  const fails = result.compliance.filter((c) => c.ok === false).length
  let sec = 0

  return (
    <div className="report rounded-xl border border-slate-200 bg-white p-8 text-[13px] leading-relaxed text-slate-800 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <div className="mb-4 border-b-2 border-slate-900 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Informe técnico</p>
        <h1 className="text-xl font-bold text-slate-900">Cálculo de alturas niveladas GNSS</h1>
        <p className="text-slate-600">
          Según la <em>Guía metodológica para la obtención de alturas utilizando el sistema GNSS</em> (IGAC)
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
          <p><span className="text-slate-500">Proyecto:</span> {meta.proyecto || '—'}</p>
          <p><span className="text-slate-500">Contrato / cliente:</span> {meta.contrato || '—'}</p>
          <p><span className="text-slate-500">Campaña:</span> {meta.fechaCampana || '—'}</p>
          <p><span className="text-slate-500">Fecha del informe:</span> {today}</p>
          <p><span className="text-slate-500">Responsable:</span> {meta.responsable || '—'}{meta.matricula && ` · M.P. ${meta.matricula}`}</p>
          <p><span className="text-slate-500">Modelo geoidal:</span> {result.model}</p>
        </div>
      </div>

      <H2 n={++sec}>Objeto</H2>
      <p>
        Determinar la altura nivelada GNSS (H<sub>GNSS</sub>) de {fresh.length} punto(s) nuevo(s) a partir de las alturas
        elipsoidales obtenidas por posicionamiento GNSS diferencial y de {nps.length} vértice(s) de nivelación (NP) de la
        red vertical nacional ocupados en la misma campaña, aplicando la metodología de oficina de la guía del IGAC
        ({CASE_LABEL[result.guideCase]}).
      </p>

      <H2 n={++sec}>Marco normativo y de referencia</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>IGAC — <em>Guía metodológica para la obtención de alturas utilizando el sistema GNSS</em> (S. W. León, corrección y actualización del documento de L. Sánchez, 2004).</li>
        <li>Resolución IGAC 068 de 2005 — adopta MAGNA-SIRGAS como datum oficial de Colombia.</li>
        {isQ ? (
          <li>
            Resolución IGAC 515 de 2026 — adopta el modelo <strong>QGeoidCOL2023</strong> asociado a MAGNA-SIRGAS como
            superficie de conversión para alturas físicas, en reemplazo de GEOCOL2004 (Liu et al., 2024, <em>Earth, Planets
            and Space</em> 76:35). Es un cuasigeoide: entrega la anomalía de altura ζ, que en las fórmulas de la guía ocupa
            el lugar de la ondulación N.
          </li>
        ) : (
          <li>
            Modelo GEOCOL2004, de uso permitido durante la implementación progresiva de QGeoidCOL2023 según el parágrafo
            del artículo 5 de la Resolución IGAC 515 de 2026.
          </li>
        )}
        <li>Datum vertical: alturas niveladas de los NP referidas al mareógrafo de Buenaventura (red vertical del IGAC).</li>
      </ul>

      <H2 n={++sec}>Datos de campo</H2>
      <div className="mb-2 grid grid-cols-1 gap-x-6 text-xs sm:grid-cols-3">
        <p><span className="text-slate-500">Equipos:</span> {meta.equipos || '—'}</p>
        <p><span className="text-slate-500">Post-proceso:</span> {meta.software || '—'}</p>
        <p><span className="text-slate-500">Vértice de partida:</span> {meta.partida || '—'}</p>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr><Th>Punto</Th><Th>Tipo</Th><Th>Latitud</Th><Th>Longitud</Th><Th right>h (m)</Th><Th right>H nivelada (m)</Th><Th right>t (min)</Th></tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <Td strong>{p.id}</Td>
              <Td>{p.H != null ? 'NP' : 'Nuevo'}</Td>
              <Td>{formatDms(p.lat, 'lat')}</Td>
              <Td>{formatDms(p.lon, 'lon')}</Td>
              <Td right>{f4(p.h)}</Td>
              <Td right>{p.H != null ? `${f4(p.H)}${p.Hsource === 'red-vertical' ? ' *' : ''}` : '—'}</Td>
              <Td right>{p.tMin ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-500">
        h: altura elipsoidal MAGNA-SIRGAS ajustada en el post-proceso.
        {points.some((p) => p.Hsource === 'red-vertical') && ' (*) H tomada de la Red Vertical del IGAC (catálogo público); verificar contra el certificado.'}
      </p>

      <H2 n={++sec}>Metodología</H2>
      <p>Se aplica la metodología en oficina de la guía, con {Nsym} interpolado bilinealmente de {result.model} en cada punto:</p>
      <div className="tabular my-2 space-y-0.5 rounded bg-slate-50 px-4 py-2 text-xs print:bg-transparent">
        <p>(1) Δh<sub>i</sub> = h<sub>Ri</sub> − h<sub>Base</sub></p>
        <p>(2) Δ{Nsym}<sub>i</sub> = {Nsym}<sub>Ri</sub> − {Nsym}<sub>Base</sub></p>
        <p>(3) ΔH<sub>GNSS,i</sub> = Δh<sub>i</sub> − Δ{Nsym}<sub>i</sub></p>
        <p>(4) H°<sub>GNSS,i</sub> = H<sub>Base</sub> + ΔH<sub>GNSS,i</sub></p>
        <p>(6–8) Ajuste por mínimos cuadrados con las alturas niveladas de los NP como valores fijos</p>
        <p>(9) H<sub>GNSS,final</sub> = H<sub>nivelada de la base</sub> + ΔH<sub>ajustado</sub></p>
      </div>
      <p>
        {result.guideCase === 'perfil'
          ? 'Observaciones: diferencias ΔH_GNSS entre puntos consecutivos del perfil, en el orden de campo.'
          : `Observaciones: diferencia ΔH_GNSS desde cada NP a cada punto nuevo (líneas base ≤ ${result.maxKm} km).`}{' '}
        Pesos {result.weights === 'iguales' ? 'iguales (observaciones en condiciones iguales, como en la guía)' : 'inversamente proporcionales a la longitud de la línea base'}.
        El ajuste se resuelve por el método paramétrico, equivalente al correlativo de la guía (mismas correcciones v y
        mismas alturas; verificado con los ejemplos de los Casos 1 y 2 de la guía). Se trabaja con cuatro decimales.
      </p>

      <H2 n={++sec}>Cálculo y ajuste</H2>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr><Th>Desde</Th><Th>Hacia</Th><Th right>Dist. (km)</Th><Th right>Δh (m)</Th><Th right>Δ{Nsym} (m)</Th><Th right>ΔH<sub>GNSS</sub> (m)</Th><Th right>v (m)</Th><Th right>ΔH ajustado (m)</Th></tr>
        </thead>
        <tbody>
          {result.observations.map((o, i) => (
            <tr key={i}>
              <Td>{o.from}</Td><Td>{o.to}</Td>
              <Td right>{o.km.toFixed(2)}</Td><Td right>{s4(o.dh)}</Td><Td right>{s4(o.dN)}</Td>
              <Td right>{s4(o.L)}</Td><Td right>{s4(o.v)}</Td><Td right strong>{s4(o.Ladj)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs">
        Observaciones n = {result.n} · incógnitas u = {result.u} · redundancia r = {result.r}
        {result.sigma0 != null && <> · σ₀ a posteriori = {result.sigma0.toFixed(4)} m</>}
      </p>

      {result.npChecks.length > 0 && (
        <>
          <H2 n={++sec}>Control de consistencia entre NP</H2>
          <p className="mb-2">Diferencia de altura entre NP obtenida por GNSS (Δh − Δ{Nsym}) frente a la diferencia nivelada:</p>
          <table className="w-full border-collapse text-xs">
            <thead><tr><Th>NP</Th><Th>NP</Th><Th right>Dist. (km)</Th><Th right>GNSS (m)</Th><Th right>Nivelada (m)</Th><Th right>Discrepancia (m)</Th></tr></thead>
            <tbody>
              {result.npChecks.map((c) => (
                <tr key={`${c.a}-${c.b}`}>
                  <Td>{c.a}</Td><Td>{c.b}</Td><Td right>{c.km.toFixed(2)}</Td>
                  <Td right>{s4(c.gnss)}</Td><Td right>{s4(c.leveled)}</Td><Td right strong>{s4(c.diff)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <H2 n={++sec}>Resultados</H2>
      <table className="w-full border-collapse text-xs">
        <thead><tr><Th>Punto</Th><Th>Tipo</Th><Th right>{Nsym} {result.model} (m)</Th><Th right>Cota inicial H° (m)</Th><Th>Base H°</Th><Th right>Cota final H<sub>GNSS</sub> (m)</Th><Th right>σ (m)</Th></tr></thead>
        <tbody>
          {result.points.map((p) => (
            <tr key={p.id}>
              <Td strong>{p.id}</Td><Td>{p.isNP ? 'NP (fijo)' : 'Nuevo'}</Td>
              <Td right>{f4(result.zeta[p.id])}</Td><Td right>{f4(p.Hinitial)}</Td><Td>{p.baseId ?? '—'}</Td>
              <Td right strong>{f4(p.H)}</Td><Td right>{p.isNP ? '—' : f4(p.sigma)}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      <H2 n={++sec}>Verificación frente a la guía</H2>
      <ul className="space-y-1">
        {result.compliance.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className={`w-14 shrink-0 font-semibold ${c.ok === true ? 'text-emerald-700' : c.ok === false ? 'text-rose-700' : 'text-slate-500'}`}>
              {c.ok === true ? 'Cumple' : c.ok === false ? 'Revisar' : 'N/A'}
            </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      {fails === 0 && <p className="mt-2 font-medium text-emerald-800">El cálculo cumple los requisitos verificables de la guía.</p>}

      {contrast && contrast.some((c) => c.regional != null) && (
        <>
          <H2 n={++sec}>Contraste independiente (informativo)</H2>
          <p className="mb-2">
            Altura de cada punto nuevo estimada con QGeoidCOL2023 y el desfase regional calculado con los puntos GNSS/nivelación
            públicos del IGAC cercanos (método independiente de los NP de la campaña):
          </p>
          <table className="w-full border-collapse text-xs">
            <thead><tr><Th>Punto</Th><Th right>H<sub>GNSS</sub> guía (m)</Th><Th right>H regional (m)</Th><Th right>Diferencia (m)</Th><Th right>Puntos red</Th></tr></thead>
            <tbody>
              {contrast.map((c) => (
                <tr key={c.id}>
                  <Td strong>{c.id}</Td><Td right>{f4(c.H)}</Td><Td right>{f4(c.regional)}</Td>
                  <Td right>{c.regional == null ? '—' : s4(c.H - c.regional)}</Td><Td right>{c.used}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <H2 n={++sec}>Observaciones</H2>
      <textarea
        value={meta.observaciones}
        onChange={(e) => onObs(e.target.value)}
        rows={3}
        placeholder="Notas del profesional (se imprimen en el informe)…"
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-[13px] print:hidden"
      />
      <p className="hidden whitespace-pre-wrap print:block">{meta.observaciones || 'Sin observaciones.'}</p>

      <div className="mt-12 grid grid-cols-2 gap-10 text-xs">
        <div className="border-t border-slate-400 pt-1">
          {meta.responsable || 'Responsable'}{meta.matricula && <><br />Matrícula profesional {meta.matricula}</>}
        </div>
        <div />
      </div>
    </div>
  )
}
