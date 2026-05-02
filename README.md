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
- ejecución programada por `cron` (actualmente cada hora, minuto `00`, UTC);
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
- Cache local: `cache/` reduce llamadas innecesarias y acelera builds.
- Reconstrucción forzada: `npm run rebuild` para refresco integral.
- Artefactos generados (`dist/`, `cache/`) no necesitan versionarse.

## Troubleshooting básico

- Error por versión de Node:
  - confirma `node -v` y usa Node.js 20+.
- Build sin eventos o datos viejos:
  - ejecuta `npm run rebuild`.
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
