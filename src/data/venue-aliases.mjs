export const VENUE_CANONICAL_MAP = {
  '1000': 'Sala 1000',
  'sala 1000': 'Sala 1000',
  '100 espacio 0': 'Sala 1000',
  'espacio 0': 'Sala 1000',
  'porta caeli': 'Sala Porta Caeli',
  'sala porta caeli': 'Sala Porta Caeli',
  'cientocero': 'Sala Ciento Cero',
  'sala cientocero': 'Sala Ciento Cero',
  'sala ciento cero': 'Sala Ciento Cero',
  'plaza portugalete': 'Plaza de Portugalete',
  'plaza de portugalete': 'Plaza de Portugalete',

  // Teatro Carrión (incluye NEC / Nuevo Espacio Carrión y la variante con "Valladolid").
  'carrion': 'Teatro Carrión',
  'valladolid carrion': 'Teatro Carrión',
  'nec nuevo carrion': 'Teatro Carrión',
  'carrion nuevo carrion': 'Teatro Carrión',

  // Teatro Calderón (incluye el typo "Calderín" y la variante con "de Valladolid").
  'calderon': 'Teatro Calderón',
  'calderin': 'Teatro Calderón',
  'calderon de valladolid': 'Teatro Calderón',

  // LAVA: tres espacios distintos (edificio genérico, Sala Blanca y Sala Multiusos).
  'lava': 'LAVA',
  'laboratorio de las artes de valladolid lava': 'LAVA',
  'lava blanca': 'LAVA (Sala Blanca)',
  'blanca lava': 'LAVA (Sala Blanca)',
  'laboratorio de las artes de valladolid lava multiusos lava': 'LAVA (Sala Multiusos)',

  // Miguel Delibes: distinguimos la sala (Auditorio) del recinto entero
  // (Centro Cultural), que puede albergar eventos en otras salas.
  'auditorio miguel delibes': 'Auditorio Miguel Delibes',
  'auditorio del cultural miguel delibes': 'Auditorio Miguel Delibes',
  'cultural miguel delibes': 'Centro Cultural Miguel Delibes',

  // Museo de la Ciencia.
  'museo de la ciencia': 'Museo de la Ciencia',
  'museo de la ciencia de valladolid': 'Museo de la Ciencia',
  'museo de la ciencia valladolid': 'Museo de la Ciencia',

  // Pingüinos Arena (antigua Hípica).
  'pinguinos arena': 'Pingüinos Arena',
  'pinguinos arena antigua hipica': 'Pingüinos Arena',

  // Playa de las Moreras (incluye zonas y equipamientos de la propia playa).
  'playa de las moreras': 'Playa de las Moreras',
  'playa moreras': 'Playa de las Moreras',
  'valladolid playa de las moreras': 'Playa de las Moreras',
  'zona pista viva playa de las moreras': 'Playa de las Moreras',
  'skateplaza las moreras': 'Playa de las Moreras',

  // Pérgola del Campo Grande (aún sin eventos en los datos; preparado).
  'pergola campo grande': 'Pérgola del Campo Grande',
  'pergola del campo grande': 'Pérgola del Campo Grande',

  // Patio de la Hospedería de San Benito (aún sin eventos en los datos; preparado).
  'patio de la hospederia de san benito': 'Patio de la Hospedería de San Benito',
  'patio san benito': 'Patio de la Hospedería de San Benito',

  // Alias añadidos tras revisión de candidatos (npm run venues): agrupan variantes
  // ortográficas/con sufijos del mismo espacio. "Museo de Arte Africano Arellano
  // Alonso" y "Palacio de Santa Cruz" se mantienen SEPARADOS a propósito (el Palacio
  // es la sede del museo, no el museo).
  'akelarre libreria cafe': 'Akelarre Librería Café',
  'libreria cafe akelarre': 'Akelarre Librería Café',
  'libreria akelarre': 'Akelarre Librería Café',
  'libreria akelarre c': 'Akelarre Librería Café',
  'libreria cafeteria akelarre': 'Akelarre Librería Café',
  'akelarre cafeteria': 'Akelarre Librería Café',
  'portacaeli': 'Sala Porta Caeli',
  'porta': 'Sala Porta Caeli',
  'museo patio herreriano': 'Museo Patio Herreriano',
  'patio herreriano': 'Museo Patio Herreriano',
  'museo patio herreriano salas 4 y 5': 'Museo Patio Herreriano',
  'patio de san benito': 'Patio de la Hospedería de San Benito',
  'palacio real de valladolid': 'Palacio Real de Valladolid',
  'palacio real': 'Palacio Real de Valladolid',
  'plaza de zorrilla': 'Plaza de Zorrilla',
  'plaza zorrilla': 'Plaza de Zorrilla',
  'plaza de la solidaridad': 'Plaza de la Solidaridad',
  'plaza solidaridad': 'Plaza de la Solidaridad',
  'plaza de la solidaridad la victoria': 'Plaza de la Solidaridad',
  'plaza de san pablo': 'Plaza de San Pablo',
  'pza san pablo': 'Plaza de San Pablo',
  'pza de san pablo': 'Plaza de San Pablo',
  'plaza de san pablo cadenas de san gregorio': 'Plaza de San Pablo',
  'el desierto rojo': 'El Desierto Rojo',
  'desierto rojo': 'El Desierto Rojo',
  'barrio de la victoria': 'Barrio de La Victoria',
  'barrio la victoria': 'Barrio de La Victoria',
  'biblioteca reina sofia': 'Biblioteca Reina Sofía',
  'biblioteca reina sofia abierto': 'Biblioteca Reina Sofía',
  'estadio jose zorrilla': 'Estadio José Zorrilla',
  'estadio jose zorrilla fan zone': 'Estadio José Zorrilla',
  'archivo general de simancas': 'Archivo General de Simancas',
  'plaza exterior del archivo general de simancas': 'Archivo General de Simancas',
  'puerta principal del archivo general de simancas': 'Archivo General de Simancas',
  'civico canal de castilla': 'Centro Cívico Canal de Castilla',
  'civico canal de castilla la victoria': 'Centro Cívico Canal de Castilla',
  'civico canal de castilla exterior p jardin botanico': 'Centro Cívico Canal de Castilla',
  'cc canal de castilla': 'Centro Cívico Canal de Castilla',
  'facultad de filosofia y letras': 'Facultad de Filosofía y Letras',
  'facultad de filosofia y letras universidad de valladolid': 'Facultad de Filosofía y Letras',
  'facultad de filosofia y letras salon de grados': 'Facultad de Filosofía y Letras',
  'museo de arte africano arellano alonso': 'Museo de Arte Africano Arellano Alonso',
  'museo de arte africano arellano alonso de la uva': 'Museo de Arte Africano Arellano Alonso',
  'museo de arte africano arellano alonso de la universidad de valladolid': 'Museo de Arte Africano Arellano Alonso',
  'museo de arte africano arellano alonso de la universidad de valladolid palacio de santa cruz': 'Museo de Arte Africano Arellano Alonso',
  'museo de arte africano arellano alonso de la uva palacio de santa cruz valladolid': 'Museo de Arte Africano Arellano Alonso',
  'museo de arte africano de la uva galeria superior de la de san ambrosio palacio de santa cruz': 'Museo de Arte Africano Arellano Alonso',
  'antigua hipica': 'Pingüinos Arena',
  'la barberia': 'La Barbería',
  'terraza de la barberia': 'La Barbería',
  'la barberia terraza de la barberia': 'La Barbería',
  'hogar del jubilado la flecha': 'Bar Hogar del Jubilado La Flecha',
  'terraza hogar del jubilado la flecha': 'Bar Hogar del Jubilado La Flecha',
  'hogar del jubilado la flecha terraza': 'Bar Hogar del Jubilado La Flecha',
  'auditorio casa de la musica y el': 'Auditorio Casa de la Música y el Teatro',
  'auditorio de la casa de la musica y el': 'Auditorio Casa de la Música y el Teatro',
  'casa de la musica y el': 'Auditorio Casa de la Música y el Teatro',
  'casa de zorrilla': 'Casa de Zorrilla',
  'jardin romantico casa de zorrilla': 'Casa de Zorrilla',
  'casa de zorrilla narciso alonso cortes': 'Casa de Zorrilla',
  'amaranto narciso alonso cortes en casa museo zorrilla': 'Casa de Zorrilla',
  'casa de zorilla': 'Casa de Zorrilla',
  'zorilla': 'Teatro Zorrilla',
  'palacio de santa cruz': 'Palacio de Santa Cruz',
  'jardines del palacio de santa cruz': 'Palacio de Santa Cruz',
  'claustro del palacio de santa cruz': 'Palacio de Santa Cruz',
  'museo palacio de santa cruz': 'Palacio de Santa Cruz',
  'jardines del palacio de santa cruz universidad de valladolid': 'Palacio de Santa Cruz',
  'santa cruz universidad de valladolid': 'Palacio de Santa Cruz',
  'carcamal': 'Carcamal',
  'carcamal tapas': 'Carcamal',
  'carcamal tapas groove': 'Carcamal',
  'la terraza del carcamal': 'Carcamal',

  // Museo Nacional de Escultura: su sede es el Colegio de San Gregorio, así que
  // agrupamos el edificio y sus espacios internos (p. ej. "Rincón Rojo") bajo el museo.
  'colegio de san gregorio': 'Museo Nacional de Escultura',
  'rincon rojo colegio de san gregorio': 'Museo Nacional de Escultura',
  'museo nacional de escultura': 'Museo Nacional de Escultura'
};

