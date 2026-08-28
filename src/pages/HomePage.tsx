import { Link } from 'react-router-dom'
import { NAV_ITEMS } from '../app/navigation'
import { StatusBadge } from '../components/ui'
import { LogoFull } from '../components/Logo'

export default function HomePage() {
  const features = NAV_ITEMS.filter((i) => i.path !== '/acerca-de')

  return (
    <div>
      <section className="mb-10">
        <LogoFull className="mb-6 h-14" />
        <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
          Geodesia · Topografía · Geomática
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Asistente de post-proceso GNSS
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Herramientas para agilizar el trabajo de gabinete en posicionamiento GNSS
          estático diferencial contra la red de estaciones permanentes MAGNA-ECO del
          IGAC: planeación de tiempos de rastreo, búsqueda de estaciones de apoyo,
          acceso a RINEX y efemérides, y utilidades de tiempo GPS.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {features.map(({ path, label, description, icon: Icon, status }) => (
          <Link
            key={path}
            to={path}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-950 dark:text-brand-300">
                <Icon width={20} height={20} />
              </span>
              <StatusBadge status={status} />
            </div>
            <h2 className="mt-4 font-semibold text-slate-900 dark:text-white">{label}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
          </Link>
        ))}
      </section>

      <section className="mt-10 rounded-xl border border-slate-200 bg-slate-100/60 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <p>
          <strong className="text-slate-800 dark:text-slate-200">Estado del proyecto:</strong>{' '}
          todos los módulos están operativos (mapa con 213 estaciones activas del IGAC,
          búsqueda por lugar, tiempos de ocupación, calendario GPS, conversión de
          coordenadas, acceso a RINEX, estado de estaciones y efemérides). Se siguen
          afinando y se irán agregando funciones.
        </p>
      </section>
    </div>
  )
}
