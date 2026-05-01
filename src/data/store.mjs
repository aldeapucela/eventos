import fs from 'node:fs/promises';
import path from 'node:path';

const cacheDir = path.resolve('cache');
const dataDir = path.join(cacheDir, 'data');
const rawDir = path.join(cacheDir, 'raw');
const indexPath = path.join(cacheDir, 'index.json');

export async function ensureCacheDirs() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });
}

export async function readIndex() {
  try {
    return JSON.parse(await fs.readFile(indexPath, 'utf8'));
  } catch {
    return { topics: {} };
  }
}

export async function writeIndex(index) {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

export function topicPaths(id) {
  return {
    raw: path.join(rawDir, `${id}.json`),
    normalized: path.join(dataDir, `${id}.json`)
  };
}

export async function readCachedTopic(id) {
  const { normalized } = topicPaths(id);
  try {
    return JSON.parse(await fs.readFile(normalized, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeCachedTopic(id, data, raw) {
  const paths = topicPaths(id);
  await fs.writeFile(paths.normalized, JSON.stringify(data, null, 2));
  if (raw) {
    await fs.writeFile(paths.raw, JSON.stringify(raw, null, 2));
  }
}

export async function loadCachedEvents() {
  await ensureCacheDirs();
  const index = await readIndex();
  const events = [];
  for (const [id, record] of Object.entries(index.topics || {})) {
    const topic = await readCachedTopic(id);
    if (topic) events.push(topic);
  }
  return { index, events };
}
