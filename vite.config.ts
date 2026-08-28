import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // En local sirve en la raíz; en el build de CI se pasa VITE_BASE=/RED_GNSS/
  // para GitHub Pages (proyecto en subcarpeta).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
})
