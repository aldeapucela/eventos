const ORIGIN_CACHE_KEY = 'fiestasPucela:detail-transit-location';
const ORIGIN_CACHE_TTL_MS = 15 * 60 * 1000;
const ORIGIN_WAIT_MS = 2000;
const ORIGIN_TIMEOUT_MS = 15000;
const LEAFLET_SCRIPT_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_SCRIPT_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const CARTO_KEY = 'cb1_27ug_1_19138f635d4f03358d12cb43';
const CARTO_LAYERS = {
  light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
  dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
};

let leafletPromise = null;
let mapInstance = null;
let eventMarker = null;
let transitMarkers = null;
let transitOrigin = null;
let transitLocationPromise = null;
let transitLocationBlocked = false;

export function setupEventDirections() {
  const mapElement = document.querySelector('[data-event-map]');
  if (mapElement) void initEventMap(mapElement);

  const directionsToggle = document.querySelector('[data-directions-toggle]');
  const directionsOptions = document.querySelector('[data-directions-options]');
  directionsToggle?.addEventListener('click', () => {
    const expanded = directionsToggle.getAttribute('aria-expanded') === 'true';
    directionsToggle.setAttribute('aria-expanded', String(!expanded));
    directionsOptions.hidden = expanded;
    if (!expanded) void requestTransitOrigin();
  });

  document.querySelectorAll('[data-vallabus-route]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const destination = routeDestination(link);
      if (!destination) return;
      event.preventDefault();
      void openVallabusRoute(link, destination);
    });
  });

  setupTransitLines();
  setupNativeMapLink();
}

async function initEventMap(element) {
  const leaflet = await ensureLeaflet();
  if (!leaflet) {
    showMapError('No se pudo cargar el mapa. La ubicación sigue disponible en los enlaces.');
    return;
  }

  const lat = Number(element.dataset.lat);
  const lon = Number(element.dataset.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    showMapError('Ubicación en mapa no disponible.');
    return;
  }

  try {
    const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    mapInstance = leaflet.map(element, {
      scrollWheelZoom: false,
      dragging: !isTouchDevice
    }).setView([lat, lon], 16);

    const title = element.dataset.title || 'Evento';
    const markerIcon = leaflet.divIcon({
      className: 'detail-map-marker',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      html: `<span class="detail-map-marker-content"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${escapeHtml(title)}</span></span>`
    });
    let tileLayer = createCartoLayer(leaflet).addTo(mapInstance);
    new MutationObserver(() => {
      if (!mapInstance) return;
      mapInstance.removeLayer(tileLayer);
      tileLayer = createCartoLayer(leaflet).addTo(mapInstance);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    eventMarker = leaflet.marker([lat, lon], { icon: markerIcon, title })
      .addTo(mapInstance)
      .bindPopup(escapeHtml(title));
    window.requestAnimationFrame(() => mapInstance?.invalidateSize());
  } catch (error) {
    console.error('No se pudo inicializar el mapa del evento.', error);
    showMapError('No se pudo mostrar el mapa. La ubicación sigue disponible en los enlaces.');
  }
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  ensureLeafletCss();
  leafletPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-event-leaflet-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L || null), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_SCRIPT_URL;
    script.integrity = LEAFLET_SCRIPT_INTEGRITY;
    script.crossOrigin = '';
    script.dataset.eventLeafletLoader = 'true';
    script.addEventListener('load', () => resolve(window.L || null), { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });
    document.head.append(script);
  });
  return leafletPromise;
}

