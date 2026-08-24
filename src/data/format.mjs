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

export const DISPLAY_TIMEZONE = 'Europe/Madrid';

export function getMadridDateParts(value) {
  const date = value instanceof Date ? value : parseDateLike(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

export function toMadridDateKey(value) {
  const parts = getMadridDateParts(value);
  if (!parts) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function isSameMadridDay(a, b) {
  const aKey = toMadridDateKey(a);
  const bKey = toMadridDateKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}

export function formatDateTime(value, locale = 'es-ES') {
  if (!value) return '';
  const date = parseDateLike(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
    timeZone: DISPLAY_TIMEZONE
  }).format(date);
}

export function formatDateRange(start, end, locale = 'es-ES', { withYear = false } = {}) {
  if (!start) return '';
  const startDate = parseDateLike(start);
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: DISPLAY_TIMEZONE
  });
  const startLabel = formatter.format(startDate);
  if (!end) return startLabel;
  const endLabel = formatter.format(parseDateLike(end));
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function madridDayMonthFormatter() {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: DISPLAY_TIMEZONE,
    day: 'numeric',
    month: 'long'
  });
}

function madridMonthName(value) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: DISPLAY_TIMEZONE, month: 'long' }).format(
    value instanceof Date ? value : parseDateLike(value)
  );
}

export function formatMadridLongDay(value) {
  const date = value instanceof Date ? value : parseDateLike(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: DISPLAY_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date).replace(',', '');
}

export function formatMadridLongDayRange(start, end) {
  const startParts = getMadridDateParts(start);
  const endParts = getMadridDateParts(end);
  if (!startParts || !endParts) return '';
  const startDate = start instanceof Date ? start : parseDateLike(start);
  const endDate = end instanceof Date ? end : parseDateLike(end);
  if (startParts.year !== endParts.year) {
    return `del ${madridDayMonthFormatter().format(startDate)} de ${startParts.year} al ${madridDayMonthFormatter().format(endDate)} de ${endParts.year}`;
  }
  if (startParts.month !== endParts.month) {
    return `del ${madridDayMonthFormatter().format(startDate)} al ${madridDayMonthFormatter().format(endDate)}`;
  }
  return `del ${startParts.day} al ${endParts.day} de ${madridMonthName(endDate)}`;
}

export function formatMadridMonthYear(value) {
  const parts = getMadridDateParts(value);
  if (!parts) return '';
  return `${madridMonthName(value)} de ${parts.year}`;
}

export function formatMadridMonthRange(start, end) {
  const startParts = getMadridDateParts(start);
  const endParts = getMadridDateParts(end);
  if (!startParts || !endParts) return '';
  if (startParts.year !== endParts.year) {
    return `de ${madridMonthName(start)} de ${startParts.year} a ${madridMonthName(end)} de ${endParts.year}`;
  }
  return `de ${madridMonthName(start)} a ${madridMonthName(end)} de ${endParts.year}`;
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
  const importedFromChatUrl = extractImportedFromChatUrl(html);
  return {
    location: pick('Lugar') || pick('Ubicación') || pinnedLocation || '',
    inferredLocation: locationLine || '',
    categoryLabel: pick('Categoría'),
    organizer: pick('Organizador'),
    notes: pick('Notas'),
    price: normalizePriceLabel(pick('Precio')),
    importedFromChatUrl
  };
}

// "de pago (precio no especificado)" es el valor que escribe el bot cuando no
// encuentra el importe: no dice nada que la ficha no cuente ya con el botón de
// entradas, así que se descarta y el evento se queda sin fila de precio.
const PRICE_UNSPECIFIED_RE = /(?:precio\s+)?no\s+especificad[oa]|sin\s+especificar/i;

export function normalizePriceLabel(value = '') {
  const cleaned = String(value).replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '');
  if (!cleaned || PRICE_UNSPECIFIED_RE.test(cleaned)) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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
  let output = removeBalancedDivs(String(html), /<div[^>]*class="[^"]*\bdiscourse-post-event\b[^"]*"/i);
  output = removeBalancedDivs(output, /<div[^>]*class="[^"]*\blightbox-wrapper\b[^"]*"/i);
  output = output
    .replace(/<p>\s*<img[^>]*alt=":round_pushpin:"[^>]*>\s*([^<]+)\s*<\/p>/gi, '')
    .replace(/<p>\s*(Categor[ií]a|Organizador|Notas|Lugar|Ubicaci[oó]n|Precio)\s*:[\s\S]*?<\/p>/gi, '')
    .replace(/<p>\s*<em>\s*Evento importado desde[\s\S]*?<\/em>\s*<\/p>/gi, '')
    .trim();

  const escapedTitle = escapeRegExp(title.trim());
  if (escapedTitle) {
    output = output.replace(new RegExp(`^<p>${escapedTitle}<\\/p>\\s*`, 'i'), '');
  }
  return dropEmptyBlocks(output);
}

// Discourse anida divs dentro de `lightbox-wrapper` (el `.meta` del pie), así
// que un regex no balanceado corta en el primer `</div>` y deja el resto del
// cartel suelto en mitad del texto. Recortamos contando aperturas y cierres.
function removeBalancedDivs(html, openTagRe) {
  let output = String(html);
  for (let guard = 0; guard < 50; guard += 1) {
    const start = output.search(openTagRe);
    if (start === -1) break;
    const end = findDivBlockEnd(output, start);
    if (end === -1) break;
    output = `${output.slice(0, start)}${output.slice(end)}`;
  }
  return output;
}

function findDivBlockEnd(html, start) {
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let match = tagRe.exec(html);
  while (match) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return tagRe.lastIndex;
    match = tagRe.exec(html);
  }
  return -1;
}

// Al quitar el cartel y las líneas de metadatos quedan `<p>` vacíos y huecos de
// varias líneas en blanco. Daban igual mientras la ficha solo pintaba el
// resumen; ahora que renderiza la descripción entera, se verían.
function dropEmptyBlocks(html = '') {
  return String(html)
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/<p>(?:\s*<br\s*\/?>)+/gi, '<p>')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function buildTextParagraphHtml(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
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

function extractImportedFromChatUrl(html = '') {
  const content = String(html);
  const importBlockMatch = content.match(/<p>\s*<em>\s*Evento importado desde[\s\S]*?<\/em>\s*<\/p>/i);
  if (!importBlockMatch) return '';
  const hrefMatch = importBlockMatch[0].match(/href="([^"]+)"/i);
  if (!hrefMatch?.[1]) return '';
  return decodeHtmlEntities(hrefMatch[1]).trim();
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
