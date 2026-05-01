export function stripTags(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeHtmlEntities(value = '') {
  return String(value)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toSlug(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDateTime(value, locale = 'es-ES') {
  if (!value) return '';
  const date = parseDateLike(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined
  }).format(date);
}

export function formatDateRange(start, end, locale = 'es-ES') {
  if (!start) return '';
  const startDate = parseDateLike(start);
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const startLabel = formatter.format(startDate);
  if (!end) return startLabel;
  const endLabel = formatter.format(parseDateLike(end));
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

export function normalizeImage(imageUrl) {
  if (!imageUrl) return null;
  return imageUrl;
}

export function parseEventMetaFromHtml(html = '') {
  const lines = extractParagraphLines(html);
  const pick = (label) => {
    const line = lines.find((entry) => entry.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return line ? line.slice(label.length + 1).trim() : '';
  };
  const pinMatch = String(html).match(/<p>\s*<img[^>]*alt=":round_pushpin:"[^>]*>\s*([^<]+)<\/p>/i);
  const pinnedLocation = pinMatch ? decodeHtmlEntities(pinMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const locationLine = lines.find((entry) => !entry.includes(':') && isLikelyLocationLine(entry));
  return {
    location: pick('Lugar') || pick('Ubicación') || pinnedLocation || locationLine || '',
    categoryLabel: pick('Categoría'),
    organizer: pick('Organizador'),
    notes: pick('Notas')
  };
}

export function buildExcerpt(html = '', maxLength = 180) {
  const text = stripTags(html);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

export function extractParagraphLines(html = '') {
  const normalized = String(html)
    .replace(/<div class="discourse-post-event"[\s\S]*?<\/div>/gi, '\n')
    .replace(/<div class="lightbox-wrapper"[\s\S]*?<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<img[^>]*alt=":round_pushpin:"[^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<a [^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((line) => decodeHtmlEntities(line).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return normalized.filter((line) => !isBoilerplateLine(line));
}

export function cleanDescriptionHtml(html = '', title = '') {
  let output = String(html)
    .replace(/<div class="discourse-post-event"[\s\S]*?<\/div>/gi, '')
    .replace(/<p>\s*<div class="lightbox-wrapper"[\s\S]*?<\/div>\s*<\/p>/gi, '')
    .replace(/<p>\s*<img[^>]*alt=":round_pushpin:"[^>]*>\s*([^<]+)\s*<\/p>/gi, '')
    .replace(/<p>\s*(Categor[ií]a|Organizador|Notas|Lugar|Ubicaci[oó]n)\s*:[\s\S]*?<\/p>/gi, '')
    .replace(/<p>\s*<em>\s*Evento importado desde[\s\S]*?<\/em>\s*<\/p>/gi, '')
    .trim();

  const escapedTitle = escapeRegExp(title.trim());
  if (escapedTitle) {
    output = output.replace(new RegExp(`^<p>${escapedTitle}<\\/p>\\s*`, 'i'), '');
  }
  return output.trim();
}

export function titleCase(value = '') {
  return String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isLikelyLocationLine(line) {
  const value = line.toLowerCase();
  return value.length <= 80 && !value.startsWith('evento importado') && !/\bkb\b|\d{2,4}x\d{2,4}/i.test(value);
}

function isBoilerplateLine(line) {
  const value = line.toLowerCase();
  return value.includes('evento importado desde') || /\b\d{2,4}x\d{2,4}\b/.test(value) || /\b\d+(\.\d+)?\s*kb\b/i.test(value);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseDateLike(value) {
  if (!value) return new Date(value);
  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(stringValue);
}
