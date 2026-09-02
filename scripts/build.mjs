import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nunjucks from 'nunjucks';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';
import { loadCachedEvents } from '../src/data/store.mjs';
import { deriveFilters, sortEvents, splitFeatured, getPastEvents, groupEventsByMonth, groupFutureEventsByVenue, rotateBySeed } from '../src/data/site.mjs';
import { DISPLAY_TIMEZONE, buildTextParagraphHtml, cleanDescriptionHtml, detectPriceStatus, escapeHtml, formatDateRange, formatDateTime, isSameMadridDay, normalizePriceLabel, parseDateLike, parseEventMetaFromHtml, stripTags, toMadridDateKey } from '../src/data/format.mjs';
import { enrichVenueCatalog, mergeSpacesWithVenueCatalog } from '../src/data/venues.mjs';
import { canonicalizeVenue, normalizeVenueKey } from '../src/data/venue-aliases.mjs';
import { buildCollectionPageJsonLd, buildEventJsonLd, buildVenuePageJsonLd, serializeJsonLd } from '../src/data/structured-data.mjs';
import { getOpenEndedWindow, getTimePages, isWeekendDayKey, resolveBuildNow, selectTimePageEvents } from '../src/data/time-windows.mjs';
import { getCategoryPages, mappedCategoryLabels } from '../src/data/category-pages.mjs';
import { getVenuePages } from '../src/data/venue-pages.mjs';
import { canonicalizeCategory } from '../src/data/category-aliases.mjs';
import { syncEvents } from './sync-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const assetsDir = path.join(dist, 'assets');
const postersDir = path.join(dist, 'posters');
const cssDir = path.join(assetsDir, 'css');
const jsDir = path.join(assetsDir, 'js');
const publicBaseUrl = 'https://eventos.aldeapucela.org';
// Imagen de previsualización en redes (og:image). El nombre va versionado a
// propósito: al sustituir los bytes manteniendo la misma URL, las redes
// sociales siguen sirviendo la copia cacheada (así reaparecía el isotipo
// antiguo del Conde Ansúrez). Si la imagen vuelve a cambiar, sube la versión
// del nombre del archivo en vez de sobrescribirlo.
const socialPreview = {
  image: `${publicBaseUrl}/assets/social-preview-v3.jpg`,
  imageWidth: 1731,
  imageHeight: 909,
  imageAlt: 'Qué hacer en Valladolid, agenda vecinal de eventos culturales de Aldea Pucela'
};
// Verificación de propiedad en Google Search Console (solo en la portada).
const googleSiteVerification = 'WI4USc-QdbTLezu0qIZfb2J9Yvqkwg818tWzExtVREw';

// Cuántos eventos vigentes necesita una página de tipo o de espacio para ser
// indexable. Por debajo del umbral la página se sigue generando y enlazando desde
// su hub (es útil para navegar), pero lleva noindex y sale del sitemap: una lista
// de dos eventos no aporta nada que no esté ya en las fichas. Se recalcula en cada
// build, así que una página cruza el umbral en los dos sentidos por sí sola.
const MIN_INDEXABLE_CATEGORY_EVENTS = 10;
const MIN_INDEXABLE_VENUE_EVENTS = 5;

// Cuántos eventos enseña como avance cada tarjeta de los hubs /tipos/ y /espacios/.
// El listado completo está a un clic, en /t/<slug>/ y /espacios/<slug>/.
const HUB_CARD_EVENTS = 4;

const args = new Set(process.argv.slice(2));

const env = nunjucks.configure(path.join(root, 'src', 'templates'), {
  autoescape: true,
  noCache: true
});

async function ensureDirs() {
  await fs.mkdir(cssDir, { recursive: true });
  await fs.mkdir(jsDir, { recursive: true });
  await fs.mkdir(postersDir, { recursive: true });
  await fs.mkdir(path.join(assetsDir, 'fontawesome'), { recursive: true });
}

async function copyStaticAssets() {
  await fs.cp(path.join(root, 'src', 'assets'), assetsDir, { recursive: true });
}

async function copyVersionedPosters() {
  const source = path.join(root, 'src', 'posters');
  try {
    await fs.access(source);
  } catch {
    return;
  }
  await fs.cp(source, postersDir, { recursive: true });
}

async function copyFontAwesome() {
  const source = path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free');
  const target = path.join(assetsDir, 'fontawesome');
  await fs.mkdir(path.join(target, 'css'), { recursive: true });
  await fs.mkdir(path.join(target, 'webfonts'), { recursive: true });
  await fs.copyFile(path.join(source, 'css', 'all.min.css'), path.join(target, 'css', 'all.min.css'));
  await fs.cp(path.join(source, 'webfonts'), path.join(target, 'webfonts'), { recursive: true });
}

async function compileCss(inputFile, outputFile) {
  const base = await fs.readFile(path.join(root, 'src', 'styles', 'base.css'), 'utf8');
  const page = await fs.readFile(inputFile, 'utf8');
  const result = await postcss([
    tailwindcss({ config: path.join(root, 'tailwind.config.js') }),
    autoprefixer()
  ]).process(`${base}\n${page}`, { from: inputFile, to: outputFile });
  await fs.writeFile(outputFile, result.css);
}

