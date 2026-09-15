const API_URL = 'https://api.aldeapucela.org/eventos/saves';
const DEV_API_URL = '/__mock_api/eventos/saves';
const METRICS_CACHE_KEY = 'aldeapucela_event_metrics_v1';
// Keep the browser cache aligned with the 15-minute Nginx cache used by the
// public metrics endpoint. Warm clients can render without another API call.
const METRICS_CACHE_TTL_MS = 15 * 60 * 1000;
const SAVED_EVENTS_KEY = 'aldeapucela_saved_events';
const COUNTED_SAVES_KEY = 'aldeapucela_counted_saves_v1';
const MIGRATION_KEY = 'aldeapucela_counted_saves_migrated_v1';
const REQUEST_TIMEOUT_MS = 6000;

let metricsById = new Map();
let metricsPromise = null;
initializeCountedSaves();

export async function loadEventMetrics({ force = false } = {}) {
  const cached = readCachedMetrics();
  if (!force && cached && Date.now() - cached.fetchedAt <= METRICS_CACHE_TTL_MS) {
    metricsById = new Map(cached.metrics.activities.map((activity) => [String(activity.id), activity]));
    renderEventSaveCounts();
    return cached.metrics;
  }
  if (metricsPromise) return metricsPromise;

  metricsPromise = fetchMetrics()
    .then((metrics) => {
      metricsById = new Map(metrics.activities.map((activity) => [String(activity.id), activity]));
      writeCachedMetrics(metrics);
      renderEventSaveCounts();
      return metrics;
    })
    .catch(() => {
      if (cached?.metrics) {
        metricsById = new Map(cached.metrics.activities.map((activity) => [String(activity.id), activity]));
        renderEventSaveCounts();
        return cached.metrics;
      }
      return null;
    })
    .finally(() => {
      metricsPromise = null;
    });

  return metricsPromise;
}

export async function recordEventSave(eventId) {
  const id = normalizeId(eventId);
  if (!id || !hasLocalStorage()) return false;

  const counted = readStringSet(COUNTED_SAVES_KEY);
  if (counted.has(id)) return false;
  counted.add(id);
  writeStringSet(COUNTED_SAVES_KEY, counted);

  try {
    const response = await fetchWithTimeout(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id })
    });
    if (!response.ok) return false;
    const payload = await response.json();
    const saveCount = Number(payload?.saveCount);
    if (payload?.ok && String(payload.id) === id && Number.isFinite(saveCount) && saveCount >= 0) {
      const previous = metricsById.get(id) || { id, visitCount: 0 };
      metricsById.set(id, { ...previous, id, saveCount });
      updateCachedActivity(id, { ...previous, id, saveCount });
      renderEventSaveCounts();
      return true;
    }
  } catch {}
  return false;
}

export function getEventMetric(eventId) {
  return metricsById.get(String(eventId)) || null;
}

export function renderEventSaveCounts(root = document) {
  root.querySelectorAll('[data-event-save-count]').forEach((element) => {
    const id = String(element.dataset.eventId || '');
    const count = Number(metricsById.get(id)?.saveCount || 0);
    const value = element.querySelector('[data-count-value]');
    if (value) value.textContent = formatCount(count);
    const countLabel = element.querySelector('[data-count-label]');
    if (countLabel) countLabel.textContent = count === 1 ? 'guardado' : 'guardados';
    element.hidden = count < 1;
    element.setAttribute('aria-label', `${formatCount(count)} ${count === 1 ? 'guardado' : 'guardados'}`);
    const saveButton = element.closest('[data-save-event]');
    const defaultLabel = saveButton?.querySelector('[data-save-label]');
    if (defaultLabel) defaultLabel.hidden = count > 0;
    if (saveButton && count > 0) {
      const actionLabel = saveButton.getAttribute('aria-pressed') === 'true' ? 'Quitar de guardados' : 'Guardar evento';
      saveButton.setAttribute('aria-label', `${actionLabel}. ${formatCount(count)} ${count === 1 ? 'guardado' : 'guardados'}`);
    }
  });
}

export function getEventMetricsApiUrl() {
  return getApiUrl();
}

async function fetchMetrics() {
  const response = await fetchWithTimeout(getApiUrl(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Metrics request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload.activities)) throw new Error('Invalid event metrics response');
  const visitRankIds = Array.isArray(payload.visitRankIds)
    ? payload.visitRankIds.map(normalizeId).filter(Boolean)
    : [];
  return {
    ok: true,
    activities: payload.activities
      .map((activity) => ({
        id: normalizeId(activity?.id),
        saveCount: toNonNegativeInteger(activity?.saveCount),
        // Las visitas solo se usan para construir el orden en el endpoint;
        // no se descargan como cifras públicas.
        visitCount: 0
      }))
      .filter((activity) => activity.id),
    visitRankIds,
    generatedAt: String(payload.generatedAt || '')
  };
}

function getApiUrl() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return host === '127.0.0.1' || host === 'localhost' ? DEV_API_URL : API_URL;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await window.fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function initializeCountedSaves() {
  if (!hasLocalStorage()) return;
  try {
    if (window.localStorage.getItem(MIGRATION_KEY)) return;
    const saved = readStringSet(SAVED_EVENTS_KEY);
    writeStringSet(COUNTED_SAVES_KEY, saved);
    window.localStorage.setItem(MIGRATION_KEY, '1');
  } catch {}
}

function readCachedMetrics() {
  if (!hasLocalStorage()) return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(METRICS_CACHE_KEY) || 'null');
    if (!cached || !cached.metrics || !Number.isFinite(cached.fetchedAt)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCachedMetrics(metrics) {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), metrics }));
  } catch {}
}

function updateCachedActivity(id, activity) {
  const cached = readCachedMetrics();
  if (!cached?.metrics) return;
  const activities = cached.metrics.activities.filter((entry) => String(entry.id) !== id);
  activities.push(activity);
  writeCachedMetrics({ ...cached.metrics, activities });
}

function hasLocalStorage() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStringSet(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writeStringSet(key, values) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {}
}

function normalizeId(value) {
  const id = String(value || '').trim();
  return /^\d{1,12}$/.test(id) ? id : '';
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function formatCount(value) {
  return new Intl.NumberFormat('es-ES').format(value);
}
