import {
  buildExcerpt,
  cleanDescriptionHtml,
  extractParagraphLines,
  normalizeImage,
  parseEventMetaFromHtml,
  titleCase,
  toSlug
} from './format.mjs';

export const CATEGORY_URL = 'https://foro.aldeapucela.org/c/eventos/6.json';
export const FORUM_BASE = 'https://foro.aldeapucela.org';
const ADDRESS_MARKERS = [
  /\bCalle\b/i,
  /\bC\/\s/i,
  /\bC\/(?=[A-ZÁÉÍÓÚÑ])/,
  /\bC\.\s+[A-ZÁÉÍÓÚÑ]/,
  /\bAvda?\.?\s/i,
  /\bAvenida\b/i,
  /\bPaseo\b/i,
  /\bCamino\b/i,
  /\bCarretera\b/i,
  /\bRonda\b/i,
  /\bTraves[ií]a\b/i,
  /\bCallejón\b/i,
  /\bBulevar\b/i,
  /\bPza\.?\s/i,
  /\bnº\s*\d+/i,
  /\bn\.\s*\d+/i
];
const CONTEXTUAL_ADDRESS_MARKERS = [
  /\b[Pp]laza\s+(?:(?:de|del)\s+)?(?:la\s+|las\s+|los\s+)?[A-ZÁÉÍÓÚÑ]/,
  /\b[Aa]cera\s+de\b/,
  /\besquina\s+calle\b/
];
const MONTHS_RE = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const WEEKDAY_RE = /\b(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[áa]bado|sabado|domingo)\b/i;
const EVENT_WORDS_RE = /^(concierto|vermut|taller|charla|debate|presentaci[oó]n|festival|jornada|encuentro|proyecci[oó]n|cine|teatro|exposici[oó]n|muestra|coloquio|grabaci[oó]n|donaci[oó]n|ruta|acto|mercado)\b/i;
const FREE_OR_META_RE = /^(sin coste|gratis|gratuito|gratuita|resumen(?: del directo)?|video del evento|grabaci[oó]n en audio|[¡"]*agenda esta fecha!?[”"]*)$/i;
const STANDALONE_PRICE_RE = /^(?:desde\s+)?\d+(?:[.,]\d{1,2})?\s*€(?:\s*(?:ant\.?|taq\.?|euros?))?$/i;
const VENUE_CUE_RE = /\b(sala|teatro|csa|biblioteca|librer[íi]a|caf[eé]|bar|taberna|centro|espacio|museo|patio|archivo|jard[ií]n|federaci[oó]n|sede|paraninfo|casa|auditorio|records|club|terraza|facultad|cines|iglesia|skateplaza|academia)\b/i;
const STREET_NAME_TOKENS = new Set([
  'juan', 'mambrilla', 'mariano', 'cobos', 'puente', 'colgante', 'eucalipto', 'empecinado',
  'vega', 'olmo', 'cerros', 'salvador', 'chancilleria', 'chancillería', 'teofanes', 'teófanes',
  'egido', 'arribas', 'clavel', 'real', 'laguna', 'santa', 'cruz', 'fabio', 'nelli',
  'monasterio', 'paular', 'serrania', 'serranía', 'ronda', 'maribel', 'mirabel'
]);
const ADDRESS_ONLY_RE = /^(?:calle\s+|c\/\s*|c\.\s+|av(?:da|enida)?\.?\s+|paseo\s+|camino\s+|carretera\s+|ronda\s+|traves[ií]a\s+).+/i;
const TRAILING_NUMBER_RE = /(?:^|[\s,])(\d{1,4}[A-Z]?)(?:[\s,].*)?$/;

export async function fetchJson(url) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AldeaPucelaEventos/1.0'
      }
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get('retry-after') || '0');
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 1500;
      await sleep(waitMs);
      continue;
    }

    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}${body ? `\n${body.slice(0, 200)}` : ''}`);
  }
}

export async function fetchCategoryTopics() {
  const topics = [];
  const seen = new Set();
  let nextUrl = CATEGORY_URL;

  while (nextUrl) {
    const json = await fetchJson(nextUrl);
    const pageTopics = json.topic_list?.topics ?? [];
    for (const topic of pageTopics) {
      if (!seen.has(topic.id)) {
        seen.add(topic.id);
        topics.push(topic);
      }
    }

    const moreTopicsUrl = json.topic_list?.more_topics_url || null;
    nextUrl = moreTopicsUrl ? toJsonUrl(`${FORUM_BASE}${moreTopicsUrl}`) : null;
  }

  return topics;
}

function toJsonUrl(url) {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith('.json')) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}.json`;
  }
  return parsed.toString();
}

export async function fetchTopicDetail(slug, id) {
  return fetchJson(`${FORUM_BASE}/t/${slug}/${id}.json`);
}