async function copyJs() {
  await fs.copyFile(path.join(root, 'src', 'scripts', 'home.js'), path.join(jsDir, 'home.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'event-detail.js'), path.join(jsDir, 'event-detail.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'comments.js'), path.join(jsDir, 'comments.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'location-link.js'), path.join(jsDir, 'location-link.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'subscribe.js'), path.join(jsDir, 'subscribe.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'menu-drawer.js'), path.join(jsDir, 'menu-drawer.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'saved-events.js'), path.join(jsDir, 'saved-events.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'spaces.js'), path.join(jsDir, 'spaces.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'theme.js'), path.join(jsDir, 'theme.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'matomo.js'), path.join(jsDir, 'matomo.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'install-app.js'), path.join(jsDir, 'install-app.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'search.js'), path.join(jsDir, 'search.js'));
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'categoria';
}

function render(template, context) {
  return env.render(template, context);
}

async function writeFile(relPath, content) {
  const filePath = path.join(dist, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

function toAbsoluteUrl(value = '') {
  if (!value) return publicBaseUrl;
  if (/^https?:\/\//i.test(value)) return value;
  return `${publicBaseUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function toRfc2822(value) {
  if (!value) return new Date().toUTCString();
  const date = parseDateLike(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function formatUtcIcsDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeIcs(value = '') {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function buildRssXml(events) {
  const sortedByPublishedDesc = [...events].sort((a, b) => {
    const aTime = parseDateLike(a.publishedAt || a.updatedAt || a.startsAt || 0).getTime();
    const bTime = parseDateLike(b.publishedAt || b.updatedAt || b.startsAt || 0).getTime();
    return bTime - aTime;
  });
  const lastBuildDate = sortedByPublishedDesc.length
    ? toRfc2822(sortedByPublishedDesc[0].publishedAt || sortedByPublishedDesc[0].updatedAt || sortedByPublishedDesc[0].startsAt)
    : new Date().toUTCString();
  const items = sortedByPublishedDesc.map((event) => {
    const eventUrl = toAbsoluteUrl(`/e/${event.id}/${event.slug}/`);
    // OJO: el guid es la identidad del item para los lectores de RSS, no un
    // enlace. Se queda SIN barra final, que es como se publicó desde el
    // principio: cambiarlo renombraría de golpe los ~1.100 items del feed y
    // los suscriptores lo verían entero como no leído. La barra solo va en
    // <link>, que es el que se sigue y se rastrea.
    const eventGuid = toAbsoluteUrl(`/e/${event.id}/${event.slug}`);
    const title = escapeHtml(event.title || 'Evento');
    const description = buildRssItemDescription(event, eventUrl);
    const pubDate = toRfc2822(event.publishedAt || event.updatedAt || event.startsAt);
    return [
      '    <item>',
      `      <title>${title}</title>`,
      `      <link>${eventUrl}</link>`,
      `      <guid isPermaLink="true">${eventGuid}</guid>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <description><![CDATA[${description}]]></description>`,
      '    </item>'
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>Eventos Valladolid - Aldea Pucela</title>',
    '    <link>https://eventos.aldeapucela.org/</link>',
    '    <description>Feed RSS de eventos publicados en Aldea Pucela.</description>',
    '    <language>es-es</language>',
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

function buildRssItemDescription(event, eventUrl) {
  const dateLabel = event.startsAt ? formatDateTime(event.startsAt) : '';
  const location = String(event.location || '').trim();
  const summary = String(event.summary || event.excerpt || '').trim();
  const image = event.image ? toAbsoluteUrl(event.image) : '';
  const parts = [];

  if (image) {
    parts.push(`<p><img src="${escapeHtml(image)}" alt="${escapeHtml(event.title || 'Evento')}" /></p>`);
  }
  if (dateLabel) {
    parts.push(`<p><strong>Fecha:</strong> ${escapeHtml(dateLabel)}</p>`);
  }
  if (location) {
    parts.push(`<p><strong>Ubicación:</strong> ${escapeHtml(location)}</p>`);
  }
  if (summary) {
    parts.push(`<p>${escapeHtml(summary)}</p>`);
  }
  parts.push(`<p><a href="${escapeHtml(eventUrl)}">Ver evento</a></p>`);

  return parts.join('').replaceAll(']]>', ']]&gt;');
}

function buildSitemapXml({ staticPages, events }) {
  const urls = [];
  for (const page of staticPages) {
    urls.push({ loc: toAbsoluteUrl(page.path), lastmod: page.lastmod });
  }
  for (const event of events) {
    const lastmodDate = event.updatedAt ? parseDateLike(event.updatedAt) : null;
    urls.push({
      loc: toAbsoluteUrl(`/e/${event.id}/${event.slug}/`),
      lastmod: lastmodDate && !Number.isNaN(lastmodDate.getTime()) ? lastmodDate.toISOString() : ''
    });
  }
  const entries = urls.map((url) => [
    '  <url>',
    `    <loc>${escapeHtml(url.loc)}</loc>`,
    ...(url.lastmod ? [`    <lastmod>${url.lastmod}</lastmod>`] : []),
    '  </url>'
  ].join('\n')).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    ''
  ].join('\n');
}

function buildCalendarIcs(events, options = {}) {
  const calendarName = options.name || 'Eventos Valladolid - Aldea Pucela';
  const now = new Date();
  const dtstamp = formatUtcIcsDate(now);
  const sorted = sortEvents(events);
  const rows = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eventos Valladolid - Aldea Pucela//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    `X-WR-TIMEZONE:${DISPLAY_TIMEZONE}`
  ];

  for (const event of sorted) {
    const startDate = event.startsAt ? parseDateLike(event.startsAt) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) continue;
    const endDateRaw = event.endsAt ? parseDateLike(event.endsAt) : null;
    const endDate = endDateRaw && !Number.isNaN(endDateRaw.getTime())
      ? endDateRaw
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    const eventUrl = toAbsoluteUrl(`/e/${event.id}/${event.slug}/`);
    const uid = `${event.id}@eventos.aldeapucela.org`;
    const description = String(event.summary || event.excerpt || '').trim();
    const attachment = event.image ? `ATTACH;FMTTYPE=image/jpeg:${escapeIcs(event.image)}` : null;
    rows.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatUtcIcsDate(startDate)}`,
      `DTEND:${formatUtcIcsDate(endDate)}`,
      `SUMMARY:${escapeIcs(event.title || 'Evento')}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `LOCATION:${escapeIcs(event.location || '')}`,
      `URL:${escapeIcs(eventUrl)}`,
      ...(attachment ? [attachment] : []),
      'END:VEVENT'
    );
  }

  rows.push('END:VCALENDAR', '');
  return rows.join('\r\n');
}

function enrichEvent(event) {
  const descriptionHtml = resolveEventDescriptionHtml(event);
  const price = resolveEventPrice(event);
  const priceStatus = detectPriceStatus({
    price,
    text: `${event.summary || ''} ${event.notes || ''} ${stripTags(descriptionHtml)}`
  });
  const startsAtDate = event.startsAt ? parseDateLike(event.startsAt) : null;
  const endsAtDate = event.endsAt ? parseDateLike(event.endsAt) : null;
  const isMultiDay = Boolean(startsAtDate && endsAtDate && !sameDay(startsAtDate, endsAtDate));
  const compactDateLabel = startsAtDate
    ? formatInMadrid(startsAtDate, { weekday: 'short', day: 'numeric', month: 'short' })
        .format(startsAtDate)
        .replace(',', '')
        .replace(/\b\w/, (m) => m.toUpperCase())
    : '';
  const startsAtDateLabel = startsAtDate
    ? formatInMadrid(startsAtDate, { day: 'numeric', month: 'short' })
        .format(startsAtDate)
        .replace(',', '')
        .replace(/\b\w/, (m) => m.toUpperCase())
    : '';
  // Con año: solo para la ficha de evento (ya hay eventos de años futuros).
  const startsAtDateYearLabel = startsAtDate
    ? formatInMadrid(startsAtDate, { day: 'numeric', month: 'short', year: 'numeric' })
        .format(startsAtDate)
        .replace(',', '')
        .replace(/\b\w/, (m) => m.toUpperCase())
    : '';
  const startsAtTimeLabel = startsAtDate
    ? formatInMadrid(startsAtDate, { hour: '2-digit', minute: '2-digit' }).format(startsAtDate)
    : '';
  return {
    ...event,
    startsAtLabel: formatDateTime(event.startsAt),
    endsAtLabel: event.endsAt ? formatDateTime(event.endsAt) : '',
    endsAtDayLabel: event.endsAt
      ? formatInMadrid(endsAtDate, { day: 'numeric', month: 'short' })
          .format(endsAtDate)
          .replace(',', '')
          .replace(/\b\w/, (m) => m.toUpperCase())
      : '',
    dateRangeLabel: formatDateRange(event.startsAt, event.endsAt),
    scheduleLabel: isMultiDay
      ? formatDateRange(event.startsAt, event.endsAt)
      : startsAtDate
        ? `${startsAtDateLabel}${startsAtTimeLabel ? ` · ${startsAtTimeLabel}` : ''}`
        : '',
    // Variantes con año para la ficha de evento (el resto de tarjetas van sin año).
    detailDateRangeLabel: formatDateRange(event.startsAt, event.endsAt, 'es-ES', { withYear: true }),
    detailScheduleLabel: isMultiDay
      ? formatDateRange(event.startsAt, event.endsAt, 'es-ES', { withYear: true })
      : startsAtDate
        ? `${startsAtDateYearLabel}${startsAtTimeLabel ? ` · ${startsAtTimeLabel}` : ''}`
        : '',
    compactDateLabel,
    startsAtDayKey: startsAtDate ? toLocalDateKey(startsAtDate) : '',
    startsAtDayLabel: startsAtDate
      ? formatInMadrid(startsAtDate, {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        })
          .format(startsAtDate)
          .replace(',', '')
          .replace(/\b\w/, (m) => m.toUpperCase())
      : '',
    timeLabel: startsAtTimeLabel,
    updatedAtLabel: formatDateTime(event.updatedAt),
    monthLabel: startsAtDate ? formatInMadrid(startsAtDate, { month: 'short' }).format(startsAtDate).toUpperCase() : '',
    dayLabel: startsAtDate ? formatInMadrid(startsAtDate, { day: 'numeric' }).format(startsAtDate) : '',
    hasEnded: endsAtDate ? endsAtDate < new Date() : startsAtDate ? startsAtDate < new Date() : false,
    // discourse.mjs ya genera urlPath con barra final, pero los ~1.100 registros
    // de cache/data/ se escribieron sin ella y solo se re-normalizan si cambia su
    // firma en el foro (sync-lib.mjs), lo que implicaría refetchearlos todos.
    // Normalizar aquí, que es por donde pasa todo evento antes de una plantilla,
    // los arregla sin re-sincronizar. Idempotente.
    urlPath: `${String(event.urlPath || `/e/${event.id}/${event.slug}`).replace(/\/+$/, '')}/`,
    descriptionHtml,
    price,
    priceStatus,
    isFree: priceStatus === 'free',
    isPaid: priceStatus === 'paid'
  };
}

// La descripción se vuelve a limpiar aquí, no solo al sincronizar, por el mismo
// motivo que urlPath: los registros de cache/data/ se guardaron con los restos
// del cartel y de las líneas de metadatos, y solo se re-normalizan si cambia su
// firma en el foro. Es idempotente.
function resolveEventDescriptionHtml(event) {
  const cleaned = cleanDescriptionHtml(event.descriptionHtml || '', event.title || '');
  if (cleaned) return cleaned;
  const fallback = String(event.summary || event.excerpt || '').trim();
  return fallback ? buildTextParagraphHtml(fallback) : '';
}

// `priceStatus` también se recalcula aquí, con el precio y la descripción ya
// resueltos: los registros de cache/data/ se guardaron con la detección binaria
// antigua, que marcaba de pago cualquier texto con un "entradas" o un "taquilla"
// suelto.
//
// Los registros cacheados antes de que `price` existiera todavía llevan la
// línea "Precio:" dentro de descriptionHtml: se rescata de ahí en vez de
// refetchear el foro entero.
function resolveEventPrice(event) {
  const stored = normalizePriceLabel(event.price || '');
  if (stored) return stored;
  return parseEventMetaFromHtml(event.descriptionHtml || '').price;
}

function formatInMadrid(_date, options) {
  return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: DISPLAY_TIMEZONE });
}

function siteDataPayload(events, filters = deriveFilters(events), options = {}) {
  const spaceNameByVenueKey = options.spaceNameByVenueKey instanceof Map ? options.spaceNameByVenueKey : new Map();
  const spaces = Array.isArray(options.spaces) ? options.spaces : [];
  const enriched = events.map(enrichEvent);
  return JSON.stringify({
    filters,
    spaces: spaces.map((space) => ({
      slug: space.slug,
      name: space.name,
      canonicalVenue: space.canonicalVenue
    })),
    events: enriched.map((event) => ({
      ...event,
      venueKey: normalizeVenueKey(canonicalizeVenue(event.venue || event.location || '')),
      venueLabel: spaceNameByVenueKey.get(normalizeVenueKey(canonicalizeVenue(event.venue || event.location || ''))) || '',
      startsAtIso: event.startsAt,
      endsAtIso: event.endsAt
    }))
  });
}

// Índice de búsqueda ligero para el buscador global (src/scripts/search.js).
// Solo eventos vigentes/próximos (no archivo), más el catálogo de espacios y
// tipos. Se sirve como /search-index.json y se descarga de forma perezosa.
// `events` debe llegar ya acotado a la ventana vigente/próxima con la misma
// lógica que las páginas de tipo/espacio (selectTimePageEvents), no con
// hasEnded: así los eventos de día completo siguen buscables toda su jornada.
function buildSearchIndex({ events, spaces, renderedVenueSlugs, typesArchive }) {
  const seenSpace = new Set();
  return JSON.stringify({
    types: (typesArchive || []).map((type) => ({
      title: type.label,
      url: type.path,
      count: type.count || 0
    })),
    spaces: (spaces || [])
      .filter((space) => {
        if (!space || !space.name || !space.slug || seenSpace.has(space.slug)) return false;
        seenSpace.add(space.slug);
        return true;
      })
      .map((space) => ({
        title: space.name,
        url: renderedVenueSlugs.has(space.slug) ? `/espacios/${space.slug}/` : `/espacios/#${space.slug}`,
        count: space.count || 0
      })),
    events: (events || []).map((event) => ({
      title: event.title,
      url: `/e/${event.id}/${event.slug}/`,
      category: event.categoryLabel || '',
      venue: canonicalizeVenue(event.venue || '') || event.venue || event.location || '',
      date: event.scheduleLabel || event.startsAtDayLabel || '',
      // No se muestra: solo alimenta el haystack del buscador, para que
      // "Festival Tonal" o un nombre de calle encuentren el evento.
      extra: [event.organizer, event.address].filter(Boolean).join(' ')
    }))
  });
}

