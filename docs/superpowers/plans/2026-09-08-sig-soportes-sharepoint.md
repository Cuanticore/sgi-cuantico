# Publicación de soportes en SharePoint — Plan de implementación (REQ-SIG-13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada acta de aceptación y firma que la aplicación genera quede publicada en SharePoint, en la carpeta de la persona que firmó, sin que un fallo de Microsoft Graph pueda impedir una firma.

**Architecture:** La base sigue siendo la fuente de verdad (D-1). Al firmar se encola una fila `PublicacionSoporte` en estado `PENDIENTE` dentro de la misma transacción, y la publicación ocurre **fuera** de ella: primero como disparo inmediato sin bloquear la respuesta, y como red de seguridad un trabajo programado horario que drena la cola con esperas crecientes. Las decisiones (nombres, saneamiento, reintentos) viven en un módulo puro con pruebas; la red vive en `app/lib/sharepoint.ts`, que ya resuelve sitio y biblioteca para los indicadores y se extiende en vez de duplicarse.

**Tech Stack:** Next 16 (App Router, `route.ts`), Prisma 7 + Postgres, Microsoft Graph v1.0 con `axios`, jest + ts-jest (`npm test`).

**Requerimiento:** `docs/handoff_sig/soportes-en-sharepoint.md` — las reglas se citan como P1…P13 y las decisiones como D-1…D-4.

---

## Preparación · antes de la Task 1

```bash
npm install
npx prisma generate      # ← NO es opcional, ver abajo
npm test
npx tsc --noEmit -p tsconfig.json
npm run lint
```

**`npx prisma generate` primero, o vas a perseguir fantasmas.** Con el cliente de Prisma desactualizado, `tsc` reporta ~25 errores del tipo «Property 'hallazgo' does not exist on type 'PrismaClient'» en archivos que nadie tocó. No están rotos: el cliente generado no tiene los modelos que el esquema sí tiene. Después de generar, desaparecen todos.

**Este es el estado verde del repositorio, medido el 08/09/2026.** Si tu primera corrida no da esto, el problema es de entorno y no del plan:

| Comando | Resultado esperado |
|---|---|
| `npm test` | **49 suites, 911 pruebas, todas pasan** (~57 s) |
| `npx tsc --noEmit -p tsconfig.json` | **0 errores** |
| `npm run lint` | **0 errores, 5 advertencias** — las cinco son preexistentes y no son tuyas |

Cuando un paso del plan diga «sin errores» o «lint limpio», es contra este baseline: 0 errores, y las 5 advertencias de siempre.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sig/soportes-sharepoint.ts` **(crear)** | **Puro.** Nombre de carpeta y de archivo, saneamiento, ruta, política de reintentos. Sin Prisma, sin axios: es lo que se prueba en jest |
| `lib/sig/__tests__/soportes-sharepoint.test.ts` **(crear)** | Pruebas del módulo puro |
| `app/lib/sharepoint.ts` **(modificar)** | Se le agrega la escritura a Graph: resolver carpeta base, asegurar/renombrar la carpeta de la persona, subir el archivo. Reusa `getToken`/`getSiteId`/`getDriveId` |
| `app/lib/__tests__/sharepoint.test.ts` **(crear)** | Pruebas con `axios` simulado: clasificación de fallos y la idempotencia del 409 |
| `lib/sig/publicador-soportes.ts` **(crear)** | Impuro (Prisma + Graph). Publica una fila y drena la cola. Sin lógica de decisión propia: la importa del módulo puro |
| `prisma/schema.prisma` **(modificar)** | `PublicacionSoporte`, `EstadoPublicacion`, y las dos columnas nuevas de `Persona` |
| `app/sig/acciones/firma.ts` **(modificar)** | Encola dentro de la transacción; dispara la publicación fuera |
| `lib/sig/trabajos-catalogo.ts` **(modificar)** | Declara `publicar-soportes` |
| `lib/sig/trabajos.ts` **(modificar)** | Lo cablea en `IMPLEMENTACIONES` |
| `app/sig/colaboradores/[id]/page.tsx` **(modificar)** | Enlace a SharePoint por acta (pantalla de responsables) |
| `app/mi-sig/historial/page.tsx` **(modificar)** | La ruta de la aplicación, nunca el `webUrl` (P12) |
| `app/mi-sig/diagnostico/page.tsx` **(modificar)** | Cuántos pendientes y bloqueados, con la causa |
| `.env.example` **(modificar)** | `SHAREPOINT_SOPORTES_PATH` |

---

## Task 1: El módulo puro de decisiones

**Files:**
- Create: `lib/sig/soportes-sharepoint.ts`
- Test: `lib/sig/__tests__/soportes-sharepoint.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sig/__tests__/soportes-sharepoint.test.ts`:

```ts
// lib/sig/__tests__/soportes-sharepoint.test.ts
//
// Lo que se prueba acá es lo que decide DÓNDE y CÓMO se llama un soporte publicado, y
// cuándo vale la pena reintentar. Es puro a propósito: la parte que habla con Graph no se
// puede probar sin red, y la parte que decide sí — así que la decisión no vive con la red.

import {
  INTENTOS_MAXIMOS,
  debeDetenerElLote,
  debeReintentar,
  esperaAntesDeReintentar,
  estadoTrasFallo,
  gastaIntento,
  nombreDeArchivo,
  nombreDeCarpeta,
  rutaCompleta,
  sanear,
} from '../soportes-sharepoint';

const BASE =
  '09. SISTEMA INTEGRADO DE GESTION/14. Seguridad de la Informacion/' +
  '11. Automatizaciones y requerimientos SIG/2. Soportes SIG';

describe('nombreDeCarpeta', () => {
  it('es la parte local del correo, en minúsculas', () => {
    expect(nombreDeCarpeta('Daniel.Medina@cuantico.com')).toBe('daniel.medina');
  });

  // D-3 · dos personas que se llaman igual tienen correos distintos, y por eso la carpeta
  // no se puede llamar «Apellido Nombre»: los soportes de una caerían en la de la otra.
  it('distingue homónimos porque el correo es único', () => {
    expect(nombreDeCarpeta('lmedina@cuantico.com')).not.toBe(
      nombreDeCarpeta('lmedina2@cuantico.com'),
    );
  });

  it('sin arroba usa el valor completo', () => {
    expect(nombreDeCarpeta('sistemas')).toBe('sistemas');
  });

  it('un correo sin parte local utilizable es un error, no una carpeta rara', () => {
    expect(() => nombreDeCarpeta('@cuantico.com')).toThrow(/parte local/);
  });
});

describe('sanear', () => {
  // P5 · SharePoint rechaza estos caracteres. Un título con «/» partiría la ruta.
  it('reemplaza los caracteres que SharePoint prohíbe', () => {
    expect(sanear('Política: seguridad/privacidad <v2>')).toBe(
      'Política- seguridad-privacidad -v2-',
    );
  });

  it('recorta espacios de los extremos y colapsa los internos', () => {
    expect(sanear('  Acta   de    firma  ')).toBe('Acta de firma');
  });

  it('quita el prefijo ~$ que SharePoint rechaza', () => {
    expect(sanear('~$temporal')).toBe('temporal');
  });
});

