import { lazy, Suspense } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom'
import Layout from './Layout'
import HomePage from '../pages/HomePage'

// Carga diferida: el mapa (Leaflet), la conversión (proj4) y el resto de
// páginas se descargan solo cuando se visitan.
const MapQueryPage = lazy(() => import('../pages/MapQueryPage'))
const PlanningPage = lazy(() => import('../pages/PlanningPage'))
const OccupationTimePage = lazy(() => import('../pages/OccupationTimePage'))
const RinexAccessPage = lazy(() => import('../pages/RinexAccessPage'))
const StationStatusPage = lazy(() => import('../pages/StationStatusPage'))
const GpsCalendarPage = lazy(() => import('../pages/GpsCalendarPage'))
const CoordinatesPage = lazy(() => import('../pages/CoordinatesPage'))
const EphemeridesPage = lazy(() => import('../pages/EphemeridesPage'))
const AboutPage = lazy(() => import('../pages/AboutPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">Cargando…</div>}>
      {children}
    </Suspense>
  )
}

/**
 * Hash routing para funcionar en hosting estático (GitHub Pages, etc.) sin
 * reglas de reescritura en el servidor.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'mapa', element: <Lazy><MapQueryPage /></Lazy> },
      { path: 'planeacion', element: <Lazy><PlanningPage /></Lazy> },
      { path: 'tiempos', element: <Lazy><OccupationTimePage /></Lazy> },
      { path: 'rinex', element: <Lazy><RinexAccessPage /></Lazy> },
      { path: 'estado', element: <Lazy><StationStatusPage /></Lazy> },
      { path: 'calendario-gps', element: <Lazy><GpsCalendarPage /></Lazy> },
      { path: 'coordenadas', element: <Lazy><CoordinatesPage /></Lazy> },
      { path: 'efemerides', element: <Lazy><EphemeridesPage /></Lazy> },
      { path: 'acerca-de', element: <Lazy><AboutPage /></Lazy> },
      { path: '404', element: <Lazy><NotFoundPage /></Lazy> },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
])
