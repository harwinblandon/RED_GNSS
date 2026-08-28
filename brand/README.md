# Marca — H_TOPOGRAFÍA

- `Logo-original.png` — logotipo entregado por el usuario (fondo blanco).
- `process.py` — quita el fondo (relleno desde los bordes, conserva el texto del
  recuadro), recorta márgenes y genera:
  - `public/brand/logo.png` — para tema claro
  - `public/brand/logo-invert.png` — RGB invertido, para tema oscuro
- `remove-bg.py` — utilidad simple de fondo blanco → transparente (alternativa).

`src/components/Logo.tsx`:
- `LogoFull` usa los PNG anteriores (cambia según `.dark`).
- `LogoMark` es una versión vectorial simplificada del globo (espacios mínimos).

Regenerar tras cambiar el original:
```bash
python brand/process.py
```

El favicon vectorial está en `public/favicon.svg`. Los colores del logo vectorial
salen de las variables `--logo-*` en `src/index.css`.
