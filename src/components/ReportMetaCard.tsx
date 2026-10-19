import { Card, Field, TextInput } from './ui'
import type { ReportMeta } from '../lib/guideReportExport'

/** Formulario de los datos del proyecto que encabezan los informes de alturas. */
export function ReportMetaCard({
  meta,
  onChange,
  withPartida = false,
  withObservaciones = false,
}: {
  meta: ReportMeta
  onChange: (m: ReportMeta) => void
  withPartida?: boolean
  withObservaciones?: boolean
}) {
  const set = (k: keyof ReportMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...meta, [k]: e.target.value })
  return (
    <Card>
      <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Datos del proyecto (encabezado del informe)</p>
      <div className="space-y-2.5">
        <Field label="Proyecto"><TextInput value={meta.proyecto} onChange={set('proyecto')} /></Field>
        <Field label="Contrato / cliente"><TextInput value={meta.contrato} onChange={set('contrato')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Responsable"><TextInput value={meta.responsable} onChange={set('responsable')} /></Field>
          <Field label="Matrícula prof."><TextInput value={meta.matricula} onChange={set('matricula')} /></Field>
        </div>
        <Field label="Fecha(s) de campaña"><TextInput value={meta.fechaCampana} onChange={set('fechaCampana')} placeholder="2026-10-10 a 2026-10-12" /></Field>
        <Field label="Equipos (receptores / antenas)"><TextInput value={meta.equipos} onChange={set('equipos')} /></Field>
        <Field label="Software de post-proceso"><TextInput value={meta.software} onChange={set('software')} /></Field>
        {withPartida && (
          <Field label="Vértice geodésico de partida" hint="Vértice IGAC (preferiblemente de primer orden) desde el que se trasladó el control horizontal.">
            <TextInput value={meta.partida} onChange={set('partida')} />
          </Field>
        )}
        {withObservaciones && (
          <Field label="Observaciones (se imprimen en el informe)">
            <textarea
              value={meta.observaciones}
              onChange={set('observaciones')}
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </Field>
        )}
      </div>
    </Card>
  )
}
