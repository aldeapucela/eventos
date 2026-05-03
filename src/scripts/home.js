import { initTheme } from './theme.js';

const filters = Array.from(document.querySelectorAll('[data-filter]'));
const cards = Array.from(document.querySelectorAll('#event-grid [data-category]'));
const weekCards = Array.from(document.querySelectorAll('[data-week-groups] [data-category]'));
const filterHint = document.querySelector('.mobile-filter-hint');
const resultsTitle = document.querySelector('[data-results-title]');
const weekEmpty = document.querySelector('[data-week-empty]');
const clearFilters = document.querySelector('[data-clear-filters]');
const weekGroups = document.querySelector('[data-week-groups]');
const typeModal = document.querySelector('[data-type-modal]');
const typeSelectWrap = document.querySelector('.mobile-chip-select-wrap');
const typeSelectLabel = document.querySelector('[data-filter-type-label]');
const typeCheckboxes = Array.from(document.querySelectorAll('[data-type-checkbox]'));
const scrollTopButton = document.querySelector('[data-scroll-top]');
const shareSiteButton = document.querySelector('[data-share-site]');
const menuDrawer = document.querySelector('[data-menu-drawer]');
const addEventOpenButton = document.querySelector('[data-add-event-open]');
const addEventModal = document.querySelector('[data-add-event-modal]');
const subscribeModal = document.querySelector('[data-subscribe-modal]');
const events = Array.isArray(window.__EVENTS__?.events) ? window.__EVENTS__.events : [];
const storageKey = 'aldeapucela_saved_events';
initTheme();

const today = new Date();
const horizonEnd = endOfHorizon(today, 30);
const monthEnd = endOfMonth(today);
const weekStart = startOfWeek(today);
const weekEnd = endOfWeek(today);
const nextWeekStart = startOfNextWeek(today);
const nextWeekEnd = endOfNextWeek(today);
const initialState = getFiltersFromUrl();
let activeTimeFilter = initialState.time;
let activeFreeFilter = initialState.free;
let activeTypeFilters = initialState.type;

if (weekGroups) {
  renderWeekGroups();
}

syncSavedStates();
applyFilters({ updateUrl: false });
if (typeCheckboxes.length) {
  typeCheckboxes.forEach(cb => {
    cb.checked = activeTypeFilters.length === 0 || activeTypeFilters.includes(cb.value);
    cb.addEventListener('change', () => {
      activeTypeFilters = typeCheckboxes.filter(c => c.checked).map(c => c.value);
      if (activeTypeFilters.length === typeCheckboxes.length) {
        activeTypeFilters = [];
      }
      applyFilters();
    });
  });
  updateTypePill();
}

setupScrollTopButton();

