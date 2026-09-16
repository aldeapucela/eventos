import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCategoryTopics, fetchJson, fetchTopicDetail, firstPostUpdatedAt, FORUM_BASE, normalizeDetailToRecord, shouldSkipTopic, sleep, topicSignature } from '../src/data/discourse.mjs';
import { ensureCacheDirs, readIndex, writeCachedTopic, writeIndex } from '../src/data/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_SCHEMA_VERSION = 3;
const FETCH_PAUSE_MS = 400;
const MISSING_CACHE_PROBE_LIMIT = 20;
const cacheDataDir = path.join(root, 'cache', 'data');
const cacheRawDir = path.join(root, 'cache', 'raw');

export function normalizeRefreshTopicIds(value = []) {
  const values = value instanceof Set
    ? [...value]
    : Array.isArray(value)
      ? value
      : String(value || '').split(/[\s,]+/);
  return new Set(values
    .map((id) => String(id ?? '').trim())
    .filter((id) => /^\d+$/.test(id)));
}

export function shouldRefreshTopic(topicId, refreshTopicIds) {
  return normalizeRefreshTopicIds(refreshTopicIds).has(String(topicId));
}

// Convierte el detalle directo de Discourse en la proyección mínima que
// normalmente llega dentro de topic_list. Se usa solo para IDs forzados que
// el índice/paginación de la categoría haya omitido; no amplía el listado
// normal ni vuelve a descargar todos los eventos.
export function topicFromDetail(detail) {
  return {
    id: detail?.id,
    slug: detail?.slug,
    title: detail?.title,
    category_id: detail?.category_id,
    created_at: detail?.created_at,
    last_posted_at: detail?.last_posted_at,
    bumped_at: detail?.bumped_at,
    updated_at: detail?.updated_at,
    image_url: detail?.image_url,
    event_starts_at: detail?.event_starts_at,
    event_ends_at: detail?.event_ends_at,
    visible: detail?.visible !== false,
    pinned: Boolean(detail?.pinned || detail?.pinned_globally),
    featured_link: detail?.featured_link || ''
  };
}

async function addForcedTopicsMissingFromCategory(topics, forcedRefreshIds) {
  const knownIds = new Set(topics.map((topic) => String(topic.id)));
  const recovered = [];

  for (const topicId of forcedRefreshIds) {
    const normalizedId = String(topicId);
    if (knownIds.has(normalizedId)) continue;

    // /t/:id.json resuelve el slug actual en Discourse y evita depender de
    // una entrada de caché que puede haber sido retirada en un deploy previo.
    const detail = await fetchJson(`${FORUM_BASE}/t/${normalizedId}.json`);
    const topic = topicFromDetail(detail);
    if (topic.id && topic.category_id === 6 && !shouldSkipTopic(topic)) {
      recovered.push(topic);
      knownIds.add(normalizedId);
    }
  }

  return [...topics, ...recovered];
}

async function recoverCachedTopicsMissingFromCategory(topics, index) {
  const listedIds = new Set(topics.map((topic) => String(topic.id)));
  const missing = Object.entries(index.topics || {})
    .filter(([topicId]) => !listedIds.has(String(topicId)));

  if (missing.length > MISSING_CACHE_PROBE_LIMIT) {
    throw new Error(`La categoría de Discourse omitió ${missing.length} temas que estaban en caché; se detiene el build para no borrar la caché en masa`);
  }

  const recovered = [];
  for (const [topicId, cached] of missing) {
    if (recovered.length > 0) await sleep(FETCH_PAUSE_MS);
    let detail;
    try {
      detail = await fetchTopicDetail(cached.slug, topicId);
    } catch (error) {
      // Un 404 confirma que el tema ya no existe. Otros errores son
      // transitorios o de red y deben detener el build, no borrar caché.
      if (/\b404\b/.test(String(error?.message || error))) continue;
      throw error;
    }

    const topic = topicFromDetail(detail);
    if (topic.id && topic.category_id === 6 && !shouldSkipTopic(topic)) {
      recovered.push(topic);
    }
  }

  return {
    topics: [...topics, ...recovered],
    recoveredIds: new Set(recovered.map((topic) => String(topic.id)))
  };
}

