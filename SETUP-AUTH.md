# Activar el login (Supabase)

La app ya trae la pantalla de inicio de sesión. Se activa sola cuando existan
las dos variables de Supabase. Mientras no existan, la app funciona sin login.

Nada de esto queda en el repositorio: la URL y la clave "anon" se guardan como
*secretos de GitHub* y las contraseñas viven cifradas en Supabase.

---

## 1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com> y crea una cuenta (gratis).
2. **New project**. Nombre a gusto, contraseña de base de datos cualquiera
   (no se usa aquí, pero guárdala). Región: **South America (São Paulo)**.
3. Espera ~2 min a que quede listo.

## 2. Copiar los dos valores

En el proyecto: **Project Settings → API** (icono de engranaje, abajo a la izq.).

- **Project URL** → algo como `https://abcdxyz.supabase.co`
- **anon public** (en "Project API keys") → una cadena larga que empieza por `eyJ...`

## 3. Que solo tú puedas crear usuarios

**Authentication → Sign In / Providers** (o **Authentication → Settings**):

- Deja **Email** habilitado.
- Desactiva **"Allow new users to sign up"** (Confirmations / User signups) para
  que nadie pueda registrarse solo. Solo tú creas cuentas.

## 4. Crear los usuarios

**Authentication → Users → Add user → Create new user**:

- Escribe el **correo** y una **contraseña** para esa persona.
- Marca **Auto Confirm User** (para que pueda entrar sin verificar el correo).
- Repite por cada persona. Para cambiar una clave: en la lista de usuarios,
  los tres puntos → **Send password recovery** o **Reset password**.

## 5. Poner los valores en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository secret**.
Crea dos:

| Name | Secret (valor) |
|---|---|
| `VITE_SUPABASE_URL` | la Project URL del paso 2 |
| `VITE_SUPABASE_ANON_KEY` | la clave `anon public` del paso 2 |

## 6. Publicar

**Actions → "Desplegar a GitHub Pages" → Run workflow** (o haz cualquier push).
Al terminar, <https://harwinblandon.github.io/RED_GNSS/> pedirá correo y contraseña.

---

## Probar el login en local (opcional)

```bash
cp .env.example .env.local
# edita .env.local con los mismos dos valores
npm run dev
```

`.env.local` está ignorado por git.

## Notas

- La clave `anon` es **pública por diseño** (identifica el proyecto, no da acceso).
  El acceso real lo valida el servidor de Supabase. La `service_role` NUNCA se usa
  aquí ni se pone en ningún lado del frontend.
- El login controla quién entra a la herramienta. Los datos que muestra
  (estaciones, RINEX, efemérides) son públicos del IGAC/IGS de todas formas.
- Plan gratuito de Supabase: 50 000 usuarios activos/mes. De sobra.
