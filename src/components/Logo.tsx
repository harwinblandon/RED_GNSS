/**
 * Logo de H_TOPOGRAFÍA (activo del propio usuario).
 *
 * `LogoFull` usa el logotipo original en PNG con el fondo ya recortado
 * (`brand/process.py` → `public/brand/`), con una versión invertida para el
 * tema oscuro. `LogoMark` es una versión vectorial simplificada del globo,
 * para espacios muy reducidos y como base del favicon.
 */

const BASE = import.meta.env.BASE_URL

export function LogoFull({ className = 'h-12 w-auto' }: { className?: string }) {
  return (
    <span className={`inline-block ${className}`}>
      <img
        src={`${BASE}brand/logo.png`}
        alt="H_TOPOGRAFÍA"
        className="h-full w-auto dark:hidden"
      />
      <img
        src={`${BASE}brand/logo-invert.png`}
        alt="H_TOPOGRAFÍA"
        className="hidden h-full w-auto dark:block"
      />
    </span>
  )
}

const R = 90
const CX = 100
const CY = 105

export function LogoMark({ className, title = 'H_TOPOGRAFÍA' }: { className?: string; title?: string }) {
  const meridians = [0.28, 0.58, 0.85].map((k) => (
    <ellipse key={`m${k}`} cx={CX} cy={CY} rx={R * k} ry={R} />
  ))
  const parallels = [-0.55, -0.28, 0, 0.28, 0.55].map((k) => (
    <ellipse key={`p${k}`} cx={CX} cy={CY + R * k} rx={R * Math.cos(Math.asin(k))} ry={R * 0.12} />
  ))
  return (
    <svg viewBox="0 0 200 210" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <g stroke="var(--logo-fg)" strokeWidth={1.4} fill="none">
        <g className="logo-graticule">
          <circle cx={CX} cy={CY} r={R} />
          <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} />
          {meridians}
          {parallels}
        </g>
        <g strokeDasharray="5 4" strokeWidth={1.8}>
          <path d="M138 24 C 108 70, 78 150, 96 192" />
          <path d="M14 132 C 70 150, 150 150, 190 120" />
        </g>
      </g>
      <circle cx={100} cy={128} r={3.2} fill="var(--logo-fg)" />
    </svg>
  )
}