async function removeOrphanedCacheFiles(knownTopicIds) {
  for (const dir of [cacheDataDir, cacheRawDir]) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const topicId = entry.name.slice(0, -5);
      if (knownTopicIds.has(topicId)) continue;
      await fs.rm(path.join(dir, entry.name), { force: true });
    }
  }
}

/**
 * Sincroniza la categoría conservando la caché por tema.
 *
 * Este es el camino normal de cada deploy: con rebuild=false solo se descarga
 * el detalle de temas nuevos, editados o forzados por refreshTopicIds. El
 * detector de GitHub Pages alimenta refreshTopicIds tras comprobar ediciones
 * del primer post. No convertir esta función en una resincronización completa:
 * --rebuild queda reservado al workflow manual de recuperación.
 */
export async function syncEvents({ rebuild = false, refreshTopicIds = [] } = {}) {
  await ensureCacheDirs();
  const index = await readIndex();
  const forcedRefreshIds = normalizeRefreshTopicIds(refreshTopicIds);
  const forcedTopics = await addForcedTopicsMissingFromCategory(await fetchCategoryTopics(), forcedRefreshIds);
  const { topics, recoveredIds } = await recoverCachedTopicsMissingFromCategory(forcedTopics, index);
  const nextIndex = { topics: {} };
  const normalized = [];
  const seenIds = new Set();
  let fetched = 0;

  for (const topic of topics) {
    if (shouldSkipTopic(topic)) continue;
    seenIds.add(String(topic.id));
    const signature = topicSignature(topic);
    const cached = index.topics?.[topic.id];
    const unchanged = !rebuild &&
      !forcedRefreshIds.has(String(topic.id)) &&
      !recoveredIds.has(String(topic.id)) &&
      cached &&
      cached.signature === signature &&
      cached.schemaVersion === CACHE_SCHEMA_VERSION;

    if (unchanged) {
      const cachedPath = path.join(root, 'cache', 'data', `${topic.id}.json`);
      const cachedData = JSON.parse(await fs.readFile(cachedPath, 'utf8'));
      normalized.push(cachedData);
      nextIndex.topics[topic.id] = cached;
      continue;
    }

    // Pausa corta entre detalles para no chocar con el límite de peticiones
    // del foro cuando hay que refrescar muchos eventos de golpe.
    if (fetched > 0) await sleep(FETCH_PAUSE_MS);
    fetched += 1;
    const detail = await fetchTopicDetail(topic.slug, topic.id);
    const event = normalizeDetailToRecord(topic, detail);
    await writeCachedTopic(topic.id, event, detail);
    normalized.push(event);
    nextIndex.topics[topic.id] = {
      id: topic.id,
      slug: topic.slug,
      last_posted_at: topic.last_posted_at,
      signature,
      schemaVersion: CACHE_SCHEMA_VERSION,
      fetchedAt: new Date().toISOString(),
      postUpdatedAt: firstPostUpdatedAt(detail),
      detailPath: `/t/${topic.slug}/${topic.id}.json`,
      normalizedPath: `/cache/data/${topic.id}.json`
    };
  }

  // Remove cached topics that are no longer present in the category listing.
  // If they disappear from the forum, they should also disappear from the web.
  for (const [topicId, cachedRecord] of Object.entries(index.topics || {})) {
    if (seenIds.has(String(topicId))) continue;

    try {
      await fs.rm(path.join(cacheDataDir, `${topicId}.json`), { force: true });
      await fs.rm(path.join(cacheRawDir, `${topicId}.json`), { force: true });
    } catch {
      // Ignore cleanup errors for orphaned cache files.
    }
  }

  await removeOrphanedCacheFiles(new Set(Object.keys(nextIndex.topics || {})));
  await writeIndex(nextIndex);
  return normalized;
}