document.addEventListener('click', async (event) => {
  const saveButton = event.target.closest('[data-save-event]');
  const shareButton = event.target.closest('[data-share-event]');
  const menuOpen = event.target.closest('[data-menu-open]');
  const menuClose = event.target.closest('[data-menu-close]');
  const menuPick = event.target.closest('[data-menu-drawer] [data-filter]');
  const shareSiteTrigger = event.target.closest('[data-share-site]');
  const addEventOpen = event.target.closest('[data-add-event-open]');
  const addEventClose = event.target.closest('[data-add-event-close]');
  const subscribeOpen = event.target.closest('[data-subscribe-open]');
  const subscribeClose = event.target.closest('[data-subscribe-close]');
  const copyButton = event.target.closest('[data-copy-url]');
  const typeModalOpen = event.target.closest('[data-type-modal-open]');
  const typeModalClose = event.target.closest('[data-type-modal-close]');
  const typeSelectAll = event.target.closest('[data-type-select-all]');
  const typeDeselectAll = event.target.closest('[data-type-deselect-all]');
  const typeOnly = event.target.closest('[data-type-only]');

  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    const action = toggleSaved(saveButton.dataset.eventId);
    if (action && typeof window.showSavedToast === 'function') {
      window.showSavedToast({ action });
    }
  }

  if (shareButton) {
    event.preventDefault();
    event.stopPropagation();
    await shareEvent(shareButton.dataset.eventUrl, shareButton.dataset.eventTitle, shareButton);
  }

  if (shareSiteTrigger) {
    event.preventDefault();
    await shareSite(shareSiteTrigger);
  }

  if (menuOpen) {
    event.preventDefault();
    openMenu();
  }

  if (menuClose) {
    event.preventDefault();
    closeMenu();
  }

  if (menuPick) {
    event.preventDefault();
    closeMenu();
    toggleQuickFilter(menuPick.dataset.filter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (addEventOpen) {
    event.preventDefault();
    openAddEventModal();
  }

  if (addEventClose) {
    event.preventDefault();
    closeAddEventModal();
  }

  if (subscribeOpen) {
    event.preventDefault();
    closeMenu();
    openSubscribeModal();
  }

  if (subscribeClose) {
    event.preventDefault();
    closeSubscribeModal();
  }

  if (copyButton) {
    event.preventDefault();
    copySubscribeUrl(copyButton);
  }

  if (typeModalOpen) {
    event.preventDefault();
    openTypeModal();
  }

  if (typeModalClose) {
    event.preventDefault();
    closeTypeModal();
  }

  if (typeSelectAll) {
    event.preventDefault();
    typeCheckboxes.forEach(cb => cb.checked = true);
    activeTypeFilters = [];
    applyFilters();
  }

  if (typeDeselectAll) {
    event.preventDefault();
    typeCheckboxes.forEach(cb => cb.checked = false);
    activeTypeFilters = ['__NONE__'];
    applyFilters();
  }

  if (typeOnly) {
    event.preventDefault();
    const value = typeOnly.dataset.typeOnly;
    typeCheckboxes.forEach(cb => cb.checked = (cb.value === value));
    activeTypeFilters = [value];
    applyFilters();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && addEventModal && !addEventModal.hidden) {
    closeAddEventModal();
  }
  if (event.key === 'Escape' && subscribeModal && !subscribeModal.hidden) {
    closeSubscribeModal();
  }
  if (event.key === 'Escape' && typeModal && !typeModal.hidden) {
    closeTypeModal();
  }
});

function applyFilters(options = {}) {
  const { updateUrl = true } = options;
  filters.forEach((button) => {
    const value = button.dataset.filter;
    const isActive = (value === 'free' && activeFreeFilter) || (value !== 'free' && value === activeTimeFilter);
    button.classList.toggle('pill-active', isActive);
    button.classList.toggle('mobile-chip-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  if (typeCheckboxes.length) {
    typeCheckboxes.forEach(cb => {
      cb.checked = activeTypeFilters.length === 0 || activeTypeFilters.includes(cb.value);
    });
    updateTypePill();
  }
  cards.forEach((card) => {
    const category = card.dataset.category || '';
    const isFree = card.dataset.free === 'true';
    const startsAt = card.dataset.startsAt ? parseDateLike(card.dataset.startsAt) : null;
    const timeVisible =
      activeTimeFilter === 'all' ||
      (activeTimeFilter === 'Hoy' && startsAt && sameDay(startsAt, today)) ||
      (activeTimeFilter === 'Este finde' && startsAt && startsAt >= today && startsAt <= weekEnd && isWeekend(startsAt)) ||
      (activeTimeFilter === 'Esta semana' && startsAt && startsAt >= weekStart && startsAt <= weekEnd) ||
      (activeTimeFilter === 'Próxima semana' && startsAt && startsAt >= nextWeekStart && startsAt <= nextWeekEnd) ||
      (activeTimeFilter === 'Este mes' && startsAt && startsAt <= monthEnd);
    const freeVisible = !activeFreeFilter || isFree;
    const typeVisible = activeTypeFilters.length === 0 || activeTypeFilters.includes(category);
    const visible = timeVisible && freeVisible && typeVisible;
    card.style.display = visible ? '' : 'none';
  });
  filterWeekGroups();

  if (filterHint) {
    filterHint.textContent = getCombinedLabel();
  }
  if (resultsTitle) {
    resultsTitle.textContent = getCombinedLabel();
  }
  if (clearFilters) {
    clearFilters.classList.toggle('hidden', activeTimeFilter === 'all' && !activeFreeFilter && activeTypeFilters.length === 0);
    clearFilters.href = '/';
  }
  if (updateUrl) {
    updateFilterUrl();
  }
}

filters.forEach((button) => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    if (button.closest('[data-menu-drawer]')) return;
    toggleQuickFilter(button.dataset.filter);
  });
});



