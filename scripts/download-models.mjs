// Descarga los modelos de IA a public/models/ para usar Recorta 100 % sin internet
// (por ejemplo, en la versión portable para una PC que nunca se conecta).
//
// Uso:
//   npm run models:download              -> descarga todo lo necesario
//   npm run models:download -- medio     -> solo lo del nivel Medio
//   npm run models:download -- bajo sam  -> varios grupos
//
// Grupos: alto, medio, bajo, bajo-mejor, sam, agrandar, todo
// Después de descargar, `npm run build` incluye los modelos en la app compilada.
// Si además quieres prohibir descargas desde internet, crea un .env con
// VITE_ALLOW_REMOTE_MODELS=false
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const host = (process.env.VITE_MODEL_HOST || 'https://huggingface.co/').replace(/\/?$/, '/');

// Debe coincidir con src/ai/models.ts
const GROUPS = {
  alto: [
    {
      repo: 'jiabins0303/birefnet-lite-1024-webgpu',
      files: ['config.json', 'preprocessor_config.json', 'onnx/model_fp16.onnx'],
    },
  ],
  medio: [
    {
      repo: 'Wattsey/birefnet-lite-512-webgpu',
      files: ['config.json', 'preprocessor_config.json', 'onnx/model_fp16.onnx'],
    },
  ],
  bajo: [
    {
      repo: 'BritishWerewolf/U-2-Netp',
      files: ['config.json', 'preprocessor_config.json', 'onnx/model.onnx'],
    },
  ],
  'bajo-mejor': [
    {
      repo: 'BritishWerewolf/U-2-Net',
      files: ['config.json', 'preprocessor_config.json', 'onnx/model.onnx'],
    },
  ],
  sam: [
    {
      repo: 'Xenova/slimsam-77-uniform',
      files: [
        'config.json',
        'preprocessor_config.json',
        'onnx/vision_encoder_fp16.onnx',
        'onnx/prompt_encoder_mask_decoder_fp16.onnx',
        'onnx/vision_encoder_quantized.onnx',
        'onnx/prompt_encoder_mask_decoder_quantized.onnx',
      ],
    },
  ],
  agrandar: [
    {
      repo: 'Xenova/swin2SR-classical-sr-x2-64',
      files: ['config.json', 'preprocessor_config.json', 'onnx/model.onnx'],
    },
  ],
};

const requested = process.argv.slice(2).map((arg) => arg.toLowerCase());
const groupNames =
  requested.length === 0 || requested.includes('todo')
    ? ['alto', 'medio', 'bajo', 'sam', 'agrandar']
    : requested;

for (const name of groupNames) {
  if (!GROUPS[name]) {
    console.error(`Grupo desconocido: "${name}". Usa: ${Object.keys(GROUPS).join(', ')}, todo`);
    process.exit(1);
  }
}

const modelsDir = join(root, 'public', 'models');
const manifestPath = join(modelsDir, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { repos: [] };

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function download(repo, file) {
  const dest = join(modelsDir, repo, file);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`  ✓ ${repo}/${file} (ya estaba)`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const url = `${host}${repo}/resolve/main/${file}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`No se pudo descargar ${url} (HTTP ${response.status}).`);
  }
  const total = Number(response.headers.get('content-length')) || 0;
  let loaded = 0;
  let lastPrint = 0;
  const body = Readable.fromWeb(response.body);
  body.on('data', (chunk) => {
    loaded += chunk.length;
    const now = Date.now();
    if (now - lastPrint > 1000) {
      lastPrint = now;
      const pct = total ? ` (${Math.round((loaded / total) * 100)} %)` : '';
      process.stdout.write(`\r  ↓ ${repo}/${file}: ${formatMB(loaded)}${pct}   `);
    }
  });
  await pipeline(body, createWriteStream(dest));
  process.stdout.write(`\r  ✓ ${repo}/${file}: ${formatMB(loaded)}                \n`);
}

console.log(`Descargando modelos desde ${host}\n`);
for (const name of groupNames) {
  console.log(`Grupo "${name}":`);
  for (const { repo, files } of GROUPS[name]) {
    for (const file of files) {
      try {
        await download(repo, file);
      } catch (error) {
        console.error(`\n  ✗ ${error.message}`);
        console.error('    Revisa tu conexión a internet y vuelve a ejecutar el comando.');
        process.exit(1);
      }
    }
    if (!manifest.repos.includes(repo)) manifest.repos.push(repo);
  }
}

mkdirSync(modelsDir, { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nListo. Los modelos quedaron en public/models/ y se incluirán en el próximo `npm run build`.');
