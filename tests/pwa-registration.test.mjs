import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const layout = await fs.readFile(new URL('../src/templates/layout.njk', import.meta.url), 'utf8');
const script = [...layout.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((source) => source.includes('serviceWorker.register'));

test('registra el service worker sin esperar a load ni a las imágenes', async () => {
  let registered = '';
  const registration = { active: { state: 'activated' } };
  const window = {};
  vm.runInNewContext(script, { window, navigator: { serviceWorker: {
    register(url) { registered = url; return Promise.resolve(registration); }
  } } });
  assert.equal(registered, '/service-worker.js');
  assert.equal(await window.__PWA_WORKER_REGISTRATION__, registration);
});

test('conserva errores de registro para el diagnóstico del navegador afectado', async () => {
  const window = {};
  vm.runInNewContext(script, { window, navigator: { serviceWorker: {
    register() { return Promise.reject(new Error('Worker bloqueado')); }
  } } });
  await window.__PWA_WORKER_REGISTRATION__.catch(() => {});
  assert.equal(window.__PWA_WORKER_ERROR__, 'Error: Worker bloqueado');
});
