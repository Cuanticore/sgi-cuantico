# F1 · Cimientos — Plan de implementación

**Fase:** 1 de 8 · pasos 1–4 del plan maestro
**Plan maestro:** `2026-08-24-sgsi-handoff-v2.md`
**Diseño:** `../specs/2026-08-24-sgsi-handoff-v2-design.md`
**Estado:** Completada (2026-08-24), con una acción manual pendiente y dos hallazgos

**Goal:** Dejar el repositorio en condiciones de recibir el módulo SGSI: stack al día, base de datos disponible y tipografía del handoff — sin romper nada de lo que hoy funciona.

**Architecture:** El upgrade se aplicó en dos bloques atómicos (el recon previo determinó que no existe estado intermedio válido en ninguno de los dos). Prisma se cableó con el patrón de Prisma 7: URL en `prisma.config.ts` para el CLI y driver adapter para el runtime.

**Tech Stack resultante:** Next.js 16.3.2 (Turbopack), React 19.2.8, TypeScript 5, Tailwind CSS 4.3.3, Prisma 7.9.1 + `@prisma/adapter-pg`, Postgres 17.11, NextAuth 4.24.15 + Azure AD, ECharts 6, Jest 30, npm.

---

## File Map

| Archivo | Acción |
|---|---|
| `package.json` | Modificar — versiones; scripts `lint`, `test`, `db:up`, `db:down` |
| `app/page.tsx` | Modificar — `searchParams` asíncrono |
| `middleware.ts` | Modificar — envolver en función exportada |
| `next.config.js` | Modificar — quitar la clave `eslint` |
| `postcss.config.js` | Modificar — `@tailwindcss/postcss` |
| `app/globals.css` | Reescribir — `@import 'tailwindcss'`, estilos base en `@layer` |
| `app/layout.tsx` | Reescribir — Libre Franklin + JetBrains Mono |
| `eslint.config.mjs` | Crear — configuración plana |
| `.eslintrc.json` | Eliminar |
| `tailwind.config.js` | Eliminar |
| `app/fonts/` | Eliminar — Geist ya no se usa |
| `docker-compose.dev.yml` | Crear — Postgres 17 en el puerto 5437 |
| `prisma/schema.prisma` | Crear — generator + datasource, sin modelos |
| `prisma.config.ts` | Crear — URL de conexión para el CLI |
| `lib/db.ts` | Crear — cliente Prisma con adapter y guarda de hot-reload |
| `.gitignore` | Modificar — dejar de ignorar `docs/superpowers/` |
| 9 componentes en `app/components/` | Modificar — renombres de clases de Tailwind 4 |

---

## Paso 1 — Subir el stack

- [x] **1.1** Instalar `next@16.3.2`, `react`/`react-dom@19.2.8`, `next-auth@4.24.15`, `tailwindcss` y `@tailwindcss/postcss@4.3.3`, `@types/react@19.2.18`, `eslint@9`, `eslint-config-next@16.3.2`, `@types/node@24`. Desinstalar `autoprefixer` (Tailwind 4 prefija internamente)
- [x] **1.2** `app/page.tsx`: `searchParams` pasa a `Promise<{ year?: string }>` con `await`. Next 16 eliminó el acceso sincrónico; era el único sitio del repositorio
- [x] **1.3** `next.config.js`: quitar la clave `eslint`, eliminada en Next 16. `next build` ya no lintea, así que el comportamiento se conserva. `typescript.ignoreBuildErrors` y `output: 'standalone'` siguen válidos
- [x] **1.4** `.eslintrc.json` → `eslint.config.mjs` (plano). Script `lint` de `next lint` a `eslint .`, porque `next lint` fue eliminado
- [x] **1.5** `middleware.ts`: envolver en una función exportada. Next 16 exige un export de función estáticamente detectable y ya no reconoce `export { default } from 'next-auth/middleware'`. Se llama al mismo punto de entrada con los mismos argumentos, así que el comportamiento no cambia
- [x] **1.6** Tailwind 4: `postcss.config.js` a un solo plugin; `app/globals.css` a `@import 'tailwindcss'`; eliminar `tailwind.config.js` (solo tenía globos de contenido, autodetectados en v4, y dos variables de color que ningún componente usaba)
- [x] **1.7** Renombres de clases: `flex-shrink-0`→`shrink-0`, `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded`→`rounded-sm`, `backdrop-blur-sm`→`backdrop-blur-xs`, `focus:outline-none`→`focus:outline-hidden`, `bg-gradient-to-*`→`bg-linear-to-*`

