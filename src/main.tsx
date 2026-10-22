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

// Retira la pantalla de bienvenida (index.html) tras dejarla ver un momento.
const splash = document.getElementById('splash')
if (splash) {
  setTimeout(() => {
    splash.classList.add('out')
    setTimeout(() => splash.remove(), 500)
  }, Math.max(0, 2000 - performance.now()))
}
