import { initTheme } from './theme.js';
import { setupMenuDrawer } from './menu-drawer.js';
import { setupSubscribe } from './subscribe.js';
import { getEventMetric, loadEventMetrics, recordEventSave } from './event-metrics.js';
import { rankPopularEvents } from './popular-ranking.js';

const list = document.querySelector('[data-popular-list]');
const state = document.querySelector('[data-popular-state]');
const summary = document.querySelector('[data-popular-summary]');
const modeButtons = Array.from(document.querySelectorAll('[data-popular-mode]'));
const SAVED_EVENTS_KEY = 'aldeapucela_saved_events';
let events = [];
let metrics = null;
let mode = new URLSearchParams(window.location.search).get('rank') === 'visits' ? 'visits' : 'saves';

initTheme();
setupMenuDrawer();
setupSubscribe();
clearLegacySpaceFilter();
void initialize();

function clearLegacySpaceFilter() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('space')) return;
  url.searchParams.delete('space');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function initialize() {
  try {
    // Las métricas de Matomo/NocoDB pueden tardar varios segundos. El dataset
    // de la lista es pequeño y permite mostrar contenido útil inmediatamente;
    // la popularidad se aplica en cuanto llega la respuesta de métricas.
    const siteDataPromise = fetch('/popular-site-data.json').then((response) => {
      if (!response.ok) throw new Error(`site data ${response.status}`);
      return response.json();
    });
    const metricsPromise = loadEventMetrics();
    const siteData = await siteDataPromise;
    events = Array.isArray(siteData?.events) ? siteData.events : [];
    render({ preview: true });

    metrics = await metricsPromise;
    if (!metrics) {
      summary.textContent = 'Mostrando próximos eventos mientras se actualiza la popularidad.';
      return;
    }
    render();
  } catch {
    showState('No se han podido cargar los eventos. Inténtalo de nuevo más tarde.');
  }
}

function render({ preview = false } = {}) {
  if (!list) return;
  modeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.popularMode === mode));
  });
  const ranked = rankPopularEvents(
    events,
    preview ? [] : metrics?.activities,
    mode,
    '',
    new Date(),
    preview ? [] : metrics?.visitRankIds
  );
  if (!ranked.length) {
    list.replaceChildren();
    summary.textContent = '';
    showState('No hay eventos vigentes en este momento.');
    return;
  }

  list.innerHTML = ranked.map((event) => renderEvent(event)).join('');
  summary.textContent = preview
    ? 'Cargando popularidad…'
    : `${ranked.length} ${ranked.length === 1 ? 'evento vigente' : 'eventos vigentes'} · ${mode === 'saves' ? 'ordenados por guardados' : 'ordenados por visitas'}`;
  if (state) state.hidden = true;
  syncSavedButtons();
}

