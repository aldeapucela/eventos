import {
  DISPLAY_TIMEZONE,
  formatMadridLongDay,
  formatMadridLongDayRange,
  formatMadridMonthRange,
  formatMadridMonthYear,
  getMadridDateParts,
  isSameMadridDay,
  parseDateLike,
  toMadridDateKey
} from './format.mjs';

// Permite fijar la fecha del build (p. ej. BUILD_NOW='2026-06-15T10:00:00+02:00')
// para probar las páginas temporales sin tocar el reloj del sistema.
export function resolveBuildNow() {
  if (process.env.BUILD_NOW) {
    const fixed = new Date(process.env.BUILD_NOW);
    if (!Number.isNaN(fixed.getTime())) return fixed;
  }
  return new Date();
}

function getMadridClockParts(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

// Instante UTC que corresponde a esa hora de pared en Madrid.
// Dos iteraciones bastan para converger ante cambios de horario (DST).
function madridWallTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  for (let i = 0; i < 2; i += 1) {
    const clock = getMadridClockParts(new Date(utc));
    utc += Date.UTC(year, month - 1, day, hour, minute, second, ms)
      - Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second, ms);
  }
  return new Date(utc);
}

// A las 12:00 UTC la fecha de Madrid coincide con la UTC: suma días sin líos de DST.
function addDaysToParts(parts, days) {
  return getMadridDateParts(new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12)));
}

// 0=domingo ... 6=sábado, como Date#getDay().
function madridWeekday(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function startOfMadridDay(parts) {
  return madridWallTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, 0);
}

function endOfMadridDay(parts) {
  return madridWallTimeToUtc(parts.year, parts.month, parts.day, 23, 59, 59, 999);
}

// Réplica en Europe/Madrid de las ventanas de checkTimeVisible() en
// src/scripts/home.js (que opera con la hora local del navegador).
export function getTimeWindow(key, now) {
  const today = getMadridDateParts(now);
  const weekday = madridWeekday(today);

  if (key === 'Hoy') {
    return { start: startOfMadridDay(today), end: endOfMadridDay(today) };
  }

  // Domingo de la semana actual (si hoy es domingo, hoy mismo).
  const sunday = addDaysToParts(today, weekday === 0 ? 0 : 7 - weekday);

  if (key === 'Este finde') {
    const friday = addDaysToParts(sunday, -2);
    return {
      start: madridWallTimeToUtc(friday.year, friday.month, friday.day, 15, 0, 0, 0),
      end: endOfMadridDay(sunday)
    };
  }

  const monday = addDaysToParts(today, weekday === 0 ? -6 : 1 - weekday);

  if (key === 'Esta semana') {
    return { start: startOfMadridDay(monday), end: endOfMadridDay(addDaysToParts(monday, 6)) };
  }

  if (key === 'Próxima semana') {
    const nextMonday = addDaysToParts(monday, 7);
    return { start: startOfMadridDay(nextMonday), end: endOfMadridDay(addDaysToParts(nextMonday, 6)) };
  }

  if (key === 'Este mes') {
    const monthEnd = { year: today.year, month: today.month, day: lastDayOfMonth(today.year, today.month) };
    return { start: startOfMadridDay(today), end: endOfMadridDay(monthEnd) };
  }

  if (key === 'Próximos 3 meses') {
    const targetMonth = today.month + 2;
    const year = today.year + Math.floor((targetMonth - 1) / 12);
    const month = ((targetMonth - 1) % 12) + 1;
    const monthEnd = { year, month, day: lastDayOfMonth(year, month) };
    return { start: startOfMadridDay(today), end: endOfMadridDay(monthEnd) };
  }

  throw new Error(`Ventana temporal desconocida: ${key}`);
}

// Las fechas sin hora (YYYY-MM-DD) se interpretan como límites del día en Madrid,
// igual que parseEventDateBoundary en src/data/site.mjs.
function parseEventBoundary(value, boundary) {
  const stringValue = String(value || '').trim();
  if (!stringValue) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    return boundary === 'end'
      ? madridWallTimeToUtc(year, month, day, 23, 59, 59, 999)
      : madridWallTimeToUtc(year, month, day, 0, 0, 0, 0);
  }
  return parseDateLike(stringValue);
}

export function eventMatchesWindow(event, window) {
  if (!event?.startsAt) return false;
  const startsAt = parseEventBoundary(event.startsAt, 'start');
  if (Number.isNaN(startsAt.getTime())) return false;
  const endsAtRaw = event.endsAt ? parseEventBoundary(event.endsAt, 'end') : startsAt;
  const endsAt = Number.isNaN(endsAtRaw.getTime()) ? startsAt : endsAtRaw;
  return startsAt <= window.end && endsAt >= window.start;
}

// Ventana abierta (de hoy en adelante, sin fin): para listados sin tope
// temporal como las páginas por categoría.
export function getOpenEndedWindow(now) {
  return { start: startOfMadridDay(getMadridDateParts(now)), end: new Date(8640000000000000) };
}

function isOngoingMultiDay(event, now) {
  if (!event?.startsAt || !event?.endsAt) return false;
  const starts = parseEventBoundary(event.startsAt, 'start');
  const ends = parseEventBoundary(event.endsAt, 'end');
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return false;
  if (isSameMadridDay(starts, ends)) return false;
  return starts <= now && ends >= now;
}

