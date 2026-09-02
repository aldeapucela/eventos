import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCategoryTopics, fetchTopicDetail, normalizeDetailToRecord, shouldSkipTopic, sleep, topicSignature } from '../src/data/discourse.mjs';
import { ensureCacheDirs, readIndex, writeCachedTopic, writeIndex } from '../src/data/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_SCHEMA_VERSION = 2;
// El listado de la categoría no cambia (last_posted_at, bumped_at...) cuando se
// edita el post de un evento, así que la firma no detecta ediciones: hay que
// volver a pedir el detalle cada cierto tiempo.
// ponytail: TTL sobre los eventos próximos en vez de detectar ediciones de
// verdad; Discourse no expone la fecha de edición en el listado y refrescar los
// ~1.400 eventos de la categoría en cada build no cabe en el límite del foro.
const REVALIDATE_AFTER_MS = 6 * 60 * 60 * 1000;
const REVALIDATE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PAST_EVENT_GRACE_MS = 24 * 60 * 60 * 1000;
const FETCH_PAUSE_MS = 400;
const cacheDataDir = path.join(root, 'cache', 'data');
const cacheRawDir = path.join(root, 'cache', 'raw');

export function needsRevalidation(cached, topic, now = Date.now()) {
  const startsAt = Date.parse(topic?.event_starts_at ?? '');
  const rawEndsAt = Date.parse(topic?.event_ends_at ?? '');
  const endsAt = Number.isFinite(rawEndsAt) ? rawEndsAt : startsAt;

  // Los eventos ya celebrados no vuelven a cambiar: se quedan cacheados.
  if (Number.isFinite(endsAt) && endsAt < now - PAST_EVENT_GRACE_MS) return false;
  // Los muy lejanos se refrescan al entrar en la ventana, no antes.
  if (Number.isFinite(startsAt) && startsAt > now + REVALIDATE_WINDOW_MS) return false;

  const fetchedAt = Date.parse(cached?.fetchedAt ?? '');
  if (!Number.isFinite(fetchedAt)) return true;

  return now - fetchedAt > REVALIDATE_AFTER_MS;
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

export async function syncEvents({ rebuild = false } = {}) {
  await ensureCacheDirs();
  const index = await readIndex();
  const topics = await fetchCategoryTopics();
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
      cached &&
      cached.signature === signature &&
      cached.schemaVersion === CACHE_SCHEMA_VERSION &&
      !needsRevalidation(cached, topic);

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
