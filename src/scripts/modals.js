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
// hacía build.mjs. La ficha de evento no es ninguna sección del menú, así que
// no marca ninguna (es lo que hacía antes, sin activeNav en su contexto).
export function activeNavFromPath(pathname = window.location.pathname) {
  const path = String(pathname || '/');
  if (path.startsWith('/e/')) return '';
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
</div>`,

  // El select de categorías lo pintaba nunjucks con `categoryFeeds`. Ahora el
  // catálogo llega por window.__CATEGORY_FEEDS__ (unos cientos de bytes dentro de
  // un <script>, que no cuenta como texto de la página).
  subscribe: () => {
    const feeds = Array.isArray(window.__CATEGORY_FEEDS__) ? window.__CATEGORY_FEEDS__ : [];
    const categorySection = feeds.length ? `
    <section class="subscribe-section" data-subscribe-section="rss">
      <p class="subscribe-section-title"><i class="fa-solid fa-layer-group"></i><span>Por categoría</span></p>
      <p class="subscribe-section-copy">Elige una categoría.</p>
      <div class="subscribe-category-picker" data-category-picker>
        <label class="subscribe-category-field">
          <span class="subscribe-category-field-label">Categoría</span>
          <select class="subscribe-category-select" data-category-select>
            ${feeds.map((feed) => `<option value="${escapeHtml(feed.slug)}">${escapeHtml(feed.label)}</option>`).join('')}
          </select>
        </label>
        <div class="subscribe-url-row">
          <input class="subscribe-url-input" type="text" value="${escapeHtml(feeds[0].url)}" readonly data-copy-source="category-selected" data-category-url />
          <button class="calendar-modal-action calendar-modal-action-primary subscribe-copy-btn" type="button" data-copy-url="category-selected">Copiar</button>
        </div>
        <div class="subscribe-links-grid subscribe-links-grid-tight">
          <a class="calendar-modal-action" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feeds[0].webcalUrl)}" target="_blank" rel="noopener noreferrer" data-category-google><i class="fa-brands fa-google" aria-hidden="true"></i><span>Google Calendar</span></a>
          <a class="calendar-modal-action" href="${escapeHtml(feeds[0].webcalUrl)}" data-category-apple><i class="fa-brands fa-apple" aria-hidden="true"></i><span>Apple Calendar</span></a>
          <a class="calendar-modal-action" href="${escapeHtml(feeds[0].webcalUrl)}" data-category-other><i class="fa-solid fa-globe" aria-hidden="true"></i><span>Otros calendarios</span></a>
        </div>
      </div>
    </section>` : '';
    return `
<div class="calendar-modal" data-subscribe-modal hidden>
  <button class="calendar-modal-backdrop" type="button" data-subscribe-close aria-label="Cerrar diálogo"></button>
  <aside class="calendar-modal-panel subscribe-modal-panel" role="dialog" aria-modal="true" aria-labelledby="subscribe-modal-title">
    <div class="calendar-modal-header">
      <div>
        <p class="calendar-modal-title" id="subscribe-modal-title">Suscribirse</p>
        <p class="calendar-modal-copy">Elige cómo seguir la agenda.</p>
      </div>
      <button class="calendar-modal-close" type="button" data-subscribe-close aria-label="Cerrar">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <section class="subscribe-section" data-subscribe-section="calendar">
      <p class="subscribe-section-title"><i class="fa-regular fa-calendar"></i><span>Calendario completo</span></p>
      <p class="subscribe-section-copy">Calendario con próximos eventos e histórico.</p>
      <div class="subscribe-url-row">
        <input class="subscribe-url-input" type="text" value="https://eventos.aldeapucela.org/calendar.ics" readonly data-copy-source="calendar" />
        <button class="calendar-modal-action calendar-modal-action-primary subscribe-copy-btn" type="button" data-copy-url="calendar">Copiar</button>
      </div>
      <div class="subscribe-links-grid">
        <a class="calendar-modal-action" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://eventos.aldeapucela.org/calendar.ics')}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-google" aria-hidden="true"></i><span>Google Calendar</span></a>
        <a class="calendar-modal-action" href="webcal://eventos.aldeapucela.org/calendar.ics"><i class="fa-brands fa-apple" aria-hidden="true"></i><span>Apple Calendar</span></a>
        <a class="calendar-modal-action" href="webcal://eventos.aldeapucela.org/calendar.ics"><i class="fa-solid fa-globe" aria-hidden="true"></i><span>Otros calendarios</span></a>
      </div>
    </section>

    <section class="subscribe-section subscribe-section-featured" data-subscribe-section="newsletter">
      <div class="subscribe-featured-copy">
        <p class="subscribe-section-title"><i class="fa-regular fa-envelope"></i><span>Boletín semanal</span></p>
        <p class="subscribe-section-copy">Resumen semanal por email.</p>
      </div>
      <a class="calendar-modal-action subscribe-newsletter-action" href="https://aldeapucela.org/boletin/" target="_blank" rel="noopener noreferrer">
        <i class="fa-regular fa-paper-plane" aria-hidden="true"></i>
        <span>Suscribirse por email</span>
      </a>
    </section>
