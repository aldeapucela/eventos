import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCategoryTopics, fetchTopicDetail, normalizeDetailToRecord, shouldSkipTopic, topicSignature } from '../src/data/discourse.mjs';
import { ensureCacheDirs, readIndex, writeCachedTopic, writeIndex } from '../src/data/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_SCHEMA_VERSION = 1;

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

  // Preserve cached topics that are no longer present in the paginated category listing.
  // The forum listing does not guarantee a full historical window, so dropping unseen ids
  // here would silently shrink the local dataset on incremental syncs.
  for (const [topicId, cachedRecord] of Object.entries(index.topics || {})) {
    if (seenIds.has(String(topicId))) continue;

    const cachedPath = path.join(root, 'cache', 'data', `${topicId}.json`);
    try {
      const cachedData = JSON.parse(await fs.readFile(cachedPath, 'utf8'));
      normalized.push(cachedData);
      nextIndex.topics[topicId] = cachedRecord;
    } catch {
      // Ignore orphaned index entries if the normalized file is missing.
    }
  }

  await writeIndex(nextIndex);
  return normalized;
}
