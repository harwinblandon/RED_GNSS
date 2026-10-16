import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LayersControl, LayerGroup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

/*
 * Capas base comunes a todos los mapas y botón de pantalla completa.
 *
 * Satélite: Esri World Imagery tiene imagen real hasta z18 en todo el país y
 * z19 en ciudades, pero donde no hay datos devuelve un mosaico gris (HTTP 200)
 * que Leaflet no puede distinguir. Por eso la capa estándar se limita a z18 y
 * encima va Esri Clarity solo en z19: Clarity responde 404 donde no hay
 * imagen, así que en zona rural se ve la z18 ampliada en vez del mosaico gris.
 */

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ESRI_ATTR = 'Imágenes &copy; Esri, Maxar, Earthstar Geographics'

const STORAGE_KEY = 'gnss.baseLayer'

function SatelliteImagery() {
  return (
    <>
      <TileLayer
        attribution={ESRI_ATTR}
        url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`}
        maxNativeZoom={18}
        maxZoom={21}
      />
      <TileLayer
        url="https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        minZoom={19}
        maxNativeZoom={19}
        maxZoom={21}
      />
    </>
  )
}

const BASE_LAYERS: { name: string; render: () => React.ReactNode }[] = [
  {
    name: 'Calles (OpenStreetMap)',
    render: () => (
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={21}
      />
    ),
  },
  { name: 'Satélite (Esri)', render: () => <SatelliteImagery /> },
  {
    name: 'Satélite con vías y nombres',
    render: () => (
      <>
        <SatelliteImagery />
        <TileLayer url={`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`} maxNativeZoom={19} maxZoom={21} />
        <TileLayer url={`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`} maxNativeZoom={19} maxZoom={21} />
      </>
    ),
  },
  {
    name: 'Topográfico (Esri)',
    render: () => (
      <TileLayer
        attribution="&copy; Esri y colaboradores"
        url={`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`}
        maxNativeZoom={19}
        maxZoom={21}
      />
    ),
  },
  {
    name: 'Relieve (OpenTopoMap)',
    render: () => (
      <TileLayer
        attribution="&copy; OpenStreetMap, SRTM · estilo &copy; OpenTopoMap (CC-BY-SA)"
        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        maxNativeZoom={17}
        maxZoom={21}
      />
    ),
  },
  {
    name: 'Claro (CARTO)',
    render: () => (
      <TileLayer
        attribution="&copy; OpenStreetMap &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        maxNativeZoom={20}
        maxZoom={21}
      />
    ),
  },
  {
    name: 'Oscuro (CARTO)',
    render: () => (
      <TileLayer
        attribution="&copy; OpenStreetMap &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxNativeZoom={20}
        maxZoom={21}
      />
    ),
  },
]

function savedLayer(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && BASE_LAYERS.some((l) => l.name === v)) return v
  } catch {
    /* sin almacenamiento */
  }
  return BASE_LAYERS[0].name
}

/** Selector de capa base; recuerda la elección entre mapas y visitas. */
export function BaseLayers() {
  const [initial] = useState(savedLayer)
  useMapEvents({
    baselayerchange: (e) => {
      try {
        localStorage.setItem(STORAGE_KEY, e.name)
      } catch {
        /* sin almacenamiento */
      }
    },
  })
  return (
    <LayersControl position="topright">
      {BASE_LAYERS.map((l) => (
        <LayersControl.BaseLayer key={l.name} name={l.name} checked={l.name === initial}>
          <LayerGroup>{l.render()}</LayerGroup>
        </LayersControl.BaseLayer>
      ))}
    </LayersControl>
  )
}

/**
 * Botón de pantalla completa. Agranda el contenedor del mapa (su elemento
 * padre en la página) a toda la ventana; Esc o el mismo botón lo cierran.
 */
export function FullscreenButton() {
  const map = useMap()
  const [full, setFull] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (btn.current) {
      L.DomEvent.disableClickPropagation(btn.current)
      L.DomEvent.disableScrollPropagation(btn.current)
    }
  }, [])

  useEffect(() => {
    const frame = map.getContainer().parentElement
    if (!frame) return
    frame.classList.toggle('map-fullscreen', full)
    document.body.classList.toggle('overflow-hidden', full)
    map.invalidateSize()
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      frame.classList.remove('map-fullscreen')
      document.body.classList.remove('overflow-hidden')
    }
  }, [full, map])

  return createPortal(
    <button
      ref={btn}
      type="button"
      onClick={() => setFull((f) => !f)}
      title={full ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
      aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'}
      className="leaflet-fullscreen-btn"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {full ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
    </button>,
    map.getContainer(),
  )
}