${categorySection}
    <section class="subscribe-section">
      <p class="subscribe-section-title"><i class="fa-solid fa-rss"></i><span>RSS</span></p>
      <p class="subscribe-section-copy">Recibe nuevas publicaciones en tu lector favorito.</p>
      <div class="subscribe-url-row">
        <input class="subscribe-url-input" type="text" value="https://eventos.aldeapucela.org/rss.xml" readonly data-copy-source="rss" />
        <button class="calendar-modal-action calendar-modal-action-primary subscribe-copy-btn" type="button" data-copy-url="rss">Copiar</button>
      </div>
      <div class="subscribe-links-grid">
        <a class="calendar-modal-action" href="https://feedly.com/i/subscription/feed/https%3A%2F%2Feventos.aldeapucela.org%2Frss.xml" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-feedly" aria-hidden="true"></i><span>Feedly</span></a>
        <a class="calendar-modal-action" href="https://www.inoreader.com/?add_feed=https%3A%2F%2Feventos.aldeapucela.org%2Frss.xml" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-rss" aria-hidden="true"></i><span>Inoreader</span></a>
        <a class="calendar-modal-action" href="https://theoldreader.com/feeds/subscribe?url=https%3A%2F%2Feventos.aldeapucela.org%2Frss.xml" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-rss" aria-hidden="true"></i><span>The Old Reader</span></a>
      </div>
    </section>
  </aside>
</div>`;
  },

  search: () => `
<div class="calendar-modal search-modal" data-search-modal hidden>
  <button class="calendar-modal-backdrop" type="button" data-search-close aria-label="Cerrar búsqueda"></button>
  <aside class="calendar-modal-panel search-modal-panel" role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
    <p class="sr-only" id="search-modal-title">Buscar en la agenda</p>
    <div class="search-modal-field">
      <i class="fa-solid fa-magnifying-glass search-modal-field-icon" aria-hidden="true"></i>
      <input
        class="search-modal-input"
        type="search"
        data-search-input
        placeholder="Buscar eventos, espacios o tipos…"
        aria-label="Buscar eventos, espacios o tipos"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="search"
      />
      <button class="search-modal-close" type="button" data-search-close aria-label="Cerrar búsqueda">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
    <div class="search-modal-results" data-search-results aria-live="polite">
      <p class="search-modal-hint">Escribe para buscar por nombre de evento, espacio o tipo (música, cine…).</p>
    </div>
  </aside>
</div>`,

  install: () => `
<div class="calendar-modal" data-install-modal hidden>
  <button class="calendar-modal-backdrop" type="button" data-install-app-close aria-label="Cerrar diálogo"></button>
  <aside class="calendar-modal-panel install-app-modal-panel" role="dialog" aria-modal="true" aria-labelledby="install-app-title">
    <div class="calendar-modal-header">
      <div>
        <p class="calendar-modal-title" id="install-app-title">Añadir al inicio</p>
        <p class="calendar-modal-copy" data-install-app-copy hidden></p>
      </div>
      <button class="calendar-modal-close" type="button" data-install-app-close aria-label="Cerrar">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="install-app-modal-body">
      <ol class="install-app-steps" data-install-app-steps></ol>
      <button class="calendar-modal-action calendar-modal-action-primary install-app-modal-button" type="button" data-install-app-confirm hidden>Instalar app</button>
    </div>
  </aside>
