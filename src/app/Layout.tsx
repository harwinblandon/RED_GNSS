import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import { useTheme } from './useTheme'
import { MenuIcon, MoonIcon, SunIcon } from '../components/icons'
import { LogoFull } from '../components/Logo'
import { StatusBadge } from '../components/ui'

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map(({ path, label, icon: Icon, status }) => (
        <NavLink
          key={path}
          to={path}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon width={18} height={18} />
              <span className="flex-1">{label}</span>
              {status !== 'listo' && !isActive && <StatusBadge status={status} />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout() {
  const { theme, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar (escritorio) */}
      <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:flex-col dark:border-[#2c2e32] dark:bg-[#1c1d20]">
        <Brand />
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
        <Footer />
      </aside>

      {/* Cabecera móvil */}
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-[#2c2e32] dark:bg-[#1c1d20]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Menú"
            >
              <MenuIcon />
            </button>
            <LogoFull className="h-9" />
          </div>
          <ThemeButton theme={theme} onToggle={toggle} />
        </header>

        {mobileOpen && (
          <div className="border-b border-slate-200 bg-white p-3 lg:hidden dark:border-[#2c2e32] dark:bg-[#1c1d20]">
            <NavList onNavigate={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Barra superior (escritorio) */}
        <div className="hidden items-center justify-end gap-3 border-b border-slate-200 bg-white/60 px-6 py-3 backdrop-blur lg:flex dark:border-[#2c2e32] dark:bg-[#1c1d20]/70">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Asistente de post-proceso GNSS diferencial
          </span>
          <ThemeButton theme={theme} onToggle={toggle} />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="border-b border-slate-200 p-3 dark:border-[#2c2e32]">
      <LogoFull className="w-full" />
    </div>
  )
}

function ThemeButton({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label="Cambiar tema"
    >
      {theme === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
    </button>
  )
}

function Footer() {
  return (
    <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-400 dark:border-[#2c2e32] dark:text-slate-500">
      H_TOPOGRAFÍA · datos IGAC · SIRGAS
    </div>
  )
}
