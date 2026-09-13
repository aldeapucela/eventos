import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STOPS_URL = 'https://gtfs.vallabus.com/paradas/';
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_FILE = path.resolve('cache', 'vallabus-stops.json');
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PRIMARY_RADIUS_METERS = 500;
const FALLBACK_RADIUS_METERS = 1000;
const STOP_LIMIT = 3;
const lineCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export async function loadVallabusStops({
  fetcher = globalThis.fetch,
  url = DEFAULT_STOPS_URL,
  timeoutMs = REQUEST_TIMEOUT_MS,
  cacheFile = CACHE_FILE
} = {}) {
  if (typeof fetcher !== 'function') return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stops = normalizeVallabusStops(await response.json());
    if (!stops.length) throw new Error('la respuesta no contiene paradas válidas');
    try {
      await writeStopsCache(cacheFile, stops);
    } catch (error) {
      console.warn(`No se pudo guardar la caché de paradas de VallaBus: ${error.message}`);
    }
    return stops;
  } catch (error) {
    const cached = await readStopsCache(cacheFile);
    if (cached) {
      console.warn(`No se pudieron cargar las paradas de VallaBus: ${error.message}. Se usarán ${cached.stops.length} paradas guardadas (${formatCacheAge(cached.ageMs)}).`);
      return cached.stops;
    }
    console.warn(`No se pudieron cargar las paradas de VallaBus: ${error.message}. Se generará la web sin transporte local.`);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function writeStopsCache(cacheFile, stops) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify({ fetchedAt: Date.now(), stops }));
}

async function readStopsCache(cacheFile) {
  try {
    const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    const fetchedAt = Number(cache?.fetchedAt);
    const ageMs = Date.now() - fetchedAt;
    if (!Number.isFinite(fetchedAt) || ageMs < 0 || ageMs > CACHE_MAX_AGE_MS) return null;
    const stops = Array.isArray(cache?.stops) ? cache.stops.filter((stop) => (
      stop?.number
      && stop?.name
      && Number.isFinite(Number(stop.lat))
      && Number.isFinite(Number(stop.lon))
      && Array.isArray(stop.lines)
      && stop.lines.length
    )) : [];
    return stops.length ? { stops, ageMs } : null;
  } catch {
    return null;
  }
}

function formatCacheAge(ageMs) {
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return days === 0 ? 'actualizadas hoy' : `actualizadas hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

export function normalizeVallabusStops(payload) {
  if (!Array.isArray(payload)) return [];
  const unique = new Map();

  for (const entry of payload) {
    const number = String(entry?.parada?.numero || '').trim();
    const name = String(entry?.parada?.nombre || '').trim();
    const rawLat = entry?.ubicacion?.y;
    const rawLon = entry?.ubicacion?.x;
    if (rawLat == null || rawLon == null || rawLat === '' || rawLon === '') continue;
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    const lines = Array.isArray(entry?.lineas?.ordinarias)
      ? [...new Set(entry.lineas.ordinarias.map((line) => String(line).trim()).filter(Boolean))]
        .sort((left, right) => lineCollator.compare(left, right))
      : [];

    if (!number || !name || !Number.isFinite(lat) || !Number.isFinite(lon) || !lines.length) continue;
    if (!unique.has(number)) unique.set(number, { number, name, lat, lon, lines });
  }

  return [...unique.values()];
}

export function nearbyVallabusStops(coordinates, stops) {
  if (!hasCoordinates(coordinates) || !Array.isArray(stops) || !stops.length) return [];

  const ranked = stops
    .filter(hasCoordinates)
    .map((stop) => ({
      ...stop,
      distanceMeters: Math.round(distanceInMetres(coordinates, stop))
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters || lineCollator.compare(left.name, right.name));

  const withinRadius = ranked.filter((stop) => stop.distanceMeters <= PRIMARY_RADIUS_METERS);
  const selected = (withinRadius.length
    ? withinRadius
    : ranked.filter((stop) => stop.distanceMeters <= FALLBACK_RADIUS_METERS)
  ).slice(0, STOP_LIMIT);

  return selected.map(({ number, name, lat, lon, lines, distanceMeters }) => ({
    number,
    name,
    lat,
    lon,
    lines,
    distanceMeters
  }));
}

export function distanceInMetres(left, right) {
  if (!hasCoordinates(left) || !hasCoordinates(right)) return Infinity;
  const earthRadius = 6371000;
  const toRadians = Math.PI / 180;
  const latitudeDelta = (right.lat - left.lat) * toRadians;
  const longitudeDelta = (right.lon - left.lon) * toRadians;
  const latitude1 = left.lat * toRadians;
  const latitude2 = right.lat * toRadians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function hasCoordinates(value) {
  if (value?.lat == null || value?.lon == null || value?.lat === '' || value?.lon === '') return false;
  return Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lon));
}
