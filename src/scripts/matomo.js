window._paq = window._paq || [];
/* tracker methods like "setCustomDimension" should be called before "trackPageView" */
window._paq.push(['trackPageView']);
window._paq.push(['enableLinkTracking']);

const MATOMO_ONCE_KEY = 'aldeapucela_matomo_once_v1';

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

function normalizeToken(value, fallback = 'other') {
  const token = String(value || '').trim();
  return token || fallback;
}

window.trackMatomoInteractionOnce = function trackMatomoInteractionOnce({ what, context, targetId }) {
  if (!window._paq || typeof window._paq.push !== 'function') return false;

  const normalizedWhat = normalizeToken(what, 'interaction');
  const normalizedContext = normalizeToken(context, 'other');
  const normalizedTargetId = normalizeToken(targetId, 'unknown');
  const dedupeKey = `${normalizedWhat}:${normalizedTargetId}`;
  const tracked = getTrackedInteractions();

  if (tracked.has(dedupeKey)) return false;

  window._paq.push(['trackEvent', 'engagement', normalizedWhat, `${normalizedContext}:${normalizedTargetId}`]);
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
