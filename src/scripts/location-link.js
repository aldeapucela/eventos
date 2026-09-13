import { getMountedModal, mountModal } from './modals.js';

export function setupLocationLinks({
  openButtonsSelector = '[data-location-open]',
  mapLinksSelector = '[data-location-map]',
  defaultQuery = 'Valladolid'
} = {}) {
  const openButtons = Array.from(document.querySelectorAll(openButtonsSelector));

  if (!openButtons.length) return;

  // El modal se inyecta al primer clic (ver modals.js), así que no se puede
  // resolver aquí: el markup no está en el HTML servido.
  const openLocationModal = () => {
    const locationModal = mountModal('location');
    if (!locationModal) return;
    locationModal.hidden = false;
    document.body.style.overflow = 'hidden';
    locationModal.querySelector('.location-modal-close')?.focus({ preventScroll: true });
  };

  const closeLocationModal = () => {
    const locationModal = getMountedModal('location');
    if (!locationModal) return;
    locationModal.hidden = true;
    document.body.style.overflow = '';
  };

  const updateModalLinks = (query, coordinates) => {
    const locationModal = mountModal('location');
    if (!locationModal) return;
    const isIos = isAppleMobileDevice();

    locationModal.querySelectorAll(mapLinksSelector).forEach((link) => {
      const provider = link.dataset.locationMap;
      link.href = buildMapProviderHref(provider, query, coordinates, isIos);

      if (provider === 'bing') {
        link.hidden = isIos;
        return;
      }

      link.hidden = false;
    });
  };

  openButtons.forEach((button) => {
    const query = normalizeLocationQuery(button.dataset.location || '', defaultQuery);
    const coordinates = getLocationCoordinates(button);
    if (!query) {
      button.href = '#';
      return;
    }

    if (isAndroidDevice()) {
      button.href = buildAndroidMapUrl(query, coordinates);
      button.removeAttribute('target');
      button.removeAttribute('rel');
    } else {
      button.href = buildMapProviderHref('google', query, coordinates, isAppleMobileDevice());
    }

    button.addEventListener('click', (event) => {
      if (isAndroidDevice()) return;
      event.preventDefault();
      updateModalLinks(query, coordinates);
      openLocationModal();
    });
  });

  // Delegación: los botones de cerrar viven en el markup inyectado.
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-location-close]')) return;
    event.preventDefault();
    closeLocationModal();
  });

  window.addEventListener('keydown', (event) => {
    const locationModal = getMountedModal('location');
    if (event.key === 'Escape' && locationModal && !locationModal.hidden) {
      closeLocationModal();
    }
  });
}

export function normalizeLocationQuery(location = '', defaultQuery = 'Valladolid') {
  const normalized = String(location).replace(/\s+/g, ' ').trim();
  if (!normalized) return defaultQuery;
  return /valladolid/i.test(normalized) ? normalized : `${normalized}, Valladolid`;
}

export function getLocationCoordinates(element) {
  const rawLat = element?.dataset?.locationLat;
  const rawLon = element?.dataset?.locationLon;
  if (rawLat == null || String(rawLat).trim() === '' || rawLon == null || String(rawLon).trim() === '') return null;

  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function buildAndroidMapUrl(query, coordinates = null) {
  if (!coordinates) return `geo:0,0?q=${encodeURIComponent(query)}`;
  const point = `${coordinates.lat},${coordinates.lon}`;
  return `geo:${point}?q=${point}(${encodeURIComponent(query)})`;
}

export function buildMapProviderHref(provider, query, coordinates = null, isIos = false) {
  const encodedQuery = encodeURIComponent(query);
  const point = coordinates ? `${coordinates.lat},${coordinates.lon}` : null;

  if (provider === 'openstreetmap') {
    return coordinates
      ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lon}#map=16/${point}`
      : `https://www.openstreetmap.org/search?query=${encodedQuery}`;
  }
  if (provider === 'google') {
    const search = encodeURIComponent(point || query);
    return isIos ? `comgooglemaps://?q=${search}` : `https://maps.google.com/?q=${search}`;
  }
  if (provider === 'apple') {
    return coordinates
      ? `https://maps.apple.com/?ll=${point}&q=${encodedQuery}`
      : `https://maps.apple.com/?q=${encodedQuery}`;
  }
  if (provider === 'bing') {
    return `https://www.bing.com/maps?q=${encodeURIComponent(point || query)}`;
  }
  return '#';
}

function isAppleMobileDevice() {
  const ua = String(navigator.userAgent || '');
  const isIphoneIpodIpad = /iphone|ipod|ipad/i.test(ua);
  const isIpadDesktopMode = /macintosh/i.test(ua) && Number(navigator.maxTouchPoints || 0) > 1;
  return isIphoneIpodIpad || isIpadDesktopMode;
}

function isAndroidDevice() {
  return /android/i.test(navigator.userAgent);
}
