import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDescriptionHtml, cleanEventSummary, parseEventMetaFromHtml } from '../src/data/format.mjs';

test('no muestra atribución de origen para propuestas del formulario web', () => {
  const meta = parseEventMetaFromHtml(
    '<p><em>Evento importado desde <a href="https://t.me/c/2671330741/26290">formulario web</a></em></p>'
  );

  assert.equal(meta.importedFromChatUrl, '');
});

test('muestra en la web el contenido de details y elimina el enlace a la propia ficha', () => {
  const cooked = [
    '<p><a href="https://eventos.aldeapucela.org/e/2567/concierto-acustico/">Concierto acústico (Wilson Saliwonczyk) en eventos.aldeapucela.org</a></p>',
    '<details><summary>Descripción completa</summary>',
    '<p>La Librería Akelarre presenta un concierto acústico.</p>',
    '<p>Consulta <a href="https://example.org/programa">el programa</a>.</p>',
    '</details>',
    '<div class="discourse-post-event"><p> </p></div>',
    '<p>Precio: gratuito</p>',
    '<p><em>Evento importado desde <a href="https://t.me/AldeaPucela/244/221736">el grupo de chat</a></em></p>',
    '<p><a href="https://eventos.aldeapucela.org/e/2567/concierto-acustico/">Ver el evento en la web</a></p>'
  ].join('\n');

  const description = cleanDescriptionHtml(
    cooked,
    'Concierto acústico (Wilson Saliwonczyk)',
    'https://eventos.aldeapucela.org/e/2567/concierto-acustico/'
  );

  assert.match(description, /La Librería Akelarre presenta un concierto acústico/);
  assert.match(description, /href="https:\/\/example\.org\/programa"/);
  assert.doesNotMatch(description, /<details|<summary|Descripción completa/);
  assert.doesNotMatch(description, /Ver el evento en la web|eventos\.aldeapucela\.org/);
  assert.doesNotMatch(description, /Precio: gratuito|Evento importado desde|discourse-post-event/);
});

test('limpia el enlace propio de una descripción ya cacheada sin quitar enlaces a otras fichas', () => {
  const description = cleanDescriptionHtml([
    '<p><a href="https://eventos.aldeapucela.org/e/2567/concierto-acustico/">Concierto acústico (Wilson Saliwonczyk) en eventos.aldeapucela.org</a></p>',
    '<p>Descripción real del concierto.</p>',
    '<p><a href="https://eventos.aldeapucela.org/e/99/otro-evento/">Evento relacionado</a></p>'
  ].join('\n'), 'Concierto acústico (Wilson Saliwonczyk)', 'https://eventos.aldeapucela.org/e/2567/slug-nuevo/');

  assert.doesNotMatch(description, /2567\/concierto-acustico/);
  assert.match(description, /Descripción real del concierto/);
  assert.match(description, /99\/otro-evento/);
});

test('limpia el texto del enlace propio en summaries heredados de la caché', () => {
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
