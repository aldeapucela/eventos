window._paq = window._paq || [];
/* tracker methods like "setCustomDimension" should be called before "trackPageView" */
window._paq.push(['trackPageView']);
window._paq.push(['enableLinkTracking']);

const MATOMO_ONCE_KEY = 'aldeapucela_matomo_once_v1';
const MATOMO_EVENT_CATEGORY = 'event_interaction';
const VALID_ORIGINS = new Set(['home', 'detail']);
const VALID_ACTIONS = new Set(['save', 'share']);

function getTrackedInteractions() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MATOMO_ONCE_KEY) || '[]');
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function setTrackedInteractions(values) {
  window.localStorage.setItem(MATOMO_ONCE_KEY, JSON.stringify(Array.from(values)));
}

function normalizeToken(value, fallback = '') {
  const token = String(value || '').trim();
  return token || fallback;
}

window.trackMatomoInteractionOnce = function trackMatomoInteractionOnce({ origin, action, eventId }) {
  if (!window._paq || typeof window._paq.push !== 'function') return false;

  const normalizedOrigin = normalizeToken(origin);
  const normalizedAction = normalizeToken(action);
  const normalizedEventId = normalizeToken(eventId);

  if (!VALID_ORIGINS.has(normalizedOrigin)) {
    console.warn('[matomo] Skipping interaction with invalid origin:', origin);
    return false;
  }

  if (!VALID_ACTIONS.has(normalizedAction)) {
    console.warn('[matomo] Skipping interaction with invalid action:', action);
    return false;
  }

  if (!normalizedEventId) {
    console.warn('[matomo] Skipping interaction without eventId:', {
      origin: normalizedOrigin,
      action: normalizedAction
    });
    return false;
  }

  const dedupeKey = `${normalizedOrigin}:${normalizedAction}:${normalizedEventId}`;
  const tracked = getTrackedInteractions();

  if (tracked.has(dedupeKey)) return false;

  window._paq.push(['trackEvent', MATOMO_EVENT_CATEGORY, normalizedOrigin, normalizedAction, normalizedEventId]);
  tracked.add(dedupeKey);
  setTrackedInteractions(tracked);
  return true;
};

(function initMatomo() {
  var u = '//stats.aldeapucela.org/';
  window._paq.push(['setTrackerUrl', u + 'matomo.php']);
  window._paq.push(['setSiteId', '24']);
  var d = document;
  var g = d.createElement('script');
  var s = d.getElementsByTagName('script')[0];
  g.async = true;
  g.src = u + 'matomo.js';
  s.parentNode.insertBefore(g, s);
})();
