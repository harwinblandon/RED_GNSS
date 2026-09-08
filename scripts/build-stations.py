#!/usr/bin/env python3
"""
Regenera `src/data/stations.ts` — estaciones de la Red Geodésica Nacional Activa
(MAGNA-ECO) del IGAC.

Uso:
    python scripts/build-stations.py

Requisitos: Python 3.9+ y conexión a internet. Sin dependencias externas.

Fuente: API pública del Centro de Control Geodésico del IGAC (CORS abierto).
  - Listado:  https://ccg.igac.gov.co/api/estaciones
  - Detalle:  https://ccg.igac.gov.co/api/estacion/<t_id>
"""
from __future__ import annotations
import hashlib, json, os, sys, time, urllib.request, datetime

API = "https://ccg.igac.gov.co/api"
OUT = "src/data/stations.ts"
CACHE = "scripts/.cache"
UA = {"User-Agent": "build-stations.py (proyecto GNSS-IGAC)"}
# Velocidades MIDAS del Nevada Geodetic Laboratory (marco IGS14 ≈ ITRF2014).
NGL_MIDAS = "https://geodesy.unr.edu/velocities/midas.IGS14.txt"


def load_velocities() -> dict:
    """{id4: (vn, ve, vu)} en m/año, solo estaciones dentro del recuadro de Colombia."""
    try:
        req = urllib.request.Request(NGL_MIDAS, headers=UA)
        text = urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        print(f"  ! sin velocidades NGL: {e}", file=sys.stderr)
        return {}
    out = {}
    for line in text.splitlines():
        p = line.split()
        if len(p) < 26:
            continue
        try:
            ve, vn, vu = float(p[8]), float(p[9]), float(p[10])
            reflat, reflon = float(p[-3]), float(p[-2])
        except ValueError:
            continue
        if reflon > 180:
            reflon -= 360
        if -4.5 <= reflat <= 13.6 and -80 <= reflon <= -66:
            out[p[0]] = (vn, ve, vu, reflat, reflon)
    return out


