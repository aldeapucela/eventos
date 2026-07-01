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
  'patio san benito': 'Patio de la Hospedería de San Benito'
};

export const VENUE_SLUG_MAP = {
  'Sala 1000': 'sala-1000',
  'Sala Porta Caeli': 'sala-porta-caeli',
  'Sala Ciento Cero': 'sala-ciento-cero',
  'Plaza de Portugalete': 'plaza-de-portugalete'
};

export const VENUE_GEO_OVERRIDES = {
  'La Terraza del Carcamal': {
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
