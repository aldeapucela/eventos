import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCategoryTopics, fetchTopicDetail, normalizeDetailToRecord, shouldSkipTopic, topicSignature } from '../src/data/discourse.mjs';
import { ensureCacheDirs, readIndex, writeCachedTopic, writeIndex } from '../src/data/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_SCHEMA_VERSION = 2;
const cacheDataDir = path.join(root, 'cache', 'data');
const cacheRawDir = path.join(root, 'cache', 'raw');

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

  for (const topic of topics) {
    if (shouldSkipTopic(topic)) continue;
    seenIds.add(String(topic.id));
    const signature = topicSignature(topic);
    const cached = index.topics?.[topic.id];
    const unchanged = !rebuild &&
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
