// Páginas SEO por categoría (/musica/, /cine/...). Nombres curados en español
// porque las etiquetas del foro vienen sin tildes y a veces compuestas
// ("Musica", "Cine Proyeccion"). La clave es el categoryLabel real del foro.
// "Otro" queda fuera a propósito (cajón de sastre, sin valor SEO).
const CATEGORY_PAGES = {
  'Musica': { slug: 'musica', h1: 'Conciertos y música en Valladolid', h2: 'Toda la agenda de música en directo', description: 'Agenda de conciertos y música en directo en Valladolid: todos los próximos eventos musicales recopilados por la comunidad de Aldea Pucela.' },
  'Festival': { slug: 'festivales', h1: 'Festivales en Valladolid', h2: 'Todos los festivales que se acercan', description: 'Agenda de festivales en Valladolid: música, cultura y más. Todos los próximos festivales recopilados por la comunidad de Aldea Pucela.' },
  'Teatro': { slug: 'teatro', h1: 'Teatro en Valladolid', h2: 'Obras y compañías en cartel', description: 'Cartelera de teatro en Valladolid: todas las próximas obras y representaciones recopiladas por la comunidad de Aldea Pucela.' },
  'Exposicion': { slug: 'exposiciones', h1: 'Exposiciones en Valladolid', h2: 'Muestras y exposiciones de arte', description: 'Agenda de exposiciones en Valladolid: muestras de arte, fotografía y más, recopiladas por la comunidad de Aldea Pucela.' },
  'Presentacion Libro': { slug: 'presentaciones-de-libros', h1: 'Presentaciones de libros en Valladolid', h2: 'Novedades literarias y encuentros con autores', description: 'Agenda de presentaciones de libros en Valladolid: novedades y encuentros con autores recopilados por la comunidad de Aldea Pucela.' },
  'Charlas': { slug: 'charlas', h1: 'Charlas y coloquios en Valladolid', h2: 'Charlas, debates y coloquios', description: 'Agenda de charlas y coloquios en Valladolid: todos los próximos encuentros y debates recopilados por la comunidad de Aldea Pucela.' },
  'Comedia': { slug: 'comedia', h1: 'Comedia y monólogos en Valladolid', h2: 'Monólogos y espectáculos de humor', description: 'Agenda de comedia en Valladolid: monólogos y espectáculos de humor recopilados por la comunidad de Aldea Pucela.' },
  'Feria Mercado': { slug: 'ferias-y-mercados', h1: 'Ferias y mercados en Valladolid', h2: 'Mercadillos, ferias y mercados', description: 'Agenda de ferias y mercados en Valladolid: mercadillos y ferias recopilados por la comunidad de Aldea Pucela.' },
  'Conferencia': { slug: 'conferencias', h1: 'Conferencias en Valladolid', h2: 'Conferencias y ponencias', description: 'Agenda de conferencias en Valladolid: ponencias y encuentros divulgativos recopilados por la comunidad de Aldea Pucela.' },
  'Espectáculo': { slug: 'espectaculos', h1: 'Espectáculos en Valladolid', h2: 'Espectáculos en directo', description: 'Agenda de espectáculos en Valladolid: todas las próximas citas en directo recopiladas por la comunidad de Aldea Pucela.' },
  'Cine Proyeccion': { slug: 'cine', aliases: ['Proyección', 'Cine'], h1: 'Cine en Valladolid', h2: 'Proyecciones, ciclos y estrenos', description: 'Agenda de cine en Valladolid: proyecciones, ciclos y estrenos recopilados por la comunidad de Aldea Pucela.' },
  'Infantil Familiar': { slug: 'infantil-y-familia', h1: 'Planes infantiles y en familia en Valladolid', h2: 'Actividades para peques y familias', description: 'Agenda infantil y en familia en Valladolid: talleres, espectáculos y planes para peques recopilados por la comunidad de Aldea Pucela.' },
  'Danza': { slug: 'danza', h1: 'Danza en Valladolid', h2: 'Espectáculos de danza y baile', description: 'Agenda de danza en Valladolid: todos los próximos espectáculos de danza y baile recopilados por la comunidad de Aldea Pucela.' },
  'Magia Circo': { slug: 'magia-y-circo', h1: 'Magia y circo en Valladolid', h2: 'Espectáculos de magia y circo', description: 'Agenda de magia y circo en Valladolid: todas las próximas funciones recopiladas por la comunidad de Aldea Pucela.' },
  'Visita Guiada': { slug: 'visitas-guiadas', h1: 'Visitas guiadas en Valladolid', h2: 'Rutas y visitas guiadas por la ciudad', description: 'Agenda de visitas guiadas en Valladolid: rutas y recorridos para descubrir la ciudad, recopilados por la comunidad de Aldea Pucela.' },
  'Talleres': { slug: 'talleres', h1: 'Talleres en Valladolid', h2: 'Talleres y actividades formativas', description: 'Agenda de talleres en Valladolid: cursos y actividades formativas recopilados por la comunidad de Aldea Pucela.' },
  'Gastronomia Cata': { slug: 'gastronomia-y-catas', h1: 'Gastronomía y catas en Valladolid', h2: 'Catas, degustaciones y eventos gastronómicos', description: 'Agenda gastronómica en Valladolid: catas, degustaciones y eventos de comida y vino recopilados por la comunidad de Aldea Pucela.' },
  'Recital': { slug: 'recitales', h1: 'Recitales en Valladolid', h2: 'Recitales y poesía', description: 'Agenda de recitales en Valladolid: poesía y lecturas recopiladas por la comunidad de Aldea Pucela.' },
  'Deportes': { slug: 'deportes', h1: 'Eventos deportivos en Valladolid', h2: 'Deporte y actividades', description: 'Agenda deportiva en Valladolid: competiciones y actividades recopiladas por la comunidad de Aldea Pucela.' }
};

