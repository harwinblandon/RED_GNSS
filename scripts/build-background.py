#!/usr/bin/env python3
"""
Genera `src/assets/fondo-geodesia.svg`: ilustración de fondo de la app con
curvas de nivel de un relieve sintético, una red de vértices geodésicos
triangulada (Delaunay) y órbitas de satélites GNSS.

El SVG es monocromo (negro sobre transparente) porque la app lo usa como
máscara CSS y le pone el color según el tema claro/oscuro.

Uso:  python scripts/build-background.py      (requiere numpy y contourpy)
"""
from __future__ import annotations
import math
import numpy as np
import contourpy

W, H = 1600, 1000
OUT = "src/assets/fondo-geodesia.svg"
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- relieve
xs = np.linspace(0, W, 241)
ys = np.linspace(0, H, 151)
X, Y = np.meshgrid(xs, ys)
Z = np.zeros_like(X)
for _ in range(14):
    cx, cy = rng.uniform(-100, W + 100), rng.uniform(-100, H + 100)
    sx, sy = rng.uniform(140, 420), rng.uniform(120, 360)
    amp = rng.uniform(-1, 1.6)
    Z += amp * np.exp(-(((X - cx) / sx) ** 2 + ((Y - cy) / sy) ** 2))
Z += 0.35 * np.sin(X / 260) * np.cos(Y / 210)

gen = contourpy.contour_generator(X, Y, Z)
paths = []
levels = np.linspace(Z.min(), Z.max(), 26)[1:-1]
for k, lev in enumerate(levels):
    for line in gen.lines(lev):
        if len(line) < 6:
            continue
        line = line[:: 2] if len(line) > 40 else line
        d = "M" + " L".join(f"{x:.0f},{y:.0f}" for x, y in line)
        w = 1.4 if k % 5 == 0 else 0.7  # curvas índice más gruesas
        paths.append(f'<path d="{d}" stroke-width="{w}"/>')

# ---------------------------------------------------- red geodésica (Delaunay)
pts = []
while len(pts) < 34:
    p = (rng.uniform(60, W - 60), rng.uniform(60, H - 60))
    if all(math.dist(p, q) > 150 for q in pts):
        pts.append(p)


def delaunay(points):
    """Bowyer–Watson sencillo (pocos puntos)."""
    big = [(-1e5, -1e5), (1e5, -1e5), (0, 1e5)]
    allp = points + big
    tris = [(len(points), len(points) + 1, len(points) + 2)]

    def circ(t):
        (ax, ay), (bx, by), (cx, cy) = (allp[i] for i in t)
        d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        ux = ((ax**2 + ay**2) * (by - cy) + (bx**2 + by**2) * (cy - ay) + (cx**2 + cy**2) * (ay - by)) / d
        uy = ((ax**2 + ay**2) * (cx - bx) + (bx**2 + by**2) * (ax - cx) + (cx**2 + cy**2) * (bx - ax)) / d
        return ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2

    for i, p in enumerate(points):
        bad = [t for t in tris if (lambda c: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 < c[2])(circ(t))]
        edges = {}
        for t in bad:
            for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                k = tuple(sorted(e))
                edges[k] = edges.get(k, 0) + 1
        tris = [t for t in tris if t not in bad]
        for (a, b), n in edges.items():
            if n == 1:
                tris.append((a, b, i))
    return [t for t in tris if all(v < len(points) for v in t)]


edges = set()
for t in delaunay(pts):
    for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        if math.dist(pts[a], pts[b]) < 420:
            edges.add(tuple(sorted((a, b))))
net = [f'<line x1="{pts[a][0]:.0f}" y1="{pts[a][1]:.0f}" x2="{pts[b][0]:.0f}" y2="{pts[b][1]:.0f}"/>' for a, b in edges]
marks = []
for x, y in pts:
    s = 7
    marks.append(f'<path d="M{x:.0f},{y - s:.0f} L{x + s * 0.87:.0f},{y + s * 0.5:.0f} L{x - s * 0.87:.0f},{y + s * 0.5:.0f} Z"/>')
    marks.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="13" fill="none" stroke-width="0.8"/>')

# ------------------------------------------------------------- órbitas GNSS
orbits = []
for cx, cy, rx, ry, rot in [(1310, 170, 300, 95, -18), (1310, 170, 250, 120, 22), (1310, 170, 340, 70, 58)]:
    orbits.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({rot} {cx} {cy})" stroke-dasharray="6 7"/>')
for ang, (rx, ry, rot) in zip([30, 200, 120], [(300, 95, -18), (250, 120, 22), (340, 70, 58)]):
    a = math.radians(ang)
    x, y = rx * math.cos(a), ry * math.sin(a)
    r = math.radians(rot)
    sx, sy = 1310 + x * math.cos(r) - y * math.sin(r), 170 + x * math.sin(r) + y * math.cos(r)
    orbits.append(
        f'<g transform="translate({sx:.0f} {sy:.0f}) rotate({rot + 30})">'
        '<rect x="-5" y="-5" width="10" height="10"/>'
        '<rect x="-19" y="-3" width="12" height="6"/><rect x="7" y="-3" width="12" height="6"/></g>'
    )

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">
<g fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round" opacity="0.55">{''.join(paths)}</g>
<g stroke="#000" stroke-width="1.1" stroke-dasharray="2 5" opacity="0.9">{''.join(net)}</g>
<g fill="#000" stroke="#000" opacity="0.9">{''.join(marks)}</g>
<g fill="none" stroke="#000" stroke-width="1.2" opacity="0.9">{''.join(o for o in orbits if o.startswith('<ellipse'))}</g>
<g fill="#000">{''.join(o for o in orbits if o.startswith('<g'))}</g>
</svg>"""
with open(OUT, "w", encoding="utf-8") as f:
    f.write(svg)
print(f"{OUT}: {len(svg) / 1024:.0f} KB · {len(paths)} curvas · {len(edges)} líneas de red")