function renderEvent(event) {
  const image = safeImageUrl(event.image);
  const date = event.compactDateLabel || event.scheduleLabel || event.detailScheduleLabel || '';
  const time = event.timeLabel === '00:00' ? '' : event.timeLabel || '';
  const location = event.location || event.venueLabel || '';
  const saveCount = toCount(event.metrics?.saveCount);
  const eventUrl = safeEventPath(event.urlPath, event.id, event.slug);
  return `
    <li class="popular-event-item">
      <article class="popular-event-row ${time ? 'has-time' : 'no-time'}">
        ${time ? `<time class="popular-event-time" datetime="${escapeAttribute(event.startsAtIso || event.startsAt || '')}">${escapeHtml(time)}</time>` : ''}
        <a class="popular-event-link" href="${escapeAttribute(eventUrl)}">
          <img class="popular-event-image" src="${escapeAttribute(image)}" alt="" width="96" height="96" loading="lazy" decoding="async" />
          <span class="popular-event-copy">
            <span class="popular-event-date">${escapeHtml(date)}</span>
            <span class="popular-event-title">${escapeHtml(event.title || 'Evento')}</span>
            ${location ? `<span class="popular-event-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${escapeHtml(location)}</span></span>` : ''}
          </span>
        </a>
        <div class="popular-event-actions">
          <button class="event-compact-action popular-event-save" type="button" data-save-event data-event-id="${escapeAttribute(event.id)}" aria-label="Guardar evento">
            <i class="fa-regular fa-bookmark" aria-hidden="true"></i>
            <span class="popular-event-save-count" aria-hidden="true"${saveCount > 0 ? '' : ' hidden'}>${saveCount > 0 ? saveCount : ''}</span>
          </button>
        </div>
      </article>
    </li>`;
}

function showState(message) {
  if (!state) return;
  state.textContent = message;
  state.hidden = false;
}

function syncSavedButtons() {
  const saved = readSavedIds();
  list?.querySelectorAll('[data-save-event]').forEach((button) => {
    const isSaved = saved.has(String(button.dataset.eventId));
    const saveCount = toCount(getEventMetric(button.dataset.eventId)?.saveCount
      ?? metrics?.activities?.find((activity) => String(activity.id) === String(button.dataset.eventId))?.saveCount);
    button.classList.toggle('event-compact-action-active', isSaved);
    button.setAttribute('aria-pressed', String(isSaved));
    const countDescription = saveCount > 0 ? `. ${formatCount(saveCount)} ${saveCount === 1 ? 'persona ha' : 'personas han'} guardado este evento` : '';
    button.setAttribute('aria-label', `${isSaved ? 'Quitar de guardados' : 'Guardar evento'}${countDescription}`);
    const countBadge = button.querySelector('.popular-event-save-count');
    if (countBadge) {
      countBadge.textContent = saveCount > 0 ? String(saveCount) : '';
      countBadge.hidden = saveCount <= 0;
    }
    const icon = button.querySelector('i');
    if (icon) icon.className = `${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark`;
  });
}

function readSavedIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_EVENTS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function toggleSaved(id) {
  const saved = readSavedIds();
  const key = String(id);
  const added = !saved.has(key);
  if (added) saved.add(key);
  else saved.delete(key);
  try {
    window.localStorage.setItem(SAVED_EVENTS_KEY, JSON.stringify([...saved]));
  } catch {}
  syncSavedButtons();
  if (added) {
    void recordEventSave(key).then((recorded) => {
      if (!recorded || !metrics) return;
      const updatedMetric = getEventMetric(key);
      if (!updatedMetric) return;
      metrics = {
        ...metrics,
        activities: [
          ...metrics.activities.filter((activity) => String(activity.id) !== key),
          updatedMetric
        ]
      };
      render();
    });
    window.trackMatomoActivityOnce?.({ action: 'save', eventId: key });
  }
  window.showSavedToast?.({ action: added ? 'added' : 'removed' });
}

function safeEventPath(path, id, slug) {
  const candidate = String(path || `/e/${id}/${slug || ''}/`);
  return candidate.startsWith('/e/') && !candidate.startsWith('//') ? candidate : `/e/${encodeURIComponent(id)}/`;
}

function safeImageUrl(value) {
  const candidate = String(value || '/assets/placeholder-event.svg');
  return /^(https?:\/\/|\/)/i.test(candidate) && !candidate.startsWith('//') ? candidate : '/assets/placeholder-event.svg';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function formatCount(value) {
  return new Intl.NumberFormat('es-ES').format(value);
}

modeButtons.forEach((button) => button.addEventListener('click', () => {
  mode = button.dataset.popularMode === 'visits' ? 'visits' : 'saves';
  updateUrl();
  render();
}));

list?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-save-event]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  toggleSaved(button.dataset.eventId);
});

function updateUrl() {
  const url = new URL(window.location.href);
  if (mode === 'visits') url.searchParams.set('rank', 'visits');
  else url.searchParams.delete('rank');
  url.searchParams.delete('space');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