### Defecto evitado en 1.6

`app/globals.css` tenía una regla `body` **sin capa** que fijaba `background` y `color` desde variables, más un bloque `prefers-color-scheme: dark`. En Tailwind 4 todo el output vive en `@layer` y el CSS sin capa **le gana a cualquier regla con capa**, sin importar la especificidad. Esa regla habría anulado `bg-slate-100` del `<body>` y habría dejado **fondo negro a todo visitante con el sistema en modo oscuro**.

Los estilos base ahora van dentro de `@layer base`. Se eliminaron las variables `--background`/`--foreground` y el bloque de modo oscuro: ningún componente los consumía.

Se agregó también `button:not(:disabled) { cursor: pointer }`, porque el preflight de Tailwind 4 pasa los botones a `cursor: default` y el repositorio tiene diez botones que dependían del valor anterior.

## Paso 2 — Postgres y Prisma

- [x] **2.1** `docker-compose.dev.yml`: Postgres 17-alpine, puerto de host **5437** (5436 está ocupado por otro proyecto de esta máquina), volumen nombrado `sgi-postgres-data`, healthcheck con `pg_isready`. Solo desarrollo; la base de producción no se define aquí
- [x] **2.2** `prisma/schema.prisma`: generator `prisma-client-js` y datasource `postgresql`, **sin modelos** — el dominio es F2
- [x] **2.3** `prisma.config.ts`: la URL de conexión vive aquí. Prisma 7 ya no la acepta en el schema y el CLI no lee `.env` por su cuenta, de ahí el `import 'dotenv/config'`
- [x] **2.4** `lib/db.ts`: cliente con `PrismaPg` como driver adapter y caché en `globalThis` contra el hot-reload
- [x] **2.5** Aprobar los install scripts bloqueados por npm (`@prisma/engines`, `prisma`, `sharp`, `unrs-resolver`). Sin el postinstall de `@prisma/engines`, `prisma generate` falla

### Decisión: Prisma 7, no 6

El andamiaje inicial fijaba Prisma 6.19.3 para evitar el salto de major. Se cambió a **7.9.1** porque `soar_cuantico` ya corre 7.8 y usar un major distinto del que el equipo conoce es una inconsistencia autoinfligida; además migrar sin modelos en el schema es el momento más barato posible.

Costo real, mayor al estimado: Prisma 7 obliga al modelo de driver adapter — `prisma.config.ts` más los paquetes `@prisma/adapter-pg`, `pg`, `dotenv` y `@types/pg`. El patrón se tomó de `soar_cuantico/prisma.config.ts` en lugar de improvisarlo.

## Paso 3 — Tipografía

- [x] **3.1** `app/layout.tsx`: Libre Franklin (400/500/600/700) y JetBrains Mono (400/500/600) desde Google Fonts, expuestas como `--font-libre-franklin` y `--font-jetbrains-mono`
- [x] **3.2** Eliminar `app/fonts/` (Geist). `GeistMonoVF.woff` no se usaba en ningún sitio
- [x] **3.3** `React.ReactNode` pasa a `import type { ReactNode }` explícito, en lugar de depender del namespace global UMD

Nota: la regla `font-family: Arial` que había en `globals.css` estaba anulando a Geist desde antes. La tipografía del handoff es la primera que se aplica de verdad.

## Paso 4 — Gate