function ensureLeafletCss() {
  if (document.querySelector('link[href*="leaflet"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  link.crossOrigin = '';
  document.head.append(link);
}

function createCartoLayer(leaflet) {
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  return leaflet.tileLayer(CARTO_LAYERS[theme], {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });
}

function setupTransitLines() {
  const region = document.querySelector('[data-event-transit]');
  if (!region) return;

  let stops = [];
  try {
    const rawStops = window.__EVENT_DETAIL__?.nearbyVallabusStops;
    stops = (Array.isArray(rawStops) ? rawStops : [])
      .filter((stop) => stop?.name && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon)))
      .map((stop) => ({
        ...stop,
        lat: Number(stop.lat),
        lon: Number(stop.lon),
        distanceMeters: Number(stop.distanceMeters) || 0,
        lines: Array.isArray(stop.lines) ? stop.lines.map(String) : []
      }));
  } catch (error) {
    console.warn('No se pudieron cargar las paradas cercanas.', error);
  }
  if (!stops.length) {
    region.hidden = true;
    return;
  }

  const lineScroller = region.querySelector('[data-transit-lines]');
  const scrollButtons = [...region.querySelectorAll('[data-transit-scroll]')];
  const lineButtons = [...region.querySelectorAll('[data-transit-line]')];
  const details = region.querySelector('[data-transit-details]');
  const summary = region.querySelector('[data-transit-summary]');
  const stopList = region.querySelector('[data-transit-stop-list]');
  let selectedLine = '';
  if (!lineScroller || !details || !summary || !stopList || !lineButtons.length) return;

  const updateScrollButtons = () => {
    const maxScrollLeft = Math.max(0, lineScroller.scrollWidth - lineScroller.clientWidth);
    const hasOverflow = maxScrollLeft > 2;
    scrollButtons.forEach((button) => {
      const previous = button.dataset.transitScroll === 'prev';
      const atEdge = previous ? lineScroller.scrollLeft <= 2 : lineScroller.scrollLeft >= maxScrollLeft - 2;
      button.hidden = !hasOverflow;
      button.disabled = !hasOverflow || atEdge;
      button.setAttribute('aria-disabled', String(button.disabled));
    });
  };

  lineScroller.addEventListener('scroll', updateScrollButtons, { passive: true });
  window.addEventListener('resize', updateScrollButtons, { passive: true });
  scrollButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const direction = button.dataset.transitScroll === 'prev' ? -1 : 1;
      lineScroller.scrollBy({ left: direction * Math.max(140, lineScroller.clientWidth * 0.75), behavior: 'smooth' });
    });
  });
  window.requestAnimationFrame(updateScrollButtons);

  const renderSelectedStops = () => {
    const selectedStops = stops.filter((stop) => stop.lines.includes(selectedLine));
    summary.textContent = `${selectedStops.length} ${selectedStops.length === 1 ? 'parada cercana' : 'paradas cercanas'} para la línea ${selectedLine}`;
    stopList.innerHTML = selectedStops.map((stop) => `
      <li>
        <a class="detail-transit-stop" href="${vallabusStopScheduleUrl(stop.number, window.__EVENT_DETAIL__?.startsAtDayKey)}" target="_blank" rel="noopener noreferrer" aria-label="Ver horarios de ${escapeHtml(stop.name)} en VallaBus">
          <span class="detail-transit-stop-copy"><strong>${escapeHtml(stop.name)}</strong><span>${formatTransitDistance(stop.distanceMeters)} · Líneas ${escapeHtml(stop.lines.join(', '))}</span></span>
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </a>
      </li>
    `).join('');
  };

  const clearSelection = () => {
    selectedLine = '';
    lineButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-expanded', 'false');
    });
    details.hidden = true;
    clearTransitMarkers();
  };

  lineButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const line = button.dataset.transitLine || '';
      if (!line || selectedLine === line) {
        clearSelection();
        return;
      }
      selectedLine = line;
      lineButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-expanded', String(active));
      });
      details.hidden = false;
      renderSelectedStops();
      void updateTransitMarkers(stops.filter((stop) => stop.lines.includes(line)));
    });
  });
}

async function updateTransitMarkers(stops) {
  const map = mapInstance;
  const leaflet = window.L;
  const mapElement = document.querySelector('[data-event-map]');
  if (!map || !leaflet || !mapElement) return;

  if (!transitMarkers) transitMarkers = leaflet.layerGroup().addTo(map);
  transitMarkers.clearLayers();
  stops.forEach((stop) => {
    const icon = leaflet.divIcon({
      className: 'detail-map-stop-marker',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      html: `<span><i class="fa-solid fa-signs-post" aria-hidden="true"></i><b>${escapeHtml(formatTransitDistance(stop.distanceMeters))}</b></span>`
    });
    leaflet.marker([stop.lat, stop.lon], { icon, title: stop.name })
      .addTo(transitMarkers)
      .bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${formatTransitDistance(stop.distanceMeters)} · Líneas ${escapeHtml(stop.lines.join(', '))}`);
  });

  const eventLat = Number(mapElement.dataset.lat);
  const eventLon = Number(mapElement.dataset.lon);
  const points = [[eventLat, eventLon], ...stops.map((stop) => [stop.lat, stop.lon])];
  if (points.length > 1) map.fitBounds(leaflet.latLngBounds(points), { padding: [28, 28], maxZoom: 15, animate: true });
}

function clearTransitMarkers() {
  if (!transitMarkers || !mapInstance) return;
  transitMarkers.clearLayers();
  const mapElement = document.querySelector('[data-event-map]');
  const lat = Number(mapElement?.dataset.lat);
  const lon = Number(mapElement?.dataset.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) mapInstance.setView([lat, lon], 16, { animate: true });
  if (eventMarker) eventMarker.openPopup();
}

function setupNativeMapLink() {
  const link = document.querySelector('[data-native-map]');
  if (!link) return;
  const lat = Number(link.dataset.lat);
  const lon = Number(link.dataset.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const title = link.dataset.title || 'Evento';
  const platform = getMapPlatform();
  if (platform === 'android') {
    link.href = `geo:0,0?q=${lat},${lon}(${encodeURIComponent(title)})`;
    link.removeAttribute('target');
    link.removeAttribute('rel');
  } else if (platform === 'ios') {
    link.href = `http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }
}

function getMapPlatform() {
  const agent = navigator.userAgent || '';
  if (/android/i.test(agent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(agent)) return 'ios';
  return 'web';
}

async function openVallabusRoute(link, destination) {
  const fallbackUrl = buildVallabusRouteUrl(destination);
  link.href = fallbackUrl;
  const plannerWindow = window.open(fallbackUrl, '_blank');
  if (!plannerWindow) {
    window.location.assign(fallbackUrl);
    return;
  }
  try { plannerWindow.opener = null; } catch {}

  if (transitOrigin) {
    navigateRouteWindow(plannerWindow, buildVallabusRouteUrl(destination, transitOrigin));
    return;
  }

  link.setAttribute('aria-busy', 'true');
  try {
    const origin = await waitForTransitOrigin(requestTransitOrigin(), ORIGIN_WAIT_MS);
    if (origin) navigateRouteWindow(plannerWindow, buildVallabusRouteUrl(destination, origin));
  } finally {
    link.removeAttribute('aria-busy');
  }
}

function requestTransitOrigin() {
  if (transitOrigin) return Promise.resolve(transitOrigin);
  if (transitLocationBlocked) return Promise.resolve(null);

  const cachedOrigin = readCachedOrigin();
  if (cachedOrigin) {
    transitOrigin = cachedOrigin;
    return Promise.resolve(transitOrigin);
  }

  if (transitLocationPromise) return transitLocationPromise;
  if (!navigator.geolocation) {
    transitLocationBlocked = true;
    return Promise.resolve(null);
  }

  transitLocationPromise = (async () => {
    let permissionState = null;
    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        permissionState = permission.state;
      } catch {
        // Algunos navegadores no exponen Permissions API para geolocalización.
      }
    }
    if (permissionState === 'denied') {
      transitLocationBlocked = true;
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        const lat = Number(coords.latitude);
        const lon = Number(coords.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          resolve(null);
          return;
        }
        transitOrigin = { name: 'Tu ubicación', lat, lon };
        cacheOrigin(transitOrigin);
        resolve(transitOrigin);
      }, (error) => {
        if (error?.code === 1) transitLocationBlocked = true;
        resolve(null);
      }, {
        enableHighAccuracy: false,
        maximumAge: ORIGIN_CACHE_TTL_MS,
        timeout: ORIGIN_TIMEOUT_MS
      });
    });
  })().finally(() => {
    transitLocationPromise = null;
  });

  return transitLocationPromise;
}

