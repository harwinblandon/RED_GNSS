import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Sirve en la raíz (dominio propio gnss.redhb.com, ver public/CNAME).
  // VITE_BASE permite compilar para una subcarpeta si hiciera falta.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
})