if (clearFilters) {
  clearFilters.addEventListener('click', (event) => {
    event.preventDefault();
    activeTimeFilter = 'all';
    activeFreeFilter = false;
    activeTypeFilters = [];
    applyFilters();
  });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 6 || day === 0;
}

function endOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  copy.setHours(23, 59, 59, 999);
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfHorizon(date, days) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfNextWeek(date) {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 7);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfNextWeek(date) {
  const copy = endOfWeek(date);
  copy.setDate(copy.getDate() + 7);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function parseDateLike(value) {
  const stringValue = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(stringValue);
}

function getFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const time = normalizeTimeFilter(params.get('time'));
  const free = params.get('free') === '1' || normalizeTimeFilter(params.get('filter')) === 'free';
  const typeParam = params.get('type') || params.get('filter') || '';
  const type = typeParam ? typeParam.split(',').map(normalizeTypeFilter).filter(t => t !== 'all') : [];
  return { time, free, type };
}

function updateFilterUrl() {
  const url = new URL(window.location.href);
  if (activeTimeFilter === 'all') {
    url.searchParams.delete('time');
  } else {
    url.searchParams.set('time', activeTimeFilter);
  }
  if (activeFreeFilter) {
    url.searchParams.set('free', '1');
  } else {
    url.searchParams.delete('free');
  }
  if (activeTypeFilters.length === 0) {
    url.searchParams.delete('type');
  } else {
    url.searchParams.set('type', activeTypeFilters.join(','));
  }
  if (activeTimeFilter === 'all' && !activeFreeFilter && activeTypeFilters.length === 0) {
    url.searchParams.delete('filter');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function normalizeTimeFilter(filterValue) {
  const value = String(filterValue || '').trim();
  if (!value) return 'all';
  const allowed = new Set(['all', 'Hoy', 'Este finde', 'Esta semana', 'Próxima semana', 'Este mes']);
  return allowed.has(value) ? value : 'all';
}

function normalizeTypeFilter(filterValue) {
  const value = String(filterValue || '').trim();
  if (!value || value === 'all' || isQuickFilter(value) || value === 'free') return 'all';
  const categories = new Set((Array.isArray(window.__FILTERS__) ? window.__FILTERS__ : []).map(String));
  return categories.has(value) ? value : 'all';
}

function getLabel(filterValue) {
  switch (filterValue) {
    case 'Hoy':
      return 'Hoy';
    case 'Este finde':
      return 'Este finde';
    case 'Esta semana':
      return 'Esta semana';
    case 'Próxima semana':
      return 'Próxima semana';
    case 'Este mes':
      return 'Este mes';
    case 'free':
      return 'Gratis';
    default:
      return filterValue || 'Todos';
  }
}

function isQuickFilter(value) {
  return ['Hoy', 'Este finde', 'Esta semana', 'Próxima semana', 'Este mes', 'free'].includes(value);
}

function getCombinedLabel() {
  const parts = [];
  if (activeTimeFilter !== 'all') parts.push(getLabel(activeTimeFilter));
  if (activeFreeFilter) parts.push('Gratis');
  if (activeTypeFilters.length > 0 && activeTypeFilters[0] !== '__NONE__') {
    if (activeTypeFilters.length === 1) {
      parts.push(activeTypeFilters[0]);
    } else {
      parts.push(`Varios tipos (${activeTypeFilters.length})`);
    }
  }
  return parts.length ? parts.join(' · ') : 'Próximos eventos';
}

function updateTypePill() {
  if (!typeSelectWrap || !typeSelectLabel) return;
  const active = activeTypeFilters.length > 0;
  typeSelectWrap.classList.toggle('mobile-chip-active', Boolean(active));
  typeSelectLabel.textContent = active && activeTypeFilters[0] !== '__NONE__' ? `Tipo (${activeTypeFilters.length})` : 'Tipo';
}

function renderWeekGroups() {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const grouped = events
    .filter((event) => isWithinHorizon(event))
    .sort((a, b) => new Date(a.startsAtIso) - new Date(b.startsAtIso))
    .reduce((acc, event) => {
      const key = event.startsAtDayKey || toLocalDateKey(parseDateLike(event.startsAtIso));
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});

  const keys = Object.keys(grouped);
  if (!keys.length) {
    weekGroups.innerHTML = '<p class="text-sm leading-6 text-slate-500">No hay eventos esta semana.</p>';
    return;
  }

  weekGroups.innerHTML = keys
    .map((key) => {
      const date = parseDateLike(key);
      const label = capitalize(formatter.format(date).replace(',', ''));
      const items = grouped[key]
        .map(renderWeekItem)
        .join('');
      return `
        <section class="week-day-group" data-week-day-group>
          <div class="week-day-header">
            <div class="week-day-label">${label}</div>
          </div>
          <div class="event-row-list">${items}</div>
        </section>
      `;
    })
    .join('');
}

function openMenu() {
  if (!menuDrawer) return;
  menuDrawer.hidden = false;
  document.body.style.overflow = 'hidden';
}

function setupScrollTopButton() {
  if (!scrollTopButton) return;
  const onScroll = () => {
    const shouldShow = window.scrollY > 280;
    scrollTopButton.classList.toggle('is-hidden', !shouldShow);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  scrollTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function closeMenu() {
  if (!menuDrawer) return;
  menuDrawer.hidden = true;
  document.body.style.overflow = '';
}

function openAddEventModal() {
  if (!addEventModal) return;
  addEventModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function openSubscribeModal() {
  if (!subscribeModal) return;
  subscribeModal.hidden = false;
  document.body.style.overflow = 'hidden';
  subscribeModal.querySelector('[data-subscribe-close]')?.focus();
}

function closeSubscribeModal() {
  if (!subscribeModal) return;
  subscribeModal.hidden = true;
  document.body.style.overflow = '';
}

function openTypeModal() {
  if (!typeModal) return;
  typeModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeTypeModal() {
  if (!typeModal) return;
  typeModal.hidden = true;
  document.body.style.overflow = '';
}

async function copySubscribeUrl(button) {
  const key = button.dataset.copyUrl;
  const input = document.querySelector(`[data-copy-source="${key}"]`);
  if (!input) return;
  const value = input.value;
  const originalLabel = button.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      input.removeAttribute('readonly');
      input.focus();
      input.select();
      document.execCommand('copy');
      input.setAttribute('readonly', 'readonly');
    }
    button.textContent = 'Copiado';
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1200);
  } catch {
    input.focus();
    input.select();
  }
}

function closeAddEventModal() {
  if (!addEventModal) return;
  addEventModal.hidden = true;
  document.body.style.overflow = '';
  addEventOpenButton?.focus();
}

function renderWeekItem(event) {
    return `
      <article class="event-compact" data-category="${event.categoryLabel || ''}" data-free="${event.isFree ? 'true' : 'false'}" data-starts-at="${event.startsAtIso || ''}">
        <a href="${event.urlPath}" class="event-compact-link">
          <div class="event-compact-image" style="background-image:url('${event.image || '/assets/placeholder-event.svg'}')"></div>
          <div class="event-compact-copy">
          <div class="event-compact-topline">
            <span>${event.scheduleLabel || `${event.compactDateLabel || ''}${event.timeLabel ? ` · ${event.timeLabel}` : ''}`}</span>
          </div>
          <h4 class="event-compact-title">${event.title || ''}</h4>
          <p class="event-compact-meta">${event.location || ''}</p>
          <div class="event-compact-badges">
            <span class="compact-badge">${event.categoryLabel || 'Evento'}</span>
            ${event.isFree ? '<span class="compact-badge compact-badge-success">Gratis</span>' : ''}
          </div>
          </div>
        </a>
        <div class="event-compact-actions">
          <button class="event-compact-action" type="button" data-save-event data-event-id="${event.id}" aria-label="Guardar evento">
            <i class="fa-regular fa-bookmark"></i>
          </button>
        </div>
      </article>
    `;
  }

function isWithinHorizon(event) {
  if (!event?.startsAtIso) return false;
  const startsAt = new Date(event.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return false;
  const todayStart = startOfToday(today);
  if (startsAt < todayStart || startsAt > horizonEnd) return false;
  return !isOngoingMultiDay(event);
}

function isOngoingMultiDay(event) {
  if (!event?.startsAtIso || !event?.endsAtIso) return false;
  const startsAt = new Date(event.startsAtIso);
  const endsAt = new Date(event.endsAtIso);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return false;
  if (sameDay(startsAt, endsAt)) return false;
  return startsAt <= today && endsAt >= today;
}

function startOfToday(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function filterWeekGroups() {
  if (!weekGroups) return;

  const items = Array.from(weekGroups.querySelectorAll('[data-category]'));
  items.forEach((item) => {
    const category = item.dataset.category || '';
    const isFree = item.dataset.free === 'true';
      const startsAt = item.dataset.startsAt ? parseDateLike(item.dataset.startsAt) : null;
      const timeVisible =
        activeTimeFilter === 'all' ||
        (activeTimeFilter === 'Hoy' && startsAt && sameDay(startsAt, today)) ||
        (activeTimeFilter === 'Este finde' && startsAt && startsAt >= today && startsAt <= weekEnd && isWeekend(startsAt)) ||
        (activeTimeFilter === 'Esta semana' && startsAt && startsAt >= weekStart && startsAt <= weekEnd) ||
        (activeTimeFilter === 'Próxima semana' && startsAt && startsAt >= nextWeekStart && startsAt <= nextWeekEnd) ||
        (activeTimeFilter === 'Este mes' && startsAt && startsAt <= monthEnd);
      const freeVisible = !activeFreeFilter || isFree;
      const typeVisible = activeTypeFilters.length === 0 || activeTypeFilters.includes(category);
      const visible = timeVisible && freeVisible && typeVisible;
    item.style.display = visible ? '' : 'none';
  });

  weekGroups.querySelectorAll('[data-week-day-group]').forEach((group) => {
    const visibleItems = Array.from(group.querySelectorAll('[data-category]')).some((item) => item.style.display !== 'none');
    group.style.display = visibleItems ? '' : 'none';
  });
  const anyVisible = Array.from(weekGroups.querySelectorAll('[data-category]')).some((item) => item.style.display !== 'none');
  if (weekEmpty) {
    weekEmpty.classList.toggle('hidden', anyVisible);
  }
}

function toggleQuickFilter(filterValue) {
  if (filterValue === 'free') {
    activeFreeFilter = !activeFreeFilter;
    applyFilters();
    return;
  }
  const normalized = normalizeTimeFilter(filterValue);
  activeTimeFilter = activeTimeFilter === normalized ? 'all' : normalized;
  applyFilters();
}

function toLocalDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = active ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    }
  });
}

async function shareEvent(url, title, button) {
  const shareUrl = withShareCampaign(url || window.location.pathname);
  const shareTitle = title || document.title;
  const shareText = `${shareTitle}\n\n${shareUrl}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
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

async function shareSite(button = shareSiteButton) {
  const shareUrl = withShareCampaign('/');
  const message = 'Descubre qué hacer en Valladolid: eventos culturales compartidos por Aldea Pucela.';
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Aldea Pucela Eventos',
        text: message,
        url: shareUrl
      });
      setShareSuccess(button);
      return;
    }
    throw new Error('no web share');
  } catch {
    try {
      await navigator.clipboard.writeText(`${message}\n\n${shareUrl}`);
      setShareSuccess(button);
    } catch {
      setShareFailure(button);
    }
  }
}

function withShareCampaign(url) {
  const shareUrl = new URL(url || window.location.pathname, window.location.origin);
  shareUrl.searchParams.set('mtm_campaign', 'share');
  return shareUrl.toString();
}
