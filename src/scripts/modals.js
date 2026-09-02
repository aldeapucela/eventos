// Markup de los modales del sitio, fuera del HTML servido.
//
// Por qué: el bloque de modales (calendario, entradas, lightbox, ubicación,
// suscripción, buscador, instalar app, drawer) era el 46% de las palabras
// visibles y el 51% de los bytes de cada ficha de evento, idéntico en las ~1.400
// fichas y repetido en el resto del sitio. Tanto boilerplate diluye el contenido
// propio de cada URL. Ahora el HTML solo lleva los botones que abren cada modal y
// el markup se inyecta aquí, en el primer clic.
//
// En el primer clic y no al cargar a propósito: Googlebot renderiza JS, así que
// inyectarlo al cargar dejaría el bloque en el DOM renderizado y no habríamos
// ganado nada.
//
// Los templates replican el markup que vivía en los partials y en las plantillas
// (mismas clases, roles y aria-*), así que el CSS y los tests visuales no cambian.

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const NAV_BY_PREFIX = [
  ['/espacios', 'spaces'],
  ['/tipos', 'types'],
  ['/t/', 'types'],
  ['/guardados', 'saved'],
  ['/archivo', 'archive']
];

// Antes lo pasaba nunjucks como `activeNav`. Ahora se deriva de la URL: las
// páginas temporales (/hoy/, /fin-de-semana/…) cuentan como portada, igual que
// hacía build.mjs.
export function activeNavFromPath(pathname = window.location.pathname) {
  const path = String(pathname || '/');
  for (const [prefix, nav] of NAV_BY_PREFIX) {
    if (path.startsWith(prefix)) return nav;
  }
  return 'home';
}

const TEMPLATES = {
  calendar: () => `
<div class="calendar-modal" data-calendar-modal hidden>
  <button class="calendar-modal-backdrop" type="button" data-calendar-close aria-label="Cerrar"></button>
  <div class="calendar-modal-panel" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title">
    <div class="calendar-modal-header">
      <h2 class="calendar-modal-title" id="calendar-modal-title">Añadir al calendario</h2>
      <button class="calendar-modal-close" type="button" data-calendar-close aria-label="Cerrar">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <p class="calendar-modal-copy">Elige dónde guardarlo.</p>
    <div class="calendar-modal-actions">
      <a class="calendar-modal-action calendar-modal-action-primary" data-calendar-ics href="#" download>
        <i class="fa-solid fa-download"></i>
        <span>Descargar ICS</span>
      </a>
      <a class="calendar-modal-action" data-calendar-google href="#" target="_blank" rel="noreferrer">
        <i class="fa-brands fa-google"></i>
        <span>Google Calendar</span>
      </a>
      <a class="calendar-modal-action" data-calendar-apple href="#" target="_blank" rel="noreferrer">
        <i class="fa-brands fa-apple"></i>
        <span>Apple Calendar</span>
      </a>
      <a class="calendar-modal-action" data-calendar-outlook href="#" target="_blank" rel="noreferrer">
        <i class="fa-brands fa-microsoft"></i>
        <span>Outlook</span>
      </a>
    </div>
  </div>
</div>`,

  ticket: () => `
<div class="calendar-modal" data-ticket-search-modal hidden>
  <button class="calendar-modal-backdrop" type="button" data-ticket-search-close aria-label="Cerrar"></button>
  <div class="calendar-modal-panel" role="dialog" aria-modal="true" aria-labelledby="ticket-search-modal-title">
    <div class="calendar-modal-header">
      <h2 class="calendar-modal-title" id="ticket-search-modal-title">Antes de continuar</h2>
      <button class="calendar-modal-close" type="button" data-ticket-search-close aria-label="Cerrar">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <p class="calendar-modal-copy">
      Se te va a redirigir a la búsqueda de Perplexity para
      <strong>buscar el sitio oficial de entradas</strong>.
    </p>
    <ul class="calendar-modal-copy-list">
      <li>Verifica siempre el sitio antes de pagar.</li>
      <li>Comprueba que la web es oficial o parte del promotor o artista.</li>
      <li>Desconfía de precios inusualmente bajos o webs sin datos del organizador.</li>
      <li>Esta web no se hace responsable de compras realizadas en sitios no oficiales ni de posibles fraudes derivados.</li>
    </ul>
    <div class="calendar-modal-actions">
      <button class="calendar-modal-action calendar-modal-action-primary" type="button" data-ticket-search-confirm>
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
        <span>Entendido, continuar</span>
      </button>
    </div>
  </div>
</div>`,

  lightbox: () => `
<div class="detail-lightbox" data-lightbox hidden>
  <button class="detail-lightbox-backdrop" type="button" data-lightbox-close aria-label="Cerrar imagen"></button>
  <div class="detail-lightbox-panel" role="dialog" aria-modal="true" aria-label="Imagen del evento">
    <img class="detail-lightbox-image" data-lightbox-image alt="" />
    <button class="detail-lightbox-close" type="button" data-lightbox-close aria-label="Cerrar">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>
</div>`,

  location: () => `
<div class="location-modal" data-location-modal hidden>
  <button class="location-modal-backdrop" type="button" data-location-close aria-label="Cerrar"></button>
  <div class="location-modal-panel" role="dialog" aria-modal="true" aria-labelledby="location-modal-title">
    <div class="location-modal-header">
      <p class="location-modal-title" id="location-modal-title">Abrir ubicación en</p>
      <button class="location-modal-close" type="button" data-location-close aria-label="Cerrar">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="location-modal-actions">
      <a class="location-modal-action" data-location-map="openstreetmap" href="#" target="_blank" rel="noreferrer">
        <i class="fa-solid fa-map-location-dot"></i>
        <span>OpenStreetMap</span>
      </a>
      <a class="location-modal-action" data-location-map="google" href="#" target="_blank" rel="noreferrer">
        <i class="fa-brands fa-google"></i>
        <span>Google Maps</span>
      </a>
      <a class="location-modal-action" data-location-map="apple" href="#" target="_blank" rel="noreferrer">
        <i class="fa-brands fa-apple"></i>
        <span>Apple Maps</span>
      </a>
      <a class="location-modal-action" data-location-map="bing" href="#" target="_blank" rel="noreferrer">
        <i class="fa-brands fa-microsoft"></i>
        <span>Bing Maps</span>
      </a>
    </div>
  </div>
</div>`
};

const mounted = new Map();

// Inyecta el modal `key` en el body la primera vez que se pide y lo devuelve.
// Idempotente: las siguientes llamadas devuelven el nodo ya montado.
export function mountModal(key, options = {}) {
  if (mounted.has(key)) return mounted.get(key);
  const template = TEMPLATES[key];
  if (!template) return null;
  const wrap = document.createElement('div');
  wrap.innerHTML = template(options).trim();
  const node = wrap.firstElementChild;
  if (!node) return null;
  document.body.appendChild(node);
  mounted.set(key, node);
  // Deja que otros módulos resincronicen lo que dependa de este markup (el
  // estado del toggle de tema, los filtros del drawer, el botón de instalar).
  document.dispatchEvent(new CustomEvent('modal:mounted', { detail: { key, node } }));
  return node;
}

// El nodo si ya está montado, null si nadie lo ha abierto todavía. Para los
// handlers de Escape y de cierre, que no deben montar nada.
export function getMountedModal(key) {
  return mounted.get(key) || null;
}

export { escapeHtml };
