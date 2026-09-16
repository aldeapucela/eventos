import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscourseTopic } from '../src/data/discourse.mjs';
import { buildEventJsonLd } from '../src/data/structured-data.mjs';

function normalize(customFields = {}, cooked = '', eventLocation = 'Sala Porta Caeli, Calle Mariano de los Cobos 1') {
  const topic = {
    id: 9001,
    slug: 'concierto-en-valladolid',
    title: 'Concierto en Valladolid',
    created_at: '2026-09-13T10:00:00Z',
    event_starts_at: '2026-09-20T18:00:00Z'
  };
  const detail = {
    post_stream: {
      posts: [{
        cooked,
        event: {
          name: topic.title,
          starts_at: topic.event_starts_at,
          location: eventLocation,
          custom_fields: customFields
        }
      }]
    }
  };
  return normalizeDiscourseTopic(topic, detail);
}

test('prefiere los metadatos del evento de Discourse y valida coordenadas y URL de entradas', () => {
  const event = normalize({
    latitude: '41.6523',
    longitude: '-4.7245',
    price: 'gratuito',
    address: 'Calle Mariano de los Cobos 1',
    organizer: 'Asociación Cultural',
    event_category: 'concierto',
    ticket_url: 'https://tickets.example.org/event?id=7&amp;ref=web'
  }, [
    '<p>Descripción larga y suficiente de un concierto para probar la ficha del evento.</p>',
    '<p>Precio: 12 €</p>',
    '<p>Categoría: charla</p>',
    '<p>Organizador: Texto antiguo</p>'
  ].join(''));

  assert.equal(event.latitude, 41.6523);
  assert.equal(event.longitude, -4.7245);
  assert.equal(event.price, 'Gratuito');
  assert.equal(event.isFree, true);
  assert.equal(event.address, 'Calle Mariano de los Cobos 1');
  assert.equal(event.organizer, 'Asociación Cultural');
  assert.equal(event.categoryLabel, 'Musica');
  assert.equal(event.ticketUrl, 'https://tickets.example.org/event?id=7&ref=web');
});

test('mantiene nombre y dirección separados y solo los combina para mostrar', () => {
  const event = normalize({ address: 'Calle Mariano de los Cobos 1' }, '', 'Sala Porta Caeli');

  assert.equal(event.venue, 'Sala Porta Caeli');
  assert.equal(event.address, 'Calle Mariano de los Cobos 1');
  assert.equal(event.displayLocation, 'Sala Porta Caeli · Calle Mariano de los Cobos 1');
});

test('corrige la dirección histórica que repetía la ubicación completa', () => {
  const event = normalize(
    { address: 'ZVMO C/ Calixto Fernández de la Torre esquina C/ Reina' },
    '',
    'ZVMO C/ Calixto Fernández de la Torre esquina C/ Reina'
  );

  assert.equal(event.venue, 'ZVMO');
  assert.equal(event.address, 'C/ Calixto Fernández de la Torre esquina C/ Reina');
  assert.equal(event.displayLocation, 'ZVMO · C/ Calixto Fernández de la Torre esquina C/ Reina');
});

test('mantiene el texto libre como respaldo cuando todavía no hay metadatos estructurados', () => {
  const event = normalize({}, [
    '<p>Descripción larga y suficiente de una actividad para probar los datos antiguos.</p>',
    '<p>Lugar: Centro Cívico, Calle Real 12</p>',
    '<p>Precio: gratuito</p>',
    '<p>Categoría: charla</p>',
    '<p>Organizador: Asociación Vecinal</p>'
  ].join(''), '');

  assert.equal(event.price, 'Gratuito');
  assert.equal(event.isFree, true);
  assert.equal(event.categoryLabel, 'Charlas');
  assert.equal(event.organizer, 'Asociación Vecinal');
  assert.match(event.location, /Centro Cívico/);
  assert.equal(event.latitude, null);
  assert.equal(event.longitude, null);
  assert.equal(event.ticketUrl, '');
});

test('no expone URLs inseguras y descarta coordenadas incompletas o fuera de rango', () => {
  const unsafeUrl = normalize({
    latitude: '41.6',
    longitude: '',
    ticket_url: 'javascript:alert(1)'
  });
  const outOfRange = normalize({ latitude: '91', longitude: '-4.7' });

  assert.equal(unsafeUrl.latitude, null);
  assert.equal(unsafeUrl.longitude, null);
  assert.equal(unsafeUrl.ticketUrl, '');
  assert.equal(outOfRange.latitude, null);
  assert.equal(outOfRange.longitude, null);
});

test('no importa el enlace del título a la ficha web como descripción ni como resumen', () => {
  const event = normalize({}, [
    '<p><a href="https://eventos.aldeapucela.org/e/9001/concierto-en-valladolid/">Concierto en Valladolid en eventos.aldeapucela.org</a></p>',
    '<details><summary>Descripción completa</summary>',
    '<p>Una descripción real y suficientemente larga del concierto para la ficha web.</p>',
    '</details>'
  ].join(''));

  assert.equal(event.summary, 'Una descripción real y suficientemente larga del concierto para la ficha web.');
  assert.doesNotMatch(event.descriptionHtml, /eventos\.aldeapucela\.org\/e\/9001/);
});

test('descarta también como resumen nativo una descripción que solo repite el enlace propio', () => {
  const topic = {
    id: 9001,
    slug: 'concierto-en-valladolid',
    title: 'Concierto en Valladolid',
    event_starts_at: '2026-09-20T18:00:00Z'
  };
  const detail = {
    post_stream: {
      posts: [{
        cooked: '<p>Una descripción real y suficientemente larga del concierto para la ficha web.</p>',
        event: {
          name: topic.title,
          starts_at: topic.event_starts_at,
          description: 'Concierto en Valladolid en eventos.aldeapucela.org'
        }
      }]
    }
  };
  const event = normalizeDiscourseTopic(topic, detail);
  assert.equal(event.summary, 'Una descripción real y suficientemente larga del concierto para la ficha web.');
});

test('el JSON-LD prefiere dirección y coordenadas del evento frente al registro general del local', () => {
  const jsonLd = buildEventJsonLd({
    id: 9001,
    slug: 'evento',
    title: 'Evento de prueba',
    startsAt: '2026-09-20T18:00:00Z',
    venue: 'Sala Porta Caeli',
    address: 'Calle del evento 5',
    latitude: 41.6523,
    longitude: -4.7245,
    isFree: true
  }, {
    publicBaseUrl: 'https://eventos.aldeapucela.org',
    venueEntry: { name: 'Sala Porta Caeli', address: 'Dirección del catálogo', lat: 41.65, lon: -4.72 }
  });

  assert.equal(jsonLd.location.address.streetAddress, 'Calle del evento 5');
  assert.equal(jsonLd.location.geo.latitude, 41.6523);
  assert.equal(jsonLd.location.geo.longitude, -4.7245);
});
