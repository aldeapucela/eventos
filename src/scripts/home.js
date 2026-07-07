import { initTheme } from './theme.js';

const filters = Array.from(document.querySelectorAll('[data-filter]'));
let cards = [];
let weekCards = [];

function updateCards() {
  cards = Array.from(document.querySelectorAll('article[data-category]'));
  weekCards = Array.from(document.querySelectorAll('[data-week-groups] [data-category]'));
}
const filterHint = document.querySelector('.mobile-filter-hint');
const mobileFilterRow = document.querySelector('.mobile-chip-row');
const resultsTitle = document.querySelector('[data-results-title]');
const weekEmpty = document.querySelector('[data-week-empty]');
const clearFilters = document.querySelector('[data-clear-filters]');
const weekGroups = document.querySelector('[data-week-groups]');
// En las páginas temporales (/hoy/, /fin-de-semana/...) la lista llega
// renderizada del servidor y no debe re-renderizarse en cliente.
const isServerRenderedList = Boolean(weekGroups && weekGroups.dataset.serverRendered === 'true');
const dateModal = document.querySelector('[data-date-modal]');
const typeModal = document.querySelector('[data-type-modal]');
const venueModal = document.querySelector('[data-venue-modal]');
const dateSelectButtons = Array.from(document.querySelectorAll('[data-date-modal-open]'));
const dateSelectLabel = document.querySelector('[data-filter-date-label]');
const drawerDateLabel = document.querySelector('[data-drawer-date-label]');
const dateMonthSelect = document.querySelector('[data-date-month-select]');
const typeSelectWrap = document.querySelector('.mobile-chip-type-trigger');
const typeSelectLabel = document.querySelector('[data-filter-type-label]');
const typeCheckboxes = Array.from(document.querySelectorAll('[data-type-checkbox]'));
const venueSelectWrap = document.querySelector('.mobile-chip-venue-trigger');
const venueSelectLabel = document.querySelector('[data-filter-venue-label]');
const venueOptions = document.querySelector('[data-venue-options]');
const scrollTopButton = document.querySelector('[data-scroll-top]');
const shareSiteButton = document.querySelector('[data-share-site]');
const menuDrawer = document.querySelector('[data-menu-drawer]');
const addEventOpenButton = document.querySelector('[data-add-event-open]');
const addEventModal = document.querySelector('[data-add-event-modal]');
const subscribeModal = document.querySelector('[data-subscribe-modal]');
const installModal = document.querySelector('[data-install-modal]');
const installAppCopy = document.querySelector('[data-install-app-copy]');
const installAppSteps = document.querySelector('[data-install-app-steps]');
const installAppConfirmButton = document.querySelector('[data-install-app-confirm]');
const installAppTriggers = Array.from(document.querySelectorAll('[data-install-app-open]'));
const categoryPicker = document.querySelector('[data-category-picker]');
const categorySelect = document.querySelector('[data-category-select]');
const categoryUrlInput = document.querySelector('[data-category-url]');
const categoryGoogleLink = document.querySelector('[data-category-google]');
const categoryAppleLink = document.querySelector('[data-category-apple]');
let events = Array.isArray(window.__EVENTS__?.events) ? window.__EVENTS__.events : [];
let availableFilters = Array.isArray(window.__FILTERS__) ? window.__FILTERS__.map(String) : [];
let availableSpaces = Array.isArray(window.__EVENTS__?.spaces) ? window.__EVENTS__.spaces : [];
let availableVenues = [];
const storageKey = 'aldeapucela_saved_events';
const DEFAULT_HORIZON_DAYS = 30;
const DATE_MODAL_FILTERS = new Set(['Este mes', 'Próximos 3 meses', 'Este año']);
const DATE_MONTH_PREFIX = 'Mes:';
const TIME_FILTERS = new Set(['all', 'Hoy', 'Este finde', 'Esta semana', 'Próxima semana', ...DATE_MODAL_FILTERS]);
const MOBILE_AUTO_SCROLL_FILTERS = new Set(['Hoy', 'Este finde', 'Esta semana', 'Próxima semana']);
const PRETTY_TIME_PATHS = {
  'Hoy': '/hoy/',
  'Este finde': '/fin-de-semana/',
  'Esta semana': '/esta-semana/',
  'Próxima semana': '/proxima-semana/',
  'Este mes': '/este-mes/',
  'Próximos 3 meses': '/proximos-3-meses/'
};
const SERVER_RENDERED_TIME_FILTERS = new Map(
  Object.entries(PRETTY_TIME_PATHS).map(([filterKey, path]) => [path, filterKey])
);
// Las páginas por categoría (/cine/, /musica/...) también llegan server-rendered
// pero listan una ventana abierta (de hoy en adelante), así que los filtros
// temporales pueden aplicarse en cliente sin salir de la categoría, en vez de
// saltar a /hoy/ (que mostraría todos los eventos y perdería la categoría).
// ponytail: una lista server-rendered cuya ruta no es de página temporal es de
// categoría; si se añaden otras páginas server-rendered, revisar esta heurística.
const isTimeFilterableList = isServerRenderedList && !SERVER_RENDERED_TIME_FILTERS.has(window.location.pathname);
let deferredInstallPrompt = null;
let siteDataPromise = null;
let didInitialFilterRowScroll = false;
initTheme();

const today = new Date();
const initialState = getFiltersFromUrl();
// Compatibilidad con enlaces antiguos: /?time=Este+finde -> /fin-de-semana/
// conservando el resto de filtros (?type=, ?venue=, ?free=).
const prettyTimePath = window.location.pathname === '/' ? PRETTY_TIME_PATHS[initialState.time] : '';
if (prettyTimePath) {
  const redirectUrl = new URL(window.location.href);
  redirectUrl.searchParams.delete('time');
  window.location.replace(`${prettyTimePath}${redirectUrl.search}${redirectUrl.hash}`);
}
let activeTimeFilter = initialState.time;
let activeFreeFilter = initialState.free;
let activeTypeFilters = initialState.type;
let activeVenueFilter = initialState.venue;