describe('nombreDeArchivo', () => {
  const ACTA = {
    codigo: 'ACT-2026-0014',
    documentoCodigo: 'POL-SIG-02',
    documentoVersion: 3,
    aceptadoEn: new Date('2026-09-08T14:30:00.000Z'),
    extension: 'txt',
  };

  it('lleva el código, el documento con su versión y la fecha', () => {
    expect(nombreDeArchivo(ACTA)).toBe('ACT-2026-0014 — POL-SIG-02 v3 — 2026-09-08.txt');
  });

  it('sin documento se queda con el código y la fecha', () => {
    expect(nombreDeArchivo({ ...ACTA, documentoCodigo: null, documentoVersion: null })).toBe(
      'ACT-2026-0014 — 2026-09-08.txt',
    );
  });

  it('acepta el punto en la extensión y no lo duplica', () => {
    expect(nombreDeArchivo({ ...ACTA, extension: '.pdf' })).toMatch(/\.pdf$/);
  });

  // P5 · el nombre se recorta, pero el CÓDIGO se preserva siempre: es con lo que se
  // reencuentra el soporte desde la base. Un recorte que se coma el código deja un archivo
  // que nadie puede volver a relacionar con su acta.
  it('recorta a 120 caracteres preservando el código y la extensión', () => {
    const largo = nombreDeArchivo({ ...ACTA, documentoCodigo: 'X'.repeat(300) });
    expect(largo.length).toBeLessThanOrEqual(120);
    expect(largo.startsWith('ACT-2026-0014 — ')).toBe(true);
    expect(largo.endsWith('.txt')).toBe(true);
  });
});

describe('rutaCompleta', () => {
  it('une base, carpeta y archivo con una sola barra', () => {
    expect(rutaCompleta(`/${BASE}/`, 'daniel.medina', 'ACT-2026-0014.txt')).toBe(
      `${BASE}/daniel.medina/ACT-2026-0014.txt`,
    );
  });
});

