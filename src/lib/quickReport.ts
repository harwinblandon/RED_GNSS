/**
 * Informe del cálculo rápido de alturas (pestaña "Cálculo rápido" de /alturas):
 * QGeoidCOL2023 + ajuste a la red de nivelación (automático con los puntos
 * GNSS/nivelación del IGAC, o con una placa medida por el usuario).
 *
 * Este método NO es el relativo de la Guía metodológica del IGAC (que exige
 * ocupar NP en la campaña); el informe lo declara explícitamente.
 */
import { formatDms } from './format'
import { correctionQuality, type Benchmark, type HeightResult } from './heights'
import { fmtDate, safeFileName, type ColFmt, type ReportDoc, type ReportMeta, type Section } from './guideReportExport'

export type QuickMode = 'auto' | 'benchmark' | 'none'

export interface QuickReportInput {
  meta: ReportMeta
  results: HeightResult[]
  mode: QuickMode
  /** Placa de amarre (modo 'benchmark'). */
  benchmark: Benchmark | null
  benchmarkH: number | null
  benchmarkZeta: number | null
  generated: Date
}

const METHOD_LABEL: Record<QuickMode, string> = {
  auto: 'QGeoidCOL2023 + ajuste automático a la red de nivelación (puntos GNSS/nivelación del IGAC)',
  benchmark: 'QGeoidCOL2023 + amarre a una placa de nivelación medida con GNSS',
  none: 'QGeoidCOL2023 sin ajuste (altura normal h − ζ)',
}

