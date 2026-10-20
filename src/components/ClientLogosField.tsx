import { useRef, useState } from 'react'
import { Button } from './ui'
import { MAX_CLIENT_LOGOS, prepareLogo, type ClientLogo } from '../lib/clientLogos'

/** Logos de las empresas contratantes (el logo H_TOPOGRAFÍA va siempre, fijo). */
export function ClientLogosField({ logos, onChange }: { logos: ClientLogo[]; onChange: (l: ClientLogo[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setErr(null)
      onChange([...logos, await prepareLogo(f)].slice(0, MAX_CLIENT_LOGOS))
    } catch {
      setErr('No se pudo leer la imagen (usa PNG o JPG).')
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Logos de los contratantes (opcional)</p>
      <div className="flex flex-wrap items-center gap-2">
        {logos.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700">
            <img src={l.dataUrl} alt={l.name} className="h-8 max-w-24 object-contain" />
            <button onClick={() => onChange(logos.filter((_, k) => k !== i))} className="text-xs text-rose-600 hover:underline" title="Quitar">✕</button>
          </div>
        ))}
        {logos.length < MAX_CLIENT_LOGOS && (
          <Button variant="secondary" onClick={() => ref.current?.click()}>Agregar logo</Button>
        )}
        <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} />
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  )
}
