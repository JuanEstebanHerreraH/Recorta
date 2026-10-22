# Subir Recorta a GitHub

Esta guía cubre tres cosas: subir el código, publicar la versión web y obtener el `.exe` para Windows sin instalar nada más.

## 1. Qué se sube y qué no

El archivo `.gitignore` le dice a Git qué carpetas y archivos dejar afuera. Ya está configurado:

| No se sube | Por qué |
| --- | --- |
| `node_modules/` | Son las librerías (unos 650 MB). Cualquiera las recupera con `npm install`. |
| `dist/` | Es la compilación. Se regenera con `npm run build` (y GitHub la genera solo para publicar). |
| `public/models/` | Modelos de IA descargados con `npm run models:download` (cientos de MB; GitHub rechaza archivos de más de 100 MB). |
| `.env`, `.env.*` | Tu configuración local. **Sí** se sube `.env.example`, que documenta las variables sin valores privados. |
| `src-tauri/target/`, `src-tauri/gen/schemas/` | Compilación de la app de escritorio (más de 1 GB). |
| `coverage/`, `.vite/`, `*.log`, `*.tsbuildinfo` | Resultados temporales. |
| `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/*` | Archivos del sistema y de los editores. |

### Sobre las variables "ocultas"

`.gitignore` evita que el archivo `.env` llegue a GitHub, pero hay que entender un límite importante:

- Las variables que empiezan con `VITE_` se **copian dentro de la app compilada**. Cualquiera que abra la página puede leerlas con las herramientas del navegador. Sirven para configuración (qué servidor de modelos usar, nivel inicial), **nunca** para contraseñas o claves de API.
- Recorta no necesita ninguna clave secreta: no usa servicios pagos ni servidores propios.
- Si en el futuro agregas algo que sí necesita una clave (por ejemplo, una API de pago), esa clave no puede vivir en la app. Tiene que quedar en un servidor o función en la nube que haga la llamada por ti. Para claves que solo usan los flujos de GitHub Actions existe **Settings → Secrets and variables → Actions**.

## 2. Crear el repositorio y subir el código

Crea una cuenta en <https://github.com> si no tienes y elige una de estas opciones. En todas, el repositorio conviene que sea **público**: GitHub Actions y Pages son gratis en repositorios públicos.

### Opción A: GitHub Desktop (sin comandos)

1. Instala <https://desktop.github.com> e inicia sesión con tu cuenta.
2. **File → Add local repository** → elige la carpeta del proyecto. Como todavía no es un repositorio, ofrece crearlo (*create a repository*): acepta.
3. Escribe un mensaje (por ejemplo, "Primera versión") y pulsa **Commit to main**.
4. Pulsa **Publish repository**, desmarca *Keep this code private* y confirma. GitHub Desktop crea el repositorio en la web por ti.

### Opción B: con Git en la terminal

Primero crea el repositorio vacío en la web: botón **New** (o <https://github.com/new>), nombre `recorta`, **Public**, y **sin** marcar "Add a README" ni ".gitignore" (el proyecto ya los trae). Luego:

```bash
git init
git add .
git commit -m "Primera versión de Recorta"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/recorta.git
git push -u origin main
```

Antes del `commit`, `git status` muestra qué se va a subir: no debería aparecer `node_modules`, `dist` ni `.env`.

### Opción C: arrastrando archivos en la web

Crea el repositorio vacío como en la opción B y usa **uploading an existing file**. Funciona, con dos cuidados: la web acepta **hasta 100 archivos por vez** (súbelos en dos tandas si hace falta) y algunas computadoras ocultan las carpetas que empiezan con punto. Verifica que se subieron `.github/workflows/`, `.gitignore`, `.npmrc` y `.nvmrc`: sin ellos no funcionan la compilación automática ni la instalación.

## 3. Revisión automática

Cada vez que subes cambios a `main`, el flujo **Revisión** (`.github/workflows/ci.yml`) instala todo, revisa tipos, corre las pruebas y compila. Se ve en la pestaña **Actions**:

- ✅ verde: todo bien.
- ❌ rojo: algo se rompió. Entra a la ejecución, abre el paso en rojo y lee el error (archivo y línea). Corre `npm run check` en tu PC para reproducirlo.

## 4. Publicar la versión web (GitHub Pages)

Una sola vez:

1. En el repositorio: **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**.

Desde entonces, cada cambio en `main` se publica solo (flujo **Publicar web**, `.github/workflows/pages.yml`) en:

```
https://<tu-usuario>.github.io/recorta/
```

La primera publicación tarda uno o dos minutos. Si cambiaste el nombre del repositorio, la dirección cambia; la app funciona en cualquier ruta porque usa direcciones relativas.

Limitación de GitHub Pages: no permite configurar las cabeceras que habilitan varios hilos para la IA en procesador, así que en el nivel Bajo la IA va más lenta que en la app de escritorio o en `npm run preview`. Los niveles Alto y Medio no se ven afectados. Ver [HARDWARE.md](HARDWARE.md#varios-hilos-en-el-procesador-nivel-bajo).

## 5. Obtener el `.exe` para Windows

El flujo **App de escritorio** (`.github/workflows/desktop.yml`) compila la app en una computadora Windows de GitHub. No necesitas instalar Rust.

### Una prueba o una versión interna

1. Pestaña **Actions** → **App de escritorio** (a la izquierda) → **Run workflow** → **Run workflow**.
2. Espera a que termine (entre 10 y 20 minutos la primera vez; luego menos, porque reutiliza lo compilado).
3. Entra a esa ejecución y, abajo, en **Artifacts**, descarga **recorta-windows**. Adentro hay:
   - `Recorta-portable-windows-x64.zip`: la versión portable (`Recorta.exe` + `LEEME.txt`).
   - `Recorta_1.0.0_x64-setup.exe`: el instalador (no pide permisos de administrador).

Los *artifacts* se borran a los 90 días y solo los ven personas con sesión iniciada en GitHub.

### Una versión pública (Releases)

```bash
git tag v1.0.0
git push --tags
```

El mismo flujo se ejecuta y, al terminar, publica el `.zip` y el instalador en la sección **Releases** del repositorio, con notas generadas a partir de los cambios. Para la siguiente versión, cambia `"version"` en `package.json` (por ejemplo, a `1.1.0`) y crea la etiqueta `v1.1.0`.

### El aviso "Windows protegió su PC"

La primera vez que alguien abra el `.exe`, Windows SmartScreen puede mostrar ese aviso porque el archivo no está *firmado digitalmente*. Se continúa con **Más información → Ejecutar de todas formas**. Quitar el aviso requiere un certificado de firma de código, que es un servicio pago; para un proyecto personal o de estudio no hace falta.

## 6. Mantener el repositorio ordenado

- Un cambio, un commit, con un mensaje que diga qué cambió ("Agrega exportación AVIF", no "cambios").
- Corre `npm run check` antes de cada `push`.
- Si algo se rompió en `main`, la pestaña **Actions** muestra desde qué commit.
- Para trabajar con asistentes de IA sin romper el proyecto, ver [DESARROLLO-CON-IA.md](DESARROLLO-CON-IA.md).
