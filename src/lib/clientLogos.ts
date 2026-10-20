import { useEffect, useState } from 'react'

/**
 * Logos adicionales (empresas contratantes) para los reportes. El logo
 * principal H_TOPOGRAFÍA es fijo y no forma parte de esta lista.
 */
export interface ClientLogo {
  name: string
  /** PNG reducido (data URL). */
  dataUrl: string
  /** Ancho / alto. */
  ratio: number
}

const KEY = 'htopo.logos.contratantes'
export const MAX_CLIENT_LOGOS = 3

/** Reduce la imagen (máx. 480 px de ancho) y la pasa a PNG para incrustarla en Excel y PDF. */
export async function prepareLogo(file: File): Promise<ClientLogo> {
  const bmp = await createImageBitmap(file)
  const w = Math.min(480, bmp.width)
  const h = Math.round((w * bmp.height) / bmp.width)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  return { name: file.name.replace(/\.[^.]+$/, ''), dataUrl: c.toDataURL('image/png'), ratio: w / h }
}

export function useClientLogos() {
  const [logos, setLogos] = useState<ClientLogo[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]')
      return Array.isArray(v) ? v.slice(0, MAX_CLIENT_LOGOS) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(logos))
    } catch {
      /* almacenamiento lleno o no disponible */
    }
  }, [logos])
  return [logos, setLogos] as const
}