describe('política de reintentos', () => {
  // P9 · un 403 no se arregla reintentando: se arregla en Azure. Reintentarlo un día lo
  // esconde, y el 403 es información que alguien necesita ver hoy.
  it('no reintenta lo que no se arregla solo', () => {
    expect(debeReintentar('SIN_PERMISO', 1)).toBe(false);
    expect(debeReintentar('NO_EXISTE', 1)).toBe(false);
  });

  it('reintenta lo transitorio hasta el techo', () => {
    expect(debeReintentar('DEMASIADAS_CONSULTAS', 1)).toBe(true);
    expect(debeReintentar('SIN_RED', INTENTOS_MAXIMOS - 1)).toBe(true);
    expect(debeReintentar('SIN_RED', INTENTOS_MAXIMOS)).toBe(false);
  });

  // P9 · sin variables no hay nada que reintentar: no se gasta intento, o la cola se
  // quemaría sola mientras alguien termina de configurar el entorno.
  it('la falta de configuración no gasta intento', () => {
    expect(gastaIntento('SIN_CONFIGURAR')).toBe(false);
    expect(gastaIntento('SIN_RED')).toBe(true);
    expect(debeReintentar('SIN_CONFIGURAR', 99)).toBe(true);
  });

  it('las esperas crecen y se estancan en 24 horas', () => {
    expect(esperaAntesDeReintentar(1)).toBe(60_000);
    expect(esperaAntesDeReintentar(3)).toBe(900_000);
    expect(esperaAntesDeReintentar(99)).toBe(86_400_000);
  });

  it('lo que no se reintenta queda BLOQUEADO y visible', () => {
    expect(estadoTrasFallo('SIN_PERMISO', 1)).toBe('BLOQUEADO');
    expect(estadoTrasFallo('DEMASIADAS_CONSULTAS', 1)).toBe('PENDIENTE');
  });

  // Si la causa es del entorno, los 300 soportes siguientes van a fallar igual.
  it('detiene el lote cuando la causa es del entorno', () => {
    expect(debeDetenerElLote('SIN_CONFIGURAR')).toBe(true);
    expect(debeDetenerElLote('CREDENCIAL_RECHAZADA')).toBe(true);
    expect(debeDetenerElLote('SIN_RED')).toBe(true);
    expect(debeDetenerElLote('DEMASIADAS_CONSULTAS')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npm test -- soportes-sharepoint`
Expected: FAIL — `Cannot find module '../soportes-sharepoint'`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/sig/soportes-sharepoint.ts`:

```ts
// lib/sig/soportes-sharepoint.ts
//
// DÓNDE va un soporte publicado, CÓMO se llama y CUÁNDO vale reintentar.
//
// Puro y sin red a propósito: el módulo que habla con Graph no se puede probar sin salir a
// internet, y estas decisiones sí. Mismo criterio que `trabajos-catalogo.ts` frente a
// `trabajos.ts`.

import type { FalloGraph } from '@/lib/sgsi/graph-fallo';

export type CausaGraph = FalloGraph['causa'];

/// Los caracteres que SharePoint rechaza en el nombre de un archivo o carpeta.
const PROHIBIDOS = /["*:<>?/\\|]/g;

/// El nombre completo (base incluida) no puede pasar de 400 caracteres en SharePoint. 120
/// para el archivo deja margen de sobra para la carpeta base del SIG, que ya es larga.
export const LARGO_MAXIMO_ARCHIVO = 120;

export function sanear(nombre: string): string {
  return nombre
    .replace(PROHIBIDOS, '-')
    .replace(/^[~$]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/// D-3 · la carpeta es la parte local del correo corporativo. Única en el tenant, legible
/// al navegar la biblioteca, y sobrevive a un cambio de nombre de la persona.
export function nombreDeCarpeta(correo: string): string {
  const arroba = correo.indexOf('@');
  const local = arroba === -1 ? correo : correo.slice(0, arroba);
  const limpio = sanear(local.toLowerCase());
  if (limpio === '') {
    throw new Error(`el correo «${correo}» no tiene parte local utilizable como carpeta`);
  }
  return limpio;
}

export interface DatosDelSoporte {
  /// El código del acta. Es la llave: se preserva incluso al recortar el nombre.
  codigo: string;
  documentoCodigo: string | null;
  documentoVersion: number | null;
  aceptadoEn: Date;
  extension: string;
}

export function nombreDeArchivo(d: DatosDelSoporte): string {
  const codigo = sanear(d.codigo);
  // Misma convención de fecha que el resto de `lib/sig/` (`generacion.ts:256`).
  const fecha = d.aceptadoEn.toISOString().slice(0, 10);
  const sufijo = `.${d.extension.replace(/^\./, '')}`;
  const documento =
    d.documentoCodigo === null
      ? null
      : d.documentoVersion === null
        ? sanear(d.documentoCodigo)
        : `${sanear(d.documentoCodigo)} v${d.documentoVersion}`;

  const completo = [codigo, documento, fecha].filter((p) => p !== null && p !== '').join(' — ');
  if (completo.length + sufijo.length <= LARGO_MAXIMO_ARCHIVO) return completo + sufijo;

  const cabeza = `${codigo} — `;
  const cola = ` — ${fecha}${sufijo}`;
  const disponible = LARGO_MAXIMO_ARCHIVO - cabeza.length - cola.length;
  if (disponible <= 0 || documento === null) return `${codigo}${sufijo}`;
  return `${cabeza}${documento.slice(0, disponible).trimEnd()}${cola}`;
}

export function rutaCompleta(base: string, carpeta: string, archivo: string): string {
  return `${base.replace(/^\/+|\/+$/g, '')}/${carpeta}/${archivo}`;
}

/// P9 · las esperas del reintento. Crecen porque una caída de Graph que dura una hora no se
/// arregla consultando cada minuto, y se estancan en 24 h porque más allá de eso el
/// problema ya no es transitorio y alguien tiene que mirarlo.
const ESPERAS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000];

export const INTENTOS_MAXIMOS = ESPERAS_MS.length;

/// `SIN_CONFIGURAR` no gasta intento: no hay nada que reintentar hasta que las variables
/// existan, y quemar la cola mientras alguien configura el entorno dejaría todo BLOQUEADO
/// por un motivo que se resolvió solo.
export function gastaIntento(causa: CausaGraph): boolean {
  return causa !== 'SIN_CONFIGURAR';
}

export function debeReintentar(causa: CausaGraph, intentos: number): boolean {
  if (causa === 'SIN_PERMISO' || causa === 'NO_EXISTE') return false;
  if (causa === 'SIN_CONFIGURAR') return true;
  return intentos < INTENTOS_MAXIMOS;
}

export function esperaAntesDeReintentar(intentos: number): number {
  const indice = Math.min(Math.max(intentos, 1), ESPERAS_MS.length) - 1;
  return ESPERAS_MS[indice];
}

export function estadoTrasFallo(
  causa: CausaGraph,
  intentos: number,
): 'PENDIENTE' | 'BLOQUEADO' {
  return debeReintentar(causa, intentos) ? 'PENDIENTE' : 'BLOQUEADO';
}

/// Si la causa es del entorno, los soportes que siguen en el lote van a fallar igual: 300
/// llamadas condenadas sólo llenan el registro de ruido.
export function debeDetenerElLote(causa: CausaGraph): boolean {
  return causa === 'SIN_CONFIGURAR' || causa === 'CREDENCIAL_RECHAZADA' || causa === 'SIN_RED';
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npm test -- soportes-sharepoint`
Expected: PASS — 16 pruebas

- [ ] **Step 5: Commit**

```bash
git add lib/sig/soportes-sharepoint.ts lib/sig/__tests__/soportes-sharepoint.test.ts
git commit -m "feat(sig): las decisiones de publicar un soporte, puras y probadas"
```

---

## Task 2: El modelo de datos

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_publicacion_soportes/migration.sql` (la genera Prisma)

- [ ] **Step 1: Agregar el enum y el modelo**

En `prisma/schema.prisma`, junto a los demás enums del módulo SIG:

```prisma
enum EstadoPublicacion {
  PENDIENTE
  PUBLICADO
  /// No se reintenta más: la causa no se arregla sola (403, 404). Queda visible con su
  /// motivo, que es lo que un booleano `publicado` no podría responder.
  BLOQUEADO

  @@map("estado_publicacion")
}

model PublicacionSoporte {
  id              Int               @id @default(autoincrement())
  /// La llave es la EVIDENCIA y no el acta: así sumar un segundo tipo de soporte mañana no
  /// exige una tabla nueva ni una segunda máquina de publicar.
  evidenciaId     Int               @unique @map("evidencia_id")
  /// A quién pertenece el soporte. Es lo que decide la carpeta.
  personaId       Int               @map("persona_id")
  estado          EstadoPublicacion @default(PENDIENTE)
  intentos        Int               @default(0)
  ultimoIntentoEn DateTime?         @map("ultimo_intento_en")
  /// La `causa` de `FalloGraph`, tal cual. Sin esto, «¿por qué no está en SharePoint?» no
  /// tiene respuesta.
  causaFallo      String?           @map("causa_fallo")
  detalleFallo    String?           @map("detalle_fallo")
  driveItemId     String?           @map("drive_item_id")
  webUrl          String?           @map("web_url")
  rutaPublicada   String?           @map("ruta_publicada")
  nombreArchivo   String?           @map("nombre_archivo")
  publicadoEn     DateTime?         @map("publicado_en")
  /// La baja lógica de la evidencia NO borra el archivo publicado: se anota. Borrar el
  /// soporte de una auditoría es el artefacto que la auditoría busca.
  bajaAnotadaEn   DateTime?         @map("baja_anotada_en")
  creadaEn        DateTime          @default(now()) @map("creada_en")

  evidencia Evidencia @relation(fields: [evidenciaId], references: [id])
  persona   Persona   @relation("PublicacionPersona", fields: [personaId], references: [id])

  @@index([estado, ultimoIntentoEn])
  @@map("publicacion_soporte")
}
```

- [ ] **Step 2: Agregar las relaciones inversas y las dos columnas de `Persona`**

En `model Evidencia`, junto a `archivo EvidenciaArchivo?`:

```prisma
  publicacion PublicacionSoporte?
```

En `model Persona`, junto a `actasAceptacion`:

```prisma
  /// P2 · el `driveItem.id` de su carpeta de soportes. Se direcciona por id y no por
  /// nombre: si alguien renombra la carpeta en SharePoint —y alguien lo hará—, las
  /// publicaciones siguen cayendo donde deben en vez de crear una segunda.
  carpetaSoportesId   String? @map("carpeta_soportes_id")
  /// El nombre con el que se creó, para detectar el renombre por cambio de correo (P4).
  carpetaSoportesRuta String? @map("carpeta_soportes_ruta")

  soportesPublicados PublicacionSoporte[] @relation("PublicacionPersona")
```

- [ ] **Step 3: Generar y aplicar la migración**

```bash
npm run db:up
npx prisma migrate dev --name publicacion_soportes
```

Expected: `Your database is now in sync with your schema` y un directorio nuevo en `prisma/migrations/`.

- [ ] **Step 4: Verificar que la tabla quedó como se espera**

```bash
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U sgi -d sgi_sgsi -c '\d publicacion_soporte'
```

Expected: las columnas `evidencia_id` (único), `estado`, `intentos`, `causa_fallo`, `drive_item_id`, `web_url`, y el índice sobre `(estado, ultimo_intento_en)`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sig): la cola de publicacion de soportes y la carpeta de cada persona"
```

---

## Task 3: Escribir en SharePoint

**Files:**
- Modify: `app/lib/sharepoint.ts`
- Test: `app/lib/__tests__/sharepoint.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `app/lib/__tests__/sharepoint.test.ts`:

```ts
// app/lib/__tests__/sharepoint.test.ts
//
// La red se simula; lo que se prueba es lo que la aplicación DEDUCE de cada respuesta de
// Graph. Dos cosas importan más que las demás:
//
//   1. Un 403 tiene que decir «falta el permiso», y nombrarlo. Antes de `graph-fallo.ts`
//      todo fallo era `null` y la pantalla mandaba a conceder permisos ya concedidos.
//   2. Un 409 al subir significa «ya está publicado», no «error»: es lo que hace que el
//      cron pueda reintentar sin duplicar (P6).

const get = jest.fn();
const post = jest.fn();
const put = jest.fn();
const patch = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({ get, post, put, patch }),
    isAxiosError: (e: unknown) =>
      typeof e === 'object' && e !== null && 'esDeAxios' in (e as Record<string, unknown>),
  },
}));

function errorGraph(status: number) {
  return { esDeAxios: true, response: { status, data: {} }, message: `status ${status}` };
}

function sinRed() {
  return { esDeAxios: true, code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' };
}

async function modulo() {
  jest.resetModules();
  return import('../sharepoint');
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SHAREPOINT_TENANT_ID = 'tenant';
  process.env.SHAREPOINT_CLIENT_ID = 'cliente';
  process.env.SHAREPOINT_CLIENT_SECRET = 'secreto';
  process.env.SHAREPOINT_SITE_URL = 'cuanticore.sharepoint.com';
  process.env.SHAREPOINT_SITE_NAME = 'Cuantico';
  process.env.SHAREPOINT_SOPORTES_PATH = '09. SIG/2. Soportes SIG';
  post.mockResolvedValue({ data: { access_token: 'token' } });
});

describe('resolverCarpetaBase', () => {
  it('resuelve sitio, biblioteca y carpeta base', async () => {
    get
      .mockResolvedValueOnce({ data: { id: 'sitio-1' } })
      .mockResolvedValueOnce({ data: { value: [{ id: 'drive-1', name: 'Shared Documents' }] } })
      .mockResolvedValueOnce({ data: { id: 'carpeta-base' } });

    const { resolverCarpetaBase } = await modulo();
    const r = await resolverCarpetaBase();

    expect(r).toEqual({ ok: true, datos: { driveId: 'drive-1', carpetaBaseId: 'carpeta-base' } });
  });

  // P1 · la carpeta base NO se crea. Crearla convertiría una variable mal escrita en un
  // árbol fantasma dentro de la biblioteca del SIG.
  it('un 404 en la carpeta base es NO_EXISTE y no crea nada', async () => {
    get
      .mockResolvedValueOnce({ data: { id: 'sitio-1' } })
      .mockResolvedValueOnce({ data: { value: [{ id: 'drive-1', name: 'Shared Documents' }] } })
      .mockRejectedValueOnce(errorGraph(404));

    const { resolverCarpetaBase } = await modulo();
    const r = await resolverCarpetaBase();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo.causa).toBe('NO_EXISTE');
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining('/children'), expect.anything(), expect.anything());
  });

  it('sin variables no intenta ninguna consulta', async () => {
    process.env.SHAREPOINT_CLIENT_SECRET = '';
    const { resolverCarpetaBase } = await modulo();
    const r = await resolverCarpetaBase();

    expect(r.ok).toBe(false);
    if (!r.ok && r.fallo.causa === 'SIN_CONFIGURAR') {
      expect(r.fallo.faltan).toContain('SHAREPOINT_CLIENT_SECRET');
    } else {
      throw new Error('se esperaba SIN_CONFIGURAR');
    }
    expect(get).not.toHaveBeenCalled();
  });
});

