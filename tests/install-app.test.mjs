import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('../src/scripts/install-app.js', import.meta.url), 'utf8')).replace(/^import .*\n/, '');

function setup({ earlyPrompt = null, ios = false, standalone = false, mobile = true, legacy = false, relatedApps, fakeTimers = false } = {}) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const storage = new Map(legacy ? [['aldeapucela_install_app_dismissed_until', '9999999999999']] : []);
  const classes = new Set(['install-app-pill', 'hidden']);
  const trigger = { classList: {
    contains: (name) => classes.has(name),
    toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
  } };
  const menuClasses = new Set();
  const menu = { classList: {
    contains: () => false,
    toggle(name, enabled) { if (enabled) menuClasses.add(name); else menuClasses.delete(name); }
  } };
  let modal = null;
  let progress = null;
  const timers = new Map();
  let timerId = 0;
  const nodes = new Map();
  const context = {
    URLSearchParams,
    URL,
    window: {
      __PWA_INSTALL_PROMPT__: earlyPrompt,
      location: { hostname: 'eventos.aldeapucela.org', href: 'https://eventos.aldeapucela.org/', search: '' },
      navigator: { userAgent: ios ? 'iPhone' : 'Chrome', standalone, platform: '', maxTouchPoints: 0, getInstalledRelatedApps: relatedApps },
      setTimeout: fakeTimers ? (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; } : setTimeout,
      clearTimeout: fakeTimers ? (id) => timers.delete(id) : clearTimeout,
      scrollY: 300,
      localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      matchMedia: (query) => ({ matches: query.includes('display-mode') ? standalone : mobile, addEventListener() {} }),
      addEventListener: (name, callback) => windowListeners.set(name, callback),
      requestAnimationFrame: (callback) => callback()
    },
    document: {
      body: { style: {} },
      querySelectorAll: (selector) => selector === '[data-install-app-open]' ? [trigger, menu] : [],
      addEventListener: (name, callback) => documentListeners.set(name, callback)
    },
    getMountedModal: (key) => key === 'installProgress' ? progress : modal,
    mountModal: (key) => {
      if (key === 'installProgress') {
        progress ||= { hidden: true, querySelector: () => ({ focus() {} }) };
        return progress;
      }
      modal ||= { hidden: true, querySelector: (selector) => {
        if (!nodes.has(selector)) nodes.set(selector, { focus() {} });
        return nodes.get(selector);
      } };
      return modal;
    }
  };
  vm.runInNewContext(source, context);
  const click = (selector = '[data-install-app-open]') => documentListeners.get('click')({ preventDefault() {}, target: { closest: (value) => value === selector ? trigger : null } });
  return { context, classes, menuClasses, storage, nodes, timers, click, progress: () => progress, modal: () => modal, emit: (name, event = {}) => windowListeners.get(name)(event) };
}

test('muestra progreso solo al aceptar y se cierra a los 12 segundos', async () => {
  const app = setup({ earlyPrompt: promptEvent('accepted'), fakeTimers: true });
  await app.click();
  assert.equal(app.progress().hidden, false);
  app.emit('appinstalled');
  assert.equal(app.progress().hidden, false);
  const timer = [...app.timers.values()][0];
  assert.equal(timer.delay, 12000);
  timer.callback();
  assert.equal(app.progress().hidden, true);
  assert.equal(app.context.document.body.style.overflow, '');
});

test('cancelar no muestra progreso y el usuario puede cerrar el overlay antes', async () => {
  const dismissed = setup({ earlyPrompt: promptEvent('dismissed'), fakeTimers: true });
  await dismissed.click();
  assert.equal(dismissed.progress(), null);
  const accepted = setup({ earlyPrompt: promptEvent('accepted'), fakeTimers: true });
  await accepted.click();
  await accepted.click('[data-install-progress-close]');
  assert.equal(accepted.progress().hidden, true);
  assert.equal(accepted.timers.size, 0);
});

function promptEvent(outcome = 'dismissed') {
  return { calls: 0, preventDefault() {}, async prompt() { this.calls++; }, userChoice: Promise.resolve({ outcome }) };
}

