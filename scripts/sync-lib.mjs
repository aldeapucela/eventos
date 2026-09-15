import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCategoryTopics, fetchTopicDetail, firstPostUpdatedAt, normalizeDetailToRecord, shouldSkipTopic, sleep, topicSignature } from '../src/data/discourse.mjs';
import { ensureCacheDirs, readIndex, writeCachedTopic, writeIndex } from '../src/data/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_SCHEMA_VERSION = 3;
const FETCH_PAUSE_MS = 400;
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
  const topics = await fetchCategoryTopics();
  const forcedRefreshIds = normalizeRefreshTopicIds(refreshTopicIds);
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
