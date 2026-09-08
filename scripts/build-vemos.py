#!/usr/bin/env python3
"""
Regenera `public/vemos2022.json` — subconjunto de Colombia del modelo de
velocidades VEMOS2022 de SIRGAS.

Uso:  python scripts/build-vemos.py

Fuente: https://www.sirgas.org/fileadmin/docs/VEMOS2022.TXT
  VEMOS2022 · SIRGAS Analysis Centre at DGFI-TUM · marco ITRF2020 ·
  intervalo 2017.1–2022.0. Rejilla 1°×1°.
  Cita: Sánchez L., Drewes H., Kehm A., Seitz M. (2022), J. Geod. Sci. 12(1),
  92–119, https://doi.org/10.1515/jogs-2022-0138

Columnas del archivo: lat, lon, v_N [m/a], v_E [m/a], σ_N, σ_E
Salida (compacta): [lat, lon, vN_mm, vE_mm]  (velocidades en mm/año)
"""
from __future__ import annotations
import datetime, json, re, urllib.request

URL = "https://www.sirgas.org/fileadmin/docs/VEMOS2022.TXT"
OUT = "public/vemos2022.json"
# Recuadro amplio de Colombia (con margen para interpolar en los bordes).
LAT_MIN, LAT_MAX = -5.0, 15.0
LON_MIN, LON_MAX = -82.0, -66.0

ROW = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d\S*)\s+(-?\d\S*)")


def main() -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": "build-vemos.py"})
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
        "model": "VEMOS2022",
        "frame": "ITRF2020",
        "timespan": "2017.1-2022.0",
        "source": URL,
        "citation": "Sánchez et al. (2022), J. Geod. Sci. 12(1), 92-119, doi:10.1515/jogs-2022-0138",
        "generated": datetime.date.today().isoformat(),
        "units": "mm/a",
        "fields": ["lat", "lon", "vN", "vE"],
        "grid": grid,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[ok] {OUT} — {len(grid)} nodos de la rejilla")


if __name__ == "__main__":
    main()
