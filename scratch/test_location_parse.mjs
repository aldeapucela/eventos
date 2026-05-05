import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'cache', 'data');

// ─── Improved Heuristics v3 ─────────────────────────────────────────────────

/**
 * Address-marker patterns (Spanish street vocabulary).
 * Returns the match index in the string, or -1.
 */
const ADDRESS_MARKERS = [
  /\bCalle\b/i,
  /\bC\/\s/i,
  /\bC\.\s+[A-ZÁÉÍÓÚÑ]/,        // "C. Vega"
  /\bAvda?\.?\s/i,               // Avda, Av
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
  /\bn\.\s*\d+/i,
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

function findAddressStart(value) {
  let earliest = -1;
  for (const re of ADDRESS_MARKERS) {
    const m = re.exec(value);
    if (m && (earliest === -1 || m.index < earliest)) {
      earliest = m.index;
    }
  }
  return earliest;
}

/** Remove duplicated chunks: "Plaza Mayor Plaza Mayor" → "Plaza Mayor" */
function deduplicate(value) {
  const half = Math.floor(value.length / 2);
  for (let len = half; len >= 8; len--) {
    const candidate = value.slice(0, len).trim();
    const rest = value.slice(len).trim();
    if (rest.startsWith(candidate) || candidate === rest) {
      return { text: candidate, wasDuped: true };
    }
  }
  return { text: value, wasDuped: false };
}

/** Detect "Desde X€" price strings that are misused as location */
function isPrice(value) {
  return STANDALONE_PRICE_RE.test(value.trim());
}

function isDateLikeLead(value) {
  return (/^\d{1,2}\s+(?:de\s+)?/i.test(value) && MONTHS_RE.test(value)) || WEEKDAY_RE.test(value);
}

function looksLikeNarrativeIntro(value) {
  if (!EVENT_WORDS_RE.test(value)) return false;
  if (/\b(con|para|que|se |domingo|s[áa]bado|viernes|jueves|mi[eé]rcoles|martes|lunes)\b/i.test(value)) return true;
  return value.length > 55;
}

function normalizeWord(word) {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function tokenLooksLikeStreet(word) {
  const normalized = normalizeWord(word);
  return STREET_NAME_TOKENS.has(normalized) || ['de', 'del', 'la', 'las', 'los', 'y'].includes(normalized);
}

function trimVenueArtifacts(value) {
  return value
    .replace(/\s+(av|avda)\.?$/i, '')
    .replace(/\s*-\s*$/i, '')
    .trim();
}

function normalizeAddressPrefix(value) {
  let next = value.trim();
  if (/^cerros\b/i.test(next)) {
    next = `Av. ${next}`;
  }
  return next;
}

function collapseRepeatedAddressPhrase(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const repeated = normalized.match(/^(.+?)\s+\1(?:\s+|,\s*)(.+)$/i);
  if (!repeated) return normalized;
  return `${repeated[1]} ${repeated[2]}`.trim();
}

function removeAddressEchoFromVenue(venue, address) {
  const venueParts = venue.split(/\s+-\s+/);
  if (venueParts.length < 2) return venue;

  const suffix = venueParts[venueParts.length - 1].trim().toLowerCase();
  const addressLower = address.trim().toLowerCase();
  if (!suffix || !addressLower.startsWith(suffix)) return venue;

  return venueParts.slice(0, -1).join(' - ').trim();
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

  if (streetStart > 0 && tokenLooksLikeStreet(tokens[streetStart - 1])) {
    while (streetStart > 0 && tokenLooksLikeStreet(tokens[streetStart - 1])) {
      streetStart -= 1;
    }
  }

  const venueTokens = tokens.slice(0, streetStart);
  const streetTokens = tokens.slice(streetStart);
  if (venueTokens.length < 2) return null;

  const venue = trimVenueArtifacts(venueTokens.join(' ').trim());
  if (!VENUE_CUE_RE.test(venue)) return null;

  const address = normalizeAddressPrefix(`${streetTokens.join(' ')} ${value.slice(value.lastIndexOf(number)).trim()}`.trim());
  if (address.split(/\s+/).length < 2) return null;

  const cleanedVenue = removeAddressEchoFromVenue(venue, address);

  return { venueName: cleanedVenue, venueAddress: address, tag: 'split (tail)' };
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

/** Detect raw Google Maps URLs and extract the place name from them */
function extractGoogleMapsVenue(value) {
  const m = value.match(/maps\.google\.[^/]*\/maps\/place\/([^/@ ]+)/i)
    || value.match(/google\.[^/]*\/maps\/place\/([^/@ ]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/\+/g, ' ');
  } catch {
    return m[1];
  }
}

/**
 * Returns true if the string looks like narrative prose rather than a venue.
 * v2: Only mark as narrative if it has clear sentence-markers (verbs, relative pronouns)
 * NOT just because it's long.
 */
/** Returns true if value looks like it's the same as the event title */
function looksLikeTitle(value, title) {
  const clean = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean(value) === clean(title);
}

/**
 * Main parse function — v3.
 * Returns { venueName, venueAddress, tag }
 */
function parseLocationParts(raw = '', eventTitle = '') {
  const value = String(raw).replace(/\s+/g, ' ').trim();
  if (!value) return { venueName: '', venueAddress: '', tag: 'empty' };

  // 0. Google Maps URL
  const gmapsVenue = extractGoogleMapsVenue(value);
  if (gmapsVenue) {
    return { venueName: gmapsVenue, venueAddress: '', tag: 'gmaps-url' };
  }

  // 1. Deduplicate repeated chunks
  const { text: deduped, wasDuped } = deduplicate(value);
  const collapsed = collapseRepeatedAddressPhrase(deduped);

  const kind = classifyLocation(collapsed, eventTitle);
  if (kind === 'ignore') {
    return { venueName: '', venueAddress: '', tag: `ignored: narrative/price` };
  }
  if (kind === 'ignore-title') {
    return { venueName: '', venueAddress: '', tag: 'ignored: same as title' };
  }
  if (kind === 'address-only') {
    return { venueName: '', venueAddress: collapsed, tag: 'address only' };
  }
  if (kind === 'narrative') {
    const extracted = extractVenueFromNarrative(collapsed);
    if (extracted) return extracted;
    return { venueName: '', venueAddress: '', tag: 'ignored: narrative/price' };
  }

  const markerIdx = findAddressStart(collapsed);

  if (markerIdx === 0) {
    return { venueName: '', venueAddress: collapsed, tag: 'address only' };
  }

  if (markerIdx > 0) {
    const venueName = trimVenueArtifacts(collapsed.slice(0, markerIdx).replace(/[,\s]+$/, '').trim());
    const venueAddress = normalizeAddressPrefix(collapsed.slice(markerIdx).trim());
    return {
      venueName,
      venueAddress,
      tag: wasDuped ? 'split (deduped)' : 'split'
    };
  }

  const trailingSplit = splitTrailingStreetAddress(collapsed);
  if (trailingSplit) return trailingSplit;

  return { venueName: collapsed, venueAddress: '', tag: wasDuped ? 'venue (deduped)' : 'venue' };
}

// ─── Run against all cached events ─────────────────────────────────────────

const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
const results = [];

for (const file of files) {
  const event = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
  if (!event.location) continue;
  const parsed = parseLocationParts(event.location, event.title);
  results.push({
    id: event.id,
    title: event.title,
    original: event.location,
    ...parsed
  });
}

// ─── Pretty table output ────────────────────────────────────────────────────

const col = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
const COLS = { orig: 52, venue: 30, addr: 35, tag: 20 };

const header = `${ col('LOCATION ORIGINAL', COLS.orig) } | ${ col('venueName', COLS.venue) } | ${ col('venueAddress', COLS.addr) } | TAG`;
const divider = '-'.repeat(header.length);

console.log('\n' + header);
console.log(divider);

// Sort: splits first, then venue-only, then ignored
const sortKey = (r) => r.tag.startsWith('split') ? 0 : r.tag.startsWith('venue') ? 1 : r.tag.startsWith('ignored') ? 3 : 2;
results.sort((a, b) => sortKey(a) - sortKey(b));

for (const r of results) {
  console.log(`${ col(r.original, COLS.orig) } | ${ col(r.venueName, COLS.venue) } | ${ col(r.venueAddress, COLS.addr) } | ${ r.tag }`);
}

// ─── Summary ────────────────────────────────────────────────────────────────
const byTag = {};
for (const r of results) {
  const k = r.tag.startsWith('ignored') ? r.tag : r.tag;
  byTag[k] = (byTag[k] || 0) + 1;
}

console.log('\n=== SUMMARY ===');
for (const [k, v] of Object.entries(byTag).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
console.log(`\n  Total: ${results.length}`);
const detected = results.filter(r => r.venueName || r.venueAddress).length;
console.log(`  Con venue o address: ${detected} (${Math.round(detected/results.length*100)}%)`);
