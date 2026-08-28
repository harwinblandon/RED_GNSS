/**
 * Enlaces a efemérides GNSS (transmitidas y precisas del IGS) según la fecha.
 *
 * El IGS cambió a nombres largos de producto en la semana GPS 2238 (2022-11-27);
 * antes se usaban los nombres cortos `igsWWWWD.sp3.Z`.
 */
import { gpsTimeFromDate } from './gpsTime'

const LONGNAME_SINCE_WEEK = 2238

export interface Mirror {
  host: string
  /** URL del archivo si se conoce el nombre exacto; si no, del directorio. */
  url: string
  note?: string
}

export interface EphemProduct {
  key: 'broadcast' | 'ultra' | 'rapid' | 'final'
  label: string
  latency: string
  /** Estimación de si el producto ya debería estar publicado para esa fecha. */
  likelyAvailable: boolean
  recommended: boolean
  /** Nombre(s) de archivo esperado(s). */
  files: string[]
  mirrors: Mirror[]
}

export interface EphemInfo {
  date: string
  year: number
  doy: number
  gpsWeek: number
  dayOfWeek: number
  longNames: boolean
  ageDays: number
  products: EphemProduct[]
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function brdcMirrors(year: number, doy: number): Mirror[] {
  const ddd = pad(doy, 3)
  const yy = pad(year % 100)
  return [
    {
      host: 'BKG',
      url: `https://igs.bkg.bund.de/root_ftp/IGS/BRDC/${year}/${ddd}/BRDC00IGS_R_${year}${ddd}0000_01D_MN.rnx.gz`,
    },
    {
      host: 'CDDIS',
      url: `https://cddis.nasa.gov/archive/gnss/data/daily/${year}/${ddd}/${yy}p/BRDC00IGS_R_${year}${ddd}0000_01D_MN.rnx.gz`,
      note: 'requiere login Earthdata',
    },
    {
      host: 'BKG (RINEX 2, GPS)',
      url: `https://igs.bkg.bund.de/root_ftp/IGS/BRDC/${year}/${ddd}/brdc${ddd}0.${yy}n.gz`,
    },
  ]
}

function productDirMirrors(gpsWeek: number): Mirror[] {
  return [
    { host: 'BKG', url: `https://igs.bkg.bund.de/root_ftp/IGS/products/${gpsWeek}/` },
    { host: 'CDDIS', url: `https://cddis.nasa.gov/archive/gnss/products/${gpsWeek}/`, note: 'requiere login Earthdata' },
    { host: 'IGN', url: `https://igs.ign.fr/pub/igs/products/${gpsWeek}/` },
    { host: 'Wuhan', url: `ftp://igs.gnsswhu.cn/pub/gps/products/${gpsWeek}/`, note: 'FTP' },
  ]
}

function fileMirrors(gpsWeek: number, name: string): Mirror[] {
  return [
    { host: 'BKG', url: `https://igs.bkg.bund.de/root_ftp/IGS/products/${gpsWeek}/${name}` },
    { host: 'IGN', url: `https://igs.ign.fr/pub/igs/products/${gpsWeek}/${name}` },
    { host: 'CDDIS', url: `https://cddis.nasa.gov/archive/gnss/products/${gpsWeek}/${name}`, note: 'login Earthdata' },
  ]
}

export function ephemerisFor(date: Date, today = new Date()): EphemInfo {
  const t = gpsTimeFromDate(date)
  const { gpsWeek, dayOfWeek: dow, dayOfYear: doy, year } = t
  const longNames = gpsWeek >= LONGNAME_SINCE_WEEK
  const ageDays = Math.round(
    (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - t.date.getTime()) / 86_400_000,
  )

  const yddd = `${year}${pad(doy, 3)}`
  const products: EphemProduct[] = []

  // Recomendación: el producto preciso más fino que ya debería existir.
  const rec: EphemProduct['key'] =
    ageDays < 1 ? 'ultra' : ageDays < 13 ? 'rapid' : 'final'

  products.push({
    key: 'broadcast',
    label: 'Efemérides transmitidas (BRDC)',
    latency: 'disponible el mismo día / día siguiente',
    likelyAvailable: ageDays >= 0,
    recommended: false,
    files: longNames
      ? [`BRDC00IGS_R_${yddd}0000_01D_MN.rnx.gz`]
      : [`brdc${pad(doy, 3)}0.${pad(year % 100)}n.gz`],
    mirrors: brdcMirrors(year, doy),
  })

  products.push({
    key: 'ultra',
    label: 'Ultrarrápidas (IGU / ULT)',
    latency: '4 emisiones/día · parte observada ~3–9 h de latencia',
    likelyAvailable: ageDays <= 2,
    recommended: rec === 'ultra',
    files: longNames
      ? ['00', '06', '12', '18'].map((hh) => `IGS0OPSULT_${yddd}${hh}00_02D_15M_ORB.SP3.gz`)
      : ['00', '06', '12', '18'].map((hh) => `igu${gpsWeek}${dow}_${hh}.sp3.Z`),
    mirrors: productDirMirrors(gpsWeek),
  })

  products.push({
    key: 'rapid',
    label: 'Rápidas (IGR / RAP)',
    latency: '~17 h (día siguiente, ~17:00 UTC)',
    likelyAvailable: ageDays >= 1 && ageDays <= 25,
    recommended: rec === 'rapid',
    files: longNames
      ? [`IGS0OPSRAP_${yddd}0000_01D_15M_ORB.SP3.gz`, `IGS0OPSRAP_${yddd}0000_01D_05M_CLK.CLK.gz`, `IGS0OPSRAP_${yddd}0000_01D_01D_ERP.ERP.gz`]
      : [`igr${gpsWeek}${dow}.sp3.Z`, `igr${gpsWeek}${dow}.clk.Z`],
    mirrors: longNames
      ? fileMirrors(gpsWeek, `IGS0OPSRAP_${yddd}0000_01D_15M_ORB.SP3.gz`)
      : fileMirrors(gpsWeek, `igr${gpsWeek}${dow}.sp3.Z`),
  })

  products.push({
    key: 'final',
    label: 'Finales (IGS / FIN)',
    latency: '~12–18 días',
    likelyAvailable: ageDays >= 12,
    recommended: rec === 'final',
    files: longNames
      ? [`IGS0OPSFIN_${yddd}0000_01D_15M_ORB.SP3.gz`, `IGS0OPSFIN_${yddd}0000_01D_30S_CLK.CLK.gz`, `(ERP semanal en la carpeta de la semana)`]
      : [`igs${gpsWeek}${dow}.sp3.Z`, `igs${gpsWeek}${dow}.clk_30s.Z`, `igs${gpsWeek}7.erp.Z`],
    mirrors: longNames
      ? fileMirrors(gpsWeek, `IGS0OPSFIN_${yddd}0000_01D_15M_ORB.SP3.gz`)
      : fileMirrors(gpsWeek, `igs${gpsWeek}${dow}.sp3.Z`),
  })

  return {
    date: t.date.toISOString().slice(0, 10),
    year,
    doy,
    gpsWeek,
    dayOfWeek: dow,
    longNames,
    ageDays,
    products,
  }
}
