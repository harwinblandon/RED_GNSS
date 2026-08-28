import type { ComponentType, SVGProps } from 'react'
import {
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  CrosshairIcon,
  DownloadIcon,
  InfoIcon,
  MapIcon,
  OrbitIcon,
  SignalIcon,
} from '../components/icons'

export type FeatureStatus = 'listo' | 'beta' | 'próximamente'

export interface NavItem {
  path: string
  label: string
  /** Descripción corta para las tarjetas del inicio. */
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  status: FeatureStatus
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/mapa',
    label: 'Mapa de consulta',
    description:
      'Ubica un punto en el mapa o ingresa coordenadas y encuentra las estaciones MAGNA-ECO más cercanas con su línea base y azimut.',
    icon: CrosshairIcon,
    status: 'beta',
  },
  {
    path: '/planeacion',
    label: 'Planeación de sesión',
    description:
      'Del punto y la fecha al plan completo: estaciones de apoyo, tiempos de ocupación, efemérides y exportables (PDF, CSV, KML).',
    icon: ClipboardIcon,
    status: 'beta',
  },
  {
    path: '/tiempos',
    label: 'Tiempo de ocupación',
    description:
      'Calcula el tiempo mínimo de rastreo estático: modelo de la Guía de alturas (15 + 5·d) y rangos por orden de la Resolución 1468 de 2021.',
    icon: ClockIcon,
    status: 'beta',
  },
  {
    path: '/rinex',
    label: 'Acceso a RINEX',
    description:
      'Consulta la disponibilidad y descarga los archivos RINEX de cada estación (API del IGAC), con indicador de latencia.',
    icon: DownloadIcon,
    status: 'beta',
  },
  {
    path: '/estado',
    label: 'Estado de estaciones',
    description:
      'Semáforo de operatividad: qué tan recientes son los datos RINEX de cada estación, con filtros y verificación por lote.',
    icon: SignalIcon,
    status: 'beta',
  },
  {
    path: '/calendario-gps',
    label: 'Calendario GPS',
    description:
      'Convierte entre fecha civil, semana GPS, día de la semana, DOY, MJD y fecha juliana. Útil para nombrar archivos IGS/RINEX.',
    icon: CalendarIcon,
    status: 'listo',
  },
  {
    path: '/coordenadas',
    label: 'Conversión de coordenadas',
    description:
      'Geográficas MAGNA-SIRGAS ↔ Origen Nacional CTM12, Gauss-Krüger (5 orígenes), UTM y geocéntricas.',
    icon: MapIcon,
    status: 'beta',
  },
  {
    path: '/efemerides',
    label: 'Efemérides',
    description:
      'Enlaces a efemérides transmitidas y precisas (IGS/BKG/CDDIS/IGN) según la fecha, con nombre de archivo y espejos.',
    icon: OrbitIcon,
    status: 'beta',
  },
  {
    path: '/acerca-de',
    label: 'Acerca de',
    description: 'Fuentes normativas, alcance del proyecto y hoja de ruta.',
    icon: InfoIcon,
    status: 'listo',
  },
]

export const STATUS_STYLES: Record<FeatureStatus, string> = {
  listo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  beta: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'próximamente': 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}
