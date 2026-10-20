/**
 * Exportación del informe de alturas niveladas GNSS (Guía IGAC) a PDF y Excel.
 *
 * Los dos formatos se construyen del mismo modelo (`buildSections`): texto y
 * tablas con valores numéricos crudos. El PDF (jsPDF + autotable) lleva texto
 * real, la fuente Noto Sans incrustada (símbolos ζ, Δ, σ) y el logo en cada
 * página; el Excel (ExcelJS) deja los números como números (4 decimales) con
 * una hoja por sección. Las librerías se cargan solo al exportar.
 */
import type { CampaignPoint, GuideResult } from './guideAdjust'
import type { ClientLogo } from './clientLogos'
import { formatDms } from './format'

export interface ReportMeta {
  proyecto: string
  contrato: string
  responsable: string
  matricula: string
  fechaCampana: string
  equipos: string
  software: string
  partida: string
  observaciones: string
}

export interface ContrastRow {
  id: string
  H: number
  regional: number | null
  used: number
}

export interface ReportData {
  meta: ReportMeta
  result: GuideResult
  points: CampaignPoint[]
  contrast: ContrastRow[] | null
  generated: Date
}

/** Formato de columna: texto, 4 decimales, 4 decimales con signo, 2 decimales, entero. */
export type ColFmt = 't' | 'f4' | 's4' | 'f2' | 'i'
export type Cell = string | number | null

export interface Table {
  head: string[]
  fmt: ColFmt[]
  rows: Cell[][]
  /** Columna que se resalta en negrita. */
  boldCol?: number
  /** Columnas que solo van en Excel (en el PDF ocupan espacio sin aportar). */
  pdfSkip?: number[]
}

export interface Section {
  title: string
  /** Nombre corto para la hoja de Excel (si la sección va en hoja propia). */
  sheet?: string
  paragraphs?: string[]
  formulas?: string[]
  table?: Table
  checks?: { ok: boolean | null; text: string }[]
  note?: string
}

/** Documento genérico que consumen los exportadores PDF y Excel. */
export interface ReportDoc {
  title: string
  subtitle: string
  /** Subtítulo corto para el encabezado de la hoja Excel. */
  subtitleShort: string
  meta: [string, string][]
  sections: Section[]
  model: string
  projectLabel: string
  signer: { name: string; matricula: string }
  fileName: string
  /** Logos de los contratantes (el logo H_TOPOGRAFÍA es fijo y va siempre). */
  extraLogos?: ClientLogo[]
}

export function safeFileName(prefix: string, project: string) {
  const base = (project || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_')
  return `${prefix}_${base}`
}

export const fmtDate = (d: Date) => d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })

const CASE_LABEL = { punto: 'Caso 1 — Punto', superficie: 'Caso 3 — Superficie', perfil: 'Caso 2 — Perfil' } as const

export function reportTitle() {
  return 'Cálculo de alturas niveladas GNSS'
}

export function metaRows(d: ReportData): [string, string][] {
  const m = d.meta
  return [
    ['Proyecto', m.proyecto || '—'],
    ['Contrato / cliente', m.contrato || '—'],
    ['Responsable', `${m.responsable || '—'}${m.matricula ? ` · M.P. ${m.matricula}` : ''}`],
    ['Campaña', m.fechaCampana || '—'],
    ['Fecha del informe', fmtDate(d.generated)],
    ['Modelo geoidal', d.result.model],
    ['Equipos', m.equipos || '—'],
    ['Software de post-proceso', m.software || '—'],
    ['Vértice de partida', m.partida || '—'],
  ]
}

