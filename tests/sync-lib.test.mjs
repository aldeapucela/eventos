import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRefreshTopicIds, shouldRefreshTopic, topicFromDetail, validateCategoryTopicsSnapshot } from '../scripts/sync-lib.mjs';
import { firstPostUpdatedAt } from '../src/data/discourse.mjs';
import { computeDigest, diffRecentPostSignatures, isCurrentOrFutureEvent, selectEditProbeBatch } from '../scripts/check-events-signature.mjs';

test('normaliza IDs de temas recibidos desde workflow_dispatch', () => {
  assert.deepEqual(
    [...normalizeRefreshTopicIds('2592, 2600 2600 invalid')],
    ['2592', '2600']
  );
});

test('solo fuerza la recarga del tema indicado', () => {
  const ids = normalizeRefreshTopicIds(['2592']);
  assert.equal(shouldRefreshTopic(2592, ids), true);
  assert.equal(shouldRefreshTopic(2600, ids), false);
});

test('reconstruye la proyección de un tema recuperado por ID', () => {
  assert.deepEqual(topicFromDetail({
    id: 2373,
    slug: 'la-famiglia-se-sienta-a-la-mesa-sesiones-de-djs',
    title: "La Famiglia se sienta a la mesa (Sesiones de DJ's)",
    category_id: 6,
    event_starts_at: '2026-09-04T19:00:00.000Z',
    event_ends_at: '2026-09-13T14:00:00.000Z',
    visible: true
  }), {
    id: 2373,
    slug: 'la-famiglia-se-sienta-a-la-mesa-sesiones-de-djs',
    title: "La Famiglia se sienta a la mesa (Sesiones de DJ's)",
    category_id: 6,
    created_at: undefined,
    last_posted_at: undefined,
    bumped_at: undefined,
    updated_at: undefined,
    image_url: undefined,
    event_starts_at: '2026-09-04T19:00:00.000Z',
    event_ends_at: '2026-09-13T14:00:00.000Z',
    visible: true,
    pinned: false,
    featured_link: ''
  });
});

test('lee updated_at del primer post aunque el stream no venga ordenado', () => {
  assert.equal(firstPostUpdatedAt({
    post_stream: { posts: [
      { post_number: 2, updated_at: '2026-09-15T12:00:00Z' },
      { post_number: 1, updated_at: '2026-09-15T11:00:00Z' }
    ] }
  }), '2026-09-15T11:00:00Z');
});

test('la sonda solo incluye eventos vigentes o futuros', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');
  assert.equal(isCurrentOrFutureEvent({ id: 1, visible: true, event_starts_at: '2026-09-16T10:00:00Z' }, now), true);
  assert.equal(isCurrentOrFutureEvent({ id: 2, visible: true, event_starts_at: '2026-09-10T10:00:00Z' }, now), false);
});

test('rota lotes acotados sin recorrer todos los eventos', () => {
  const topics = Array.from({ length: 45 }, (_, index) => ({
    id: index + 1,
    visible: true,
    event_starts_at: '2026-09-20T10:00:00Z'
  }));
  const first = selectEditProbeBatch(topics, 0, 20).map(({ id }) => id);
  const second = selectEditProbeBatch(topics, 15 * 60 * 1000, 20).map(({ id }) => id);
  const third = selectEditProbeBatch(topics, 30 * 60 * 1000, 20).map(({ id }) => id);
  assert.deepEqual(first, Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(second, Array.from({ length: 20 }, (_, index) => index + 21));
  assert.deepEqual(third, [41, 42, 43, 44, 45]);
});

test('la búsqueda reciente identifica el tema cuyo extracto cambió', () => {
  const initial = diffRecentPostSignatures(
    { posts: {} },
    [{ id: 10, topic_id: 2592, post_number: 1, blurb: 'Descripción anterior' }],
    new Set(['2592'])
  );
  assert.deepEqual(initial.editedIds, ['2592']);

  const changed = diffRecentPostSignatures(
    initial.currentState,
    [{ id: 10, topic_id: 2592, post_number: 1, blurb: 'Descripción corregida' }],
    new Set(['2592'])
  );
  assert.deepEqual(changed.editedIds, ['2592']);

  const unchanged = diffRecentPostSignatures(
    changed.currentState,
    [{ id: 10, topic_id: 2592, post_number: 1, blurb: 'Descripción corregida' }],
    new Set(['2592'])
  );
  assert.deepEqual(unchanged.editedIds, []);
  assert.equal(unchanged.stateChanged, false);
});

test('el digest ignora cambios en eventos ya pasados', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const future = { id: 2, slug: 'futuro', visible: true, updated_at: '2026-09-20T10:00:00Z', event_starts_at: '2026-09-25T10:00:00Z' };
  const past = { id: 1, slug: 'pasado', visible: true, updated_at: '2026-09-01T10:00:00Z', event_starts_at: '2026-09-01T10:00:00Z' };
  assert.equal(computeDigest([future, past], now), computeDigest([future, { ...past, updated_at: '2026-09-22T10:00:00Z' }], now));
  assert.notEqual(computeDigest([future, past], now), computeDigest([{ ...future, updated_at: '2026-09-22T10:00:00Z' }, past], now));
});

test('las firmas recientes ignoran temas que ya no son vigentes', () => {
  const result = diffRecentPostSignatures(
    { posts: { 1: 'anterior', 2: 'anterior' } },
    [
      { id: 10, topic_id: 1, post_number: 1, blurb: 'Pasado editado' },
      { id: 20, topic_id: 2, post_number: 1, blurb: 'Futuro editado' }
    ],
    new Set(['1', '2']),
    new Set(['2'])
  );
  assert.deepEqual(Object.keys(result.currentState.posts), ['2']);
  assert.deepEqual(result.editedIds, ['2']);
});

test('valida la instantánea compartida entre detector y build', () => {
  const topics = [{ id: 1, slug: 'evento' }];
  assert.equal(validateCategoryTopicsSnapshot(topics), topics);
  assert.throws(() => validateCategoryTopicsSnapshot([]), /vacío/);
  assert.throws(() => validateCategoryTopicsSnapshot([{ id: 1 }]), /inválidos/);
});
