import { initTheme } from './theme.js';
import { setupCommentsSection } from './comments.js';
import { setupLocationLinks } from './location-link.js';

const storageKey = 'aldeapucela_saved_events';

const calendarOpenButton = document.querySelector('[data-calendar-open]');
const commentsOpenButton = document.querySelector('[data-comments-open]');
const commentsSection = document.querySelector('[data-comments]');
const calendarModal = document.querySelector('[data-calendar-modal]');
const calendarCloseButtons = document.querySelectorAll('[data-calendar-close]');
const ticketSearchModal = document.querySelector('[data-ticket-search-modal]');
const ticketSearchOpenButtons = document.querySelectorAll('[data-ticket-search-open]');
const ticketSearchCloseButtons = document.querySelectorAll('[data-ticket-search-close]');
const ticketSearchConfirmButton = document.querySelector('[data-ticket-search-confirm]');
const calendarIcsLink = document.querySelector('[data-calendar-ics]');
const calendarGoogleLink = document.querySelector('[data-calendar-google]');
const calendarAppleLink = document.querySelector('[data-calendar-apple]');
const calendarOutlookLink = document.querySelector('[data-calendar-outlook]');
const lightbox = document.querySelector('[data-lightbox]');
const lightboxImage = document.querySelector('[data-lightbox-image]');
const lightboxOpen = document.querySelector('[data-lightbox-open]');
const closeButtons = document.querySelectorAll('[data-lightbox-close]');
const hero = document.querySelector('.detail-clean-hero');
const eventData = window.__EVENT_DETAIL__ || {};
initTheme();

syncSavedStates();
setupLocationLinks();
setupCommentsSection();

document.addEventListener('click', async (event) => {
  const saveButton = event.target.closest('[data-save-event]');
  const shareButton = event.target.closest('[data-share-event], [data-share]');

  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    const action = toggleSaved(saveButton.dataset.eventId);
    if (action === 'added') {
      window.trackMatomoInteractionOnce?.({
        origin: 'detail',
        action: 'save',
        eventId: String(saveButton.dataset.eventId || eventData?.id || '')
      });
    }
    if (action && typeof window.showSavedToast === 'function') {
      window.showSavedToast({ action });
    }
  }

  if (shareButton) {
    event.preventDefault();
    event.stopPropagation();
    await shareEvent(
      shareButton.dataset.eventUrl || window.location.href,
      shareButton.dataset.eventTitle || document.title,
      shareButton
    );
  }
});

function openLightbox() {
  if (!lightbox || !lightboxImage || !hero) return;
  const backgroundImage = hero.style.backgroundImage;
  const match = backgroundImage.match(/url\(["']?(.*?)["']?\)$/);
  const src = match?.[1];
  if (!src) return;

  lightboxImage.src = src;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!lightbox || !lightboxImage) return;
  lightbox.hidden = true;
  lightboxImage.src = '';
  document.body.style.overflow = '';
}

function openCalendarModal() {
  if (!calendarModal) return;
  populateCalendarLinks();
  calendarModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCalendarModal() {
  if (!calendarModal) return;
  calendarModal.hidden = true;
  document.body.style.overflow = '';
}

function openComments() {
  if (!commentsSection) return;
  commentsSection.hidden = false;
  commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (calendarOpenButton) calendarOpenButton.addEventListener('click', openCalendarModal);
calendarCloseButtons.forEach((button) => button.addEventListener('click', closeCalendarModal));
if (commentsOpenButton) commentsOpenButton.addEventListener('click', openComments);
ticketSearchOpenButtons.forEach((button) => button.addEventListener('click', openTicketSearchModal));
ticketSearchCloseButtons.forEach((button) => button.addEventListener('click', closeTicketSearchModal));
if (ticketSearchConfirmButton) ticketSearchConfirmButton.addEventListener('click', goToPerplexityTicketSearch);

document.querySelectorAll('[data-scroll-to-comments]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openComments();
  });
});

if (lightboxOpen) lightboxOpen.addEventListener('click', openLightbox);
closeButtons.forEach((button) => button.addEventListener('click', closeLightbox));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (lightbox && !lightbox.hidden) closeLightbox();
    if (calendarModal && !calendarModal.hidden) closeCalendarModal();
    if (ticketSearchModal && !ticketSearchModal.hidden) closeTicketSearchModal();
  }
});

