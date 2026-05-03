import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nunjucks from 'nunjucks';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';
import { loadCachedEvents } from '../src/data/store.mjs';
import { deriveFilters, sortEvents, splitFeatured, getPastEvents, groupEventsByMonth } from '../src/data/site.mjs';
import { DISPLAY_TIMEZONE, escapeHtml, formatDateRange, formatDateTime, parseDateLike } from '../src/data/format.mjs';
import { syncEvents } from './sync-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const assetsDir = path.join(dist, 'assets');
const cssDir = path.join(assetsDir, 'css');
const jsDir = path.join(assetsDir, 'js');
const publicBaseUrl = 'https://eventos.aldeapucela.org';

const args = new Set(process.argv.slice(2));

const env = nunjucks.configure(path.join(root, 'src', 'templates'), {
  autoescape: true,
  noCache: true
});

async function ensureDirs() {
  await fs.mkdir(cssDir, { recursive: true });
  await fs.mkdir(jsDir, { recursive: true });
  await fs.mkdir(path.join(assetsDir, 'fontawesome'), { recursive: true });
}

async function copyStaticAssets() {
  await fs.cp(path.join(root, 'src', 'assets'), assetsDir, { recursive: true });
}

async function copyFontAwesome() {
  const source = path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free');
  const target = path.join(assetsDir, 'fontawesome');
  await fs.cp(source, target, { recursive: true });
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
  await fs.copyFile(path.join(root, 'src', 'scripts', 'saved-events.js'), path.join(jsDir, 'saved-events.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'theme.js'), path.join(jsDir, 'theme.js'));
  await fs.copyFile(path.join(root, 'src', 'scripts', 'matomo.js'), path.join(jsDir, 'matomo.js'));
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
  const sortedByUpdatedDesc = [...events].sort((a, b) => {
    const aTime = parseDateLike(a.updatedAt || a.startsAt || 0).getTime();
    const bTime = parseDateLike(b.updatedAt || b.startsAt || 0).getTime();
    return bTime - aTime;
  });
  const lastBuildDate = sortedByUpdatedDesc.length
    ? toRfc2822(sortedByUpdatedDesc[0].updatedAt || sortedByUpdatedDesc[0].startsAt)
    : new Date().toUTCString();
  const items = sortedByUpdatedDesc.map((event) => {
    const eventUrl = toAbsoluteUrl(`/e/${event.id}/${event.slug}`);
    const title = escapeHtml(event.title || 'Evento');
    const description = escapeHtml(event.summary || event.excerpt || '');
    const pubDate = toRfc2822(event.updatedAt || event.startsAt);
    return [
      '    <item>',
      `      <title>${title}</title>`,
      `      <link>${eventUrl}</link>`,
      `      <guid isPermaLink="true">${eventUrl}</guid>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <description>${description}</description>`,
      '    </item>'
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>Aldea Pucela Eventos</title>',
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

function buildCalendarIcs(events) {
  const now = new Date();
  const dtstamp = formatUtcIcsDate(now);
  const sorted = sortEvents(events);
  const rows = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aldea Pucela//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs('Aldea Pucela Eventos')}`,
    `X-WR-TIMEZONE:${DISPLAY_TIMEZONE}`
  ];

  for (const event of sorted) {
    const startDate = event.startsAt ? parseDateLike(event.startsAt) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) continue;
    const endDateRaw = event.endsAt ? parseDateLike(event.endsAt) : null;
    const endDate = endDateRaw && !Number.isNaN(endDateRaw.getTime())
      ? endDateRaw
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    const eventUrl = toAbsoluteUrl(`/e/${event.id}/${event.slug}`);
    const uid = `${event.id}@eventos.aldeapucela.org`;
    rows.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatUtcIcsDate(startDate)}`,
      `DTEND:${formatUtcIcsDate(endDate)}`,
      `SUMMARY:${escapeIcs(event.title || 'Evento')}`,
      `DESCRIPTION:${escapeIcs(`${event.summary || event.excerpt || ''}\n\n${eventUrl}`)}`,
      `LOCATION:${escapeIcs(event.location || '')}`,
      `URL:${escapeIcs(eventUrl)}`,
      'END:VEVENT'
    );
  }

  rows.push('END:VCALENDAR', '');
  return rows.join('\r\n');
}

function enrichEvent(event) {
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
    hasEnded: endsAtDate ? endsAtDate < new Date() : startsAtDate ? startsAtDate < new Date() : false
  };
}

function formatInMadrid(_date, options) {
  return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: DISPLAY_TIMEZONE });
}

function siteDataPayload(events) {
  const enriched = events.map(enrichEvent);
  return JSON.stringify({
    events: enriched.map((event) => ({
      ...event,
      startsAtIso: event.startsAt,
      endsAtIso: event.endsAt
    }))
  });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function toLocalDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function computeAssetVersion() {
  const files = [
    path.join(root, 'src', 'styles', 'base.css'),
    path.join(root, 'src', 'styles', 'home.css'),
    path.join(root, 'src', 'styles', 'event-detail.css'),
    path.join(root, 'src', 'scripts', 'home.js'),
    path.join(root, 'src', 'scripts', 'saved-events.js'),
    path.join(root, 'src', 'scripts', 'event-detail.js'),
    path.join(root, 'src', 'scripts', 'theme.js'),
    path.join(root, 'src', 'scripts', 'matomo.js')
  ];
  const hash = createHash('sha1');
  for (const file of files) {
    hash.update(await fs.readFile(file));
  }
  return hash.digest('hex').slice(0, 10);
}

async function buildSite(events) {
  await fs.rm(dist, { recursive: true, force: true });
  await ensureDirs();
  await copyStaticAssets();
  await copyFontAwesome();
  await compileCss(path.join(root, 'src', 'styles', 'home.css'), path.join(cssDir, 'home.css'));
  await compileCss(path.join(root, 'src', 'styles', 'event-detail.css'), path.join(cssDir, 'event-detail.css'));
  await copyJs();

  const sorted = sortEvents(events).map(enrichEvent);
  const filters = deriveFilters(events);
  const { featured, week, ongoing, today } = splitFeatured(events);
  const assetVersion = await computeAssetVersion();

  const sharedContext = {
    filtersJson: JSON.stringify(filters),
    eventsJson: siteDataPayload(events),
    filters,
    assetVersion
  };

  await writeFile('index.html', render('home.njk', {
    title: 'Qué hacer en Valladolid | Aldea Pucela',
    meta: { description: 'Agenda cultural de Valladolid alimentada desde el foro de Aldea Pucela.' },
    social: {
      type: 'website',
      title: 'Qué hacer en Valladolid | Aldea Pucela',
      description: 'Agenda cultural de Valladolid alimentada desde el foro de Aldea Pucela.',
      image: `${publicBaseUrl}/assets/social-preview.jpg`,
      url: `${publicBaseUrl}/`
    },
    pageCss: 'home.css',
    pageJs: 'home.js',
    featured: featured ? enrichEvent(featured) : null,
    week: week.map(enrichEvent),
    ongoing: ongoing.map(enrichEvent),
    today: today.map(enrichEvent),
    todayCount: today.length,
    categories: filters,
    ...sharedContext
  }));

  await writeFile('guardados/index.html', render('saved-events.njk', {
    title: 'Mis guardados | Aldea Pucela Eventos',
    meta: { description: 'Tus eventos guardados en Aldea Pucela Eventos.' },
    social: {
      type: 'website',
      title: 'Mis guardados | Aldea Pucela Eventos',
      description: 'Tus eventos guardados en Aldea Pucela Eventos.',
      image: `${publicBaseUrl}/assets/social-preview.jpg`,
      url: `${publicBaseUrl}/guardados`
    },
    pageCss: 'home.css',
    pageJs: 'saved-events.js',
    ...sharedContext
  }));

  const pastEvents = getPastEvents(events).map(enrichEvent);
  const groups = groupEventsByMonth(pastEvents);

  await writeFile('archivo/index.html', render('archivo.njk', {
    title: 'Archivo de eventos | Aldea Pucela',
    meta: { description: 'Histórico de eventos culturales pasados en Valladolid.' },
    social: {
      type: 'website',
      title: 'Archivo de eventos | Aldea Pucela',
      description: 'Histórico de eventos culturales pasados en Valladolid.',
      image: `${publicBaseUrl}/assets/social-preview.jpg`,
      url: `${publicBaseUrl}/archivo`
    },
    pageCss: 'home.css',
    pageJs: 'home.js',
    groups,
    ...sharedContext
  }));

  for (const event of sorted) {
    await writeFile(path.join('e', String(event.id), event.slug, 'index.html'), render('event-detail.njk', {
    title: `${event.title} | Aldea Pucela Eventos`,
    meta: { description: event.excerpt },
    pageCss: 'event-detail.css',
    pageJs: 'event-detail.js',
    event: enrichEvent(event),
    eventDetailJson: JSON.stringify({
      title: event.title,
      summary: event.summary || event.excerpt,
      location: event.location,
      sourceUrl: event.sourceUrl,
      startsAtIso: event.startsAt,
      endsAtIso: event.endsAt
    }),
    social: {
      type: 'article',
      title: event.title,
      description: event.summary || event.excerpt,
      image: event.image || `${publicBaseUrl}/img/logo-web.jpg`,
      url: `${publicBaseUrl}/e/${event.id}/${event.slug}`
    },
    ...sharedContext
  }));
  }

  await writeFile('site-data.json', siteDataPayload(events));
  await writeFile('rss.xml', buildRssXml(events));
  await writeFile('calendar.ics', buildCalendarIcs(events));
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
