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

// Párrafo visible sobre el listado de /espacios/<slug>/. Se genera, porque las
// páginas de espacio salen solas de los datos y no hay copy a mano por venue,
// pero se apoya en lo que distingue de verdad a cada uno (dirección, cuántos
// eventos hay ahora y de qué tipos) para que no sean 20 párrafos calcados.
// `categories` viene de build.mjs, que es donde se sabe qué hay en la página.
export function buildVenueIntro({ name, address, categories = [], count = 0 }) {
  const venue = String(name || '').trim();
  if (!venue) return '';
  const parts = [];
  parts.push(address ? `${venue} está en ${String(address).trim()}, en Valladolid.` : `${venue} es uno de los espacios de la agenda cultural de Valladolid.`);
  // Tope de 4 tipos: hay espacios con ocho o nueve y la frase se vuelve ilegible.
  const todos = categories.map((label) => String(label).toLowerCase()).filter(Boolean);
  const tipos = todos.slice(0, 4);
  // Etiquetas como "infantil y familia" o "magia y circo" ya llevan "y" dentro, así
  // que unir la última con "y" daría "infantil y familia y magia y circo": en ese
  // caso se enumera solo con comas.
  const conY = tipos.length > 1 && !tipos.some((label) => label.includes(' y '));
  const tiposTexto = tipos.length > 1
    ? `${conY ? `${tipos.slice(0, -1).join(', ')} y ${tipos[tipos.length - 1]}` : tipos.join(', ')}${todos.length > tipos.length ? ', entre otros' : ''}`
    : tipos[0] || '';
  if (count > 0) {
    const cita = count === 1 ? 'hay una cita programada' : `hay ${count} citas programadas`;
    parts.push(tiposTexto ? `Ahora mismo ${cita}, de ${tiposTexto}.` : `Ahora mismo ${cita}.`);
  }
  parts.push('Cada ficha indica fecha, hora y si la entrada es gratuita, y el listado se actualiza cada día con lo que publica la comunidad de Aldea Pucela.');
  return parts.join(' ');
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
  const conDir = buildVenueIntro({ name: 'Teatro Calderón', address: 'Calle Leopoldo Cano, 7', categories: ['Teatro', 'Danza'], count: 4 });
  const sinDir = buildVenueIntro({ name: 'Sala X', categories: ['Música'], count: 1 });
  console.assert(conDir.includes('Calle Leopoldo Cano, 7') && conDir.includes('4 citas') && conDir.includes('teatro y danza'), `intro con dirección mal formada: ${conDir}`);
  console.assert(!sinDir.includes('está en') && sinDir.includes('una cita'), `intro sin dirección mal formada: ${sinDir}`);
  console.assert(!buildVenueIntro({ name: '' }), 'sin nombre no hay intro');
  console.assert(!buildVenueIntro({ name: 'Sala Y', count: 0 }).includes('Ahora mismo'), 'sin eventos no se anuncian citas');
  const muchos = buildVenueIntro({ name: 'Sala Z', categories: ['A', 'B', 'C', 'D', 'E', 'F'], count: 9 });
  console.assert(muchos.includes('de a, b, c y d, entre otros.'), `no recorta la lista de tipos: ${muchos}`);
  const conYInterna = buildVenueIntro({ name: 'Sala W', categories: ['Danza', 'Magia y circo'], count: 3 });
  console.assert(conYInterna.includes('danza, magia y circo') && !conYInterna.includes('danza y magia'), `"y" mal puesta con etiquetas compuestas: ${conYInterna}`);
  console.log(`ok: ${pages.length} páginas de venue de ${sample.length} espacios`);
}
