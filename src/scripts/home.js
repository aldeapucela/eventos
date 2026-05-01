const filters = Array.from(document.querySelectorAll('[data-filter]'));
const cards = Array.from(document.querySelectorAll('#event-grid [data-category]'));
const weekCards = Array.from(document.querySelectorAll('[data-week-groups] [data-category]'));
const filterHint = document.querySelector('.mobile-filter-hint');
const resultsTitle = document.querySelector('[data-results-title]');
const weekEmpty = document.querySelector('[data-week-empty]');
const clearFilters = document.querySelector('[data-clear-filters]');
const weekGroups = document.querySelector('[data-week-groups]');
const menuDrawer = document.querySelector('[data-menu-drawer]');
const events = Array.isArray(window.__EVENTS__?.events) ? window.__EVENTS__.events : [];
const storageKey = 'aldeapucela_saved_events';

const today = new Date();
const horizonEnd = endOfHorizon(today, 30);
const monthEnd = endOfMonth(today);
const weekStart = startOfWeek(today);
const weekEnd = endOfWeek(today);
const initialFilter = getFilterFromUrl() || 'all';

if (weekGroups) {
  renderWeekGroups();
}

syncSavedStates();
setActive(initialFilter, { updateUrl: false });

document.addEventListener('click', async (event) => {
  const saveButton = event.target.closest('[data-save-event]');
  const shareButton = event.target.closest('[data-share-event]');
  const menuOpen = event.target.closest('[data-menu-open]');
  const menuClose = event.target.closest('[data-menu-close]');
  const menuPick = event.target.closest('[data-menu-drawer] [data-filter]');

  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleSaved(saveButton.dataset.eventId, saveButton);
  }

  if (shareButton) {
    event.preventDefault();
    event.stopPropagation();
    await shareEvent(shareButton.dataset.eventUrl, shareButton.dataset.eventTitle, shareButton);
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
    setActive(menuPick.dataset.filter);
    const target = document.querySelector(`[data-filter="${CSS.escape(menuPick.dataset.filter)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

function setActive(filterValue, options = {}) {
  const { updateUrl = true } = options;
  filters.forEach((button) => {
    button.classList.toggle('pill-active', button.dataset.filter === filterValue);
    button.classList.toggle('mobile-chip-active', button.dataset.filter === filterValue);
    button.setAttribute('aria-pressed', String(button.dataset.filter === filterValue));
  });
  cards.forEach((card) => {
    const category = card.dataset.category || '';
    const isFree = card.dataset.free === 'true';
    const startsAt = card.dataset.startsAt ? parseDateLike(card.dataset.startsAt) : null;
    const visible =
      filterValue === 'all' ||
      (filterValue === 'Hoy' && startsAt && sameDay(startsAt, today)) ||
      (filterValue === 'Este finde' && startsAt && startsAt >= today && startsAt <= weekEnd && isWeekend(startsAt)) ||
      (filterValue === 'Esta semana' && startsAt && startsAt >= weekStart && startsAt <= weekEnd) ||
      (filterValue === 'Este mes' && startsAt && startsAt <= monthEnd) ||
      (filterValue === 'free' && isFree) ||
      category === filterValue;
    card.style.display = visible ? '' : 'none';
  });
  filterWeekGroups(filterValue);

  if (filterHint) {
    filterHint.textContent = filterValue === 'all' ? 'Mostrando: próximos eventos' : `Mostrando: ${getLabel(filterValue)}`;
  }
  if (resultsTitle) {
    resultsTitle.textContent = filterValue === 'all' ? 'Próximos eventos' : getLabel(filterValue);
  }
  if (clearFilters) {
    clearFilters.classList.toggle('hidden', filterValue === 'all');
    clearFilters.href = filterValue === 'all' ? '/' : '/';
  }
  if (updateUrl) {
    updateFilterUrl(filterValue);
  }
}

filters.forEach((button) => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => setActive(button.dataset.filter));
});

if (clearFilters) {
  clearFilters.addEventListener('click', (event) => {
    event.preventDefault();
    setActive('all');
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

function parseDateLike(value) {
  const stringValue = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(stringValue);
}

function getFilterFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter');
  return normalizeFilterValue(filter);
}

function updateFilterUrl(filterValue) {
  const url = new URL(window.location.href);
  const normalized = normalizeFilterValue(filterValue);
  if (!normalized || normalized === 'all') {
    url.searchParams.delete('filter');
  } else {
    url.searchParams.set('filter', normalized);
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function normalizeFilterValue(filterValue) {
  const value = String(filterValue || '').trim();
  if (!value) return 'all';
  const allowed = new Set(['all', 'Hoy', 'Este finde', 'Esta semana', 'Este mes', 'free']);
  return allowed.has(value) ? value : 'all';
}

function getLabel(filterValue) {
  switch (filterValue) {
    case 'Hoy':
      return 'Hoy';
    case 'Este finde':
      return 'Este finde';
    case 'Esta semana':
      return 'Esta semana';
    case 'Este mes':
      return 'Este mes';
    case 'free':
      return 'Gratis';
    default:
      return 'Todos';
  }
}

function renderWeekGroups() {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const grouped = events
    .filter((event) => event.startsAtIso && isWithinHorizon(event.startsAtIso))
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

function closeMenu() {
  if (!menuDrawer) return;
  menuDrawer.hidden = true;
  document.body.style.overflow = '';
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

function isWithinHorizon(iso) {
  const date = new Date(iso);
  return date >= today && date <= horizonEnd;
}

function filterWeekGroups(filterValue) {
  if (!weekGroups) return;

  const items = Array.from(weekGroups.querySelectorAll('[data-category]'));
  items.forEach((item) => {
    const category = item.dataset.category || '';
    const isFree = item.dataset.free === 'true';
      const startsAt = item.dataset.startsAt ? parseDateLike(item.dataset.startsAt) : null;
      const visible =
        filterValue === 'all' ||
        (filterValue === 'Hoy' && startsAt && sameDay(startsAt, today)) ||
        (filterValue === 'Este finde' && startsAt && startsAt >= today && startsAt <= weekEnd && isWeekend(startsAt)) ||
        (filterValue === 'Esta semana' && startsAt && startsAt >= weekStart && startsAt <= weekEnd) ||
        (filterValue === 'Este mes' && startsAt && startsAt <= monthEnd) ||
        (filterValue === 'free' && isFree) ||
        category === filterValue;
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

function toggleSaved(eventId, button) {
  const id = String(eventId || '');
  if (!id) return;

  const saved = new Set(getSavedEvents().map(String));
  if (saved.has(id)) {
    saved.delete(id);
    button.classList.remove('event-compact-action-active');
    button.innerHTML = '<i class="fa-regular fa-bookmark"></i>';
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
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = active ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    }
  });
}

async function shareEvent(url, title, button) {
  const shareUrl = new URL(url || window.location.pathname, window.location.origin).toString();
  const shareText = `${title || document.title}\n\n${shareUrl}`;
  try {
    await navigator.clipboard.writeText(shareText);
    setShareSuccess(button);
  } catch {
    try {
      if (navigator.share) {
        await navigator.share({
          title: title || document.title,
          text: shareText,
          url: shareUrl
        });
        setShareSuccess(button);
        return;
      }
      throw new Error('no share support');
    } catch {
      setShareFailure(button);
    }
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
