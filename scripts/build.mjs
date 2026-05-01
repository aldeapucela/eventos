import fs from 'node:fs/promises';
import path from 'node:path';
import nunjucks from 'nunjucks';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';
import { loadCachedEvents } from '../src/data/store.mjs';
import { deriveFilters, sortEvents, splitFeatured } from '../src/data/site.mjs';
import { formatDateRange, formatDateTime, parseDateLike } from '../src/data/format.mjs';
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
}

function render(template, context) {
  return env.render(template, context);
}

async function writeFile(relPath, content) {
  const filePath = path.join(dist, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

function enrichEvent(event) {
  const startsAtDate = event.startsAt ? parseDateLike(event.startsAt) : null;
  const endsAtDate = event.endsAt ? parseDateLike(event.endsAt) : null;
  const isMultiDay = Boolean(startsAtDate && endsAtDate && !sameDay(startsAtDate, endsAtDate));
  const compactDateLabel = startsAtDate
    ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
        .format(startsAtDate)
        .replace(',', '')
        .replace(/\b\w/, (m) => m.toUpperCase())
    : '';
  const startsAtDateLabel = startsAtDate
    ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
        .format(startsAtDate)
        .replace(',', '')
        .replace(/\b\w/, (m) => m.toUpperCase())
    : '';
  const startsAtTimeLabel = startsAtDate
    ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(startsAtDate)
    : '';
  return {
    ...event,
    startsAtLabel: formatDateTime(event.startsAt),
    endsAtLabel: event.endsAt ? formatDateTime(event.endsAt) : '',
    endsAtDayLabel: event.endsAt
      ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
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
      ? new Intl.DateTimeFormat('es-ES', {
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
    monthLabel: startsAtDate ? new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(startsAtDate).toUpperCase() : '',
    dayLabel: startsAtDate ? new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(startsAtDate) : '',
    hasEnded: endsAtDate ? endsAtDate < new Date() : startsAtDate ? startsAtDate < new Date() : false
  };
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

  const sharedContext = {
    filtersJson: JSON.stringify(filters),
    eventsJson: siteDataPayload(events),
    filters
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
