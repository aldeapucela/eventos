# Invariantes del proyecto de eventos

Este repositorio genera una web estática a partir de los temas de eventos de
Discourse. Antes de modificar la sincronización, la caché o los workflows de
GitHub Pages, lee este archivo y el apartado **Sincronización incremental y
caché** del `README.md`.

## Flujo que se debe conservar

El despliegue normal (`.github/workflows/deploy-pages.yml`) funciona así:

1. GitHub restaura `cache/` y `.ci-state/`.
2. `scripts/check-events-signature.mjs` hace una comprobación ligera contra
   Discourse. Calcula un digest del listado y busca ediciones del primer post
   mediante `updated_at`/firmas. Solo sondea una tanda rotatoria de eventos
   vigentes o futuros, no los aproximadamente 1.500 temas completos.
3. Si hay cambios, el detector publica sus IDs en `refresh_ids`.
4. `scripts/build.mjs` ejecuta `syncEvents({ rebuild: false, ... })`. El
   sincronizador reutiliza cada registro cuyo `topicSignature` no haya
   cambiado y solo descarga el detalle de temas nuevos, editados o incluidos
   explícitamente en `EVENT_REFRESH_IDS`.
5. Se genera `dist/`, se guarda la caché y se publica GitHub Pages.

Por tanto, una edición manual del primer post de un evento vigente o futuro
debe terminar apareciendo en un deploy posterior y refrescar solo ese evento.
Si se necesita forzar cualquier tema concreto, se puede pasar su ID mediante
`workflow_dispatch`/`EVENT_REFRESH_IDS`. No hace falta ni se desea un webhook
de edición de Discourse.

## Reglas para cambios futuros

- No uses `--rebuild` en el deploy normal ni cambies `rebuild: false` por una
  reconstrucción completa. El rebuild integral está reservado a
  `resync-pages.yml` y a recuperaciones manuales.
- No elimines `EVENT_REFRESH_IDS`, la restauración/guardado de `cache/` o el
  detector de firmas. Son las piezas que permiten actualizar ediciones sin
  volver a descargar todo el foro.
- No sustituyas `syncEvents` por `loadCachedEvents` en el camino normal: eso
  impediría leer temas editados. `loadCachedEvents` solo sirve para el modo
  `--rebuild` porque el rebuild ya ha sincronizado la caché previamente.
- Si cambias `topicSignature`, `firstPostUpdatedAt`, el detector o el formato
  de `cache/index.json`, actualiza los tests de `tests/sync-lib.test.mjs` y
  comprueba tanto el caso sin cambios como el de un primer post editado.
- `topicSignature` y `postUpdatedAt` son señales distintas: la primera detecta
  cambios visibles en el listado y la segunda permite detectar una edición del
  primer post aunque Discourse no cambie `last_posted_at`. No elimines el
  fallback entre `updated_at` y `last_posted_at` sin una prueba equivalente.
- Mantén la comprobación selectiva acotada y con pausas. No añadas un bucle
  que descargue el detalle de todos los eventos en cada cron de 15 minutos.
- En los bloques `[event]`, `location` es el nombre del recinto y `address` la
  dirección postal. La agrupación debe usar solo `location`; la interfaz puede
  mostrar ambos mediante `displayLocation`. No vuelvas a guardar recinto y
  calle juntos en `location`.
- No hagas que un fallo puntual de la caché borre silenciosamente todos los
  registros existentes. Conserva la validación de salud de caché del workflow.
- `cache/`, `dist/` y `.ci-state/` son artefactos generados y están ignorados
  por Git; no se deben versionar.

## Cómo validar una modificación

Ejecuta `npm test` y revisa el diff del workflow. Para una comprobación
operativa, verifica que el deploy normal restaura la caché, produce un
`refresh_ids` vacío cuando no hay cambios y contiene solo los IDs editados
cuando se modifica un primer post. Usa `resync-pages.yml` únicamente cuando
se haya solicitado expresamente una resincronización integral.
