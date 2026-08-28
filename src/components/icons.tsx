import type { SVGProps } from 'react'

/**
 * Iconos de línea (stroke = currentColor). Tamaño por defecto 1.25rem.
 */
type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Base>
)

export const MapIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 4 6 2 5-2v14l-5 2-6-2-5 2V6z" />
    <path d="M9 4v14M15 6v14" />
  </Base>
)

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Base>
)

export const SatelliteIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m7 11 4-4M4 8l3-3a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 11 4 8Z" />
    <path d="m13 17 3 3a1.4 1.4 0 0 0 2 0l1-1a1.4 1.4 0 0 0 0-2l-3-3" />
    <path d="m9 13 2 2" />
    <path d="M14 4a6 6 0 0 1 6 6M14 8a2 2 0 0 1 2 2" />
  </Base>
)

export const SignalIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 20v-4M10 20v-8M15 20v-12M20 20V4" />
  </Base>
)

export const CalendarIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
)

export const OrbitIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3c5 0 9 4 9 9s-4 9-9 9" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)" />
  </Base>
)

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Base>
)

export const InfoIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
)

export const ExternalIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Base>
)

export const SunIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5 3.5 3.5M20.5 20.5 19 19M19 5l1.5-1.5M3.5 20.5 5 19" />
  </Base>
)

export const MoonIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Base>
)

export const MenuIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Base>
)

export const CrosshairIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Base>
)

export const ClipboardIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3" />
    <path d="M9 12h6M9 16h4" />
  </Base>
)
