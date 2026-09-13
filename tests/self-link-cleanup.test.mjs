import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscourseTopic } from '../src/data/discourse.mjs';
import { cleanDescriptionHtml, cleanEventSummary } from '../src/data/format.mjs';

test('excludes the linked event title from imported and cached descriptions while preserving other links', () => {
  const ownHref = 'https://eventos.aldeapucela.org/e/9001/old-slug/';
  const html = '<p><a href="' + ownHref + '">Concierto en Valladolid en eventos.aldeapucela.org</a></p>' +
    '<p>Descripción real suficientemente larga para la ficha.</p>' +
    '<p><a href="https://eventos.aldeapucela.org/e/99/otro-evento/">Evento relacionado</a></p>';
  const cleaned = cleanDescriptionHtml(html, 'Concierto en Valladolid', 'https://eventos.aldeapucela.org/e/9001/new-slug/');
  assert.doesNotMatch(cleaned, /9001\/old-slug/);
  assert.match(cleaned, /Descripción real suficientemente larga/);
  assert.match(cleaned, /99\/otro-evento/);

  const topic = { id: 9001, slug: 'new-slug', title: 'Concierto en Valladolid', event_starts_at: '2026-09-20T18:00:00Z' };
  const detail = { post_stream: { posts: [{ cooked: html, event: {
    name: topic.title,
    starts_at: topic.event_starts_at,
    description: 'Concierto en Valladolid en eventos.aldeapucela.org'
  } }] } };
  const event = normalizeDiscourseTopic(topic, detail);
  assert.equal(event.summary, 'Descripción real suficientemente larga para la ficha.');
  assert.doesNotMatch(event.descriptionHtml, /9001\/old-slug/);
});


test('cleans self-link labels inherited from cached summaries', () => {
  assert.equal(
    cleanEventSummary('Concierto en Valladolid en eventos.aldeapucela.org', 'Concierto en Valladolid', 9001),
    ''
  );
  assert.equal(
    cleanEventSummary('<a href="https://eventos.aldeapucela.org/e/9001/slug/">Enlace propio</a>', 'Concierto en Valladolid', 9001),
    ''
  );
  assert.equal(
    cleanEventSummary('Una descripción real del evento.', 'Concierto en Valladolid', 9001),
    'Una descripción real del evento.'
  );
});
