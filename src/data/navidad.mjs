// Página /navidad/: contenido editorial en navidad.json + mapa de luces en
// navidad-luces.geojson + eventos del foro con la etiqueta de navidad.json.

// Eventos de la guía: los etiquetados en el foro y los añadidos a mano por ID.
export function selectNavidadEvents(events, { tag = 'navidad', extraEventIds = [] } = {}) {
  const wanted = String(tag).toLowerCase();
  const extra = new Set(extraEventIds.map(String));
  return events.filter((event) =>
    (Array.isArray(event.tags) && event.tags.includes(wanted)) || extra.has(String(event.id))
  );
}

// Listas en texto del mapa (indexables, a diferencia del mapa en sí):
// líneas = calles, polígonos = plazas, puntos = árboles y almendros.
export function summarizeLights(geojson) {
  const names = (type) => [...new Set((geojson?.features || [])
    .filter((feature) => feature?.geometry?.type === type)
    .map((feature) => String(feature.properties?.name || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const streets = names('LineString');
  const squares = names('Polygon');
  const trees = names('Point');
  return { streets, squares, trees };
}

// Sustituye {streets}/{squares}/{trees} en los textos de navidad.json por los
// recuentos del mapa, para que la FAQ no se quede desfasada al editar el mapa.
export function fillLightCounts(text, lights) {
  return String(text || '')
    .replaceAll('{streets}', String(lights.streets.length))
    .replaceAll('{squares}', String(lights.squares.length))
    .replaceAll('{trees}', String(lights.trees.length));
}

// Secciones con algo que enseñar; las vacías se ocultan hasta tener datos.
export function visibleSections(sections = []) {
  return sections.filter((section) => (section.facts && section.facts.length) || section.note);
}
