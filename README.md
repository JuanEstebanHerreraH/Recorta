# Recorta

**Elimina fondos, refina bordes y prepara imágenes para web o impresión con IA local.**

[Descargar para Windows](https://github.com/JuanEstebanHerreraH/Recorta/releases/download/V1.0.0/Recorta_1.0.0_x64-setup.exe) · [Notas de la versión](https://github.com/JuanEstebanHerreraH/Recorta/releases/tag/V1.0.0) · [Guía de funciones](docs/FUNCIONES.md)

La descarga publicada es el **instalador de Windows x64**. No necesitas Node.js ni Rust para usarlo. La IA procesa las imágenes en tu equipo; los modelos adicionales se descargan al utilizarlos por primera vez.

![Paso Calidad: a 20 cm y 300 DPI la app avisa que faltan píxeles y muestra el tamaño real sobre una base de corte junto a una hoja A4](docs/img/calidad.png)

## Qué hace

El trabajo se ordena en cuatro pasos, siempre visibles a la derecha:

1. **Recortar.** La IA quita el fondo (o lo haces sin IA con el gotero, ideal para logos). Si la IA elige mal, marcas con un clic qué objeto quieres.
2. **Refinar.** Pincel para borrar o recuperar, ajustes del borde (suavizar, contraer, endurecer) y *Quitar halo*, que limpia el color del fondo viejo pegado al contorno.
3. **Calidad.** Eliges para qué es (web, imprimir, tienda online, sticker) y la app explica en lenguaje simple el tamaño, los DPI, el formato y el peso. Muestra el tamaño impreso real sobre una base de corte, junto a una hoja de referencia (A4, Carta, A3…).
4. **Exportar.** Ves el archivo exacto (medidas, peso y aspecto) antes de guardarlo. El PNG lleva sus DPI y, si quieres, una *ficha* con los pasos que hiciste.

Además: modo **Lote** para procesar muchas imágenes con los mismos ajustes, **historial** con cada paso nombrado (deshacer y volver a cualquier punto) y la imagen original intacta siempre.

La lista completa de opciones, con qué hace cada una, está en [docs/FUNCIONES.md](docs/FUNCIONES.md).

## Adaptación al equipo

Al abrirse, la app revisa la tarjeta gráfica, el procesador y la memoria, y elige uno de tres niveles. Si un nivel falla durante el uso, baja al siguiente sola y te avisa.

| Nivel | Equipo típico | Dónde corre la IA | Modelo para quitar el fondo |
| --- | --- | --- | --- |
| **Alto** | Tarjeta gráfica dedicada (NVIDIA, AMD Radeon RX, Intel Arc), 16 GB de RAM | Tarjeta gráfica | BiRefNet lite a 1024 px (~115 MB) |
| **Medio** | Gráfica integrada moderna (Intel Iris Xe, Radeon integrada, Apple M), 8 GB | Tarjeta gráfica | BiRefNet lite a 512 px + afinado con la foto original (~99 MB) |
| **Bajo** | Windows 10/11 de 64 bits, objetivo de 4 GB de RAM y sin WebGPU | Procesador | U²-Net liviano a 320 px (~5 MB) |

Detalles, límites de cada nivel y cómo forzar uno: [docs/HARDWARE.md](docs/HARDWARE.md).

## Decisión de implementación

La app separa el editor del procesamiento de IA y adapta el modelo al equipo. La ruta CPU permite utilizarla sin WebGPU; los modelos de mayor resolución pueden mejorar el borde, pero requieren más recursos. El tamaño impreso y los DPI se muestran antes de exportar para hacer visible cuándo faltan píxeles.

## App de escritorio (Windows)

La versión publicada usa Tauri y se descarga desde [Releases](https://github.com/JuanEstebanHerreraH/Recorta/releases/tag/V1.0.0). El instalador disponible es `Recorta_1.0.0_x64-setup.exe`. No se anuncia una descarga portable que no esté adjunta a la versión.

Para compilarla desde el código, consulta [la guía de GitHub y distribución](docs/GITHUB.md) y ejecuta `npm run desktop:build` con los requisitos de Tauri instalados. La versión web puede ejecutarse localmente con los comandos de desarrollo.

## Privacidad y variables de entorno

- Las imágenes nunca salen de la computadora. Lo único que se descarga de internet son los modelos de IA, una sola vez, desde Hugging Face.
- La configuración opcional va en un archivo `.env` (copia `.env.example`). El `.env` **no se sube** a GitHub: lo impide `.gitignore`.
- Todo lo que empieza con `VITE_` queda dentro de la app compilada y cualquiera puede leerlo. No guardes contraseñas ni claves ahí. Recorta no necesita ninguna.

## Limitaciones conocidas

- La precisión del recorte depende del nivel: en computadoras sin tarjeta gráfica compatible el modelo es liviano y el borde sale menos fino. Para logos e ilustraciones, *Quitar el color de los bordes* da mejores bordes en cualquier equipo.
- En GitHub Pages la IA en procesador usa un solo hilo (GitHub no permite las cabeceras necesarias); en la app de escritorio no pasa.
- El `.exe` no está firmado: Windows muestra un aviso la primera vez ([qué hacer](docs/SOLUCION-DE-PROBLEMAS.md#app-de-escritorio-windows)).
- Probado en navegadores basados en Chromium (Chrome, Edge y el motor de la app de escritorio). Firefox y Safari deberían funcionar, con menos pruebas.
- No abre fotos HEIC de iPhone: hay que exportarlas antes como JPG.

<details>
<summary><strong>Desarrollo, estructura y documentación</strong></summary>

## Empezar

Necesitas [Node.js](https://nodejs.org) 22.12 o más nuevo. Luego, en una terminal dentro de la carpeta del proyecto:

```bash
npm install
npm run dev
```

Abre <http://localhost:5173> en Chrome o Edge. La primera vez que uses la IA se descarga el modelo (de 5 a 115 MB según tu equipo); después funciona sin internet.

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Usar la app mientras la modificas (se recarga sola). |
| `npm run check` | Revisar tipos, correr las pruebas y compilar. Úsalo después de cada cambio. |
| `npm run build` | Crear la versión final en `dist/`. |
| `npm run preview` | Probar esa versión final en <http://localhost:4173>. |
| `npm run models:download` | Descargar los modelos para usar la app 100 % sin internet. |
| `npm run desktop:build` | Crear la app de escritorio (necesita Rust; ver abajo). |

Todos los comandos, explicados uno por uno: [docs/COMANDOS.md](docs/COMANDOS.md).

## Estructura

```
recorta/
├── src/                  Código de la app (React + TypeScript)
│   ├── ai/               IA: modelos, worker y carga desde Hugging Face o la carpeta local
│   ├── imaging/          Procesamiento de imagen: máscaras, bordes, PNG, DPI, paletas
│   ├── editor/           Lienzo, zoom y pinceles
│   ├── hardware/         Detección del equipo y niveles Alto/Medio/Bajo
│   ├── export/           Destinos (web, imprimir…), tamaño final y ficha
│   ├── state/            Estado, acciones, historial y lote
│   └── ui/               Pantallas, paneles y controles
├── tests/                Pruebas automáticas (npm test)
├── src-tauri/            App de escritorio (Tauri 2)
├── scripts/              Descarga de modelos para uso sin internet
├── docs/                 Documentación
├── .github/workflows/    Revisión, publicación web y compilación para Windows
├── .env.example          Variables de entorno documentadas
└── .gitignore            Lo que no se sube a GitHub
```

Cómo encaja cada parte y dónde tocar para cambiar algo: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Documentación

- [FUNCIONES.md](docs/FUNCIONES.md): todas las opciones de la app, paso por paso.
- [HARDWARE.md](docs/HARDWARE.md): niveles de equipo, detección y límites.
- [COMANDOS.md](docs/COMANDOS.md): qué hace cada comando.
- [GITHUB.md](docs/GITHUB.md): subir el proyecto, publicar la web y compilar el `.exe`.
- [ARQUITECTURA.md](docs/ARQUITECTURA.md): cómo está hecho por dentro.
- [DESARROLLO-CON-IA.md](docs/DESARROLLO-CON-IA.md): cómo seguir el proyecto con asistentes de IA sin romperlo.
- [SOLUCION-DE-PROBLEMAS.md](docs/SOLUCION-DE-PROBLEMAS.md): errores comunes y qué hacer.
- [LICENCIAS.md](docs/LICENCIAS.md): licencias de la app, las librerías y los modelos de IA.

## Licencia

Código bajo licencia [MIT](LICENSE). Los modelos de IA tienen licencias propias; antes de un uso comercial lee [docs/LICENCIAS.md](docs/LICENCIAS.md).

</details>
