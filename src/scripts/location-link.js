export function setupLocationLinks({
  openButtonsSelector = '[data-location-open]',
  modalSelector = '[data-location-modal]',
  closeButtonsSelector = '[data-location-close]',
  mapLinksSelector = '[data-location-map]',
  defaultQuery = 'Valladolid'
} = {}) {
  const locationModal = document.querySelector(modalSelector);
  const locationCloseButtons = document.querySelectorAll(closeButtonsSelector);
  const locationMapLinks = Array.from(document.querySelectorAll(mapLinksSelector));
  const openButtons = Array.from(document.querySelectorAll(openButtonsSelector));

  if (!openButtons.length) return;

  const openLocationModal = () => {
    if (!locationModal) return;
    locationModal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const closeLocationModal = () => {
    if (!locationModal) return;
    locationModal.hidden = true;
    document.body.style.overflow = '';
  };

  const updateModalLinks = (query) => {
    const encoded = encodeURIComponent(query);
    const isIos = isAppleMobileDevice();

    locationMapLinks.forEach((link) => {
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

  locationCloseButtons.forEach((button) => button.addEventListener('click', closeLocationModal));

  window.addEventListener('keydown', (event) => {
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
