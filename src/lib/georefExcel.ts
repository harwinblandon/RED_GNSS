/**
 * Excel de entrega de la georreferenciación: una hoja por sección, con logo,
 * y los cálculos verificables como FÓRMULAS de Excel (Δt, D = V·Δt, X − D,
 * h − ζ, H* − δ). Las conversiones geodésicas (geográficas, CTM12) van como
 * valores calculados por la plataforma.
 */
import type { Worksheet } from 'exceljs'
import { formatDms } from './format'
import { fromGeocentric } from './coords'
import type { ReportMeta } from './guideReportExport'
import { addClientLogosToWorkbook, asset, protectWorkbook, safeFileName, save, toBase64, fmtDate, type ProtectOptions } from './guideReportExport'
import { correctionQuality } from './heights'
import type { ClientLogo } from './clientLogos'
import { projectOut, type OutputSys } from './outputCrs'
import type { VemosModel } from './vemos'
import { finalHeight, heightTypeLabel, type BaseVertex, type GeorefResult, type HeightMode } from './georef'

export interface GeorefExport {
  meta: ReportMeta
  ubicacion: string
  bases: BaseVertex[]
  results: GeorefResult[]
  refEpoch: number
  heightMode: HeightMode
  velModel: VemosModel
  /** Sistemas planos adicionales a CTM12 para el reporte final. */
  systems: OutputSys[]
  logos?: ClientLogo[]
}

const LOGO_RATIO = 1270 / 591
const INK = 'FF23262D'
const thin = { style: 'thin' as const, color: { argb: 'FFD9DEE5' } }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }
const F = { name: 'Arial', size: 10 }

type Fmt = 't' | 'f4' | 'f3' | 'f2' | 'f6' | 'f9' | 's4' | 'mm'
const NUMFMT: Record<Fmt, string | undefined> = {
  t: undefined,
  f2: '0.00',
  f3: '0.000',
  f4: '0.0000',
  f6: '0.000000',
  f9: '0.000000000',
  s4: '+0.0000;-0.0000;0.0000',
  mm: '+0.0;-0.0;0.0',
}

/** Celda: valor, o fórmula con su resultado ya calculado (para que se vea sin recalcular). */
type Cell = string | number | null | { f: string; v: number | string | null }

interface Col {
  head: string
  fmt: Fmt
  width?: number
}

