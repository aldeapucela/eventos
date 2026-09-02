// node scratch/test_revalidation.mjs
import assert from 'node:assert/strict';
import { needsRevalidation } from '../scripts/sync-lib.mjs';

const now = Date.parse('2026-09-02T12:00:00.000Z');
const hours = (n) => new Date(now - n * 3600 * 1000).toISOString();
const days = (n) => new Date(now + n * 86400 * 1000).toISOString();

const soon = { event_starts_at: days(3) };
const faraway = { event_starts_at: days(90) };
const past = { event_starts_at: days(-30) };
const ongoing = { event_starts_at: days(-30), event_ends_at: days(10) };

// Sin fetchedAt (índice anterior a este cambio) se revalida una vez.
assert.equal(needsRevalidation(undefined, soon, now), true);
assert.equal(needsRevalidation({ fetchedAt: 'nope' }, soon, now), true);

// Dentro de la ventana: fresco por debajo del TTL, caducado por encima.
assert.equal(needsRevalidation({ fetchedAt: hours(1) }, soon, now), false);
assert.equal(needsRevalidation({ fetchedAt: hours(7) }, soon, now), true);

// Fuera de la ventana no se pide nada, ni pasados ni lejanos.
assert.equal(needsRevalidation({ fetchedAt: hours(99) }, past, now), false);
assert.equal(needsRevalidation(undefined, past, now), false);
assert.equal(needsRevalidation(undefined, faraway, now), false);

// Un evento largo que ya ha empezado pero no ha terminado sí se revalida.
assert.equal(needsRevalidation({ fetchedAt: hours(7) }, ongoing, now), true);

// Sin fechas en el topic no podemos descartarlo: manda el TTL.
assert.equal(needsRevalidation({ fetchedAt: hours(7) }, {}, now), true);
assert.equal(needsRevalidation({ fetchedAt: hours(1) }, {}, now), false);

console.log('ok');
