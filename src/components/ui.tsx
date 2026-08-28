import type { ReactNode } from 'react'
import { STATUS_STYLES, type FeatureStatus } from '../app/navigation'
import { ExternalIcon } from './icons'

export function PageHeader({
  title,
  subtitle,
  status,
}: {
  title: string
  subtitle?: string
  status?: FeatureStatus
}) {
  return (
    <header className="mb-6 border-b border-slate-200 pb-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        {status && <StatusBadge status={status} />}
      </div>
      {subtitle && (
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      )}
    </header>
  )
}

export function StatusBadge({ status }: { status: FeatureStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#2c2e32] dark:bg-[#1f2124] ${className}`}
    >
      {children}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className="tabular text-sm font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  )
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline dark:text-brand-400"
    >
      {children}
      <ExternalIcon width={14} height={14} />
    </a>
  )
}

/**
 * Botón. En monocromo, el énfasis viene del contraste y de un ligero relieve
 * al pasar el cursor: la variante `primary` es un bloque de tinta (claro) /
 * bloque claro (oscuro), como el recuadro del logo.
 */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium ' +
  'transition-[background-color,box-shadow,transform] duration-150 outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-40 ' +
  'active:translate-y-0'

const BTN_VARIANT = {
  primary:
    'bg-brand-700 text-white shadow-sm ring-1 ring-inset ring-white/10 ' +
    'hover:-translate-y-px hover:bg-brand-800 hover:shadow-md ' +
    'dark:bg-slate-100 dark:text-slate-900 dark:ring-black/5 dark:hover:bg-white',
  secondary:
    'border border-slate-300 bg-white text-slate-800 shadow-sm ' +
    'hover:-translate-y-px hover:bg-slate-50 hover:shadow-sm ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  ghost:
    'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
} as const

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const pad = variant === 'ghost' ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
  return <button {...props} className={`${BTN_BASE} ${pad} ${BTN_VARIANT[variant]} ${className}`} />
}

export function ComingSoon({ points }: { points: string[] }) {
  return (
    <Card className="border-dashed">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Módulo en construcción. Funcionalidad prevista:
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-500" />
            {p}
          </li>
        ))}
      </ul>
    </Card>
  )
}
