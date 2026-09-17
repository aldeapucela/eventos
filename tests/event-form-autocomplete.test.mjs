import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findVenueSuggestions,
  formatPhotonAddress,
  normalizeAutocompleteText,
  normalizePhotonResults
} from '../src/scripts/event-form-autocomplete.js';

test('normaliza nombres de espacios para buscar sin tildes', () => {
  assert.equal(normalizeAutocompleteText('  Teatro Calderón  '), 'teatro calderon');
});

test('encuentra espacios conocidos priorizando los que empiezan por la consulta', () => {
  const spaces = [
    { name: 'Centro Cultural Miguel Delibes', address: 'Av. del Real Valladolid 2' },
    { name: 'Teatro Calderón', address: 'Calle Angustias 1' },
    { name: 'Calderón de la Barca', address: 'Otra calle 3' }
  ];
  assert.deepEqual(
    findVenueSuggestions(spaces, 'calderon').map((space) => space.name),
    ['Calderón de la Barca', 'Teatro Calderón']
  );
});

test('formatea una dirección de Photon con calle, número y ciudad', () => {
  assert.equal(
    formatPhotonAddress({ street: 'Calle Mayor', housenumber: '12', postcode: '47001', city: 'Valladolid' }),
    'Calle Mayor 12, 47001, Valladolid'
  );
});

test('normaliza y deduplica resultados de Photon', () => {
  const results = normalizePhotonResults([
    { properties: { name: 'Centro', street: 'Calle Mayor', housenumber: '12', city: 'Valladolid' } },
    { properties: { name: 'Centro', street: 'Calle Mayor', housenumber: '12', city: 'Valladolid' } },
    { properties: { name: 'Plaza Mayor', city: 'Valladolid' } }
  ]);
  assert.deepEqual(results.map((result) => result.address), [
    'Calle Mayor 12, Valladolid',
    'Plaza Mayor, Valladolid'
  ]);
});
