import test from 'node:test';
import assert from 'node:assert/strict';
import { findSimilarEvents, normalizeComparable } from '../src/scripts/event-form-matching.js';

const events = [
  {
    id: 101,
    title: 'Concierto Kenny &amp; Blues Boss',
    startsAtIso: '2026-10-12T20:00:00+02:00',
    location: 'Sala Central',
    urlPath: '/e/101/concierto-kenny/'
  },
  {
    id: 102,
    title: 'Concierto Kenny & Blues Boss',
    startsAtIso: '2026-10-13T20:00:00+02:00',
    location: 'Sala Central',
    urlPath: '/e/102/concierto-kenny/'
  },
  {
    id: 103,
    title: 'Taller de fotografía nocturna',
    startsAtIso: '2026-10-12T18:30:00+02:00',
    location: 'Centro Cívico Norte',
    urlPath: '/e/103/taller-fotografia/'
  }
];

test('normaliza entidades HTML, mayúsculas y tildes', () => {
  assert.equal(normalizeComparable('Concierto Kenny &amp; BLÚES'), 'concierto kenny blues');
});

test('detecta título exacto en la misma fecha', () => {
  const matches = findSimilarEvents(events, {
    title: 'Concierto Kenny & Blues Boss',
    startDate: '2026-10-12',
    startTime: '20:00',
    location: 'Sala Central'
  });
  assert.deepEqual(matches.map(({ event }) => event.id), [101]);
});

test('no marca como duplicado el mismo título si cambia el día', () => {
  const matches = findSimilarEvents(events, {
    title: 'Concierto Kenny & Blues Boss',
    startDate: '2026-10-13',
    startTime: '20:00',
    location: 'Sala Central'
  });
  assert.deepEqual(matches.map(({ event }) => event.id), [102]);

  const differentDay = findSimilarEvents(events, {
    title: 'Concierto Kenny & Blues Boss',
    startDate: '2026-10-14',
    startTime: '20:00',
    location: 'Sala Central'
  });
  assert.deepEqual(differentDay, []);
});

test('detecta un título parecido cuando fecha y hora están próximas', () => {
  const matches = findSimilarEvents(events, {
    title: 'Fotografía nocturna',
    startDate: '2026-10-12',
    startTime: '19:00',
    location: 'Centro Cívico Norte'
  });
  assert.deepEqual(matches.map(({ event }) => event.id), [103]);
});

test('permite detectar un duplicado de día completo sin hora de inicio', () => {
  const matches = findSimilarEvents(events, {
    title: 'Concierto Kenny & Blues Boss',
    startDate: '2026-10-12',
    startTime: '',
    location: 'Sala Central'
  });
  assert.deepEqual(matches.map(({ event }) => event.id), [101]);
});

test('usa la dirección cuando el formulario no incluye lugar', () => {
  const matches = findSimilarEvents([
    {
      id: 104,
      title: 'Festival de prueba',
      startsAtIso: '2026-10-12T20:00:00+02:00',
      address: 'Plaza España, Valladolid',
      urlPath: '/e/104/festival-prueba/'
    }
  ], {
    title: 'Festival de prueba',
    startDate: '2026-10-12',
    startTime: '20:00',
    address: 'Plaza España'
  });
  assert.deepEqual(matches.map(({ event }) => event.id), [104]);
});