describe('subirSoporte', () => {
  it('sube y devuelve el id y el enlace', async () => {
    put.mockResolvedValueOnce({ data: { id: 'item-9', webUrl: 'https://sp/acta.txt' } });

    const { subirSoporte } = await modulo();
    const r = await subirSoporte('drive-1', 'carpeta-1', 'ACT-2026-0001.txt', Buffer.from('acta'), 'text/plain');

    expect(r).toEqual({ ok: true, datos: { id: 'item-9', webUrl: 'https://sp/acta.txt' } });
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining('conflictBehavior=fail'),
      expect.anything(),
      expect.anything(),
    );
  });

  // P6 · el reintento tiene que ser idempotente: un 409 es «ya está», no un fallo.
  it('un 409 se resuelve consultando el ítem que ya existe', async () => {
    put.mockRejectedValueOnce(errorGraph(409));
    get.mockResolvedValueOnce({ data: { id: 'item-previo', webUrl: 'https://sp/previo.txt' } });

    const { subirSoporte } = await modulo();
    const r = await subirSoporte('drive-1', 'carpeta-1', 'ACT-2026-0001.txt', Buffer.from('acta'), 'text/plain');

    expect(r).toEqual({ ok: true, datos: { id: 'item-previo', webUrl: 'https://sp/previo.txt' } });
  });

  it('un 403 nombra el permiso que falta', async () => {
    put.mockRejectedValueOnce(errorGraph(403));

    const { subirSoporte } = await modulo();
    const r = await subirSoporte('drive-1', 'carpeta-1', 'a.txt', Buffer.from('a'), 'text/plain');

    expect(r.ok).toBe(false);
    if (!r.ok && r.fallo.causa === 'SIN_PERMISO') {
      expect(r.fallo.permiso).toBe('Sites.Selected (rol write)');
    } else {
      throw new Error('se esperaba SIN_PERMISO');
    }
  });

  it('sin respuesta de la red es SIN_RED, no una respuesta inesperada', async () => {
    put.mockRejectedValueOnce(sinRed());

    const { subirSoporte } = await modulo();
    const r = await subirSoporte('drive-1', 'carpeta-1', 'a.txt', Buffer.from('a'), 'text/plain');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo.causa).toBe('SIN_RED');
  });
});

describe('asegurarCarpetaDePersona', () => {
  it('crea la carpeta cuando no hay una conocida', async () => {
    post.mockResolvedValueOnce({ data: { access_token: 'token' } });
    post.mockResolvedValueOnce({ data: { id: 'carpeta-nueva' } });

    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', null);

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-nueva', nombre: 'daniel.medina' } });
  });

  // P6 aplicado a carpetas: si ya existe, se adopta la que está.
  it('un 409 al crear adopta la carpeta existente', async () => {
    post.mockResolvedValueOnce({ data: { access_token: 'token' } });
    post.mockRejectedValueOnce(errorGraph(409));
    get.mockResolvedValueOnce({ data: { id: 'carpeta-previa' } });

    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', null);

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-previa', nombre: 'daniel.medina' } });
  });

  // P4 · si el correo cambió, la carpeta se RENOMBRA por su id. No se crea una segunda:
  // los soportes de una persona viven en un solo lugar.
  it('renombra por id cuando el nombre conocido ya no coincide', async () => {
    patch.mockResolvedValueOnce({ data: { id: 'carpeta-1', name: 'daniel.medina' } });

    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', {
      id: 'carpeta-1',
      nombre: 'dmedina',
    });

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-1', nombre: 'daniel.medina' } });
    expect(patch).toHaveBeenCalledWith(
      expect.stringContaining('/items/carpeta-1'),
      { name: 'daniel.medina' },
      expect.anything(),
    );
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining('/children'), expect.anything(), expect.anything());
  });

  it('con la carpeta conocida y el nombre igual no llama a Graph', async () => {
    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', {
      id: 'carpeta-1',
      nombre: 'daniel.medina',
    });

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-1', nombre: 'daniel.medina' } });
    expect(patch).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npm test -- app/lib/__tests__/sharepoint`
Expected: FAIL — `resolverCarpetaBase is not a function`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `app/lib/sharepoint.ts` (y cambiar `async function getToken`/`getSiteId`/`getDriveId` a `export async function`, que hoy son privadas):

```ts
// ── Escritura de soportes (REQ-SIG-13) ──────────────────────────────────────────────────
//
// Lo que sigue existe para publicar las actas de firma en la carpeta de cada persona.
// Reusa el token, el sitio y la biblioteca de arriba —no abre un segundo camino a Graph— y
// clasifica cada fallo con `lib/sgsi/graph-fallo.ts` en vez de dejar escapar el error de
// axios: la pantalla tiene que poder decir QUÉ hacer, no «error al publicar».

import {
  clasificarRecurso,
  clasificarToken,
  variablesQueFaltan,
  type FalloGraph,
  type ResultadoGraph,
} from '@/lib/sgsi/graph-fallo';

/// El permiso que se nombra en un 403. Es el de REQ-SIG-13 §8: menos que
/// `Files.ReadWrite.All`, que daría escritura sobre todo el tenant a un secreto de un `.env`.
const PERMISO_ESCRITURA = 'Sites.Selected (rol write)';

/// P7 · el sitio y la biblioteca son estables; hoy se resuelven en cada llamada, que son dos
/// viajes a Graph antes de cada operación útil. La caché vive en el proceso y se invalida al
/// reiniciar, que es exactamente cuando puede haber cambiado la configuración.
let idsEnCache: { siteId: string; driveId: string } | null = null;

function faltanVariables(): string[] {
  const propias = ['SHAREPOINT_SITE_URL', 'SHAREPOINT_SITE_NAME', 'SHAREPOINT_SOPORTES_PATH'];
  return [
    ...variablesQueFaltan(process.env),
    ...propias.filter((v) => (process.env[v] ?? '').trim() === ''),
  ];
}

function fallo(e: unknown, recurso: string): FalloGraph {
  if (axios.isAxiosError(e)) {
    if (e.response) return clasificarRecurso(e.response.status, recurso, PERMISO_ESCRITURA);
    return { causa: 'SIN_RED', detalle: e.code ?? e.message };
  }
  return { causa: 'SIN_RED', detalle: e instanceof Error ? e.message : String(e) };
}

/// Graph identifica una ruta con `root:/a/b/c:` — las barras NO se codifican, todo lo demás sí.
function rutaGraph(ruta: string): string {
  return encodeURIComponent(ruta).replace(/%2F/g, '/');
}

async function tokenYIds(): Promise<
  ResultadoGraph<{ token: string; siteId: string; driveId: string }>