test('oculta instalación en una pestaña cuando Chrome detecta la PWA instalada', async () => {
  const app = setup({ relatedApps: async () => [{ platform: 'webapp', url: 'https://eventos.aldeapucela.org/manifest.webmanifest' }] });
  assert.equal(app.classes.has('hidden'), true);
  await new Promise(setImmediate);
  assert.equal(app.classes.has('hidden'), true);
  assert.equal(app.menuClasses.has('hidden'), true);
  await app.click();
  assert.equal(app.modal(), null);
});

test('permite instalar si no está instalada o si falla la consulta', async () => {
  for (const relatedApps of [async () => [], async () => { throw new Error('No disponible'); }]) {
    const app = setup({ relatedApps });
    await new Promise(setImmediate);
    assert.equal(app.classes.has('hidden'), false);
  }
});

test('no confunde otras aplicaciones con esta PWA y detecta desinstalación al volver', async () => {
  let installed = true;
  const app = setup({ relatedApps: async () => installed ? [{ platform: 'webapp', url: '/manifest.webmanifest' }] : [{ platform: 'webapp', url: 'https://otro.example/manifest.webmanifest' }] });
  await new Promise(setImmediate);
  assert.equal(app.classes.has('hidden'), true);
  installed = false;
  await app.emit('focus');
  assert.equal(app.classes.has('hidden'), false);
});

test('usa el evento nativo capturado antes de cargar el módulo y permite reintentar', async () => {
  const first = promptEvent();
  const app = setup({ earlyPrompt: first });
  await app.click();
  assert.equal(first.calls, 1);
  assert.equal(app.modal(), null);
  assert.equal(app.classes.has('hidden'), false);
  assert.equal(app.classes.has('install-app-pill-compact'), true);
  await app.click();
  assert.equal(first.calls, 1);
  assert.equal(app.modal().hidden, false);
  const next = promptEvent();
  app.emit('beforeinstallprompt', next);
  assert.equal(app.classes.has('install-app-pill-compact'), false);
  await app.click();
  assert.equal(next.calls, 1);
});

test('iPhone conserva un icono accesible tras cerrar las instrucciones', async () => {
  const app = setup({ ios: true });
  await app.click();
  assert.match(app.nodes.get('[data-install-app-steps]').innerHTML, /Compartir/);
  await app.click('[data-install-app-close]');
  assert.equal(app.modal().hidden, true);
  assert.equal(app.classes.has('hidden'), false);
  assert.equal(app.classes.has('install-app-pill-compact'), true);
  await app.click();
  assert.equal(app.modal().hidden, false);
});

test('el antiguo bloqueo de 30 días ya no oculta el acceso', () => {
  const app = setup({ legacy: true });
  assert.equal(app.classes.has('hidden'), false);
  assert.equal(app.classes.has('install-app-pill-compact'), true);
});

test('oculta los accesos en standalone y tras confirmar appinstalled', () => {
  const standalone = setup({ standalone: true });
  assert.equal(standalone.classes.has('hidden'), true);
  assert.equal(standalone.menuClasses.has('hidden'), true);
  const app = setup();
  app.emit('appinstalled');
  assert.equal(app.classes.has('hidden'), true);
  assert.equal(app.menuClasses.has('hidden'), true);
});

test('solo la pastilla flotante espera al scroll; el menú sigue accesible', () => {
  const app = setup();
  app.context.window.scrollY = 0;
  app.emit('scroll');
  assert.equal(app.classes.has('hidden'), true);
  assert.equal(app.menuClasses.has('hidden'), false);
  app.context.window.scrollY = 300;
  app.emit('scroll');
  assert.equal(app.classes.has('hidden'), false);
});

test('Chrome de escritorio conserva el acceso tras cancelar el instalador', async () => {
  const app = setup({ mobile: false, earlyPrompt: promptEvent() });
  await app.click();
  assert.equal(app.classes.has('hidden'), false);
});

test('un fallo del prompt muestra instrucciones y no bloquea reintentos', async () => {
  const event = promptEvent();
  event.prompt = async () => { throw new Error('Permiso retirado'); };
  const app = setup({ earlyPrompt: event });
  await app.click();
  assert.equal(app.modal().hidden, false);
  assert.equal(app.classes.has('hidden'), false);
});
