// Páginas SEO por tipo (/t/musica/, /t/cine/...). La clave es el categoryLabel
// YA canónico (ver category-aliases.mjs: "Musica"→"Música", "Cine
// Proyeccion"/"Proyección"→"Cine", etc.). "Otros" queda fuera a propósito
// (cajón de sastre, sin valor SEO).
//
// `intro`: párrafo visible sobre el listado. Es el único texto propio de la
// página (todo lo demás son tarjetas de evento), así que aquí es donde se
// explica qué cabe en esta categoría y dónde suele pasar en Valladolid. Solo
// nombra espacios que existen en los datos del sitio (/espacios/).
const CATEGORY_PAGES = {
  'Música': { slug: 'musica', h1: 'Conciertos y música en Valladolid', h2: 'Toda la agenda de música en directo', intro: 'La música en directo de Valladolid se reparte entre la programación de temporada del Auditorio Miguel Delibes, los conciertos de salas como Porta Caeli o Ciento Cero, y los ciclos al aire libre que llenan plazas y parques en cuanto llega el buen tiempo. Aquí se juntan todos: clásica, jazz, grupos locales que presentan disco y bandas de gira, con las entradas gratuitas señaladas.', description: 'Agenda de conciertos y música en directo en Valladolid: todos los próximos eventos musicales recopilados por la comunidad de Aldea Pucela.' },
  'Festival': { slug: 'festivales', h1: 'Festivales en Valladolid', h2: 'Todos los festivales que se acercan', intro: 'Los festivales concentran en pocos días lo que el resto del año llega a cuentagotas, y en Valladolid van de los ciclos de música de verano a las citas de artes escénicas y las grandes concentraciones del Pabellón Pisuerga o Pingüinos Arena. Esta página los recoge completos, con las fechas de inicio y fin de cada uno para que se vea de un vistazo cuáles pillan el fin de semana.', description: 'Agenda de festivales en Valladolid: música, cultura y más. Todos los próximos festivales recopilados por la comunidad de Aldea Pucela.' },
  'Teatro': { slug: 'teatro', h1: 'Teatro en Valladolid', h2: 'Obras y compañías en cartel', intro: 'La cartelera teatral de Valladolid se sostiene sobre el Calderón, el Zorrilla, el Carrión y el LAVA, a los que se suman las salas pequeñas y los montajes de compañías de la ciudad. Aquí está todo lo que hay en cartel y lo que viene: texto clásico, contemporáneo, microteatro y funciones de compañías de paso.', description: 'Cartelera de teatro en Valladolid: todas las próximas obras y representaciones recopiladas por la comunidad de Aldea Pucela.' },
  'Exposición': { slug: 'exposiciones', h1: 'Exposiciones en Valladolid', h2: 'Muestras y exposiciones de arte', intro: 'Las exposiciones son el plan que no depende de una hora concreta: la mayoría se puede visitar durante semanas o meses. En Valladolid las reúnen el Museo Patio Herreriano, el Museo de la Ciencia, la Casa de Cervantes y las salas municipales, además de las galerías y los espacios que van abriendo muestras temporales. En cada ficha figura hasta cuándo se puede ver.', description: 'Agenda de exposiciones en Valladolid: muestras de arte, fotografía y más, recopiladas por la comunidad de Aldea Pucela.' },
  'Libros': { slug: 'presentaciones-de-libros', h1: 'Presentaciones de libros en Valladolid', h2: 'Novedades literarias y encuentros con autores', intro: 'Las presentaciones de libros son casi siempre gratuitas y con el autor delante, lo que las convierte en uno de los planes más accesibles de la ciudad. Aquí se recogen las novedades que pasan por librerías, bibliotecas, la Casa de Zorrilla y los centros culturales de Valladolid, con encuentros, firmas y lecturas.', description: 'Agenda de presentaciones de libros en Valladolid: novedades y encuentros con autores recopilados por la comunidad de Aldea Pucela.' },
  'Charlas': { slug: 'charlas', h1: 'Charlas y coloquios en Valladolid', h2: 'Charlas, debates y coloquios', intro: 'Charlas, debates y coloquios sobre lo que se cuece en la ciudad y fuera de ella: urbanismo, memoria, ciencia, feminismos, barrio. Suelen celebrarse en centros cívicos, bibliotecas y locales asociativos de Valladolid, casi siempre con entrada libre hasta completar aforo.', description: 'Agenda de charlas y coloquios en Valladolid: todos los próximos encuentros y debates recopilados por la comunidad de Aldea Pucela.' },
  'Comedia': { slug: 'comedia', h1: 'Comedia y monólogos en Valladolid', h2: 'Monólogos y espectáculos de humor', intro: 'El humor en directo de Valladolid va del monologuista consagrado que llena el Carrión o el Zorrilla al micro abierto de una sala pequeña un martes por la noche. Esta página junta las dos cosas: giras de stand-up, improvisación y espectáculos de humor de compañías locales.', description: 'Agenda de comedia en Valladolid: monólogos y espectáculos de humor recopilados por la comunidad de Aldea Pucela.' },
  'Ferias y mercados': { slug: 'ferias-y-mercados', h1: 'Ferias y mercados en Valladolid', h2: 'Mercadillos, ferias y mercados', intro: 'Mercadillos de artesanía, ferias del libro, mercados de productores, rastros y ferias temáticas que ocupan durante unos días la Plaza Mayor, el Campo Grande o los recintos feriales. Casi todos son de entrada libre y duran varias jornadas, así que en cada ficha aparece el rango completo de fechas.', description: 'Agenda de ferias y mercados en Valladolid: mercadillos y ferias recopilados por la comunidad de Aldea Pucela.' },
  'Conferencia': { slug: 'conferencias', h1: 'Conferencias en Valladolid', h2: 'Conferencias y ponencias', intro: 'Conferencias y ponencias con un tono más divulgativo o académico que las charlas: ciclos de universidad, sesiones de colegios profesionales, jornadas y encuentros técnicos que se celebran en Valladolid. Muchas son abiertas al público aunque requieran inscripción previa.', description: 'Agenda de conferencias en Valladolid: ponencias y encuentros divulgativos recopilados por la comunidad de Aldea Pucela.' },
  'Espectáculo': { slug: 'espectaculos', h1: 'Espectáculos en Valladolid', h2: 'Espectáculos en directo', intro: 'Todo lo que se ve en directo y no encaja limpiamente en teatro, danza o concierto: variedades, cabaret, espectáculos multidisciplinares, pasacalles y grandes montajes de calle. En Valladolid aparecen tanto en los teatros municipales como en plazas y espacios al aire libre.', description: 'Agenda de espectáculos en Valladolid: todas las próximas citas en directo recopiladas por la comunidad de Aldea Pucela.' },
  'Cine': { slug: 'cine', h1: 'Cine en Valladolid', h2: 'Proyecciones, ciclos y estrenos', intro: 'El cine en Valladolid no se acaba en la Seminci: hay ciclos de filmoteca, proyecciones al aire libre en verano, pases con debate posterior y sesiones en centros culturales y museos. Esta página recoge todo eso, incluidas las proyecciones gratuitas, que son bastantes.', description: 'Agenda de cine en Valladolid: proyecciones, ciclos y estrenos recopilados por la comunidad de Aldea Pucela.' },
  'Infantil y familia': { slug: 'infantil-y-familia', h1: 'Planes infantiles y en familia en Valladolid', h2: 'Actividades para peques y familias', intro: 'Planes para ir con peques: talleres de fin de semana en los museos, teatro y títeres para las primeras edades, cuentacuentos en bibliotecas y actividades al aire libre en el Campo Grande o las Moreras. Muchos son gratuitos y casi todos piden reservar plaza con antelación, porque se llenan rápido.', description: 'Agenda infantil y en familia en Valladolid: talleres, espectáculos y planes para peques recopilados por la comunidad de Aldea Pucela.' },
  'Danza': { slug: 'danza', h1: 'Danza en Valladolid', h2: 'Espectáculos de danza y baile', intro: 'Danza contemporánea, clásica, flamenco y baile popular, entre la programación del LAVA y el Calderón, las galas de las escuelas de la ciudad y las actuaciones al aire libre del verano. Aquí están todas las funciones que vienen, con las gratuitas marcadas.', description: 'Agenda de danza en Valladolid: todos los próximos espectáculos de danza y baile recopilados por la comunidad de Aldea Pucela.' },
  'Magia y circo': { slug: 'magia-y-circo', h1: 'Magia y circo en Valladolid', h2: 'Espectáculos de magia y circo', intro: 'Magia de cerca y de escenario, circo contemporáneo y espectáculos de calle que en Valladolid se ven tanto en los teatros como en plazas y festivales de verano. Suelen ser planes que funcionan igual de bien con niños que sin ellos.', description: 'Agenda de magia y circo en Valladolid: todas las próximas funciones recopiladas por la comunidad de Aldea Pucela.' },
  'Visita guiada': { slug: 'visitas-guiadas', h1: 'Visitas guiadas en Valladolid', h2: 'Rutas y visitas guiadas por la ciudad', intro: 'Visitas guiadas y rutas para recorrer Valladolid con alguien que la explica: el casco histórico, el Palacio Real, los museos, el patrimonio industrial o los itinerarios temáticos que se montan para una fecha concreta. Casi todas tienen plazas limitadas y hay que apuntarse antes.', description: 'Agenda de visitas guiadas en Valladolid: rutas y recorridos para descubrir la ciudad, recopilados por la comunidad de Aldea Pucela.' },
  'Talleres': { slug: 'talleres', h1: 'Talleres en Valladolid', h2: 'Talleres y actividades formativas', intro: 'Talleres y cursos cortos que se hacen en una o pocas sesiones: escritura, cerámica, huerto, fotografía, reparación, iniciación a la ciencia. En Valladolid los organizan museos, centros cívicos, bibliotecas y asociaciones de barrio, y la mayoría requiere inscripción previa.', description: 'Agenda de talleres en Valladolid: cursos y actividades formativas recopilados por la comunidad de Aldea Pucela.' },
  'Gastronomía': { slug: 'gastronomia-y-catas', h1: 'Gastronomía y catas en Valladolid', h2: 'Catas, degustaciones y eventos gastronómicos', intro: 'Catas de vino, jornadas gastronómicas, mercados de productores, showcookings y rutas de tapas. Estando en Valladolid, buena parte gira alrededor del vino de la provincia, pero también entran las citas de producto local y los eventos solidarios con comida.', description: 'Agenda gastronómica en Valladolid: catas, degustaciones y eventos de comida y vino recopilados por la comunidad de Aldea Pucela.' },
  'Recital': { slug: 'recitales', h1: 'Recitales en Valladolid', h2: 'Recitales y poesía', intro: 'Recitales de poesía, lecturas dramatizadas y sesiones de micro abierto, el formato más de sala pequeña que hay en la ciudad. En Valladolid se celebran en librerías, bares culturales, la Casa de Zorrilla y centros cívicos, normalmente con entrada libre.', description: 'Agenda de recitales en Valladolid: poesía y lecturas recopiladas por la comunidad de Aldea Pucela.' },
  'Deportes': { slug: 'deportes', h1: 'Eventos deportivos en Valladolid', h2: 'Deporte y actividades', intro: 'Carreras populares, partidos, torneos, marchas y actividades deportivas abiertas que se celebran en Valladolid y alrededores, del Pabellón Pisuerga a las orillas del Pisuerga. Muchas piden inscripción previa y tienen plazo de cierre, así que conviene mirar la ficha con tiempo.', description: 'Agenda deportiva en Valladolid: competiciones y actividades recopiladas por la comunidad de Aldea Pucela.' }
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
      path: `/t/${meta.slug}/`,
      title: `${meta.h1} | Aldea Pucela`,
      h1: meta.h1,
      h2: meta.h2,
      intro: meta.intro,
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
const RESERVED = new Set(['hoy', 'fin-de-semana', 'esta-semana', 'proxima-semana', 'este-mes', 'proximos-3-meses', 'archivo', 'espacios', 'tipos', 'guardados', 'e', 'calendar', 'assets', 'posters', 'img']);
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  const slugs = Object.values(CATEGORY_PAGES).map((m) => m.slug);
  console.assert(new Set(slugs).size === slugs.length, 'slugs de categoría duplicados');
  console.assert(!slugs.some((s) => RESERVED.has(s)), 'slug de categoría choca con ruta reservada');
  console.assert(!('Otros' in CATEGORY_PAGES), '"Otros" no debe tener página');
  const sinIntro = Object.entries(CATEGORY_PAGES).filter(([, m]) => !m.intro || m.intro.length < 120);
  console.assert(!sinIntro.length, `categorías sin intro propia: ${sinIntro.map(([k]) => k).join(', ')}`);
  const intros = Object.values(CATEGORY_PAGES).map((m) => m.intro);
  console.assert(new Set(intros).size === intros.length, 'dos categorías comparten la misma intro');
  const allLabels = mappedCategoryLabels();
  console.assert(new Set(allLabels).size === allLabels.length, 'una etiqueta (clave o alias) aparece en dos páginas');
  console.log(`ok: ${slugs.length} páginas, ${allLabels.length} etiquetas, sin colisiones`);
}
