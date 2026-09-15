# Aldea Pucela Eventos

Sitio web estático de agenda cultural de Aldea Pucela, generado automáticamente a partir de la categoría de eventos del foro Discourse.

## Objetivo del proyecto

- Publicar una agenda cultural clara, rápida y accesible.
- Evitar dependencia en tiempo real del foro durante la navegación.
- Facilitar despliegue continuo y mantenimiento sencillo.

## Stack y requisitos

### Stack principal

- Node.js (scripts de sincronización y build)
- Nunjucks (plantillas HTML)
- Tailwind CSS + PostCSS (estilos)
- GitHub Actions + GitHub Pages (CI/CD y hosting)

### Requisitos

- Node.js 20 o superior
- npm

## Instalación

```bash
npm install
```

## Comandos disponibles

```bash
npm run sync      # Sincroniza eventos desde Discourse a cache local
npm run build     # Genera el sitio estático en dist/
npm run rebuild   # Reconstrucción completa (re-sincroniza y regenera)
npm run dev       # Flujo de desarrollo local
npm run clean     # Elimina dist/
```

## Poster social automatizado

Hay un script auxiliar en [scripts/generate_events_poster.py](/Users/ruben/bin/aldeapucela/eventos/scripts/generate_events_poster.py) para componer un poster de Instagram a partir de una base visual y los proximos eventos publicados.

Lee por defecto `https://eventos.aldeapucela.org/site-data.json`, filtra los proximos `3` dias en horario de Madrid, elige hasta `6` eventos y coloca sus carteles sobre la imagen base.

Tiene dos modos de seleccion:

- `next-days`: reparte hasta `6` eventos entre los proximos dias para evitar que salgan todos del mismo dia.
- `next-weekend`: busca hasta `6` eventos variados del siguiente fin de semana, tomando como ventana desde el viernes a las `15:00` hasta el domingo a las `23:59` en horario de Madrid.

Bases por defecto segun el modo:

- `next-days`: `src/assets/social-base-story.jpg` y `src/assets/social-base-post.jpg`
- `next-weekend`: `src/assets/social-base-finde-story.jpg` y `src/assets/social-base-finde-post.jpg`

Salidas por defecto segun el modo:

- `next-days`: `scratch/posters/proximos-story.png` y `scratch/posters/proximos-post.png`
- `next-weekend`: `scratch/posters/proximos-weekend-story.png` y `scratch/posters/proximos-weekend-post.png`

Las imagenes generadas deben escribirse en `scratch/posters/`. La cache temporal de carteles descargados se guarda por defecto en `.cache/poster-images/`.

Ejemplo generando story y post en una sola ejecucion:

```bash
python3 scripts/generate_events_poster.py
```

Ejemplo para el siguiente fin de semana:

```bash
python3 scripts/generate_events_poster.py --mode next-weekend
```

Opciones utiles:

- `--days 4` para ampliar la ventana de eventos.
- `--limit 6` para ajustar el numero maximo de carteles.
- `--mode next-days` o `--mode next-weekend` para cambiar la logica de seleccion.
- `--story-output ...` o `--post-output ...` si quieres sobrescribir solo un destino.
- `--keep-cache` si alguna vez quieres conservar la cache temporal de imagenes descargadas.
- `--endpoint ...` para usar otro JSON compatible.

### Publicacion manual en GitHub Pages

El repositorio incluye dos workflows manuales para publicar posters en GitHub Pages:

- `generate-posters-next-days.yml`
- `generate-posters-next-weekend.yml`

Cada workflow:

- genera los PNG en `scratch/posters/`
- actualiza los posters versionados en `src/posters/`
- escribe un JSON minimo de metadata para automatizaciones externas
- hace commit automatico al repositorio para que el deploy normal de Pages los publique

Metadata publica disponible:

- `https://eventos.aldeapucela.org/posters/proximos.json`
- `https://eventos.aldeapucela.org/posters/proximos-weekend.json`

Formato esperado:

```json
{
  "mode": "next-days",
  "generatedAt": "2026-05-17T18:31:12Z",
  "success": true,
  "hasEvents": true,
  "eventCount": 4,
  "storyUrl": "https://eventos.aldeapucela.org/posters/proximos-story.png",
  "postUrl": "https://eventos.aldeapucela.org/posters/proximos-post.png"
}
```

La idea es que n8n consulte ese JSON y valide que la generacion es reciente antes de reutilizar la imagen.
Si `hasEvents` es `false`, el workflow solo actualiza la metadata y conserva los ultimos PNG versionados.

## Arquitectura y flujo de datos

El proyecto sigue una arquitectura estática:

1. `scripts/sync.mjs` consulta Discourse y normaliza eventos.
2. Los datos se guardan en `cache/` para reutilización y resiliencia.
3. `scripts/build.mjs` renderiza plantillas Nunjucks y assets.
4. El resultado final se publica en `dist/`.
5. GitHub Pages sirve el contenido generado.

Ventajas:

- rendimiento alto;
- SEO sólido con URLs únicas por evento;
- menor riesgo ante caídas o latencia de Discourse;
- despliegue reproducible.

