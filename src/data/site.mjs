export function groupByDate(events) {
  return events.reduce((acc, event) => {
    const dateKey = event.startsAt ? new Date(event.startsAt).toISOString().slice(0, 10) : 'sin-fecha';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});
}

export function deriveFilters(events) {
  const categories = [...new Set(events.map((event) => event.categoryLabel).filter(Boolean))].sort();
  return categories;
}

export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

export function splitFeatured(events) {
  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + 30);
  const sorted = sortEvents(events);
  const featuredCandidates = sorted.filter((event) => event.isSticky);
  const upcoming = sorted.filter((event) => isActiveOrUpcoming(event, now));
  const horizon = sorted.filter((event) => {
    return isActiveWithinHorizon(event, now, horizonEnd);
  });
  const base = horizon.length ? horizon : upcoming.length ? upcoming : sorted;
  const today = sorted.filter((event) => event.startsAt && sameDate(event.startsAt, now));
  const daily = today.length ? today.slice(0, 4) : base.slice(0, 4);
  const ongoing = sorted.filter((event) => {
    if (!event.startsAt || !event.endsAt) return false;

    const starts = new Date(event.startsAt);
    const ends = new Date(event.endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return false;
    if (!spansMultipleDays(starts, ends)) return false;

    return starts <= now && ends >= now;
  }).sort((a, b) => {
    const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aEnd - bEnd;
  });

  return {
    featured: featuredCandidates[0] || null,
    week: featuredCandidates.length ? base.filter((event) => !event.isSticky) : base,
    ongoing: ongoing.slice(0, 3),
    today: daily
  };
}

function sameDate(value, now) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function spansMultipleDays(starts, ends) {
  return !sameDay(starts, ends);
}

function isActiveOrUpcoming(event, now) {
  if (!event.startsAt) return false;
  const starts = new Date(event.startsAt);
  if (Number.isNaN(starts.getTime())) return false;
  if (starts >= now) return true;

  if (!event.endsAt) return false;
  const ends = new Date(event.endsAt);
  if (Number.isNaN(ends.getTime())) return false;
  return ends >= now;
}

function isActiveWithinHorizon(event, now, horizonEnd) {
  if (!event.startsAt) return false;
  const starts = new Date(event.startsAt);
  if (Number.isNaN(starts.getTime())) return false;

  if (starts >= now && starts <= horizonEnd) return true;

  if (!event.endsAt) return false;
  const ends = new Date(event.endsAt);
  if (Number.isNaN(ends.getTime())) return false;
  return starts <= now && ends >= now;
}
