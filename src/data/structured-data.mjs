// Claves alineadas con los categoryLabel reales que produce normalizeCategory
// (ver src/data/discourse.mjs y la lista `filters` de site-data.json).
const SCHEMA_TYPE_BY_CATEGORY = {
  'Musica': 'MusicEvent',
  'Recital': 'LiteraryEvent',
  'Cine': 'ScreeningEvent',
  'Cine Proyeccion': 'ScreeningEvent',
  'Proyección': 'ScreeningEvent',
  'Charlas': 'EducationEvent',
  'Conferencia': 'EducationEvent',
  'Talleres': 'EducationEvent',
  'Exposicion': 'ExhibitionEvent',
  'Festival': 'Festival',
  'Literatura': 'LiteraryEvent',
  'Presentacion Libro': 'LiteraryEvent',
  'Teatro': 'TheaterEvent',
  'Danza': 'DanceEvent',
  'Comedia': 'ComedyEvent',
  'Deportes': 'SportsEvent',
  'Gastronomia Cata': 'FoodEvent',
  'Infantil Familiar': 'ChildrensEvent'
};

export function schemaTypeForCategory(categoryLabel) {
  return SCHEMA_TYPE_BY_CATEGORY[String(categoryLabel || '').trim()] || 'Event';
}

// El JSON va dentro de <script type="application/ld+json"> con | safe:
// escapamos < para neutralizar </script> y <!-- dentro de valores, y los
// separadores U+2028/U+2029 que romperían el script inline.
export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildEventJsonLd(event, { publicBaseUrl, venueEntry = null } = {}) {
  const eventUrl = `${publicBaseUrl}/e/${event.id}/${event.slug}/`;
  const description = String(event.summary || event.excerpt || '').trim();
  const venueName = String(venueEntry?.name || event.venue || event.location || '').trim();
  const streetAddress = String(venueEntry?.address || event.address || '').trim();

  const address = {
    '@type': 'PostalAddress',
    addressLocality: 'Valladolid',
    addressRegion: 'Castilla y León',
    addressCountry: 'ES'
  };
  if (streetAddress) address.streetAddress = streetAddress;

  const location = {
    '@type': 'Place',
    name: venueName || 'Valladolid',
    address
  };
  if (Number.isFinite(venueEntry?.lat) && Number.isFinite(venueEntry?.lon)) {
    location.geo = {
      '@type': 'GeoCoordinates',
      latitude: venueEntry.lat,
      longitude: venueEntry.lon
    };
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaTypeForCategory(event.categoryLabel),
    name: event.title,
    startDate: event.startsAt,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: eventUrl,
    location
  };
  if (event.endsAt) jsonLd.endDate = event.endsAt;
  if (description) jsonLd.description = description;
  if (event.image) jsonLd.image = [event.image];
  if (event.organizer) {
    jsonLd.organizer = { '@type': 'Organization', name: event.organizer };
  }
  // Solo eventos gratuitos: de los de pago no conocemos el precio real.
  if (event.isFree) {
    jsonLd.isAccessibleForFree = true;
    jsonLd.offers = {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: eventUrl
    };
  }
  return jsonLd;
}

export function buildCollectionPageJsonLd({ name, description, url, items = [] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: item.url,
        name: item.name
      }))
    }
  };
}

// Página de una ubicación: CollectionPage con la lista de eventos + un Place
// (about) con la dirección y coordenadas del venue.
export function buildVenuePageJsonLd({ name, description, url, items = [], venue = {} }) {
  const page = buildCollectionPageJsonLd({ name, description, url, items });
  const address = {
    '@type': 'PostalAddress',
    addressLocality: 'Valladolid',
    addressRegion: 'Castilla y León',
    addressCountry: 'ES'
  };
  if (venue.address) address.streetAddress = venue.address;
  const place = {
    '@type': 'Place',
    name: venue.name || name,
    address
  };
  if (Number.isFinite(venue.lat) && Number.isFinite(venue.lon)) {
    place.geo = { '@type': 'GeoCoordinates', latitude: venue.lat, longitude: venue.lon };
  }
  page.about = place;
  return page;
}