export function buildSections(d: ReportData): Section[] {
  const { result: r, points } = d
  const isQ = r.model === 'QGeoidCOL2023'
  const Z = isQ ? 'ζ' : 'N'
  const nps = points.filter((p) => p.H != null)
  const fresh = r.points.filter((p) => !p.isNP)
  const s: Section[] = []

  s.push({
    title: 'Objeto',
    paragraphs: [
      `Determinar la altura nivelada GNSS (H GNSS) de ${fresh.length} punto(s) nuevo(s) a partir de las alturas elipsoidales ` +
        `obtenidas por posicionamiento GNSS diferencial y de ${nps.length} vértice(s) de nivelación (NP) de la red vertical ` +
        `nacional ocupados en la misma campaña, aplicando la metodología de oficina de la guía del IGAC (${CASE_LABEL[r.guideCase]}).`,
    ],
  })

  s.push({
    title: 'Marco normativo y de referencia',
    paragraphs: [
      '• IGAC — Guía metodológica para la obtención de alturas utilizando el sistema GNSS (S. W. León, corrección y actualización del documento de L. Sánchez, 2004).',
      '• Resolución IGAC 068 de 2005 — adopta MAGNA-SIRGAS como datum oficial de Colombia.',
      isQ
        ? '• Resolución IGAC 515 de 2026 — adopta el modelo QGeoidCOL2023 asociado a MAGNA-SIRGAS como superficie de conversión para alturas físicas, en reemplazo de GEOCOL2004 (Liu et al., 2024, Earth, Planets and Space 76:35). Es un cuasigeoide: entrega la anomalía de altura ζ, que en las fórmulas de la guía ocupa el lugar de la ondulación N.'
        : '• Modelo GEOCOL2004, de uso permitido durante la implementación progresiva de QGeoidCOL2023 según el parágrafo del artículo 5 de la Resolución IGAC 515 de 2026.',
      '• Datum vertical: alturas niveladas de los NP referidas al mareógrafo de Buenaventura (red vertical del IGAC).',
    ],
  })

  s.push({
    title: 'Datos de campo',
    sheet: 'Datos de campo',
    table: {
      head: ['Punto', 'Tipo', 'Latitud', 'Longitud', 'Latitud (°)', 'Longitud (°)', 'h (m)', 'H nivelada (m)', 'Fuente H', 't (min)'],
      fmt: ['t', 't', 't', 't', 'f4', 'f4', 'f4', 'f4', 't', 'i'],
      rows: points.map((p) => [
        p.id,
        p.H != null ? 'NP' : 'Nuevo',
        formatDms(p.lat, 'lat'),
        formatDms(p.lon, 'lon'),
        Number(p.lat.toFixed(9)),
        Number(p.lon.toFixed(9)),
        p.h,
        p.H,
        p.H == null ? '' : p.Hsource === 'red-vertical' ? 'Red Vertical IGAC *' : 'Certificado',
        p.tMin,
      ]),
      boldCol: 0,
      pdfSkip: [4, 5],
    },
    note:
      'h: altura elipsoidal MAGNA-SIRGAS ajustada en el post-proceso. H: altura nivelada de los NP.' +
      (points.some((p) => p.Hsource === 'red-vertical') ? ' (*) H tomada del catálogo público de la Red Vertical del IGAC; verificar contra el certificado.' : ''),
  })

  s.push({
    title: 'Metodología',
    paragraphs: [`Se aplica la metodología en oficina de la guía, con ${Z} interpolado bilinealmente de ${r.model} en cada punto:`],
    // _{…} = subíndice (el PDF lo dibuja reducido; en Excel queda como texto plano).
    formulas: [
      '(1)  Δh_{i} = h_{Ri} − h_{Base}',
      `(2)  Δ${Z}_{i} = ${Z}_{Ri} − ${Z}_{Base}`,
      `(3)  ΔH_{GNSS,i} = Δh_{i} − Δ${Z}_{i}`,
      '(4)  H°_{GNSS,i} = H_{Base} + ΔH_{GNSS,i}',
      '(6–8)  Ajuste por mínimos cuadrados con las alturas niveladas de los NP como valores fijos',
      '(9)  H_{GNSS,final} = H_{nivelada de la base} + ΔH_{ajustado}',
    ],
    note:
      (r.guideCase === 'perfil'
        ? 'Observaciones: diferencias ΔH GNSS entre puntos consecutivos del perfil, en el orden de campo. '
        : `Observaciones: diferencia ΔH GNSS desde cada NP a cada punto nuevo (líneas base hasta ${r.maxKm} km). `) +
      `Pesos ${r.weights === 'iguales' ? 'iguales (observaciones en condiciones iguales, como en la guía)' : 'inversamente proporcionales a la longitud de la línea base'}. ` +
      'El ajuste se resuelve por el método paramétrico, equivalente al correlativo de la guía (mismas correcciones v y mismas alturas; ' +
      'verificado con los ejemplos de los Casos 1 y 2 de la guía). Se trabaja con cuatro decimales.',
  })

  s.push({
    title: 'Cálculo y ajuste',
    sheet: 'Cálculo y ajuste',
    table: {
      head: ['Desde', 'Hacia', 'Dist. (km)', 'Δh (m)', `Δ${Z} (m)`, 'ΔH GNSS (m)', 'v (m)', 'ΔH ajustado (m)'],
      fmt: ['t', 't', 'f2', 's4', 's4', 's4', 's4', 's4'],
      rows: r.observations.map((o) => [o.from, o.to, o.km, o.dh, o.dN, o.L, o.v, o.Ladj]),
    },
    note:
      `Observaciones n = ${r.n} · incógnitas u = ${r.u} · redundancia r = ${r.r}` +
      (r.sigma0 != null ? ` · σ₀ a posteriori = ${r.sigma0.toFixed(4)} m` : ''),
  })

  if (r.npChecks.length)
    s.push({
      title: 'Control de consistencia entre NP',
      sheet: 'Consistencia NP',
      paragraphs: [`Diferencia de altura entre NP obtenida por GNSS (Δh − Δ${Z}) frente a la diferencia nivelada:`],
      table: {
        head: ['NP', 'NP', 'Dist. (km)', 'GNSS (m)', 'Nivelada (m)', 'Discrepancia (m)'],
        fmt: ['t', 't', 'f2', 's4', 's4', 's4'],
        rows: r.npChecks.map((c) => [c.a, c.b, c.km, c.gnss, c.leveled, c.diff]),
      },
    })

  s.push({
    title: 'Resultados',
    sheet: 'Resultados',
    table: {
      head: ['Punto', 'Tipo', `${Z} ${r.model} (m)`, 'Cota inicial H° (m)', 'Base H°', 'Cota final H GNSS (m)', 'σ (m)'],
      fmt: ['t', 't', 'f4', 'f4', 't', 'f4', 'f4'],
      rows: r.points.map((p) => [p.id, p.isNP ? 'NP (fijo)' : 'Nuevo', r.zeta[p.id], p.Hinitial, p.baseId ?? '', p.H, p.isNP ? null : p.sigma]),
      boldCol: 5,
    },
    note: `Cota inicial H° = H del NP base + Δh − Δ${Z} (fórmula 4, desde el NP más cercano). Cota final H GNSS = H nivelada de la base + ΔH ajustado por mínimos cuadrados (fórmula 9), con ${Z} del modelo ${r.model}.`,
  })

  s.push({
    title: 'Verificación frente a la guía',
    checks: r.compliance,
    note: r.compliance.some((c) => c.ok === false) ? undefined : 'El cálculo cumple los requisitos verificables de la guía.',
  })

  if (d.contrast && d.contrast.some((c) => c.regional != null))
    s.push({
      title: 'Contraste independiente (informativo)',
      sheet: 'Contraste',
      paragraphs: [
        'Altura de cada punto nuevo estimada con QGeoidCOL2023 y el desfase regional calculado con los puntos GNSS/nivelación públicos del IGAC cercanos (método independiente de los NP de la campaña):',
      ],
      table: {
        head: ['Punto', 'H GNSS guía (m)', 'H regional (m)', 'Diferencia (m)', 'Puntos red'],
        fmt: ['t', 'f4', 'f4', 's4', 'i'],
        rows: d.contrast.map((c) => [c.id, c.H, c.regional, c.regional == null ? null : c.H - c.regional, c.used]),
      },
    })

  s.push({ title: 'Observaciones', paragraphs: [d.meta.observaciones.trim() || 'Sin observaciones.'] })
  return s
}

