# Licencias

## El código de Recorta

Licencia [MIT](../LICENSE): se puede usar, copiar, modificar y vender, incluso con fines comerciales, siempre que se conserve el aviso de copyright.

## Librerías incluidas en la app

| Librería | Para qué | Licencia |
| --- | --- | --- |
| React y React DOM | Interfaz | MIT |
| zustand | Estado de la app | MIT |
| Transformers.js (`@huggingface/transformers`) | Cargar y correr los modelos de IA | Apache-2.0 |
| ONNX Runtime Web | Motor de IA (WebGPU y WebAssembly) | MIT |
| jSquash OxiPNG (`@jsquash/oxipng`) | Optimizar PNG sin pérdida | Apache-2.0 (OxiPNG: MIT) |
| image-q | Paletas PNG-8 | MIT |
| fflate | Compresión (PNG, historial, .zip del lote) | MIT |
| Atkinson Hyperlegible Next (vía Fontsource) | Tipografía de la interfaz, del Braille Institute | SIL Open Font License 1.1 |
| Tauri | App de escritorio | MIT o Apache-2.0 |

Herramientas de desarrollo que no viajan con la app: Vite (MIT), TypeScript (Apache-2.0), Vitest (MIT).

Todas permiten uso comercial. Las licencias Apache-2.0 y MIT piden conservar sus avisos; están dentro de cada paquete en `node_modules/`.

## Modelos de IA

Los modelos **no están en el repositorio**: se descargan de Hugging Face cuando se usan por primera vez. La app de escritorio compilada por GitHub incluye solo U²-Netp.

| Modelo | Uso en la app | Repositorio en Hugging Face | Origen y licencia de los pesos |
| --- | --- | --- | --- |
| BiRefNet lite (1024 px) | Quitar fondo, nivel Alto | `jiabins0303/birefnet-lite-1024-webgpu` | [BiRefNet](https://github.com/ZhengPeng7/BiRefNet), MIT |
| BiRefNet lite (512 px) | Quitar fondo, nivel Medio | `Wattsey/birefnet-lite-512-webgpu` | [BiRefNet](https://github.com/ZhengPeng7/BiRefNet), MIT |
| U²-Netp | Quitar fondo, nivel Bajo (*Rápida*) | `BritishWerewolf/U-2-Netp` | [U²-Net](https://github.com/xuebinqin/U-2-Net), Apache-2.0 |
| U²-Net | Quitar fondo, nivel Bajo (*Mejor*) | `BritishWerewolf/U-2-Net` | [U²-Net](https://github.com/xuebinqin/U-2-Net), Apache-2.0 |
| SlimSAM | Seleccionar con un clic | `Xenova/slimsam-77-uniform` | [SlimSAM](https://github.com/czg1225/SlimSAM), basado en Segment Anything de Meta; Apache-2.0 |
| Swin2SR ×2 | Agrandar con IA | `Xenova/swin2SR-classical-sr-x2-64` | [Swin2SR](https://github.com/mv-lab/swin2sr), Apache-2.0 |

Las versiones ONNX (el formato que corre en el navegador) las publicaron terceros en Hugging Face a partir de los modelos originales. La licencia que rige es la del modelo original.

### Una advertencia honesta sobre el uso comercial

La licencia de los pesos (MIT o Apache-2.0) permite el uso comercial. Pero casi todos los modelos públicos de recorte y de mejora de imagen se entrenaron con conjuntos de datos académicos (por ejemplo DIS5K, DUTS o DIV2K), cuyas condiciones están pensadas para investigación. Si esas condiciones alcanzan o no a un modelo ya entrenado es una discusión legal abierta, sin una respuesta clara hoy.

En la práctica:

- **Uso personal, educativo, portafolio o trabajos propios** (recortar tus imágenes para un cliente): no hay un problema práctico conocido.
- **Vender la app o un servicio basado en ella:** consulta con un especialista en propiedad intelectual antes de hacerlo y revisa el estado de cada modelo en ese momento.

Las imágenes que exportas son tuyas: los modelos no agregan marcas ni condiciones sobre el resultado.

### Modelos descartados a propósito

| Modelo o librería | Por qué no se usa |
| --- | --- |
| BRIA RMBG 1.4 y 2.0 | Muy buenos, pero su licencia prohíbe el uso comercial sin un acuerdo pago con BRIA. |
| `@imgly/background-removal` | Licencia AGPL-3.0: obligaría a publicar bajo AGPL todo el código de la app y de sus derivados. |
| ormbg | Licencia abierta, pero entrenado para recortar personas; con productos y objetos rinde peor que BiRefNet. |

Si cambias o agregas un modelo, actualiza esta página, `src/ai/models.ts` y `scripts/download-models.mjs`.
