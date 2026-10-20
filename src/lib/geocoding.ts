/**
 * Búsqueda de lugares (geocodificación) para llevar el mapa a una zona
 * aproximada a partir de un texto como
 * "Universidad del Quindío, Armenia, Quindío".
 *
 * Usa Photon (https://photon.komoot.io), servicio abierto basado en
 * OpenStreetMap, con CORS habilitado y pensado para autocompletado.
 * Los resultados se acotan a Colombia.
 */

const PHOTON = 'https://photon.komoot.io/api/'
// Aproximación al recuadro de Colombia continental + insular
const CO_BBOX = '-82.0,-4.5,-66.8,13.6'
const CO_CENTER = { lat: 4.6, lon: -74.1 }

export interface PlaceResult {
  label: string
  detail: string
  lat: number
  lon: number
  kind: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: Record<string, string | undefined>
}

function buildLabel(p: Record<string, string | undefined>): { label: string; detail: string } {
  const label = p.name || p.street || p.city || p.county || p.state || 'Sin nombre'
  const parts = [p.street, p.district, p.city, p.county, p.state].filter(
    (x): x is string => Boolean(x) && x !== label,
  )
  return { label, detail: [...new Set(parts)].join(', ') }
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const url = new URL(PHOTON)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '8')
  url.searchParams.set('lang', 'default')
  url.searchParams.set('lat', String(CO_CENTER.lat))
  url.searchParams.set('lon', String(CO_CENTER.lon))
  url.searchParams.set('bbox', CO_BBOX)

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Photon: HTTP ${res.status}`)
  const data = (await res.json()) as { features: PhotonFeature[] }

  return data.features
    .filter((f) => f.properties.countrycode === 'CO')
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates
      const { label, detail } = buildLabel(f.properties)
      const kind = [f.properties.osm_value, f.properties.type].filter(Boolean).join(' · ')
      return { label, detail, lat, lon, kind }
    })
    .slice(0, 6)
}

/* --------------------------- Nominatim (OSM) ---------------------------- */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

interface NominatimItem {
  lat: string
  lon: string
  name?: string
  display_name: string
  type?: string
  addresstype?: string
}

/**
 * Búsqueda explícita (Enter / botón) con Nominatim, mucho más rápido que
 * Photon. Su política de uso no permite autocompletar mientras se escribe:
 * solo se llama por una acción del usuario.
 */
export async function searchPlacesNominatim(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url = new URL(NOMINATIM)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('countrycodes', 'co')
  url.searchParams.set('limit', '8')
  url.searchParams.set('accept-language', 'es')
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`)
  const data = (await res.json()) as NominatimItem[]
  return data.map((d) => {
    const parts = d.display_name.split(',').map((s) => s.trim())
    const label = d.name || parts[0]
    const detail = parts
      .slice(d.name && parts[0] === d.name ? 1 : 0)
      .filter((p) => p !== 'Colombia' && !/^\d{5,6}$/.test(p))
      .slice(0, 4)
      .join(', ')
    return { label, detail, lat: Number(d.lat), lon: Number(d.lon), kind: [d.addresstype, d.type].filter(Boolean).join(' · ') }
  })
}

/** Cancela la consulta (vía su AbortController) si tarda más de `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, ctl: AbortController): Promise<T> {
  const t = setTimeout(() => ctl.abort(), ms)
  return p.finally(() => clearTimeout(t))
}
