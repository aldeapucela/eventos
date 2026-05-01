import {
  buildExcerpt,
  cleanDescriptionHtml,
  extractParagraphLines,
  normalizeImage,
  parseEventMetaFromHtml,
  titleCase,
  toSlug
} from './format.mjs';

export const CATEGORY_URL = 'https://foro.aldeapucela.org/c/eventos/6.json';
export const FORUM_BASE = 'https://foro.aldeapucela.org';

export async function fetchJson(url) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AldeaPucelaEventos/1.0'
      }
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get('retry-after') || '0');
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 1500;
      await sleep(waitMs);
      continue;
    }

    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}${body ? `\n${body.slice(0, 200)}` : ''}`);
  }
}

export async function fetchCategoryTopics() {
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

function toJsonUrl(url) {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith('.json')) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}.json`;
  }
  return parsed.toString();
}

export async function fetchTopicDetail(slug, id) {
  return fetchJson(`${FORUM_BASE}/t/${slug}/${id}.json`);
}

export function shouldSkipTopic(topic) {
  return !topic?.event_starts_at || !topic?.visible || topic?.pinned || topic?.title === 'Acerca de esta categoría y cómo añadir eventos';
}

export function topicSignature(topic) {
  return [
    topic.id,
    topic.slug,
    topic.last_posted_at,
    topic.image_url || '',
    topic.event_starts_at || '',
    topic.event_ends_at || ''
  ].join('|');
}

export function normalizeDiscourseTopic(topic, detail) {
  const detailPost = detail?.post_stream?.posts?.[0];
  const event = detailPost?.event || {};
  const rawHtml = detailPost?.cooked || '';
  const meta = parseEventMetaFromHtml(rawHtml);
  const image = normalizeImage(topic.image_url || detail?.image_url || detail?.thumbnails?.[0]?.url || null);
  const title = topic.title || detail?.title || '';
  const slug = topic.slug || toSlug(title);
  const startsAt = event.starts_at || topic.event_starts_at || null;
  const endsAt = event.ends_at || topic.event_ends_at || null;
  const lines = extractParagraphLines(rawHtml);
  const summary = extractSummary(lines, title);
  const descriptionHtml = cleanDescriptionHtml(rawHtml, title);
  const categoryLabel = normalizeCategory(meta.categoryLabel);
  const location = normalizeLocation(meta.location || event.location || '', title);
  const organizer = meta.organizer || '';
  const notes = meta.notes || '';

  return {
    id: topic.id,
    slug,
    urlPath: `/e/${topic.id}/${slug}`,
    sourceUrl: `${FORUM_BASE}/t/${slug}/${topic.id}`,
    title,
    excerpt: buildExcerpt(summary || descriptionHtml, 160),
    summary,
    descriptionHtml,
    image,
    startsAt,
    endsAt,
    timezone: event.timezone || 'Europe/Madrid',
    location,
    categoryLabel,
    organizer,
    notes,
    isSticky: Boolean(topic.pinned || topic.pinned_globally || topic.featured_link),
    isFree: /\bentrada libre\b|\bgratis\b/i.test(`${summary} ${notes} ${rawHtml}`),
    updatedAt: topic.last_posted_at || detailPost?.updated_at || topic.created_at || ''
  };
}

export function normalizeDetailToRecord(topic, detail) {
  const normalized = normalizeDiscourseTopic(topic, detail);
  return {
    ...normalized,
    signature: topicSignature(topic)
  };
}

function extractSummary(lines, title) {
  const normalizedTitle = title.trim().toLowerCase();
  const candidates = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower === normalizedTitle) return false;
    if (lower.startsWith('categoría:') || lower.startsWith('organizador:') || lower.startsWith('notas:')) return false;
    if (line.length < 24) return false;
    return true;
  });

  return candidates[0] || '';
}

function normalizeCategory(value) {
  if (!value) return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const map = {
    charla: 'Charlas',
    concierto: 'Musica',
    cine: 'Cine',
    exposicion: 'Exposicion',
    exposición: 'Exposicion',
    festival: 'Festival',
    literatura: 'Literatura',
    taller: 'Talleres',
    debate: 'Charlas'
  };
  const key = cleaned.toLowerCase();
  return map[key] || titleCase(cleaned);
}

function normalizeLocation(value, title) {
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.toLowerCase() === String(title).trim().toLowerCase()) return '';
  return cleaned;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
