# Marca — H_TOPOGRAFÍA

- `Logo-original.png` — logotipo entregado por el usuario.
- `public/brand/logo.png` — copia que usa la app (`src/components/Logo.tsx` → `LogoFull`).

El logo se muestra sobre una **placa blanca** en ambos temas (está diseñado para
fondo claro; así queda legible también sobre la barra oscura). Para cambiarlo,
reemplaza `public/brand/logo.png`.

`remove-bg.py` / `process.py` quedan como utilidades por si en el futuro se quiere
una versión con fondo transparente.

El favicon vectorial está en `public/favicon.svg`.

## Marca personal «H»

- `H.jpg` — monograma personal del autor (blanco sobre negro), original.
- `public/brand/h-mark.png` — recorte blanco con fondo transparente (240 px de alto)
  que firma la pantalla de bienvenida («by H», en `index.html`).

## App instalable

Íconos de la PWA en `public/pwa/` (globo del favicon sobre `#101216`, 512/192/180 px)
y manifest en `public/manifest.webmanifest`.
