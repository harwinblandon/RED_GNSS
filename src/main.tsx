import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { AuthProvider, useAuth } from './app/auth'
import { authEnabled } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import './index.css'

function Gate() {
  const { session } = useAuth()

  if (!authEnabled) return <RouterProvider router={router} />
  if (session === undefined) {
    return <div className="grid min-h-full place-items-center text-sm text-slate-400">Cargando…</div>
  }
  if (session === null) return <LoginPage />
  return <RouterProvider router={router} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </StrictMode>,
)
