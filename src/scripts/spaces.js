const spaces = Array.isArray(window.__SPACES__) ? window.__SPACES__ : [];
const mapNode = document.querySelector('[data-spaces-map]');
const VALLADOLID_CENTER = [41.6523, -4.7245];
const VALLADOLID_METRO_ZOOM = window.matchMedia('(max-width: 767px)').matches ? 12 : 13;

if (mapNode && window.L && spaces.length) {
  const points = spaces.filter((space) => Number.isFinite(space.lat) && Number.isFinite(space.lon));

  if (points.length) {
    const map = L.map(mapNode, {
      scrollWheelZoom: true
    }).setView(VALLADOLID_CENTER, VALLADOLID_METRO_ZOOM);

    let tileLayer = createBaseTileLayer();
    tileLayer.addTo(map);

    const themeObserver = new MutationObserver(() => {
      const nextUrl = getTileLayerUrl();
      if (tileLayer?._url === nextUrl) return;
      map.removeLayer(tileLayer);
      tileLayer = createBaseTileLayer();
      tileLayer.addTo(map);
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    for (const space of points) {
      const eventLabel = space.count === 1 ? '1 EVENTO' : `${space.count} EVENTOS`;
      const marker = L.marker([space.lat, space.lon], {
        icon: createVenueIcon()
      }).addTo(map);
      marker.bindPopup(`
        <div class="spaces-map-popup">
          <div class="spaces-map-popup-title">${escapeHtml(space.name)}</div>
          ${space.address ? `<div class="spaces-map-popup-address">${escapeHtml(space.address)}</div>` : ''}
          <div class="spaces-map-popup-meta">${eventLabel}</div>
          <a class="spaces-map-popup-link" href="#${escapeHtml(space.slug)}" data-space-scroll="${escapeHtml(space.slug)}">Ver</a>
        </div>
      `, { className: 'custom-popup-class' });
    }

    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-space-scroll]');
      if (!link) return;
      event.preventDefault();
      const target = document.getElementById(link.dataset.spaceScroll);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => target.classList.add('spaces-card-highlight'), 120);
      window.setTimeout(() => target.classList.remove('spaces-card-highlight'), 1800);
    });
  }
}

function createBaseTileLayer() {
  return L.tileLayer(getTileLayerUrl(), {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  });
}

function getTileLayerUrl() {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
}

function createVenueIcon() {
  return L.divIcon({
    className: 'spaces-map-marker-wrap',
    html: `
      <span class="spaces-map-marker-pin">
        <span class="spaces-map-marker-core"></span>
      </span>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 24],
    popupAnchor: [0, -18]
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
