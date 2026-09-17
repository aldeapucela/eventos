const STOPWORDS = new Set([
  'a', 'al', 'con', 'como', 'de', 'del', 'desde', 'el', 'en', 'entre',
  'este', 'esta', 'la', 'las', 'los', 'para', 'por', 'que', 'sin', 'sobre',
  'sus', 'un', 'una', 'unos', 'unas', 'y'
]);

const GENERIC_TITLE_WORDS = new Set([
  'actividad', 'charla', 'ciclo', 'cine', 'concierto', 'conferencia',
  'danza', 'dia', 'directo', 'encuentro', 'evento', 'exposicion', 'expo',
  'especial', 'festival', 'feria', 'fiesta', 'gratis', 'gratuita', 'gratuito',
  'infantil', 'jornada', 'libre', 'mercado', 'musica', 'musical', 'noche',
  'presentacion', 'proyeccion', 'sesion', 'teatro', 'taller', 'visita'
]);

export function decodeHtmlEntities(value = '') {
  return String(value)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

export function normalizeComparable(value = '') {
  return decodeHtmlEntities(value)
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemWord(value) {
  return normalizeComparable(value)
    .replace(/ciones$/, 'cion')
    .replace(/siones$/, 'sion')
    .replace(/icos$/, 'ic')
    .replace(/icas$/, 'ic')
    .replace(/ico$/, 'ic')
    .replace(/ica$/, 'ic')
    .replace(/ados$/, 'ad')
    .replace(/adas$/, 'ad')
    .replace(/idos$/, 'id')
    .replace(/idas$/, 'id')
    .replace(/ido$/, 'id')
    .replace(/ida$/, 'id')
    .replace(/os$/, '')
    .replace(/as$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

export function titleTokens(value = '', { distinctive = false } = {}) {
  return [...new Set(
    normalizeComparable(value)
      .split(' ')
      .map(stemWord)
      .filter((word) => word.length > 2)
      .filter((word) => !STOPWORDS.has(word))
      .filter((word) => !distinctive || (word.length >= 4 && !GENERIC_TITLE_WORDS.has(word)))
  )];
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]).size;
  if (!union) return 0;
  return [...a].filter((word) => b.has(word)).length / union;
}

function containedRatio(shortWords, longWords) {
  if (!shortWords.length) return 0;
  const longSet = new Set(longWords);
  return shortWords.filter((word) => longSet.has(word)).length / shortWords.length;
}

function madridParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return {
    dateKey: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute
  };
}

function inputParts(dateValue, timeValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return null;
  const time = String(timeValue || '');
  if (!time) return { dateKey: String(dateValue), minutes: null };
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { dateKey: String(dateValue), minutes: hour * 60 + minute };
}

function eventLocation(event) {
  return [event?.location || event?.venue, event?.address].filter(Boolean).join(' ');
}

function queryLocation(query) {
  return [query?.location, query?.address].filter(Boolean).join(' ');
}

function similarityReason({ exactTitle, sameDate, timeDifference, titleSimilarity, locationSimilarity }) {
  if (exactTitle) return 'Mismo título y misma fecha.';
  if (sameDate && Number.isFinite(timeDifference) && titleSimilarity >= 0.55) {
    return locationSimilarity >= 0.5
      ? 'Título parecido, fecha y lugar coincidentes.'
      : 'Título parecido y fecha y hora próximas.';
  }
  return 'Título parecido y misma fecha.';
}

export function findSimilarEvents(events, query, { limit = 3 } = {}) {
  const title = normalizeComparable(query?.title || '');
  const titleWords = titleTokens(title);
  const distinctiveWords = titleTokens(title, { distinctive: true });
  const input = inputParts(query?.startDate, query?.startTime);
  if (!title || titleWords.length === 0 || !input) return [];

  const approximate = Boolean(query?.startTimeApproximate);
  const maxMinutes = approximate ? 180 : 90;
  const results = [];

  for (const event of Array.isArray(events) ? events : []) {
    const startsAt = madridParts(event?.startsAtIso || event?.startsAt);
    if (!startsAt || startsAt.dateKey !== input.dateKey) continue;

    const eventTitle = normalizeComparable(event?.title || '');
    const eventWords = titleTokens(eventTitle);
    const eventDistinctiveWords = titleTokens(eventTitle, { distinctive: true });
    const exactTitle = Boolean(title && eventTitle && title === eventTitle);
    const titleSimilarity = jaccard(titleWords, eventWords);
    const distinctiveSimilarity = jaccard(distinctiveWords, eventDistinctiveWords);
    const containment = Math.max(
      containedRatio(titleWords, eventWords),
      containedRatio(eventWords, titleWords)
    );
    const distinctiveContainment = Math.max(
      containedRatio(distinctiveWords, eventDistinctiveWords),
      containedRatio(eventDistinctiveWords, distinctiveWords)
    );
    const locationSimilarity = jaccard(
      titleTokens(eventLocation(event)),
      titleTokens(queryLocation(query))
    );
    const timeDifference = Number.isFinite(input.minutes)
      ? Math.abs(startsAt.minutes - input.minutes)
      : null;
    const timeClose = timeDifference === null || timeDifference <= maxMinutes;
    const titleSimilar = titleSimilarity >= 0.55
      || distinctiveSimilarity >= 0.42
      || distinctiveContainment >= 0.75
      || (containment >= 0.8 && distinctiveWords.some((word) => eventDistinctiveWords.includes(word)));

    if (!exactTitle && (!timeClose || !titleSimilar)) continue;

    let score = exactTitle ? 100 : 50 + titleSimilarity * 25 + distinctiveSimilarity * 15;
    if (Number.isFinite(timeDifference)) score += Math.max(0, 15 - timeDifference / 12);
    if (locationSimilarity >= 0.5) score += 10;
    results.push({
      event,
      exactTitle,
      sameDate: true,
      timeDifference,
      titleSimilarity,
      locationSimilarity,
      score,
      reason: similarityReason({
        exactTitle,
        sameDate: true,
        timeDifference,
        titleSimilarity,
        locationSimilarity
      })
    });
  }

  return results
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
