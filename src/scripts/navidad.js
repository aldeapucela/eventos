// Mapa de luces de /navidad/. El resto de la página (drawer, imágenes,
// guardados, buscador) lo gestiona home.js, igual que en las páginas de espacio.
const mapNode = document.querySelector('[data-navidad-map]');
const CARTO_KEY = 'cb1_27ug_1_19138f635d4f03358d12cb43';

if (mapNode && window.L) {
  const map = L.map(mapNode, { scrollWheelZoom: false }).setView([41.6523, -4.7245], 13);
  let tileLayer = L.tileLayer(tileUrl(), { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);

  // Cambia las teselas con el modo oscuro, como el mapa de espacios.
  new MutationObserver(() => {
    if (tileLayer._url === tileUrl()) return;
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(tileUrl(), { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  fetch(mapNode.dataset.navidadMap)
    .then((response) => response.json())
    .then((geojson) => {
      const layer = L.geoJSON(geojson, {
        style: () => ({ color: '#d97706', weight: 5, opacity: 0.9 }),
        pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 7, color: '#065f46', fillColor: '#10b981', fillOpacity: 0.9, weight: 2 }),
        onEachFeature: (feature, item) => item.bindTooltip(String(feature.properties?.name || ''))
      }).addTo(map);
      map.fitBounds(layer.getBounds(), { padding: [10, 10] });
    })
    .catch(() => mapNode.remove());
}

function tileUrl() {
  return document.documentElement.classList.contains('dark')
    ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
    : `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`;
}