function openTicketSearchModal() {
  if (!ticketSearchModal) return;
  ticketSearchModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeTicketSearchModal() {
  if (!ticketSearchModal) return;
  ticketSearchModal.hidden = true;
  document.body.style.overflow = '';
}

function goToPerplexityTicketSearch() {
  const title = cleanField(eventData?.title || document.title, 'Evento sin título');
  const dateLabel = cleanField(extractDateLabel(), 'Fecha no disponible');
  const timeLabel = cleanField(extractBestTimeLabel(), '');
  const locationParts = parseLocationParts(eventData?.location || '');
  const venue = cleanField(locationParts.venue, 'Lugar no disponible');
  const city = cleanField(locationParts.city, 'Valladolid');
  const country = cleanField(locationParts.country, 'España');
  const dateLine = timeLabel ? `${dateLabel} a las ${timeLabel}` : dateLabel;
  const category = cleanField(eventData?.categoryLabel, '');
  const organizer = cleanField(eventData?.organizer, '');
  const notes = cleanField(eventData?.notes, '');
  const sourceUrl = cleanField(eventData?.sourceUrl, '');

  const prompt = `Quiero comprar entradas para este evento de forma segura y oficial.

Evento: "${title}"
Fecha: ${dateLine}
Lugar: ${venue}, ${city}, ${country}
${category ? `Tipo: ${category}` : ''}
${organizer ? `Organiza: ${organizer}` : ''}
${notes ? `Contexto adicional: ${notes}` : ''}
${sourceUrl ? `Fuente original: ${sourceUrl}` : ''}

Objetivo:
- Encuentra la venta oficial de este evento concreto en esta ciudad y esta fecha.
- Verifica que coincidan el artista o espectáculo, la sala o recinto, y la fecha.
- Prioriza webs oficiales del venue, promotor, artista o ticketera autorizada.
- Si varias fuentes discrepan, elige la más oficial y específica para este evento concreto.

Responde SOLO con:
1. El enlace oficial más fiable para comprar entradas (sala, promotor, artista o ticketera autorizada).
2. Una frase muy breve indicando por qué es oficial.
3. Segunda opción oficial si existe, con el mismo formato.
4. Si no hay venta oficial verificable, indícalo claramente.

Reglas:
- Excluye reventa (Viagogo, StubHub, Ticketswap y similares).
- Excluye agregadores sin relación directa con el organizador.
- No incluyas fuentes que no puedas verificar como oficiales.
- No respondas con páginas genéricas de agenda o listados si no llevan a la compra oficial de este evento exacto.
- Da prioridad a páginas que muestren coincidencia explícita con la fecha, la ciudad o el recinto.
- Devuelve SIEMPRE los enlaces como links clicables en Markdown, con formato exacto: [dominio o nombre corto](https://url-completa).
- No devuelvas URLs en texto plano ni bloques de código.
- Si no puedes verificar ninguna opción oficial, responde exactamente: "Sin venta oficial verificable."`;

  closeTicketSearchModal();
  window.open(`https://www.perplexity.ai/search?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener,noreferrer');
}

function extractTimeLabel(value = '') {
  const text = String(value || '');
  const match = text.match(/(\d{1,2}[:.]\d{2})/);
  if (!match) return '';
  return match[1].replace('.', ':');
}

function extractDateLabel() {
  if (eventData?.startsAtIso) {
    const date = parseDateLike(eventData.startsAtIso);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Madrid'
      }).format(date);
    }
  }

  const schedule = String(eventData?.scheduleLabel || eventData?.dateRangeLabel || '');
  const match = schedule.match(/(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/);
  return match?.[1] || schedule;
}

function extractBestTimeLabel() {
  if (eventData?.startsAtIso) {
    const date = parseDateLike(eventData.startsAtIso);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Madrid'
      }).format(date);
    }
  }

  return extractTimeLabel(eventData?.scheduleLabel || eventData?.timeLabel || '');
}

function parseLocationParts(location = '') {
  const parts = String(location || '')
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (!parts.length) return { venue: '', city: '', country: '' };
  if (parts.length === 1) return { venue: parts[0], city: '', country: '' };
  if (parts.length === 2) return { venue: parts[0], city: parts[1], country: '' };

  return {
    venue: parts[0],
    city: parts[1],
    country: parts.slice(2).join(', ')
  };
}

function cleanField(value = '', fallback = '') {
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  return cleanValue || fallback;
}

function populateCalendarLinks() {
  const title = eventData.title || document.title;
  const description = eventData.summary || '';
  const location = eventData.location || '';
  const start = eventData.startsAtIso ? parseDateLike(eventData.startsAtIso) : null;
  const end = eventData.endsAtIso ? parseDateLike(eventData.endsAtIso) : null;
  const startDate = start || new Date();
  const endDate = end || new Date(startDate.getTime() + 60 * 60 * 1000);
  const ics = buildIcs({
    title,
    description,
    location,
    startDate,
    endDate,
    url: window.location.href,
    imageUrl: eventData.image || ''
  });

  if (calendarIcsLink) {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    calendarIcsLink.href = URL.createObjectURL(blob);
    calendarIcsLink.download = `${slugify(title)}.ics`;
  }

  const startUtc = toUtc(startDate);
  const endUtc = toUtc(endDate);
  const dates = `${startUtc}/${endUtc}`;
  const details = `${title}\n\n${window.location.href}`;

  if (calendarGoogleLink) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates,
      details,
      location
    });
    calendarGoogleLink.href = `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
  if (calendarOutlookLink) {
    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: title,
      body: details,
      location,
      startdt: startDate.toISOString(),
      enddt: endDate.toISOString()
    });
    calendarOutlookLink.href = `https://outlook.live.com/calendar/deeplink/compose?${params.toString()}`;
  }
  if (calendarAppleLink) {
    calendarAppleLink.href = calendarIcsLink?.href || '#';
  }
}

