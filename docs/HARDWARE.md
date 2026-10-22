# Niveles de equipo: Alto, Medio y Bajo

La IA de Recorta corre en la computadora de quien la usa. Eso tiene dos consecuencias:

- **No hay tokens, cuentas ni límites diarios.** Los servicios en la nube cobran o limitan porque cada imagen usa sus servidores. Aquí cada imagen usa tu propio equipo, así que puedes procesar las que quieras.
- **El límite real es el hardware.** Una tarjeta gráfica dedicada procesa en menos de un segundo lo que a un procesador viejo le cuesta varios. Por eso la app se adapta en tres niveles.

## Los tres niveles

| | **Alto** | **Medio** | **Bajo** |
| --- | --- | --- | --- |
| **Equipo típico** | Tarjeta gráfica dedicada (NVIDIA, AMD Radeon RX, Intel Arc), 16 GB de RAM | Gráfica integrada moderna (Intel Iris Xe, AMD Radeon integrada, Apple M), 8 GB de RAM | Cualquier PC con Windows 10/11 de 64 bits y 4 GB de RAM, aunque no tenga tarjeta gráfica compatible |
| **Dónde corre la IA** | Tarjeta gráfica (WebGPU, media precisión) | Tarjeta gráfica (WebGPU, media precisión) | Procesador (WebAssembly; varios hilos si el entorno lo permite) |
| **Quitar fondo** | BiRefNet lite, ve la imagen a 1024 px | BiRefNet lite a 512 px; el borde se afina después con la foto original | U²-Net liviano a 320 px (*Rápida*) o U²-Net completo (*Mejor*) |
| **Descarga (una vez)** | ~115 MB | ~99 MB | ~5 MB (*Mejor*: ~176 MB) |
| **Seleccionar con un clic** | SlimSAM en la tarjeta gráfica (~21 MB) | SlimSAM en la tarjeta gráfica (~21 MB) | SlimSAM en el procesador (~14 MB, más lento) |
| **Agrandar con IA** | Sí, hasta 4 MP de entrada | Sí, hasta 1 MP de entrada | No (se usa el método de alta calidad) |
| **Imagen más grande que se edita** | 48 MP | 24 MP | 12 MP |
| **Pasos de historial** | 60 | 40 | 20 |

Todo lo demás (pinceles, quitar color sin IA, quitar halo, bordes, calidad, exportar, lote) funciona igual en los tres niveles: es procesamiento de imagen clásico, rápido en cualquier equipo.

Los ejemplos de tarjetas son orientativos. La app no decide por la marca solamente: comprueba qué puede hacer la tarjeta (siguiente sección).

## Cómo decide la app

Al abrirse, la app consulta el equipo (todo localmente, sin enviar nada) y aplica estas reglas en orden:

1. **¿Hay WebGPU?** Es la forma en que una página o app web usa la tarjeta gráfica. Si no hay (navegador viejo, drivers bloqueados, PC sin gráfica compatible): **Bajo**.
2. **¿Es una tarjeta real?** Si WebGPU solo ofrece un adaptador por software (emulado en el procesador), sería más lento que el procesador directo: **Bajo**.
3. **¿Admite media precisión (`shader-f16`)?** Los modelos de los niveles Alto y Medio están en media precisión: ocupan la mitad de memoria y van casi el doble de rápido. Sin eso: **Bajo**.
4. **¿Tiene suficientes recursos para los modelos?** (límite de memorias por etapa de la GPU). Si no: **Bajo**.
5. **¿Qué tarjeta es?** NVIDIA, AMD dedicada o Intel Arc: **Alto**. Integrada, Apple o no identificada: **Medio**.
6. **¿Hay poca memoria?** Si el sistema informa menos de 8 GB, Alto baja a **Medio**.

Las reglas son una estimación. La medición real es más confiable:

- **Probar rendimiento** (botón *Equipo* → *Probar rendimiento*): corre el modelo de 512 px dos veces en la tarjeta gráfica (la primera compila, la segunda se mide). Si tarda 0,8 s o menos: **Alto**. Hasta 5 s: **Medio**. Más: **Bajo**. El resultado se recuerda para las próximas veces.

## Si un nivel falla, baja solo

Durante el uso pueden pasar cosas que la detección no anticipa: la tarjeta gráfica se queda sin memoria con una imagen grande, un driver se cuelga o el navegador pierde el acceso a la GPU. Cuando eso pasa:

