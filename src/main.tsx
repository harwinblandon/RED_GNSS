import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

// Retira la pantalla de bienvenida (index.html). Al abrir la app se deja ver un
// momento; en recargas dentro de la misma sesión se quita enseguida.
const splash = document.getElementById('splash')
if (splash) {
  let seen = false
  try {
    seen = sessionStorage.getItem('splash-seen') === '1'
    sessionStorage.setItem('splash-seen', '1')
  } catch {
    // sin almacenamiento: se muestra completa
  }
  const wait = seen ? 0 : Math.max(0, 1400 - performance.now())
  setTimeout(() => {
    splash.classList.add('out')
    setTimeout(() => splash.remove(), 500)
  }, wait)
}
