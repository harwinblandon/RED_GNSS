#!/usr/bin/env python3
"""
Genera `public/gnss-orbits.json`: elementos orbitales (TLE) de los satélites
operativos de GPS, GLONASS, Galileo y BeiDou, desde CelesTrak.

La app los propaga con SGP4 para estimar visibilidad y DOP en la planeación
(ventana horaria óptima). La precisión de un TLE (unos km) sobra para eso.
El navegador intenta primero CelesTrak en vivo; este archivo es el respaldo
cuando CelesTrak no responde o limita las descargas.

Uso:
    python scripts/gnss-orbits.py

Sin dependencias externas. Pensado para correr en la GitHub Action diaria.
"""
from __future__ import annotations
import datetime, json, sys, urllib.request

OUT = "public/gnss-orbits.json"
URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"
GROUPS = {"G": "gps-ops", "R": "glo-ops", "E": "galileo", "C": "beidou"}
UA = {"User-Agent": "gnss-orbits.py (proyecto GNSS-IGAC)"}


def fetch(group: str) -> list[list[str]]:
    req = urllib.request.Request(URL.format(group=group), headers=UA)
    text = urllib.request.urlopen(req, timeout=60).read().decode("ascii", "replace")
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    sats = []
    for i in range(0, len(lines) - 2, 3):
        name, l1, l2 = lines[i].strip(), lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            sats.append([name, l1, l2])
    return sats


def main() -> int:
    out: dict[str, list[list[str]]] = {}
    for sys_id, group in GROUPS.items():
        try:
            out[sys_id] = fetch(group)
            print(f"{sys_id} ({group}): {len(out[sys_id])} satélites")
        except Exception as e:  # noqa: BLE001
            print(f"! {group}: {e}", file=sys.stderr)
    if sum(len(v) for v in out.values()) < 40:
        print("Muy pocos satélites; no se sobrescribe el archivo.", file=sys.stderr)
        return 1
    doc = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "CelesTrak GP (TLE)",
        "systems": out,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
