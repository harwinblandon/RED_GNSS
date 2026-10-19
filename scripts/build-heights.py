#!/usr/bin/env python3
"""
Genera los datos del módulo de alturas (/alturas):

- `public/geoid/qgeoidcol2023.json` — cuasigeoide oficial QGeoidCOL2023
  (Resolución IGAC 515 de 2026, licencia CC BY 4.0). Anomalía de altura ζ en
  una rejilla de 5'; sistema de marea cero, elipsoide GRS80.
- `public/geoid/geocol2004.json` — geoide GEOCOL2004 (2'), vigente durante la
  transición hasta mayo de 2027. Fuente: International Service for the Geoid.
- `public/leveling.json` — placas de la Red Vertical (nivelación) del IGAC con
  posición. Si la placa también está en la Red Pasiva con altura elipsoidal,
  se agrega `h`: esos son los puntos GNSS/nivelación con los que la app estima
  el desfase local entre el cuasigeoide y la red de nivelación.

Formato de rejilla: {"lat0","lon0" (esquina SO), "dlat","dlon","nrows","ncols",
"scale", "data": enteros fila por fila desde el sur}. valor = data · scale (m).

Uso:  python scripts/build-heights.py      (sin dependencias externas)
"""
from __future__ import annotations
import datetime, json, os, urllib.request

QGEOID_URL = "https://redgeodesica.igac.gov.co/documentos/QGeoidCOL2023.txt"
GEOCOL04_URL = "https://www.isgeoid.polimi.it/Geoid/America/Colombia/public/GEOCOL2004_20191118.isg"
VERTICAL_URL = "https://redgeodesica-cg.igac.gov.co:8080/api/rastreo/estaciones?red=vertical"
PASSIVE_JSON = "public/vertices.json"  # de scripts/build-vertices.py (tiene h elipsoidal)
UA = {"User-Agent": "build-heights.py (proyecto GNSS-IGAC)"}
TODAY = datetime.date.today().isoformat()


def get(url: str, timeout: int = 180) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def write(path: str, doc: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {path}: {os.path.getsize(path) / 1024:.0f} KB")


def qgeoid() -> None:
    rows = [tuple(map(float, l.split())) for l in get(QGEOID_URL).decode().splitlines() if l.strip()]
    lats = sorted({round(r[0], 6) for r in rows})
    lons = sorted({round(r[1], 6) for r in rows})
    idx = {(round(a, 6), round(b, 6)): c for a, b, c in rows}
    data = [round(idx[(la, lo)] * 1000) for la in lats for lo in lons]
    write("public/geoid/qgeoidcol2023.json", {
        "model": "QGeoidCOL2023", "kind": "quasigeoid", "tide": "zero", "ellipsoid": "GRS80",
        "source": QGEOID_URL, "license": "CC BY 4.0 · IGAC (Resolución 515 de 2026)",
        "generated": TODAY,
        "lat0": lats[0], "lon0": lons[0],
        "dlat": round((lats[-1] - lats[0]) / (len(lats) - 1), 9),
        "dlon": round((lons[-1] - lons[0]) / (len(lons) - 1), 9),
        "nrows": len(lats), "ncols": len(lons), "scale": 0.001, "data": data,
    })


def geocol2004() -> None:
    text = get(GEOCOL04_URL).decode("latin-1")
    head, body = text.split("end_of_head", 1)
    h = {}
    for line in head.splitlines():
        for sep in ("=", ":"):
            if sep in line:
                k, v = line.split(sep, 1)
                h[k.strip()] = v.strip()
                break
    nrows, ncols = int(h["nrows"]), int(h["ncols"])
    vals = [float(v) for v in body.split("\n", 1)[1].split()]
    assert len(vals) == nrows * ncols
    # ISG: primera fila = norte. Se invierte para empezar por el sur.
    grid = [vals[r * ncols:(r + 1) * ncols] for r in range(nrows)][::-1]
    data = [round(v * 100) for row in grid for v in row]
    dlat, dlon = float(h["delta lat"]), float(h["delta lon"])
    lat0, lon0 = float(h["lat min"]), float(h["lon min"])
    # Si (max − min) = n · delta, la rejilla está registrada por celda: los
    # valores corresponden al centro de cada celda (medio paso hacia adentro).
    if abs((float(h["lat max"]) - lat0) / dlat - nrows) < 0.01:
        lat0 += dlat / 2
    if abs((float(h["lon max"]) - lon0) / dlon - ncols) < 0.01:
        lon0 += dlon / 2
    write("public/geoid/geocol2004.json", {
        "model": "GEOCOL2004", "kind": "geoid", "ellipsoid": "GRS80",
        "source": GEOCOL04_URL, "license": "International Service for the Geoid (ISG)",
        "generated": TODAY,
        "lat0": round(lat0, 9), "lon0": round(lon0, 9),
        "dlat": dlat, "dlon": dlon,
        "nrows": nrows, "ncols": ncols, "scale": 0.01, "data": data,
    })


COORD = {"CALCULADA": 1, "APROXIMADA": 0}
STATE = {"MATERIALIZADO": 1, "DESTRUIDO": 0}


def leveling() -> None:
    vertical = json.loads(get(VERTICAL_URL))["data"]
    with open(PASSIVE_JSON, encoding="utf-8") as f:
        passive = {r[0]: r for r in json.load(f)["vertices"] if r[3] is not None}
    out = []
    for r in vertical:
        if r.get("latitud") is None or r.get("altura_msnmm") is None:
            continue
        p = passive.get(r["identificador"])
        # Con h elipsoidal se usa la posición de la Red Pasiva (más precisa).
        lat, lon = (p[1], p[2]) if p else (r["latitud"], r["longitud"])
        out.append([
            r["identificador"], round(lat, 6), round(lon, 6),
            round(r["altura_msnmm"], 3), round(p[3], 3) if p else None,
            COORD.get(r.get("tipo_coord"), 0), STATE.get(r.get("est_vertice"), 2),
            r.get("municipio") or "", r.get("departamento") or "",
        ])
    write("public/leveling.json", {
        "generated": TODAY, "source": VERTICAL_URL,
        "fields": ["id", "lat", "lon", "H", "h", "coordCalculada", "estado", "municipio", "departamento"],
        "note": "H nivelada (datum vertical Buenaventura); h elipsoidal MAGNA-SIRGAS de la Red Pasiva. "
                "estado: 1 materializado, 0 destruido, 2 sin dato.",
        "points": out,
    })
    print(f"  placas: {len(out)} · con h (GNSS/nivelación): {sum(1 for o in out if o[4] is not None)}")


if __name__ == "__main__":
    print("QGeoidCOL2023…"); qgeoid()
    print("GEOCOL2004…"); geocol2004()
    print("Red vertical…"); leveling()
