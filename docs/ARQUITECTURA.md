# Cómo está hecho Recorta

Guía para entender el código antes de cambiarlo. Si trabajas con un asistente de IA, pásale este archivo junto con [DESARROLLO-CON-IA.md](DESARROLLO-CON-IA.md).

## La idea central

**La imagen original nunca se modifica.** Lo que el usuario edita es una **máscara**: una lista de números del 0 al 255, uno por píxel, que dice cuánto se ve ese píxel (0 = borrado, 255 = visible, valores intermedios = semitransparente).

- Quitar el fondo con IA, el gotero, los pinceles y los ajustes de borde solo cambian la máscara.
- *Quitar halo* calcula aparte una versión corregida del color de los bordes; tampoco toca el original.
- El historial guarda copias comprimidas de la máscara. Volver a un paso es restaurar esa copia.
- Al exportar se combinan original + máscara (+ color corregido), se recorta, se escala y se codifica.

Esto hace que todo sea reversible y que el historial ocupe poco: una máscara comprimida de una foto de 12 MP suele pesar unos pocos cientos de KB.

## Tecnologías

| Pieza | Qué es | Por qué |
| --- | --- | --- |
| [Vite](https://vite.dev) 8 | Servidor de desarrollo y compilador | Arranque instantáneo, recarga al guardar. |
| [React](https://react.dev) 19 + TypeScript 6 | Interfaz y lenguaje | Los tipos detectan errores antes de ejecutar (útil con código generado por IA). |
| [zustand](https://zustand.docs.pmnd.rs) 5 | Estado global | Simple: un objeto y funciones que lo cambian. |
| [Transformers.js](https://huggingface.co/docs/transformers.js) 4 + ONNX Runtime Web | IA en el navegador | Corre modelos ONNX con WebGPU (tarjeta gráfica) o WebAssembly (procesador). |
| Web Workers | Hilos aparte | La IA y el procesamiento pesado no congelan la ventana. |
| Código propio + [image-q](https://github.com/ibezkrovnyi/image-quantization), [fflate](https://github.com/101arrowz/fflate), [OxiPNG](https://github.com/jamsinclair/jSquash) | Imagen y archivos | Codificador PNG propio (para escribir DPI y la ficha), paletas PNG-8, compresión, optimización sin pérdida. |
| [Vitest](https://vitest.dev) | Pruebas automáticas | Verifican cálculos, codificación y reglas sin abrir el navegador. |
| [Tauri](https://tauri.app) 2 | App de escritorio | Empaqueta la misma app web en un `.exe` liviano que usa el motor de Edge (WebView2). |

## Mapa de carpetas

```
src/
├── main.tsx              Punto de entrada: monta <App /> y carga la fuente y los estilos
├── App.tsx               Estructura de la pantalla, atajos de teclado, pegar y arrastrar
├── config.ts             Lee las variables VITE_ del .env (con valores por defecto)
│
├── state/                ── Estado y acciones (el "cerebro" de la interfaz)
│   ├── store.ts          Estado global (zustand): imagen abierta, herramienta, ajustes, avisos…
│   ├── actions.ts        Todo lo que cambia el estado: abrir, quitar fondo, pinceles, exportar…
│   ├── history.ts        Pasos del historial (máscaras comprimidas)
│   ├── batch.ts          Modo Lote
│   └── files.ts          Decide si un archivo va al editor o al lote
│
├── ai/                   ── Inteligencia artificial
│   ├── models.ts         Catálogo de modelos: cuál usa cada nivel, peso, licencia
│   ├── client.ts         Crea el worker de IA y le indica de dónde sacar motor y modelos
│   ├── ai.worker.ts      El worker en sí (solo conecta handlers.ts)
│   └── handlers.ts       Cargar y correr modelos: quitar fondo, selección de un clic, agrandar
│
├── imaging/              ── Procesamiento de imagen (corre en su propio worker)
│   ├── handlers.ts       Operaciones que la interfaz le pide al worker
│   ├── guided.ts         Agranda la máscara de la IA siguiendo los bordes de la foto
│   ├── decontaminate.ts  Quitar halo (corrige el color del borde)
│   ├── colorkey.ts       Quitar un color de fondo (gotero)
│   ├── mask.ts           Suavizar, desplazar, endurecer, invertir, combinar máscaras
│   ├── filters.ts        Desenfoques y filtros básicos
│   ├── resample.ts       Cambio de tamaño de alta calidad (Lanczos)
│   ├── geometry.ts       Recortar bordes vacíos, márgenes, fondo de color
│   ├── quantize.ts       Paletas PNG-8 y tramado
│   ├── analyze.ts        Recomienda PNG-8 o PNG-24 según la imagen
│   ├── encode.ts         Arma el archivo final (PNG, WebP o JPG)
│   ├── png.ts            Codificador PNG propio: DPI (pHYs), sRGB, ficha (iTXt)
│   ├── jpeg.ts           DPI en archivos JPG
│   └── units.ts          Píxeles ↔ centímetros ↔ DPI, hojas de referencia
│
├── editor/               ── El lienzo
│   ├── engine.ts         Dibuja la imagen, zoom, desplazamiento, pinceles, vista de máscara
│   └── brush.ts          Cómo un trazo modifica la máscara (sin acumular dentro del trazo)
│
├── hardware/
│   ├── detect.ts         Qué tarjeta gráfica, procesador y memoria hay
│   └── tiers.ts          Niveles Alto/Medio/Bajo y sus reglas
│
├── export/
│   ├── settings.ts       Ajustes de exportación, destinos (web, imprimir…) y cálculo del tamaño final
│   └── report.ts         Texto de la ficha
│
├── workers/rpc.ts        Comunicación con los workers (pedidos, progreso, errores)
├── lib/                  Utilidades: formato de números, abrir y guardar archivos, preferencias
├── ui/                   Componentes de la interfaz
│   ├── panels/           Un panel por paso: Recortar, Refinar, Calidad, Exportar
│   ├── controls.tsx      Botones, deslizadores, interruptores… (todos los controles comunes)
│   └── …                 Barra superior, lienzo, historial, diálogo de equipo, lote
└── styles/app.css        Todos los estilos y la paleta de colores (modo oscuro y claro)
```

## Cómo viaja una imagen

```
 Archivo ──► decodeImage (lib/image-io) ──► original RGBA + máscara (store)
                                                   │
          ┌────────────────────────────────────────┼─────────────────────────────┐
          ▼                                        ▼                             ▼
   Quitar fondo con IA                      Gotero / bordes                 Pinceles
   1. copia de 2048 px como máximo          worker de imagen:               editor/engine + brush:
   2. worker de IA: modelo según nivel      colorkey, mask                  cambian la máscara
   3. máscara chica (320–1024 px)                  │                        en el hilo principal
   4. worker de imagen: guided.ts                  │                             │
      la agranda siguiendo la foto                 │                             │
          └────────────────────────────────────────┴──────────────┬──────────────┘
                                                                  ▼
                                               commitMask: nuevo paso en el historial
                                                                  │
                                                                  ▼
 Exportar ── prepareExport (worker de imagen): original × máscara, quitar halo, recortar bordes
           ── (opcional) agrandar con IA (worker de IA, Swin2SR)
           ── finishExport (worker de imagen): Lanczos al tamaño final, margen, fondo,
              PNG-8/PNG-24/WebP/JPG, DPI, ficha, OxiPNG ──► vista previa ──► Guardar
```

## Los workers

Hay dos hilos de trabajo además del de la interfaz:

- **Worker de imagen** (`src/imaging/`): guarda su propia copia del original y hace todo el cálculo pesado.
- **Worker de IA** (`src/ai/`): carga los modelos y los ejecuta. Mantiene en memoria un solo modelo de fondo a la vez.

Se comunican con un sistema de pedidos tipado (`src/workers/rpc.ts`):

```ts
const mask = await getImaging().call('feather', { mask, radius: 3 }, { transfer: [mask.buffer] });
```

- `call(nombre, datos, opciones)` devuelve una promesa con el resultado.
- `transfer` **mueve** los datos al worker en lugar de copiarlos (instantáneo, sin duplicar memoria). Después de transferir un arreglo, ya no se puede usar en el hilo que lo envió: por eso a veces se hace `mask.slice()` antes.
- `onProgress` recibe avisos de avance (descarga de modelos, mosaicos del agrandado).
- Los errores llegan con un código (`network`, `memory`, `gpu`, `crash`) que decide si se baja de nivel.

## Dónde tocar para…

| Quiero… | Archivo |
| --- | --- |
| Cambiar colores, tipografía o espaciados | `src/styles/app.css` (variables al principio: `--tapete`, `--rubi`, `--grafito`…) |
| Cambiar un texto de la interfaz | El componente en `src/ui/` (busca el texto con el buscador del editor) |
| Agregar o cambiar un destino (web, imprimir…) | `PRESETS` en `src/export/settings.ts` |
| Cambiar qué modelo usa un nivel o sus límites | `src/ai/models.ts` y `src/hardware/tiers.ts` (+ `scripts/download-models.mjs` y `docs/LICENCIAS.md`) |
| Cambiar los umbrales de detección de equipo | `decideTier` y `tierFromBenchmark` en `src/hardware/tiers.ts` |
| Agregar una operación de borde | Función en `src/imaging/mask.ts` → handler en `src/imaging/handlers.ts` → acción en `src/state/actions.ts` → botón en `src/ui/panels/RefinarPanel.tsx` |
| Agregar un formato de exportación | `src/imaging/encode.ts`, `ExportSettings` en `src/export/settings.ts`, `CalidadPanel.tsx` |
| Cambiar atajos de teclado | `src/App.tsx` (y la ayuda en `docs/FUNCIONES.md`) |
| Cambiar la ventana de escritorio (tamaño, título) | `src-tauri/tauri.conf.json` |
| Cambiar variables de entorno | `.env.example` (documentación) y `src/config.ts` (lectura) |

## Pruebas

`npm test` corre las pruebas de `tests/`:

| Archivo | Qué verifica |
| --- | --- |
| `png.test.ts` | El PNG que escribe la app se lee sin pérdida (RGBA, RGB y con paleta), con DPI y textos con acentos; el DPI de los JPG. |
| `imaging.test.ts` | Filtros, bordes (suavizar, desplazar, endurecer, combinar), afinado guiado, quitar halo, gotero, paletas PNG-8, recomendación de formato, cambio de tamaño y márgenes. |
| `logic.test.ts` | Centímetros y DPI, niveles de equipo, tamaño final de exportación, codificación con optimizador, pincel, historial y ficha. |
| `ai.test.ts` | Que los modelos incluidos con la app se lean de la carpeta local y el resto se pida a internet. |

Las pruebas no ejecutan modelos de IA reales (pesan cientos de MB). Verifican todo lo que rodea a la IA.

## Decisiones que conviene no romper

- **Rutas relativas** (`base: './'` en `vite.config.ts`): permiten que la misma compilación funcione en GitHub Pages, en la app de escritorio y en cualquier carpeta.
- **Cabeceras de aislamiento** (`Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy`) en `vite.config.ts` y `src-tauri/tauri.conf.json`: habilitan varios hilos para la IA en procesador. Si agregas imágenes o scripts de otros sitios, tienen que permitir CORS o se bloquearán.
- **El motor de IA viaja con la app** (`?url` en `src/ai/client.ts`): no depende de ningún CDN, por eso funciona sin internet.
- **`.npmrc` con `ignore-scripts=true`**: seguridad y una instalación que no falla por binarios que no se usan.
- **Textos en español neutro, con "tú"**: si un asistente de IA agrega textos, pídele el mismo tono.
