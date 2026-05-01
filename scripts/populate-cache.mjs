import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchCategoryTopics, normalizeDetailToRecord, shouldSkipTopic, topicSignature } from '../src/data/discourse.mjs';

const topics = (await fetchCategoryTopics()).filter((topic) => !shouldSkipTopic(topic));

await fs.mkdir('cache/data', { recursive: true });
await fs.mkdir('cache/raw', { recursive: true });

const index = { topics: {} };
const events = [];

for (const topic of topics) {
  const url = `https://foro.aldeapucela.org/t/${topic.slug}/${topic.id}.json`;
  const raw = execFileSync('curl', ['-L', '-s', url], { encoding: 'utf8' });
  const detail = JSON.parse(raw);
  await fs.writeFile(path.join('cache/raw', `${topic.id}.json`), raw);
  const event = normalizeDetailToRecord(topic, detail);
  events.push(event);
  await fs.writeFile(path.join('cache/data', `${topic.id}.json`), JSON.stringify(event, null, 2));
  index.topics[topic.id] = {
    id: topic.id,
    slug: topic.slug,
    last_posted_at: topic.last_posted_at,
    signature: topicSignature(topic),
    detailPath: `/t/${topic.slug}/${topic.id}.json`,
    normalizedPath: `/cache/data/${topic.id}.json`
  };
}

await fs.writeFile('cache/index.json', JSON.stringify(index, null, 2));
await fs.writeFile('cache/events.json', JSON.stringify(events, null, 2));
console.log(`cached ${events.length} events`);
