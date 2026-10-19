import { useEffect, useState } from 'react'
import type { ReportMeta } from './guideReportExport'

/** Datos del proyecto para los informes de alturas; se comparten entre pestañas y visitas. */
const KEY = 'htopo.alturas.informe'

export const EMPTY_META: ReportMeta = {
  proyecto: '',
  contrato: '',
  responsable: '',
  matricula: '',
  fechaCampana: '',
  equipos: '',
  software: '',
  partida: '',
  observaciones: '',
}

function load(): ReportMeta {
  try {
    return { ...EMPTY_META, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return EMPTY_META
  }
}

export function useReportMeta() {
  const [meta, setMeta] = useState<ReportMeta>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(meta))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [meta])
  return [meta, setMeta] as const
}
