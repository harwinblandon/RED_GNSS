import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-bold text-brand-600 dark:text-brand-400">404</p>
      <p className="mt-3 text-slate-600 dark:text-slate-400">Página no encontrada.</p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-inset ring-white/10 transition hover:-translate-y-px hover:bg-brand-800 hover:shadow-md dark:bg-slate-100 dark:text-slate-900"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
