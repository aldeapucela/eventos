import { findSimilarEvents } from './event-form-matching.js';
import { findVenueSuggestions, normalizePhotonResults } from './event-form-autocomplete.js';
import { setupMenuDrawer } from './menu-drawer.js';
import { initTheme } from './theme.js';
import { setupSubscribe } from './subscribe.js';

const DATA_URL = '/upcoming-site-data.json';
const MOCK_SUBMISSION_URL = '/__mock_api/eventos/submissions';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_EDGE = 3000;
const DEBOUNCE_MS = 260;
const ADDRESS_DEBOUNCE_MS = 700;
const ADDRESS_MIN_QUERY_LENGTH = 3;
const VENUE_MIN_QUERY_LENGTH = 2;
const PHOTON_API_URL = 'https://photon.komoot.io/api/';
const VALLADOLID_LAT = 41.651972;
const VALLADOLID_LON = -4.728606;
const VALLADOLID_BBOX = '-4.82,41.58,-4.64,41.71';

initTheme();
setupMenuDrawer();
setupSubscribe();

const form = document.querySelector('[data-event-submission-form]');
if (form) {
  const duplicatePanel = form.querySelector('[data-duplicate-panel]');
  const duplicateResults = form.querySelector('[data-duplicate-results]');
  const duplicateAcknowledgement = form.querySelector('[data-duplicate-acknowledgement]');
  const imageInput = form.querySelector('[data-event-image]');
  const imageTrigger = form.querySelector('[data-event-image-trigger]');
  const imagePreview = form.querySelector('[data-image-preview]');
  const imagePreviewImage = form.querySelector('[data-image-preview-image]');
  const imageStatus = form.querySelector('[data-image-status]');
  const submitButton = form.querySelector('[data-submit-event]');
  const formStatus = form.querySelector('[data-form-status]');
  const successPanel = form.querySelector('[data-submission-success]');
  const submitAnotherButton = form.querySelector('[data-submit-another]');
  const turnstileWidget = form.querySelector('[data-turnstile-widget]');
  const endDate = form.elements.end_date;
  const endTime = form.elements.end_time;
  const startDate = form.elements.start_date;
  const startTime = form.elements.start_time;
  const title = form.elements.title;
  const location = form.elements.location;
  const address = form.elements.address;
  const venueSuggestions = form.querySelector('[data-venue-suggestions]');
  const addressSuggestions = form.querySelector('[data-address-suggestions]');
  const addressLookupStatus = form.querySelector('[data-address-lookup-status]');

  let upcomingEvents = [];
  let venueCatalog = [];
  let dataPromise = null;
  let duplicateTimer = null;
  let addressTimer = null;
  let addressController = null;
  const addressCache = new Map();
  let currentCandidates = [];
  let previewUrl = '';
  let compressedImage = null;
  let endDateAutoSynced = false;
  let addressAutoFilled = false;

  const setStatus = (message, kind = 'info') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.dataset.status = kind;
    formStatus.hidden = !message;
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const formatEventDate = (event) => {
    const date = new Date(event?.startsAtIso || event?.startsAt || '');
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Madrid'
    }).format(date);
  };

  const getLocation = (event) => [event?.location || event?.venue, event?.address]
    .filter(Boolean)
    .join(' · ');

  const loadUpcomingEvents = async () => {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error(`upcoming-site-data ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          upcomingEvents = Array.isArray(payload?.events) ? payload.events : [];
          venueCatalog = Array.isArray(payload?.spaces) ? payload.spaces : [];
          return upcomingEvents;
        });
    }
    return dataPromise;
  };

  const setSuggestionsVisibility = (input, panel, visible) => {
    if (!input || !panel) return;
    panel.hidden = !visible;
    input.setAttribute('aria-expanded', String(visible));
  };

  const hideVenueSuggestions = () => setSuggestionsVisibility(location, venueSuggestions, false);
  const hideAddressSuggestions = () => setSuggestionsVisibility(address, addressSuggestions, false);

  const renderVenueSuggestions = () => {
    if (!venueSuggestions || !location) return;
    const query = location.value.trim();
    venueSuggestions.replaceChildren();
    if (query.length < VENUE_MIN_QUERY_LENGTH) {
      hideVenueSuggestions();
      return;
    }

    const matches = findVenueSuggestions(venueCatalog, query);
    if (!matches.length) {
      hideVenueSuggestions();
      return;
    }

    const fragment = document.createDocumentFragment();
    matches.forEach((match) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-form-suggestion';
      button.setAttribute('role', 'option');

      const name = document.createElement('span');
      name.className = 'event-form-suggestion-title';
      name.textContent = match.name;
      button.appendChild(name);
      if (match.address) {
        const detail = document.createElement('span');
        detail.className = 'event-form-suggestion-detail';
        detail.textContent = match.address;
        button.appendChild(detail);
      }

      button.addEventListener('click', () => {
        location.value = match.name;
        if (match.address && (!address.value.trim() || addressAutoFilled)) {
          address.value = match.address;
          addressAutoFilled = true;
        }
        hideVenueSuggestions();
        scheduleDuplicateCheck();
      });
      fragment.appendChild(button);
    });
    venueSuggestions.appendChild(fragment);
    setSuggestionsVisibility(location, venueSuggestions, true);
  };

  const renderAddressSuggestions = (results) => {
    if (!addressSuggestions || !address) return;
    addressSuggestions.replaceChildren();
    if (!results.length) {
      hideAddressSuggestions();
      return;
    }

    const fragment = document.createDocumentFragment();
    results.forEach((result) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-form-suggestion';
      button.setAttribute('role', 'option');

      const name = document.createElement('span');
      name.className = 'event-form-suggestion-title';
      name.textContent = result.name || result.address;
      button.appendChild(name);
      if (result.name && result.address && result.name !== result.address) {
        const detail = document.createElement('span');
        detail.className = 'event-form-suggestion-detail';
        detail.textContent = result.address;
        button.appendChild(detail);
      }

      button.addEventListener('click', () => {
        address.value = result.address || result.name;
        addressAutoFilled = true;
        hideAddressSuggestions();
        if (addressLookupStatus) {
          addressLookupStatus.textContent = '';
          addressLookupStatus.hidden = true;
        }
      });
      fragment.appendChild(button);
    });
    addressSuggestions.appendChild(fragment);
    setSuggestionsVisibility(address, addressSuggestions, true);
  };

  const setAddressLookupStatus = (message) => {
    if (!addressLookupStatus) return;
    addressLookupStatus.textContent = message;
    addressLookupStatus.hidden = !message;
  };

  const lookupAddress = async () => {
    if (!address) return;
    const rawQuery = address.value.trim();
    if (rawQuery.length < ADDRESS_MIN_QUERY_LENGTH) {
      if (addressController) addressController.abort();
      setAddressLookupStatus('');
      hideAddressSuggestions();
      return;
    }

    const cacheKey = rawQuery.toLocaleLowerCase('es');
    if (addressCache.has(cacheKey)) {
      renderAddressSuggestions(addressCache.get(cacheKey));
      setAddressLookupStatus('');
      return;
    }

    if (addressController) addressController.abort();
    addressController = new AbortController();
    setAddressLookupStatus('Buscando…');
    try {
      const url = new URL(PHOTON_API_URL);
      url.searchParams.set('q', `${rawQuery} Valladolid`);
      url.searchParams.set('limit', '5');
      url.searchParams.set('lang', 'es');
      url.searchParams.set('lat', String(VALLADOLID_LAT));
      url.searchParams.set('lon', String(VALLADOLID_LON));
      url.searchParams.set('bbox', VALLADOLID_BBOX);
      const response = await fetch(url, {
        signal: addressController.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Photon ${response.status}`);
      const payload = await response.json();
      const results = normalizePhotonResults(payload?.features);
      addressCache.set(cacheKey, results);
      if (addressCache.size > 40) addressCache.delete(addressCache.keys().next().value);
      if (address.value.trim().toLocaleLowerCase('es') !== cacheKey) return;
      setAddressLookupStatus('');
      renderAddressSuggestions(results);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setAddressLookupStatus('');
      hideAddressSuggestions();
    }
  };

  const scheduleAddressLookup = () => {
    window.clearTimeout(addressTimer);
    addressTimer = window.setTimeout(lookupAddress, ADDRESS_DEBOUNCE_MS);
  };

  const readQuery = () => ({
    title: title?.value || '',
    startDate: startDate?.value || '',
    startTime: startTime?.value || '',
    location: location?.value || '',
    address: address?.value || ''
  });

  const renderDuplicates = (candidates) => {
    currentCandidates = candidates;
    if (!duplicatePanel || !duplicateResults || !duplicateAcknowledgement) return;
    duplicateResults.replaceChildren();
    duplicateAcknowledgement.checked = false;
    duplicatePanel.hidden = candidates.length === 0;
    duplicateAcknowledgement.required = candidates.length > 0;
    if (!candidates.length) return;

    const fragment = document.createDocumentFragment();
    for (const candidate of candidates) {
      const event = candidate.event;
      const item = document.createElement('li');
      item.className = 'event-form-duplicate-item';
      item.innerHTML = [
        `<a href="${escapeHtml(event.urlPath || `/e/${event.id}/${event.slug || ''}/`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.title || 'Evento sin título')}</a>`,
        `<span>${escapeHtml(formatEventDate(event))}${getLocation(event) ? ` · ${escapeHtml(getLocation(event))}` : ''}</span>`
      ].join('');
      fragment.appendChild(item);
    }
    duplicateResults.appendChild(fragment);
  };

  const checkDuplicates = async () => {
    const query = readQuery();
    if (!query.title.trim() || !query.startDate) {
      renderDuplicates([]);
      return;
    }
    try {
      const events = await loadUpcomingEvents();
      const candidates = findSimilarEvents(events, query);
      renderDuplicates(candidates);
    } catch {
      renderDuplicates([]);
    }
  };

  const scheduleDuplicateCheck = () => {
    window.clearTimeout(duplicateTimer);
    duplicateTimer = window.setTimeout(checkDuplicates, DEBOUNCE_MS);
  };

  const syncEndDate = () => {
    if (!startDate?.value) {
      if (endDateAutoSynced && endDate) endDate.value = '';
      endDateAutoSynced = false;
      return;
    }
    if (endDate && (!endDate.value || endDateAutoSynced)) {
      endDate.value = startDate.value;
      endDateAutoSynced = true;
    }
  };

  const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    image.src = url;
  });

  const canvasBlob = (canvas, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))), 'image/jpeg', quality);
  });

  const compressImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('La imagen original no puede superar 8 MB.');
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('El navegador no permite procesar la imagen.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.86;
    let blob = await canvasBlob(canvas, quality);
    while (blob.size > MAX_OUTPUT_BYTES && quality > 0.58) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, quality);
    }
    if (blob.size > MAX_OUTPUT_BYTES) throw new Error('No se ha podido reducir la imagen a un tamaño seguro.');
    return new File([blob], 'cartel-evento.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  };

  const handleImage = async () => {
    compressedImage = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    if (imagePreview) imagePreview.hidden = true;
    const file = imageInput?.files?.[0];
    if (!file) {
      if (imageStatus) {
        imageStatus.textContent = '';
        imageStatus.hidden = true;
      }
      return;
    }
    if (imageStatus) {
      imageStatus.textContent = 'Preparando…';
      imageStatus.hidden = false;
    }
    try {
      compressedImage = await compressImage(file);
      previewUrl = URL.createObjectURL(compressedImage);
      if (imagePreviewImage) imagePreviewImage.src = previewUrl;
      if (imagePreview) imagePreview.hidden = false;
      if (imageStatus) imageStatus.textContent = `${file.name} · ${formatBytes(compressedImage.size)}`;
    } catch (error) {
      if (imageStatus) {
        imageStatus.textContent = error.message;
        imageStatus.hidden = false;
      }
    }
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
    const units = ['KB', 'MB'];
    let value = bytes / 1024;
    let unit = units[0];
    if (value >= 1024) {
      value /= 1024;
      unit = units[1];
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
  };

  const focusFirstSuggestion = (panel, event) => {
    if (event.key === 'Escape') {
      panel === venueSuggestions ? hideVenueSuggestions() : hideAddressSuggestions();
      return;
    }
    if (event.key === 'ArrowDown' && panel && !panel.hidden) {
      event.preventDefault();
      panel.querySelector('button')?.focus();
    }
    if (event.key === 'Enter' && panel && !panel.hidden) {
      const first = panel.querySelector('button');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  };

  for (const field of [title, startTime, location]) field?.addEventListener('input', scheduleDuplicateCheck);
  location?.addEventListener('input', () => {
    renderVenueSuggestions();
    const queryAtRequest = location.value;
    loadUpcomingEvents().then(() => {
      if (location.value === queryAtRequest && document.activeElement === location) {
        renderVenueSuggestions();
      }
    }).catch(() => {});
  });
  location?.addEventListener('keydown', (event) => focusFirstSuggestion(venueSuggestions, event));
  location?.addEventListener('focus', renderVenueSuggestions);
  location?.addEventListener('blur', () => window.setTimeout(hideVenueSuggestions, 140));
  address?.addEventListener('input', () => {
    addressAutoFilled = false;
    scheduleAddressLookup();
    scheduleDuplicateCheck();
  });
  address?.addEventListener('keydown', (event) => focusFirstSuggestion(addressSuggestions, event));
  address?.addEventListener('blur', () => window.setTimeout(hideAddressSuggestions, 140));
  startDate?.addEventListener('input', () => {
    syncEndDate();
    scheduleDuplicateCheck();
  });
  endDate?.addEventListener('input', () => {
    endDateAutoSynced = false;
  });
  imageTrigger?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', handleImage);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    const firstInvalidField = [...form.elements].find((field) => (
      field.type !== 'file'
      && field.name !== 'website'
      && !field.checkValidity()
    ));
    if (firstInvalidField) {
      firstInvalidField.focus({ preventScroll: true });
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      form.reportValidity();
      window.setTimeout(() => {
        firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }, 80);
      return;
    }
    if (!imageInput?.files?.length) {
      setStatus('Falta adjuntar el cartel o la imagen del evento.', 'error');
      imageTrigger?.focus();
      return;
    }
    if (endTime.value && !endDate.value) {
      setStatus('Añade una fecha de finalización para indicar la hora final.', 'error');
      return;
    }
    await checkDuplicates();
    if (currentCandidates.length && !duplicateAcknowledgement.checked) {
      setStatus('Revisa los eventos similares y confirma que no es un duplicado.', 'error');
      duplicateAcknowledgement.focus();
      return;
    }
    if (!compressedImage) {
      setStatus('Selecciona un cartel válido antes de enviar la propuesta.', 'error');
      imageInput?.focus();
      return;
    }

    const data = new FormData(form);
    const turnstileToken = String(data.get('cf-turnstile-response') || '').trim();
    if (!turnstileToken) {
      setStatus('Completa la verificación anti-spam e inténtalo de nuevo.', 'error');
      turnstileWidget?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return;
    }
    data.delete('image');
    data.append('image', compressedImage, compressedImage.name);
    data.set('duplicate_acknowledged', currentCandidates.length ? 'true' : 'false');
    data.set('start_time_approximate', form.elements.start_time_approximate?.checked ? 'true' : 'false');
    data.set('submission_id', globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    data.delete('website');

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    setStatus('Enviando la propuesta…');
    try {
      const submissionEndpoint = form.dataset.submissionEndpoint || MOCK_SUBMISSION_URL;
      const response = await fetch(submissionEndpoint, { method: 'POST', body: data });
      let payload = null;
      try {
        payload = await response.json();
      } catch {}
      if (!response.ok || payload?.ok !== true || payload?.accepted !== true) {
        const detail = payload?.message || payload?.error || '';
        throw new Error(`No se ha podido enviar la propuesta${detail ? `: ${detail}` : ` (${response.status})`}.`);
      }
      form.reset();
      renderDuplicates([]);
      hideVenueSuggestions();
      hideAddressSuggestions();
      if (addressController) addressController.abort();
      setAddressLookupStatus('');
      compressedImage = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      endDateAutoSynced = false;
      addressAutoFilled = false;
      if (imagePreview) imagePreview.hidden = true;
      if (imageStatus) {
        imageStatus.textContent = '';
        imageStatus.hidden = true;
      }
      form.classList.add('is-complete');
      if (successPanel) {
        successPanel.hidden = false;
        successPanel.focus({ preventScroll: false });
      }
    } catch (error) {
      setStatus(error.message || 'No se ha podido enviar la propuesta.', 'error');
      globalThis.turnstile?.reset?.();
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });

  submitAnotherButton?.addEventListener('click', () => {
    form.classList.remove('is-complete');
    if (successPanel) successPanel.hidden = true;
    setStatus('');
    globalThis.turnstile?.reset?.();
    title?.focus({ preventScroll: false });
  });

  loadUpcomingEvents().catch(() => {});
}
