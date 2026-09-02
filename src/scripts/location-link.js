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

  const updateModalLinks = (query) => {
    const locationModal = mountModal('location');
    if (!locationModal) return;
    const encoded = encodeURIComponent(query);
    const isIos = isAppleMobileDevice();

    locationModal.querySelectorAll(mapLinksSelector).forEach((link) => {
      const provider = link.dataset.locationMap;
      let href = '#';
      if (provider === 'openstreetmap') {
        href = `https://www.openstreetmap.org/search?query=${encoded}`;
      } else if (provider === 'google') {
        href = isIos ? `comgooglemaps://?q=${encoded}` : `https://maps.google.com/?q=${encoded}`;
      } else if (provider === 'apple') {
        href = `https://maps.apple.com/?q=${encoded}`;
      } else if (provider === 'bing') {
        href = `https://www.bing.com/maps?q=${encoded}`;
      }
      link.href = href;

      if (provider === 'bing') {
        link.hidden = isIos;
        return;
      }

      link.hidden = false;
    });
  };

  openButtons.forEach((button) => {
    const query = normalizeLocationQuery(button.dataset.location || '', defaultQuery);
    if (!query) {
      button.href = '#';
      return;
    }

    if (isAndroidDevice()) {
      button.href = `geo:0,0?q=${encodeURIComponent(query)}`;
    } else {
      button.href = `https://maps.google.com/?q=${encodeURIComponent(query)}`;
    }

    button.addEventListener('click', (event) => {
      if (isAndroidDevice()) return;
      event.preventDefault();
      updateModalLinks(query);
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

function isAppleMobileDevice() {
  const ua = String(navigator.userAgent || '');
  const isIphoneIpodIpad = /iphone|ipod|ipad/i.test(ua);
  const isIpadDesktopMode = /macintosh/i.test(ua) && Number(navigator.maxTouchPoints || 0) > 1;
  return isIphoneIpodIpad || isIpadDesktopMode;
}

function isAndroidDevice() {
  return /android/i.test(navigator.userAgent);
}
