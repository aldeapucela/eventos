// Iconos de Font Awesome Free, compartidos por plantillas y navegador.
export const categoryPlaceholderIcons = {
  'Música': 'music', 'Festival': 'champagne-glasses', 'Teatro': 'masks-theater',
  'Exposición': 'image', 'Libros': 'book-open', 'Charlas': 'comments',
  'Comedia': 'face-laugh-beam', 'Ferias y mercados': 'store',
  'Conferencia': 'microphone', 'Espectáculo': 'star', 'Cine': 'film',
  'Infantil y familia': 'children', 'Danza': 'person-rays',
  'Magia y circo': 'hat-wizard', 'Visita guiada': 'person-walking',
  'Talleres': 'screwdriver-wrench', 'Gastronomía': 'utensils',
  'Recital': 'feather-pointed', 'Deportes': 'futbol', 'Ocio nocturno': 'moon'
};

export function eventPlaceholder(category) {
  const icon = categoryPlaceholderIcons[category] || 'calendar-days';
  return `/assets/event-placeholders/${icon}.svg`;
}
