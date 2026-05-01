const storageKey = 'aldeapucela_saved_events';

const calendarOpenButton = document.querySelector('[data-calendar-open]');
const commentsOpenButton = document.querySelector('[data-comments-open]');
const commentsSection = document.querySelector('[data-comments]');
const commentsIframe = document.querySelector('[data-comments-iframe]');
const calendarModal = document.querySelector('[data-calendar-modal]');
const calendarCloseButtons = document.querySelectorAll('[data-calendar-close]');
const calendarIcsLink = document.querySelector('[data-calendar-ics]');
const calendarGoogleLink = document.querySelector('[data-calendar-google]');
const calendarAppleLink = document.querySelector('[data-calendar-apple]');
const calendarOutlookLink = document.querySelector('[data-calendar-outlook]');
const lightbox = document.querySelector('[data-lightbox]');
const lightboxImage = document.querySelector('[data-lightbox-image]');
const lightboxOpen = document.querySelector('[data-lightbox-open]');
const closeButtons = document.querySelectorAll('[data-lightbox-close]');
const locationModal = document.querySelector('[data-location-modal]');
const locationOpenButton = document.querySelector('[data-location-open]');
const locationCloseButtons = document.querySelectorAll('[data-location-close]');
const locationMapLinks = Array.from(document.querySelectorAll('[data-location-map]'));
const hero = document.querySelector('.detail-clean-hero');
const eventData = window.__EVENT_DETAIL__ || {};

syncSavedStates();
setupLocationLink();

document.addEventListener('click', async (event) => {
  const saveButton = event.target.closest('[data-save-event]');
  const shareButton = event.target.closest('[data-share-event], [data-share]');

  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleSaved(saveButton.dataset.eventId);
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

function openLocationModal() {
  if (isLikelyMobileDevice()) return;
  if (!locationModal) return;
  populateLocationLinks();
  locationModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLocationModal() {
  if (!locationModal) return;
  locationModal.hidden = true;
  document.body.style.overflow = '';
}

function openComments() {
  if (!commentsSection) return;
  commentsSection.hidden = false;
  if (commentsIframe && !commentsIframe.src) {
    commentsIframe.src = eventData.sourceUrl || window.location.href;
  }
  commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (calendarOpenButton) calendarOpenButton.addEventListener('click', openCalendarModal);
calendarCloseButtons.forEach((button) => button.addEventListener('click', closeCalendarModal));
if (commentsOpenButton) commentsOpenButton.addEventListener('click', openComments);
if (lightboxOpen) lightboxOpen.addEventListener('click', openLightbox);
closeButtons.forEach((button) => button.addEventListener('click', closeLightbox));
if (locationOpenButton) {
  locationOpenButton.addEventListener('click', (event) => {
    if (isLikelyMobileDevice()) return;
    event.preventDefault();
    openLocationModal();
  });
}
locationCloseButtons.forEach((button) => button.addEventListener('click', closeLocationModal));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (lightbox && !lightbox.hidden) closeLightbox();
    if (calendarModal && !calendarModal.hidden) closeCalendarModal();
    if (locationModal && !locationModal.hidden) closeLocationModal();
  }
});

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
    url: window.location.href
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
    calendarOutlookLink.href = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(details)}&startdt=${encodeURIComponent(startDate.toISOString())}&enddt=${encodeURIComponent(endDate.toISOString())}`;
  }
  if (calendarAppleLink) {
    calendarAppleLink.href = calendarIcsLink?.href || '#';
  }
}

function populateLocationLinks() {
  const location = eventData.location || locationOpenButton?.dataset.location || '';
  const query = normalizeLocationQuery(location);
  const encoded = encodeURIComponent(query);

  locationMapLinks.forEach((link) => {
    const provider = link.dataset.locationMap;
    let href = '#';
    if (provider === 'openstreetmap') {
      href = `https://www.openstreetmap.org/search?query=${encoded}`;
    } else if (provider === 'google') {
      href = `https://maps.google.com/?q=${encoded}`;
    } else if (provider === 'apple') {
      href = `https://maps.apple.com/?q=${encoded}`;
    } else if (provider === 'bing') {
      href = `https://www.bing.com/maps?q=${encoded}`;
    }
    link.href = href;
  });
}

function setupLocationLink() {
  if (!locationOpenButton) return;
  const location = eventData.location || locationOpenButton?.dataset.location || '';
  const query = normalizeLocationQuery(location);
  locationOpenButton.href = query ? `geo:0,0?q=${encodeURIComponent(query)}` : '#';
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

function buildIcs({ title, description, location, startDate, endDate, url }) {
  const stamp = toUtc(new Date());
  return [
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
    `DESCRIPTION:${escapeIcs(`${description}\n\n${url}`)}`,
    `LOCATION:${escapeIcs(location)}`,
    `URL:${escapeIcs(url)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
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

function normalizeLocationQuery(location = '') {
  const normalized = String(location).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Valladolid';
  return /valladolid/i.test(normalized) ? normalized : `${normalized}, Valladolid`;
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

function toggleSaved(eventId, button) {
  const id = String(eventId || '');
  if (!id) return;

  const saved = new Set(getSavedEvents().map(String));
  if (saved.has(id)) {
    saved.delete(id);
  } else {
    saved.add(id);
  }
  setSavedEvents(Array.from(saved));
  syncSavedStates();
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
  const shareText = `${title}\n\n${shareUrl}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text: shareText,
        url: shareUrl
      });
      setShareSuccess(button);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(shareText);
    setShareSuccess(button);
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
