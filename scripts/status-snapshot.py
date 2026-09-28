#!/usr/bin/env python3
"""
Genera, para cada estación activa de la Red MAGNA-ECO:

- `public/stations-status.json` — fecha del último archivo RINEX publicado.
  La app lo carga como estado inicial del panel /estado.
- `public/stations-history.json` — días con archivo de observación en los
  últimos HISTORY_DAYS días, como mapa de bits en hexadecimal (bit más
  significativo primero; el primer bit es el día `start`). Base del panel
  /historico.

Ambos salen del mismo listado `/api/rinex?id=<tId>`, así que no hay coste de
red adicional. Pensado para correr en una GitHub Action programada.

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
HISTORY_OUT = "public/stations-history.json"
HISTORY_DAYS = 365
UA = {"User-Agent": "status-snapshot.py (proyecto GNSS-IGAC)"}
DATE_RE = re.compile(r'"a.o":(\d{4}),"dia_del_a.o":"(\d{1,3})"')
# Igual, pero solo archivos de observación (los navegados no cuentan como dato).
OBS_RE = re.compile(r'"a.o":(\d{4}),"dia_del_a.o":"(\d{1,3})"[^{}]*?"tipo_rinex":"Observado"')


def get(path: str, timeout: int = 120) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(API + path, headers=UA), timeout=timeout
    ).read()


def iso_from_year_doy(year: int, doy: int) -> str:
    return (datetime.date(year, 1, 1) + datetime.timedelta(days=doy - 1)).isoformat()


def latest_for(station: dict) -> tuple[str, dict, set[str] | None]:
    tid = station["t_id"]
    try:
        text = get(f"/rinex?id={tid}").decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        print(f"  ! {station['identificador']}: {e}", file=sys.stderr)
        return station["identificador"], {"lastDate": None, "files": 0}, None
    best = -1
    count = 0
    for m in DATE_RE.finditer(text):
        count += 1
        key = int(m.group(1)) * 1000 + int(m.group(2))
        best = max(best, key)
    last = iso_from_year_doy(best // 1000, best % 1000) if best > 0 else None
    obs_days = {
        iso_from_year_doy(int(m.group(1)), int(m.group(2))) for m in OBS_RE.finditer(text)
    }
    return station["identificador"], {"lastDate": last, "files": count}, obs_days


def bitmap_hex(days: set[str], start: datetime.date, n: int) -> str:
    """Mapa de bits de `n` días desde `start` (MSB primero), en hexadecimal."""
    bits = 0
    for i in range(n):
        bits <<= 1
        if (start + datetime.timedelta(days=i)).isoformat() in days:
            bits |= 1
    pad = (-n) % 4  # completa el último dígito hexadecimal con ceros
    return format(bits << pad, "0%dx" % ((n + pad) // 4))


# Mismas exclusiones que build-stations.py (coordenadas inconsistentes en la fuente).
EXCLUDE = {"CALE", "CCBN", "NPRA", "PLRI", "VPAC"}


def main() -> None:
    stations = json.loads(get("/estaciones"))
    active = [
        s for s in stations
        if s.get("estado") == "Activa" and s["identificador"] not in EXCLUDE
    ]
    print(f"· {len(active)} estaciones activas", file=sys.stderr)

    result: dict[str, dict] = {}
    obs: dict[str, set[str]] = {}
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for i, (ident, info, days) in enumerate(ex.map(latest_for, active), 1):
            result[ident] = info
            if days is not None:
                obs[ident] = days
            if i % 25 == 0:
                print(f"  … {i}/{len(active)}", file=sys.stderr)

    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "generated": now.isoformat(timespec="seconds"),
        "source": "https://ccg.igac.gov.co/api/rinex",
        "stations": dict(sorted(result.items())),
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    fresh = sum(1 for v in result.values() if v["lastDate"])
    print(f"[ok] {OUT} — {fresh}/{len(result)} con fecha", file=sys.stderr)

    # Estaciones cuya consulta falló: se conserva su fila del histórico anterior
    # en lugar de publicarla vacía (sería una caída falsa).
    end = now.date() - datetime.timedelta(days=1)
    start = end - datetime.timedelta(days=HISTORY_DAYS - 1)
    history = {ident: bitmap_hex(days, start, HISTORY_DAYS) for ident, days in obs.items()}
    try:
        with open(HISTORY_OUT, encoding="utf-8") as fh:
            prev = json.load(fh)
        for ident, hexbits in prev["stations"].items():
            if ident in history or ident not in result:
                continue
            n = prev["days"]
            bits = int(hexbits, 16) >> ((-n) % 4)
            old = {
                (datetime.date.fromisoformat(prev["start"]) + datetime.timedelta(days=i)).isoformat()
                for i in range(n) if bits >> (n - 1 - i) & 1
            }
            history[ident] = bitmap_hex(old, start, HISTORY_DAYS)
            print(f"  · {ident}: se conserva el histórico previo", file=sys.stderr)
    except (OSError, ValueError, KeyError):
        pass

    hist_payload = {
        "generated": payload["generated"],
        "source": payload["source"],
        "start": start.isoformat(),
        "days": HISTORY_DAYS,
        "stations": dict(sorted(history.items())),
    }
    with open(HISTORY_OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(hist_payload, fh, ensure_ascii=False, indent=0)
    print(f"[ok] {HISTORY_OUT} — {len(history)} estaciones × {HISTORY_DAYS} días", file=sys.stderr)


if __name__ == "__main__":
    main()
