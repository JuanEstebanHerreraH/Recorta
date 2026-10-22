/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Aislamiento de origen cruzado: habilita SharedArrayBuffer, que el motor de IA
// usa para trabajar con varios hilos del procesador (mucho más rápido en nivel Bajo).
// Las descargas de modelos desde Hugging Face siguen funcionando porque usan CORS.
// Los mismos valores están en src-tauri/tauri.conf.json (app de escritorio).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // Rutas relativas: el mismo build funciona en GitHub Pages (/repo/), en la app
  // de escritorio y en cualquier carpeta de un servidor.
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Estas librerías cargan archivos .wasm por su cuenta; el pre-empaquetado de
    // Vite rompería esas rutas.
    exclude: ['@huggingface/transformers', '@jsquash/oxipng'],
  },
  server: {
    port: 5173,
    strictPort: true,
    headers: isolationHeaders,
  },
  preview: {
    port: 4173,
    headers: isolationHeaders,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
