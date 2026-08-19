// Buscador global del sitio. Autocontenido y cargado en todas las páginas desde
// layout.njk (igual que install-app.js), de modo que funciona también en las
// fichas de evento, que no reciben window.__EVENTS__.
//
// Busca a la vez en tres colecciones (tipos, espacios y eventos) a partir de un
// índice ligero (/search-index.json) generado en build. El índice se descarga de
// forma perezosa la primera vez que se abre el buscador y se cachea en memoria.

const INDEX_URL = '/search-index.json';
const DEBOUNCE_MS = 120;
const MAX_EVENTS = 10;
const MAX_SPACES = 6;
const MAX_TYPES = 6;

const modal = document.querySelector('[data-search-modal]');

// Sin modal (por si alguna página no hereda el layout) no hacemos nada.
if (modal) {
  const input = modal.querySelector('[data-search-input]');
  const results = modal.querySelector('[data-search-results]');
  const panel = modal.querySelector('.search-modal-panel') || modal;

  let index = null;         // { events, spaces, types } una vez cargado
  let loadPromise = null;   // evita descargas duplicadas
  let debounceTimer = null;
  let lastReturnFocus = null;

  const normalize = (value) => (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const escapeHtml = (value) => (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  async function ensureIndex() {
    if (index) return index;
    if (!loadPromise) {
      loadPromise = fetch(INDEX_URL, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error(`search-index ${response.status}`);
          return response.json();
        })
        .then((data) => {
          index = {
            events: Array.isArray(data.events) ? data.events : [],
            spaces: Array.isArray(data.spaces) ? data.spaces : [],
            types: Array.isArray(data.types) ? data.types : []
          };
          // Precalcula el texto normalizado sobre el que se busca cada ítem.
          index.events.forEach((item) => {
            item._h = normalize(`${item.title} ${item.category || ''} ${item.venue || ''} ${item.extra || ''}`);
            item._t = normalize(item.title);
          });
          index.spaces.forEach((item) => { item._h = item._t = normalize(item.title); });
          index.types.forEach((item) => { item._h = item._t = normalize(item.title); });
          return index;
        })
        .catch((error) => {
          loadPromise = null; // permite reintentar en la siguiente apertura
          throw error;
        });
    }
    return loadPromise;
  }

  // Puntúa un ítem frente a los tokens de la consulta. Devuelve -1 si no casan
  // todos los tokens (AND); si casan, prioriza coincidencias al inicio del
  // título por encima de coincidencias en tipo/espacio.
  function scoreItem(item, tokens) {
    let total = 0;
    for (const token of tokens) {
      const inHaystack = item._h.indexOf(token);
      if (inHaystack === -1) return -1;
      const inTitle = item._t.indexOf(token);
      if (inTitle === 0) total += 6;
      else if (inTitle > 0 && item._t[inTitle - 1] === ' ') total += 4;
      else if (inTitle > 0) total += 3;
      else if (inHaystack === 0 || item._h[inHaystack - 1] === ' ') total += 2;
      else total += 1;
    }
    return total;
  }

  function match(collection, tokens, limit) {
    const scored = [];
    for (const item of collection) {
      const value = scoreItem(item, tokens);
      if (value >= 0) scored.push({ item, value });
    }
    // Orden estable: primero mejor puntuación; el orden original (eventos ya
    // vienen por fecha ascendente, espacios/tipos por número de eventos) desempata.
    scored.sort((a, b) => b.value - a.value);
    return { total: scored.length, items: scored.slice(0, limit).map((entry) => entry.item) };
  }

  function sectionHtml({ title, icon, total, items, render }) {
    if (!total) return '';
    const rows = items.map(render).join('');
    const more = total > items.length
      ? `<p class="search-modal-more">y ${total - items.length} más…</p>`
      : '';
    return `
      <section class="search-modal-section">
        <h3 class="search-modal-section-title"><i class="${icon}" aria-hidden="true"></i><span>${title}</span><span class="search-modal-count">${total}</span></h3>
        <ul class="search-modal-list">${rows}</ul>
        ${more}
      </section>`;
  }

  const eventRow = (item) => {
    const meta = [item.venue, item.date].filter(Boolean).map(escapeHtml).join(' · ');
    const badge = item.category ? `<span class="search-modal-badge">${escapeHtml(item.category)}</span>` : '';
    return `<li><a class="search-modal-result" href="${escapeHtml(item.url)}">
      <span class="search-modal-result-main"><span class="search-modal-result-title">${escapeHtml(item.title)}</span>${badge}</span>
      ${meta ? `<span class="search-modal-result-meta">${meta}</span>` : ''}
    </a></li>`;
  };

  const spaceRow = (item) => `<li><a class="search-modal-result" href="${escapeHtml(item.url)}">
      <span class="search-modal-result-main"><span class="search-modal-result-title">${escapeHtml(item.title)}</span></span>
      ${item.count ? `<span class="search-modal-result-meta">${item.count} evento${item.count === 1 ? '' : 's'}</span>` : ''}
    </a></li>`;

  const typeRow = (item) => `<li><a class="search-modal-result" href="${escapeHtml(item.url)}">
      <span class="search-modal-result-main"><span class="search-modal-result-title">${escapeHtml(item.title)}</span></span>
      ${item.count ? `<span class="search-modal-result-meta">${item.count} evento${item.count === 1 ? '' : 's'}</span>` : ''}
    </a></li>`;

  function renderHint(message) {
    results.innerHTML = `<p class="search-modal-hint">${escapeHtml(message)}</p>`;
  }

  function renderResults(query) {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      renderHint('Escribe para buscar por nombre de evento, espacio o tipo (música, cine…).');
      return;
    }
    if (!index) {
      renderHint('Cargando…');
      return;
    }

    const types = match(index.types, tokens, MAX_TYPES);
    const spaces = match(index.spaces, tokens, MAX_SPACES);
    const events = match(index.events, tokens, MAX_EVENTS);
    const totalMatches = types.total + spaces.total + events.total;

    // Matomo: registra la búsqueda como "site search" si el tracker está presente.
    if (window._paq && Array.isArray(window._paq)) {
      window._paq.push(['trackSiteSearch', query, 'Buscador', totalMatches]);
    }

    if (!totalMatches) {
      results.innerHTML = `<p class="search-modal-empty">Sin resultados para <strong>«${escapeHtml(query.trim())}»</strong>.</p>`;
      return;
    }

    results.innerHTML = [
      sectionHtml({ title: 'Tipos', icon: 'fa-solid fa-filter', total: types.total, items: types.items, render: typeRow }),
      sectionHtml({ title: 'Espacios', icon: 'fa-solid fa-location-dot', total: spaces.total, items: spaces.items, render: spaceRow }),
      sectionHtml({ title: 'Eventos', icon: 'fa-solid fa-calendar-day', total: events.total, items: events.items, render: eventRow })
    ].join('');
  }

  function runSearch() {
    renderResults(input.value);
  }

  function onInput() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runSearch, DEBOUNCE_MS);
  }

  function open() {
    if (!modal.hidden) return;
    lastReturnFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    // Carga el índice y refresca por si ya había texto escrito.
    ensureIndex()
      .then(() => { if (!modal.hidden) renderResults(input.value); })
      .catch(() => { if (!modal.hidden) renderHint('No se pudo cargar el buscador. Inténtalo de nuevo.'); });
    renderResults(input.value);
    window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    panel.scrollTop = 0;
    if (lastReturnFocus && typeof lastReturnFocus.focus === 'function') {
      lastReturnFocus.focus({ preventScroll: true });
    }
    lastReturnFocus = null;
  }

  // Delegación de clicks para abrir/cerrar (los disparadores se inyectan abajo).
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-search-open]');
    if (opener) {
      event.preventDefault();
      // Si el disparador vive dentro del drawer móvil (ficha de evento), lo
      // cerramos antes de abrir el buscador para no apilar dos capas.
      const drawer = opener.closest('[data-menu-drawer]');
      if (drawer) drawer.hidden = true;
      open();
      return;
    }
    if (event.target.closest('[data-search-close]')) {
      event.preventDefault();
      close();
    }
  });

  input.addEventListener('input', onInput);

  // Enter en el campo salta al primer resultado.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = results.querySelector('.search-modal-result');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      close();
      return;
    }
    // Atajo "/" para abrir, salvo si se está escribiendo en otro campo.
    if (event.key === '/' && modal.hidden && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const tag = (event.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable;
      if (!typing) {
        event.preventDefault();
        open();
      }
    }
  });

  // --- Disparadores en la interfaz -----------------------------------------
  // La nav está duplicada entre plantillas (partials + copias inline), así que
  // inyectamos los botones sobre selectores presentes en todas las páginas en
  // lugar de editar cada cabecera. Al ser una función 100% cliente, no dejamos
  // botones muertos si el JS falla.
  // En la ficha de evento la cabecera móvil ya lleva volver + guardar +
  // compartir + menú, así que ahí la lupa no se inyecta en la cabecera: pasa a
  // ser una entrada más del drawer. En el resto de páginas (portada, secciones…)
  // se mantiene el icono en la cabecera.
  const searchGoesInDrawer = document.body.classList.contains('page-event-detail');

  function injectTriggers() {
    document.querySelectorAll('.header-main-nav').forEach((nav) => {
      if (nav.querySelector('[data-search-open]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-link';
      button.setAttribute('data-search-open', '');
      button.setAttribute('aria-label', 'Buscar');
      button.innerHTML = '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Buscar</span>';
      nav.insertBefore(button, nav.firstChild);
    });

    if (searchGoesInDrawer) {
      document.querySelectorAll('[data-menu-drawer] .menu-drawer-nav').forEach((nav) => {
        if (nav.querySelector('[data-search-open]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-drawer-link';
        button.setAttribute('data-search-open', '');
        button.innerHTML = '<i class="menu-drawer-link-icon fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>Buscar</span>';
        nav.insertBefore(button, nav.firstChild);
      });
      return;
    }

    document.querySelectorAll('[data-menu-open]').forEach((menuButton) => {
      if (menuButton.previousElementSibling && menuButton.previousElementSibling.hasAttribute('data-search-open')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'header-search-btn inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500 lg:hidden';
      button.setAttribute('data-search-open', '');
      button.setAttribute('aria-label', 'Buscar');
      button.innerHTML = '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>';
      menuButton.parentNode.insertBefore(button, menuButton);
    });
  }

  injectTriggers();
}