export function shouldSkipTopic(topic) {
  return !topic?.event_starts_at || !topic?.visible || topic?.pinned || topic?.title === 'Acerca de esta categoría y cómo añadir eventos';
}

export function topicSignature(topic) {
  return [
    topic.id,
    topic.slug,
    topic.last_posted_at,
    topic.image_url || '',
    topic.event_starts_at || '',
    topic.event_ends_at || ''
  ].join('|');
}

export function normalizeDiscourseTopic(topic, detail) {
  const detailPost = detail?.post_stream?.posts?.[0];
  const event = detailPost?.event || {};
  const rawHtml = detailPost?.cooked || '';
  const meta = parseEventMetaFromHtml(rawHtml);
  const image = normalizeImage(topic.image_url || detail?.image_url || detail?.thumbnails?.[0]?.url || null);
  const title = topic.title || detail?.title || '';
  const slug = topic.slug || toSlug(title);
  const startsAt = event.starts_at || topic.event_starts_at || null;
  const endsAt = event.ends_at || topic.event_ends_at || null;
  const lines = extractParagraphLines(rawHtml);
  const summary = extractSummary(lines, title);
  const descriptionHtml = cleanDescriptionHtml(rawHtml, title);
  const categoryLabel = normalizeCategory(meta.categoryLabel);
  const location = normalizeLocation(meta.location || event.location || '', title);
  const parsedLocation = parseLocationParts(location, title);
  const organizer = meta.organizer || '';
  const notes = meta.notes || '';
  const importedFromChatUrl = meta.importedFromChatUrl || '';

  return {
    id: topic.id,
    slug,
    urlPath: `/e/${topic.id}/${slug}`,
    sourceUrl: `${FORUM_BASE}/t/${slug}/${topic.id}`,
    title,
    excerpt: buildExcerpt(summary || descriptionHtml, 160),
    summary,
    descriptionHtml,
    image,
    startsAt,
    endsAt,
    timezone: event.timezone || 'Europe/Madrid',
    location,
    venue: parsedLocation.venueName,
    address: parsedLocation.venueAddress,
    categoryLabel,
    organizer,
    notes,
    importedFromChatUrl,
    isSticky: Boolean(topic.pinned || topic.pinned_globally || topic.featured_link),
    isFree: detectIsFree(`${summary} ${notes} ${rawHtml}`),
    publishedAt: topic.created_at || detailPost?.created_at || detail?.created_at || '',
    updatedAt: topic.last_posted_at || detailPost?.updated_at || topic.created_at || ''
  };
}

function detectIsFree(text = '') {
  const content = String(text);
  const explicitFree = /\bgratis\b|\bgratuit[oa]s?\b|\bentrada libre\b|\blibre acceso\b/i.test(content);
  if (explicitFree) return true;

  const explicitPaid = /\b(precio|coste|costo|taquilla|ticket|abono|pago|venta de entradas?|entradas?)\b/i.test(content) ||
    /\b(enterticket|wegow|dice|ticketmaster|elcorteingles|notikumi)\b/i.test(content) ||
    /(\d+[\.,]?\d*)\s?(€|euros?)\b/i.test(content) ||
    /(€)\s?(\d+[\.,]?\d*)\b/i.test(content);
  if (explicitPaid) return false;

  // En contexto local la mayoría son gratuitos: asumimos gratis si no hay evidencia de pago.
  return true;
}

export function normalizeDetailToRecord(topic, detail) {
  const normalized = normalizeDiscourseTopic(topic, detail);
  return {
    ...normalized,
    signature: topicSignature(topic)
  };
}

function extractSummary(lines, title) {
  const normalizedTitle = title.trim().toLowerCase();
  const candidates = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower === normalizedTitle) return false;
    if (lower.startsWith('categoría:') || lower.startsWith('organizador:') || lower.startsWith('notas:')) return false;
    if (line.length < 24) return false;
    return true;
  });

  return candidates[0] || '';
}

function normalizeCategory(value) {
  if (!value) return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const map = {
    charla: 'Charlas',
    concierto: 'Musica',
    cine: 'Cine',
    exposicion: 'Exposicion',
    exposición: 'Exposicion',
    festival: 'Festival',
    literatura: 'Literatura',
    taller: 'Talleres',
    debate: 'Charlas'
  };
  const key = cleaned.toLowerCase();
  return map[key] || titleCase(cleaned);
}

function normalizeLocation(value, title) {
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.toLowerCase() === String(title).trim().toLowerCase()) return '';
  return cleaned;
}

