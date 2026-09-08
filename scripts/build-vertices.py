#!/usr/bin/env python3
"""
Regenera `public/vertices.json` — Red Geodésica Pasiva del IGAC (mojones/placas
de control de órdenes 2, 3 y 4).

Uso:  python scripts/build-vertices.py

Fuente: API del Centro de Control Geodésico del IGAC (CORS abierto).
  - Listado:  https://ccg.igac.gov.co/api/vertices   (X/Y/Z geocéntricas)
  - Reseña:   https://ccg.igac.gov.co/api/descargar/<identificador>.pdf

Formato de salida (compacto, arrays):
  [identificador, lat, lon, altura_elip, municipio, departamento, estado, pdf]
  estado: 1 = Materializado, 0 = Destruido/otro   ·   pdf: 1 = tiene reseña
"""
from __future__ import annotations
import json, math, urllib.request

API = "https://ccg.igac.gov.co/api/vertices"
OUT = "public/vertices.json"

_A = 6378137.0
_F = 1 / 298.257222101
_E2 = _F * (2 - _F)


def ecef_to_geodetic(x: float, y: float, z: float) -> tuple[float, float, float]:
    lon = math.atan2(y, x)
    p = math.hypot(x, y)
    lat = math.atan2(z, p * (1 - _E2))
    h = 0.0
    for _ in range(10):
        n = _A / math.sqrt(1 - _E2 * math.sin(lat) ** 2)
        h = p / math.cos(lat) - n
        lat = math.atan2(z, p * (1 - _E2 * n / (n + h)))
    return math.degrees(lat), math.degrees(lon), h


def split_place(municipio: str) -> tuple[str, str]:
    parts = [p.strip() for p in (municipio or "").split(",")]
    if len(parts) >= 2:
        return _title(parts[1]), _title(parts[0])  # municipio, departamento
    return _title(municipio), ""


_SMALL = {"de", "del", "la", "las", "los", "y", "e"}


def _title(s: str) -> str:
    out = []
    for i, w in enumerate(s.lower().split()):
        out.append(w if (w in _SMALL and i) else w.capitalize())
    return " ".join(out)


def main() -> None:
    print("· descargando el listado de vértices…")
    raw = json.loads(urllib.request.urlopen(API, timeout=120).read().decode("utf-8", "replace"))
    print(f"  {len(raw)} vértices")

    rows = []
    for v in raw:
        try:
            x, y, z = float(v["x"]), float(v["y"]), float(v["z"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (x or y or z):
            continue
        lat, lon, h = ecef_to_geodetic(x, y, z)
        if not (-4.5 <= lat <= 16 and -82 <= lon <= -66):
            continue
        munic, dept = split_place(v.get("municipio", ""))
        rows.append([
            v["identificador"],
            round(lat, 6),
            round(lon, 6),
            round(h, 2),
            munic,
            dept,
            1 if v.get("estado") == "Materializado" else 0,
            1 if v.get("pdf") else 0,
        ])

    rows.sort(key=lambda r: r[0])
    payload = {
        "generated": __import__("datetime").date.today().isoformat(),
        "source": "https://ccg.igac.gov.co/api/vertices",
        "fields": ["id", "lat", "lon", "h", "municipio", "departamento", "materializado", "pdf"],
        "vertices": rows,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    mat = sum(1 for r in rows if r[6])
    print(f"[ok] {OUT} — {len(rows)} vértices ({mat} materializados)")


if __name__ == "__main__":
    main()