</div>`,

  // `activeNav` y `showFilters` los pasaba nunjucks; ahora se derivan en el
  // cliente (ver activeNavFromPath y setupMenuDrawer).
  menuDrawer: ({ activeNav = 'home', showFilters = false } = {}) => {
    const link = (nav, href, icon, label) =>
      `<a class="menu-drawer-link${activeNav === nav ? ' menu-drawer-link-active' : ''}" href="${href}">
        <i class="menu-drawer-link-icon ${icon}" aria-hidden="true"></i>
        <span>${label}</span>
      </a>`;
    const filters = showFilters ? `
    <p class="menu-drawer-section-title">Filtros</p>
    <div class="menu-drawer-actions">
      <a class="menu-drawer-pick" href="/hoy/" data-time-link>
        <i class="menu-drawer-pick-icon fa-regular fa-sun" aria-hidden="true"></i>
        <span>Hoy</span>
      </a>
      <a class="menu-drawer-pick" href="/esta-semana/" data-time-link>
        <i class="menu-drawer-pick-icon fa-regular fa-calendar" aria-hidden="true"></i>
        <span>Esta semana</span>
      </a>
      <a class="menu-drawer-pick" href="/proxima-semana/" data-time-link>
        <i class="menu-drawer-pick-icon fa-solid fa-calendar-plus" aria-hidden="true"></i>
        <span>Próxima semana</span>
      </a>
      <a class="menu-drawer-pick" href="/fin-de-semana/" data-time-link>
        <i class="menu-drawer-pick-icon fa-solid fa-umbrella-beach" aria-hidden="true"></i>
        <span>Este finde</span>
      </a>
      <button class="menu-drawer-pick" type="button" data-date-modal-open>
        <i class="menu-drawer-pick-icon fa-regular fa-calendar-days" aria-hidden="true"></i>
        <span data-drawer-date-label>Fecha</span>
      </button>
      <button class="menu-drawer-pick" type="button" data-filter="free">
        <i class="menu-drawer-pick-icon fa-solid fa-ticket" aria-hidden="true"></i>
        <span>Gratis</span>
      </button>
    </div>` : '';
    return `
<div class="menu-drawer" data-menu-drawer hidden>
  <button class="menu-drawer-backdrop" type="button" data-menu-close aria-label="Cerrar menú"></button>
  <aside class="menu-drawer-panel" role="dialog" aria-modal="true" aria-label="Secciones">
    <div class="menu-drawer-head">
      <div>
        <p class="menu-drawer-kicker">ALDEA PUCELA</p>
        <p class="menu-drawer-title">Eventos</p>
      </div>
      <button class="menu-drawer-close" type="button" data-menu-close aria-label="Cerrar menú">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <nav class="menu-drawer-nav" aria-label="Navegación">
      ${link('home', '/', 'fa-solid fa-house', 'Inicio')}
      ${link('spaces', '/espacios/', 'fa-solid fa-location-dot', 'Espacios')}
      ${link('types', '/tipos/', 'fa-solid fa-filter', 'Tipos')}
      ${link('saved', '/guardados/', 'fa-regular fa-bookmark', 'Mis guardados')}
      ${link('archive', '/archivo/', 'fa-solid fa-box-archive', 'Archivo')}
      <button class="menu-drawer-link" type="button" data-subscribe-open="rss">
        <i class="menu-drawer-link-icon fa-solid fa-rss" aria-hidden="true"></i>
        <span>Suscribirse</span>
      </button>
      <button class="menu-drawer-link" type="button" data-subscribe-open="calendar">
        <i class="menu-drawer-link-icon fa-regular fa-calendar-plus" aria-hidden="true"></i>
        <span>Calendario</span>
      </button>
      <button class="menu-drawer-link hidden" type="button" data-install-app-open>
        <i class="menu-drawer-link-icon fa-solid fa-mobile-screen-button" aria-hidden="true"></i>
        <span data-install-app-label>Añadir al inicio</span>
      </button>
      <a class="menu-drawer-link" href="https://aldeapucela.org" target="_blank" rel="noopener noreferrer">
        <i class="menu-drawer-link-icon fa-solid fa-people-group" aria-hidden="true"></i>
        <span>Comunidad</span>
      </a>
      <a class="menu-drawer-link" href="https://t.me/aldeapucela/244" target="_blank" rel="noopener noreferrer">
        <i class="menu-drawer-link-icon fa-brands fa-telegram" aria-hidden="true"></i>
        <span>Chat sobre eventos</span>
      </a>
    </nav>
    <button class="menu-drawer-link menu-drawer-theme-toggle" type="button" data-theme-toggle aria-label="Cambiar tema" aria-pressed="false">
      <i class="menu-drawer-link-icon fa-regular fa-moon" aria-hidden="true"></i>
      <span data-theme-toggle-label>Modo oscuro</span>
    </button>${filters}
  </aside>
</div>`;
  }
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