export function quickReportDoc(q: QuickReportInput): ReportDoc {
  const { meta, results, mode } = q
  const ok = results.filter((r) => r.zeta != null)
  const has04 = ok.some((r) => r.n04 != null)
  const s: Section[] = []

  s.push({
    title: 'Objeto',
    paragraphs: [
      `Determinar la altura física de ${ok.length} punto(s) a partir de su altura elipsoidal obtenida por posicionamiento GNSS, ` +
        `con el modelo oficial QGeoidCOL2023${mode === 'none' ? '' : ' y su ajuste a la red de nivelación nacional del IGAC'}.`,
    ],
  })

  s.push({
    title: 'Marco normativo y alcance',
    paragraphs: [
      '• Resolución IGAC 515 de 2026 — adopta el modelo QGeoidCOL2023 asociado a MAGNA-SIRGAS como superficie de conversión para alturas físicas (Liu et al., 2024, Earth, Planets and Space 76:35). Es un cuasigeoide: entrega la anomalía de altura ζ.',
      '• Resolución IGAC 068 de 2005 — MAGNA-SIRGAS, datum oficial de Colombia.',
      '• Datum vertical de la red de nivelación: mareógrafo de Buenaventura (red vertical del IGAC).',
      mode === 'benchmark'
        ? '• Alcance: amarre a una sola placa de nivelación. La Guía metodológica del IGAC para alturas con GNSS exige al menos dos NP (Caso 1) o cuatro (Caso 3) ocupados en la campaña y un ajuste por mínimos cuadrados; ese cálculo se hace en la pestaña «Campaña e informe (Guía IGAC)».'
        : '• Alcance: este cálculo NO corresponde al método relativo de la Guía metodológica del IGAC para alturas con GNSS, que exige ocupar vértices de nivelación (NP) en la campaña. Es una estimación con el modelo oficial y la información pública de la red; para entregables que exijan la guía, use la pestaña «Campaña e informe (Guía IGAC)».',
    ],
  })

  s.push({
    title: 'Datos de entrada',
    sheet: 'Datos de entrada',
    table: {
      head: ['Punto', 'Latitud', 'Longitud', 'Latitud (°)', 'Longitud (°)', 'h (m)'],
      fmt: ['t', 't', 't', 'f4', 'f4', 'f4'],
      rows: results.map((r) => [r.id, formatDms(r.lat, 'lat'), formatDms(r.lon, 'lon'), Number(r.lat.toFixed(9)), Number(r.lon.toFixed(9)), r.h]),
      boldCol: 0,
      pdfSkip: [3, 4],
    },
    note: 'h: altura elipsoidal MAGNA-SIRGAS obtenida en el post-proceso GNSS.',
  })

  const formulas = ['(1)  ζ_{P}: anomalía de altura QGeoidCOL2023 interpolada bilinealmente (rejilla 5′)', '(2)  H*_{P} = h_{P} − ζ_{P}   (cota con el modelo QGeoidCOL2023)']
  let methodNote = ''
  if (mode === 'auto') {
    formulas.push(
      '(3)  δ_{j} = h_{j} − H_{j} − ζ_{j}   (desfase en cada punto GNSS/nivelación j de la red IGAC)',
      '(4)  δ_{P} = Σ w_{j} δ_{j} / Σ w_{j},   w_{j} = 1 / d_{j}²',
      '(5)  H_{P} = h_{P} − ζ_{P} − δ_{P}   (cota ajustada a la red de nivelación)',
    )
    methodNote =
      'Puntos GNSS/nivelación: placas de la Red Vertical del IGAC con altura elipsoidal en la Red Pasiva. Se usan las no destruidas a menos de 25 km ' +
      '(se amplía hasta 60 km si hay menos de 3), máximo 30, y se descartan las que se apartan de la mediana más de max(3 · 1,4826 · MAD, 0,15 m). ' +
      'Validación del método con 873 placas de la red (cada una calculada sin usarla): error mediano 0,04 m, desviación estándar 0,16 m.'
  } else if (mode === 'benchmark') {
    formulas.push(
      '(3)  δ = h_{NP} − H_{NP} − ζ_{NP}   (placa de nivelación ocupada con GNSS)',
      '(4)  H_{P} = h_{P} − ζ_{P} − δ   (cota ajustada a la red, amarrada a la placa)',
    )
    if (q.benchmark)
      methodNote =
        `Placa de amarre ${q.benchmark.id} (${[q.benchmark.municipio, q.benchmark.departamento].filter(Boolean).join(', ')}): ` +
        `H nivelada ${q.benchmark.H.toFixed(4)} m, h medida ${q.benchmarkH?.toFixed(4) ?? '—'} m, ζ ${q.benchmarkZeta?.toFixed(4) ?? '—'} m.`
  }
  s.push({ title: 'Metodología', paragraphs: [`Método: ${METHOD_LABEL[mode]}.`], formulas, note: methodNote || undefined })

  const head = ['Punto', 'h elipsoidal (m)', 'ζ QGeoidCOL2023 (m)', 'Cota modelo QGeoidCOL2023 H* (m)']
  const fmt: ColFmt[] = ['t', 'f4', 'f4', 'f4']
  if (mode !== 'none') {
    head.push('Ajuste δ (m)', 'Cota ajustada a la red H (m)')
    fmt.push('s4', 'f4')
  }
  if (mode === 'auto') {
    head.push('Puntos red', 'Dispersión σ (m)', 'Calidad')
    fmt.push('i', 'f4', 't')
  }
  if (has04) {
    head.push('N GEOCOL2004 (m)', 'Cota GEOCOL2004 (m)')
    fmt.push('f4', 'f4')
  }
  s.push({
    title: 'Resultados',
    sheet: 'Resultados',
    table: {
      head,
      fmt,
      rows: ok.map((r) => {
        const row: (string | number | null)[] = [r.id, r.h, r.zeta, r.normal]
        if (mode !== 'none') row.push(r.delta, r.leveled)
        if (mode === 'auto') row.push(r.correction?.used ?? 0, r.correction?.spread ?? null, correctionQuality(r.correction).label)
        if (has04) row.push(r.n04, r.h04)
        return row
      }),
      boldCol: mode === 'none' ? 3 : 5,
    },
    note:
      'Fórmulas: cota modelo QGeoidCOL2023 H* = h − ζ' +
      (mode !== 'none' ? '; cota ajustada a la red de nivelación H = h − ζ − δ (δ: desfase local entre el modelo y las placas niveladas)' : '') +
      (has04 ? '; cota GEOCOL2004 = h − N (referencia de transición)' : '') +
      '.' +
      (mode !== 'none' && ok.some((r) => r.leveled == null) ? ' «—»: sin puntos GNSS/nivelación a menos de 60 km.' : ''),
  })

  if (mode === 'auto') {
    const rows = ok.flatMap((r) =>
      (r.correction?.points ?? []).map((c) => [
        r.id,
        c.b.id,
        c.km,
        c.b.h,
        c.b.H,
        c.b.h != null ? c.b.h - c.b.H - c.offset : null,
        c.offset,
        c.rejected ? 'Descartada' : 'Usada',
      ]),
    )
    if (rows.length)
      s.push({
        title: 'Puntos GNSS/nivelación de la red IGAC',
        sheet: 'Placas usadas',
        paragraphs: ['Placas consideradas en el ajuste de cada punto (desfase δ = h − H − ζ):'],
        table: {
          head: ['Punto', 'Placa', 'Dist. (km)', 'h (m)', 'H nivelada (m)', 'ζ (m)', 'δ (m)', 'Estado'],
          fmt: ['t', 't', 'f2', 'f4', 'f4', 'f4', 's4', 't'],
          rows,
        },
      })
  }

  s.push({ title: 'Observaciones', paragraphs: [meta.observaciones.trim() || 'Sin observaciones.'] })

  return {
    title: 'Cálculo de alturas físicas',
    subtitle: 'Modelo QGeoidCOL2023 (Resolución IGAC 515 de 2026) y red de nivelación del IGAC',
    subtitleShort: 'Modelo QGeoidCOL2023 y red de nivelación del IGAC',
    meta: [
      ['Proyecto', meta.proyecto || '—'],
      ['Contrato / cliente', meta.contrato || '—'],
      ['Responsable', `${meta.responsable || '—'}${meta.matricula ? ` · M.P. ${meta.matricula}` : ''}`],
      ['Campaña', meta.fechaCampana || '—'],
      ['Fecha del informe', fmtDate(q.generated)],
      ['Método', METHOD_LABEL[mode]],
      ['Equipos', meta.equipos || '—'],
      ['Software de post-proceso', meta.software || '—'],
    ],
    sections: s,
    model: 'QGeoidCOL2023',
    projectLabel: meta.proyecto,
    signer: { name: meta.responsable, matricula: meta.matricula },
    fileName: safeFileName('Informe_alturas', meta.proyecto),
  }
}