> {
  const faltan = faltanVariables();
  if (faltan.length > 0) return { ok: false, fallo: { causa: 'SIN_CONFIGURAR', faltan } };

  let token: string;
  try {
    token = await getToken();
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) {
      return { ok: false, fallo: clasificarToken(e.response.status, e.response.statusText ?? '') };
    }
    return { ok: false, fallo: fallo(e, 'el endpoint de token') };
  }

  if (idsEnCache) return { ok: true, datos: { token, ...idsEnCache } };

  try {
    const siteId = await getSiteId(token);
    const driveId = await getDriveId(token, siteId);
    idsEnCache = { siteId, driveId };
    return { ok: true, datos: { token, siteId, driveId } };
  } catch (e) {
    return { ok: false, fallo: fallo(e, 'el sitio o la biblioteca de SharePoint') };
  }
}

export interface CarpetaBase {
  driveId: string;
  carpetaBaseId: string;
}

export async function resolverCarpetaBase(): Promise<ResultadoGraph<CarpetaBase>> {
  const base = await tokenYIds();
  if (!base.ok) return base;
  const { token, driveId } = base.datos;
  const ruta = process.env.SHAREPOINT_SOPORTES_PATH as string;

  try {
    const res = await http.get(`${GRAPH}/drives/${driveId}/root:/${rutaGraph(ruta)}:`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: true, datos: { driveId, carpetaBaseId: res.data.id } };
  } catch (e) {
    // P1 · si no existe, se FALLA. No se crea: una variable mal escrita no debe convertirse
    // en un árbol de carpetas fantasma dentro de la biblioteca del SIG.
    return { ok: false, fallo: fallo(e, `la carpeta «${ruta}»`) };
  }
}

export interface CarpetaDePersona {
  id: string;
  nombre: string;
}

export async function asegurarCarpetaDePersona(
  driveId: string,
  carpetaBaseId: string,
  nombre: string,
  conocida: CarpetaDePersona | null,
): Promise<ResultadoGraph<CarpetaDePersona>> {
  if (conocida !== null && conocida.nombre === nombre) {
    return { ok: true, datos: conocida };
  }

  const base = await tokenYIds();
  if (!base.ok) return base;
  const { token } = base.datos;
  const cabeceras = { headers: { Authorization: `Bearer ${token}` } };

  // P4 · el correo cambió: se renombra por id. Crear una segunda carpeta partiría en dos
  // los soportes de una misma persona.
  if (conocida !== null) {
    try {
      await http.patch(`${GRAPH}/drives/${driveId}/items/${conocida.id}`, { name: nombre }, cabeceras);
      return { ok: true, datos: { id: conocida.id, nombre } };
    } catch (e) {
      return { ok: false, fallo: fallo(e, `la carpeta «${conocida.nombre}»`) };
    }
  }

  try {
    const res = await http.post(
      `${GRAPH}/drives/${driveId}/items/${carpetaBaseId}/children`,
      { name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
      cabeceras,
    );
    return { ok: true, datos: { id: res.data.id, nombre } };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      try {
        const res = await http.get(
          `${GRAPH}/drives/${driveId}/items/${carpetaBaseId}:/${rutaGraph(nombre)}:`,
          cabeceras,
        );
        return { ok: true, datos: { id: res.data.id, nombre } };
      } catch (e2) {
        return { ok: false, fallo: fallo(e2, `la carpeta «${nombre}»`) };
      }
    }
    return { ok: false, fallo: fallo(e, `la carpeta «${nombre}»`) };
  }
}

export async function subirSoporte(
  driveId: string,
  carpetaId: string,
  nombre: string,
  bytes: Buffer,
  mime: string,
): Promise<ResultadoGraph<{ id: string; webUrl: string }>> {
  const base = await tokenYIds();
  if (!base.ok) return base;
  const { token } = base.datos;
  const cabeceras = { headers: { Authorization: `Bearer ${token}` } };

  try {
    // P6 · `fail` y nunca `replace` ni `rename`: `replace` permitiría sobrescribir un acta
    // firmada, y `rename` llenaría la carpeta de «ACT-2026-0014 1.txt».
    const res = await http.put(
      `${GRAPH}/drives/${driveId}/items/${carpetaId}:/${rutaGraph(nombre)}:/content` +
        '?%40microsoft.graph.conflictBehavior=fail',
      bytes,
      { headers: { ...cabeceras.headers, 'Content-Type': mime } },
    );
    return { ok: true, datos: { id: res.data.id, webUrl: res.data.webUrl } };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      // Ya está publicado. El reintento del cron no puede tratar esto como fallo.
      try {
        const res = await http.get(
          `${GRAPH}/drives/${driveId}/items/${carpetaId}:/${rutaGraph(nombre)}:`,
          cabeceras,
        );
        return { ok: true, datos: { id: res.data.id, webUrl: res.data.webUrl } };
      } catch (e2) {
        return { ok: false, fallo: fallo(e2, `el archivo «${nombre}»`) };
      }
    }
    return { ok: false, fallo: fallo(e, `el archivo «${nombre}»`) };
  }
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npm test -- app/lib/__tests__/sharepoint`
Expected: PASS — 10 pruebas

- [ ] **Step 5: Verificar que no se rompió la lectura de indicadores**

Run: `npm test && npm run lint`
Expected: toda la suite en verde; `getToken`/`getSiteId`/`getDriveId` siguen usándose desde `fetchIndicatorsBuffer`.

- [ ] **Step 6: Commit**

```bash
git add app/lib/sharepoint.ts app/lib/__tests__/sharepoint.test.ts
git commit -m "feat(sig): escritura en SharePoint con los fallos de Graph clasificados"
```

---

## Task 4: El publicador

**Files:**
- Create: `lib/sig/publicador-soportes.ts`

Este módulo toca Prisma y la red, así que **no lleva pruebas unitarias**: sus decisiones ya se probaron en las tareas 1 y 3, y lo que queda es cableado. Se verifica corriendo el trabajo (Task 6) y con el checklist final (Task 9). Es el mismo criterio del resto de `lib/sig/`.

- [ ] **Step 1: Escribir el módulo**

Crear `lib/sig/publicador-soportes.ts`:

```ts
import 'server-only';

// lib/sig/publicador-soportes.ts
//
// Publica un soporte en la carpeta de su persona, y drena la cola.
//
// Vive en `lib/` con `server-only` y NO en un archivo de acciones por la misma razón que
// `trabajos.ts`: en un archivo `'use server'` toda exportación se vuelve una server action
// invocable desde el navegador, y esto corre sin compuerta de permiso porque detrás hay un
// cron y no una persona.
//
// Ninguna decisión se toma acá: los nombres y la política de reintentos vienen del módulo
// puro, y la clasificación de fallos de `graph-fallo.ts`. Este archivo es el cableado.

import { prisma } from '@/lib/db';
import {
  asegurarCarpetaDePersona,
  resolverCarpetaBase,
  subirSoporte,
} from '@/app/lib/sharepoint';
import { explicarFallo, type FalloGraph } from '@/lib/sgsi/graph-fallo';
import { almacenPostgres } from '@/lib/sgsi/anexos';
import { registrar } from '@/lib/sgsi/bitacora';
import {
  debeDetenerElLote,
  esperaAntesDeReintentar,
  estadoTrasFallo,
  gastaIntento,
  nombreDeArchivo,
  nombreDeCarpeta,
  rutaCompleta,
} from '@/lib/sig/soportes-sharepoint';

export interface ResultadoPublicacion {
  publicados: number;
  pendientes: number;
  bloqueados: number;
  detalle: string;
}

const SELECCION = {
  id: true,
  intentos: true,
  evidenciaId: true,
  persona: {
    select: { id: true, correo: true, carpetaSoportesId: true, carpetaSoportesRuta: true },
  },
  evidencia: {
    select: {
      id: true,
      archivoNombre: true,
      archivoMime: true,
      actaPdf: {
        select: {
          codigo: true,
          aceptadoEn: true,
          contenidoVersion: true,
          contenido: { select: { codigo: true } },
        },
      },
    },
  },
} as const;

