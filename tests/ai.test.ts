import { describe, expect, it } from 'vitest';
import { localModelFetch } from '../src/ai/handlers';

const ORIGIN = 'http://app.test';

function fakeFetch(contentType: string) {
  const calls: string[] = [];
  const fn = (async (input: string | URL) => {
    calls.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': contentType } });
  }) as typeof fetch;
  return { fn, calls };
}

describe('modelos incluidos con la app', () => {
  it('un modelo que no está en la carpeta local da 404 sin pedir nada al servidor', async () => {
    const base = fakeFetch('application/json');
    const f = localModelFetch('/models/', ['BritishWerewolf/U-2-Netp'], base.fn, ORIGIN);
    const response = await f('/models/Wattsey/birefnet-lite-512-webgpu/config.json');
    expect(response.status).toBe(404);
    expect(base.calls).toHaveLength(0);
  });

  it('un modelo incluido se pide normalmente', async () => {
    const base = fakeFetch('application/json');
    const f = localModelFetch('/models/', ['BritishWerewolf/U-2-Netp'], base.fn, ORIGIN);
    const response = await f(`${ORIGIN}/models/BritishWerewolf/U-2-Netp/config.json`);
    expect(response.status).toBe(200);
    expect(base.calls).toHaveLength(1);
  });

  it('si el servidor devuelve la página principal (HTML), se trata como 404', async () => {
    const base = fakeFetch('text/html; charset=utf-8');
    const f = localModelFetch('/models/', ['BritishWerewolf/U-2-Netp'], base.fn, ORIGIN);
    expect((await f('/models/BritishWerewolf/U-2-Netp/onnx/model.onnx')).status).toBe(404);
  });

  it('las descargas de Hugging Face no se tocan', async () => {
    const base = fakeFetch('application/octet-stream');
    const f = localModelFetch('/models/', [], base.fn, ORIGIN);
    const url = 'https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx';
    expect((await f(url)).status).toBe(200);
    expect(base.calls).toEqual([url]);
  });
});
