# H_TOPOGRAFÍA — Asistente de post-proceso GNSS

Aplicación web para agilizar el trabajo de gabinete en posicionamiento GNSS
estático diferencial contra la Red Geodésica Nacional Activa (**MAGNA-ECO**) del
IGAC.

Identidad visual en `src/components/Logo.tsx` (SVG, adapta a claro/oscuro);
ver `brand/` para usar el logotipo en mapa de bits.

## Módulos

| Ruta | Descripción |
|---|---|
| `/mapa` | Mapa con las estaciones MAGNA-ECO; búsqueda por lugar, clic o coordenadas → estaciones más cercanas (línea base y azimut geodésicos). Capas base OSM / satélite / relieve. |
| `/planeacion` | Del punto y la fecha al plan completo: estaciones de apoyo, tiempos de ocupación, efemérides; exporta a PDF (impresión), CSV y KML. |
| `/tiempos` | Tiempo mínimo de ocupación: modelo *Guía de alturas* (15 + 5·d) y rangos por orden de la *Resolución 1468 de 2021*. |
| `/coordenadas` | Geográficas MAGNA-SIRGAS ↔ Origen Nacional CTM12, Gauss-Krüger (5 orígenes), UTM y geocéntricas. |
| `/rinex` | Disponibilidad, latencia y descarga (ZIP) de archivos RINEX por estación — API del IGAC. |
| `/estado` | Semáforo de latencia de todas las estaciones; verificación por lote + snapshot diario. |
| `/efemerides` | Enlaces a efemérides IGS (transmitidas / ultrarrápidas / rápidas / finales) por fecha, con nombre de archivo y espejos. |
| `/calendario-gps` | Fecha civil ↔ semana GPS, DOW, DOY, MJD, fecha juliana, letra de sesión. |

## Stack

- Vite 8 + React 19 + TypeScript · React Router 7 (hash routing, despliegue estático)
- Tailwind CSS 4
- Leaflet / react-leaflet · geographiclib-geodesic (Karney) · proj4 (CRS)

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build → dist/
npm run preview
```

Node.js ≥ 20.

## Estructura

```
src/
  app/         router (lazy), layout, navegación, tema
  components/  UI compartida, iconos, PlaceSearch, StationPicker
  lib/         gpsTime · igacNorms · geodesy · coords · geocoding · rinex ·
               stationStatus · ephemeris · planning · format
  data/        stations.ts  (GENERADO — ver scripts/)
  pages/       una por ruta
scripts/
  build-stations.py    regenera src/data/stations.ts
  status-snapshot.py   regenera public/stations-status.json
.github/workflows/
  stations-status.yml  corre status-snapshot.py a diario y hace commit
```

### Datos de estaciones

`src/data/stations.ts` se genera con:

```bash
python scripts/build-stations.py
```

280 estaciones de la Red MAGNA-ECO (213 activas). Fuente: API pública del
**Centro de Control Geodésico del IGAC** (`https://ccg.igac.gov.co/api`) —
orden oficial, coordenadas MAGNA-SIRGAS, DOMES, receptor/antena, fecha de
materialización y el `tId` para los enlaces de RINEX. El script cachea las
respuestas en `scripts/.cache/` (ignorado por git).

### Estado de estaciones

`public/stations-status.json` (fecha del último RINEX por estación) lo genera
`scripts/status-snapshot.py` — descarga varios MB por estación, así que corre en
una GitHub Action diaria (`.github/workflows/stations-status.yml`), no en el
navegador. La app lo carga como estado inicial y permite verificar estaciones
puntuales bajo demanda.

### Servicios externos en tiempo de ejecución

- **API del IGAC** (`ccg.igac.gov.co`, CORS abierto) — estaciones, RINEX y latencia.
- **Photon** (`photon.komoot.io`) — geocodificación de lugares para el mapa.
- **Espejos IGS** — BKG, CDDIS, IGN para efemérides.
- Teselas de mapa: OpenStreetMap, Esri World Imagery, OpenTopoMap.

## Fuentes normativas

- [Resolución IGAC 1468 de 2021](https://redgeodesica.igac.gov.co/documentos/resolucion_1468_de_2021.pdf) — órdenes, tiempos de medición, parámetros de captura.
- [Guía metodológica para la obtención de alturas a partir de datos GNSS (IGAC)](https://redgeodesica.igac.gov.co/documentos/GUIA_METODOLOGICA_PARA_LA_OBTENCION_DE_ALTURAS_A_PARTIR_DE%20DATOS_GNSS_SWLEON.pdf) — modelo 15 min + 5 min/km.
- Resolución IGAC 471 de 2020 — adopción del Origen Nacional CTM12.
- [Red Geodésica Nacional — IGAC](https://redgeodesica.igac.gov.co/) · [SIRGAS](https://sirgas.ipgh.org/)

## Pendiente (próximas fases)

1. Histórico de disponibilidad y alertas de estaciones caídas cerca de un punto.
2. Coordenadas oficiales por época (archivos `.CRD` del IGAC) y velocidades.
3. Red pasiva MAGNA-SIRGAS y vértices de nivelación.
4. Reporte PDF de planeación de sesión y exportables (CSV, KML).
5. Estimación de ventana horaria óptima (PDOP / nº de satélites).
