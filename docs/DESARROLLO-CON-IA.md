# Seguir el proyecto con asistentes de IA

Recorta se puede extender pidiéndole cambios a un asistente de IA (Claude, ChatGPT, Copilot, Cursor…) en lugar de escribir el código a mano. Funciona bien si se respetan tres cosas: darle contexto, verificar cada cambio y avanzar de a poco.

Lo honesto primero: el asistente escribe código que *parece* correcto y a veces no lo es. La red de seguridad del proyecto son las pruebas automáticas, la revisión de tipos y `npm run check`. Si un cambio no pasa `npm run check`, no está terminado, aunque el asistente diga que sí.

## El ciclo de trabajo

1. **Un cambio por vez.** "Agregar el formato AVIF a la exportación", no "mejorar la exportación y el lote y los colores".
2. **Pide un plan antes del código.** "Antes de escribir código, dime qué archivos vas a tocar y por qué." Si el plan toca archivos que no tienen que ver, corrígelo ahí.
3. **Aplica el cambio.**
4. **Verifica:** `npm run check` en la terminal. Si falla, copia el error completo y pégaselo al asistente.
5. **Pruébalo con tus manos:** `npm run dev`, abre una imagen y haz el recorrido que tocaste.
6. **Guarda el punto:** commit con un mensaje claro (GitHub Desktop o `git commit -m "…"`).
7. **Sube:** al hacer `push`, GitHub corre la misma revisión (pestaña Actions).

Si algo salió mal y no sabes cómo arreglarlo, vuelve al último punto guardado: en GitHub Desktop, clic derecho sobre los cambios → *Discard changes*; en la terminal, `git restore .` (descarta lo que no está guardado en un commit).

## Darle contexto al asistente

Los asistentes no conocen el proyecto. Al empezar una conversación, adjunta o pega:

- `AGENTS.md` (reglas del proyecto, en la raíz),
- `docs/ARQUITECTURA.md` (mapa del código y dónde tocar),
- los archivos que vas a cambiar (la tabla "Dónde tocar para…" de ARQUITECTURA.md dice cuáles).

Muchas herramientas (Claude Code, Codex, Cursor y otras) leen `AGENTS.md` o `CLAUDE.md` solas si están en la raíz del proyecto. Por eso el proyecto los trae.

## Plantillas para pedir cambios

Copia, completa lo que está entre `<>` y pega.

**Agregar una función**

```
Proyecto: Recorta (React + TypeScript + Vite, ver AGENTS.md y docs/ARQUITECTURA.md).
Quiero: <qué debería poder hacer el usuario, en una o dos frases>.
Dónde: <paso de la app o panel, por ejemplo "paso Calidad, sección Formato y peso">.
Condiciones:
- Textos en español neutro, con "tú", en el mismo tono que el resto de la interfaz.
- Si cambia la imagen, que quede como un paso del historial.
- Trabajo pesado en el worker de imagen, no en la interfaz.
- Agrega o actualiza las pruebas en tests/.
Primero dime qué archivos vas a tocar y por qué. Después escribe el código completo de cada archivo que cambia.
```

**Arreglar un error**

```
Proyecto: Recorta (ver AGENTS.md).
Qué hice: <pasos exactos, por ejemplo "abrí un JPG de 6000 × 4000, quité el fondo en nivel Bajo">.
Qué esperaba: <…>.
Qué pasó: <…>.
Error (completo, copiado de la terminal o de la consola del navegador con F12):
<pegar aquí>
Busca la causa antes de cambiar código y explícamela. No borres ni debilites pruebas para que pasen.
```

**Cambiar el diseño**

```
Proyecto: Recorta (ver AGENTS.md). Los estilos están en src/styles/app.css y usan variables
(--tapete, --rubi, --grafito, --tiza, --lapiz…) con versión clara y oscura.
Quiero: <cambio visual>.
Usa las variables existentes; si hace falta un color nuevo, agrégalo como variable en los dos modos.
Tiene que seguir viéndose bien en pantallas de 960 px de ancho o menos.
```

## Errores típicos de los asistentes en este proyecto

| Error | Por qué rompe | Cómo pedir que lo evite |
| --- | --- | --- |
| Usar un arreglo después de enviarlo al worker con `transfer` | El arreglo queda vacío en el hilo que lo envió. | "Si transfieres un buffer, copia antes con `.slice()` si lo necesitas después." |
| Hacer bucles sobre millones de píxeles en un componente de React | La ventana se congela. | "Ese cálculo va en `src/imaging/` y se llama desde el worker." |
| Poner claves o contraseñas en variables `VITE_` | Quedan públicas dentro de la app. | Recorta no necesita claves. Si una función nueva la necesita, requiere un servidor aparte. |
| Cargar scripts, fuentes o imágenes desde otros sitios (CDN) | Rompe el uso sin internet y las cabeceras de aislamiento pueden bloquearlos. | "Instala el paquete con npm; nada desde CDN." |
| Escribir rutas absolutas (`/models/…`, `https://usuario.github.io/…`) | Falla en GitHub Pages o en la app de escritorio. | "Usa rutas relativas o `publicBaseUrl()` de `src/config.ts`." |
| Cambiar un modelo de IA sin revisar su licencia | Puede prohibir el uso comercial. | Revisar [LICENCIAS.md](LICENCIAS.md) y actualizarlo. |
| Borrar o "relajar" una prueba que falla | Esconde el error en lugar de arreglarlo. | "No modifiques las pruebas salvo que te lo pida." |
| Reescribir archivos enteros por un cambio chico | Mete cambios no pedidos y errores nuevos. | "Cambia solo lo necesario y muéstrame qué cambió." |

## Lista antes de cada commit

- [ ] `npm run check` termina sin errores.
- [ ] Probé el cambio en `npm run dev`, en una imagen real.
- [ ] Si toqué la IA: probé con el nivel Bajo (botón *Equipo* → *Bajo*), que es el que usan las computadoras más viejas.
- [ ] Si agregué una función: está en [FUNCIONES.md](FUNCIONES.md).
- [ ] No hay archivos `.env`, modelos ni `node_modules` en los cambios (`git status`).
