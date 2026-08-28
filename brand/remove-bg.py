#!/usr/bin/env python3
"""Hace transparente el fondo (casi) blanco de una imagen.

Uso:  python brand/remove-bg.py entrada.png salida.png [umbral]

Requiere Pillow:  pip install pillow
"""
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "brand/logo-original.png"
dst = sys.argv[2] if len(sys.argv) > 2 else "brand/logo.png"
threshold = int(sys.argv[3]) if len(sys.argv) > 3 else 245

img = Image.open(src).convert("RGBA")
px = img.load()
w, h = img.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if r >= threshold and g >= threshold and b >= threshold:
            px[x, y] = (r, g, b, 0)
img.save(dst)
print(f"[ok] {dst}  ({w}x{h})")
