import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadVallabusStops, normalizeVallabusStops, nearbyVallabusStops } from '../src/data/vallabus.mjs';
import { getPopularThresholds, rankPopularEvents } from '../src/scripts/popular-ranking.js';
import { buildAndroidMapUrl, buildMapProviderHref, getLocationCoordinates } from '../src/scripts/location-link.js';
import { groupFutureEventsByVenue } from '../src/data/site.mjs';

test('el enlace Ver en mapa conserva coordenadas y ofrece proveedores en vez de fijar OpenStreetMap', () => {
  const coordinates = getLocationCoordinates({ dataset: { locationLat: '41.65', locationLon: '-4.72' } });
  assert.deepEqual(coordinates, { lat: 41.65, lon: -4.72 });
  assert.equal(getLocationCoordinates({ dataset: { locationLat: '', locationLon: '-4.72' } }), null);
  assert.equal(buildMapProviderHref('openstreetmap', 'Teatro Zorrilla, Valladolid', coordinates), 'https://www.openstreetmap.org/?mlat=41.65&mlon=-4.72#map=16/41.65,-4.72');
  assert.equal(buildMapProviderHref('google', 'Teatro Zorrilla, Valladolid', coordinates), 'https://maps.google.com/?q=41.65%2C-4.72');
  assert.equal(buildMapProviderHref('apple', 'Teatro Zorrilla, Valladolid', coordinates), 'https://maps.apple.com/?ll=41.65,-4.72&q=Teatro%20Zorrilla%2C%20Valladolid');
  assert.equal(buildAndroidMapUrl('Teatro Zorrilla, Valladolid', coordinates), 'geo:41.65,-4.72?q=41.65,-4.72(Teatro%20Zorrilla%2C%20Valladolid)');
  assert.equal(buildAndroidMapUrl('Teatro Zorrilla, Valladolid'), 'geo:0,0?q=Teatro%20Zorrilla%2C%20Valladolid');
});

test('normaliza paradas de VallaBus, descarta entradas incompletas y evita duplicados', () => {
  const stops = normalizeVallabusStops([
    { parada: { numero: '12', nombre: 'Plaza Mayor' }, ubicacion: { y: 41.65, x: -4.72 }, lineas: { ordinarias: ['2', '1', '2'] } },
    { parada: { numero: '12', nombre: 'Duplicada' }, ubicacion: { y: 41.65, x: -4.72 }, lineas: { ordinarias: ['2'] } },
    { parada: { numero: '13', nombre: 'Sin coordenadas' }, ubicacion: { y: null, x: null }, lineas: { ordinarias: ['3'] } }
  ]);

  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].lines, ['1', '2']);
  assert.equal(stops[0].name, 'Plaza Mayor');
});

test('usa la caché reciente de VallaBus cuando el feed no está disponible', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aldea-vallabus-'));
  const cacheFile = path.join(tempDir, 'stops.json');
  const feed = [{
    parada: { numero: '42', nombre: 'Teatro Zorrilla' },
    ubicacion: { y: 41.6513, x: -4.728 },
    lineas: { ordinarias: ['3', 'C1'] }
  }];

  try {
    await loadVallabusStops({
      cacheFile,
      fetcher: async () => ({ ok: true, json: async () => feed })
    });
    const cachedStops = await loadVallabusStops({
      cacheFile,
      fetcher: async () => { throw new Error('network unavailable'); }
    });

    assert.equal(cachedStops.length, 1);
    assert.equal(cachedStops[0].name, 'Teatro Zorrilla');
    assert.deepEqual(cachedStops[0].lines, ['3', 'C1']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('selecciona hasta tres paradas en 500 m y solo amplía a 1 km si no hay ninguna cerca', () => {
  const origin = { lat: 41.65, lon: -4.72 };
  const stops = [
    { number: '1', name: 'A', lat: 41.6505, lon: -4.72, lines: ['1'] },
    { number: '2', name: 'B', lat: 41.651, lon: -4.72, lines: ['2'] },
    { number: '3', name: 'C', lat: 41.6515, lon: -4.72, lines: ['3'] },
    { number: '4', name: 'D', lat: 41.656, lon: -4.72, lines: ['4'] }
  ];

  assert.deepEqual(nearbyVallabusStops(origin, stops).map((stop) => stop.number), ['1', '2', '3']);
  assert.deepEqual(nearbyVallabusStops({ lat: 41.65, lon: -4.72 }, [stops[3]]).map((stop) => stop.number), ['4']);
  assert.deepEqual(nearbyVallabusStops({ lat: null, lon: null }, stops), []);
});

test('ranking popular filtra finalizados, ordena por métrica y cae a cinco si nadie supera el umbral', () => {
  const now = new Date('2026-09-13T12:00:00Z');
  const events = Array.from({ length: 7 }, (_, index) => ({
    id: String(index + 1),
    venueKey: index % 2 ? 'centro' : 'norte',
    startsAtIso: `2026-09-${String(14 + index).padStart(2, '0')}T18:00:00Z`,
    endsAtIso: `2026-09-${String(14 + index).padStart(2, '0')}T20:00:00Z`
  }));
  events.push({ id: '8', venueKey: 'centro', startsAtIso: '2026-09-10T18:00:00Z', endsAtIso: '2026-09-10T20:00:00Z' });
  const activities = events.map((event, index) => ({ id: event.id, saveCount: index + 1, visitCount: (index + 1) * 10 }));

  assert.equal(rankPopularEvents(events, activities, 'saves', '', now).length, 5);
  assert.equal(rankPopularEvents(events, activities, 'saves', '', now)[0].id, '7');
  assert.equal(rankPopularEvents(events, activities, 'visits', 'centro', now).every((event) => event.venueKey === 'centro'), true);
  assert.equal(rankPopularEvents(events, activities, 'saves', '', now).some((event) => event.id === '8'), false);
});

test('el mínimo de visitas usa el 0,5 % del total y nunca baja de tres', () => {
  assert.deepEqual(getPopularThresholds([{ visitCount: 1000 }, { visitCount: 600 }]), { minSaves: 10, minVisits: 8 });
  assert.deepEqual(getPopularThresholds([{ visitCount: 20 }]), { minSaves: 10, minVisits: 3 });
});

test('agrupa por recinto aunque cambie la dirección concreta del evento', () => {
  const groups = groupFutureEventsByVenue([
    { id: 1, venue: 'Sala de pruebas', address: 'Calle A 1', startsAt: '2027-01-10T18:00:00Z' },
    { id: 2, venue: 'Sala de pruebas', address: 'Calle B 2', startsAt: '2027-01-11T18:00:00Z' }
  ], { openEnded: true });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].addressHints, ['Calle A 1', 'Calle B 2']);
});

test('ordena por visitas usando un orden opaco sin exponer las cifras', () => {
  const now = new Date('2026-09-14T12:00:00Z');
  const events = [
    { id: '1', startsAtIso: '2026-09-15T18:00:00Z', endsAtIso: '2026-09-15T20:00:00Z' },
    { id: '2', startsAtIso: '2026-09-16T18:00:00Z', endsAtIso: '2026-09-16T20:00:00Z' }
  ];
  const activities = [{ id: '1', saveCount: 1 }, { id: '2', saveCount: 2 }];

  assert.deepEqual(
    rankPopularEvents(events, activities, 'visits', '', now, ['2', '1']).map((event) => event.id),
    ['2', '1']
  );
});
