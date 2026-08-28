import { PageHeader, Card, ExternalLink } from '../components/ui'
import { LogoFull } from '../components/Logo'

const ROADMAP: { phase: string; items: string[]; done?: boolean }[] = [
  {
    phase: 'Hecho',
    items: [
      '280 estaciones de la Red MAGNA-ECO desde la API del Centro de Control Geodésico del IGAC (orden oficial, coordenadas, receptor/antena).',
      'Mapa con capas base, filtros, búsqueda de lugares (Photon/OSM) y estaciones más cercanas con línea base y azimut geodésicos (Karney, GRS80).',
      'Calculadora de tiempos de ocupación (Guía de alturas + Resolución 1468).',
      'Calendario GPS.',
      'Conversión de coordenadas: CTM12, Gauss-Krüger (5 orígenes), UTM y geocéntricas.',
      'Acceso a RINEX: disponibilidad, latencia y descarga por ZIP (API del IGAC).',
      'Estado de estaciones: semáforo de latencia, verificación por lote y snapshot diario (GitHub Action).',
      'Efemérides: enlaces a productos IGS (transmitidas, ultrarrápidas, rápidas, finales) por fecha, con nombre de archivo y espejos.',
    ],
  },
  {
    phase: 'Siguiente',
    items: [
      'Histórico de disponibilidad y alertas de estaciones caídas cerca de un punto.',
      'Coordenadas oficiales por época (archivos .CRD del IGAC) y velocidades.',
      'Incorporar la red pasiva MAGNA-SIRGAS y vértices de nivelación.',
      'Reporte PDF de planeación de sesión y exportables (CSV, KML).',
      'Estimación de ventana horaria óptima (PDOP / nº de satélites).',
    ],
  },
]

export default function AboutPage() {
  return (
    <div>
      <LogoFull className="mb-6 h-20 w-auto" />
      <PageHeader
        title="Acerca de"
        subtitle="Herramienta de H_TOPOGRAFÍA para apoyar el post-proceso de datos GNSS estáticos según la normativa geodésica colombiana. No sustituye el criterio profesional ni el software de ajuste."
      />

      <Card className="mb-6">
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Fuentes de datos</h3>
        <ul className="mb-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li>
            <ExternalLink href="https://ccg.igac.gov.co/api/estaciones">
              API del Centro de Control Geodésico del IGAC
            </ExternalLink>{' '}
            — listado de estaciones, coordenadas oficiales, metadatos y archivos RINEX.
          </li>
          <li>
            <ExternalLink href="https://photon.komoot.io/">Photon</ExternalLink> /{' '}
            <ExternalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap</ExternalLink>{' '}
            — búsqueda de lugares y capas base del mapa.
          </li>
        </ul>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Fuentes normativas</h3>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li>
            <ExternalLink href="https://redgeodesica.igac.gov.co/documentos/resolucion_1468_de_2021.pdf">
              Resolución IGAC 1468 de 2021
            </ExternalLink>{' '}
            — Red Geodésica Nacional: órdenes, tiempos de medición y parámetros de captura.
          </li>
          <li>
            <ExternalLink href="https://redgeodesica.igac.gov.co/documentos/GUIA_METODOLOGICA_PARA_LA_OBTENCION_DE_ALTURAS_A_PARTIR_DE%20DATOS_GNSS_SWLEON.pdf">
              Guía metodológica para la obtención de alturas a partir de datos GNSS (IGAC)
            </ExternalLink>{' '}
            — modelo 15 min + 5 min/km.
          </li>
          <li>
            <ExternalLink href="https://redgeodesica.igac.gov.co/">
              Red Geodésica Nacional — IGAC
            </ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://www.sirgas.org/">SIRGAS</ExternalLink> — marco de referencia continental.
          </li>
        </ul>
      </Card>

      <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Hoja de ruta</h3>
      <div className="space-y-4">
        {ROADMAP.map((r) => (
          <Card key={r.phase}>
            <p className="font-medium text-slate-900 dark:text-white">{r.phase}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
              {r.items.map((it) => (
                <li key={it} className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-500" />
                  {it}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}