const fmtCell = (v: Cell, f: ColFmt): string => {
  if (v == null || v === '') return '—'
  if (typeof v === 'string') return v
  if (f === 'f4') return v.toFixed(4)
  if (f === 's4') return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(4)}`
  if (f === 'f2') return v.toFixed(2)
  if (f === 'i') return String(Math.round(v))
  return String(v)
}

/** La fuente subconjunto no trae ≤ ≥. */
const pdfSafe = (s: string) => s.replace(/≤/g, '<=').replace(/≥/g, '>=')

export async function asset(path: string): Promise<ArrayBuffer> {
  const r = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.arrayBuffer()
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Logo reducido sobre fondo blanco (JPEG): el PNG original con alfa infla el PDF. */
async function logoJpeg(buf: ArrayBuffer, width = 600): Promise<string> {
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
  const c = document.createElement('canvas')
  c.width = width
  c.height = Math.round((width * bmp.height) / bmp.width)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.9)
}

export function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Informe de la campaña según la Guía metodológica del IGAC. */
export function guideReportDoc(d: ReportData): ReportDoc {
  return {
    title: reportTitle(),
    subtitle: 'Según la Guía metodológica para la obtención de alturas utilizando el sistema GNSS (IGAC)',
    subtitleShort: 'Según la Guía metodológica de alturas con GNSS del IGAC',
    meta: metaRows(d),
    sections: buildSections(d),
    model: d.result.model,
    projectLabel: d.meta.proyecto,
    signer: { name: d.meta.responsable, matricula: d.meta.matricula },
    fileName: safeFileName('Informe_alturas_guia_IGAC', d.meta.proyecto),
  }
}

const BRAND = '#23262d'
const LOGO_RATIO = 1270 / 591

/* ---------------------------------- PDF ---------------------------------- */

export async function exportPdf(d: ReportDoc) {
  const [{ jsPDF }, { default: autoTable }, regular, bold, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    asset('fonts/noto-sans-Regular.ttf'),
    asset('fonts/noto-sans-Bold.ttf'),
    asset('brand/logo.png'),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  doc.addFileToVFS('NotoSans-Regular.ttf', toBase64(regular))
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
  doc.addFileToVFS('NotoSans-Bold.ttf', toBase64(bold))
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
  doc.setFont('NotoSans', 'normal')
  doc.setProperties({ title: `${d.title} — ${d.projectLabel}`, author: d.signer.name, subject: d.subtitle })

  const logoData = await logoJpeg(logo)
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 18
  const TOP = 32
  let y = TOP

  const ensure = (need: number) => {
    if (y + need > H - 18) {
      doc.addPage()
      y = TOP
    }
  }
  const text = (s: string, size = 9.5, style: 'normal' | 'bold' = 'normal', color = '#1e293b', indent = 0) => {
    doc.setFont('NotoSans', style)
    doc.setFontSize(size)
    doc.setTextColor(color)
    const lines = doc.splitTextToSize(pdfSafe(s), W - 2 * M - indent) as string[]
    for (const line of lines) {
      ensure(size * 0.45)
      doc.text(line, M + indent, y)
      y += size * 0.45
    }
  }

  /** Dibuja una línea con subíndices marcados como _{…}. */
  const rich = (s: string, x: number, yy: number, size: number) => {
    doc.setFont('NotoSans', 'normal')
    doc.setTextColor('#0f172a')
    for (const part of s.split(/(_\{[^}]*\})/)) {
      if (!part) continue
      const sub = part.startsWith('_{')
      const t = pdfSafe(sub ? part.slice(2, -1) : part)
      doc.setFontSize(sub ? size * 0.7 : size)
      doc.text(t, x, yy + (sub ? 0.9 : 0))
      x += doc.getTextWidth(t)
    }
  }

  // Bloque de título (solo primera página)
  doc.setFont('NotoSans', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(BRAND)
  doc.text(d.title, M, y + 2)
  y += 8
  text(d.subtitle, 9.5, 'normal', '#475569')
  y += 2
  const rows = d.meta
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: TOP },
    body: rows,
    theme: 'plain',
    styles: { font: 'NotoSans', fontSize: 8.5, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 2 }, textColor: '#1e293b' },
    columnStyles: { 0: { cellWidth: 45, textColor: '#64748b' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3
  doc.setDrawColor(BRAND)
  doc.setLineWidth(0.6)
  doc.line(M, y, W - M, y)
  y += 6

  let n = 0
  for (const sec of d.sections) {
    ensure(18)
    n++
    doc.setFont('NotoSans', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(BRAND)
    doc.text(`${n}. ${sec.title}`, M, y)
    y += 1.8
    doc.setDrawColor('#cbd5e1')
    doc.setLineWidth(0.25)
    doc.line(M, y, W - M, y)
    y += 4.5
    for (const p of sec.paragraphs ?? []) {
      text(p)
      y += 1.2
    }
    if (sec.formulas) {
      ensure(sec.formulas.length * 5 + 2) // el bloque de fórmulas no se parte entre páginas
      y += 0.5
      for (const f of sec.formulas) {
        ensure(5)
        rich(f, M + 4, y, 9.5)
        y += 5
      }
      y += 1.5
    }
    if (sec.table) {
      const keep = sec.table.head.map((_, i) => i).filter((i) => !sec.table!.pdfSkip?.includes(i))
      const t = {
        head: keep.map((i) => sec.table!.head[i]),
        fmt: keep.map((i) => sec.table!.fmt[i]),
        rows: sec.table.rows.map((r) => keep.map((i) => r[i])),
        boldCol: sec.table.boldCol == null ? undefined : keep.indexOf(sec.table.boldCol),
      }
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: TOP, bottom: 18 },
        head: [t.head.map(pdfSafe)],
        body: t.rows.map((row) => row.map((c, i) => fmtCell(c, t.fmt[i]))),
        theme: 'grid',
        styles: { font: 'NotoSans', fontSize: 7.8, cellPadding: 1.3, lineColor: '#e2e8f0', lineWidth: 0.2, textColor: '#1e293b' },
        headStyles: { fillColor: BRAND, textColor: '#ffffff', fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: '#f8fafc' },
        columnStyles: Object.fromEntries(
          t.fmt.map((f, i) => [i, { halign: f === 't' ? 'left' : 'right', fontStyle: i === t.boldCol ? 'bold' : 'normal' }]),
        ),
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2.5
    }
    if (sec.checks) {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: TOP, bottom: 18 },
        body: sec.checks.map((c) => [c.ok === true ? 'Cumple' : c.ok === false ? 'Revisar' : 'N/A', pdfSafe(c.text)]),
        theme: 'plain',
        styles: { font: 'NotoSans', fontSize: 8.5, cellPadding: { top: 0.9, bottom: 0.9, left: 0, right: 2 }, textColor: '#1e293b' },
        columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' } },
        didParseCell: (h) => {
          if (h.column.index === 0) h.cell.styles.textColor = h.cell.raw === 'Cumple' ? '#047857' : h.cell.raw === 'Revisar' ? '#be123c' : '#64748b'
        },
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2
    }
    if (sec.note) text(sec.note, 8, 'normal', '#64748b')
    y += 5
  }

  // Firma
  ensure(28)
  y += 14
  doc.setDrawColor('#94a3b8')
  doc.setLineWidth(0.3)
  doc.line(M, y, M + 75, y)
  y += 4.5
  text(d.signer.name || 'Responsable', 9, 'bold')
  if (d.signer.matricula) text(`Matrícula profesional ${d.signer.matricula}`, 8.5)

  // Encabezado y pie en todas las páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const lh = 13
    doc.addImage(logoData, 'JPEG', M, 9, lh * LOGO_RATIO, lh, 'logo')
    // Logos de los contratantes, alineados a la derecha.
    let xr = W - M
    ;(d.extraLogos ?? []).forEach((l, k) => {
      const hh = 11
      const ww = Math.min(38, hh * l.ratio)
      xr -= ww
      doc.addImage(l.dataUrl, 'PNG', xr, 10, ww, ww / l.ratio, `cliente${k}`)
      xr -= 3
    })
    doc.setFont('NotoSans', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(BRAND)
    doc.text('INFORME TÉCNICO', xr, 13, { align: 'right' })
    doc.setFont('NotoSans', 'normal')
    doc.setFontSize(8)
    doc.setTextColor('#64748b')
    doc.text(pdfSafe(d.projectLabel || d.title), xr, 17.5, { align: 'right' })
    doc.setDrawColor('#cbd5e1')
    doc.setLineWidth(0.3)
    doc.line(M, 25, W - M, 25)
    doc.line(M, H - 12, W - M, H - 12)
    doc.setFontSize(7.5)
    doc.text(`${d.title} · ${d.model}`, M, H - 7.5)
    doc.text(`Página ${i} de ${pages}`, W - M, H - 7.5, { align: 'right' })
  }

  save(doc.output('blob'), `${d.fileName}.pdf`)
}

/* --------------------------------- Excel --------------------------------- */

const XL_FMT: Record<ColFmt, string | undefined> = {
  t: undefined,
  f4: '0.0000',
  s4: '+0.0000;-0.0000;0.0000',
  f2: '0.00',
  i: '0',
}

export async function exportExcel(d: ReportDoc, protect?: ProtectOptions) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), asset('brand/logo.png')])
  const wb = new ExcelJS.Workbook()
  wb.creator = d.signer.name || 'H_TOPOGRAFÍA'
  wb.created = new Date()
  const logoId = wb.addImage({ base64: toBase64(logo), extension: 'png' })
  const sections = d.sections
  const headFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF23262D' } }
  const thin = { style: 'thin' as const, color: { argb: 'FFD9DEE5' } }
  const border = { top: thin, left: thin, bottom: thin, right: thin }

  /** Encabezado común: logo + título; devuelve la primera fila libre. */
  const banner = (ws: import('exceljs').Worksheet, subtitle: string, span: number) => {
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: Math.round(58 * LOGO_RATIO), height: 58 } })
    const last = Math.max(span, 4)
    ws.mergeCells(1, 3, 1, last)
    ws.mergeCells(2, 3, 2, last)
    ws.mergeCells(3, 3, 3, last)
    const t = ws.getCell(1, 3)
    t.value = d.title
    t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF23262D' } }
    const s2 = ws.getCell(2, 3)
    s2.value = subtitle
    s2.font = { name: 'Calibri', size: 11, color: { argb: 'FF475569' } }
    const s3 = ws.getCell(3, 3)
    s3.value = `${d.projectLabel}${d.projectLabel ? ' · ' : ''}${d.model}`
    s3.font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } }
    ws.getRow(1).height = 22
    ws.getRow(2).height = 16
    ws.getRow(3).height = 14
    ws.getRow(4).height = 8
    for (let c = 1; c <= last; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF23262D' } } }
    return 6
  }

  const writeTable = (ws: import('exceljs').Worksheet, t: Table, startRow: number) => {
    const hr = ws.getRow(startRow)
    t.head.forEach((h, i) => {
      const c = hr.getCell(i + 1)
      c.value = h
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = headFill
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = border
    })
    hr.height = 20
    t.rows.forEach((row, k) => {
      const r = ws.getRow(startRow + 1 + k)
      row.forEach((v, i) => {
        const c = r.getCell(i + 1)
        c.value = v === null || v === '' ? null : v
        c.border = border
        if (XL_FMT[t.fmt[i]]) c.numFmt = XL_FMT[t.fmt[i]]!
        c.alignment = { horizontal: t.fmt[i] === 't' ? 'left' : 'right' }
        if (i === t.boldCol) c.font = { bold: true }
        if (k % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    })
    t.head.forEach((h, i) => {
      const lens = [h.length, ...t.rows.map((r) => fmtCell(r[i], t.fmt[i]).length)]
      ws.getColumn(i + 1).width = Math.min(48, Math.max(11, Math.max(...lens) + 3))
    })
    return startRow + t.rows.length + 1
  }

  const textRow = (ws: import('exceljs').Worksheet, row: number, value: string, span: number, opts: Partial<import('exceljs').Font> = {}, height?: number) => {
    ws.mergeCells(row, 1, row, span)
    const c = ws.getCell(row, 1)
    c.value = value
    c.font = { name: 'Calibri', size: 10, ...opts }
    c.alignment = { wrapText: true, vertical: 'top' }
    if (height) ws.getRow(row).height = height
  }

  // --- Hoja 1: Informe (resumen) ---
  const SPAN = 7
  const ws = wb.addWorksheet('Informe', { views: [{ showGridLines: false }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  let row = banner(ws, d.subtitleShort, SPAN)
  for (const [k, v] of d.meta) {
    ws.getCell(row, 1).value = k
    ws.getCell(row, 1).font = { color: { argb: 'FF64748B' } }
    ws.mergeCells(row, 2, row, SPAN)
    ws.getCell(row, 2).value = v
    row++
  }
  row++
  let n = 0
  for (const sec of sections) {
    n++
    ws.mergeCells(row, 1, row, SPAN)
    const h = ws.getCell(row, 1)
    h.value = `${n}. ${sec.title}`
    h.font = { bold: true, size: 12, color: { argb: 'FF23262D' } }
    h.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
    row++
    for (const p of sec.paragraphs ?? []) {
      textRow(ws, row, p, SPAN, {}, Math.max(15, Math.ceil(p.length / 95) * 14))
      row++
    }
    for (const f of sec.formulas ?? []) {
      ws.mergeCells(row, 1, row, SPAN)
      ws.getCell(row, 1).value = {
        richText: f
          .split(/(_\{[^}]*\})/)
          .filter(Boolean)
          .map((part) =>
            part.startsWith('_{')
              ? { text: part.slice(2, -1), font: { name: 'Calibri', size: 10, vertAlign: 'subscript' as const } }
              : { text: part, font: { name: 'Calibri', size: 10 } },
          ),
      }
      row++
    }
    if (sec.table) {
      if (sec.sheet && sec.sheet !== 'Resultados') {
        textRow(ws, row, `Ver hoja «${sec.sheet}».`, SPAN, { italic: true, color: { argb: 'FF64748B' } })
        row++
      } else {
        row = writeTable(ws, sec.table, row) + 1
      }
    }
    for (const c of sec.checks ?? []) {
      const st = ws.getCell(row, 1)
      st.value = c.ok === true ? 'Cumple' : c.ok === false ? 'Revisar' : 'N/A'
      st.font = { bold: true, color: { argb: c.ok === true ? 'FF047857' : c.ok === false ? 'FFBE123C' : 'FF64748B' } }
      ws.mergeCells(row, 2, row, SPAN)
      ws.getCell(row, 2).value = c.text
      ws.getCell(row, 2).alignment = { wrapText: true }
      ws.getRow(row).height = Math.max(15, Math.ceil(c.text.length / 85) * 14)
      row++
    }
    if (sec.note) {
      textRow(ws, row, sec.note, SPAN, { size: 9, color: { argb: 'FF64748B' } }, Math.max(15, Math.ceil(sec.note.length / 105) * 13))
      row++
    }
    row++
  }
  row += 2
  ws.getCell(row, 1).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  ws.getCell(row, 2).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  ws.getCell(row, 1).value = d.signer.name || 'Responsable'
  ws.getCell(row, 1).font = { bold: true }
  if (d.signer.matricula) ws.getCell(row + 1, 1).value = `Matrícula profesional ${d.signer.matricula}`
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 0, 24)

  // --- Hojas de datos: una por tabla ---
  for (const sec of sections) {
    if (!sec.table || !sec.sheet) continue
    const sh = wb.addWorksheet(sec.sheet, {
      views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    banner(sh, sec.title, sec.table.head.length)
    const end = writeTable(sh, sec.table, 6)
    if (sec.note) textRow(sh, end + 2, sec.note, sec.table.head.length, { size: 9, color: { argb: 'FF64748B' } }, 30)
    sh.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: sec.table.head.length } }
  }

  addClientLogosToWorkbook(wb, d.extraLogos ?? [])
  await protectWorkbook(wb, protect ?? { password: '', author: d.signer.name, matricula: d.signer.matricula })
  const buf = await wb.xlsx.writeBuffer()
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${d.fileName}.xlsx`)
}

