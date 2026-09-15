import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  fetchCategoryTopics,
  fetchJson,
  fetchTopicDetail,
  firstPostUpdatedAt,
  FORUM_BASE,
  shouldSkipTopic,
  sleep,
  topicSignature as dataTopicSignature
} from '../src/data/discourse.mjs';
import { readIndex } from '../src/data/store.mjs';

const STATE_DIR = path.resolve('.ci-state');
const STATE_FILE = path.join(STATE_DIR, 'events-signature.txt');
const RECENT_POST_STATE_FILE = path.join(STATE_DIR, 'recent-post-signatures.json');
const RAW_CACHE_DIR = path.resolve('cache', 'raw');
const PROBE_INTERVAL_MS = 15 * 60 * 1000;
const PROBE_BATCH_SIZE = Math.max(1, Number(process.env.EVENT_EDIT_PROBE_BATCH_SIZE || 20));
const PROBE_PAUSE_MS = 300;
const PAST_EVENT_GRACE_MS = 24 * 60 * 60 * 1000;
const RECENT_POST_SEARCH_URL = `${FORUM_BASE}/search.json?q=${encodeURIComponent('category:eventos in:first order:latest')}`;

// Este detector corre antes del build normal. Su trabajo es decidir si hace
// falta desplegar y pasar una lista pequeña de IDs a EVENT_REFRESH_IDS; no
// debe convertirse en una sincronización completa del detalle del foro.
// La tanda rotatoria limita las peticiones de updated_at a los eventos
// vigentes/futuros y permite que las ediciones terminen detectándose en un
// deploy posterior sin penalizar cada cron de 15 minutos.

function topicSignature(topic) {
  return [
    dataTopicSignature(topic),
    topic.visible ? '1' : '0',
    topic.pinned ? '1' : '0'
  ].join('|');
}

export function isCurrentOrFutureEvent(topic, now = Date.now()) {
  if (shouldSkipTopic(topic)) return false;
  const startsAt = Date.parse(topic?.event_starts_at || '');
  const rawEndsAt = Date.parse(topic?.event_ends_at || '');
  const endsAt = Number.isFinite(rawEndsAt) ? rawEndsAt : startsAt;
  return Number.isFinite(endsAt) && endsAt >= now - PAST_EVENT_GRACE_MS;
}

export function selectEditProbeBatch(topics, now = Date.now(), limit = PROBE_BATCH_SIZE) {
  const candidates = topics
    .filter((topic) => isCurrentOrFutureEvent(topic, now))
    .sort((left, right) => Number(left.id) - Number(right.id));

  if (candidates.length <= limit) return candidates;

  const batchCount = Math.ceil(candidates.length / limit);
  const timeBucket = Math.floor(now / PROBE_INTERVAL_MS);
  const batchIndex = ((timeBucket % batchCount) + batchCount) % batchCount;
  return candidates.slice(batchIndex * limit, (batchIndex + 1) * limit);
}

async function readCachedPostUpdatedAt(topicId, index) {
  const indexedValue = index.topics?.[topicId]?.postUpdatedAt;
  if (indexedValue) return indexedValue;

  try {
    const raw = JSON.parse(await fs.readFile(path.join(RAW_CACHE_DIR, `${topicId}.json`), 'utf8'));
    return firstPostUpdatedAt(raw);
  } catch {
    return '';
  }
}

async function findEditedTopicIds(topics, now = Date.now()) {
  const index = await readIndex();
  const selected = selectEditProbeBatch(topics, now);
  const editedIds = [];
  let fetched = 0;

  for (const topic of selected) {
    const cachedUpdatedAt = await readCachedPostUpdatedAt(topic.id, index);
    // Una entrada incompleta también se repara de forma selectiva.
    if (!cachedUpdatedAt) {
      editedIds.push(String(topic.id));
      continue;
    }

    if (fetched > 0) await sleep(PROBE_PAUSE_MS);
    fetched += 1;
    const detail = await fetchTopicDetail(topic.slug, topic.id);
    // updated_at del primer post es la señal que permite refrescar una edición
    // manual aunque el listado del tema no cambie su last_posted_at.
    const currentUpdatedAt = firstPostUpdatedAt(detail);
    if (currentUpdatedAt && currentUpdatedAt !== cachedUpdatedAt) {
      editedIds.push(String(topic.id));
    }
  }

  return { candidateCount: topics.filter((topic) => isCurrentOrFutureEvent(topic, now)).length, editedIds, fetched, selected };
}

function recentPostSignature(post) {
  return crypto.createHash('sha256').update([
    post.id,
    post.topic_id,
    post.blurb || ''
  ].join('|')).digest('hex');
}

async function readRecentPostState() {
  try {
    return JSON.parse(await fs.readFile(RECENT_POST_STATE_FILE, 'utf8'));
  } catch {
    return { posts: {} };
  }
}

export function diffRecentPostSignatures(previousState, posts, cachedTopicIds = new Set()) {
  const previous = previousState?.posts || {};
  const current = {};
  const editedIds = [];
  const hasBaseline = Object.keys(previous).length > 0;

  for (const post of posts) {
    if (post?.post_number !== 1 || !post?.topic_id) continue;
    const topicId = String(post.topic_id);
    const signature = recentPostSignature(post);
    current[topicId] = signature;

    if (hasBaseline) {
      if (previous[topicId] && previous[topicId] !== signature) editedIds.push(topicId);
    } else if (cachedTopicIds.has(topicId)) {
      // Primera ejecución tras desplegar el detector: refresca una sola vez los
      // 50 eventos más recientes para corregir ediciones que ya estaban ocultas
      // por la caché anterior (incluido Vecivall), no los 1.500 temas.
      editedIds.push(topicId);
    }
  }

  return {
    currentState: { posts: current },
    editedIds,
    stateChanged: JSON.stringify(previous) !== JSON.stringify(current)
  };
}

async function findRecentlyEditedTopicIds(index) {
  const [search, previousState] = await Promise.all([
    fetchJson(RECENT_POST_SEARCH_URL),
    readRecentPostState()
  ]);
  return diffRecentPostSignatures(
    previousState,
    search.posts || [],
    new Set(Object.keys(index.topics || {}))
  );
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
  const topics = await fetchCategoryTopics();
  const digest = computeDigest(topics);
  const previous = await readPreviousDigest();
  const index = await readIndex();
  const recent = await findRecentlyEditedTopicIds(index);
  const probe = await findEditedTopicIds(topics);
  const editedIds = [...new Set([...recent.editedIds, ...probe.editedIds])];
  // El build solo se omite cuando el cron no tiene nada que publicar. En un
  // push o ejecución manual el workflow sigue construyendo, pero conserva la
  // misma lógica incremental de syncEvents.
  const changed = previous !== digest || recent.stateChanged || editedIds.length > 0;

  await writeCurrentDigest(digest);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    await fs.appendFile(outputPath, `changed=${changed}\n`);
    await fs.appendFile(outputPath, `digest=${digest}\n`);
    await fs.appendFile(outputPath, `refresh_ids=${editedIds.join(',')}\n`);
    await fs.appendFile(outputPath, `recent_post_state=${Buffer.from(JSON.stringify(recent.currentState)).toString('base64')}\n`);
  }

  console.log(`topics=${topics.length}`);
  console.log(`current-or-future-topics=${probe.candidateCount}`);
  console.log(`edit-probes=${probe.fetched}/${probe.selected.length}`);
  console.log(`recent-post-signatures=${Object.keys(recent.currentState.posts).length}`);
  console.log(`edited-topics=${editedIds.join(',') || 'none'}`);
  console.log(`changed=${changed}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