async function anotarFallo(
  publicacionId: number,
  intentos: number,
  falla: FalloGraph,
): Promise<void> {
  const intentosNuevos = gastaIntento(falla.causa) ? intentos + 1 : intentos;
  await prisma.publicacionSoporte.update({
    where: { id: publicacionId },
    data: {
      estado: estadoTrasFallo(falla.causa, intentosNuevos),
      intentos: intentosNuevos,
      ultimoIntentoEn: new Date(),
      causaFallo: falla.causa,
      detalleFallo: explicarFallo(falla),
    },
  });
}

/// Publica UNA fila. Devuelve la causa del fallo cuando no pudo, para que el lote decida si
/// vale la pena seguir con las siguientes.
export async function publicarUno(
  publicacionId: number,
): Promise<{ ok: true } | { ok: false; causa: FalloGraph['causa'] }> {
  const fila = await prisma.publicacionSoporte.findUnique({
    where: { id: publicacionId },
    select: SELECCION,
  });
  if (!fila) return { ok: false, causa: 'NO_EXISTE' };

  const base = await resolverCarpetaBase();
  if (!base.ok) {
    await anotarFallo(fila.id, fila.intentos, base.fallo);
    return { ok: false, causa: base.fallo.causa };
  }

  const nombreCarpeta = nombreDeCarpeta(fila.persona.correo);
  const conocida =
    fila.persona.carpetaSoportesId !== null && fila.persona.carpetaSoportesRuta !== null
      ? { id: fila.persona.carpetaSoportesId, nombre: fila.persona.carpetaSoportesRuta }
      : null;

  const carpeta = await asegurarCarpetaDePersona(
    base.datos.driveId,
    base.datos.carpetaBaseId,
    nombreCarpeta,
    conocida,
  );
  if (!carpeta.ok) {
    await anotarFallo(fila.id, fila.intentos, carpeta.fallo);
    return { ok: false, causa: carpeta.fallo.causa };
  }

  if (
    fila.persona.carpetaSoportesId !== carpeta.datos.id ||
    fila.persona.carpetaSoportesRuta !== carpeta.datos.nombre
  ) {
    await prisma.persona.update({
      where: { id: fila.persona.id },
      data: {
        carpetaSoportesId: carpeta.datos.id,
        carpetaSoportesRuta: carpeta.datos.nombre,
      },
    });
  }

  const acta = fila.evidencia.actaPdf[0] ?? null;
  const nombre = nombreDeArchivo({
    // Sin acta el soporte no tiene código propio; se usa el id de la evidencia, que es
    // único y permite reencontrarlo. Hoy no pasa —solo se encolan actas— pero el modelo
    // admite otros soportes (§3) y un `undefined` en el nombre sería un archivo anónimo.
    codigo: acta?.codigo ?? `EVI-${fila.evidencia.id}`,
    documentoCodigo: acta?.contenido.codigo ?? null,
    documentoVersion: acta?.contenidoVersion ?? null,
    aceptadoEn: acta?.aceptadoEn ?? new Date(),
    extension: (fila.evidencia.archivoNombre ?? 'archivo.txt').split('.').pop() as string,
  });

  let bytes: Buffer;
  try {
    // `almacenPostgres` y no `almacenActivo()`: la firma escribe los bytes por la relación
    // inline, que es siempre la tabla de Postgres. Mismo criterio que `/api/sig/acta`.
    bytes = await almacenPostgres.leer(String(fila.evidencia.id));
  } catch {
    await prisma.publicacionSoporte.update({
      where: { id: fila.id },
      data: {
        estado: 'BLOQUEADO',
        ultimoIntentoEn: new Date(),
        causaFallo: 'SIN_ARCHIVO',
        detalleFallo:
          'La evidencia no tiene bytes guardados. No es un problema de SharePoint: el ' +
          'artefacto no se generó o se borró de la base.',
      },
    });
    return { ok: false, causa: 'NO_EXISTE' };
  }

  const subida = await subirSoporte(
    base.datos.driveId,
    carpeta.datos.id,
    nombre,
    bytes,
    fila.evidencia.archivoMime ?? 'application/octet-stream',
  );
  if (!subida.ok) {
    await anotarFallo(fila.id, fila.intentos, subida.fallo);
    return { ok: false, causa: subida.fallo.causa };
  }

  const ruta = rutaCompleta(
    process.env.SHAREPOINT_SOPORTES_PATH as string,
    carpeta.datos.nombre,
    nombre,
  );

  await prisma.publicacionSoporte.update({
    where: { id: fila.id },
    data: {
      estado: 'PUBLICADO',
      intentos: fila.intentos + 1,
      ultimoIntentoEn: new Date(),
      publicadoEn: new Date(),
      driveItemId: subida.datos.id,
      webUrl: subida.datos.webUrl,
      rutaPublicada: ruta,
      nombreArchivo: nombre,
      causaFallo: null,
      detalleFallo: null,
    },
  });

  await registrar({ bitacora: prisma.bitacora }, 'sistema', [
    {
      tabla: 'publicacion_soporte',
      registroId: String(fila.id),
      campo: 'publicado',
      anterior: null,
      nuevo: ruta,
      motivo: 'publicación del soporte en SharePoint',
    },
  ]);

  return { ok: true };
}

/// El disparo inmediato al firmar (§7.1). Encuentra la fila por su evidencia porque es lo
/// que la transacción de la firma acaba de crear.
export async function publicarPorEvidencia(evidenciaId: number): Promise<void> {
  const fila = await prisma.publicacionSoporte.findUnique({
    where: { evidenciaId },
    select: { id: true },
  });
  if (fila) await publicarUno(fila.id);
}