def get_json(path: str, timeout: int = 40, cache: bool = True):
    cf = os.path.join(CACHE, hashlib.md5(path.encode()).hexdigest() + ".json")
    if cache and os.path.exists(cf):
        with open(cf, encoding="utf-8") as fh:
            return json.load(fh)
    req = urllib.request.Request(API + path, headers=UA)
    raw = urllib.request.urlopen(req, timeout=timeout).read()
    data = json.loads(raw.decode("utf-8", "replace"))
    if cache:
        os.makedirs(CACHE, exist_ok=True)
        with open(cf, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
    return data


def fix(s):
    """Corrige texto UTF-8 doble-codificado ('Geol\\u00c3\\u00b3gico' -> 'Geológico')."""
    if not isinstance(s, str):
        return s
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def titlecase_place(s: str) -> str:
    small = {"de", "del", "la", "las", "los", "y", "e"}
    s = fix(s or "").strip().strip(",").strip()
    words = s.lower().replace(",", " ,").split()
    out = []
    for i, w in enumerate(words):
        if w == ",":
            out.append(",")
        elif w.replace(".", "") == "dc":
            out.append("D.C.")
        elif w in small and i > 0:
            out.append(w)
        else:
            out.append(w.capitalize())
    return " ".join(out).replace(" ,", ",")


# Estaciones con coordenadas inconsistentes en la fuente (el municipio/departamento
# declarado no corresponde a la posición: la estación queda a cientos de km).
# Revisar en futuras regeneraciones por si el IGAC corrige el dato.
EXCLUDE = {"CALE", "CCBN", "NPRA", "PLRI", "VPAC"}


def build() -> str:
    print("· listado de estaciones IGAC…")
    lst = get_json("/estaciones")
    lst = [
        s for s in lst
        if s.get("estado") in ("Activa", "Inactiva") and s["identificador"] not in EXCLUDE
    ]
    print(f"  {len(lst)} estaciones (activas + inactivas)")
    print("· velocidades NGL/MIDAS…")
    vel = load_velocities()
    print(f"  {len(vel)} estaciones con velocidad en el recuadro de Colombia")

    rows = []
    matched_vel = 0
    for i, s in enumerate(lst, 1):
        tid = s["t_id"]
        try:
            rec = get_json(f"/estacion/{tid}")[0]["datos"][0]
        except Exception as e:  # noqa: BLE001
            print(f"  ! {s['identificador']} (t_id {tid}): {e}", file=sys.stderr)
            continue
        lat = rec.get("estacion_latitud")
        lon = rec.get("estacion_longitud")
        if lat in (None, 0) or lon in (None, 0):
            print(f"  ! {s['identificador']}: sin coordenadas — omitida", file=sys.stderr)
            continue
        redes = [r.strip() for r in (fix(rec.get("redes")) or "").split(",") if r.strip()]

        def num(key, nd):
            v = rec.get(key)
            return round(float(v), nd) if v not in (None, "", 0) else None

        xyz = [rec.get(k) for k in ("x", "y", "z")]

        # Velocidad: emparejar por id de 4 letras y confirmar por cercanía (<0.1°).
        vel_neu = None
        v = vel.get(s["identificador"])
        if v:
            vn, ve, vu, rlat, rlon = v
            if abs(rlat - float(lat)) < 0.1 and abs(rlon - float(lon)) < 0.1:
                vel_neu = [round(vn, 5), round(ve, 5), round(vu, 5)]
                matched_vel += 1

        rows.append({
            "id": s["identificador"],
            "tId": tid,
            "name": titlecase_place(rec.get("municipio") or s["municipio"].split(",")[-1]),
            "department": titlecase_place(rec.get("departamento") or ""),
            "daneCode": rec.get("codigo"),
            "domes": rec.get("numero_domo_iers"),
            "lat": round(float(lat), 7),
            "lon": round(float(lon), 7),
            "heightM": num("estacion_altura_elipsoidal", 3),
            "xyz": [round(float(v), 4) for v in xyz] if all(v not in (None, "", 0) for v in xyz) else None,
            "datum": str(rec.get("datum")) if rec.get("datum") else None,
            "arpHeightM": num("altura_referencia_antena", 4),
            "order": int(s["orden"]),
            "status": "active" if s["estado"] == "Activa" else "inactive",
            "networks": redes,
            "operator": fix(rec.get("agencia_sigla") or s.get("sigla") or ""),
            "receiver": fix(rec.get("receptor_modelo") or "") or None,
            "antenna": fix(rec.get("antena_modelo") or "") or None,
            "materialized": rec.get("fecha_materializacion"),
            "sampleRateS": rec.get("tasa_muestreo"),
            "velNEU": vel_neu,
        })
        if i % 40 == 0:
            print(f"  … {i}/{len(lst)}")
        time.sleep(0.1)

    print(f"  {matched_vel} estaciones con velocidad emparejada")
    rows.sort(key=lambda r: r["id"])
    return render(rows)


def render(rows: list[dict]) -> str:
    active = sum(1 for r in rows if r["status"] == "active")
    o0 = sum(1 for r in rows if r["order"] == 0)
    today = datetime.date.today().isoformat()

    def lit(r: dict) -> str:
        def s(v):
            return "null" if v is None else "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"
        def n(v):
            return "null" if v is None else str(v)
        nets = ", ".join("'" + x.replace("'", "\\'") + "'" for x in r["networks"])
        arr = lambda a: "null" if a is None else "[" + ", ".join(str(v) for v in a) + "]"
        return (
            f"  {{ id: '{r['id']}', tId: {r['tId']}, name: {s(r['name'])}, "
            f"department: {s(r['department'])}, daneCode: {s(r['daneCode'])}, domes: {s(r['domes'])}, "
            f"lat: {r['lat']}, lon: {r['lon']}, heightM: {n(r['heightM'])}, "
            f"xyz: {arr(r['xyz'])}, datum: {s(r['datum'])}, arpHeightM: {n(r['arpHeightM'])}, "
            f"velNEU: {arr(r['velNEU'])}, "
            f"order: {r['order']}, status: '{r['status']}', networks: [{nets}], "
            f"operator: {s(r['operator'])}, receiver: {s(r['receiver'])}, antenna: {s(r['antenna'])}, "
            f"materialized: {s(r['materialized'])}, sampleRateS: {n(r['sampleRateS'])} }},"
        )

    body = "\n".join(lit(r) for r in rows)
    return f'''/**
 * Red Geodésica Nacional Activa (MAGNA-ECO) del IGAC.
 *
 * ARCHIVO GENERADO — no editar a mano. Regenerar con:
 *   python scripts/build-stations.py
 *
 * Generado: {today}  ·  {len(rows)} estaciones ({active} activas · {o0} de orden 0)
 *
 * Fuente: API del Centro de Control Geodésico del IGAC
 *   https://ccg.igac.gov.co/api/estaciones  ·  .../api/estacion/<tId>
 * Coordenadas oficiales en MAGNA-SIRGAS (EPSG:4686). `order` es la clasificación
 * oficial del IGAC (0 = operación continua del marco; 1 = densificación).
 */

export interface GnssStation {{
  /** Identificador de 4 caracteres. */
  id: string
  /** Id numérico interno del IGAC (para enlaces de RINEX y estado). */
  tId: number
  /** Municipio. */
  name: string
  /** Departamento. */
  department: string
  /** Código DANE del municipio. */
  daneCode: string | null
  /** Número DOMES / IERS. */
  domes: string | null
  lat: number
  lon: number
  /** Altura elipsoidal (m). */
  heightM: number | null
  /** Coordenadas geocéntricas oficiales [X, Y, Z] en metros. */
  xyz: [number, number, number] | null
  /** Código EPSG del datum (4686 = MAGNA-SIRGAS). */
  datum: string | null
  /** Altura del punto de referencia de la antena (ARP), en metros. */
  arpHeightM: number | null
  /**
   * Velocidad [Norte, Este, Arriba] en m/año, marco IGS14 (≈ ITRF2014).
   * Fuente: MIDAS del Nevada Geodetic Laboratory — aproximada; la oficial
   * está en la solución multianual de SIRGAS.
   */
  velNEU: [number, number, number] | null
  /** Orden geodésico oficial IGAC. */
  order: 0 | 1
  status: 'active' | 'inactive'
  /** Redes a las que pertenece (MAGNA-ECO, GeoRED, IGS, …). */
  networks: string[]
  /** Sigla de la entidad operadora. */
  operator: string
  receiver: string | null
  antenna: string | null
  /** Fecha de materialización (ISO). */
  materialized: string | null
  /** Tasa de muestreo publicada (s). */
  sampleRateS: number | null
}}

export const STATIONS: GnssStation[] = [
{body}
]

export const ACTIVE_STATIONS = STATIONS.filter((s) => s.status === 'active')

/** Enlace a la página de descarga de RINEX del IGAC para una estación. */
export function rinexPageUrl(s: Pick<GnssStation, 'id' | 'tId'>): string {{
  return `https://redgeodesica.igac.gov.co/rinex.html?id=${{s.tId}}&identificador=${{s.id}}`
}}
'''


if __name__ == "__main__":
    ts = build()
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(ts)
    print(f"[ok] {OUT}")
