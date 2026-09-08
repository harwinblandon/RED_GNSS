import type { ComponentType, SVGProps } from 'react'
import {
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  CrosshairIcon,
  DownloadIcon,
  InfoIcon,
  MapIcon,
  MarkerIcon,
  OrbitIcon,
  SatelliteIcon,
  SignalIcon,
} from '../components/icons'

export interface NavItem {
  path: string
  label: string
  /** Descripción corta para las tarjetas del inicio. */
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** Ordenados según su papel en el flujo de post-proceso. */
export const NAV_ITEMS: NavItem[] = [
  {
    path: '/planeacion',
    label: 'Planeación de sesión',
    description:
      'Del punto y la fecha al plan completo: estaciones de apoyo, tiempos de ocupación, efemérides y exportables (PDF, CSV, KML).',
    icon: ClipboardIcon,
  },
  {
    path: '/mapa',
    label: 'Mapa de consulta',
    description:
      'Ubica un punto en el mapa o ingresa coordenadas y encuentra las estaciones MAGNA-ECO más cercanas con su línea base y azimut.',
    icon: CrosshairIcon,
  },
  {
    path: '/estacion',
    label: 'Ficha de estación',
    description:
      'Identidad, coordenadas oficiales (época 2018.4 y propagadas), equipo, solución semanal descargable y enlaces a SIRGAS.',
    icon: SatelliteIcon,
  },
  {
    path: '/red-pasiva',
    label: 'Red pasiva',
    description:
      'Mojones y placas de control (órdenes 2, 3 y 4): ubícalos en el mapa por lugar o código y descarga su reseña (monografía).',
    icon: MarkerIcon,
  },
  {
    path: '/rinex',
    label: 'Acceso a RINEX',
    description:
      'Consulta la disponibilidad y descarga los archivos RINEX de cada estación (API del IGAC), con indicador de latencia.',
    icon: DownloadIcon,
  },
  {
    path: '/estado',
    label: 'Estado de estaciones',
    description:
      'Semáforo de operatividad: qué tan recientes son los datos RINEX de cada estación, con filtros y verificación por lote.',
    icon: SignalIcon,
  },
  {
    path: '/efemerides',
    label: 'Efemérides',
    description:
      'Enlaces a efemérides transmitidas y precisas (IGS/BKG/CDDIS/IGN) según la fecha, con nombre de archivo y espejos.',
    icon: OrbitIcon,
  },
  {
    path: '/tiempos',
    label: 'Tiempo de ocupación',
    description:
      'Calcula el tiempo mínimo de rastreo estático: modelo de la Guía de alturas (15 + 5·d) y rangos por orden de la Resolución 1468 de 2021.',
    icon: ClockIcon,
  },
  {
    path: '/coordenadas',
    label: 'Conversión de coordenadas',
    description:
      'Geográficas MAGNA-SIRGAS ↔ Origen Nacional CTM12, Gauss-Krüger (5 orígenes), UTM y geocéntricas.',
    icon: MapIcon,
  },
  {
    path: '/calendario-gps',
    label: 'Calendario GPS',
    description:
      'Convierte entre fecha civil, semana GPS, día de la semana, DOY, MJD y fecha juliana. Útil para nombrar archivos IGS/RINEX.',
    icon: CalendarIcon,
  },
  {
    path: '/acerca-de',
    label: 'Acerca de',
    description: 'Fuentes normativas, alcance del proyecto y hoja de ruta.',
    icon: InfoIcon,
  },
]
