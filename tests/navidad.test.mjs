import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeTopicTags } from '../src/data/discourse.mjs';
import { withListingTags } from '../scripts/sync-lib.mjs';
import { fillLightCounts, selectNavidadEvents, summarizeLights, visibleSections } from '../src/data/navidad.mjs';

test('normaliza etiquetas de Discourse como cadenas u objetos', () => {
  assert.deepEqual(normalizeTopicTags(['Navidad', { id: 3, name: 'infantil' }, { slug: 'navidad' }, '', null]), ['navidad', 'infantil']);
  assert.deepEqual(normalizeTopicTags(undefined), []);
});

test('un registro en caché toma las etiquetas del listado, que no cambian la firma', () => {
  const cached = { id: 1, title: 'Belén', tags: [] };
  assert.deepEqual(withListingTags(cached, { id: 1, tags: [{ name: 'Navidad' }] }).tags, ['navidad']);
  // Sin campo tags en el listado (p. ej. tema recuperado sin él) se conserva lo que había.
  assert.equal(withListingTags(cached, { id: 1 }), cached);
});

test('selecciona los eventos con la etiqueta o añadidos a mano por ID', () => {
  const events = [
    { id: 1, tags: ['navidad'] },
    { id: 2, tags: ['musica'] },
    { id: 3 },
    { id: 4, tags: ['navidad', 'infantil'] }
  ];
  const ids = selectNavidadEvents(events, { tag: 'Navidad', extraEventIds: [3] }).map((event) => event.id);
  assert.deepEqual(ids, [1, 3, 4]);
});

test('resume el mapa de luces real y rellena los recuentos de la FAQ', async () => {
  const geojson = JSON.parse(await fs.readFile(new URL('../src/data/navidad-luces.geojson', import.meta.url), 'utf8'));
  const lights = summarizeLights(geojson);
  assert.ok(lights.streets.length > 50);
  assert.ok(lights.streets.includes('Santiago'));
  assert.ok(lights.squares.includes('Plaza Mayor'));
  assert.equal(fillLightCounts('{streets} calles y {trees} árboles', lights), `${lights.streets.length} calles y ${lights.trees.length} árboles`);
});

test('oculta las secciones de navidad.json sin datos', async () => {
  const navidad = JSON.parse(await fs.readFile(new URL('../src/data/navidad.json', import.meta.url), 'utf8'));
  const ids = visibleSections(navidad.sections).map((section) => section.id);
  assert.ok(ids.includes('mercado'));
  assert.ok(!ids.includes('horarios'));
  // Cada fecha clave apunta a una sección que existe en la página.
  const anchors = new Set([navidad.lights.id, ...ids]);
  for (const item of navidad.keyDates) assert.ok(anchors.has(item.anchor), item.anchor);
});
