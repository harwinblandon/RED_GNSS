/**
 * Logo de H_TOPOGRAFÍA (activo del propio usuario).
 *
 * Se muestra sobre una placa blanca en ambos temas: el logotipo está diseñado
 * para fondo claro y así queda siempre legible (también sobre la barra oscura).
 *
 * `className` controla el contenedor (alto y márgenes).
 */

const BASE = import.meta.env.BASE_URL

export function LogoFull({ className = 'h-11' }: { className?: string }) {
  return (
    <span
      className={`inline-flex rounded-md bg-white p-1.5 ring-1 ring-slate-200 dark:ring-slate-700 ${className}`}
    >
      <img src={`${BASE}brand/logo.png`} alt="H_TOPOGRAFÍA" className="h-full w-auto" />
    </span>
  )
}