export async function exportGeorefExcel(d: GeorefExport, protect?: ProtectOptions) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), asset('brand/logo.png')])
  const wb = new ExcelJS.Workbook()
  wb.creator = d.meta.responsable || 'H_TOPOGRAFÍA'
  wb.created = new Date()
  const logoId = wb.addImage({ base64: toBase64(logo), extension: 'png' })
  const { results, refEpoch: tRef } = d
  const R0 = 7 // primera fila de datos en las hojas de tabla (encabezado en la 6)

  const banner = (ws: Worksheet, title: string, subtitle: string, span: number) => {
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: Math.round(56 * LOGO_RATIO), height: 56 } })
    const last = Math.max(span, 5)
    for (const [r, v, font] of [
      [1, 'Georreferenciación GNSS — Reporte final de coordenadas', { ...F, size: 14, bold: true, color: { argb: INK } }],
      [2, title, { ...F, size: 11, bold: true, color: { argb: 'FF334155' } }],
      [3, subtitle, { ...F, size: 9, color: { argb: 'FF64748B' } }],
    ] as const) {
      ws.mergeCells(r, 3, r, last)
      const c = ws.getCell(r, 3)
      c.value = v
      c.font = font
    }
    ws.getRow(1).height = 22
    for (let c = 1; c <= last; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: INK } } }
  }

  const table = (ws: Worksheet, cols: Col[], rows: Cell[][], headRow = 6) => {
    const hr = ws.getRow(headRow)
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1)
      cell.value = c.head
      cell.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = BORDER
      ws.getColumn(i + 1).width = c.width ?? 14
    })
    hr.height = 32
    rows.forEach((row, k) => {
      const r = ws.getRow(headRow + 1 + k)
      row.forEach((v, i) => {
        const cell = r.getCell(i + 1)
        cell.value = v != null && typeof v === 'object' ? { formula: v.f, result: v.v ?? undefined } : v
        cell.font = F
        cell.border = BORDER
        const nf = NUMFMT[cols[i].fmt]
        if (nf) cell.numFmt = nf
        cell.alignment = { horizontal: cols[i].fmt === 't' ? 'left' : 'right' }
        if (k % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    })
    ws.views = [{ state: 'frozen', ySplit: headRow, showGridLines: false }]
    ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: cols.length } }
    return headRow + rows.length + 1
  }

  const note = (ws: Worksheet, row: number, text: string, span: number) => {
    ws.mergeCells(row, 1, row, span)
    const c = ws.getCell(row, 1)
    c.value = text
    c.font = { ...F, size: 9, color: { argb: 'FF64748B' } }
    c.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(row).height = Math.max(15, Math.ceil(text.length / 120) * 13)
  }

  const VEL = d.velModel
  const VEL_CITE =
    VEL === 'VEMOS2017'
      ? 'Drewes H., Sánchez L. (2020). Velocity model for SIRGAS 2017: VEMOS2017, doi:10.1594/PANGAEA.912350.'
      : 'Sánchez L., Drewes H., Kehm A., Seitz M. (2022). J. Geod. Sci. 12(1), 92–119, doi:10.1515/jogs-2022-0138.'
  const HEIGHT_LABEL: Record<HeightMode, string> = {
    ajuste: 'QGeoidCOL2023 + ajuste a la red de nivelación del IGAC',
    modelo: 'QGeoidCOL2023 (H = h − ζ)',
    geocol2004: 'GEOCOL2004 (H = h − N), rejilla ISG',
    software: 'GEOCOL2004 del software de post-proceso (H = h − N)',
    ninguna: 'Sin alturas físicas',
  }
  /** Proyecciones adicionales en la época de referencia, por punto. */
  const extra = results.map((r) => d.systems.map((sy) => projectOut(sy, r.ref.lat, r.ref.lon)))
  const colL = (i: number) => {
    let n = i
    let out = ''
    while (n > 0) {
      const m = (n - 1) % 26
      out = String.fromCharCode(65 + m) + out
      n = Math.floor((n - 1) / 26)
    }
    return out
  }

  const page = (landscape: boolean) => ({ orientation: landscape ? ('landscape' as const) : ('portrait' as const), fitToPage: true, fitToWidth: 1, fitToHeight: 0 })
  const SH = {
    obs: 'Época de observación',
    vel: 'Velocidades',
    ref: `Época ${tRef.toFixed(1)}`,
    alt: 'Alturas',
  }
  const q = (s: string) => `'${s}'`

  // ------------------------------------------------------------ Resumen
  const ws = wb.addWorksheet('Resumen', { pageSetup: page(true), views: [{ showGridLines: false }] })
  banner(ws, d.meta.proyecto || 'Proyecto', `MAGNA-SIRGAS · época de referencia ${tRef.toFixed(1)} · Origen Nacional CTM12`, 9)
  const metaRows: [string, string][] = [
    ['Proyecto', d.meta.proyecto || '—'],
    ['Contrato / cliente', d.meta.contrato || '—'],
    ['Ubicación', d.ubicacion || '—'],
    ['Calculado por', `${d.meta.responsable || '—'}${d.meta.matricula ? ` · M.P. ${d.meta.matricula}` : ''}`],
    ['Fecha(s) de campaña', d.meta.fechaCampana || '—'],
    ['Fecha del reporte', fmtDate(new Date())],
    ['Equipos', d.meta.equipos || '—'],
    ['Software de post-proceso', d.meta.software || '—'],
    ['Bases', d.bases.map((b) => `${b.id} (${b.tipo})`).join(', ') || '—'],
    ['Modelo de velocidades', `${VEL} (SIRGAS), interpolado en cada punto`],
    ['Modelo de alturas', HEIGHT_LABEL[d.heightMode]],
    ['Sistemas de coordenadas', ['Origen Nacional CTM12 (EPSG:9377)', ...d.systems.map((sy) => sy.label)].join(' · ')],
  ]
  let row = 6
  for (const [k, v] of metaRows) {
    ws.getCell(row, 1).value = k
    ws.getCell(row, 1).font = { ...F, color: { argb: 'FF64748B' } }
    ws.mergeCells(row, 2, row, 9)
    ws.getCell(row, 2).value = v
    ws.getCell(row, 2).font = F
    row++
  }
  row += 1
  ws.mergeCells(row, 1, row, 9)
  ws.getCell(row, 1).value = `COORDENADAS FINALES — MAGNA-SIRGAS ÉPOCA ${tRef.toFixed(1)}`
  ws.getCell(row, 1).font = { ...F, size: 12, bold: true, color: { argb: INK } }
  row += 1
  const sumHead = row
  const finalRows: Cell[][] = results.map((r, k) => {
    const rr = R0 + k
    const fh = finalHeight(r, d.heightMode)
    return [
      r.p.id,
      { f: `${q(SH.ref)}!J${rr}`, v: r.ref.north },
      { f: `${q(SH.ref)}!K${rr}`, v: r.ref.east },
      ...extra[k].flatMap((pr, j) => [
        { f: `${q(SH.ref)}!${colL(12 + 2 * j)}${rr}`, v: pr.north },
        { f: `${q(SH.ref)}!${colL(13 + 2 * j)}${rr}`, v: pr.east },
      ]),
      fh == null ? null : { f: `${q(SH.alt)}!${d.heightMode === 'ajuste' && r.height?.leveled != null ? 'F' : 'D'}${rr}`, v: fh },
      heightTypeLabel(r, d.heightMode),
      formatDms(r.ref.lat, 'lat'),
      formatDms(r.ref.lon, 'lon'),
      { f: `${q(SH.ref)}!I${rr}`, v: r.ref.h },
      { f: `${q(SH.obs)}!D${rr}`, v: r.p.tObs },
    ]
  })
  const endSum = table(
    ws,
    [
      { head: 'Punto', fmt: 't', width: 16 },
      { head: 'Norte CTM12 (m)', fmt: 'f3', width: 16 },
      { head: 'Este CTM12 (m)', fmt: 'f3', width: 16 },
      ...d.systems.flatMap((sy): Col[] => [
        { head: `Norte ${sy.short} (m)`, fmt: 'f3', width: 16 },
        { head: `Este ${sy.short} (m)`, fmt: 'f3', width: 16 },
      ]),
      { head: 'Cota (m)', fmt: 'f3', width: 12 },
      { head: 'Tipo de altura', fmt: 't', width: 26 },
      { head: `Latitud ${tRef.toFixed(1)}`, fmt: 't', width: 20 },
      { head: `Longitud ${tRef.toFixed(1)}`, fmt: 't', width: 20 },
      { head: 'h elipsoidal (m)', fmt: 'f3', width: 14 },
      { head: 'Época de observación', fmt: 'f4', width: 14 },
    ],
    finalRows,
    sumHead,
  )
  ws.views = [{ showGridLines: false }]
  ws.autoFilter = undefined as never
  ws.getColumn(1).width = 26
  row = endSum + 1
  note(ws, row, 'Las columnas Norte, Este y Cota están vinculadas a las hojas de cálculo; cualquier revisión puede seguir cada valor hasta su origen.', 9 + 2 * d.systems.length)
  row += 3
  ws.getCell(row, 1).value = d.meta.responsable || 'Responsable'
  ws.getCell(row, 1).font = { ...F, bold: true }
  ws.getCell(row, 1).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  ws.getCell(row, 2).border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  if (d.meta.matricula) ws.getCell(row + 1, 1).value = `Matrícula profesional ${d.meta.matricula}`

  // ------------------------------------------------------------ Bases
  const wsB = wb.addWorksheet('Bases', { pageSetup: page(true) })
  banner(wsB, 'Vértices base empleados en el post-proceso', 'Coordenadas fijadas en el procesamiento (última solución semanal disponible)', 8)
  const endB = table(
    wsB,
    [
      { head: 'Base', fmt: 't', width: 18 },
      { head: 'Tipo', fmt: 't', width: 14 },
      { head: 'X (m)', fmt: 'f4', width: 16 },
      { head: 'Y (m)', fmt: 'f4', width: 16 },
      { head: 'Z (m)', fmt: 'f4', width: 16 },
      { head: 'Latitud', fmt: 't', width: 20 },
      { head: 'Longitud', fmt: 't', width: 20 },
      { head: 'Época de las coordenadas', fmt: 'f4', width: 14 },
      { head: 'Fuente', fmt: 't', width: 48 },
    ],
    d.bases.map((b) => {
      const g = fromGeocentric(b.x, b.y, b.z)
      return [b.id, b.tipo, b.x, b.y, b.z, formatDms(g.lat, 'lat'), formatDms(g.lon, 'lon'), b.epoch, b.fuente]
    }),
  )
  note(wsB, endB + 1, 'Geográficas calculadas de X, Y, Z sobre GRS80. Las coordenadas que rigen el procesamiento son las geocéntricas.', 9)

  // ------------------------------------------------------------ Época de observación
  const wsO = wb.addWorksheet(SH.obs, { pageSetup: page(true) })
  banner(wsO, 'Coordenadas ajustadas — época de observación', 'Resultado del post-proceso (marco de la solución semanal, época de cada sesión)', 17)
  const endO = table(
    wsO,
    [
      { head: 'Punto', fmt: 't', width: 16 },
      { head: 'Inicio sesión', fmt: 't', width: 16 },
      { head: 'Fin sesión', fmt: 't', width: 16 },
      { head: 'Época t_obs (año)', fmt: 'f4', width: 12 },
      { head: 'X (m)', fmt: 'f4', width: 15 },
      { head: 'Y (m)', fmt: 'f4', width: 15 },
      { head: 'Z (m)', fmt: 'f4', width: 15 },
      { head: 'Latitud', fmt: 't', width: 20 },
      { head: 'Longitud', fmt: 't', width: 20 },
      { head: 'Latitud (°)', fmt: 'f9', width: 14 },
      { head: 'Longitud (°)', fmt: 'f9', width: 15 },
      { head: 'h elipsoidal (m)', fmt: 'f4', width: 13 },
      { head: 'Norte CTM12 (m)', fmt: 'f4', width: 15 },
      { head: 'Este CTM12 (m)', fmt: 'f4', width: 15 },
      { head: 'Base', fmt: 't', width: 12 },
      { head: 'Antena', fmt: 't', width: 12 },
      { head: 'Altura antena (m)', fmt: 'f4', width: 11 },
    ],
    results.map((r) => [
      r.p.id, r.p.inicio, r.p.fin, r.p.tObs, r.p.x, r.p.y, r.p.z,
      formatDms(r.obs.lat, 'lat'), formatDms(r.obs.lon, 'lon'), r.obs.lat, r.obs.lon, r.obs.h,
      r.obs.north, r.obs.east, r.p.base, r.p.antena, r.p.alturaAntena,
    ]),
  )
  note(wsO, endO + 1, 'Época t_obs: año decimal del instante medio de la sesión de rastreo. Geográficas y CTM12 calculadas sobre el elipsoide GRS80.', 17)

  // ------------------------------------------------------------ Velocidades
  const wsV = wb.addWorksheet(SH.vel, { pageSetup: page(true) })
  banner(wsV, 'Velocidades y desplazamientos para el cambio de época', `Modelo ${VEL} (SIRGAS) interpolado en cada punto · Δt = t_obs − t_ref · D = V · Δt`, 12)
  wsV.getCell(5, 1).value = 'Época de referencia t_ref'
  wsV.getCell(5, 1).font = { ...F, bold: true }
  wsV.getCell(5, 2).value = tRef
  wsV.getCell(5, 2).numFmt = '0.0'
  wsV.getCell(5, 2).font = { ...F, bold: true, color: { argb: 'FF0000FF' } }
  wsV.getCell(5, 3).value = 'MAGNA-SIRGAS 2018 (ITRF2014, Resolución IGAC 715 de 2018)'
  wsV.getCell(5, 3).font = { ...F, size: 9, color: { argb: 'FF64748B' } }
  const endV = table(
    wsV,
    [
      { head: 'Punto', fmt: 't', width: 16 },
      { head: 't_obs (año)', fmt: 'f4', width: 12 },
      { head: 'Δt = t_obs − t_ref (años)', fmt: 'f4', width: 13 },
      { head: 'vN (mm/año)', fmt: 'mm', width: 11 },
      { head: 'vE (mm/año)', fmt: 'mm', width: 11 },
      { head: 'Vx (m/año)', fmt: 'f6', width: 12 },
      { head: 'Vy (m/año)', fmt: 'f6', width: 12 },
      { head: 'Vz (m/año)', fmt: 'f6', width: 12 },
      { head: 'Dx = Vx·Δt (m)', fmt: 's4', width: 13 },
      { head: 'Dy = Vy·Δt (m)', fmt: 's4', width: 13 },
      { head: 'Dz = Vz·Δt (m)', fmt: 's4', width: 13 },
      { head: 'Interpolación', fmt: 't', width: 14 },
    ],
    results.map((r, k) => {
      const rr = R0 + k
      return [
        r.p.id,
        { f: `${q(SH.obs)}!D${rr}`, v: r.p.tObs },
        { f: `B${rr}-$B$5`, v: r.dt },
        r.vel.vn * 1000,
        r.vel.ve * 1000,
        r.vel.vx,
        r.vel.vy,
        r.vel.vz,
        { f: `F${rr}*C${rr}`, v: r.disp.x },
        { f: `G${rr}*C${rr}`, v: r.disp.y },
        { f: `H${rr}*C${rr}`, v: r.disp.z },
        r.vel.extrapolated ? 'nodo más cercano' : 'bilineal',
      ]
    }),
  )
  note(
    wsV,
    endV + 1,
    `Vx, Vy, Vz: velocidad horizontal ${VEL} (vN, vE) rotada al sistema geocéntrico: Vx = −sinλ·vE − sinφ·cosλ·vN · Vy = cosλ·vE − sinφ·sinλ·vN · Vz = cosφ·vN. Los modelos VEMOS no modelan la componente vertical (vU = 0). Fuente: ${VEL_CITE}`,
    12,
  )

  // ------------------------------------------------------------ Época de referencia
  const wsR = wb.addWorksheet(SH.ref, { pageSetup: page(true) })
  banner(wsR, `Coordenadas en la época de referencia ${tRef.toFixed(1)}`, 'X_ref = X − D · geográficas y CTM12 calculadas sobre GRS80', 11)
  const endR = table(
    wsR,
    [
      { head: 'Punto', fmt: 't', width: 16 },
      { head: 'X (m)', fmt: 'f4', width: 15 },
      { head: 'Y (m)', fmt: 'f4', width: 15 },
      { head: 'Z (m)', fmt: 'f4', width: 15 },
      { head: 'Latitud', fmt: 't', width: 20 },
      { head: 'Longitud', fmt: 't', width: 20 },
      { head: 'Latitud (°)', fmt: 'f9', width: 14 },
      { head: 'Longitud (°)', fmt: 'f9', width: 15 },
      { head: 'h elipsoidal (m)', fmt: 'f4', width: 13 },
      { head: 'Norte CTM12 (m)', fmt: 'f4', width: 15 },
      { head: 'Este CTM12 (m)', fmt: 'f4', width: 15 },
      ...d.systems.flatMap((sy): Col[] => [
        { head: `Norte ${sy.short} (m)`, fmt: 'f4', width: 16 },
        { head: `Este ${sy.short} (m)`, fmt: 'f4', width: 16 },
      ]),
    ],
    results.map((r, k) => {
      const rr = R0 + k
      return [
        r.p.id,
        { f: `${q(SH.obs)}!E${rr}-${q(SH.vel)}!I${rr}`, v: r.ref.x },
        { f: `${q(SH.obs)}!F${rr}-${q(SH.vel)}!J${rr}`, v: r.ref.y },
        { f: `${q(SH.obs)}!G${rr}-${q(SH.vel)}!K${rr}`, v: r.ref.z },
        formatDms(r.ref.lat, 'lat'),
        formatDms(r.ref.lon, 'lon'),
        r.ref.lat,
        r.ref.lon,
        r.ref.h,
        r.ref.north,
        r.ref.east,
        ...extra[k].flatMap((pr) => [pr.north, pr.east]),
      ]
    }),
  )
  note(
    wsR,
    endR + 1,
    ['CTM12: Origen Nacional (EPSG:9377), Resoluciones IGAC 471 y 529 de 2020.', ...d.systems.map((sy) => sy.label)].join(' · '),
    11 + 2 * d.systems.length,
  )

  // ------------------------------------------------------------ Alturas
  if (d.heightMode === 'geocol2004' || d.heightMode === 'software') {
    const sw = d.heightMode === 'software'
    const wsA = wb.addWorksheet(SH.alt, { pageSetup: page(true) })
    banner(wsA, 'Cálculo de alturas (cotas)', sw ? `GEOCOL2004 según ${d.meta.software || 'el software de post-proceso'} · H = h − N` : 'Modelo GEOCOL2004 · H = h − N', 5)
    const endA = table(
      wsA,
      [
        { head: 'Punto', fmt: 't', width: 16 },
        { head: 'h elipsoidal (m)', fmt: 'f4', width: 14 },
        { head: sw ? 'N GEOCOL2004 del software (m)' : 'N GEOCOL2004 (m)', fmt: 'f4', width: 16 },
        { head: 'Cota H = h − N (m)', fmt: 'f4', width: 16 },
      ],
      results.map((r, k) => {
        const rr = R0 + k
        const N = sw ? r.p.geoidSepSoftware ?? null : r.height?.n04 ?? null
        return [
          r.p.id,
          { f: `${q(SH.obs)}!L${rr}`, v: r.obs.h },
          N,
          N == null ? null : { f: `B${rr}-C${rr}`, v: r.obs.h - N },
        ]
      }),
    )
    note(
      wsA,
      endA + 1,
      (sw
        ? 'N: separación geoidal GEOCOL2004 reportada por el software de post-proceso en cada punto; h: altura elipsoidal en la época de observación. '
        : 'N interpolado bilinealmente de la rejilla GEOCOL2004 del International Service for the Geoid; puede diferir algunos centímetros del archivo y la interpolación de un software comercial. ') +
        'GEOCOL2004: modelo geoidal del IGAC (Resolución 068 de 2005), de uso permitido durante la transición a QGeoidCOL2023 (Resolución IGAC 515 de 2026, art. 5). Frente a la red de nivelación presenta desfases de metros en varias regiones; se usa cuando el contrato o la interventoría lo exigen.',
      6,
    )
  } else if (d.heightMode !== 'ninguna') {
    const wsA = wb.addWorksheet(SH.alt, { pageSetup: page(true) })
    banner(wsA, 'Cálculo de alturas (cotas)', 'Modelo QGeoidCOL2023 (Resolución IGAC 515 de 2026) · H* = h − ζ · H = H* − δ', 9)
    const endA = table(
      wsA,
      [
        { head: 'Punto', fmt: 't', width: 16 },
        { head: 'h elipsoidal (m)', fmt: 'f4', width: 13 },
        { head: 'ζ QGeoidCOL2023 (m)', fmt: 'f4', width: 13 },
        { head: 'Cota modelo H* = h − ζ (m)', fmt: 'f4', width: 15 },
        { head: 'Ajuste δ a la red (m)', fmt: 's4', width: 13 },
        { head: 'Cota ajustada H = H* − δ (m)', fmt: 'f4', width: 16 },
        { head: 'Puntos GNSS/nivelación', fmt: 't', width: 12 },
        { head: 'Dispersión σ (m)', fmt: 'f4', width: 11 },
        { head: 'Calidad del ajuste', fmt: 't', width: 14 },
      ],
      results.map((r, k) => {
        const rr = R0 + k
        const hh = r.height
        const adj = d.heightMode === 'ajuste' && hh?.delta != null
        return [
          r.p.id,
          { f: `${q(SH.obs)}!L${rr}`, v: r.obs.h },
          hh?.zeta ?? null,
          hh?.zeta == null ? null : { f: `B${rr}-C${rr}`, v: hh.normal },
          adj ? hh!.delta : null,
          adj ? { f: `D${rr}-E${rr}`, v: hh!.leveled } : null,
          d.heightMode === 'ajuste' ? String(hh?.correction?.used ?? 0) : '',
          d.heightMode === 'ajuste' ? hh?.correction?.spread ?? null : null,
          d.heightMode === 'ajuste' ? correctionQuality(hh?.correction ?? null).label : '',
        ]
      }),
    )
    note(
      wsA,
      endA + 1,
      d.heightMode === 'ajuste'
        ? 'δ: desfase local entre el modelo y la red de nivelación del IGAC (datum Buenaventura), estimado con los puntos GNSS/nivelación cercanos (ponderación 1/d², rechazo de atípicos). Este método no es el relativo de la Guía metodológica del IGAC (que exige ocupar NP en la campaña); para ese caso use el módulo de Alturas de la plataforma.'
        : 'Cota con el modelo QGeoidCOL2023 sin ajuste local a la red de nivelación.',
      9,
    )
  }

  // ------------------------------------------------------------ Metodología
  const wsM = wb.addWorksheet('Metodología', { pageSetup: page(false), views: [{ showGridLines: false }] })
  banner(wsM, 'Metodología y referencias', '', 6)
  const steps = [
    '1. Post-proceso GNSS de las sesiones estáticas, fijando las bases con las coordenadas de la última solución semanal disponible (IGAC / SIRGAS), en el marco y época de esa solución.',
    '2. Coordenadas geocéntricas ajustadas de cada punto en su época de observación t_obs (instante medio de la sesión).',
    `3. Velocidad de cada punto con el modelo ${VEL} de SIRGAS (interpolación bilineal de la rejilla), rotada a componentes geocéntricas Vx, Vy, Vz.`,
    `4. Cambio de época: Δt = t_obs − ${tRef.toFixed(1)}; D = V·Δt; X_ref = X − D (hojas «${SH.vel}» y «${SH.ref}», con fórmulas).`,
    `5. Conversión a geográficas (GRS80) y a coordenadas planas: Origen Nacional CTM12 (EPSG:9377)${d.systems.length ? `, ${d.systems.map((sy) => sy.short).join(', ')}` : ''}.${d.systems.some((sy) => sy.kind === 'cart') ? ' Planas cartesianas por el método «Colombia Urban» (EPSG 1052, IOGP 373-7-2).' : ''}`,
    d.heightMode === 'ninguna'
      ? '6. Sin cálculo de alturas físicas.'
      : d.heightMode === 'geocol2004' || d.heightMode === 'software'
        ? `6. Cota: H = h − N con el modelo geoidal GEOCOL2004${d.heightMode === 'software' ? ' (N del software de post-proceso)' : ''}.`
        : `6. Cota: H* = h − ζ con el cuasigeoide QGeoidCOL2023${d.heightMode === 'ajuste' ? ', ajustada a la red de nivelación del IGAC con el desfase local δ (H = H* − δ)' : ''}.`,
    '',
    'Referencias',
    '• Resolución IGAC 068 de 2005 — MAGNA-SIRGAS, datum oficial de Colombia.',
    '• Resolución IGAC 715 de 2018 — actualización del marco MAGNA-SIRGAS a ITRF2014, época 2018.0.',
    '• Resoluciones IGAC 471 y 529 de 2020 — Origen Nacional CTM12.',
    '• Resolución IGAC 515 de 2026 — modelo QGeoidCOL2023.',
    `• ${VEL}: ${VEL_CITE}`,
  ]
  steps.forEach((t, i) => {
    const r = 6 + i
    wsM.mergeCells(r, 1, r, 6)
    const c = wsM.getCell(r, 1)
    c.value = t
    c.font = t === 'Referencias' ? { ...F, bold: true, size: 11 } : F
    c.alignment = { wrapText: true, vertical: 'top' }
    wsM.getRow(r).height = Math.max(15, Math.ceil(t.length / 95) * 14)
  })
  for (let c = 1; c <= 6; c++) wsM.getColumn(c).width = 18

  addClientLogosToWorkbook(wb, d.logos ?? [])
  await protectWorkbook(wb, protect ?? { password: '', author: d.meta.responsable, matricula: d.meta.matricula })
  const buf = await wb.xlsx.writeBuffer()
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeFileName('Reporte_coordenadas', d.meta.proyecto)}.xlsx`)
}
