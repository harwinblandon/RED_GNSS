#!/usr/bin/env python3
"""
Regenera `public/vemos2017.json` y `public/vemos2022.json` — subconjuntos de
Colombia de los modelos de velocidades VEMOS de SIRGAS.

Uso:  python scripts/build-vemos.py

Fuentes (SIRGAS Analysis Centre at DGFI-TUM, rejillas 1°×1°):
  VEMOS2022 · ITRF2020 · 2017.1–2022.0 · Sánchez et al. (2022), J. Geod. Sci.
    12(1), 92–119, https://doi.org/10.1515/jogs-2022-0138
  VEMOS2017 · IGS14/ITRF2014 · 2014.0–2017.1 · Drewes & Sánchez (2020),
    https://doi.org/10.1594/PANGAEA.912350

Columnas del archivo: lat, lon, v_N [m/a], v_E [m/a], σ_N, σ_E
Salida (compacta): [lat, lon, vN_mm, vE_mm]  (velocidades en mm/año)
"""
from __future__ import annotations
import datetime, json, re, urllib.request

MODELS = {
    "VEMOS2022": dict(url="https://www.sirgas.org/fileadmin/docs/VEMOS2022.TXT", frame="ITRF2020", timespan="2017.1-2022.0",
                      citation="Sánchez et al. (2022), J. Geod. Sci. 12(1), 92-119, doi:10.1515/jogs-2022-0138"),
    "VEMOS2017": dict(url="https://www.sirgas.org/fileadmin/docs/VEMOS2017.TXT", frame="IGS14/ITRF2014", timespan="2014.0-2017.1",
                      citation="Drewes H., Sánchez L. (2020), VEMOS2017, doi:10.1594/PANGAEA.912350"),
}
# Recuadro amplio de Colombia (con margen para interpolar en los bordes).
LAT_MIN, LAT_MAX = -5.0, 15.0
LON_MIN, LON_MAX = -82.0, -66.0

ROW = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d\S*)\s+(-?\d\S*)")


def build(model: str, url: str, frame: str, timespan: str, citation: str) -> None:
    out = f"public/{model.lower()}.json"
    req = urllib.request.Request(url, headers={"User-Agent": "build-vemos.py"})
    text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

    grid = []
    for line in text.splitlines():
        m = ROW.match(line)
        if not m:
            continue
        lat, lon, vn, ve = (float(m.group(i)) for i in range(1, 5))
        if LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
            grid.append([lat, lon, round(vn * 1000, 2), round(ve * 1000, 2)])

    grid.sort(key=lambda r: (r[0], r[1]))
    payload = {
        "model": model,
        "frame": frame,
        "timespan": timespan,
        "source": url,
        "citation": citation,
        "generated": datetime.date.today().isoformat(),
        "units": "mm/a",
        "fields": ["lat", "lon", "vN", "vE"],
        "grid": grid,
    }
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[ok] {out} — {len(grid)} nodos de la rejilla")


if __name__ == "__main__":
    for name, m in MODELS.items():
        build(name, **m)
