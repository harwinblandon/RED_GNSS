import { Link } from 'react-router-dom'
import { NAV_ITEMS } from '../app/navigation'
import { StatusBadge } from '../components/ui'

export default function HomePage() {
  const features = NAV_ITEMS.filter((i) => i.path !== '/acerca-de')

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
        ¿Qué necesitas hacer?
      </h1>

      <section className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {features.map(({ path, label, description, icon: Icon, status }) => (
          <Link
            key={path}
            to={path}
            className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-400 hover:shadow-md sm:p-5 dark:border-[#2c2e32] dark:bg-[#1f2124] dark:hover:border-slate-600"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:group-hover:bg-slate-100 dark:group-hover:text-slate-900">
                <Icon width={18} height={18} />
              </span>
              <h2 className="flex-1 font-semibold text-slate-900 dark:text-white">{label}</h2>
              <StatusBadge status={status} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</p>
          </Link>
        ))}
      </section>

      <section className="mt-12 border-t border-slate-200 pt-8 dark:border-[#2c2e32]">
        <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
          Geodesia · Topografía · Geomática
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Asistente de post-proceso GNSS
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Herramientas para agilizar el trabajo de gabinete en posicionamiento GNSS
          estático diferencial contra la red de estaciones permanentes MAGNA-ECO del
          IGAC: planeación de tiempos de rastreo, búsqueda de estaciones de apoyo,
          acceso a RINEX y efemérides, y utilidades de tiempo GPS.
        </p>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Todos los módulos están operativos (mapa con 208 estaciones activas del IGAC,
          búsqueda por lugar, tiempos de ocupación, calendario GPS, conversión de
          coordenadas, acceso a RINEX, estado de estaciones y efemérides). Se siguen
          afinando y se irán agregando funciones.
        </p>
      </section>
    </div>
  )
}