- [x] **4.1** `npm run build` — compila en 3,2 s con Turbopack. Las 7 rutas se generan
- [x] **4.2** `npm run dev` — Next 16.3.2, listo en 668 ms (antes 6,1 s), leyendo `.env`
- [x] **4.3** Rutas sin cambio de comportamiento: `/auth/signin` 200 · `/` redirige y termina 200 en la pantalla de acceso · `/api/indicators` 307 protegido. El middleware y NextAuth siguen funcionando
- [x] **4.4** Camino de datos intacto sobre Next 16: `/api/debug` devuelve `ok:true`, 109 454 bytes y las mismas tres hojas del libro (`Descripción`, `Indicadores Gestión`, `Cuadro de Mando 2026`)
- [x] **4.5** Postgres 17.11 accesible en 5437; Prisma conecta a través de `prisma.config.ts`
- [x] **4.6** `npm test` — 23 de 24 pruebas en verde (ver hallazgo 2)

---

## Pendiente manual

`.env.example` está bloqueado por permisos de la herramienta. Agregar a mano:

```
# --- Base de datos (Postgres / Prisma) ---------------------------------------
# Desarrollo local: docker-compose.dev.yml expone Postgres en el puerto 5437.
DATABASE_URL=postgresql://sgi:sgi_dev_password@localhost:5437/sgi_sgsi?schema=public
SGI_POSTGRES_PASSWORD=sgi_dev_password
```

Las mismas dos líneas van en `.env` para que la aplicación y el CLI de Prisma vean la base sin inyectar la variable en cada comando.

## Hallazgos

**1. El Dockerfile va a fallar cuando algo importe `lib/db.ts`.** La etapa `deps` copia solo `package.json` y `package-lock.json` antes de `npm ci`, así que el postinstall de `@prisma/client` no encuentra schema y omite la generación en silencio. La etapa `builder` reutiliza ese `node_modules` mientras `COPY . .` sí trae `prisma/`, con lo que el build importa un cliente que nunca se generó. Se corrige con `COPY prisma ./prisma` en `deps` o un `prisma generate` explícito en `builder`. Corresponde al paso 44.

**2. Una prueba estaba roja desde antes de esta fase.** `parseIndicators › parses indicator rows from row 19 until col 1 is empty` espera 2 filas y recibe 0: el parser recorre desde la fila **18** (`app/lib/excel-parser.ts:147`) y corta al encontrar la columna 1 vacía, mientras el mock del test empieza en la 19. `git diff` confirma que ni el parser ni su prueba se tocaron en esta fase.

Nunca se había visto porque `package.json` no tenía script `test`. Se agregó en el paso 1.1 y el fallo latente apareció en la primera corrida. **Requiere decisión:** verificar contra el libro real si el primer indicador está en la fila 18 o en la 19, y corregir el lado equivocado. No se ajustó el test para ponerlo en verde.

**3. `middleware.ts` sigue con ese nombre a propósito.** Next 16 lo declara obsoleto en favor de `proxy.ts`, pero el cambio de nombre también mueve la ejecución del runtime edge a nodejs. Es el paso 44, con su propia verificación.

**4. El `catch` del tablero estaba ciego.** `app/page.tsx` capturaba con `catch { }`, sin parámetro: toda excepción se traducía al mismo mensaje «No se pudo conectar a SharePoint», sin log ni rastro. Se corrigió durante la verificación del gate, cuando un fallo transitorio al renderizar el tablero autenticado no dejó ninguna evidencia que seguir.

Ahora el error se registra en consola y, solo en desarrollo, se muestra el stack en pantalla; en producción se conserva el mensaje limpio. El texto también se corrigió: culpaba a SharePoint cuando la conexión estaba demostradamente sana, así que pasó a «No se pudo cargar la matriz de indicadores».

El fallo transitorio no volvió a reproducirse y su causa quedó sin identificar. Si reaparece, la instrumentación ya está puesta.
