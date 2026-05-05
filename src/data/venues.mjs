import fs from 'node:fs/promises';
import path from 'node:path';
import { VENUE_GEO_OVERRIDES } from './venue-aliases.mjs';

const cacheDir = path.resolve('cache');
const venuesPath = path.join(cacheDir, 'venues.json');
const PHOTON_BASE_URL = 'https://photon.komoot.io/api/';
const VALLADOLID_LAT = 41.651972;
const VALLADOLID_LON = -4.728606;
const REQUEST_DELAY_MS = 1000;
const VALID_BOUNDS = {
  minLat: 41.58,
  maxLat: 41.71,
  minLon: -4.82,
  maxLon: -4.64
};

export async function loadVenueCatalog() {
  try {
    return JSON.parse(await fs.readFile(venuesPath, 'utf8'));
  } catch {
    return { venues: {} };
  }
}

export async function writeVenueCatalog(catalog) {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(venuesPath, JSON.stringify(catalog, null, 2));
}

export async function enrichVenueCatalog(spaces) {
  const catalog = await loadVenueCatalog();
  const nextCatalog = { venues: { ...(catalog.venues || {}) } };
  const pending = [];

  for (const space of spaces) {
    const key = space.canonicalVenue;
    const existing = nextCatalog.venues[key] || {};
    const override = VENUE_GEO_OVERRIDES[key] || null;
    const query = buildVenueQuery(space);
    const merged = {
      canonicalVenue: key,
      slug: space.slug,
      aliases: uniqueSorted([...(existing.aliases || []), ...(space.aliases || [])]),
      address: space.address || existing.address || '',
      query: override?.query || query,
      lat: override?.lat ?? existing.lat ?? null,
      lon: override?.lon ?? existing.lon ?? null,
      geocodeSource: override ? 'manual' : existing.geocodeSource || '',
      geocodeStatus: override ? 'resolved' : existing.geocodeStatus || (existing.lat != null && existing.lon != null ? 'resolved' : 'pending'),
      lastResolvedAt: override ? (existing.lastResolvedAt || new Date().toISOString()) : (existing.lastResolvedAt || '')
    };

    const queryChanged = merged.query && merged.query !== existing.query;
    if (!override && queryChanged && !(existing.lat != null && existing.lon != null)) {
      merged.geocodeStatus = 'pending';
    }

    nextCatalog.venues[key] = merged;

    if (shouldGeocodeVenue(merged, existing, queryChanged)) {
      pending.push(merged);
    }
  }

  let networkAvailable = true;
  for (const [index, venue] of pending.entries()) {
    if (!networkAvailable) break;
    if (index > 0) await sleep(REQUEST_DELAY_MS);

    try {
      const result = await geocodeVenue(venue.query);
      if (!result) {
        nextCatalog.venues[venue.canonicalVenue] = {
          ...nextCatalog.venues[venue.canonicalVenue],
          geocodeStatus: 'failed',
          geocodeSource: 'photon',
          lastResolvedAt: new Date().toISOString()
        };
        continue;
      }

      nextCatalog.venues[venue.canonicalVenue] = {
        ...nextCatalog.venues[venue.canonicalVenue],
        lat: isWithinValidBounds(result.lat, result.lon) ? result.lat : null,
        lon: isWithinValidBounds(result.lat, result.lon) ? result.lon : null,
        geocodeStatus: isWithinValidBounds(result.lat, result.lon) ? 'resolved' : 'failed',
        geocodeSource: 'photon',
        lastResolvedAt: new Date().toISOString()
      };
    } catch (error) {
      networkAvailable = false;
      nextCatalog.venues[venue.canonicalVenue] = {
        ...nextCatalog.venues[venue.canonicalVenue],
        geocodeStatus: 'pending'
      };
      if (String(error?.message || '').includes('fetch failed')) break;
    }
  }

  await writeVenueCatalog(nextCatalog);
  return nextCatalog;
}

export function mergeSpacesWithVenueCatalog(spaces, catalog) {
  return spaces.map((space) => {
    const entry = catalog.venues?.[space.canonicalVenue] || {};
    const lat = Number.isFinite(entry.lat) ? entry.lat : null;
    const lon = Number.isFinite(entry.lon) ? entry.lon : null;
    return {
      ...space,
      aliases: uniqueSorted([...(space.aliases || []), ...(entry.aliases || [])]),
      address: entry.address || space.address || '',
      lat,
      lon,
      hasMapPoint: lat != null && lon != null,
      geocodeStatus: entry.geocodeStatus || 'pending'
    };
  });
}

function buildVenueQuery(space) {
  if (space.address) return `${space.address} Valladolid`;
  return `${space.canonicalVenue} Valladolid`;
}

function shouldGeocodeVenue(current, previous, queryChanged) {
  if (!current.query) return false;
  if (current.geocodeSource === 'manual') return false;
  if (current.lat != null && current.lon != null) return false;
  if (!previous || !previous.canonicalVenue) return true;
  if (queryChanged) return true;
  return current.geocodeStatus === 'pending';
}

async function geocodeVenue(query) {
  const url = new URL(PHOTON_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('lat', String(VALLADOLID_LAT));
  url.searchParams.set('lon', String(VALLADOLID_LON));
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(3000),
    headers: {
      'User-Agent': 'AldeaPucelaEventos/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Photon request failed: ${response.status}`);
  }

  const payload = await response.json();
  const feature = payload?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  return {
    lon: coordinates[0],
    lat: coordinates[1]
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function isWithinValidBounds(lat, lon) {
  return lat >= VALID_BOUNDS.minLat &&
    lat <= VALID_BOUNDS.maxLat &&
    lon >= VALID_BOUNDS.minLon &&
    lon <= VALID_BOUNDS.maxLon;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