export const VENUE_SLUG_MAP = {
  'Sala 1000': 'sala-1000',
  'Sala Porta Caeli': 'sala-porta-caeli',
  'Sala Ciento Cero': 'sala-ciento-cero',
  'Plaza de Portugalete': 'plaza-de-portugalete'
};

export const VENUE_GEO_OVERRIDES = {
  'Carcamal': {
    query: 'La Terraza del Carcamal Valladolid',
    lat: 41.62368,
    lon: -4.76157
  },
  'Instalaciones Deportivas “Los Pinos”': {
    query: 'Instalaciones Deportivas Los Pinos Valladolid',
    lat: 41.64517,
    lon: -4.73673
  }
};

// Clave normalizada de un venue: sin tildes, en minúsculas, sin palabras
// genéricas ("sala/espacio/centro/teatro/bar/csa/club") y con espacios
// colapsados. Fuente única (la usan build.mjs, site.mjs y el script de
// candidatos) para que la normalización no diverja entre sitios.
export function normalizeVenueKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(sala|espacio|centro|teatro|bar|csa|club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nombre canónico de un venue: primero por texto crudo en minúsculas, luego
// por clave normalizada; si no hay entrada en el mapa, devuelve el texto tal cual.
export function canonicalizeVenue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalizedKey = normalizeVenueKey(raw);
  return VENUE_CANONICAL_MAP[raw.toLowerCase()] || VENUE_CANONICAL_MAP[normalizedKey] || raw;
}
