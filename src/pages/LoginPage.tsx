import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { LogoFull } from '../components/Logo'
import { Button, TextInput } from '../components/ui'

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'La cuenta aún no está confirmada. Contacta al administrador.',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (error) setError(MESSAGES[error.message] ?? 'No se pudo iniciar sesión. Reintenta.')
  }

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <LogoFull className="h-16" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#2c2e32] dark:bg-[#1f2124]">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Asistente de post-proceso GNSS
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Correo
              </span>
              <TextInput
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Contraseña
              </span>
              <TextInput
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          ¿Problemas para entrar? Contacta al administrador de H_TOPOGRAFÍA.
        </p>
      </div>
    </div>
  )
}