function parseLocationParts(raw = '', eventTitle = '') {
  const value = String(raw).replace(/\s+/g, ' ').trim();
  if (!value) return { venueName: '', venueAddress: '', tag: 'empty' };

  const gmapsVenue = extractGoogleMapsVenue(value);
  if (gmapsVenue) {
    return { venueName: gmapsVenue, venueAddress: '', tag: 'gmaps-url' };
  }

  const { text: deduped, wasDuped } = deduplicate(value);
  const collapsed = collapseRepeatedAddressPhrase(deduped);
  const kind = classifyLocation(collapsed, eventTitle);

  if (kind === 'ignore' || kind === 'ignore-title') {
    return { venueName: '', venueAddress: '', tag: kind };
  }

  if (kind === 'address-only') {
    return { venueName: '', venueAddress: collapsed, tag: 'address only' };
  }

  if (kind === 'narrative') {
    const extracted = extractVenueFromNarrative(collapsed);
    return extracted || { venueName: '', venueAddress: '', tag: 'ignored: narrative/price' };
  }

  const markerIdx = findAddressStart(collapsed);
  if (markerIdx === 0) {
    return { venueName: '', venueAddress: collapsed, tag: 'address only' };
  }

  if (markerIdx > 0) {
    return {
      venueName: sanitizeVenueName(trimVenueArtifacts(collapsed.slice(0, markerIdx).replace(/[,\s]+$/, '').trim())),
      venueAddress: normalizeAddressPrefix(collapsed.slice(markerIdx).trim()),
      tag: wasDuped ? 'split (deduped)' : 'split'
    };
  }

  const trailingSplit = splitTrailingStreetAddress(collapsed);
  if (trailingSplit) return trailingSplit;

  if (looksLikeStreetOnly(collapsed)) {
    return { venueName: '', venueAddress: collapsed, tag: 'address only' };
  }

  return { venueName: sanitizeVenueName(collapsed), venueAddress: '', tag: wasDuped ? 'venue (deduped)' : 'venue' };
}

function classifyLocation(value, eventTitle) {
  if (!value) return 'empty';
  if (isPrice(value) || FREE_OR_META_RE.test(value.trim())) return 'ignore';
  if (looksLikeTitle(value, eventTitle)) return 'ignore-title';
  if (isDateLikeLead(value)) return 'ignore';
  if (/\b(se presentará|se celebra|se realiza|tendrá lugar|está ubicad|podrás|puedes)\b/i.test(value)) return 'narrative';
  if (looksLikeNarrativeIntro(value)) return 'narrative';
  if (/^en\b/i.test(value)) return 'narrative';
  if (ADDRESS_ONLY_RE.test(value) && !VENUE_CUE_RE.test(value)) return 'address-only';
  return 'candidate';
}

function findAddressStart(value) {
  let earliest = -1;
  for (const re of ADDRESS_MARKERS) {
    const match = re.exec(value);
    if (match && (earliest === -1 || match.index < earliest)) {
      earliest = match.index;
    }
  }
  for (const re of CONTEXTUAL_ADDRESS_MARKERS) {
    const match = re.exec(value);
    if (match && match.index > 0 && (earliest === -1 || match.index < earliest)) {
      earliest = match.index;
    }
  }
  return earliest;
}

function splitTrailingStreetAddress(value) {
  const match = value.match(TRAILING_NUMBER_RE);
  if (!match) return null;

  const number = match[1];
  const beforeNumber = value.slice(0, value.lastIndexOf(number)).trim().replace(/,$/, '').trim();
  if (!beforeNumber) return null;

  const tokens = beforeNumber.split(/\s+/);
  if (tokens.length < 3) return null;

  let streetStart = -1;
  for (let i = tokens.length - 1; i >= 1; i -= 1) {
    if (!tokenLooksLikeStreet(tokens[i])) break;
    streetStart = i;
  }
  if (streetStart === -1) return null;

  while (streetStart > 0 && tokenLooksLikeStreet(tokens[streetStart - 1])) {
    streetStart -= 1;
  }

  const venue = trimVenueArtifacts(tokens.slice(0, streetStart).join(' ').trim());
  if (venue.split(/\s+/).length < 2 || !VENUE_CUE_RE.test(venue)) return null;

  const address = normalizeAddressPrefix(`${tokens.slice(streetStart).join(' ')} ${value.slice(value.lastIndexOf(number)).trim()}`.trim());
  if (address.split(/\s+/).length < 2) return null;

  return {
    venueName: sanitizeVenueName(removeAddressEchoFromVenue(venue, address)),
    venueAddress: address,
    tag: 'split (tail)'
  };
}

function extractVenueFromNarrative(value) {
  const match = value.match(/\ben\s+(.+?)(?:\s+\b(con|para|que|donde|cuando|el|la|los|las)\b.*)?$/i);
  if (!match) return null;

  const candidate = match[1].trim().replace(/[.,;:!?]+$/, '');
  if (!candidate || candidate.length < 3) return null;
  if (isPrice(candidate) || isDateLikeLead(candidate)) return null;
  if (candidate.split(/\s+/).length > 7) return null;

  return { venueName: candidate, venueAddress: '', tag: 'venue (from en)' };
}

