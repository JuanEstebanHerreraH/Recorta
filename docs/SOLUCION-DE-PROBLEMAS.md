# Solución de problemas

## Instalación y comandos

**`npm` no se reconoce como comando**
Node.js no está instalado o la terminal se abrió antes de instalarlo. Instala la versión LTS desde <https://nodejs.org> y abre una terminal nueva.

**PowerShell: "la ejecución de scripts está deshabilitada en este sistema"**
Es una protección de Windows. Ejecuta una vez, en PowerShell:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
O usa `npm.cmd` en lugar de `npm` (por ejemplo, `npm.cmd run dev`).

**`npm install` falla o muestra `EBADENGINE`**
Revisa `node --version`: hace falta 22.12 o más nueva. Si estás detrás de un proxy de empresa o universidad, puede bloquear el registro de npm; prueba desde otra red.

**`Port 5173 is already in use`**
Hay otra copia de `npm run dev` abierta. Ciérrala (<kbd>Ctrl</kbd>+<kbd>C</kbd> en su terminal) o cierra esa terminal.

**`npm run check` falla**
Lee el primer error: indica archivo, línea y qué espera. Los errores de tipos (`TS2322`, `TS2345`…) suelen significar que un dato no tiene la forma esperada. Si un asistente de IA hizo el cambio, pégale el error completo (ver [DESARROLLO-CON-IA.md](DESARROLLO-CON-IA.md)).

## La IA

**"No se pudo descargar el modelo"**
La primera vez que se usa cada modelo hace falta internet para descargarlo de Hugging Face. Si la red bloquea `huggingface.co` (algunas redes de empresas o colegios):
- descarga los modelos en otra red con `npm run models:download` y compila con `npm run build`: quedan dentro de la app; o
- usa un espejo propio con `VITE_MODEL_HOST` en el `.env`.

**"Se usó el nivel Medio" (o Bajo) cuando esperabas otro**
La tarjeta gráfica falló (falta de memoria o un problema del driver) y la app bajó de nivel para no detenerse. Prueba:
- actualizar los drivers de la tarjeta gráfica;
- cerrar pestañas y programas que usen la tarjeta (juegos, editores de video);
- *Equipo → Probar rendimiento* para medir de nuevo.

**WebGPU "No disponible" en una PC con tarjeta gráfica**
- Chrome/Edge: Configuración → Sistema → activar *Usar aceleración de gráficos cuando esté disponible* y reiniciar el navegador.
- Escribe `chrome://gpu` (o `edge://gpu`) en la barra de direcciones: la línea *WebGPU* dice si está activo y, si no, por qué.
- Actualiza el navegador y los drivers. Algunas tarjetas viejas están bloqueadas a propósito por inestables: ahí el nivel Bajo es lo correcto.

**"IA en procesador: Un hilo (más lenta)"**
El entorno no permite varios hilos. Pasa en GitHub Pages, que no permite las cabeceras necesarias. En la app de escritorio, en `npm run dev` y en `npm run preview` sí funcionan. Ver [HARDWARE.md](HARDWARE.md#varios-hilos-en-el-procesador-nivel-bajo).

**En nivel Bajo el recorte sale impreciso**
El modelo liviano (320 px) es el límite de un equipo sin tarjeta gráfica. Opciones, de mejor a peor resultado:
- *Calidad en nivel Bajo → Mejor* (modelo completo, 176 MB, más lento);
- para logos e ilustraciones, *Quitar el color de los bordes* da bordes perfectos y es instantáneo;
- *Seleccionar con un clic* para corregir zonas y los pinceles para el detalle.

**Queda un contorno de color alrededor del objeto**
Es el halo del fondo anterior. En *Refinar*: activa *Quitar halo* y, si sigue, *Desplazar* −1 o −2 px. Revisa con el fondo de la vista en negro y en blanco (barra inferior).

## Imágenes y archivos

**"No se pudo abrir la imagen"**
El formato no es compatible. Las fotos de iPhone suelen estar en **HEIC**, que los navegadores no leen: expórtalas como JPG (en el iPhone: Ajustes → Cámara → Formatos → *Más compatible*) o conviértelas antes. También falla si el archivo está dañado.

**"La imagen se abrió más chica"**
Supera el máximo de megapíxeles del nivel (Bajo 12, Medio 24, Alto 48). Si tu equipo puede, sube de nivel en *Equipo* y vuelve a abrirla.

**El PNG pesa demasiado**
- Destino *Web y redes*: elige automáticamente PNG-8 cuando se puede.
- Activa *Optimizar el peso sin pérdida*.
- Si la imagen es una foto y va a la web, WebP pesa mucho menos.
- Revisa el tamaño: una foto de 6000 px para una web suele ser excesiva; usa *Lado máx.* 2000 px.

**Otro programa muestra 72 DPI**
- WebP no guarda DPI: usa PNG o JPG para imprimir.
- Algunos visores ignoran el dato. Photoshop, Illustrator, InDesign, Affinity y GIMP lo leen. Ante la duda, la *ficha* dice a qué DPI y medida se exportó.

**"Guardar archivo" no pregunta dónde guardar**
Firefox y Safari no tienen el diálogo "Guardar como" para páginas web: el archivo va a la carpeta de descargas. Chrome, Edge y la app de escritorio sí preguntan.

## App de escritorio (Windows)

**"Windows protegió su PC"**
El `.exe` no está firmado digitalmente (la firma es un servicio pago). Pulsa *Más información → Ejecutar de todas formas*. Algunos antivirus también desconfían de programas sin firma; si lo bloquean, puedes agregar una excepción o usar el instalador.

**La app no abre o se cierra al instante**
Necesita WebView2 (el motor de Edge). Viene con Windows 11 y Windows 10 actualizado. Si falta, instala *WebView2 Runtime* desde la web de Microsoft (busca "WebView2 Runtime download") o usa el instalador `Recorta_…_x64-setup.exe`, que lo instala solo.

**Dónde guarda sus datos**
Preferencias y modelos descargados quedan en `%LOCALAPPDATA%\app.recorta.escritorio\`. Borrar esa carpeta deja la app como recién instalada (los modelos se vuelven a descargar).

## GitHub

**El flujo "Publicar web" falla con "Get Pages site failed"**
Falta activar Pages: *Settings → Pages → Source: GitHub Actions*. Luego, en *Actions*, vuelve a ejecutar el flujo (*Re-run jobs*).

**El flujo "App de escritorio" falla en "Incluir el modelo del nivel Bajo"**
Hugging Face no respondió en ese momento. Vuelve a ejecutarlo (*Re-run jobs*).

**No aparece la versión en Releases**
Solo se publica cuando el flujo se ejecuta por una etiqueta que empieza con `v` (`git tag v1.0.0` y `git push --tags`). Si se ejecutó a mano, los archivos están en *Artifacts* de esa ejecución.

**La revisión ❌ falla en GitHub pero en mi PC funciona**
Casi siempre es un archivo que no se subió (revisa `git status`) o mayúsculas en un nombre de archivo: Windows no distingue `Panel.tsx` de `panel.tsx`, pero GitHub (Linux) sí.

## Empezar de cero con la caché

Si sospechas que un modelo se descargó mal o quieres liberar espacio: en Chrome o Edge, <kbd>F12</kbd> → *Application* → *Storage* → *Clear site data*. En la app de escritorio, borra la carpeta indicada arriba.
