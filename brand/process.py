#!/usr/bin/env python3
"""
Procesa brand/Logo-original.png para la app:
  - quita el fondo blanco (relleno desde los bordes, conserva el texto del recuadro)
  - recorta márgenes transparentes
  - genera public/brand/logo.png  (para tema claro)
  - genera public/brand/logo-invert.png  (para tema oscuro)

Uso:  python brand/process.py
Requiere Pillow.
"""
from collections import deque
from PIL import Image
import os

SRC = "brand/Logo-original.png"
OUT_DIR = "public/brand"
WHITE = 236  # umbral: un pixel es "fondo" si R,G,B >= WHITE

os.makedirs(OUT_DIR, exist_ok=True)
img = Image.open(SRC).convert("RGBA")
w, h = img.size
px = img.load()


def is_bg(x, y):
    r, g, b, a = px[x, y]
    return a > 0 and r >= WHITE and g >= WHITE and b >= WHITE


# Relleno por inundación desde el borde: solo el blanco conectado al exterior
seen = [[False] * h for _ in range(w)]
q = deque()
for x in range(w):
    for y in (0, h - 1):
        q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        q.append((x, y))

while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
        continue
    seen[x][y] = True
    if not is_bg(x, y):
        continue
    px[x, y] = (255, 255, 255, 0)
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

# Recorte de márgenes transparentes
bbox = img.getbbox()
img = img.crop(bbox)
img.save(os.path.join(OUT_DIR, "logo.png"))
print(f"[ok] {OUT_DIR}/logo.png  {img.size}")

# Versión invertida para tema oscuro (invierte RGB, respeta alfa)
inv = img.copy()
ip = inv.load()
iw, ih = inv.size
for y in range(ih):
    for x in range(iw):
        r, g, b, a = ip[x, y]
        if a > 0:
            ip[x, y] = (255 - r, 255 - g, 255 - b, a)
inv.save(os.path.join(OUT_DIR, "logo-invert.png"))
print(f"[ok] {OUT_DIR}/logo-invert.png  {inv.size}")