// Espejo de la selección del cliente: los multi-día en curso van al carrusel
// "En curso" (ongoing) y el resto a la lista por días (listed), excluyendo
// eventos ya empezados en días anteriores (isWithinListingWindow en home.js).
export function selectTimePageEvents(events, window, now) {
  const todayStart = startOfMadridDay(getMadridDateParts(now));
  const ongoing = events.filter((event) => isOngoingMultiDay(event, now) && eventMatchesWindow(event, window));
  const listed = events.filter((event) => {
    if (!eventMatchesWindow(event, window)) return false;
    if (isOngoingMultiDay(event, now)) return false;
    const startsAt = parseEventBoundary(event.startsAt, 'start');
    return startsAt >= todayStart;
  });
  return { ongoing, listed };
}

const WEEKEND_DAYS = new Set([5, 6, 0]);

export function isWeekendDayKey(dayKey) {
  const match = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const weekday = madridWeekday({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
  return WEEKEND_DAYS.has(weekday);
}

export function getTimePages(now) {
  const todayWindow = getTimeWindow('Hoy', now);
  const weekendWindow = getTimeWindow('Este finde', now);
  const weekWindow = getTimeWindow('Esta semana', now);
  const nextWeekWindow = getTimeWindow('Próxima semana', now);
  const monthWindow = getTimeWindow('Este mes', now);
  const quarterWindow = getTimeWindow('Próximos 3 meses', now);

  const todayLabel = formatMadridLongDay(now);
  const weekendRange = formatMadridLongDayRange(weekendWindow.start, weekendWindow.end);
  const weekRange = formatMadridLongDayRange(weekWindow.start, weekWindow.end);
  const nextWeekRange = formatMadridLongDayRange(nextWeekWindow.start, nextWeekWindow.end);
  const monthLabel = formatMadridMonthYear(now);
  const quarterRange = formatMadridMonthRange(quarterWindow.start, quarterWindow.end);

  return [
    {
      slug: 'hoy',
      path: '/hoy/',
      filterKey: 'Hoy',
      window: todayWindow,
      weekendOnly: false,
      title: 'Qué hacer hoy en Valladolid | Aldea Pucela',
      h1: 'Qué hacer hoy en Valladolid',
      h2: `Planes para hoy, ${todayLabel}`,
      description: `Agenda de eventos en Valladolid para hoy, ${todayLabel}: conciertos, exposiciones, cine, charlas y planes gratis publicados por la comunidad de Aldea Pucela.`
    },
    {
      slug: 'fin-de-semana',
      path: '/fin-de-semana/',
      filterKey: 'Este finde',
      window: weekendWindow,
      weekendOnly: true,
      title: 'Qué hacer este fin de semana en Valladolid | Aldea Pucela',
      h1: 'Qué hacer este fin de semana en Valladolid',
      h2: `Planes culturales para el fin de semana ${weekendRange}`,
      description: `Eventos en Valladolid el fin de semana ${weekendRange}: conciertos, teatro, exposiciones y actividades gratis recopiladas por vecinos en Aldea Pucela.`
    },
    {
      slug: 'esta-semana',
      path: '/esta-semana/',
      filterKey: 'Esta semana',
      window: weekWindow,
      weekendOnly: false,
      title: 'Qué hacer esta semana en Valladolid | Aldea Pucela',
      h1: 'Qué hacer esta semana en Valladolid',
      h2: `Agenda de la semana ${weekRange}`,
      description: `Todos los eventos culturales de la semana ${weekRange} en Valladolid: música, cine, charlas, talleres y planes gratuitos, organizados día a día.`
    },
    {
      slug: 'proxima-semana',
      path: '/proxima-semana/',
      filterKey: 'Próxima semana',
      window: nextWeekWindow,
      weekendOnly: false,
      title: 'Qué hacer la próxima semana en Valladolid | Aldea Pucela',
      h1: 'Qué hacer la próxima semana en Valladolid',
      h2: `Agenda de la semana ${nextWeekRange}`,
      description: `Organiza tus planes con tiempo: eventos en Valladolid la semana ${nextWeekRange}. Conciertos, exposiciones, teatro y actividades para todos los públicos.`
    },
    {
      slug: 'este-mes',
      path: '/este-mes/',
      filterKey: 'Este mes',
      window: monthWindow,
      weekendOnly: false,
      title: 'Qué hacer este mes en Valladolid | Aldea Pucela',
      h1: 'Qué hacer este mes en Valladolid',
      h2: `Eventos en ${monthLabel}`,
      description: `Agenda cultural de Valladolid en ${monthLabel}: conciertos, festivales, exposiciones, cine y talleres publicados por la comunidad de Aldea Pucela.`
    },
    {
      slug: 'proximos-3-meses',
      path: '/proximos-3-meses/',
      filterKey: 'Próximos 3 meses',
      window: quarterWindow,
      weekendOnly: false,
      title: 'Agenda de los próximos 3 meses en Valladolid | Aldea Pucela',
      h1: 'Qué hacer en Valladolid los próximos 3 meses',
      h2: `Eventos ${quarterRange}`,
      description: `Planifica con tiempo: eventos culturales en Valladolid ${quarterRange}. Conciertos, festivales, ferias y exposiciones en una sola agenda vecinal.`
    }
  ];
}
