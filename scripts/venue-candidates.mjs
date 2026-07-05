// Detector de candidatos para la normalización de venues (mitad automática,
// mitad manual): la máquina propone, tú curas el mapa. Lee los eventos
// cacheados, agrupa los lugares por su clave normalizada y saca dos listas:
//
//   1) SIN MAPEAR: lugares que no están en VENUE_CANONICAL_MAP y hoy dependen
//      solo de la heurística. Salen agrupados por clave, con líneas listas
//      para pegar en el mapa tras revisarlas.
//   2) POSIBLES FUSIONES: pares de lugares con nombres parecidos que hoy
//      resuelven a nombres canónicos distintos. Son SUGERENCIAS: algunos son
//      sitios realmente distintos (p. ej. Auditorio vs Centro Cultural), así
//      que la decisión es tuya.
//
// No modifica nada: solo informa. Uso: `node scripts/venue-candidates.mjs`
// (o `npm run venues`). `--json` para salida JSON, `--selfcheck` para el test.
import { loadCachedEvents } from '../src/data/store.mjs';
import { VENUE_CANONICAL_MAP, canonicalizeVenue, normalizeVenueKey } from '../src/data/venue-aliases.mjs';

// Palabras demasiado comunes para indicar por sí solas que dos lugares son el
// mismo (evita falsos positivos del clustering por tokens).
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'lo', 'los', 'las', 'y', 'e', 'en', 'a', 'al', 'con', 'valladolid']);
const MERGE_JACCARD_THRESHOLD = 0.5;
const MAX_MERGE_SUGGESTIONS = 40;

function rawVenueOf(event) {
  return String(event?.venue || event?.location || '').trim();
}

function isExplicitlyMapped(raw, key) {
  return VENUE_CANONICAL_MAP[raw.toLowerCase()] !== undefined || VENUE_CANONICAL_MAP[key] !== undefined;
}

function significantTokens(key) {
  return key.split(' ').filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

// El campo location del origen a veces trae un precio o una nota en vez de un
// lugar (p. ej. "12€", "Desde 18€"). Esos no son candidatos a normalizar como
// venue: los separamos para no ensuciar la lista accionable.
function looksLikeVenue(raw) {
  const value = String(raw || '').trim();
  if (/€/.test(value)) return false;
  if (/^\s*(desde|hasta|entre)?\s*[\d.,]+\s*(€|eur|euros)?\s*$/i.test(value)) return false;
  return /[a-záéíóúñü]{3,}/i.test(value);
}

// Núcleo puro: de una lista de eventos saca { unmapped, possibleMerges }.
export function buildVenueReport(events) {
  // raw string único -> nº de eventos
  const counts = new Map();
  for (const event of events) {
    const raw = rawVenueOf(event);
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }

  // clave normalizada -> info agregada
  const byKey = new Map();
  for (const [raw, count] of counts) {
    const key = normalizeVenueKey(raw);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { key, canonical: canonicalizeVenue(raw), variants: [], totalCount: 0, mappedAny: false });
    }
    const entry = byKey.get(key);
    entry.variants.push({ raw, count });
    entry.totalCount += count;
    if (isExplicitlyMapped(raw, key)) entry.mappedAny = true;
  }

  // (1) Sin mapear: claves sin ninguna entrada explícita en el mapa.
  const unmappedGroups = [...byKey.values()]
    .filter((entry) => !entry.mappedAny)
    .map((entry) => {
      const variants = [...entry.variants].sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw, 'es'));
      // Sugerencia de nombre canónico: la variante más frecuente (desempate: la
      // más larga, luego alfabético). Tú la ajustas antes de pegarla.
      const suggested = [...variants].sort((a, b) =>
        b.count - a.count || b.raw.length - a.raw.length || a.raw.localeCompare(b.raw, 'es')
      )[0].raw;
      return { key: entry.key, suggested, totalCount: entry.totalCount, variants };
    })
    .sort((a, b) => b.totalCount - a.totalCount || a.key.localeCompare(b.key, 'es'));
  // Candidatos reales de lugar vs. ruido (precios/notas coladas en location).
  const unmapped = unmappedGroups.filter((group) => looksLikeVenue(group.suggested));
  const notVenues = unmappedGroups.filter((group) => !looksLikeVenue(group.suggested));

  // (2) Posibles fusiones: pares de claves con tokens significativos solapados
  // que hoy resuelven a canónicos distintos. O(n²) sobre claves únicas (son
  // pocos cientos); si algún día son miles, indexar por token.
  const keyInfos = [...byKey.values()]
    .filter((entry) => looksLikeVenue(entry.canonical))
    .map((entry) => ({
      key: entry.key,
      canonical: entry.canonical,
      tokens: significantTokens(entry.key),
      totalCount: entry.totalCount
    }));
  const possibleMerges = [];
  for (let i = 0; i < keyInfos.length; i += 1) {
    for (let j = i + 1; j < keyInfos.length; j += 1) {
      const a = keyInfos[i];
      const b = keyInfos[j];
      if (a.canonical === b.canonical) continue; // ya fusionados
      const score = jaccard(a.tokens, b.tokens);
      if (score >= MERGE_JACCARD_THRESHOLD) {
        possibleMerges.push({ a: a.canonical, b: b.canonical, score, totalCount: a.totalCount + b.totalCount });
      }
    }
  }
  possibleMerges.sort((x, y) => y.score - x.score || y.totalCount - x.totalCount);

  return { unmapped, notVenues, possibleMerges };
}

