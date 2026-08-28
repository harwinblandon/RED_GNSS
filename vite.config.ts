import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Ruta relativa para poder desplegar en subcarpetas (GitHub Pages, etc.)
  base: './',
  plugins: [react(), tailwindcss()],
})