function looksLikeStreetOnly(value) {
  if (!/,\s*\d{1,4}[A-Z]?$/.test(value)) return false;
  const street = value.replace(/,\s*\d{1,4}[A-Z]?$/, '').trim();
  if (!street) return false;
  return street.split(/\s+/).every((token) => tokenLooksLikeStreet(token));
}

function looksLikeNarrativeIntro(value) {
  if (!EVENT_WORDS_RE.test(value)) return false;
  if (/\b(con|para|que|se |domingo|s[áa]bado|viernes|jueves|mi[eé]rcoles|martes|lunes)\b/i.test(value)) return true;
  return value.length > 55;
}

function isDateLikeLead(value) {
  return (/^\d{1,2}\s+(?:de\s+)?/i.test(value) && MONTHS_RE.test(value)) || WEEKDAY_RE.test(value);
}

function isPrice(value) {
  return STANDALONE_PRICE_RE.test(value.trim());
}

function looksLikeTitle(value, title) {
  const clean = (input) => input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean(value) === clean(title);
}

function deduplicate(value) {
  const half = Math.floor(value.length / 2);
  for (let len = half; len >= 8; len -= 1) {
    const candidate = value.slice(0, len).trim();
    const rest = value.slice(len).trim();
    if (rest.startsWith(candidate) || candidate === rest) {
      return { text: candidate, wasDuped: true };
    }
  }
  return { text: value, wasDuped: false };
}

function extractGoogleMapsVenue(value) {
  const match = value.match(/maps\.google\.[^/]*\/maps\/place\/([^/@ ]+)/i) ||
    value.match(/google\.[^/]*\/maps\/place\/([^/@ ]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\+/g, ' ');
  } catch {
    return match[1];
  }
}

function collapseRepeatedAddressPhrase(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const repeated = normalized.match(/^(.+?)\s+\1(?:\s+|,\s*)(.+)$/i);
  if (!repeated) return normalized;
  return `${repeated[1]} ${repeated[2]}`.trim();
}

function removeAddressEchoFromVenue(venue, address) {
  const venueParts = venue.split(/\s+-\s+/);
  if (venueParts.length >= 2) {
    const suffix = venueParts[venueParts.length - 1].trim().toLowerCase();
    const addressLower = address.trim().toLowerCase();
    if (suffix && addressLower.startsWith(suffix)) {
      return venueParts.slice(0, -1).join(' - ').trim();
    }
    const suffixWithoutPlaza = suffix.replace(/^plaza\s+/, '');
    if (suffixWithoutPlaza && addressLower.startsWith(suffixWithoutPlaza)) {
      return venueParts.slice(0, -1).join(' - ').trim();
    }
  }

  if (/\s+plaza$/i.test(venue) && /^(?:de|del|de la|de las|de los)\b/i.test(address.trim())) {
    return venue.replace(/\s+plaza$/i, '').trim();
  }

  return venue;
}

function sanitizeVenueName(value) {
  let next = value.trim();
  next = next.replace(/\s+y$/i, '').trim();
  next = next.replace(/\s+esquina$/i, '').trim();
  next = next.replace(/\($/, '').trim();

  const parenthetical = next.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenthetical && looksAddressLikeFragment(parenthetical[2])) {
    next = parenthetical[1].trim();
  }

  return next;
}

function trimVenueArtifacts(value) {
  return value.replace(/\s+(av|avda)\.?$/i, '').replace(/\s*-\s*$/i, '').trim();
}

function normalizeAddressPrefix(value) {
  let next = value.trim();
  if (/^cerros\b/i.test(next)) {
    next = `Av. ${next}`;
  }
  next = next.replace(/\)\s+y\s+/g, ' y ');
  const duplicatedPair = next.match(/^(.+?)\s+y\s+(.+?)\s+\1\s+y\s+\2$/i);
  if (duplicatedPair) {
    next = `${duplicatedPair[1]} y ${duplicatedPair[2]}`;
  }
  next = collapseRepeatedAddressPhrase(next);
  const opens = (next.match(/\(/g) || []).length;
  const closes = (next.match(/\)/g) || []).length;
  if (closes > opens) {
    next = next.replace(/\)+$/g, '').trim();
  }
  return next;
}

function tokenLooksLikeStreet(word) {
  const normalized = normalizeWord(word);
  return STREET_NAME_TOKENS.has(normalized) || ['de', 'del', 'la', 'las', 'los', 'y'].includes(normalized);
}

function looksAddressLikeFragment(value) {
  return /\b(acera|plaza|calle|c\/|c\.|avenida|av\.?|paseo|camino|carretera|ronda|traves[ií]a)\b/i.test(value) ||
    /\d/.test(value);
}

function normalizeWord(word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