### Sincronización incremental y caché

La caché no es un detalle de implementación prescindible: es la pieza que
permite que los cron de GitHub Pages sean ligeros. En un deploy normal no se
vuelven a descargar los detalles de todos los temas.

El flujo de `.github/workflows/deploy-pages.yml` es:

1. Restaura `cache/` y el estado de `.ci-state/`.
2. `scripts/check-events-signature.mjs` consulta el listado de Discourse y
   compara su digest con el anterior. Además, detecta ediciones del primer
   post mediante `updated_at` y firmas de contenido. Para no cargar el foro,
   solo sondea una tanda rotatoria de eventos vigentes o futuros (por defecto,
   20 por intervalo).
3. Si encuentra cambios, publica sus IDs en `refresh_ids`.
4. `scripts/build.mjs` llama al sincronizador con `rebuild: false`. Este
   conserva los registros cuyo `topicSignature` no ha cambiado y solo vuelve a
   leer los temas nuevos, editados o forzados mediante `EVENT_REFRESH_IDS`.
5. Guarda la caché actualizada y publica `dist/` en GitHub Pages.

Esto significa que si alguien edita manualmente el primer post de un evento
vigente o futuro, un deploy posterior reconstruye únicamente ese evento. Si se
necesita forzar un tema concreto, se puede pasar su ID mediante
`workflow_dispatch`/`EVENT_REFRESH_IDS`. No se utiliza un webhook: la
detección sucede durante el propio deploy leyendo Discourse por HTTP.

Reglas importantes para mantenimiento:

- No usar `--rebuild` en el deploy normal. La reconstrucción integral está
  reservada al workflow manual `resync-pages.yml`.
- No eliminar la restauración/guardado de `cache/`, `EVENT_REFRESH_IDS`, el
  detector de firmas ni `postUpdatedAt` del índice.
- No sustituir el camino normal por `loadCachedEvents`: impediría recoger
  ediciones del foro.
- No añadir una descarga completa de detalles al cron de 15 minutos.
- `cache/`, `dist/` y `.ci-state/` son artefactos generados y no se versionan.

La especificación ampliada para agentes de programación está en
[`AGENTS.md`](AGENTS.md).

## Estructura principal

```text
.
├─ src/
│  ├─ templates/       # Vistas Nunjucks (home, detalle, guardados, layout)
│  ├─ styles/          # CSS base y páginas
│  ├─ scripts/         # JS cliente
│  ├─ data/            # lógica de acceso/formato de datos
│  └─ assets/          # imágenes e iconos
├─ scripts/            # scripts de sync/build/dev
├─ cache/              # cache local de eventos sincronizados
├─ dist/               # salida estática lista para publicar
└─ .github/workflows/  # automatización CI/CD y despliegue
```

## Desarrollo local

Flujo recomendado:

1. Instalar dependencias: `npm install`
2. Sincronizar datos: `npm run sync`
3. Generar sitio: `npm run build`
4. Iterar con flujo local: `npm run dev`

Si detectas datos desactualizados o inconsistencias de cache, ejecuta `npm run rebuild`.

## Despliegue en GitHub Pages

El repositorio incluye workflow para:

- ejecución en cada `push` a `main`;
- ejecución programada por `cron` (actualmente cada 15 minutos, UTC);
- ejecución manual desde GitHub Actions.

Flujo del workflow:

1. instala dependencias;
2. sincroniza y reconstruye;
3. publica `dist/` en GitHub Pages.

### Activación rápida

1. Asegura que la rama principal sea `main`.
2. Ve a `Settings > Pages` en GitHub.
3. En `Build and deployment`, selecciona `GitHub Actions`.
4. Verifica permisos de Actions para publicar Pages.

## Configuración operativa

- Frecuencia de actualización: configurable en `cron` del workflow.
- Cache local: `cache/` reduce llamadas innecesarias y acelera builds; el
  deploy normal solo refresca los temas nuevos o modificados.
- Reconstrucción forzada: `npm run rebuild` para refresco integral.
- Artefactos generados (`dist/`, `cache/`) no necesitan versionarse.

## Troubleshooting básico

- Error por versión de Node:
  - confirma `node -v` y usa Node.js 20+.
- Build sin eventos o datos viejos:
  - revisa primero la salida de `check-events-signature.mjs` y la caché
    restaurada;
  - ejecuta `npm run rebuild` solo si necesitas una resincronización integral.
- Diferencias entre local y producción:
  - revisa la última ejecución del workflow en GitHub Actions.
- Fallo de publicación en Pages:
  - comprueba permisos y configuración en `Settings > Pages`.

## Licencias

### Código fuente

Este repositorio se distribuye bajo **GNU Affero General Public License v3.0 (AGPL-3.0-only)**. Consulta el archivo [`LICENSE`](./LICENSE).

### Contenido publicado en la web

El contenido editorial/publicado de la agenda se muestra bajo **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.

## Enlaces del proyecto

- Web comunidad: [https://aldeapucela.org](https://aldeapucela.org)
- Repositorio código: [https://github.com/aldeapucela/eventos](https://github.com/aldeapucela/eventos)
