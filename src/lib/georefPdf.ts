/**
 * PDF del reporte de georreferenciación (mismo contenido que el Excel, como
 * texto y tablas). Usa el exportador genérico de `guideReportExport`.
 */
import { formatDms } from './format'
import { fromGeocentric } from './coords'
import { correctionQuality } from './heights'
import { fmtDate, safeFileName, type ReportDoc, type Section } from './guideReportExport'
import { finalHeight, heightTypeLabel } from './georef'
import type { GeorefExport } from './georefExcel'
import { projectOut } from './outputCrs'

export function georefReportDoc(d: GeorefExport): ReportDoc {
  const { results: rs, refEpoch: t, heightMode: hm } = d
  const T = t.toFixed(1)
  const VEL = d.velModel
  const sys = d.systems
  const s: Section[] = []

  s.push({
    title: `Coordenadas finales — MAGNA-SIRGAS época ${T}`,
    table: {
      head: ['Punto', 'Norte CTM12 (m)', 'Este CTM12 (m)', ...sys.flatMap((y) => [`Norte ${y.short} (m)`, `Este ${y.short} (m)`]), 'Cota (m)', 'Tipo de altura', `Latitud ${T}`, `Longitud ${T}`],
      fmt: ['t', 'f4', 'f4', ...sys.flatMap(() => ['f4', 'f4'] as const), 'f4', 't', 't', 't'],
      rows: rs.map((r) => [
        r.p.id, r.ref.north, r.ref.east,
        ...sys.flatMap((y) => { const o = projectOut(y, r.ref.lat, r.ref.lon); return [o.north, o.east] }),
        finalHeight(r, hm), heightTypeLabel(r, hm), formatDms(r.ref.lat, 'lat'), formatDms(r.ref.lon, 'lon'),
      ]),
      boldCol: 0,
      // Con sistemas adicionales, las geográficas van solo en el Excel para que la tabla quepa.
      pdfSkip: sys.length ? [5 + 2 * sys.length, 6 + 2 * sys.length] : undefined,
    },
    note: sys.length ? sys.map((y) => y.label).join(' · ') : undefined,
  })

  if (d.bases.length)
    s.push({
      title: 'Bases del post-proceso',
      table: {
        head: ['Base', 'Tipo', 'X (m)', 'Y (m)', 'Z (m)', 'Época', 'Fuente'],
        fmt: ['t', 't', 'f4', 'f4', 'f4', 'f4', 't'],
        rows: d.bases.map((b) => [b.id, b.tipo, b.x, b.y, b.z, b.epoch, b.fuente]),
      },
      note: d.bases
        .map((b) => {
          const g = fromGeocentric(b.x, b.y, b.z)
          return `${b.id}: ${formatDms(g.lat, 'lat')} · ${formatDms(g.lon, 'lon')}`
        })
        .join('   '),
    })

  s.push({
    title: 'Coordenadas ajustadas — época de observación',
    table: {
      head: ['Punto', 'Sesión', 't_obs', 'X (m)', 'Y (m)', 'Z (m)', 'h (m)'],
      fmt: ['t', 't', 'f4', 'f4', 'f4', 'f4', 'f4'],
      rows: rs.map((r) => [r.p.id, r.p.inicio, r.p.tObs, r.p.x, r.p.y, r.p.z, r.obs.h]),
    },
    note: 't_obs: año decimal del instante medio de la sesión de rastreo.',
  })

  s.push({
    title: `Velocidades y desplazamientos (${VEL})`,
    formulas: [`Δt = t_{obs} − ${T}`, 'D = V · Δt', `X_{${T}} = X_{obs} − D`],
    table: {
      head: ['Punto', 'Δt (años)', 'vN (mm/a)', 'vE (mm/a)', 'Vx (m/a)', 'Vy (m/a)', 'Vz (m/a)', 'Dx (m)', 'Dy (m)', 'Dz (m)'],
      fmt: ['t', 'f4', 'f2', 'f2', 'f4', 'f4', 'f4', 's4', 's4', 's4'],
      rows: rs.map((r) => [r.p.id, r.dt, r.vel.vn * 1000, r.vel.ve * 1000, r.vel.vx, r.vel.vy, r.vel.vz, r.disp.x, r.disp.y, r.disp.z]),
    },
    note: `Velocidad horizontal ${VEL} interpolada en cada punto y rotada a componentes geocéntricas; los modelos VEMOS no modelan la vertical.`,
  })

  s.push({
    title: `Coordenadas en la época de referencia ${T}`,
    table: {
      head: ['Punto', 'X (m)', 'Y (m)', 'Z (m)', 'h (m)', 'Norte CTM12 (m)', 'Este CTM12 (m)'],
      fmt: ['t', 'f4', 'f4', 'f4', 'f4', 'f4', 'f4'],
      rows: rs.map((r) => [r.p.id, r.ref.x, r.ref.y, r.ref.z, r.ref.h, r.ref.north, r.ref.east]),
    },
  })

  if (hm === 'geocol2004' || hm === 'software')
    s.push({
      title: 'Alturas (GEOCOL2004)',
      table: {
        head: ['Punto', 'h (m)', hm === 'software' ? 'N del software (m)' : 'N GEOCOL2004 (m)', 'Cota H = h − N (m)'],
        fmt: ['t', 'f4', 'f4', 'f4'],
        rows: rs.map((r) => {
          const N = hm === 'software' ? r.p.geoidSepSoftware ?? null : r.height?.n04 ?? null
          return [r.p.id, r.obs.h, N, N == null ? null : r.obs.h - N]
        }),
      },
      note:
        (hm === 'software' ? 'N: separación geoidal GEOCOL2004 reportada por el software de post-proceso. ' : 'N de la rejilla GEOCOL2004 del ISG (puede diferir algunos cm del software comercial). ') +
        'GEOCOL2004, de uso permitido durante la transición a QGeoidCOL2023 (Resolución IGAC 515 de 2026, art. 5).',
    })
  else if (hm !== 'ninguna')
    s.push({
      title: 'Alturas (QGeoidCOL2023)',
      table: {
        head: ['Punto', 'h (m)', 'ζ (m)', 'Cota modelo H* (m)', 'δ (m)', 'Cota ajustada H (m)', 'Calidad'],
        fmt: ['t', 'f4', 'f4', 'f4', 's4', 'f4', 't'],
        rows: rs.map((r) => [
          r.p.id, r.obs.h, r.height?.zeta ?? null, r.height?.normal ?? null,
          hm === 'ajuste' ? r.height?.delta ?? null : null,
          hm === 'ajuste' ? r.height?.leveled ?? null : null,
          hm === 'ajuste' ? correctionQuality(r.height?.correction ?? null).label : '',
        ]),
      },
      note:
        'Cota modelo H* = h − ζ (QGeoidCOL2023, Resolución IGAC 515 de 2026).' +
        (hm === 'ajuste' ? ' Cota ajustada H = H* − δ, con δ el desfase local frente a la red de nivelación del IGAC (puntos GNSS/nivelación cercanos).' : ''),
    })

  s.push({
    title: 'Metodología y referencias',
    paragraphs: [
      `1. Post-proceso GNSS fijando las bases con la última solución semanal disponible (IGAC / SIRGAS). 2. Coordenadas de cada punto en su época de observación. 3. Velocidad ${VEL} en cada punto. ` +
        `4. Cambio de época a ${T} con ${VEL}: D = V·Δt; X_ref = X − D. 5. Geográficas (GRS80), CTM12 (EPSG:9377)${sys.length ? ` y ${sys.map((y) => y.short).join(', ')}` : ''}. 6. Cotas con ${hm === 'geocol2004' || hm === 'software' ? 'GEOCOL2004' : 'QGeoidCOL2023'}.`,
      '• Resolución IGAC 068 de 2005 (MAGNA-SIRGAS) · Resolución IGAC 715 de 2018 (ITRF2014, época 2018.0) · Resoluciones IGAC 471 y 529 de 2020 (CTM12) · Resolución IGAC 515 de 2026 (QGeoidCOL2023).',
      VEL === 'VEMOS2017'
        ? '• Drewes H., Sánchez L. (2020). Velocity model for SIRGAS 2017: VEMOS2017, doi:10.1594/PANGAEA.912350.'
        : '• Sánchez L., Drewes H., Kehm A., Seitz M. (2022). SIRGAS reference frame analysis at DGFI-TUM. J. Geod. Sci. 12(1), 92–119 (VEMOS2022).',
    ],
  })

  s.push({ title: 'Observaciones', paragraphs: [d.meta.observaciones.trim() || 'Sin observaciones.'] })

  return {
    title: 'Reporte final de coordenadas',
    subtitle: `Georreferenciación GNSS · MAGNA-SIRGAS época ${T} · Origen Nacional CTM12`,
    subtitleShort: `MAGNA-SIRGAS ${T} · CTM12`,
    meta: [
      ['Proyecto', d.meta.proyecto || '—'],
      ['Contrato / cliente', d.meta.contrato || '—'],
      ['Ubicación', d.ubicacion || '—'],
      ['Calculado por', `${d.meta.responsable || '—'}${d.meta.matricula ? ` · M.P. ${d.meta.matricula}` : ''}`],
      ['Fecha(s) de campaña', d.meta.fechaCampana || '—'],
      ['Fecha del reporte', fmtDate(new Date())],
      ['Equipos', d.meta.equipos || '—'],
      ['Software de post-proceso', d.meta.software || '—'],
    ],
    sections: s,
    model: `MAGNA-SIRGAS ${T}`,
    projectLabel: d.meta.proyecto,
    signer: { name: d.meta.responsable, matricula: d.meta.matricula },
    fileName: safeFileName('Reporte_coordenadas', d.meta.proyecto),
    extraLogos: d.logos,
  }
}
