import { createClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase (autenticación).
 *
 * `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se inyectan en el build desde
 * secretos de GitHub (ver .github/workflows/deploy.yml y SETUP-AUTH.md). En local
 * se leen de `.env.local` (ignorado por git). La clave "anon" NO es secreta: solo
 * identifica el proyecto; el acceso real lo controla Supabase en su servidor.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** `true` si la app está configurada con Supabase; si no, se salta el login. */
export const authEnabled = Boolean(url && anonKey)

export const supabase = authEnabled
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