1. La app reinicia el motor de IA (sin cerrar la imagen ni perder el historial).
2. Repite la operación con el nivel siguiente: Alto → Medio → Bajo.
3. Te avisa: "Se usó el nivel Medio. El nivel Alto no funcionó en este equipo; la app bajó de nivel automáticamente."
4. Ese nivel queda marcado como *Falló en esta sesión* y no se vuelve a intentar hasta que reabras la app o elijas un nivel a mano.

Los errores de descarga (sin internet la primera vez) no bajan de nivel: fallarían igual en todos. En ese caso la app dice que hace falta conexión para la primera descarga.

*Seleccionar con un clic* hace lo mismo: si la tarjeta gráfica falla, lo intenta en el procesador.

## Forzar un nivel

- **En la app:** botón *Equipo* (arriba a la derecha) → elegir *Alto*, *Medio* o *Bajo*. *Automático* vuelve a la recomendación. Los niveles que necesitan WebGPU aparecen bloqueados si tu equipo no lo tiene.
- **Para todo el proyecto:** en el archivo `.env`, `VITE_DEFAULT_TIER=bajo` (o `alto`, `medio`, `auto`). Útil, por ejemplo, para una versión pensada para las PCs de un aula.

Forzar Alto en una gráfica integrada puede funcionar (más lento) o fallar por memoria; si falla, la app baja sola.

## Límites reales y cómo los maneja la app

| Límite | Qué pasa | Qué hace la app |
| --- | --- | --- |
| **Resolución del modelo** | La IA ve la imagen a 320, 512 o 1024 px, aunque la foto tenga 6000 px. | La máscara se agranda guiada por la foto original (filtro guiado), así el borde sigue el pelo y los detalles finos reales. Solo se corrige la franja del borde; lo que la IA dio por seguro se respeta. |
| **Memoria de la tarjeta gráfica** | Modelos grandes + imágenes grandes pueden agotarla. | A la IA se le envía una copia de 2048 px como máximo. Si igual falla, baja de nivel. |
| **Memoria del sistema** | Editar una imagen de 48 MP puede ocupar alrededor de 1 GB entre original, máscara, vista en pantalla y copia de trabajo (una de 12 MP, unos 250 MB). | Cada nivel tiene un máximo de megapíxeles; si la imagen lo supera, se abre achicada y se avisa. El historial guarda copias comprimidas de la máscara y muestra cuánto ocupa. |
| **Procesador** | En nivel Bajo la IA corre en la CPU. | Modelo liviano (5 MB), varios hilos cuando el entorno lo permite y trabajo pesado en segundo plano para que la ventana no se congele. |
| **Primera descarga** | Los modelos pesan de 5 a 176 MB. | Se descargan solo cuando se usan, con barra de progreso, y quedan guardados. La app de escritorio trae incluido el modelo del nivel Bajo. |

### Varios hilos en el procesador (nivel Bajo)

La IA en procesador puede usar varios núcleos solo si la página está *aislada* (cabeceras `Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy`). Recorta las envía en:

- `npm run dev` y `npm run preview` (configurado en `vite.config.ts`),
- la app de escritorio (configurado en `src-tauri/tauri.conf.json`).

**GitHub Pages no permite enviar cabeceras propias**, así que ahí la IA en procesador usa un solo hilo: funciona, pero más lenta. Los niveles Alto y Medio no se ven afectados (usan la tarjeta gráfica). En *Equipo* → *IA en procesador* se ve si estás con "Varios hilos" o "Un hilo".

## Navegadores

- **Chrome y Edge (versión 113 o más nueva):** recomendados. Tienen WebGPU en Windows, macOS y ChromeOS.
- **Firefox y Safari:** las versiones recientes ya incluyen WebGPU, pero la app se probó en Chromium. Si algo falla, la app usa el nivel Bajo.
- **App de escritorio para Windows:** usa WebView2, el mismo motor de Edge, que viene con Windows 10 actualizado y Windows 11.

## Para quien modifica el código

- Los niveles y sus límites están en `src/hardware/tiers.ts` (`TIERS`, `decideTier`, `tierFromBenchmark`, `fallbackChain`).
- La detección del equipo está en `src/hardware/detect.ts`.
- Qué modelo usa cada nivel está en `src/ai/models.ts` (`bgModelFor`). Si cambias un modelo, actualiza también `scripts/download-models.mjs` y [LICENCIAS.md](LICENCIAS.md).
- El cambio automático de nivel está en `runAiRemoval` (`src/state/actions.ts`).
- Las reglas tienen pruebas en `tests/logic.test.ts` (*niveles de equipo*). Si cambias umbrales, actualiza las pruebas.