/* ------------------------- protección y autoría ------------------------- */

export interface ProtectOptions {
  /** Contraseña para proteger las hojas; vacía = sin protección. */
  password: string
  author: string
  matricula: string
}

/**
 * Protege cada hoja (celdas, formato, imágenes) dejando seleccionar, copiar y
 * filtrar, y pone la autoría en el pie de página impreso y en las propiedades
 * del archivo. Excel no ofrece protección criptográfica de hojas: evita cambios
 * casuales, no es una firma.
 */
export async function protectWorkbook(wb: import('exceljs').Workbook, o: ProtectOptions) {
  const who = [o.author, o.matricula && `M.P. ${o.matricula}`].filter(Boolean).join(' · ')
  wb.creator = o.author || 'H_TOPOGRAFÍA'
  wb.lastModifiedBy = o.author || 'H_TOPOGRAFÍA'
  wb.company = 'H_TOPOGRAFÍA'
  wb.title = wb.title || 'Reporte H_TOPOGRAFÍA'
  for (const ws of wb.worksheets) {
    ws.headerFooter.oddFooter = `&L&8H_TOPOGRAFÍA${who ? ` · Elaborado por ${who}` : ''}&R&8Página &P de &N`
    ws.headerFooter.evenFooter = ws.headerFooter.oddFooter
    if (o.password)
      await ws.protect(o.password, {
        selectLockedCells: true,
        selectUnlockedCells: true,
        autoFilter: true,
        sort: false,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        insertColumns: false,
        deleteRows: false,
        deleteColumns: false,
        objects: false,
        scenarios: false,
      })
  }
}