setupScrollTopButton();
setupCategoryPicker();
setupInstallPrompt();
setupTypeCheckboxes();
void initializeSiteData();

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
  const installOpen = event.target.closest('[data-install-app-open]');
  const installClose = event.target.closest('[data-install-app-close]');
  const installConfirm = event.target.closest('[data-install-app-confirm]');
  const copyButton = event.target.closest('[data-copy-url]');
  const typeModalOpen = event.target.closest('[data-type-modal-open]');
  const typeModalClose = event.target.closest('[data-type-modal-close]');
  const dateModalOpen = event.target.closest('[data-date-modal-open]');
  const dateModalClose = event.target.closest('[data-date-modal-close]');
  const dateFilterOption = event.target.closest('[data-date-filter-value]');
  const dateClear = event.target.closest('[data-date-clear]');
  const typeSelectAll = event.target.closest('[data-type-select-all]');
  const typeDeselectAll = event.target.closest('[data-type-deselect-all]');
  const typeOnly = event.target.closest('[data-type-only]');
  const carouselPrev = event.target.closest('[data-carousel-prev]');
  const carouselNext = event.target.closest('[data-carousel-next]');
  const venueModalOpen = event.target.closest('[data-venue-modal-open]');
  const venueModalClose = event.target.closest('[data-venue-modal-close]');
  const venueFilterOption = event.target.closest('[data-venue-filter-value]');
  const venueClear = event.target.closest('[data-venue-clear]');
  const timeLink = event.target.closest('a[data-time-link]');

  // En páginas de categoría el chip temporal filtra en cliente (sin salir de la
  // categoría). En el resto arrastra los filtros activos (?free, ?type, ?venue).
  if (timeLink) {
    const href = timeLink.getAttribute('href') || '/';
    if (isTimeFilterableList) {
      event.preventDefault();
      // Estos enlaces también viven dentro del drawer y del modal de fecha:
      // ciérralos antes de filtrar, como el resto de handlers de esos overlays,
      // para que no queden abiertos tapando el resultado.
      if (timeLink.closest('[data-menu-drawer]')) closeMenu();
      if (timeLink.closest('[data-date-modal]')) closeDateModal();
      const key = SERVER_RENDERED_TIME_FILTERS.get(href);
      if (key) toggleQuickFilter(key);
    } else {
      const target = buildTimeFilterHref(href, 'all');
      if (target !== href) {
        event.preventDefault();
        window.location.href = target;
      }
    }
  }

  if (carouselPrev) {
    event.preventDefault();
    const targetId = carouselPrev.dataset.carouselPrev;
    const carousel = document.getElementById(`${targetId}-carousel`);
    if (carousel) {
      const scrollAmount = carousel.offsetWidth * 0.8;
      carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
  }

  if (carouselNext) {
    event.preventDefault();
    const targetId = carouselNext.dataset.carouselNext;
    const carousel = document.getElementById(`${targetId}-carousel`);
    if (carousel) {
      const scrollAmount = carousel.offsetWidth * 0.8;
      carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }

  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    const action = toggleSaved(saveButton.dataset.eventId);
    if (action === 'added') {
      window.trackMatomoInteractionOnce?.({
        origin: 'home',
        action: 'save',
        eventId: String(saveButton.dataset.eventId || '')
      });
    }
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
    if (resultsTitle) {
      const offset = 100;
      const top = resultsTitle.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
    openSubscribeModal(subscribeOpen.dataset.subscribeOpen || 'calendar');
  }

  if (subscribeClose) {
    event.preventDefault();
    closeSubscribeModal();
  }

  if (installOpen) {
    event.preventDefault();
    await handleInstallAction();
  }

  if (installClose) {
    event.preventDefault();
    closeInstallModal();
  }

  if (installConfirm) {
    event.preventDefault();
    await confirmInstallAction();
  }

  if (copyButton) {
    event.preventDefault();
    copySubscribeUrl(copyButton);
  }

  if (dateModalOpen) {
    event.preventDefault();
    closeMenu();
    openDateModal();
  }

  if (dateModalClose) {
    event.preventDefault();
    closeDateModal();
  }

  if (dateFilterOption) {
    event.preventDefault();
    if (isServerRenderedList && !isTimeFilterableList) {
      // En páginas temporales la ventana de fechas vive en el servidor: la
      // selección se resuelve navegando a la portada con el filtro en la URL.
      window.location.href = buildTimeFilterHref('/', normalizeTimeFilter(dateFilterOption.dataset.dateFilterValue));
    } else {
      activeTimeFilter = normalizeTimeFilter(dateFilterOption.dataset.dateFilterValue);
      applyFilters();
      closeDateModal();
    }
  }

  if (dateClear) {
    event.preventDefault();
    if (isServerRenderedList && !isTimeFilterableList) {
      window.location.href = buildTimeFilterHref('/', 'all');
    } else {
      activeTimeFilter = 'all';
      applyFilters();
      closeDateModal();
    }
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
    // "Solo" deja seleccionado únicamente ese tipo en el filtro (in situ), sin
    // navegar a su página (para explorar los tipos está el archivo /tipos/).
    const value = typeOnly.dataset.typeOnly;
    typeCheckboxes.forEach(cb => cb.checked = (cb.value === value));
    activeTypeFilters = [value];
    applyFilters();
  }
  if (venueModalOpen) {
    event.preventDefault();
    closeMenu();
    openVenueModal();
  }
  if (venueModalClose) {
    event.preventDefault();
    closeVenueModal();
  }
  if (venueFilterOption) {
    event.preventDefault();
    const value = normalizeVenueFilter(venueFilterOption.dataset.venueFilterValue);
    activeVenueFilter = activeVenueFilter === value ? 'all' : value;
    applyFilters();
    closeVenueModal();
  }
  if (venueClear) {
    event.preventDefault();
    activeVenueFilter = 'all';
    applyFilters();
    closeVenueModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dateModal && !dateModal.hidden) {
    closeDateModal();
  }
  if (event.key === 'Escape' && addEventModal && !addEventModal.hidden) {
    closeAddEventModal();
  }
  if (event.key === 'Escape' && subscribeModal && !subscribeModal.hidden) {
    closeSubscribeModal();
  }
  if (event.key === 'Escape' && installModal && !installModal.hidden) {
    closeInstallModal();
  }
  if (event.key === 'Escape' && typeModal && !typeModal.hidden) {
    closeTypeModal();
  }
  if (event.key === 'Escape' && venueModal && !venueModal.hidden) {
    closeVenueModal();
  }
});

