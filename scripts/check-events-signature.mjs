import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const CATEGORY_URL = 'https://foro.aldeapucela.org/c/eventos/6.json';
const FORUM_BASE = 'https://foro.aldeapucela.org';
const STATE_DIR = path.resolve('.ci-state');
const STATE_FILE = path.join(STATE_DIR, 'events-signature.txt');

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AldeaPucelaEventosCheck/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function topicSignature(topic) {
  return [
    topic.id,
    topic.slug,
    topic.last_posted_at,
    topic.image_url || '',
    topic.event_starts_at || '',
    topic.event_ends_at || '',
    topic.visible ? '1' : '0',
    topic.pinned ? '1' : '0'
  ].join('|');
}

function shouldSkipTopic(topic) {
  return !topic?.event_starts_at || !topic?.visible || topic?.pinned || topic?.title === 'Acerca de esta categoría y cómo añadir eventos';
}

function toJsonUrl(url) {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith('.json')) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}.json`;
  }
  return parsed.toString();
}

async function fetchAllTopics() {
  const topics = [];
  const seen = new Set();
  let nextUrl = CATEGORY_URL;

  while (nextUrl) {
    const json = await fetchJson(nextUrl);
    const pageTopics = json.topic_list?.topics ?? [];

    for (const topic of pageTopics) {
      if (!seen.has(topic.id)) {
        seen.add(topic.id);
        topics.push(topic);
      }
    }

    const moreTopicsUrl = json.topic_list?.more_topics_url || null;
    nextUrl = moreTopicsUrl ? toJsonUrl(`${FORUM_BASE}${moreTopicsUrl}`) : null;
  }

  return topics;
}

function madridDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function computeDigest(topics) {
  const payload = topics
    .filter((topic) => !shouldSkipTopic(topic))
    .map(topicSignature)
    .sort()
    .join('\n');

  // Las páginas temporales (/hoy/, /fin-de-semana/...) dependen de la fecha:
  // salamos el digest con el día de Madrid para forzar un rebuild en la
  // primera pasada del cron tras la medianoche aunque el foro no cambie.
  return crypto.createHash('sha256').update(`${madridDateKey()}\n${payload}`).digest('hex');
}

async function readPreviousDigest() {
  try {
    return (await fs.readFile(STATE_FILE, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function writeCurrentDigest(digest) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, `${digest}\n`);
}

async function main() {
  const topics = await fetchAllTopics();
  const digest = computeDigest(topics);
  const previous = await readPreviousDigest();
  const changed = previous !== digest;

  await writeCurrentDigest(digest);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    await fs.appendFile(outputPath, `changed=${changed}\n`);
    await fs.appendFile(outputPath, `digest=${digest}\n`);
  }

  console.log(`topics=${topics.length}`);
  console.log(`changed=${changed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