function dayKeyLabel(key) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return formatInMadrid(date, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(date)
    .replace(',', '')
    .replace(/\b\w/, (m) => m.toUpperCase());
}

function buildTimePageDayGroups(enrichedEvents, now, options = {}) {
  const { weekendOnly = false, windowStartKey = '' } = options;
  const todayKey = toLocalDateKey(now);
  const tomorrowKey = toLocalDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const groups = new Map();
  for (const event of enrichedEvents) {
    let key = event.startsAtDayKey;
    if (!key) continue;
    // Un multi-día que empieza antes de la ventana se lista en el primer día
    // de esta, para no mostrar fechas fuera del rango que la página declara.
    if (windowStartKey && key < windowStartKey) key = windowStartKey;
    if (weekendOnly && !isWeekendDayKey(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.keys()].sort().map((key) => {
    const baseLabel = dayKeyLabel(key);
    const prefix = key === todayKey ? 'Hoy' : key === tomorrowKey ? 'Mañana' : '';
    return {
      key,
      label: prefix ? `${prefix}, ${baseLabel}` : baseLabel,
      events: groups.get(key)
    };
  });
}

function sameDay(a, b) {
  return isSameMadridDay(a, b);
}

function toLocalDateKey(date) {
  return toMadridDateKey(date);
}

async function computeAssetVersion() {
  const files = [
    path.join(root, 'src', 'styles', 'base.css'),
    path.join(root, 'src', 'styles', 'home.css'),
    path.join(root, 'src', 'styles', 'event-detail.css'),
    path.join(root, 'src', 'scripts', 'home.js'),
    path.join(root, 'src', 'scripts', 'location-link.js'),
    path.join(root, 'src', 'scripts', 'subscribe.js'),
    path.join(root, 'src', 'scripts', 'menu-drawer.js'),
    path.join(root, 'src', 'scripts', 'spaces.js'),
    path.join(root, 'src', 'scripts', 'saved-events.js'),
    path.join(root, 'src', 'scripts', 'event-detail.js'),
    path.join(root, 'src', 'scripts', 'comments.js'),
    path.join(root, 'src', 'scripts', 'theme.js'),
    path.join(root, 'src', 'scripts', 'matomo.js'),
    path.join(root, 'src', 'scripts', 'install-app.js'),
    path.join(root, 'src', 'scripts', 'search.js'),
    path.join(root, 'src', 'templates', 'partials', 'install-modal.njk'),
    path.join(root, 'src', 'templates', 'partials', 'search-modal.njk'),
    path.join(root, 'src', 'templates', 'layout.njk')
  ];
  const hash = createHash('sha1');
  for (const file of files) {
    hash.update(await fs.readFile(file));
  }
  return hash.digest('hex').slice(0, 10);
}

async function buildSite(events) {
  const timings = new Map();
  const mark = (label) => timings.set(label, process.hrtime.bigint());
  const elapsedMs = (label) => Number(process.hrtime.bigint() - (timings.get(label) || process.hrtime.bigint())) / 1e6;

  mark('total');
  await fs.rm(dist, { recursive: true, force: true });
  mark('assets');
  await ensureDirs();
  await copyStaticAssets();
  await copyVersionedPosters();
  await copyFontAwesome();
  await compileCss(path.join(root, 'src', 'styles', 'home.css'), path.join(cssDir, 'home.css'));
  await compileCss(path.join(root, 'src', 'styles', 'event-detail.css'), path.join(cssDir, 'event-detail.css'));
  await copyJs();
  console.log(`build: assets ${elapsedMs('assets').toFixed(1)}ms`);

  mark('data');
  // Canonicaliza la categoría en un único punto: todo lo demás (filtro Tipo,
  // tarjetas, páginas de categoría, JSON-LD, feeds) hereda la etiqueta unificada.
  events = events.map((event) => (
    event.categoryLabel ? { ...event, categoryLabel: canonicalizeCategory(event.categoryLabel) } : event
  ));
  const sorted = sortEvents(events).map(enrichEvent);
  const filters = deriveFilters(events);
  const { featured, week, ongoing, today } = splitFeatured(events);
  // Ventana abierta (todo el futuro), igual que las páginas de tipo/espacio, para que
  // el contador de /espacios/ sea coherente con /tipos/ y no se limite a 6 meses.
  const groupedSpaces = groupFutureEventsByVenue(sorted, { openEnded: true });
  const venueCatalog = await enrichVenueCatalog(groupedSpaces);
  const spaces = mergeSpacesWithVenueCatalog(groupedSpaces, venueCatalog);
  const spaceSlugByVenueKey = new Map(
    spaces
      .filter((space) => space?.name && space?.slug)
      .map((space) => [normalizeVenueKey(canonicalizeVenue(space.name)), space.slug])
  );
  const spaceNameByVenueKey = new Map(
    spaces
      .filter((space) => space?.name)
      .map((space) => [normalizeVenueKey(canonicalizeVenue(space.name)), space.name])
  );
  const spaceByVenueKey = new Map(
    spaces
      .filter((space) => space?.name)
      .map((space) => [normalizeVenueKey(canonicalizeVenue(space.name)), space])
  );
  // Añade venueKey/venueLabel canónicos a un evento enriquecido, igual que
  // siteDataPayload, para que las tarjetas server-rendered filtren por el
  // espacio canónico (no por el texto de ubicación en crudo).
  const withVenueKeys = (event) => {
    const venueKey = normalizeVenueKey(canonicalizeVenue(event.venue || event.location || ''));
    return { ...event, venueKey, venueLabel: spaceNameByVenueKey.get(venueKey) || '' };
  };
  const assetVersion = await computeAssetVersion();
  // Se sirve solo como /site-data.json (ver layout.njk): ya no se inyecta inline.
  const eventsPayload = siteDataPayload(events, filters, { spaces, spaceNameByVenueKey });
  console.log(`build: data ${elapsedMs('data').toFixed(1)}ms`);
  const categoryFeeds = filters.map((category) => ({
    label: category,
    slug: slugify(category),
    path: `/calendar/${slugify(category)}.ics`,
    url: toAbsoluteUrl(`/calendar/${slugify(category)}.ics`),
    webcalUrl: `webcal://eventos.aldeapucela.org/calendar/${slugify(category)}.ics`
  }));

  const buildNow = resolveBuildNow();
  // Ventana abierta (de hoy en adelante) con límites de día de Madrid: el conjunto
  // vigente/próximo. Es la fuente única de qué se considera "no pasado" y la usan
  // las páginas de tipo/espacio, el índice de búsqueda, el sitemap y el meta robots
  // de cada ficha, para que las cuatro cosas no puedan divergir.
  const categoryWindow = getOpenEndedWindow(buildNow);
  const { ongoing: searchOngoing, listed: searchListed } = selectTimePageEvents(events, categoryWindow, buildNow);
  const searchableEvents = sortEvents([...searchOngoing, ...searchListed]).map(enrichEvent);
  // Solo las fichas vigentes/próximas son indexables: las pasadas viven en /archivo/
  // y llevan noindex (ver el bucle de fichas más abajo).
  const indexableEventIds = new Set(searchableEvents.map((event) => event.id));

  const categoryPages = getCategoryPages(events);
  // Cada etiqueta (clave o alias) apunta a su página, para enrutar "Solo".
  const categoryPagePaths = Object.fromEntries(
    categoryPages.flatMap((page) => page.labels.map((label) => [label, page.path]))
  );
  // Aviso si alguna categoría con eventos se queda sin página (la omitiría el
  // filtrado por categoría). "Otro" se excluye a propósito.
  const mapped = new Set(mappedCategoryLabels());
  const unmapped = filters.filter((label) => label !== 'Otros' && !mapped.has(label));
  if (unmapped.length) {
    console.warn(`build: categorías sin página (añádelas a category-pages.mjs): ${unmapped.join(', ')}`);
  }

  // Páginas por ubicación (/espacios/<slug>/), una por venue con eventos suficientes.
  const venuePages = getVenuePages(spaces);
  const venuePageSlugs = new Set(venuePages.map((page) => page.slug));

  const sharedContext = {
    filtersJson: JSON.stringify(filters),
    filters,
    categoryFeeds,
    categoryPagePaths,
    assetVersion
  };

  mark('pages');
  const homeFeatured = featured ? enrichEvent(featured) : null;
  const homeOngoing = ongoing.map(enrichEvent).map(withVenueKeys);
  // ItemList de la portada: solo lo que está de verdad en el HTML servido (el
  // destacado y el carrusel "En curso"). El listado de #week-groups lo rellena
  // home.js, así que no se anuncia aquí. Dedupe por id: el destacado puede estar
  // también en "En curso".
  const homeItems = [...(homeFeatured ? [homeFeatured] : []), ...homeOngoing]
    .filter((event, index, list) => list.findIndex((other) => other.id === event.id) === index)
    .map((event) => ({ url: `${publicBaseUrl}/e/${event.id}/${event.slug}/`, name: event.title }));
  await writeFile('index.html', render('home.njk', {
    title: 'Qué hacer en Valladolid | Aldea Pucela',
    meta: { description: 'Agenda cultural de Valladolid alimentada desde el foro de Aldea Pucela.' },
    canonicalUrl: `${publicBaseUrl}/`,
    googleSiteVerification,
    jsonLd: homeItems.length
      ? serializeJsonLd(buildCollectionPageJsonLd({
          name: 'Qué hacer en Valladolid',
          description: 'Agenda cultural de Valladolid alimentada desde el foro de Aldea Pucela.',
          url: `${publicBaseUrl}/`,
          items: homeItems
        }))
      : null,
    social: {
      type: 'website',
      title: 'Qué hacer en Valladolid | Aldea Pucela',
      description: 'Agenda cultural de Valladolid alimentada desde el foro de Aldea Pucela.',
      ...socialPreview,
      url: `${publicBaseUrl}/`
    },
    pageCss: 'home.css',
    pageJs: 'home.js',
    activeNav: 'home',
    featured: homeFeatured,
    week: week.map(enrichEvent),
    ongoing: homeOngoing,
    today: today.map(enrichEvent),
    todayCount: today.length,
    categories: filters,
    includeSiteData: true,
    ...sharedContext
  }));

  await writeFile('guardados/index.html', render('saved-events.njk', {
    title: 'Mis guardados | Eventos Valladolid | Aldea Pucela',
    meta: { description: 'Tus eventos guardados en Aldea Pucela Eventos.' },
    robotsMeta: 'noindex,follow',
    social: {
      type: 'website',
      title: 'Mis guardados | Eventos Valladolid | Aldea Pucela',
      description: 'Tus eventos guardados en Aldea Pucela Eventos.',
      ...socialPreview,
      url: `${publicBaseUrl}/guardados/`
    },
    pageCss: 'home.css',
    pageJs: 'saved-events.js',
    includeSiteData: true,
    ...sharedContext
  }));

  const pastEvents = getPastEvents(events).map(enrichEvent);
  const groups = groupEventsByMonth(pastEvents);

  await writeFile('archivo/index.html', render('archivo.njk', {
    title: 'Archivo de eventos | Eventos Valladolid | Aldea Pucela',
    meta: { description: 'Histórico de eventos culturales pasados en Valladolid.' },
    canonicalUrl: `${publicBaseUrl}/archivo/`,
    // Hub de lo ya celebrado: se mantiene navegable, pero no queremos indexar
    // pasado. Igual que las fichas que lista (ver el bucle de fichas).
    robotsMeta: 'noindex,follow',
    social: {
      type: 'website',
      title: 'Archivo de eventos | Eventos Valladolid | Aldea Pucela',
      description: 'Histórico de eventos culturales pasados en Valladolid.',
      ...socialPreview,
      url: `${publicBaseUrl}/archivo/`
    },
    pageCss: 'home.css',
    pageJs: 'home.js',
    groups,
    includeSiteData: true,
    ...sharedContext
  }));

  const spacesByCount = [...spaces].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  await writeFile('espacios/index.html', render('spaces.njk', {
    title: 'Espacios | Eventos Valladolid | Aldea Pucela',
    meta: { description: 'Eventos en los próximos seis meses agrupados por espacio en Valladolid.' },
    canonicalUrl: `${publicBaseUrl}/espacios/`,
    social: {
      type: 'website',
      title: 'Espacios | Eventos Valladolid | Aldea Pucela',
      description: 'Eventos en los próximos seis meses agrupados por espacio en Valladolid.',
      ...socialPreview,
      url: `${publicBaseUrl}/espacios/`
    },
    pageCss: 'home.css',
    pageJs: 'home.js',
    activeNav: 'spaces',
    // Los espacios con más programación primero. groupFutureEventsByVenue ordena
    // por próximo evento, que es lo que quieren otros consumidores, así que el
    // orden por volumen se aplica solo aquí, al pintar el hub.
    spaces: spacesByCount.map((space) => ({
      ...space,
      // Avance de 4 eventos por tarjeta, como /tipos/: el listado completo vive en
      // /espacios/<slug>/. Antes la tarjeta pintaba TODOS los eventos del espacio,
      // así que el hub repetía entero el contenido de cada página de espacio.
      // `space.count` sigue mostrando el total real.
      events: space.events.slice(0, HUB_CARD_EVENTS),
      pageHref: venuePageSlugs.has(space.slug) ? `/espacios/${space.slug}/` : null
    })),
    spacesCount: spaces.length,
    futureEventsCount: spaces.reduce((total, space) => total + space.count, 0),
    includeSiteData: true,
    spacesDataJson: JSON.stringify(spacesByCount.map((space) => ({
      slug: space.slug,
      name: space.name,
      address: space.address,
      count: space.count,
      lat: space.lat,
      lon: space.lon,
      hasMapPoint: space.hasMapPoint
    }))),
    ...sharedContext
  }));

  for (const page of getTimePages(buildNow)) {
    const { ongoing: pageOngoing, listed } = selectTimePageEvents(events, page.window, buildNow);
    const enrichedListed = sortEvents(listed).map(enrichEvent).map(withVenueKeys);
    const enrichedOngoing = sortEvents(pageOngoing).map(enrichEvent).map(withVenueKeys);
    const dayGroups = buildTimePageDayGroups(enrichedListed, buildNow, {
      weekendOnly: page.weekendOnly,
      windowStartKey: toLocalDateKey(page.window.start)
    });
    const pageUrl = `${publicBaseUrl}${page.path}`;
    const itemListItems = [...enrichedOngoing, ...dayGroups.flatMap((group) => group.events)].map((event) => ({
      url: `${publicBaseUrl}/e/${event.id}/${event.slug}/`,
      name: event.title
    }));
    await writeFile(path.join(page.slug, 'index.html'), render('time-page.njk', {
      title: page.title,
      meta: { description: page.description },
      canonicalUrl: pageUrl,
      jsonLd: itemListItems.length
        ? serializeJsonLd(buildCollectionPageJsonLd({
            name: page.h1,
            description: page.description,
            url: pageUrl,
            items: itemListItems
          }))
        : null,
      social: {
        type: 'website',
        title: page.title,
        description: page.description,
        ...socialPreview,
        url: pageUrl
      },
      pageCss: 'home.css',
      pageJs: 'home.js',
      activeNav: 'home',
      pageH1: page.h1,
      pageH2: page.h2,
      timeFilterKey: page.filterKey,
      ongoing: enrichedOngoing,
      dayGroups,
      categories: filters,
      includeSiteData: true,
      ...sharedContext
    }));
  }

  // Páginas por tipo (/t/musica/, /t/cine/...): mismo patrón que las temporales
  // pero con ventana abierta (de hoy en adelante, `categoryWindow`) filtrada por categoría.
  // Archivo de tipos (/tipos/): un avance por categoría; el listado completo vive
  // en cada página /t/<slug>/. Se alimenta de lo que ya calcula este bucle.
  const typesArchive = [];
  // Páginas de tipo que llegan al umbral: las únicas que se anuncian en el
  // sitemap (ver más abajo). Las que no llegan —incluidas las que se quedan a
  // cero eventos vigentes— se siguen generando a propósito: la ficha de evento
  // enlaza a la página de su categoría vía categoryPagePaths, así que borrarlas
  // daría 404 desde los eventos pasados de esas categorías.
  const indexableCategoryPages = [];
  for (const page of categoryPages) {
    const categoryEvents = events.filter((event) => page.labels.includes(event.categoryLabel));
    const { ongoing: pageOngoing, listed } = selectTimePageEvents(categoryEvents, categoryWindow, buildNow);
    const enrichedListed = sortEvents(listed).map(enrichEvent).map(withVenueKeys);
    const enrichedOngoing = sortEvents(pageOngoing).map(enrichEvent).map(withVenueKeys);
    const typeCount = enrichedOngoing.length + enrichedListed.length;
    if (typeCount > 0) {
      typesArchive.push({
        label: page.labels[0],
        slug: page.slug,
        path: page.path,
        count: typeCount,
        events: [...enrichedOngoing, ...enrichedListed].slice(0, HUB_CARD_EVENTS)
      });
    }
    const isIndexable = typeCount >= MIN_INDEXABLE_CATEGORY_EVENTS;
    if (isIndexable) indexableCategoryPages.push(page);
    const pageUrl = `${publicBaseUrl}${page.path}`;
    const itemListItems = [...enrichedOngoing, ...enrichedListed].map((event) => ({
      url: `${publicBaseUrl}/e/${event.id}/${event.slug}/`,
      name: event.title
    }));
    await writeFile(path.join('t', page.slug, 'index.html'), render('time-page.njk', {
      title: page.title,
      meta: { description: page.description },
      canonicalUrl: pageUrl,
      // follow para que siga los enlaces del menú aunque no indexe la página, y
      // se auto-cura: en cuanto la categoría llega al umbral vuelve a ser
      // indexable. Cubre también el caso extremo de cero eventos vigentes, donde
      // la página es solo el encabezado y el mensaje de "todavía no hay eventos".
      robotsMeta: isIndexable ? null : 'noindex,follow',
      jsonLd: itemListItems.length
        ? serializeJsonLd(buildCollectionPageJsonLd({
            name: page.h1,
            description: page.description,
            url: pageUrl,
            items: itemListItems
          }))
        : null,
      social: {
        type: 'website',
        title: page.title,
        description: page.description,
        ...socialPreview,
        url: pageUrl
      },
      pageCss: 'home.css',
      pageJs: 'home.js',
      activeNav: 'types',
      pageH1: page.h1,
      pageH2: page.h2,
      ongoing: [],
      ongoingGrid: enrichedOngoing,
      flatEvents: enrichedListed,
      cardWithYear: true,
      categories: filters,
      includeSiteData: true,
      ...sharedContext
    }));
  }

  // Archivo de tipos (/tipos/), a imagen de /espacios/ pero por categoría. Más
  // eventos vigentes primero; desempate alfabético.
  const typesArchiveSorted = [...typesArchive].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
  await writeFile('tipos/index.html', render('types.njk', {
    title: 'Tipos de evento | Eventos Valladolid | Aldea Pucela',
    meta: { description: 'Explora la agenda cultural de Valladolid por tipo de evento: música, cine, teatro, exposiciones y más, recopilados por la comunidad de Aldea Pucela.' },
    canonicalUrl: `${publicBaseUrl}/tipos/`,
    social: {
      type: 'website',
      title: 'Tipos de evento | Eventos Valladolid | Aldea Pucela',
      description: 'Explora la agenda cultural de Valladolid por tipo de evento: música, cine, teatro, exposiciones y más.',
      ...socialPreview,
      url: `${publicBaseUrl}/tipos/`
    },
    pageCss: 'home.css',
    pageJs: 'home.js',
    activeNav: 'types',
    cardWithYear: true,
    types: typesArchiveSorted,
    includeSiteData: true,
    ...sharedContext
  }));

  // Páginas por ubicación (/espacios/<slug>/): mismo patrón que las de categoría,
  // pero filtrando por el venue canónico. Igual que la cualificación del venue
  // (groupFutureEventsByVenue solo mira event.venue), para que la lista de la
  // página coincida con lo que la hizo elegible (no colar eventos por location).
  const renderedVenuePages = [];
  const indexableVenuePages = [];
  for (const page of venuePages) {
    const venueEvents = events.filter((event) =>
      normalizeVenueKey(canonicalizeVenue(event.venue || '')) === page.venueKey
    );
    const { ongoing: pageOngoing, listed } = selectTimePageEvents(venueEvents, categoryWindow, buildNow);
    // Dos grids con la fecha en cada tarjeta: "En curso" (multi-día que abarcan hoy)
    // y "Próximos eventos"; sin separar por día ni carrusel aparte.
    const ongoingGrid = sortEvents(pageOngoing).map(enrichEvent).map(withVenueKeys);
    const upcomingEvents = sortEvents(listed).map(enrichEvent).map(withVenueKeys);
    // Sin eventos que mostrar (borde raro: cualificó por la ventana de 6 meses
    // pero no queda nada en la ventana abierta): no generamos una página vacía
    // indexable ni la anunciamos en el sitemap.
    if (!ongoingGrid.length && !upcomingEvents.length) continue;
    renderedVenuePages.push(page);
    const venueEventCount = ongoingGrid.length + upcomingEvents.length;
    const isVenueIndexable = venueEventCount >= MIN_INDEXABLE_VENUE_EVENTS;
    if (isVenueIndexable) indexableVenuePages.push(page);
    // "Tipo" en esta página solo ofrece las categorías presentes en el espacio,
    // manteniendo el orden del catálogo global.
    const venueCategoryLabels = new Set([...ongoingGrid, ...upcomingEvents].map((event) => event.categoryLabel).filter(Boolean));
    const venueCategories = filters.filter((label) => venueCategoryLabels.has(label));
    const pageUrl = `${publicBaseUrl}${page.path}`;
    const itemListItems = [...ongoingGrid, ...upcomingEvents].map((event) => ({
      url: `${publicBaseUrl}/e/${event.id}/${event.slug}/`,
      name: event.title
    }));
    await writeFile(path.join('espacios', page.slug, 'index.html'), render('time-page.njk', {
      title: page.title,
      meta: { description: page.description },
      canonicalUrl: pageUrl,
      robotsMeta: isVenueIndexable ? null : 'noindex,follow',
      jsonLd: itemListItems.length
        ? serializeJsonLd(buildVenuePageJsonLd({
            name: page.h1,
            description: page.description,
            url: pageUrl,
            items: itemListItems,
            venue: { name: page.canonicalVenue, address: page.address, lat: page.lat, lon: page.lon }
          }))
        : null,
      social: {
        type: 'website',
        title: page.title,
        description: page.description,
        ...socialPreview,
        url: pageUrl
      },
      pageCss: 'home.css',
      pageJs: 'home.js',
      activeNav: 'spaces',
      pageH1: page.h1,
      pageH2: page.h2,
      venue: { name: page.canonicalVenue, address: page.address },
      ongoing: [],
      ongoingGrid,
      flatEvents: upcomingEvents,
      cardWithYear: true,
      categories: venueCategories,
      includeSiteData: true,
      ...sharedContext
    }));
  }

  for (const event of sorted) {
    const relatedEvents = event.categoryLabel
      ? rotateBySeed(sorted.filter((e) => e.id !== event.id && e.categoryLabel === event.categoryLabel && !e.hasEnded), event.id).slice(0, 4)
      : [];
    const eventVenueKey = normalizeVenueKey(canonicalizeVenue(event.venue || ''));
    const moreInVenueEvents = eventVenueKey
      ? rotateBySeed(sorted.filter((e) => (
        e.id !== event.id &&
        !e.hasEnded &&
        normalizeVenueKey(canonicalizeVenue(e.venue || '')) === eventVenueKey
      )), event.id).slice(0, 4)
      : [];
    const moreInVenueTitle = canonicalizeVenue(event.venue || '') || event.venue || '';
    const venueSlug = eventVenueKey ? spaceSlugByVenueKey.get(eventVenueKey) : '';
    const moreInVenueHref = venueSlug
      ? (venuePageSlugs.has(venueSlug) ? `/espacios/${venueSlug}/` : `/espacios/#${venueSlug}`)
      : '/espacios/';
    const venueEntry = eventVenueKey ? spaceByVenueKey.get(eventVenueKey) || null : null;

    await writeFile(path.join('e', String(event.id), event.slug, 'index.html'), render('event-detail.njk', {
      title: `${event.title} | Eventos Valladolid | Aldea Pucela`,
      meta: { description: event.excerpt },
      canonicalUrl: `${publicBaseUrl}/e/${event.id}/${event.slug}/`,
      // Las fichas ya celebradas se quedan accesibles desde /archivo/, pero no se
      // indexan: mismo conjunto vigente que anuncia el sitemap.
      robotsMeta: indexableEventIds.has(event.id) ? null : 'noindex,follow',
      jsonLd: serializeJsonLd(buildEventJsonLd(event, { publicBaseUrl, venueEntry })),
      pageCss: 'event-detail.css',
      pageJs: 'event-detail.js',
      event,
      relatedEvents,
      moreInVenueEvents,
      moreInVenueTitle,
      moreInVenueHref,
      eventDetailJson: JSON.stringify({
        title: event.title,
        summary: event.summary || event.excerpt,
        location: event.location,
        sourceUrl: event.sourceUrl,
        startsAtIso: event.startsAt,
        endsAtIso: event.endsAt,
        // Los tres siguientes los usa la búsqueda del botón de acceso para
        // acotar el evento (ver event-detail.js): sin ellos preguntaba solo con
        // título, fecha y lugar.
        categoryLabel: event.categoryLabel,
        organizer: event.organizer,
        notes: event.notes,
        // El botón de acceso pregunta una cosa u otra según sepamos o no que se
        // cobra (ver event-detail.js).
        priceStatus: event.priceStatus
      }),
      social: {
        type: 'article',
        title: event.title,
        description: event.summary || event.excerpt,
        url: `${publicBaseUrl}/e/${event.id}/${event.slug}/`,
        // Sin imagen propia caemos en la portada social del sitio, no en el
        // logo cuadrado del foro (mal encaje en tarjetas grandes y con copias
        // antiguas cacheadas en las redes).
        ...(event.image ? { image: event.image } : socialPreview)
      },
      includeSiteData: false,
      ...sharedContext
    }));
  }
  console.log(`build: pages ${elapsedMs('pages').toFixed(1)}ms`);

  mark('feeds');
  await writeFile('site-data.json', eventsPayload);
  const renderedVenueSlugs = new Set(renderedVenuePages.map((page) => page.slug));
  await writeFile('search-index.json', buildSearchIndex({
    events: searchableEvents,
    spaces,
    renderedVenueSlugs,
    typesArchive: typesArchiveSorted
  }));
  await writeFile('rss.xml', buildRssXml(events));
  // /guardados/ y /archivo/ quedan fuera a propósito: personal la una, pasado la
  // otra, y ambas llevan noindex. Las páginas de tipo y espacio que no llegan al
  // umbral tampoco se anuncian, aunque sí se generan y se enlazan desde su hub.
  await writeFile('sitemap.xml', buildSitemapXml({
    staticPages: [
      { path: '/', lastmod: toLocalDateKey(buildNow) },
      { path: '/espacios/', lastmod: toLocalDateKey(buildNow) },
      { path: '/tipos/', lastmod: toLocalDateKey(buildNow) },
      ...getTimePages(buildNow).map((page) => ({ path: page.path, lastmod: toLocalDateKey(buildNow) })),
      ...indexableCategoryPages.map((page) => ({ path: page.path, lastmod: toLocalDateKey(buildNow) })),
      ...indexableVenuePages.map((page) => ({ path: page.path, lastmod: toLocalDateKey(buildNow) }))
    ],
    // Fichas de evento vigentes y próximas: son las únicas páginas del sitio con
    // contenido propio (descripción, cartel, JSON-LD de Event) y las que sostienen
    // el long tail. Solo la ventana vigente/próxima, la misma que ven las páginas
    // de tipo/espacio: las pasadas viven en /archivo/ y no se anuncian.
    events: searchableEvents
  }));
  await writeFile('robots.txt', [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${publicBaseUrl}/sitemap.xml`,
    ''
  ].join('\n'));
  await writeFile('calendar.ics', buildCalendarIcs(events));
  for (const feed of categoryFeeds) {
    const filteredEvents = events.filter((event) => event.categoryLabel === feed.label);
    await writeFile(
      path.join('calendar', `${feed.slug}.ics`),
      buildCalendarIcs(filteredEvents, { name: `Eventos Valladolid - ${feed.label}` })
    );
  }
  await writeFile('manifest.webmanifest', JSON.stringify({
    name: 'Eventos Valladolid',
    short_name: 'Eventos',
    description: 'Agenda cultural de Valladolid alimentada por la comunidad de Aldea Pucela.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f1ea',
    theme_color: '#6f59a8',
    icons: [
      {
        src: '/assets/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/assets/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }, null, 2));
  await writeFile('service-worker.js', [
    "self.addEventListener('install', () => {",
    '  self.skipWaiting();',
    '});',
    '',
    "self.addEventListener('activate', (event) => {",
    '  event.waitUntil(self.clients.claim());',
    '});',
    '',
    "self.addEventListener('fetch', (event) => {",
    "  if (event.request.method !== 'GET') return;",
    "  if (!event.request.url.startsWith(self.location.origin)) return;",
    '  event.respondWith(fetch(event.request));',
    '});',
    ''
  ].join('\n'));
  console.log(`build: feeds ${elapsedMs('feeds').toFixed(1)}ms`);
  console.log(`build: total ${elapsedMs('total').toFixed(1)}ms`);
}

async function main() {
  await ensureDirs();
  const events = args.has('--rebuild') ? (await loadCachedEvents()).events : await syncEvents({ rebuild: false });
  await buildSite(events);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
