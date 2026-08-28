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