/**
 * Coloca los logos de los contratantes en el encabezado de cada hoja, alineados
 * a la derecha de la tabla (se llama al final, con los anchos de columna ya
 * definidos). El logo H_TOPOGRAFÍA (A1) no se toca.
 */
export function addClientLogosToWorkbook(wb: import('exceljs').Workbook, logos: ClientLogo[]) {
  if (!logos.length) return
  const ids = logos.map((l) => wb.addImage({ base64: l.dataUrl.split(',')[1], extension: 'png' }))
  const H = 46
  for (const ws of wb.worksheets) {
    const n = Math.max(ws.columnCount, 6)
    const px = (c: number) => ((ws.getColumn(c).width ?? 9) * 7 + 5)
    // posición (en columnas fraccionarias, base 0) de un desplazamiento en píxeles desde la izquierda
    const colAt = (x: number) => {
      let acc = 0
      for (let c = 1; c <= n; c++) {
        const w = px(c)
        if (acc + w >= x) return c - 1 + (x - acc) / w
        acc += w
      }
      return n
    }
    let right = 0
    for (let c = 1; c <= n; c++) right += px(c)
    logos.forEach((l, k) => {
      const w = Math.round(H * Math.min(l.ratio, 3.2))
      right -= w
      ws.addImage(ids[k], { tl: { col: colAt(right), row: 0.15 }, ext: { width: w, height: Math.round(w / l.ratio) } })
      right -= 10
    })
  }
}
