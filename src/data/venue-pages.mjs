// Páginas SEO por ubicación (/espacios/<slug>/), una por venue canónico.
// Gemelas de las páginas por categoría (category-pages.mjs) pero pre-filtrando
// por espacio. Selección AUTOMÁTICA: todo venue con >= MIN_EVENTS eventos
// futuros, excluyendo genéricos ("Valladolid"…) y cualquier cosa sin pinta de
// lugar. Reutiliza los 'spaces' ya calculados en build.mjs (slug, canonicalVenue,
// count, address, lat/lon, hasMapPoint).
import { canonicalizeVenue, normalizeVenueKey } from './venue-aliases.mjs';

const MIN_EVENTS = 2;

// Claves normalizadas de "ubicaciones" demasiado genéricas para una página propia.
const GENERIC_VENUE_KEYS = new Set([
  'valladolid',
  'varios lugares',
  'varios lugares en la provincia de valladolid',
  'por determinar',
  'lugar por determinar',
  'consultar',
  'online'
]);

// ¿El nombre parece un lugar real? Los 'spaces' ya evitan el ruido de precios
// (groupFutureEventsByVenue solo usa event.venue, no location); esto es una red
// de seguridad extra por si algún event.venue trae un precio o número suelto.
function looksLikeVenue(name) {
  const value = String(name || '').trim();
  if (/€/.test(value)) return false;
  if (/^\s*(desde|hasta|entre)?\s*[\d.,]+\s*(€|eur|euros)?\s*$/i.test(value)) return false;
  return /[a-záéíóúñü]{3,}/i.test(value);
}

export function getVenuePages(spaces, options = {}) {
  const minEvents = Number.isFinite(options.minEvents) ? options.minEvents : MIN_EVENTS;
  // Dedupe por slug: si dos venues colisionan en slug, gana el de más eventos.
  const bySlug = new Map();
  for (const space of Array.isArray(spaces) ? spaces : []) {
    const name = String(space?.name || space?.canonicalVenue || '').trim();
    const slug = String(space?.slug || '').trim();
    const count = Number(space?.count) || 0;
    if (!name || !slug || slug === 'index') continue;
    if (count < minEvents) continue;
    if (!looksLikeVenue(name)) continue;
    const venueKey = normalizeVenueKey(canonicalizeVenue(name));
    if (!venueKey || GENERIC_VENUE_KEYS.has(venueKey)) continue;
    const page = {
      slug,
      venueKey,
      path: `/espacios/${slug}/`,
      canonicalVenue: name,
      title: `Eventos en ${name} (Valladolid) | Aldea Pucela`,
      h1: `Eventos en ${name}`,
      h2: `Agenda y próximos eventos en ${name}, Valladolid`,
      description: `Todos los próximos eventos en ${name} (Valladolid): conciertos, teatro, exposiciones y actividades recopilados por la comunidad de Aldea Pucela.`,
      address: space.address || '',
      lat: Number.isFinite(space.lat) ? space.lat : null,
      lon: Number.isFinite(space.lon) ? space.lon : null,
      hasMapPoint: Boolean(space.hasMapPoint),
      count
    };
    const existing = bySlug.get(slug);
    if (!existing || page.count > existing.count) bySlug.set(slug, page);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
}

// ponytail: self-check (slugs únicos, excluye genéricos/ruido/bajo umbral, ruta ok).
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  const sample = [
    { name: 'Teatro Calderón', slug: 'teatro-calderon', count: 5, address: 'Calle X', lat: 41.6, lon: -4.7, hasMapPoint: true },
    { name: 'Valladolid', slug: 'valladolid', count: 9 },      // genérico -> excluido
    { name: 'Sala Rara', slug: 'sala-rara', count: 1 },        // < umbral -> excluido
    { name: '12€', slug: '12', count: 4 },                     // sin pinta de lugar -> excluido
    { name: 'LAVA', slug: 'lava', count: 3 }
  ];
  const pages = getVenuePages(sample, { minEvents: 2 });
  const slugs = pages.map((p) => p.slug);
  console.assert(new Set(slugs).size === slugs.length, 'slugs de venue duplicados');
  console.assert(slugs.includes('teatro-calderon') && slugs.includes('lava'), 'faltan venues válidos');
  console.assert(!slugs.includes('valladolid'), 'genérico no debe tener página');
  console.assert(!slugs.includes('sala-rara'), 'bajo umbral no debe tener página');
  console.assert(!slugs.includes('12'), 'ruido/precio no debe tener página');
  console.assert(pages.every((p) => p.path.startsWith('/espacios/') && p.venueKey), 'ruta bajo /espacios/ y venueKey presente');
  console.log(`ok: ${pages.length} páginas de venue de ${sample.length} espacios`);
}
