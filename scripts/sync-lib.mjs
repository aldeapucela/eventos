import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCategoryTopics, fetchTopicDetail, normalizeDetailToRecord, shouldSkipTopic, topicSignature } from '../src/data/discourse.mjs';
import { ensureCacheDirs, readIndex, writeCachedTopic, writeIndex } from '../src/data/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function syncEvents({ rebuild = false } = {}) {
  await ensureCacheDirs();
  const index = await readIndex();
  const topics = await fetchCategoryTopics();
  const nextIndex = { topics: {} };
  const normalized = [];

  for (const topic of topics) {
    if (shouldSkipTopic(topic)) continue;
    const signature = topicSignature(topic);
    const cached = index.topics?.[topic.id];
    const unchanged = !rebuild && cached && cached.signature === signature;

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
      detailPath: `/t/${topic.slug}/${topic.id}.json`,
      normalizedPath: `/cache/data/${topic.id}.json`
    };
  }

  await writeIndex(nextIndex);
  return normalized;
}