function waitForTransitOrigin(locationPromise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (origin) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(origin || null);
    };
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    locationPromise.then(finish, () => finish(null));
  });
}

function routeDestination(link) {
  const lat = Number(link.dataset.destinationLat);
  const lon = Number(link.dataset.destinationLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name: link.dataset.destinationName || 'Evento en Valladolid',
    lat,
    lon,
    date: link.dataset.arrivalDate || '',
    time: String(link.dataset.arrivalTime || '').match(/\d{1,2}:\d{2}/)?.[0] || '',
    mode: link.dataset.routeMode || ''
  };
}

function buildVallabusRouteUrl(destination, origin = null) {
  const params = new URLSearchParams();
  if (origin) {
    params.set('originName', origin.name || 'Tu ubicación');
    params.set('originLat', String(origin.lat));
    params.set('originLon', String(origin.lon));
  }
  params.set('destinationName', destination.name);
  params.set('destinationLat', String(destination.lat));
  params.set('destinationLon', String(destination.lon));
  if (destination.date && destination.time) {
    params.set('arrivalDate', destination.date);
    params.set('arrivalTime', destination.time);
  }
  if (destination.mode) params.set('mode', destination.mode);
  params.set('origen', 'eventosaldea');
  return `https://vallabus.com/#/rutas?${params.toString()}`;
}

function readCachedOrigin() {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(ORIGIN_CACHE_KEY) || 'null');
    const timestamp = Number(cached?.timestamp);
    const lat = Number(cached?.lat);
    const lon = Number(cached?.lon);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > ORIGIN_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(ORIGIN_CACHE_KEY);
      return null;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { name: 'Tu ubicación', lat, lon };
  } catch {
    return null;
  }
}

function cacheOrigin(origin) {
  try {
    window.sessionStorage.setItem(ORIGIN_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      lat: origin.lat,
      lon: origin.lon
    }));
  } catch {}
}

function navigateRouteWindow(routeWindow, url) {
  try {
    routeWindow.location.replace(url);
  } catch {
    window.location.assign(url);
  }
}

function vallabusStopScheduleUrl(number, date = '') {
  const datePart = date ? `?date=${encodeURIComponent(date)}&origen=eventosaldea` : '?origen=eventosaldea';
  return `https://vallabus.com/#/horarios/${encodeURIComponent(number)}${datePart}`;
}

function formatTransitDistance(meters) {
  const distance = Number(meters);
  if (!Number.isFinite(distance)) return 'Distancia no disponible';
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1).replace('.', ',')} km`;
}

function showMapError(message) {
  const error = document.querySelector('[data-event-map-error]');
  if (!error) return;
  error.hidden = false;
  error.textContent = message;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
