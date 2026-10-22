# Comandos

Todos se escriben en una terminal abierta en la carpeta del proyecto (la que tiene `package.json`). En Windows sirve PowerShell o la terminal de Visual Studio Code.

## Lo primero, una sola vez

| Comando | Qué hace |
| --- | --- |
| `node --version` | Muestra tu versión de Node.js. Necesitas **22.12 o más nueva**. Si no lo tienes, instala la versión LTS desde <https://nodejs.org>. |
| `npm install` | Descarga las librerías del proyecto a la carpeta `node_modules/` (unos 650 MB, no se sube a GitHub). Repítelo si cambias `package.json` o después de bajar cambios de otra persona. |

> El archivo `.npmrc` tiene `ignore-scripts=true`: ningún paquete puede ejecutar programas en tu PC al instalarse. Además evita que una dependencia que la app no usa (`onnxruntime-node`) intente descargar binarios y haga fallar la instalación.

## Uso diario

| Comando | Qué hace | Cuándo usarlo |
| --- | --- | --- |
| `npm run dev` | Abre la app en <http://localhost:5173> y la recarga sola cada vez que guardas un archivo. | Mientras trabajas en el código. Para cerrarla: <kbd>Ctrl</kbd>+<kbd>C</kbd> en la terminal. |
| `npm run check` | Revisa los tipos, corre las pruebas y compila. Si algo falla, dice qué y dónde. | **Después de cada cambio**, antes de subirlo a GitHub. |
| `npm test` | Solo las pruebas automáticas (carpeta `tests/`). | Para verificar rápido una función. |
| `npm run typecheck` | Solo la revisión de tipos de TypeScript. | Cuando el editor marca errores en rojo. |
| `npm run build` | Crea la versión final, optimizada, en `dist/`. | Para publicar la web o antes de crear la app de escritorio. |
| `npm run preview` | Sirve `dist/` en <http://localhost:4173>. | Para probar la versión final antes de publicarla. |

## Modelos de IA sin internet

Por defecto los modelos se descargan de Hugging Face la primera vez que se usan y quedan en la caché. Para una PC que nunca se conecta, o para incluirlos en la app:

| Comando | Qué descarga | Peso aprox. |
| --- | --- | --- |
| `npm run models:download` | Lo necesario para todos los niveles: `alto`, `medio`, `bajo`, `sam` y `agrandar`. | ~310 MB |
| `npm run models:download -- bajo` | Solo el modelo del nivel Bajo (U²-Netp). | 5 MB |
| `npm run models:download -- medio sam` | Varios grupos a la vez. | según grupos |
| `npm run models:download -- bajo-mejor` | El U²-Net completo (opción *Mejor* del nivel Bajo). No está incluido en "todo". | 176 MB |

Grupos disponibles: `alto`, `medio`, `bajo`, `bajo-mejor`, `sam`, `agrandar`, `todo`.

Los archivos quedan en `public/models/` (no se suben a GitHub: pesan demasiado) y se incluyen en el próximo `npm run build`. Si además quieres que la app **nunca** intente descargar nada, crea un `.env` con:

```
VITE_ALLOW_REMOTE_MODELS=false
```

## App de escritorio (Tauri)

La forma recomendada de obtener el `.exe` es dejar que GitHub lo compile (ver [GITHUB.md](GITHUB.md)). Si prefieres compilarlo en tu PC con Windows:

1. Instala Rust desde <https://rustup.rs> (acepta las opciones por defecto; si lo pide, instala también *Visual Studio C++ Build Tools*).
2. Ejecuta:

| Comando | Qué hace |
| --- | --- |
| `npm run desktop:dev` | Abre la app de escritorio en modo desarrollo (usa `npm run dev` por dentro y se recarga sola). La primera vez compila Rust: tarda varios minutos. |
| `npm run desktop:build` | Crea el ejecutable y el instalador. Quedan en `src-tauri/target/release/recorta.exe` y `src-tauri/target/release/bundle/nsis/`. |
| `npm run icons` | Regenera los íconos de la app desde `src-tauri/icono-app.png` (imagen cuadrada de 1024 × 1024). Después borra las carpetas `android` e `ios` que crea en `src-tauri/icons/`: esta app no las usa. |

`recorta.exe` ya es la versión portable: se puede copiar a un pendrive y abrir con doble clic. Necesita WebView2, que viene con Windows 11 y Windows 10 actualizado.

## Publicar en GitHub

Ver [GITHUB.md](GITHUB.md). Resumen con Git instalado:

```bash
git init
git add .
git commit -m "Primera versión de Recorta"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/recorta.git
git push -u origin main
```

Para publicar una versión con el `.exe` en *Releases*:

```bash
git tag v1.0.0
git push --tags
```

## Si algo falla

| Mensaje | Qué hacer |
| --- | --- |
| `npm: command not found` / `npm no se reconoce` | Instala Node.js y abre una terminal nueva. |
| `EBADENGINE` o errores raros al instalar | Tu Node.js es viejo: instala la versión 22 o 24 LTS. |
| `Port 5173 is already in use` | Ya hay otra copia de `npm run dev` abierta. Ciérrala o cierra esa terminal. |
| `npm run check` marca un error | Lee la primera línea del error: dice archivo y línea. Ver [SOLUCION-DE-PROBLEMAS.md](SOLUCION-DE-PROBLEMAS.md). |