function applyFilters(options = {}) {
  const { updateUrl = true } = options;
  if (weekGroups && !isServerRenderedList) {
    renderWeekGroups();
  }
  filters.forEach((button) => {
    const value = button.dataset.filter;
    const isActive = (value === 'free' && activeFreeFilter) || (value !== 'free' && value === activeTimeFilter);
    button.classList.toggle('pill-active', isActive);
    button.classList.toggle('mobile-chip-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  // En páginas de categoría el filtro temporal es de cliente: los chips <a> no
  // son [data-filter], así que marcamos su estado activo aquí. Solo la barra
  // visible; los enlaces del drawer/modal se cierran al elegir.
  if (isTimeFilterableList) {
    document.querySelectorAll('.mobile-chip-row a[data-time-link]').forEach((link) => {
      const key = SERVER_RENDERED_TIME_FILTERS.get(link.getAttribute('href'));
      const isActive = Boolean(key) && key === activeTimeFilter;
      link.classList.toggle('mobile-chip-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  if (typeCheckboxes.length) {
    typeCheckboxes.forEach(cb => {
      cb.checked = activeTypeFilters.length === 0 || activeTypeFilters.includes(cb.value);
    });
    updateTypePill();
  }
  updateVenuePill();
  renderVenueOptions();
  updateDateFilterUi();
  cards.forEach((card) => {
    const category = card.dataset.category || '';
    const isFree = card.dataset.free === 'true';
    const startsAt = card.dataset.startsAt ? parseDateLike(card.dataset.startsAt) : null;
    const endsAt = card.dataset.endsAt ? parseDateLike(card.dataset.endsAt) : null;
    const timeVisible = checkTimeVisible(startsAt, endsAt, activeTimeFilter);
    const freeVisible = !activeFreeFilter || isFree;
    const typeVisible = activeTypeFilters.length === 0 || activeTypeFilters.includes(category);
    const venue = normalizeVenueKey(card.dataset.venueKey || card.dataset.venue || '');
    const venueVisible = activeVenueFilter === 'all' || venue === activeVenueFilter;
    const visible = timeVisible && freeVisible && typeVisible && venueVisible;
    card.style.display = visible ? '' : 'none';
  });
  
  const ongoingSection = document.querySelector('[data-ongoing-section]');
  if (ongoingSection) {
    const hasVisibleOngoing = Array.from(ongoingSection.querySelectorAll('article')).some(a => a.style.display !== 'none');
    ongoingSection.style.display = hasVisibleOngoing ? '' : 'none';
  }

  filterWeekGroups();

  if (filterHint) {
    filterHint.textContent = getCombinedLabel();
  }
  if (resultsTitle) {
    resultsTitle.textContent = getCombinedLabel();
  }
  if (clearFilters) {
    clearFilters.classList.toggle('hidden', activeTimeFilter === 'all' && !activeFreeFilter && activeTypeFilters.length === 0 && activeVenueFilter === 'all');
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
    // En páginas de categoría limpiar mantiene la categoría (filtra en cliente);
    // en las temporales vuelve a la portada.
    if (isServerRenderedList && !isTimeFilterableList) {
      window.location.href = '/';
      return;
    }
    activeTimeFilter = 'all';
    activeFreeFilter = false;
    activeTypeFilters = [];
    activeVenueFilter = 'all';
    applyFilters();
  });
}

function sameDay(a, b) {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

function checkTimeVisible(startsAt, endsAt, filterValue) {
  if (filterValue === 'all') return true;
  if (!startsAt) return false;
  
  const actualEndsAt = endsAt || startsAt;
  const t = new Date();
  
  if (filterValue === 'Hoy') {
    const todayEnd = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999);
    const todayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, 0);
    return startsAt <= todayEnd && actualEndsAt >= todayStart;
  }
  
  if (filterValue === 'Este finde') {
    const weekendRange = getWeekendRange(t);
    return startsAt <= weekendRange.end && actualEndsAt >= weekendRange.start;
  }
  
  if (filterValue === 'Esta semana') {
    return startsAt <= endOfWeek(t) && actualEndsAt >= startOfWeek(t);
  }
  
  if (filterValue === 'Próxima semana') {
    return startsAt <= endOfNextWeek(t) && actualEndsAt >= startOfNextWeek(t);
  }
  
  if (filterValue === 'Este mes') {
    return startsAt <= endOfMonth(t) && actualEndsAt >= startOfDay(t);
  }

  if (filterValue === 'Próximos 3 meses') {
    return startsAt <= endOfCurrentPlusMonths(t, 2) && actualEndsAt >= startOfDay(t);
  }

  if (filterValue === 'Este año') {
    return startsAt <= endOfYear(t) && actualEndsAt >= startOfDay(t);
  }

  const monthSelection = parseDateMonthFilter(filterValue);
  if (monthSelection) {
    const monthStart = new Date(monthSelection.year, monthSelection.monthIndex, 1, 0, 0, 0, 0);
    const monthEnd = endOfMonth(monthStart);
    return startsAt <= monthEnd && actualEndsAt >= monthStart;
  }
  
  return false;
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

function getWeekendRange(date) {
  const sundayEnd = endOfWeek(date);
  const fridayStart = new Date(sundayEnd);
  fridayStart.setDate(fridayStart.getDate() - 2);
  fridayStart.setHours(15, 0, 0, 0);
  return { start: fridayStart, end: sundayEnd };
}

function endOfHorizon(date, days) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
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

function endOfCurrentPlusMonths(date, additionalMonths) {
  return new Date(date.getFullYear(), date.getMonth() + additionalMonths + 1, 0, 23, 59, 59, 999);
}

function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
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

function getRelativeDatePrefix(dateIso) {
  if (!dateIso) return '';
  const date = parseDateLike(dateIso);
  if (Number.isNaN(date.getTime())) return '';
  
  const now = new Date();
  const todayStr = toLocalDateKey(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = toLocalDateKey(tomorrow);
  
  const dateStr = toLocalDateKey(date);
  
  if (dateStr === todayStr) return 'Hoy';
  if (dateStr === tomorrowStr) return 'Mañana';
  return '';
}

// Construye un href conservando los filtros activos de la URL (?free, ?type,
// ?venue) y fijando (o quitando, con 'all') el filtro temporal.
function buildTimeFilterHref(basePath, timeValue) {
  const params = new URLSearchParams(window.location.search);
  params.delete('time');
  if (timeValue && timeValue !== 'all') {
    params.set('time', timeValue);
  }
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ''}`;
}

function getFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  // En páginas temporales la ventana de fechas ya viene aplicada del servidor;
  // en las de categoría (ventana abierta) el filtro temporal sí se aplica aquí.
  const time = (isServerRenderedList && !isTimeFilterableList) ? 'all' : normalizeTimeFilter(params.get('time'));
  const free = params.get('free') === '1' || normalizeTimeFilter(params.get('filter')) === 'free';
  const typeParam = params.get('type') || params.get('filter') || '';
  const type = typeParam ? typeParam.split(',').map(normalizeTypeFilter).filter(t => t !== 'all') : [];
  const venueFromUrl = normalizeVenueKey(params.get('venue'));
  const venue = venueFromUrl && venueFromUrl !== 'all' ? venueFromUrl : 'all';
  return { time, free, type, venue };
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
  if (activeVenueFilter === 'all') {
    url.searchParams.delete('venue');
  } else {
    url.searchParams.set('venue', activeVenueFilter);
  }
  if (activeTimeFilter === 'all' && !activeFreeFilter && activeTypeFilters.length === 0 && activeVenueFilter === 'all') {
    url.searchParams.delete('filter');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function normalizeTimeFilter(filterValue) {
  const value = String(filterValue || '').trim();
  if (!value) return 'all';
  if (isDateMonthFilter(value)) return value;
  return TIME_FILTERS.has(value) ? value : 'all';
}

function normalizeTypeFilter(filterValue) {
  const value = String(filterValue || '').trim();
  if (!value || value === 'all' || isQuickFilter(value) || value === 'free') return 'all';
  const categories = new Set(availableFilters);
  return categories.has(value) ? value : 'all';
}
function normalizeVenueText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function normalizeVenueKey(value) {
  return normalizeVenueText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(sala|espacio|centro|teatro|bar|csa|club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeVenueFilter(filterValue) {
  const value = normalizeVenueKey(filterValue);
  if (!value || value === 'all') return 'all';
  const venues = new Set(availableVenues.map((venue) => normalizeVenueKey(venue)));
  return venues.has(value) ? value : 'all';
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
    case 'Próximos 3 meses':
      return 'Próximos 3 meses';
    case 'Este año':
      return 'Este año';
    case 'free':
      return 'Gratis';
    default:
      if (isDateMonthFilter(filterValue)) {
        const monthSelection = parseDateMonthFilter(filterValue);
        if (monthSelection) {
          return new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(monthSelection.year, monthSelection.monthIndex, 1));
        }
      }
      return filterValue || 'Todos';
  }
}

function isQuickFilter(value) {
  return ['Hoy', 'Este finde', 'Esta semana', 'Próxima semana', 'Este mes', 'Próximos 3 meses', 'Este año', 'free'].includes(value) || isDateMonthFilter(value);
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
  if (activeVenueFilter !== 'all') {
    const activeVenueLabel = availableVenues.find((venue) => normalizeVenueKey(venue) === activeVenueFilter) || 'Espacio';
    parts.push(activeVenueLabel);
  }
  return parts.length ? parts.join(' · ') : 'Próximos eventos';
}

function truncateVenueChipLabel(value, maxLength = 22) {
  const label = String(value || '').trim();
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function updateTypePill() {
  if (!typeSelectWrap || !typeSelectLabel) return;
  const active = activeTypeFilters.length > 0;
  typeSelectWrap.classList.toggle('mobile-chip-active', Boolean(active));
  typeSelectLabel.textContent = active && activeTypeFilters[0] !== '__NONE__' ? `Tipo (${activeTypeFilters.length})` : 'Tipo';
}

function updateDateFilterUi() {
  if (isServerRenderedList && !isTimeFilterableList) return;
  const active = DATE_MODAL_FILTERS.has(activeTimeFilter) || isDateMonthFilter(activeTimeFilter);
  if (dateSelectLabel) {
    dateSelectLabel.textContent = active ? `Fecha · ${getLabel(activeTimeFilter)}` : 'Fecha';
  }
  if (drawerDateLabel) {
    drawerDateLabel.textContent = active ? `Fecha · ${getLabel(activeTimeFilter)}` : 'Fecha';
  }
  dateSelectButtons.forEach((button) => {
    button.classList.toggle('pill-active', active);
    button.classList.toggle('mobile-chip-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-date-filter-value]').forEach((button) => {
    const isSelected = button.dataset.dateFilterValue === activeTimeFilter;
    button.classList.toggle('calendar-modal-action-primary', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
  if (dateMonthSelect) {
    dateMonthSelect.value = isDateMonthFilter(activeTimeFilter) ? activeTimeFilter : '';
  }
}
function updateVenuePill() {
  if (!venueSelectWrap || !venueSelectLabel) return;
  const active = activeVenueFilter !== 'all';
  venueSelectWrap.classList.toggle('mobile-chip-active', active);
  venueSelectWrap.setAttribute('aria-pressed', String(active));
  if (!active) {
    venueSelectLabel.textContent = 'Espacio';
    venueSelectWrap.setAttribute('aria-label', 'Filtrar por espacio');
    venueSelectWrap.removeAttribute('title');
    return;
  }
  const selectedLabel = availableVenues.find((venue) => normalizeVenueKey(venue) === activeVenueFilter) || 'Espacio';
  const visibleLabel = truncateVenueChipLabel(selectedLabel);
  venueSelectLabel.textContent = `Espacio · ${visibleLabel}`;
  venueSelectWrap.setAttribute('aria-label', `Filtrar por espacio. Activo: ${selectedLabel}`);
  venueSelectWrap.setAttribute('title', selectedLabel);
}
function renderVenueOptions() {
  if (!venueOptions) return;
  // Solo espacios con eventos visibles bajo los filtros actuales (más el activo).
  const selectable = getSelectableVenueKeys();
  const venuesToShow = availableVenues.filter((venue) => {
    const key = normalizeVenueKey(venue);
    return selectable.has(key) || key === activeVenueFilter;
  });
  const buttons = [
    `<button class="calendar-modal-action filter-date-option ${activeVenueFilter === 'all' ? 'calendar-modal-action-primary' : ''}" type="button" data-venue-filter-value="all" aria-pressed="${String(activeVenueFilter === 'all')}"><i class="fa-solid fa-check"></i><span>Todos</span></button>`,
    ...venuesToShow.map((venue) => {
      const normalized = normalizeVenueKey(venue);
      const selected = activeVenueFilter === normalized;
      return `<button class="calendar-modal-action filter-date-option filter-venue-option ${selected ? 'calendar-modal-action-primary' : ''}" type="button" data-venue-filter-value="${venue}" aria-pressed="${String(selected)}"><i class="fa-solid fa-location-dot"></i><span>${venue}</span></button>`;
    })
  ];
  venueOptions.innerHTML = buttons.join('');
}

function renderDateMonthOptions() {
  if (!dateMonthSelect) return;
  const monthValues = getAvailableEventMonthsThisYear();
  dateMonthSelect.innerHTML = ['<option value="">Opciones</option>', ...monthValues
    .map((value) => {
      const parsed = parseDateMonthFilter(value);
      if (!parsed) return '';
      const label = capitalize(new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(parsed.year, parsed.monthIndex, 1)));
      return `<option value="${value}">${label}</option>`;
    })
    .join('')].join('');
}

function setupTypeCheckboxes() {
  if (!typeCheckboxes.length) return;
  typeCheckboxes.forEach((cb) => {
    cb.checked = activeTypeFilters.length === 0 || activeTypeFilters.includes(cb.value);
    cb.addEventListener('change', () => {
      activeTypeFilters = typeCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      if (activeTypeFilters.length === typeCheckboxes.length) {
        activeTypeFilters = [];
      }
      applyFilters();
    });
  });
  updateTypePill();
}

async function initializeSiteData() {
  const siteData = await loadSiteData();
  events = siteData.events;
  availableFilters = siteData.filters;
  availableSpaces = siteData.spaces;
  availableVenues = getAvailableVenues(availableSpaces);
  activeVenueFilter = normalizeVenueFilter(activeVenueFilter);
  renderDateMonthOptions();
  renderVenueOptions();
  updateVenuePill();
  if (weekGroups && !isServerRenderedList) {
    renderWeekGroups();
  }
  syncSavedStates();
  updateCards();
  applyFilters({ updateUrl: false });
  maybeScrollToFiltersOnInitialLoad();
}

function maybeScrollToFiltersOnInitialLoad() {
  if (didInitialFilterRowScroll || !isMobileViewport() || !mobileFilterRow) return;
  if (!hasAnyFilterContextForInitialScroll() || !hasAnyActiveFilter()) return;
  didInitialFilterRowScroll = true;
  scrollToResultsSection();
}

function hasAnyFilterContextForInitialScroll() {
  return hasFiltersInUrl() || hasServerRenderedTimeFilter();
}

function hasFiltersInUrl() {
  const params = new URLSearchParams(window.location.search);
  return ['time', 'free', 'type', 'venue', 'filter'].some((key) => params.has(key));
}

function hasServerRenderedTimeFilter() {
  if (!isServerRenderedList) return false;
  return SERVER_RENDERED_TIME_FILTERS.has(window.location.pathname);
}

function hasAnyActiveFilter() {
  return activeTimeFilter !== 'all' || hasServerRenderedTimeFilter() || activeFreeFilter || activeTypeFilters.length > 0 || activeVenueFilter !== 'all';
}

async function loadSiteData() {
  if (events.length && availableFilters.length) {
    return { events, filters: availableFilters, spaces: availableSpaces };
  }
  if (!siteDataPromise) {
    siteDataPromise = fetch('/site-data.json')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load site data: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => ({
        events: Array.isArray(payload?.events) ? payload.events : [],
        filters: Array.isArray(payload?.filters) ? payload.filters.map(String) : [],
        spaces: Array.isArray(payload?.spaces) ? payload.spaces : []
      }))
      .catch((error) => {
        console.error(error);
        return { events: [], filters: [], spaces: [] };
      });
  }
  return siteDataPromise;
}

function getAvailableEventMonthsThisYear() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const months = new Set();
  events.forEach((event) => {
    const startsAt = event?.startsAtIso ? parseDateLike(event.startsAtIso) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) return;
    if (startsAt.getFullYear() !== currentYear) return;
    const monthIndex = startsAt.getMonth();
    if (monthIndex < currentMonth) return;
    months.add(monthIndex);
  });
  return Array.from(months)
    .sort((a, b) => a - b)
    .map((monthIndex) => `${DATE_MONTH_PREFIX}${currentYear}-${String(monthIndex + 1).padStart(2, '0')}`);
}

function isDateMonthFilter(value) {
  return typeof value === 'string' && value.startsWith(DATE_MONTH_PREFIX) && parseDateMonthFilter(value) !== null;
}

function parseDateMonthFilter(value) {
  const parsed = String(value || '').match(/^Mes:(\d{4})-(\d{2})$/);
  if (!parsed) return null;
  const year = Number(parsed[1]);
  const month = Number(parsed[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}
function getAvailableVenues(items) {
  return items
    .map((space) => String(space?.name || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    // Descarta nombres que no parecen un lugar (p. ej. "C." truncado).
    .filter((name) => /[a-záéíóúñü]{3,}/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'es-ES'));
}

// Claves de venue con al menos un evento que pasa los filtros actuales
// (tiempo/gratis/tipo, ignorando el propio filtro de espacio). Se recalcula en
// cada applyFilters, así el filtro Espacio solo ofrece opciones con resultados.
function getSelectableVenueKeys() {
  const keys = new Set();
  document.querySelectorAll('article[data-category]').forEach((card) => {
    const category = card.dataset.category || '';
    const isFree = card.dataset.free === 'true';
    const startsAt = card.dataset.startsAt ? parseDateLike(card.dataset.startsAt) : null;
    const endsAt = card.dataset.endsAt ? parseDateLike(card.dataset.endsAt) : null;
    if (!checkTimeVisible(startsAt, endsAt, activeTimeFilter)) return;
    if (activeFreeFilter && !isFree) return;
    if (activeTypeFilters.length && !activeTypeFilters.includes(category)) return;
    const venueKey = normalizeVenueKey(card.dataset.venueKey || card.dataset.venue || '');
    if (venueKey) keys.add(venueKey);
  });
  return keys;
}

function renderWeekGroups() {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const grouped = events
    .filter((event) => isWithinListingWindow(event))
    .sort((a, b) => new Date(a.startsAtIso) - new Date(b.startsAtIso))
    .reduce((acc, event) => {
      const key = event.startsAtDayKey || toLocalDateKey(parseDateLike(event.startsAtIso));
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});

  const keys = Object.keys(grouped);
  if (!keys.length) {
    weekGroups.innerHTML = '<p class="text-sm leading-6 text-slate-500">No hay eventos en este periodo.</p>';
    return;
  }

  weekGroups.innerHTML = keys
    .map((key) => {
      const date = parseDateLike(key);
      const prefix = getRelativeDatePrefix(key);
      const label = prefix ? `${prefix}, ${capitalize(formatter.format(date).replace(',', ''))}` : capitalize(formatter.format(date).replace(',', ''));
      const items = grouped[key]
        .map(renderWeekItem)
        .join('');
      return `
        <section class="week-day-group" data-week-day-group data-day-key="${key}">
          <div class="week-day-header">
            <div class="week-day-label">${label}</div>
          </div>
          <div class="event-row-list">${items}</div>
        </section>
      `;
    })
    .join('');
  
  updateCards();
  syncSavedStates();
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

function openSubscribeModal(section = 'calendar') {
  if (!subscribeModal) return;
  subscribeModal.hidden = false;
  document.body.style.overflow = 'hidden';
  const targetSection = subscribeModal.querySelector(`[data-subscribe-section="${section}"]`);
  if (targetSection) {
    targetSection.scrollIntoView({ block: 'start', behavior: 'instant' });
  } else {
    subscribeModal.scrollTop = 0;
  }
  subscribeModal.querySelector('[data-subscribe-close]')?.focus();
}

function closeSubscribeModal() {
  if (!subscribeModal) return;
  subscribeModal.hidden = true;
  document.body.style.overflow = '';
}

function openInstallModal() {
  if (!installModal) return;
  installModal.hidden = false;
  document.body.style.overflow = 'hidden';
  installModal.querySelector('[data-install-app-close]')?.focus();
}

function closeInstallModal() {
  if (!installModal) return;
  installModal.hidden = true;
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
function openVenueModal() {
  if (!venueModal) return;
  renderVenueOptions();
  venueModal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeVenueModal() {
  if (!venueModal) return;
  venueModal.hidden = true;
  document.body.style.overflow = '';
}

function openDateModal() {
  if (!dateModal) return;
  dateModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDateModal() {
  if (!dateModal) return;
  dateModal.hidden = true;
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

function setupCategoryPicker() {
  if (!categoryPicker || !categorySelect || !categoryUrlInput) return;
  let feeds = [];
  try {
    feeds = JSON.parse(categoryPicker.dataset.feeds || '[]');
  } catch {
    feeds = [];
  }
  const syncFeed = () => {
    const selected = feeds.find((feed) => feed.slug === categorySelect.value) || feeds[0];
    if (!selected) return;
    categoryUrlInput.value = selected.url;
    categoryUrlInput.setAttribute('value', selected.url);
    if (categoryGoogleLink) {
      categoryGoogleLink.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(selected.webcalUrl)}`;
    }
    if (categoryAppleLink) {
      categoryAppleLink.href = selected.webcalUrl;
    }
  };
  categorySelect.addEventListener('change', syncFeed);
  syncFeed();
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallTriggerVisibility();
    updateInstallModalCopy();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    closeInstallModal();
  });
  syncInstallTriggerVisibility();
  updateInstallModalCopy();
}

function isIosLike() {
  const ua = window.navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

function updateInstallModalCopy() {
  if (!installAppCopy || !installAppSteps || !installAppConfirmButton) return;
  if (deferredInstallPrompt) {
    installAppCopy.textContent = 'Instala la agenda como app para abrirla más rápido desde tu móvil.';
    installAppSteps.innerHTML = [
      '<li class="install-app-step"><span class="install-app-step-number">1</span><span>Se abrirá el diálogo del navegador para instalar la app.</span></li>',
      '<li class="install-app-step"><span class="install-app-step-number">2</span><span>Confirma la instalación y la tendrás en tu pantalla de inicio.</span></li>'
    ].join('');
    installAppConfirmButton.hidden = false;
    installAppConfirmButton.textContent = 'Instalar app';
    return;
  }
  if (isIosLike()) {
    installAppCopy.textContent = 'En iPhone o iPad puedes guardarla como app desde el menú de compartir de Safari.';
    installAppSteps.innerHTML = [
      '<li class="install-app-step"><span class="install-app-step-number">1</span><span>Abre esta página en Safari y toca el botón de compartir.</span></li>',
      '<li class="install-app-step"><span class="install-app-step-number">2</span><span>Elige <strong>Añadir a pantalla de inicio</strong> y confirma.</span></li>'
    ].join('');
    installAppConfirmButton.hidden = true;
    return;
  }
  installAppCopy.textContent = 'Tu navegador no está mostrando el instalador automático ahora mismo, pero la web ya es instalable cuando el navegador lo permita.';
  installAppSteps.innerHTML = [
    '<li class="install-app-step"><span class="install-app-step-number">1</span><span>Abre el menú del navegador.</span></li>',
    '<li class="install-app-step"><span class="install-app-step-number">2</span><span>Busca la opción para instalar la app o añadirla a la pantalla de inicio.</span></li>'
  ].join('');
  installAppConfirmButton.hidden = true;
}

function syncInstallTriggerVisibility() {
  const shouldShow = isIosLike() || Boolean(deferredInstallPrompt);
  installAppTriggers.forEach((button) => {
    button.classList.toggle('hidden', !shouldShow);
  });
}

async function handleInstallAction() {
  if (deferredInstallPrompt) {
    openInstallModal();
    return;
  }
  openInstallModal();
}

async function confirmInstallAction() {
  if (!deferredInstallPrompt) {
    closeInstallModal();
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  closeInstallModal();
  await promptEvent.prompt();
  if (promptEvent.userChoice) {
    await promptEvent.userChoice.catch(() => {});
  }
}

function closeAddEventModal() {
  if (!addEventModal) return;
  addEventModal.hidden = true;
  document.body.style.overflow = '';
  addEventOpenButton?.focus();
}

// Espejo de src/templates/partials/event-compact.njk: si cambias este markup,
// cambia también el partial (y viceversa).
function renderWeekItem(event) {
    return `
      <article class="event-compact" data-category="${event.categoryLabel || ''}" data-free="${event.isFree ? 'true' : 'false'}" data-venue="${event.venueLabel || event.location || ''}" data-venue-key="${event.venueKey || ''}" data-starts-at="${event.startsAtIso || ''}" data-ends-at="${event.endsAtIso || ''}">
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

function isWithinListingWindow(event) {
  if (!event?.startsAtIso) return false;
  const startsAt = new Date(event.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return false;
  const windowStart = startOfToday(today);
  if (startsAt < windowStart) return false;
  if (shouldHideFromUpcomingList(event, startsAt)) return false;
  const windowEnd = getListingWindowEnd(activeTimeFilter, today);
  return startsAt <= windowEnd;
}

function getListingWindowEnd(filterValue, date) {
  const monthSelection = parseDateMonthFilter(filterValue);
  if (monthSelection) {
    return endOfMonth(new Date(monthSelection.year, monthSelection.monthIndex, 1, 0, 0, 0, 0));
  }
  switch (filterValue) {
    case 'Hoy':
      return endOfHorizon(date, 0);
    case 'Este finde':
      return getWeekendRange(date).end;
    case 'Esta semana':
      return endOfWeek(date);
    case 'Próxima semana':
      return endOfNextWeek(date);
    case 'Este mes':
      return endOfMonth(date);
    case 'Próximos 3 meses':
      return endOfCurrentPlusMonths(date, 2);
    case 'Este año':
      return endOfYear(date);
    case 'all':
    default:
      return endOfHorizon(date, DEFAULT_HORIZON_DAYS);
  }
}

function isOngoingMultiDay(event) {
  if (!event?.startsAtIso || !event?.endsAtIso) return false;
  const startsAt = parseEventBoundaryDate(event.startsAtIso, 'start');
  const endsAt = parseEventBoundaryDate(event.endsAtIso, 'end');
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return false;
  if (sameDay(startsAt, endsAt)) return false;
  return startsAt <= today && endsAt >= today;
}

function parseEventBoundaryDate(value, boundary = 'start') {
  const stringValue = String(value || '').trim();
  if (!stringValue) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    if (boundary === 'end') return new Date(year, month - 1, day, 23, 59, 59, 999);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return new Date(stringValue);
}

function shouldHideFromUpcomingList(event, startsAt = null) {
  if (!isOngoingMultiDay(event)) return false;
  const eventStartsAt = startsAt instanceof Date ? startsAt : new Date(event.startsAtIso);
  if (Number.isNaN(eventStartsAt.getTime())) return false;
  // Multi-day events already surface in "En curso", so we keep them out of day buckets.
  return true;
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
      const endsAt = item.dataset.endsAt ? parseDateLike(item.dataset.endsAt) : null;
      const timeVisible = checkTimeVisible(startsAt, endsAt, activeTimeFilter);
      const freeVisible = !activeFreeFilter || isFree;
      const typeVisible = activeTypeFilters.length === 0 || activeTypeFilters.includes(category);
      const venue = normalizeVenueKey(item.dataset.venueKey || item.dataset.venue || '');
      const venueVisible = activeVenueFilter === 'all' || venue === activeVenueFilter;
      const visible = timeVisible && freeVisible && typeVisible && venueVisible;
    item.style.display = visible ? '' : 'none';
  });

  weekGroups.querySelectorAll('[data-week-day-group]').forEach((group) => {
    if (activeTimeFilter === 'Este finde') {
      const dayDate = parseDateLike(group.dataset.dayKey || '');
      if (!Number.isNaN(dayDate.getTime())) {
        const day = dayDate.getDay();
        const isWeekendGroup = day === 5 || day === 6 || day === 0;
        if (!isWeekendGroup) {
          group.style.display = 'none';
          return;
        }
      }
    }
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
  const shouldAutoScroll = shouldAutoScrollToFirstVisibleBlock(activeTimeFilter);
  applyFilters();
  if (shouldAutoScroll) {
    scrollToFirstVisibleResultsBlock();
  }
}

function shouldAutoScrollToFirstVisibleBlock(filterValue) {
  return MOBILE_AUTO_SCROLL_FILTERS.has(String(filterValue || '').trim());
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function scrollToResultsSection() {
  window.requestAnimationFrame(() => {
    const target = resultsTitle || getFirstVisibleResultsBlock();
    if (!target) return;
    const offset = 88;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

function scrollToFirstVisibleResultsBlock() {
  window.requestAnimationFrame(() => {
    const target = getFirstVisibleResultsBlock();
    if (!target) return;
    const offset = 88;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

function getFirstVisibleResultsBlock() {
  const ongoingSection = document.querySelector('[data-ongoing-section]');
  if (ongoingSection && ongoingSection.style.display !== 'none') {
    return ongoingSection;
  }

  const firstVisibleWeekGroup = Array.from(document.querySelectorAll('[data-week-day-group]'))
    .find((group) => group.style.display !== 'none');
  if (firstVisibleWeekGroup) {
    return firstVisibleWeekGroup;
  }

  if (weekEmpty && !weekEmpty.classList.contains('hidden')) {
    return weekEmpty;
  }

  return resultsTitle;
}

function toLocalDateKey(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
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
  const targetId = String(button?.dataset?.eventId || '');

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
        url: shareUrl
      });
      setShareSuccess(button);
      window.trackMatomoInteractionOnce?.({
        origin: 'home',
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
      origin: 'home',
      action: 'share',
      eventId: targetId
    });
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

function getActiveShareTimeFilter() {
  if (activeTimeFilter !== 'all') return activeTimeFilter;
  return SERVER_RENDERED_TIME_FILTERS.get(window.location.pathname) || 'all';
}

function getShareTimeContext() {
  const filterValue = getActiveShareTimeFilter();
  switch (filterValue) {
    case 'Hoy':
      return 'hoy';
    case 'Este finde':
      return 'este finde';
    case 'Esta semana':
      return 'esta semana';
    case 'Próxima semana':
      return 'la próxima semana';
    case 'Este mes':
      return 'este mes';
    case 'Próximos 3 meses':
      return 'en los próximos meses';
    case 'Este año':
      return 'este año';
    default:
      if (isDateMonthFilter(filterValue)) {
        const monthSelection = parseDateMonthFilter(filterValue);
        if (!monthSelection) return '';
        const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(
          new Date(monthSelection.year, monthSelection.monthIndex, 1)
        );
        return monthSelection.year === today.getFullYear()
          ? `en ${monthLabel}`
          : `en ${monthLabel} de ${monthSelection.year}`;
      }
      return '';
  }
}

function buildShareSiteMessage() {
  const timeContext = getShareTimeContext();
  return timeContext
    ? `Eventos culturales ${timeContext} en Valladolid.`
    : 'Eventos culturales en Valladolid.';
}

async function shareSite(button = shareSiteButton) {
  const shareUrl = withShareCampaign(window.location.href);
  const message = buildShareSiteMessage();
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
if (dateMonthSelect) {
  dateMonthSelect.addEventListener('change', (event) => {
    const value = String(event.target.value || '');
    if (!value) return;
    if (isServerRenderedList && !isTimeFilterableList) {
      window.location.href = buildTimeFilterHref('/', normalizeTimeFilter(value));
      return;
    }
    activeTimeFilter = normalizeTimeFilter(value);
    applyFilters();
    closeDateModal();
  });
}
