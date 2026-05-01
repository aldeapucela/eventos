window._paq = window._paq || [];
/* tracker methods like "setCustomDimension" should be called before "trackPageView" */
window._paq.push(['trackPageView']);
window._paq.push(['enableLinkTracking']);

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
