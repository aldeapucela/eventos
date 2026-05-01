const storageKey = 'aldeapucela_saved_events';
const menuDrawer = document.querySelector('[data-menu-drawer]');
const groupsRoot = document.querySelector('[data-saved-groups]');
const emptyState = document.querySelector('[data-saved-empty]');
const scrollTopButton = document.querySelector('[data-scroll-top]');
const events = Array.isArray(window.__EVENTS__?.events) ? window.__EVENTS__.events : [];

renderSavedGroups();
syncSavedStates();
syncScrollTopButton();

window.addEventListener('scroll', syncScrollTopButton, { passive: true });

document.addEventListener('click', (event) => {
  const saveButton = event.target.closest('[data-save-event]');
  const menuOpen = event.target.closest('[data-menu-open]');
  const menuClose = event.target.closest('[data-menu-close]');

  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleSaved(saveButton.dataset.eventId);
    renderSavedGroups();
    syncSavedStates();
  }

  if (menuOpen) {
    event.preventDefault();
    openMenu();
  }

  if (menuClose) {
    event.preventDefault();
    closeMenu();
  }

  if (event.target.closest('[data-scroll-top]')) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function syncScrollTopButton() {
  if (!scrollTopButton) return;
  const shouldShow = window.scrollY > 280;
  scrollTopButton.classList.toggle('is-hidden', !shouldShow);
}

function renderSavedGroups() {
  if (!groupsRoot || !emptyState) return;

  const savedIds = new Set(getSavedEvents().map(String));
  const savedEvents = events
    .filter((item) => savedIds.has(String(item.id)))
    .sort((a, b) => new Date(a.startsAtIso || 0) - new Date(b.startsAtIso || 0));

  if (!savedEvents.length) {
    groupsRoot.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const grouped = savedEvents.reduce((acc, item) => {
    const startsAt = parseDateLike(item.startsAtIso || item.startsAt);
    const key = item.startsAtDayKey || toLocalDateKey(startsAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const dateFormatter = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  groupsRoot.innerHTML = Object.keys(grouped)
    .sort((a, b) => new Date(a) - new Date(b))
    .map((key) => {
      const date = parseDateLike(key);
      const label = capitalize(dateFormatter.format(date));
      const cards = grouped[key].map(renderCard).join('');
      return `
        <section class="saved-day-group" data-saved-day-group>
          <div class="week-day-header">
            <h2 class="week-day-label saved-day-label">${label}</h2>
          </div>
          <div class="event-row-list saved-events-grid">${cards}</div>
        </section>
      `;
    })
    .join('');
}

function renderCard(event) {
  const image = event.image || '/assets/placeholder-event.svg';
  const schedule = event.scheduleLabel || `${event.compactDateLabel || ''}${event.timeLabel ? ` · ${event.timeLabel}` : ''}`;
  return `
    <article class="event-compact" data-starts-at="${event.startsAtIso || ''}">
      <a href="${event.urlPath}" class="event-compact-link">
        <div class="event-compact-image" style="background-image:url('${image}')"></div>
        <div class="event-compact-copy">
          <div class="event-compact-topline">
            <span>${schedule}</span>
          </div>
          <h3 class="event-compact-title">${event.title || ''}</h3>
          <p class="event-compact-meta">${event.location || ''}</p>
          <div class="event-compact-badges">
            <span class="compact-badge">${event.categoryLabel || 'Evento'}</span>
            ${event.isFree ? '<span class="compact-badge compact-badge-success">Gratis</span>' : ''}
          </div>
        </div>
      </a>
      <div class="event-compact-actions">
        <button class="event-compact-action" type="button" data-save-event data-event-id="${event.id}" aria-label="Quitar de guardados">
          <i class="fa-regular fa-bookmark"></i>
        </button>
      </div>
    </article>
  `;
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

function parseDateLike(value) {
  const stringValue = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(stringValue);
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
  if (!id) return;

  const saved = new Set(getSavedEvents().map(String));
  if (saved.has(id)) {
    saved.delete(id);
  } else {
    saved.add(id);
  }
  setSavedEvents(Array.from(saved));
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
