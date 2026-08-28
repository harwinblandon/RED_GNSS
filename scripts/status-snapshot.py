#!/usr/bin/env python3
"""
Genera `public/stations-status.json` — fecha del último archivo RINEX publicado
por cada estación activa de la Red MAGNA-ECO.

La app lo carga como estado inicial del panel /estado (sin coste de red para el
usuario). Pensado para correr en una GitHub Action programada.

Uso:
    python scripts/status-snapshot.py

Requisitos: Python 3.9+ e internet. Descarga varios MB por estación (~1 GB en
total); tarda unos minutos. Sin dependencias externas.
"""
from __future__ import annotations
import concurrent.futures as cf
import datetime, json, re, sys, urllib.request

API = "https://ccg.igac.gov.co/api"
OUT = "public/stations-status.json"
UA = {"User-Agent": "status-snapshot.py (proyecto GNSS-IGAC)"}
DATE_RE = re.compile(r'"a.o":(\d{4}),"dia_del_a.o":"(\d{1,3})"')


def get(path: str, timeout: int = 120) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(API + path, headers=UA), timeout=timeout
    ).read()


def iso_from_year_doy(year: int, doy: int) -> str:
    return (datetime.date(year, 1, 1) + datetime.timedelta(days=doy - 1)).isoformat()


def latest_for(station: dict) -> tuple[str, dict]:
    tid = station["t_id"]
    try:
        text = get(f"/rinex?id={tid}").decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        print(f"  ! {station['identificador']}: {e}", file=sys.stderr)
        return station["identificador"], {"lastDate": None, "files": 0}
    best = -1
    count = 0
    for m in DATE_RE.finditer(text):
        count += 1
        key = int(m.group(1)) * 1000 + int(m.group(2))
        best = max(best, key)
    last = iso_from_year_doy(best // 1000, best % 1000) if best > 0 else None
    return station["identificador"], {"lastDate": last, "files": count}


def main() -> None:
    stations = json.loads(get("/estaciones"))
    active = [s for s in stations if s.get("estado") == "Activa"]
    print(f"· {len(active)} estaciones activas", file=sys.stderr)

    result: dict[str, dict] = {}
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for i, (ident, info) in enumerate(ex.map(latest_for, active), 1):
            result[ident] = info
            if i % 25 == 0:
                print(f"  … {i}/{len(active)}", file=sys.stderr)

    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "https://ccg.igac.gov.co/api/rinex",
        "stations": dict(sorted(result.items())),
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    fresh = sum(1 for v in result.values() if v["lastDate"])
    print(f"[ok] {OUT} — {fresh}/{len(result)} con fecha", file=sys.stderr)


if __name__ == "__main__":
    main()
