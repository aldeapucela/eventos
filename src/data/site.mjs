import { VENUE_CANONICAL_MAP, VENUE_SLUG_MAP } from './venue-aliases.mjs';

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
  const todayStart = startOfDay(now);
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + 30);
  const sorted = sortEvents(events);
  const featuredCandidates = sorted.filter((event) => event.isSticky);
  const upcoming = sorted.filter((event) => isUpcomingForWeek(event, todayStart));
  const horizon = sorted.filter((event) => {
    return isUpcomingForWeek(event, todayStart) && new Date(event.startsAt) <= horizonEnd;
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
    ongoing: ongoing.slice(0, 12),
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

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isOngoingMultiDay(event, now) {
  if (!event.startsAt || !event.endsAt) return false;
  const starts = new Date(event.startsAt);
  const ends = new Date(event.endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return false;
  if (!spansMultipleDays(starts, ends)) return false;
  return starts <= now && ends >= now;
}

function isUpcomingForWeek(event, todayStart) {
  if (!event.startsAt) return false;
  const starts = new Date(event.startsAt);
  if (Number.isNaN(starts.getTime())) return false;
  if (starts < todayStart) return false;
  return !isOngoingMultiDay(event, todayStart);
}

export function getPastEvents(events) {
  const now = new Date();
  const todayStart = startOfDay(now);
  
  const pastEvents = events.filter((event) => {
    // If it's ongoing, it's not past
    if (isOngoingMultiDay(event, todayStart)) return false;
    
    // Check if it ended or started in the past
    const referenceDate = event.endsAt ? new Date(event.endsAt) : new Date(event.startsAt);
    if (Number.isNaN(referenceDate.getTime())) return false;
    
    return referenceDate < todayStart;
  });

  // Sort descending (most recent first)
  return pastEvents.sort((a, b) => {
    const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function groupEventsByMonth(events) {
  const groups = [];
  const map = new Map();
  
  const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

  for (const event of events) {
    if (!event.startsAt) continue;
    const date = new Date(event.startsAt);
    if (Number.isNaN(date.getTime())) continue;
    
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!map.has(key)) {
      let label = formatter.format(date);
      label = label.charAt(0).toUpperCase() + label.slice(1);
      
      const group = {
        key,
        label,
        year: date.getFullYear(),
        month: date.getMonth(),
        events: []
      };
      groups.push(group);
      map.set(key, group);
    }
    
    map.get(key).events.push(event);
  }
  
  return groups;
}

export function groupFutureEventsByVenue(events, options = {}) {
  const now = new Date();
  const horizonMonths = Number.isFinite(options.horizonMonths) ? options.horizonMonths : 6;
  const horizonEnd = new Date(now);
  horizonEnd.setMonth(horizonEnd.getMonth() + horizonMonths);
  const groups = new Map();

  for (const event of sortEvents(events)) {
    if (!event.startsAt) continue;
    const startsAt = new Date(event.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt < now) continue;
    if (startsAt > horizonEnd) continue;
    if (!event.venue) continue;

    const canonicalVenue = canonicalizeVenue(event.venue);
    if (!canonicalVenue) continue;

    const slug = VENUE_SLUG_MAP[canonicalVenue] || slugifyVenue(canonicalVenue);
    const addressHint = event.address ? event.address.trim() : '';
    const key = normalizeVenueKey(canonicalVenue);

    if (!groups.has(key)) {
      groups.set(key, {
        slug,
        canonicalVenue,
        name: canonicalVenue,
        aliases: new Set(),
        addressHints: new Set(),
        nextEventAt: event.startsAt,
        events: [],
        count: 0
      });
    }

    const group = groups.get(key);
    group.aliases.add(event.venue);
    if (addressHint) group.addressHints.add(addressHint);
    if (new Date(group.nextEventAt) > startsAt) {
      group.nextEventAt = event.startsAt;
    }
    group.events.push(event);
    group.count += 1;
  }

  return [...groups.values()]
    .map((group) => {
      const aliases = [...group.aliases].sort((a, b) => a.localeCompare(b, 'es'));
      const addressHints = [...group.addressHints].sort((a, b) => a.localeCompare(b, 'es'));
      const address = pickPrimaryAddress(addressHints);
      return {
        slug: group.slug,
        canonicalVenue: group.canonicalVenue,
        name: group.name,
        aliases,
        addressHints,
        address,
        nextEventAt: group.nextEventAt,
        events: sortEvents(group.events),
        count: group.count
      };
    })
    .sort((a, b) => {
      const timeDiff = new Date(a.nextEventAt).getTime() - new Date(b.nextEventAt).getTime();
      return timeDiff !== 0 ? timeDiff : a.name.localeCompare(b.name, 'es');
    });
}

function canonicalizeVenue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalizedKey = normalizeVenueKey(raw);
  return VENUE_CANONICAL_MAP[raw.toLowerCase()] || VENUE_CANONICAL_MAP[normalizedKey] || raw;
}

function normalizeVenueKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(sala|espacio|centro|teatro|bar|csa|club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyVenue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickPrimaryAddress(addressHints) {
  if (!addressHints.length) return '';
  const counts = new Map();
  for (const address of addressHints) {
    counts.set(address, (counts.get(address) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0][0];
}
