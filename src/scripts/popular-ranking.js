const MAX_RESULTS = 30;
const FALLBACK_RESULTS = 5;
const MIN_SAVES = 10;

export function rankPopularEvents(events, activities, mode = 'saves', spaceKey = '', now = new Date(), visitRankIds = []) {
  const metricById = new Map((activities || []).map((activity) => [String(activity.id), activity]));
  const validMode = mode === 'visits' ? 'visits' : 'saves';
  const visitOrder = new Map((visitRankIds || []).map((id, index) => [String(id), index]));
  const hasVisitOrder = validMode === 'visits' && visitOrder.size > 0;
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const candidates = (events || [])
    .filter((event) => !hasEnded(event, currentTime))
    .filter((event) => !spaceKey || String(event.venueKey || '') === String(spaceKey))
    .map((event) => ({
      ...event,
      metrics: metricById.get(String(event.id)) || { saveCount: 0, visitCount: 0 }
    }))
    .sort((left, right) => hasVisitOrder
      ? compareVisitOrder(left, right, visitOrder)
      : comparePopularity(left, right, validMode));

  const totalVisits = (activities || []).reduce((total, activity) => total + toCount(activity.visitCount), 0);
  const minVisitCount = Math.max(3, Math.ceil(totalVisits * 0.005));
  const qualified = hasVisitOrder
    ? candidates.filter((event) => visitOrder.has(String(event.id)))
    : candidates.filter((event) => validMode === 'saves'
      ? toCount(event.metrics.saveCount) >= MIN_SAVES
      : toCount(event.metrics.visitCount) >= minVisitCount
    );

  return (qualified.length ? qualified : candidates.slice(0, FALLBACK_RESULTS)).slice(0, MAX_RESULTS);
}

function compareVisitOrder(left, right, visitOrder) {
  return (visitOrder.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER)
    - (visitOrder.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER);
}

export function hasEnded(event, now = Date.now()) {
  const timestamp = event?.endsAtIso || event?.endsAt || event?.startsAtIso || event?.startsAt;
  const end = Date.parse(timestamp || '');
  return !Number.isFinite(end) || end < Number(now);
}

export function getPopularThresholds(activities = []) {
  const totalVisits = activities.reduce((total, activity) => total + toCount(activity.visitCount), 0);
  return {
    minSaves: MIN_SAVES,
    minVisits: Math.max(3, Math.ceil(totalVisits * 0.005))
  };
}

function comparePopularity(left, right, mode) {
  const first = mode === 'visits' ? 'visitCount' : 'saveCount';
  const second = mode === 'visits' ? 'saveCount' : 'visitCount';
  return toCount(right.metrics[first]) - toCount(left.metrics[first])
    || toCount(right.metrics[second]) - toCount(left.metrics[second])
    || Date.parse(left.startsAtIso || left.startsAt || '') - Date.parse(right.startsAtIso || right.startsAt || '');
}

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
