# Aldea Pucela Eventos

Sitio estatico para la agenda de eventos de Aldea Pucela, generado a partir de la categoria de eventos del foro Discourse.

## Como funciona

1. `scripts/sync.mjs` consulta Discourse y guarda una cache local de los temas/eventos.
2. `scripts/build.mjs` genera el sitio estatico en `dist/`.
3. GitHub Pages publica el contenido generado para servir la web.

La arquitectura es deliberadamente estatica:

- mejor rendimiento y SEO;
- URLs unicas por evento;
- menor dependencia de Discourse en tiempo de visita;
- despliegue sencillo en GitHub Pages.

## Desarrollo local

Requisitos:

- Node.js 20 o superior
- npm

Instalacion:

```bash
npm install
```

Comandos disponibles:

```bash
npm run build
npm run rebuild
npm run sync
npm run dev
```

## Despliegue en GitHub Pages

El repositorio incluye un workflow que:

- se ejecuta en cada `push` a `main`;
- se ejecuta de forma programada cada hora;
- permite lanzarlo manualmente desde GitHub Actions;
- instala dependencias, reconstruye el sitio y publica `dist/` en GitHub Pages.

### Pasos para activarlo

1. Sube el repositorio a GitHub.
2. Asegurate de que la rama principal sea `main`.
3. En GitHub, ve a `Settings > Pages`.
4. En `Build and deployment`, selecciona `GitHub Actions`.
5. Comprueba que Actions tiene permisos para leer y escribir Pages.

No hace falta versionar `dist/` ni `cache/`; GitHub Actions los genera en cada despliegue.

## Notas

- La tarea programada usa UTC. El workflow actual corre a minuto `00` de cada hora.
- Si quieres otra frecuencia, cambia la expresion `cron` del workflow.
