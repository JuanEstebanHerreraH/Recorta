# Reglas del proyecto para asistentes de IA

Recorta es una app para quitar fondos y exportar imágenes con tamaño, DPI y peso correctos.
React 19 + TypeScript + Vite; IA local con Transformers.js (WebGPU o WebAssembly) en un Web Worker;
app de escritorio con Tauri 2. Mapa del código: `docs/ARQUITECTURA.md`.

## Comandos

- `npm run dev`: app en http://localhost:5173
- `npm run check`: tipos + pruebas + compilación. Debe pasar antes de dar un cambio por terminado.
- `npm test`: solo pruebas (Vitest, carpeta `tests/`)

## Reglas

1. La imagen original nunca se modifica: los cambios van a la máscara (`doc.mask`) y se registran
   con `commitMask(nombre, detalle)` para que aparezcan en el historial.
2. El trabajo pesado (bucles sobre píxeles) va en `src/imaging/` y se ejecuta en el worker de imagen
   a través de `getImaging().call(...)`. La IA va en `src/ai/handlers.ts` (worker de IA).
3. Si transfieres un buffer a un worker (`transfer: [x.buffer]`), no lo uses después sin copiarlo antes.
4. Textos de la interfaz en español neutro, tuteo, frases cortas y concretas. Los errores dicen qué pasó
   y qué hacer, sin disculpas.
5. Estilos solo en `src/styles/app.css`, usando las variables existentes (modo oscuro y claro).
6. Nada desde CDN ni otros sitios: todo se instala con npm. La app debe funcionar sin internet.
7. Rutas relativas (la app vive en subcarpetas como GitHub Pages). Para la carpeta pública usa
   `publicBaseUrl()` de `src/config.ts`.
8. Nunca pongas secretos en variables `VITE_`: quedan públicas dentro de la app.
9. Si cambias un modelo de IA: actualiza `src/ai/models.ts`, `scripts/download-models.mjs` y
   `docs/LICENCIAS.md` (revisa la licencia antes).
10. No borres ni debilites pruebas para que pasen. Si agregas lógica, agrega su prueba en `tests/`.
11. Cambios mínimos: toca solo lo necesario para el pedido.
12. Si agregas o cambias una función visible, actualiza `docs/FUNCIONES.md`.
