// Nombre canónico/display de las categorías de evento. Une variantes del foro
// (Cine Proyeccion/Proyección → Cine; Otro/Otros → Otros; Infantil/Infantil
// Familiar → Infantil y familia) y pone tildes/forma bonita. Se aplica en build
// sobre event.categoryLabel (punto único), así que TODO lo demás —filtro "Tipo",
// etiquetas de las tarjetas, páginas de categoría, JSON-LD y feeds .ics— usa ya
// la misma etiqueta canónica.
export const CATEGORY_DISPLAY = {
  'Musica': 'Música',
  'Cine': 'Cine',
  'Cine Proyeccion': 'Cine',
  'Proyección': 'Cine',
  'Proyeccion': 'Cine',
  'Exposicion': 'Exposición',
  'Presentacion Libro': 'Libros',
  'Gastronomia Cata': 'Gastronomía',
  'Visita Guiada': 'Visita guiada',
  'Infantil Familiar': 'Infantil y familia',
  'Infantil': 'Infantil y familia',
  'Magia Circo': 'Magia y circo',
  'Feria Mercado': 'Ferias y mercados',
  'Otro': 'Otros',
  'Otros': 'Otros'
};

// Etiqueta canónica de una categoría; si no está en el mapa, se devuelve igual
// (Teatro, Festival, Charlas, Comedia, Danza, Conferencia, Espectáculo,
// Talleres, Recital, Deportes… no cambian).
export function canonicalizeCategory(label) {
  const value = String(label || '').trim();
  if (!value) return '';
  return CATEGORY_DISPLAY[value] || value;
}

// ponytail: self-check de que las fusiones pedidas colapsan a un único display.
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  console.assert(canonicalizeCategory('Cine Proyeccion') === 'Cine' && canonicalizeCategory('Proyección') === 'Cine' && canonicalizeCategory('Cine') === 'Cine', 'Cine no unifica');
  console.assert(canonicalizeCategory('Otro') === 'Otros' && canonicalizeCategory('Otros') === 'Otros', 'Otros no unifica');
  console.assert(canonicalizeCategory('Presentacion Libro') === 'Libros', 'Libros');
  console.assert(canonicalizeCategory('Gastronomia Cata') === 'Gastronomía', 'Gastronomía');
  console.assert(canonicalizeCategory('Infantil') === 'Infantil y familia' && canonicalizeCategory('Infantil Familiar') === 'Infantil y familia', 'Infantil no unifica');
  console.assert(canonicalizeCategory('Teatro') === 'Teatro', 'identidad');
  console.log('ok: category-aliases');
}
