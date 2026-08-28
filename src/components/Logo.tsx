/**
 * Logo de H_TOPOGRAFÍA (activo del propio usuario).
 *
 * Se muestra sobre una placa clara en ambos temas: el logotipo está diseñado
 * para fondo claro y así queda siempre legible (también sobre la barra oscura).
 *
 * `className` controla el contenedor (alto y/o ancho y márgenes); la imagen se
 * ajusta dentro conservando su proporción.
 */

const BASE = import.meta.env.BASE_URL

export function LogoFull({ className = 'h-11' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-white p-2 ring-1 ring-slate-200 dark:ring-slate-700 ${className}`}
    >
      <img
        src={`${BASE}brand/logo.png`}
        alt="H_TOPOGRAFÍA"
        className="block max-h-full max-w-full"
      />
    </span>
  )
}
