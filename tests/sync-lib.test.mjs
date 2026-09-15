import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRefreshTopicIds, shouldRefreshTopic } from '../scripts/sync-lib.mjs';

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