function isLikelyMobileDevice() {
  const ua = String(navigator.userAgent || '');
  const uaDataMobile = navigator.userAgentData?.mobile === true;
  const mobileUa = /android|iphone|ipad|ipod|mobile/i.test(ua);
  const narrowScreen = window.matchMedia('(max-width: 900px)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const touchCapable = Number(navigator.maxTouchPoints || 0) > 0;

  if (uaDataMobile || mobileUa) return true;
  return narrowScreen && (coarsePointer || noHover || touchCapable);
}

function buildIcs({ title, description, location, startDate, endDate, url, imageUrl }) {
  const stamp = toUtc(new Date());
  const cleanDescription = String(description || '').trim();
  const rows = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aldea Pucela//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${cryptoRandomId()}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtc(startDate)}`,
    `DTEND:${toUtc(endDate)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(cleanDescription)}`,
    `LOCATION:${escapeIcs(location)}`,
    `URL:${escapeIcs(url)}`
  ];
  if (imageUrl) rows.push(`ATTACH;FMTTYPE=image/jpeg:${escapeIcs(imageUrl)}`);
  rows.push('END:VEVENT', 'END:VCALENDAR');
  return rows.join('\r\n');
}

function toUtc(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') + 'T' + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('') + 'Z';
}

function escapeIcs(value = '') {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'evento';
}

function parseDateLike(value) {
  const stringValue = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(stringValue);
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSavedEvents() {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
}

function setSavedEvents(ids) {
  window.localStorage.setItem(storageKey, JSON.stringify(ids));
}

function toggleSaved(eventId) {
  const id = String(eventId || '');
  if (!id) return null;

  const saved = new Set(getSavedEvents().map(String));
  if (saved.has(id)) {
    saved.delete(id);
    setSavedEvents(Array.from(saved));
    syncSavedStates();
    return 'removed';
  } else {
    saved.add(id);
    setSavedEvents(Array.from(saved));
    syncSavedStates();
    return 'added';
  }
}

function syncSavedStates() {
  const saved = new Set(getSavedEvents().map(String));
  document.querySelectorAll('[data-save-event]').forEach((button) => {
    const id = String(button.dataset.eventId || '');
    const active = saved.has(id);
    button.classList.toggle('event-compact-action-active', active);
    button.innerHTML = active ? '<i class="fa-solid fa-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
  });
}

async function shareEvent(url, title, button) {
  const shareUrl = withShareCampaign(url || window.location.pathname);
  const shareTitle = title || document.title;
  const shareText = `${shareTitle}\n\n${shareUrl}`;
  const targetId = String(eventData?.id || button?.dataset?.eventId || '');

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
        url: shareUrl
      });
      setShareSuccess(button);
      window.trackMatomoInteractionOnce?.({
        origin: 'detail',
        action: 'share',
        eventId: targetId
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(shareText);
    setShareSuccess(button);
    window.trackMatomoInteractionOnce?.({
      origin: 'detail',
      action: 'share',
      eventId: targetId
    });
  } catch {
    setShareFailure(button);
  }
}

function withShareCampaign(url) {
  const shareUrl = new URL(url || window.location.pathname, window.location.origin);
  shareUrl.searchParams.set('mtm_campaign', 'share');
  return shareUrl.toString();
}

function setButtonFeedback(button, label) {
  const span = button?.querySelector('span');
  if (!span) return;
  const previous = span.textContent;
  span.textContent = label;
  window.setTimeout(() => {
    span.textContent = previous;
  }, 1400);
}

function setShareSuccess(button) {
  const icon = button?.querySelector('i');
  const span = button?.querySelector('span');
  const previous = icon?.className || 'fa-solid fa-share-nodes';
  if (icon) icon.className = 'fa-solid fa-check';
  if (span) span.textContent = 'Enlace copiado';
  window.setTimeout(() => {
    if (icon) icon.className = previous;
    if (span) span.textContent = 'Compartir';
  }, 1600);
}

function setShareFailure(button) {
  const icon = button?.querySelector('i');
  if (!icon) return;
  const previous = icon.className || 'fa-solid fa-share-nodes';
  icon.className = 'fa-solid fa-check';
  window.setTimeout(() => {
    icon.className = previous;
  }, 1600);
}