/// Drena la cola. `limite` acota una corrida para que un histórico grande no monopolice el
/// proceso: lo que no alcance sale en la corrida siguiente.
export async function publicarPendientes(limite = 50): Promise<ResultadoPublicacion> {
  const ahora = Date.now();
  const candidatas = await prisma.publicacionSoporte.findMany({
    where: { estado: 'PENDIENTE' },
    orderBy: [{ ultimoIntentoEn: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    select: { id: true, intentos: true, ultimoIntentoEn: true },
    take: limite,
  });

  let publicados = 0;
  let detenidoPor: FalloGraph['causa'] | null = null;

  for (const c of candidatas) {
    // P9 · respetar la espera. Sin esto el cron reintentaría cada hora lo que pidió un día.
    if (
      c.ultimoIntentoEn !== null &&
      ahora - c.ultimoIntentoEn.getTime() < esperaAntesDeReintentar(c.intentos)
    ) {
      continue;
    }

    const r = await publicarUno(c.id);
    if (r.ok) {
      publicados += 1;
      continue;
    }
    if (debeDetenerElLote(r.causa)) {
      detenidoPor = r.causa;
      break;
    }
  }

  const [pendientes, bloqueados] = await Promise.all([
    prisma.publicacionSoporte.count({ where: { estado: 'PENDIENTE' } }),
    prisma.publicacionSoporte.count({ where: { estado: 'BLOQUEADO' } }),
  ]);

  const detalle =
    detenidoPor === null
      ? `${publicados} publicados · ${pendientes} pendientes · ${bloqueados} bloqueados`
      : `${publicados} publicados · lote detenido por ${detenidoPor} · ${pendientes} pendientes · ` +
        `${bloqueados} bloqueados`;

  return { publicados, pendientes, bloqueados, detalle };
}
```

- [ ] **Step 2: Verificar que compila y que el lint pasa**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && npm run lint`
Expected: sin errores en `lib/sig/publicador-soportes.ts`.

> Nota: `next.config.js` tiene `typescript.ignoreBuildErrors: true`, así que `next build` **no** avisa de un error de tipos. Correr `tsc --noEmit` acá no es opcional.

- [ ] **Step 3: Commit**

```bash
git add lib/sig/publicador-soportes.ts
git commit -m "feat(sig): el publicador de soportes y el drenaje de la cola"
```

---

## Task 5: Encolar al firmar, publicar fuera de la transacción

**Files:**
- Modify: `app/sig/acciones/firma.ts:175-225`

- [ ] **Step 1: Encolar dentro de la transacción**

En `app/sig/acciones/firma.ts`, declarar la variable junto a `let codigo = '';` (línea 125):

```ts
  let codigo = '';
  let evidenciaIdPublicable: number | null = null;
```

Y justo después del `await tx.actaAceptacion.create({...})` (línea ~208), dentro de la misma transacción:

```ts
      // REQ-SIG-13 · la fila de la cola se crea DENTRO de la transacción, junto al acta:
      // si la firma se deshace, no queda un soporte encolado que no existe.
      await tx.publicacionSoporte.create({
        data: { evidenciaId: evidencia.id, personaId: asignacion.personaId },
      });
      evidenciaIdPublicable = evidencia.id;
```

- [ ] **Step 2: Publicar después del commit, sin bloquear la respuesta**

Después del cierre del `await prisma.$transaction(...)` (línea ~225) y **antes** de los `revalidatePath`:

```ts
    // P10 · ninguna llamada a Graph dentro de la transacción. El cliente HTTP tiene 10 s de
    // timeout: una transacción esperando a Graph sostiene sus bloqueos todo ese tiempo, y la
    // firma —que es lo que le importa a la persona— quedaría a merced de la disponibilidad
    // de Microsoft. Si Graph está caído, la firma se completa igual y el soporte queda
    // PENDIENTE: el trabajo horario lo publica después.
    if (evidenciaIdPublicable !== null) {
      const id = evidenciaIdPublicable;
      void import('@/lib/sig/publicador-soportes')
        .then((m) => m.publicarPorEvidencia(id))
        .catch(() => {
          // El fallo ya quedó anotado en la fila con su causa; acá no hay a quién avisarle.
        });
    }
```

- [ ] **Step 3: Verificar que la firma sigue funcionando**

Run: `npm test -- firma && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: las pruebas de `lib/sig/firma.ts` en verde (son del módulo puro y no cambian) y sin errores de tipos.

- [ ] **Step 4: Probar a mano el camino feliz y el camino roto**

```bash
npm run db:up && npm run dev
```

1. Firmar un contenido que exija firma desde `/mi-sig`.
2. Comprobar la fila: debe existir y quedar `PUBLICADO` (o `PENDIENTE` si el entorno local no tiene las variables de SharePoint, que es el resultado correcto).

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi \
  -c "select id, estado, intentos, causa_fallo, nombre_archivo from publicacion_soporte order by id desc limit 5;"
```

3. **Verificación 3 del requerimiento:** poner `SHAREPOINT_CLIENT_SECRET=roto` y firmar otra vez. La firma **se completa** y la fila queda `PENDIENTE` con `causa_fallo = CREDENCIAL_RECHAZADA`.

- [ ] **Step 5: Commit**

```bash
git add app/sig/acciones/firma.ts
git commit -m "feat(sig): la firma encola su soporte y publica fuera de la transaccion"
```

---

## Task 6: El trabajo programado

**Files:**
- Modify: `lib/sig/trabajos-catalogo.ts`
- Modify: `lib/sig/trabajos.ts`
- Modify: `docs/handoff_sig/trabajos-programados.md`
- Modify: `deploy/trabajos-cron.example`

- [ ] **Step 1: Declararlo en el catálogo**

En `lib/sig/trabajos-catalogo.ts`, agregar al arreglo `TRABAJOS`:

```ts
  {
    nombre: 'publicar-soportes',
    descripcion:
      'Publica en SharePoint los soportes pendientes, en la carpeta de cada persona ' +
      '(REQ-SIG-13). Respeta la espera creciente de cada fila y se detiene cuando la causa ' +
      'del fallo es del entorno: 300 llamadas condenadas sólo llenan el registro de ruido.',
    cuando: 'Cada hora, :20',
    disponible: true,
  },
```

- [ ] **Step 2: Cablearlo**

En `lib/sig/trabajos.ts`, dentro de `IMPLEMENTACIONES`:

```ts
  'publicar-soportes': async () => {
    const { publicarPendientes } = await import('@/lib/sig/publicador-soportes');
    const r = await publicarPendientes();
    return { creados: r.publicados, detalle: r.detalle };
  },
```

> El chequeo que ya corre al cargar el módulo (`catálogo vs. cableado`) falla si se hace uno sin el otro. Es intencional: un trabajo `disponible` sin implementación devolvería 200 sin hacer nada.

- [ ] **Step 3: Verificar el chequeo de coherencia**

Run: `npm test`
Expected: PASS. Si se olvidó el paso 1 o el 2, el módulo lanza `El trabajo «publicar-soportes» está declarado como … y … tiene implementación`.

- [ ] **Step 4: Correrlo de verdad**

Con `npm run dev` levantado y `SIG_TRABAJOS_SECRET` en el `.env`:

```bash
curl -s -X POST http://localhost:3004/api/sig/trabajos/publicar-soportes \
  -H "Authorization: Bearer $SIG_TRABAJOS_SECRET" | head -20
```

Expected: JSON con `resultado: "EXITOSO"` y un `detalle` del estilo `2 publicados · 0 pendientes · 0 bloqueados`.

- [ ] **Step 5: Correrlo dos veces seguidas — la idempotencia (verificación 4)**

Repetir el `curl`. Expected: `0 publicados` y **ningún** archivo duplicado ni `ACT-… 1.txt` en la carpeta de SharePoint.

- [ ] **Step 6: Documentarlo donde se documentan los trabajos**

En `docs/handoff_sig/trabajos-programados.md`, agregar la fila a la tabla de §3:

```markdown
| `publicar-soportes` | Cada hora, :20 | Publica en SharePoint los soportes pendientes, en la carpeta de cada persona (REQ-SIG-13) |
```

Y la línea correspondiente en `deploy/trabajos-cron.example`:

```
20 * * * * curl -s -X POST -H "Authorization: Bearer $SIG_TRABAJOS_SECRET" https://sig.cuantico.com/api/sig/trabajos/publicar-soportes >> /var/log/sig-trabajos.log 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add lib/sig/trabajos-catalogo.ts lib/sig/trabajos.ts docs/handoff_sig/trabajos-programados.md deploy/trabajos-cron.example
git commit -m "feat(sig): trabajo horario que publica los soportes pendientes"
```

---

## Task 7: El histórico

**Files:**
- Create: `prisma/migrations/<timestamp>_publicacion_soportes_historicos/migration.sql`

- [ ] **Step 1: Crear la migración a mano**

```bash
mkdir -p prisma/migrations/20260908180000_publicacion_soportes_historicos
```

Crear `prisma/migrations/20260908180000_publicacion_soportes_historicos/migration.sql`:

```sql
-- REQ-SIG-13 §7.3 · el histórico entra por la MISMA cola.
--
-- No hay script aparte a propósito: un script de una sola vez sería una segunda
-- implementación del publicador —con sus propios reintentos y sus propios errores— y sería
-- justo la que nadie prueba. Acá sólo se encola; el trabajo horario hace el resto con el
-- código que ya se ejercita todos los días.
--
-- `ON CONFLICT DO NOTHING` sobre `evidencia_id` (único) la hace repetible: si la migración
-- se vuelve a aplicar sobre una base que ya tiene filas, no duplica ninguna.
INSERT INTO publicacion_soporte (evidencia_id, persona_id, estado, intentos)
SELECT a.pdf_id, a.persona_id, 'PENDIENTE', 0
FROM acta_aceptacion a
WHERE a.pdf_id IS NOT NULL
ON CONFLICT (evidencia_id) DO NOTHING;
```

- [ ] **Step 2: Aplicarla**

Run: `npx prisma migrate dev`
Expected: `The following migration(s) have been applied` con el nombre nuevo.

- [ ] **Step 3: Verificar el conteo (verificación 5)**

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select (select count(*) from publicacion_soporte) as encoladas,
        (select count(*) from acta_aceptacion where pdf_id is not null) as actas;"
```

Expected: los dos números iguales.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations
git commit -m "feat(sig): encola las actas ya firmadas para publicarlas"
```

---

## Task 8: Que se pueda ver sin abrir la base

**Files:**
- Modify: `app/sig/colaboradores/[id]/page.tsx:276` (donde ya se arma la lista de actas con su huella)
- Modify: `app/mi-sig/historial/page.tsx`
- Modify: `app/mi-sig/diagnostico/page.tsx`

- [ ] **Step 1: En la ficha del colaborador, el enlace o el motivo**

En la consulta que ya trae las actas de la persona, incluir la publicación del PDF:

```ts
        pdf: {
          select: {
            publicacion: {
              select: { estado: true, webUrl: true, detalleFallo: true, causaFallo: true },
            },
          },
        },
```

Y al armar la fila que la pantalla consume, junto a `huella: a.actaHash.slice(0, 12)`:

```ts
        // D-4/P12 · esta pantalla es de los responsables, que son quienes tienen acceso a la
        // carpeta. Acá el enlace a SharePoint sí sirve.
        sharepoint:
          a.pdf?.publicacion?.estado === 'PUBLICADO' ? (a.pdf.publicacion.webUrl ?? null) : null,
        // Nunca se afirma que algo está publicado sin el enlace que lo respalda. Si no está,
        // se dice por qué — la misma disciplina de `explicarFallo`.
        publicacion:
          a.pdf?.publicacion == null
            ? 'sin encolar'
            : a.pdf.publicacion.estado === 'PUBLICADO'
              ? 'publicado'
              : (a.pdf.publicacion.detalleFallo ?? 'pendiente de publicar'),
```

En el componente que renderiza esa lista, mostrar el enlace cuando `sharepoint !== null` y el texto de `publicacion` cuando no.

- [ ] **Step 2: En `/mi-sig/historial`, la ruta de la aplicación y nunca el `webUrl`**

```tsx
{/* P12 · el colaborador NO tiene permiso sobre la carpeta (D-4): mostrarle el webUrl le
    daría «acceso denegado» y haría parecer roto lo que funciona. Su acta se descarga por
    la ruta de la aplicación, que sí lo autoriza como titular. */}
<a href={`/api/sig/acta?codigo=${encodeURIComponent(acta.codigo)}`}>Descargar mi acta</a>
```

Revisar el archivo para que **no** quede ninguna referencia a `webUrl` en las pantallas de `/mi-sig`:

```bash
grep -rn "webUrl" app/mi-sig
```

Expected: sin resultados.

- [ ] **Step 3: En `/mi-sig/diagnostico`, los contadores con la causa**

Agregar a la consulta de la página:

```ts
  const soportes = await prisma.publicacionSoporte.groupBy({
    by: ['estado', 'causaFallo'],
    _count: { _all: true },
  });
```

Y renderizar una sección «Soportes en SharePoint» que diga, por estado, cuántos hay y con qué causa los bloqueados. Es la pantalla que ya existe para responder «por qué no funciona lo de Graph», así que el texto sigue el mismo tono: qué pasó y qué hacer.

- [ ] **Step 4: Verificar en el navegador**

```bash
npm run dev
```

1. `/mi-sig/diagnostico` muestra los contadores.
2. `/sig/colaboradores/<id>` muestra el enlace en un acta publicada y el motivo en una pendiente.
3. **Verificación 9:** con una cuenta de colaborador, `/mi-sig/historial` descarga el acta y no muestra ningún enlace a SharePoint.

- [ ] **Step 5: Commit**

```bash
git add app/sig/colaboradores app/mi-sig
git commit -m "feat(sig): el estado de publicacion se ve donde se necesita, y el enlace solo a quien puede abrirlo"
```

---

## Task 9: Configuración, permiso mínimo y cierre

**Files:**
- Modify: `.env.example`
- Modify: `app/api/sig/acta/route.ts` (verificación de P13)

- [ ] **Step 1: Documentar la variable**

Agregar a `.env.example`, después del bloque de SharePoint que ya existe:

```
# ─── Soportes del SIG en SharePoint (REQ-SIG-13) ──────────────────────────────
# Carpeta base, relativa a la biblioteca «Shared Documents» del sitio.
SHAREPOINT_SOPORTES_PATH=09. SISTEMA INTEGRADO DE GESTION/14. Seguridad de la Informacion/11. Automatizaciones y requerimientos SIG/2. Soportes SIG
# Sin ella, el publicador NO corre y lo dice; nunca adivina una carpeta.
# Requiere permiso de APLICACIÓN Sites.Selected con rol «write» sobre el sitio.
# La carpeta está restringida a los responsables (D-4): los colaboradores llegan a su
# soporte por la aplicación, no por permiso de SharePoint.
```

- [ ] **Step 2: Confirmar P13 — ninguna ruta entrega un soporte sin verificar quién pide**

`app/api/sig/acta/route.ts:47-51` ya acota por titular o `operacion:administrar`. Verificar que **no** se agregó ninguna ruta nueva que entregue bytes por `driveItemId` o por `PublicacionSoporte.id`:

```bash
grep -rn "driveItemId\|publicacionSoporte" app/api
```

Expected: sin resultados. Los bytes se siguen sirviendo sólo por `/api/sig/acta`, que verifica la sesión.

- [ ] **Step 3: Verificación 10 — pedir el acta de otra persona**

Con sesión de colaborador, contra un acta que no es suya:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3004/api/sig/acta?codigo=ACT-2026-0001" \
  -H "Cookie: <cookie de sesión del colaborador>"
```

Expected: `403`.

- [ ] **Step 4: Correr todo**

Run: `npm test && npm run lint && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && npm run build`
Expected: suite en verde, lint limpio, sin errores de tipos, build exitoso.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(sig): la variable de la carpeta de soportes y el permiso que exige"
```

---

## Checklist del requerimiento

Las 10 verificaciones de `docs/handoff_sig/soportes-en-sharepoint.md §12`, con la tarea que las cubre:

| # | Verificación | Tarea |
|---|---|---|
| 1 | Nombres, saneamiento y reintentos | Task 1 |
| 2 | Una firma nueva aparece en SharePoint | Task 5 · Step 4 |
| 3 | Graph caído no rompe la firma | Task 5 · Step 4.3 |
| 4 | Reintentar es idempotente | Task 6 · Step 5 |
| 5 | El histórico queda publicado | Task 7 · Step 3 |
| 6 | El renombre de carpeta no crea una segunda | Task 3 (prueba de `patch`) + prueba manual en SharePoint |
| 7 | El 403 se ve y no se esconde | Task 3 (prueba de `SIN_PERMISO`) + Task 8 · Step 3 |
| 8 | El permiso concedido es el mínimo | Tarea de administración en Azure (§8 del requerimiento) — captura del registro de la aplicación |
| 9 | Nadie ve un enlace que no puede abrir | Task 8 · Step 4.3 |
| 10 | El soporte no se entrega por un id adivinable | Task 9 · Step 3 |

**Fuera del alcance de este plan, y hay que pedirlo antes de desplegar:** conceder `Sites.Selected` con rol `write` sobre el sitio `Cuantico` (REQ-SIG-13 §8). Sin eso, cada publicación termina `BLOQUEADO` con `SIN_PERMISO` — que es el comportamiento correcto, pero no publica nada.
