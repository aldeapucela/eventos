const ACCENT_MARKS_RE = /[\u0300-\u036f]/g;

export function normalizeAutocompleteText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(ACCENT_MARKS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildVenueSuggestions(spaces = []) {
  const seen = new Set();
  return spaces
    .map((space) => ({
      name: String(space?.name || space?.canonicalVenue || '').replace(/\s+/g, ' ').trim(),
      address: String(space?.address || '').replace(/\s+/g, ' ').trim()
    }))
    .filter((space) => {
      const key = normalizeAutocompleteText(space.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function findVenueSuggestions(spaces, query, limit = 6) {
  const normalizedQuery = normalizeAutocompleteText(query);
  if (!normalizedQuery) return [];

  return buildVenueSuggestions(spaces)
    .map((space, index) => {
      const normalizedName = normalizeAutocompleteText(space.name);
      const startsWith = normalizedName.startsWith(normalizedQuery);
      const position = normalizedName.indexOf(normalizedQuery);
      return {
        ...space,
        score: startsWith ? 0 : position === -1 ? 2 : 1,
        position: position === -1 ? Number.MAX_SAFE_INTEGER : position,
        index
      };
    })
    .filter((space) => space.position !== Number.MAX_SAFE_INTEGER)
    .sort((left, right) => (
      left.score - right.score ||
      left.position - right.position ||
      left.name.length - right.name.length ||
      left.index - right.index
    ))
    .slice(0, limit)
    .map(({ score, position, index, ...space }) => space);
}

export function formatPhotonAddress(properties = {}) {
  const street = String(properties.street || '').replace(/\s+/g, ' ').trim();
  const houseNumber = String(properties.housenumber || '').replace(/\s+/g, ' ').trim();
  const postcode = String(properties.postcode || '').replace(/\s+/g, ' ').trim();
  const city = String(properties.city || properties.town || properties.village || 'Valladolid')
    .replace(/\s+/g, ' ')
    .trim();
  const streetLine = [street, houseNumber].filter(Boolean).join(' ');

  if (streetLine) return [streetLine, postcode, city].filter(Boolean).join(', ');
  return [properties.name, postcode, city]
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

export function normalizePhotonResults(features = []) {
  const seen = new Set();
  return features
    .map((feature) => {
      const properties = feature?.properties || {};
      return {
        name: String(properties.name || '').replace(/\s+/g, ' ').trim(),
        address: formatPhotonAddress(properties)
      };
    })
    .filter((result) => {
      const key = normalizeAutocompleteText(result.address || result.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((result) => result.address || result.name);
}