// Etiquetas del foro que apunta cada página (la clave + sus alias). Varias
// etiquetas pueden referirse a lo mismo (p. ej. "Cine Proyeccion", "Proyección"
// y "Cine"), así que la página recoge todas.
function pageLabels(label, meta) {
  return [label, ...(meta.aliases || [])];
}

// Solo categorías curadas con al menos una etiqueta presente en los datos.
export function getCategoryPages(events) {
  const present = new Set(events.map((event) => event.categoryLabel).filter(Boolean));
  return Object.entries(CATEGORY_PAGES)
    .map(([label, meta]) => ({
      labels: pageLabels(label, meta),
      slug: meta.slug,
      path: `/${meta.slug}/`,
      title: `${meta.h1} | Aldea Pucela`,
      h1: meta.h1,
      h2: meta.h2,
      description: meta.description
    }))
    .filter((page) => page.labels.some((label) => present.has(label)));
}

// Todas las etiquetas (clave + alias) que tienen página, para detectar
// categorías presentes que se quedarían sin página (las omite el filtrado).
export function mappedCategoryLabels() {
  return Object.entries(CATEGORY_PAGES).flatMap(([label, meta]) => pageLabels(label, meta));
}

// ponytail: self-check de slugs (únicos y sin chocar con rutas reservadas).
const RESERVED = new Set(['hoy', 'fin-de-semana', 'esta-semana', 'proxima-semana', 'este-mes', 'proximos-3-meses', 'archivo', 'espacios', 'guardados', 'e', 'calendar', 'assets', 'posters', 'img']);
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  const slugs = Object.values(CATEGORY_PAGES).map((m) => m.slug);
  console.assert(new Set(slugs).size === slugs.length, 'slugs de categoría duplicados');
  console.assert(!slugs.some((s) => RESERVED.has(s)), 'slug de categoría choca con ruta reservada');
  console.assert(!('Otro' in CATEGORY_PAGES), '"Otro" no debe tener página');
  const allLabels = mappedCategoryLabels();
  console.assert(new Set(allLabels).size === allLabels.length, 'una etiqueta (clave o alias) aparece en dos páginas');
  console.log(`ok: ${slugs.length} páginas, ${allLabels.length} etiquetas, sin colisiones`);
}
