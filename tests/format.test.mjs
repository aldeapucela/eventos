import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDescriptionHtml } from '../src/data/format.mjs';

test('muestra en la web el contenido de details y elimina el enlace a la propia ficha', () => {
  const cooked = [
    '<p>Concierto acústico (Wilson Saliwonczyk)</p>',
    '<details><summary>Descripción completa</summary>',
    '<p>La Librería Akelarre presenta un concierto acústico.</p>',
    '<p>Consulta <a href="https://example.org/programa">el programa</a>.</p>',
    '</details>',
    '<div class="discourse-post-event"><p> </p></div>',
    '<p>Precio: gratuito</p>',
    '<p><em>Evento importado desde <a href="https://t.me/AldeaPucela/244/221736">el grupo de chat</a></em></p>',
    '<p><a href="https://eventos.aldeapucela.org/e/2567/concierto-acustico/">Ver el evento en la web</a></p>'
  ].join('\n');

  const description = cleanDescriptionHtml(cooked, 'Concierto acústico (Wilson Saliwonczyk)');

  assert.match(description, /La Librería Akelarre presenta un concierto acústico/);
  assert.match(description, /href="https:\/\/example\.org\/programa"/);
  assert.doesNotMatch(description, /<details|<summary|Descripción completa/);
  assert.doesNotMatch(description, /Ver el evento en la web|eventos\.aldeapucela\.org/);
  assert.doesNotMatch(description, /Precio: gratuito|Evento importado desde|discourse-post-event/);
});