function formatReport(report, { totalEvents, uniqueVenues }) {
  const lines = [];
  lines.push('=== Candidatos de normalización de venues ===');
  lines.push(`Eventos: ${totalEvents} · lugares distintos (texto crudo): ${uniqueVenues}`);
  lines.push('');

  lines.push(`## 1) Sin mapear — ${report.unmapped.length} clave(s). Revisa y pega en VENUE_CANONICAL_MAP:`);
  if (!report.unmapped.length) {
    lines.push('  (ninguno: todos los lugares presentes están en el mapa)');
  }
  for (const group of report.unmapped) {
    const variantList = group.variants.map((v) => `"${v.raw}" (${v.count})`).join(', ');
    lines.push(`  • ${group.totalCount}× [${variantList}]`);
    lines.push(`      '${group.key}': '${group.suggested}',`);
  }
  lines.push('');

  if (report.notVenues.length) {
    const noiseCount = report.notVenues.reduce((total, group) => total + group.totalCount, 0);
    lines.push(`## Aviso — ${report.notVenues.length} "lugar(es)" no parecen sitios (${noiseCount} eventos): precio/nota colada en location.`);
    lines.push(`  Ej.: ${report.notVenues.slice(0, 8).map((group) => `"${group.suggested}"`).join(', ')}`);
    lines.push('  (Se excluyen de los candidatos; conviene arreglar el origen o el parseo de location.)');
    lines.push('');
  }

  const shown = report.possibleMerges.slice(0, MAX_MERGE_SUGGESTIONS);
  lines.push(`## 2) Posibles fusiones (revisar; pueden ser sitios distintos) — ${report.possibleMerges.length}:`);
  if (!shown.length) lines.push('  (ninguna sugerencia)');
  for (const pair of shown) {
    lines.push(`  • ¿mismo sitio? "${pair.a}"  ↔  "${pair.b}"  (parecido ${pair.score.toFixed(2)})`);
  }
  if (report.possibleMerges.length > shown.length) {
    lines.push(`  … y ${report.possibleMerges.length - shown.length} más (sube MAX_MERGE_SUGGESTIONS para verlas).`);
  }
  return lines.join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const { events } = await loadCachedEvents();
  const report = buildVenueReport(events);
  const uniqueVenues = new Set(events.map(rawVenueOf).filter(Boolean)).size;
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatReport(report, { totalEvents: events.length, uniqueVenues }));
}

// ponytail: self-check de la lógica de agrupación/clustering con datos sintéticos.
function selfcheck() {
  const sample = [
    { venue: 'Espacio Joven' }, { venue: 'espacio  joven' }, { venue: 'ESPACIO JOVEN' }, // 3 variantes -> 1 grupo sin mapear
    { venue: 'Feria del Libro' }, { venue: 'Feria Libro Antiguo' },                       // parecidos -> posible fusión
    { location: 'Teatro Calderón' },                                                      // mapeado -> no aparece en "sin mapear"
    { venue: '12€' }, { location: 'Desde 18€' },                                          // precios -> a "notVenues", no a candidatos
    { venue: '' }, { venue: null }                                                        // vacíos -> ignorados
  ];
  const { unmapped, notVenues, possibleMerges } = buildVenueReport(sample);

  const joven = unmapped.find((g) => g.key === 'joven');
  console.assert(joven && joven.variants.length === 3 && joven.totalCount === 3, 'debe agrupar las 3 variantes de "Espacio Joven"');
  console.assert(!unmapped.some((g) => g.key === 'calderon'), '"Teatro Calderón" está mapeado: no debe salir sin mapear');
  console.assert(canonicalizeVenue('Teatro Calderón') === 'Teatro Calderón', 'Calderón debe canonicalizar (control del mapa)');
  console.assert(!unmapped.some((g) => /€|^\d+$/.test(g.suggested)), 'los precios no deben salir como candidatos de lugar');
  console.assert(notVenues.some((g) => g.suggested === '12€') && notVenues.some((g) => g.suggested === 'Desde 18€'), 'los precios deben ir a notVenues');
  const feriaMerge = possibleMerges.find((p) => [p.a, p.b].includes('Feria del Libro') && [p.a, p.b].includes('Feria Libro Antiguo'));
  console.assert(feriaMerge, 'debe sugerir fusionar "Feria del Libro" y "Feria Libro Antiguo"');
  console.assert(!possibleMerges.some((p) => p.a === p.b), 'nunca debe sugerir fusionar algo consigo mismo');
  console.assert(!possibleMerges.some((p) => /€/.test(p.a) || /€/.test(p.b)), 'los precios no deben aparecer en fusiones');

  console.log('venue-candidates selfcheck: OK');
}

if (process.argv.includes('--selfcheck')) {
  selfcheck();
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
