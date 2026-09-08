import { PageHeader, Card, ExternalLink } from '../components/ui'
import { LogoFull } from '../components/Logo'

export default function AboutPage() {
  return (
    <div>
      <LogoFull className="mb-6 h-16" />
      <PageHeader
        title="Acerca de"
        subtitle="Herramienta de apoyo para el post-proceso de datos GNSS estáticos en el contexto de la normativa geodésica colombiana."
      />

      <Card className="mb-6">
        <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Qué es</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Es una herramienta independiente de consulta y planeación que reúne, en un
          solo lugar, información y servicios <strong>públicos</strong> de terceros
          (IGAC, SIRGAS, IGS y OpenStreetMap, entre otros) para agilizar el trabajo
          de gabinete. No es un producto oficial, no está afiliada a esas entidades y
          no sustituye sus fuentes oficiales, el software de ajuste ni el criterio del
          profesional. Verifica siempre los datos contra la fuente original.
        </p>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Fuentes de datos y servicios</h3>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li>
            <ExternalLink href="https://redgeodesica.igac.gov.co/">
              Instituto Geográfico Agustín Codazzi (IGAC) — Red Geodésica Nacional
            </ExternalLink>
            : catálogo de estaciones y vértices, coordenadas oficiales, archivos RINEX
            y soluciones semanales, reseñas de la red pasiva. Datos © IGAC.
          </li>
          <li>
            <ExternalLink href="https://sirgas.ipgh.org/">SIRGAS</ExternalLink> — marco
            de referencia geodésico para las Américas: coordenadas, series temporales y
            soluciones semanales/multianuales de las estaciones.
          </li>
          <li>
            <ExternalLink href="https://www.igs.org/">
              International GNSS Service (IGS)
            </ExternalLink>{' '}
            y sus centros de datos (
            <ExternalLink href="https://igs.bkg.bund.de/">BKG</ExternalLink>,{' '}
            <ExternalLink href="https://cddis.nasa.gov/">CDDIS</ExternalLink>,{' '}
            <ExternalLink href="https://igs.ign.fr/">IGN</ExternalLink>) — efemérides
            transmitidas y precisas.
          </li>
          <li>
            <ExternalLink href="https://geodesy.unr.edu/">
              Nevada Geodetic Laboratory (UNR)
            </ExternalLink>{' '}
            — velocidades MIDAS de las estaciones, usadas para propagar coordenadas
            entre épocas (valores aproximados).
          </li>
          <li>
            <ExternalLink href="https://www.openstreetmap.org/copyright">
              OpenStreetMap
            </ExternalLink>{' '}
            (© colaboradores de OpenStreetMap) y{' '}
            <ExternalLink href="https://photon.komoot.io/">Photon</ExternalLink> —
            búsqueda de lugares; capas base también de{' '}
            <ExternalLink href="https://www.esri.com/">Esri</ExternalLink> y{' '}
            <ExternalLink href="https://opentopomap.org/">OpenTopoMap</ExternalLink>{' '}
            (CC-BY-SA).
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Cada fuente conserva sus derechos y condiciones de uso; los enlaces llevan a
          la información original. Construida con software libre (React, Leaflet,
          proj4, GeographicLib, fflate).
        </p>
      </Card>

      <Card>
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
            Resolución IGAC 715 de 2018 — Marco Geocéntrico Nacional de Referencia
            MAGNA-SIRGAS, época 2018.4.
          </li>
          <li>
            Resolución IGAC 471 de 2020 — adopción del Origen Nacional (CTM12) para la
            cartografía oficial.
          </li>
        </ul>
      </Card>
    </div>
  )
}
