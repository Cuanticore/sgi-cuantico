# Un paquete SCORM propio corriendo en el SIG — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el paquete `gestionar-leads` corra en el player del SIG reportando avance, nota y detalle por pregunta, y que la asignación cierre sola.

**Architecture:** El player ya es un player SCORM 2004 completo. En vez de enseñarle SCORM 1.2, se migra el paquete a 2004 4th Edition — 1.2 no tiene `cmi.progress_measure`, así que el porcentaje de avance no existiría ni implementando el soporte sin defectos. Al verificar el código para el diseño aparecieron tres defectos preexistentes que este paquete destapa (tareas 1, 2-3 y 4) y un bloqueante en el propio paquete (tarea 5). Todo lo demás del player —intentos, reanudar, cierre, modo repaso— ya funciona y no se toca. **No hay migración de base de datos.**

**Tech Stack:** TypeScript · Next.js (App Router) · Prisma 7 / Postgres · Jest (jsdom por defecto, `@jest-environment node` para lo que toca Prisma) · el paquete SCORM es HTML/CSS/JS plano, sin build.

**Spec:** [`docs/superpowers/specs/2026-09-18-scorm-2004-paquete-propio-design.md`](../specs/2026-09-18-scorm-2004-paquete-propio-design.md)

---

## Contexto que necesitás antes de empezar

**Leé esto aunque tengas prisa.** Tres cosas que no son obvias y que, si las ignorás, producen un cambio que pasa los tests y falla en el primer uso real.

### 1. `lib/sig/scorm-modelo.ts` corre en los DOS lados

Es puro a propósito. El runner (`app/scorm/runner/Runner.client.tsx`, en el navegador) lo usa para responderle al curso de forma **síncrona** —la API de SCORM no admite esperar—, y el servidor (`app/mi-sig/acciones/curso.ts`) lo usa otra vez antes de persistir, porque un cliente puede mandar cualquier cosa. **Un elemento que falte en su tabla `ELEMENTOS` se rechaza en los dos lados**: el curso recibe 401 y el servidor descarta el valor. No hay que tocar las dos capas: se toca la tabla.

### 2. Las reglas del harness no son opcionales

`HARNESS.md` es obligatorio. En resumen, y en este orden:

- **Regla 1:** el test se escribe **antes** del arreglo y se **verifica en rojo**. Ver el rojo es la parte que no se puede saltar: un test escrito después pasa por construcción.
- **Regla 2:** `npm run verificar:build` en limpio antes del PR.
- **Regla 3:** prueba de punta a punta cuando hay pantalla. Acá **aplica** (tarea 9).

### 3. Correr los tests con Bash, no con PowerShell

`lib/__tests__/use-server.test.ts` da un **rojo falso** bajo PowerShell. Usá la herramienta Bash. Y **no encadenes `| tail`**: corta el código de salida y una suite roja se ve verde.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `lib/sig/scorm-modelo.ts` | La tabla del modelo de datos 2004 | Modificar: 2 elementos |
| `lib/sig/__tests__/scorm-modelo.test.ts` | Contrato del modelo | Modificar: 1 `describe` |
| `lib/sig/rango-http.ts` | **Nuevo.** Interpretar `Range:` contra un tamaño. Puro | Crear |
| `lib/sig/__tests__/rango-http.test.ts` | Los bordes de ese parseo | Crear |
| `app/scorm/archivo/[paqueteId]/[...ruta]/route.ts` | Servir bytes del paquete | Modificar: rango + `substring` |
| `app/scorm/archivo/[paqueteId]/[...ruta]/__tests__/route.test.ts` | **Nuevo.** 206 / 416 / 200, y la CSP en los tres | Crear |
| `lib/sig/scorm-manifiesto.ts` | Del manifiesto al veredicto del paquete | Modificar: `dominiosDe` |
| `lib/sig/__tests__/scorm-manifiesto.test.ts` | Clasificación del paquete | Modificar: 1 `describe` |
| **Paquete `gestionar-leads`** (fuera del repo) | | |
| `imsmanifest.xml` | Declaración del paquete | Reescribir |
| `scorm-api.js` | Puente con la API del LMS | Reescribir |
| `index.html` | La lección y el avance | Modificar: el `<script>` del pie |
| `cuestionario.html` | La evaluación y el cierre | Modificar: el bloque de reporte |

`rango-http.ts` va aparte de la ruta por la misma razón que `scorm-tiempo.ts` va aparte del modelo: es una conversión con bordes, y los bordes son lo que se prueba. La ruta queda con lo que no se puede probar sin base.

---

## Tarea 1 · El modelo 2004 acepta la respuesta correcta de una interacción

**Por qué:** `cmi.interactions.n.correct_responses.n.pattern` no está en `ELEMENTOS`, así que un curso que registra **cuál era la respuesta correcta** recibe 401 y el servidor descarta el valor. Se guarda qué respondió la persona y si acertó, pero no contra qué — que es el dato que hace el detalle por pregunta revisable por un tercero. `cmi.interactions.n.objectives.n.id` falta por lo mismo.

**Files:**
- Modify: `lib/sig/scorm-modelo.ts:147-163`
- Test: `lib/sig/__tests__/scorm-modelo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregá este `describe` al final de `lib/sig/__tests__/scorm-modelo.test.ts`. Los símbolos `OK`, `FALLO_GENERAL_AL_FIJAR`, `normalizar`, `indiceDe` y `validarEscritura` ya están importados en la cabecera del archivo; `ABIERTO` ya está definido ahí (`const ABIERTO = { iniciado: true, terminado: false }`).

```ts
describe('interacciones · la respuesta correcta se puede guardar', () => {
  // Sin esto el curso recibe 401 y el servidor descarta el valor: quedaba registrado qué
  // respondió la persona y si acertó, pero no CONTRA QUÉ. Un detalle por pregunta sin la
  // respuesta correcta no lo puede revisar nadie que no tenga el curso a mano.
  const SIN_COLECCIONES = { objetivos: 0, interacciones: 0 };

  it('normaliza los DOS índices de la ruta', () => {
    expect(normalizar('cmi.interactions.3.correct_responses.1.pattern')).toBe(
      'cmi.interactions.n.correct_responses.n.pattern',
    );
    expect(normalizar('cmi.interactions.3.objectives.1.id')).toBe(
      'cmi.interactions.n.objectives.n.id',
    );
  });

  it('acepta el patrón de la respuesta correcta', () => {
    expect(
      validarEscritura('cmi.interactions.0.correct_responses.0.pattern', 'b', ABIERTO, SIN_COLECCIONES),
    ).toBe(OK);
  });

  it('acepta el objetivo asociado a una interacción', () => {
    expect(
      validarEscritura('cmi.interactions.0.objectives.0.id', 'OBJ-1', ABIERTO, SIN_COLECCIONES),
    ).toBe(OK);
  });

  // P9 · el índice que se acota es el de la INTERACCIÓN, no el del patrón. `indiceDe`
  // devuelve el primero de la ruta, y tiene que seguir haciéndolo: la interacción 5 no
  // existe cuando sólo hay una, y aceptarla guardaría un hueco que nadie puede interpretar.
  it('sigue acotando contra el índice de la interacción', () => {
    expect(
      indiceDe('cmi.interactions.5.correct_responses.0.pattern'),
    ).toBe(5);
    expect(
      validarEscritura('cmi.interactions.5.correct_responses.0.pattern', 'b', ABIERTO, SIN_COLECCIONES),
    ).toBe(FALLO_GENERAL_AL_FIJAR);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx jest lib/sig/__tests__/scorm-modelo.test.ts -t "la respuesta correcta se puede guardar"
```

Esperado: **FAIL**. Los dos `it` de «acepta…» reciben `401` (`ELEMENTO_NO_DEFINIDO`) en vez de `0` (`OK`), y el de acotación recibe `401` en vez de `351`. El de `normaliza` pasa —`normalizar` ya colapsa todos los índices—; está ahí para dejar constancia de que esa parte no hay que tocarla.

- [ ] **Step 3: Agregar los dos elementos**

En `lib/sig/scorm-modelo.ts`, justo después de la línea `'cmi.interactions.n.correct_responses._count': …`:

```ts
  // `cadena(4000)` y no un tipo por clase de interacción: el patrón de una respuesta
  // correcta tiene gramática propia según `type` (`choice` usa `a[,]b`, `numeric` un rango,
  // `matching` pares). Validarla de verdad es otro módulo; validarla a medias rechazaría
  // respuestas legítimas, que es peor que guardarlas sin mirar. Se acota el largo, que es
  // lo que el estándar exige como mínimo.
  //
  // El índice interno NO queda acotado, y es deliberado: `correct_responses._count` es de
  // sólo lectura y el estándar no obliga al LMS a llevar su cuenta, así que no hay tope
  // contra el cual comparar sin inventarlo.
  'cmi.interactions.n.correct_responses.n.pattern': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.interactions.n.objectives.n.id': { acceso: 'RW', tipo: cadena(4000) },
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx jest lib/sig/__tests__/scorm-modelo.test.ts
```

Esperado: **PASS**, toda la suite del archivo (no sólo el `describe` nuevo: hay que ver que no se rompió nada de lo anterior).

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-modelo.ts lib/sig/__tests__/scorm-modelo.test.ts
git commit -m "fix(scorm): el modelo 2004 acepta la respuesta correcta de una interaccion

\`cmi.interactions.n.correct_responses.n.pattern\` no estaba en la tabla de
elementos, asi que un curso que registra cual era la respuesta correcta recibia
401 y el servidor descartaba el valor. Quedaba registrado que respondio la
persona y si acerto, pero no contra que. Falta \`objectives.n.id\` por lo mismo.

El indice que se acota sigue siendo el de la interaccion."
```

---

## Tarea 2 · `analizarRango`, la función pura

**Por qué:** el servidor de archivos responde siempre `200` con el archivo entero. Con el `.mp4` de 2,2 MB del paquete, el video **no se puede adelantar ni retroceder**, y Safari —que exige `Range` para `<video>`— no lo reproduce.

**Files:**
- Create: `lib/sig/rango-http.ts`
- Test: `lib/sig/__tests__/rango-http.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Creá `lib/sig/__tests__/rango-http.test.ts`:

```ts
// lib/sig/__tests__/rango-http.test.ts
//
// Los bordes de `Range:` son la razón de que esto sea una función aparte. Un rango mal
// interpretado no falla: sirve los bytes equivocados, y el navegador muestra un video
// corrupto sin que nada avise — la misma forma de defecto que `scorm-tiempo.ts`.

import { analizarRango } from '../rango-http';

const MIL = 1000;

describe('analizarRango', () => {
  it('sin cabecera sirve el archivo completo', () => {
    expect(analizarRango(null, MIL)).toEqual({ clase: 'completo' });
    expect(analizarRango('', MIL)).toEqual({ clase: 'completo' });
  });

  it('un rango cerrado se toma tal cual', () => {
    expect(analizarRango('bytes=0-499', MIL)).toEqual({ clase: 'parcial', desde: 0, hasta: 499 });
    expect(analizarRango('bytes=500-999', MIL)).toEqual({ clase: 'parcial', desde: 500, hasta: 999 });
  });

  it('un rango abierto llega hasta el último byte', () => {
    expect(analizarRango('bytes=500-', MIL)).toEqual({ clase: 'parcial', desde: 500, hasta: 999 });
  });

  // `bytes=-500` son los ÚLTIMOS 500 bytes, no «del 0 al 500». Es el borde que más se
  // confunde, y confundirlo sirve el principio del archivo cuando el reproductor pidió el
  // final —donde vive el índice de un MP4 con `moov` al final—.
  it('un sufijo son los últimos N bytes', () => {
    expect(analizarRango('bytes=-500', MIL)).toEqual({ clase: 'parcial', desde: 500, hasta: 999 });
  });

  it('un sufijo más largo que el archivo se recorta al archivo entero', () => {
    expect(analizarRango('bytes=-5000', MIL)).toEqual({ clase: 'parcial', desde: 0, hasta: 999 });
  });

  it('un final más allá del archivo se recorta al último byte', () => {
    expect(analizarRango('bytes=900-5000', MIL)).toEqual({ clase: 'parcial', desde: 900, hasta: 999 });
  });

  it('un comienzo fuera del archivo es inatendible', () => {
    expect(analizarRango('bytes=1000-1500', MIL)).toEqual({ clase: 'inatendible' });
    expect(analizarRango('bytes=2000-', MIL)).toEqual({ clase: 'inatendible' });
  });

  it('un rango invertido es inatendible', () => {
    expect(analizarRango('bytes=500-100', MIL)).toEqual({ clase: 'inatendible' });
  });

  it('`bytes=-0` es inatendible', () => {
    expect(analizarRango('bytes=-0', MIL)).toEqual({ clase: 'inatendible' });
  });

  it('un archivo vacío no tiene ningún byte que satisfacer', () => {
    expect(analizarRango('bytes=0-0', 0)).toEqual({ clase: 'inatendible' });
    // Sin cabecera sigue siendo una respuesta completa, de cero bytes.
    expect(analizarRango(null, 0)).toEqual({ clase: 'completo' });
  });

  // Se responde el archivo entero en vez de `multipart/byteranges`: ningún reproductor lo
  // necesita para un curso, y el formato multiparte es superficie de error sin beneficio.
  it('varios rangos en una cabecera se sirven como archivo completo', () => {
    expect(analizarRango('bytes=0-99,200-299', MIL)).toEqual({ clase: 'completo' });
  });

  it('una unidad que no es bytes se ignora', () => {
    expect(analizarRango('items=0-10', MIL)).toEqual({ clase: 'completo' });
    expect(analizarRango('bytes=abc-def', MIL)).toEqual({ clase: 'completo' });
    expect(analizarRango('bytes=-', MIL)).toEqual({ clase: 'completo' });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx jest lib/sig/__tests__/rango-http.test.ts
```

Esperado: **FAIL** con `Cannot find module '../rango-http'`.

- [ ] **Step 3: Escribir el módulo**

Creá `lib/sig/rango-http.ts`:

```ts
// lib/sig/rango-http.ts
//
// Interpretar la cabecera `Range:` contra el tamaño de un archivo (RFC 7233 §3.1).
//
// Puro y aparte de la ruta por la misma razón que `scorm-tiempo.ts` está aparte del modelo:
// un rango mal interpretado NO falla. Sirve los bytes equivocados, y lo que se ve es un
// video corrupto que nadie relaciona con esta función.
//
// El caso que más se confunde es el sufijo: `bytes=-500` son los ÚLTIMOS 500 bytes. Leerlo
// como «del 0 al 500» sirve el principio del archivo cuando el reproductor pidió el final,
// que es justo donde un MP4 con el `moov` al final guarda su índice.

export type Rango =
  /// Sin cabecera, o con una que no entendemos: se sirve el archivo entero con 200.
  | { clase: 'completo' }
  /// Ambos extremos INCLUSIVOS, ya recortados al archivo.
  | { clase: 'parcial'; desde: number; hasta: number }
  /// 416 · el rango no se puede satisfacer.
  | { clase: 'inatendible' };

/// Un solo rango de bytes. Lo que no case —varios rangos, otra unidad, basura— cae en
/// `completo`: responder de más es correcto y es lo que el estándar permite; adivinar no.
const UN_RANGO = /^bytes=(\d*)-(\d*)$/;

export function analizarRango(cabecera: string | null, tamano: number): Rango {
  if (cabecera === null || cabecera.trim() === '') return { clase: 'completo' };

  const m = UN_RANGO.exec(cabecera.trim());
  if (m === null) return { clase: 'completo' };

  const [, crudoDesde, crudoHasta] = m;
  // `bytes=-` no dice nada.
  if (crudoDesde === '' && crudoHasta === '') return { clase: 'completo' };

  // Un archivo de cero bytes no tiene ningún rango que satisfacer. Se contesta antes de
  // calcular nada: con `tamano - 1` las cuentas de abajo darían -1 y un rango imposible.
  if (tamano === 0) return { clase: 'inatendible' };

  if (crudoDesde === '') {
    const largo = Number(crudoHasta);
    // `bytes=-0` pide los últimos cero bytes: no hay nada que devolver.
    if (largo === 0) return { clase: 'inatendible' };
    return { clase: 'parcial', desde: Math.max(0, tamano - largo), hasta: tamano - 1 };
  }

  const desde = Number(crudoDesde);
  if (desde >= tamano) return { clase: 'inatendible' };

  const hasta = crudoHasta === '' ? tamano - 1 : Math.min(Number(crudoHasta), tamano - 1);
  if (hasta < desde) return { clase: 'inatendible' };

  return { clase: 'parcial', desde, hasta };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx jest lib/sig/__tests__/rango-http.test.ts
```

Esperado: **PASS**, 12 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/rango-http.ts lib/sig/__tests__/rango-http.test.ts
git commit -m "feat(scorm): analizarRango, para servir tramos de un archivo

Puro y aparte de la ruta: un rango mal interpretado no falla, sirve los bytes
equivocados. El borde que mas se confunde es el sufijo — \`bytes=-500\` son los
ultimos 500 bytes, y leerlo al reves sirve el principio del archivo cuando el
reproductor pidio el final, que es donde un MP4 guarda su indice."
```

---

## Tarea 3 · La ruta de archivos responde rangos y deja de traer el blob entero

**Por qué:** dos cosas a la vez, y la segunda importa más. Sin `Accept-Ranges` el navegador **ni siquiera intenta** pedir un rango. Y `select: { bytes: true }` trae el archivo completo de Postgres a memoria en cada petición: con el techo de paquete en 200 MB, un curso con video largo carga ese archivo entero por cada petición de rango. Es la forma del `rowCount` inflado que `HARNESS.md` documenta como la primera cicatriz — *«el proceso moría por falta de memoria»*.

**Files:**
- Modify: `app/scorm/archivo/[paqueteId]/[...ruta]/route.ts`
- Test: `app/scorm/archivo/[paqueteId]/[...ruta]/__tests__/route.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Creá el directorio y el archivo `app/scorm/archivo/[paqueteId]/[...ruta]/__tests__/route.test.ts`. El patrón de mocks es el de `app/sgsi/acciones/__tests__/riesgos.test.ts` (primer archivo del repo en mockear Prisma por completo).

```ts
/**
 * @jest-environment node
 */

// app/scorm/archivo/[paqueteId]/[...ruta]/__tests__/route.test.ts
//
// Tres caminos —200, 206 y 416— y una invariante que los cruza: **la CSP va en los tres**.
// Una respuesta parcial sin política es un hueco por el que se sirve contenido de un
// paquete sin las restricciones que ese paquete declaró.
//
// Prisma se mockea por completo: cargarlo de verdad pediría una base.

jest.mock('server-only', () => ({}));

const findUnique = jest.fn();
const queryRaw = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    archivoScorm: { findUnique: (...a: unknown[]) => findUnique(...a) },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  },
}));

const cabeceras = new Map<string, string>();
jest.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => cabeceras.get(k.toLowerCase()) ?? null }),
}));

import { GET } from '../route';

const CONTENIDO = 'https://cursos.sig.example.com';
const APP = 'https://sig.example.com';

const params = Promise.resolve({ paqueteId: '7', ruta: ['video', 'clase.mp4'] });

beforeEach(() => {
  jest.clearAllMocks();
  cabeceras.clear();
  cabeceras.set('host', 'cursos.sig.example.com');
  process.env.SCORM_ORIGEN_CONTENIDO = CONTENIDO;
  process.env.SCORM_ORIGEN_APP = APP;

  findUnique.mockResolvedValue({
    id: 42,
    mime: 'video/mp4',
    sha256: 'abc123',
    tamano: 1000,
    paquete: { dominiosExternos: [] },
  });
  // `prisma.$queryRaw` se invoca como plantilla etiquetada, así que llega
  // `(templateStringsArray, ...valores)` con los valores EN EL ORDEN DEL TEXTO:
  // `(desde + 1, largo, id)`.
  //
  // El mock devuelve un trozo del largo que se le pidió, para poder comprobar que la ruta
  // pide EXACTAMENTE el tramo y no el archivo entero.
  queryRaw.mockImplementation(async (_sql: unknown, ...valores: number[]) => {
    const [, largo] = valores;
    return [{ trozo: Buffer.alloc(largo, 1) }];
  });
});

describe('sin cabecera Range', () => {
  it('responde 200, con Accept-Ranges y la CSP', async () => {
    const r = await GET(new Request('http://x/'), { params });

    expect(r.status).toBe(200);
    // Sin esta cabecera el navegador NI SIQUIERA INTENTA pedir un rango, y el video no se
    // puede adelantar aunque el 206 esté implementado.
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    expect(r.headers.get('Content-Length')).toBe('1000');
    expect(r.headers.get('Content-Type')).toBe('video/mp4');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(r.headers.get('ETag')).toBe('"abc123"');
  });

  it('no trae el blob completo en la consulta de metadatos', async () => {
    await GET(new Request('http://x/'), { params });

    // La primera consulta NO pide `bytes`: traer 200 MB a memoria para leer el mime es la
    // forma del `rowCount` inflado que HARNESS.md documenta.
    const seleccion = findUnique.mock.calls[0][0].select;
    expect(seleccion.bytes).toBeUndefined();
    expect(seleccion.tamano).toBe(true);
  });
});

describe('con un rango válido', () => {
  it('responde 206 con Content-Range y sólo el tramo', async () => {
    cabeceras.set('range', 'bytes=100-199');
    const r = await GET(new Request('http://x/'), { params });

    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(r.headers.get('Content-Length')).toBe('100');
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    // La CSP también acá: una respuesta parcial sin política sirve contenido sin las
    // restricciones que el paquete declaró.
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const cuerpo = Buffer.from(await r.arrayBuffer());
    expect(cuerpo.length).toBe(100);
  });

  it('le pide a Postgres el tramo, no el archivo', async () => {
    cabeceras.set('range', 'bytes=100-199');
    await GET(new Request('http://x/'), { params });

    // `substring` en Postgres es 1-indexado: el byte 100 es la posición 101.
    // Los valores van en el orden del texto de la consulta: (desde + 1, largo, id).
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const valores = queryRaw.mock.calls[0].slice(1);
    expect(valores).toEqual([101, 100, 42]);
  });
});

describe('con un rango inatendible', () => {
  it('responde 416 con Content-Range y sin leer bytes', async () => {
    cabeceras.set('range', 'bytes=5000-6000');
    const r = await GET(new Request('http://x/'), { params });

    expect(r.status).toBe(416);
    expect(r.headers.get('Content-Range')).toBe('bytes */1000');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    // No se lee ningún byte para contestar que el rango no sirve.
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('las guardas que ya existían', () => {
  it('404 fuera del origen de contenido', async () => {
    cabeceras.set('host', 'sig.example.com');
    const r = await GET(new Request('http://x/'), { params });
    expect(r.status).toBe(404);
  });

  it('404 cuando el archivo no está en el paquete', async () => {
    findUnique.mockResolvedValue(null);
    const r = await GET(new Request('http://x/'), { params });
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx jest "app/scorm/archivo"
```

Esperado: **FAIL**. Concretamente: `Accept-Ranges` es `null`, el `describe` del 206 recibe `200`, el del 416 recibe `200`, y `seleccion.bytes` es `true` en vez de `undefined`. Los dos 404 ya pasan — están para comprobar que el cambio no rompe las guardas.

- [ ] **Step 3: Reescribir la ruta**

Reemplazá el contenido completo de `app/scorm/archivo/[paqueteId]/[...ruta]/route.ts`:

```ts
// app/scorm/archivo/[paqueteId]/[...ruta]/route.ts
//
// Sirve los bytes de un paquete SCORM. Vive en el ORIGEN DE CONTENIDO y sólo responde ahí.
//
// No exige sesión a propósito (P3): el contenido de un curso es público dentro de la
// organización y el control de acceso está en la página del player, que sí la exige. Lo que
// no puede pasar es que esta ruta responda en el origen de la aplicación — ahí el
// JavaScript del curso tendría el origen de la sesión.
//
// **Responde por tramos, y lee por tramos.** Las dos mitades son necesarias y son distintas:
// sin `Accept-Ranges` y `206` el navegador no puede buscar dentro de un video; y si para
// contestar un tramo hubiera que traer el archivo entero de Postgres, un curso con video
// largo cargaría 200 MB en memoria por cada petición de rango. Eso último es la forma del
// `rowCount` inflado que HARNESS.md documenta como la primera cicatriz.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { cspDelPaquete, esOrigenDeContenido } from '@/lib/sig/scorm-origen';
import { analizarRango } from '@/lib/sig/rango-http';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paqueteId: string; ruta: string[] }> },
) {
  const cabeceras = await headers();
  if (!esOrigenDeContenido(cabeceras.get('host'), process.env.SCORM_ORIGEN_CONTENIDO)) {
    return new NextResponse('no disponible en este origen', { status: 404 });
  }

  const { paqueteId, ruta } = await params;
  const id = Number(paqueteId);
  if (!Number.isInteger(id)) return new NextResponse('paquete inválido', { status: 400 });

  // Los metadatos SIN los bytes. Es el cambio que impide cargar el archivo entero para
  // saber su mime.
  const archivo = await prisma.archivoScorm.findUnique({
    where: { paqueteId_ruta: { paqueteId: id, ruta: ruta.join('/') } },
    select: {
      id: true,
      mime: true,
      sha256: true,
      tamano: true,
      paquete: { select: { dominiosExternos: true } },
    },
  });
  if (archivo === null) return new NextResponse('archivo no encontrado', { status: 404 });

  // Van en los TRES caminos. Una respuesta parcial sin CSP sirve el contenido de un paquete
  // sin las restricciones que ese paquete declaró, y es el mismo contenido.
  const comunes: Record<string, string> = {
    'Content-Type': archivo.mime,
    // El contenido de un paquete es inmutable: una versión nueva es un paquete nuevo con
    // otro id, así que la URL cambia. Sin esto se leería de Postgres en cada vista.
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${archivo.sha256}"`,
    'X-Content-Type-Options': 'nosniff',
    // `SCORM_ORIGEN_APP` va en `frame-ancestors`: la app embebe el runner que embebe este
    // contenido, y `frame-ancestors` mira toda la cadena. Sin él, `'self'` bloquea a la
    // app (otro origen) y el curso no carga. Ver `cspDelPaquete`.
    'Content-Security-Policy': cspDelPaquete(
      archivo.paquete.dominiosExternos,
      process.env.SCORM_ORIGEN_APP,
    ),
  };

  const rango = analizarRango(cabeceras.get('range'), archivo.tamano);

  if (rango.clase === 'inatendible') {
    // No se lee ni un byte para contestar que el rango no sirve.
    return new NextResponse('rango no satisfacible', {
      status: 416,
      headers: { ...comunes, 'Content-Range': `bytes */${archivo.tamano}` },
    });
  }

  const desde = rango.clase === 'parcial' ? rango.desde : 0;
  const hasta = rango.clase === 'parcial' ? rango.hasta : archivo.tamano - 1;
  const largo = Math.max(0, hasta - desde + 1);

  // `substring` sobre `bytea` corta EN POSTGRES y devuelve sólo el tramo. Es 1-indexado, de
  // ahí el `+ 1`. Los `::int` son deliberados: sin ellos el parámetro llega sin tipo y el
  // planificador puede no resolver la sobrecarga de `substring`.
  const filas = await prisma.$queryRaw<{ trozo: Uint8Array }[]>`
    SELECT substring("bytes" FROM ${desde + 1}::int FOR ${largo}::int) AS trozo
    FROM "archivo_scorm"
    WHERE "id" = ${archivo.id}
  `;

  const buffer = Buffer.from(filas[0]?.trozo ?? new Uint8Array(0));
  const cuerpo = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  if (rango.clase === 'parcial') {
    return new NextResponse(cuerpo, {
      status: 206,
      headers: {
        ...comunes,
        'Content-Length': String(largo),
        'Content-Range': `bytes ${desde}-${hasta}/${archivo.tamano}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  return new NextResponse(cuerpo, {
    status: 200,
    headers: { ...comunes, 'Content-Length': String(largo), 'Accept-Ranges': 'bytes' },
  });
}
```

> **Si el test de `queryRaw` falla por la forma de los argumentos:** el mock asume la plantilla
> etiquetada, que llega como `(templateStringsArray, 101, 100, 42)`. Si en esta versión de Prisma
> llega distinto, ajustá **el mock** para leer los valores de donde estén —no cambies la ruta para
> acomodar el test—. Lo que el test tiene que seguir afirmando es que se pide
> `(desde + 1, largo, id)` y no el archivo entero.

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx jest "app/scorm/archivo"
```

Esperado: **PASS**, 8 pruebas.

- [ ] **Step 5: Verificar que no se rompió el resto**

```bash
npx prisma generate && npx tsc --noEmit
```

Esperado: 0 errores. Si aparece un error en un archivo que no tocaste, borrá `tsconfig.tsbuildinfo` y repetí: el caché incremental se pone rancio.

- [ ] **Step 6: Commit**

```bash
git add "app/scorm/archivo/[paqueteId]/[...ruta]/route.ts" "app/scorm/archivo/[paqueteId]/[...ruta]/__tests__/route.test.ts"
git commit -m "feat(scorm): el servidor de archivos responde por tramos, y lee por tramos

Sin \`Accept-Ranges\` y 206 el navegador no puede buscar dentro de un video: no
se adelanta, y Safari directamente no reproduce. Es el primer paquete con video.

La segunda mitad importa mas: la consulta traia el blob entero para leer el
mime. Con el techo de paquete en 200 MB, un curso con video largo cargaba ese
archivo completo en memoria por cada peticion de rango — la forma del rowCount
inflado. Ahora los metadatos van sin bytes y el tramo se corta con \`substring\`
en Postgres.

La CSP va en los tres caminos: una respuesta parcial sin politica sirve el
mismo contenido sin las restricciones que el paquete declaro."
```

---

## Tarea 4 · Un hipervínculo deja de convertir el paquete en DESPACHO

**Por qué:** `dominiosDe` busca `https?://` en el HTML del SCO sin distinguir **qué hace** cada URL. `index.html:45` enlaza a Dynamics con un `<a target="_blank">`, así que el paquete se clasifica **DESPACHO** y `abrirIntento` escribe en la bitácora *«correo y nombre → org8fcf0faf.crm3.dynamics.com»* en cada apertura. **Eso no ocurre**: el SCO no transmite nada, hay un enlace que la persona puede clicar, y si lo clica va con su propia sesión. El registro P20 existe para responder «¿a quién le compartimos los datos de nuestros colaboradores?», y una entrada falsa ahí contamina la única lista que alguien consultaría.

Es el mismo defecto que el filtro de `NAMESPACES` ya previene veinte líneas más arriba (`scorm-manifiesto.ts:55-57`), con las mismas palabras. Se pensó en los namespaces XML; no se pensó en los hipervínculos.

**Files:**
- Modify: `lib/sig/scorm-manifiesto.ts:76-79`
- Test: `lib/sig/__tests__/scorm-manifiesto.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregá este `describe` al final de `lib/sig/__tests__/scorm-manifiesto.test.ts`. `analizarManifiesto` ya está importado; agregá `dominiosDe` a esa importación:

```ts
// La constante `AUTOCONTENIDO` ya existe en este archivo y declara `shared/launch.html`
// como entrada.

describe('un hipervínculo no es un origen de contenido', () => {
  // Un `<a href>` NO carga nada y NO transmite nada: es una navegación que la persona puede
  // tomar, con su propia sesión y en otra pestaña. Ninguna directiva de CSP la gobierna.
  //
  // Clasificarlo como DESPACHO hace que `abrirIntento` anote «correo y nombre → ese dominio»
  // en la bitácora de datos a terceros. Es una afirmación falsa ante un auditor, y además le
  // abre el dominio en la CSP. Es el mismo argumento del filtro de NAMESPACES.
  const SOLO_ENLACE = `<html><body>
    <h2>Practica en el sistema</h2>
    <a href="https://org8fcf0faf.crm3.dynamics.com/main.aspx?etn=lead" target="_blank">Mis leads</a>
  </body></html>`;

  it('descarta el dominio que sólo aparece como destino de un <a href>', () => {
    expect(dominiosDe(SOLO_ENLACE)).toEqual([]);
  });

  it('el paquete que sólo enlaza afuera es AUTOCONTENIDO', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html': SOLO_ENLACE,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paquete.clase).toBe('AUTOCONTENIDO');
    expect(r.paquete.dominiosExternos).toEqual([]);
  });

  // **La otra mitad, y es la que prueba que esto no es una puerta.** Un despacho real CARGA
  // al tercero. Si el mismo dominio aparece además cargándose, cuenta como antes.
  it('el mismo dominio, si además se CARGA, sigue siendo DESPACHO', () => {
    const enlazaYCarga = `<html><body>
      <a href="https://proveedor.example.com/ayuda" target="_blank">Ayuda</a>
      <script src="https://proveedor.example.com/driver.js"></script>
    </body></html>`;

    expect(dominiosDe(enlazaYCarga)).toEqual(['https://proveedor.example.com']);

    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html': enlazaYCarga,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paquete.clase).toBe('DESPACHO');
  });

  it('un iframe al tercero sigue siendo DESPACHO aunque también haya un enlace', () => {
    const conIframe = `<html><body>
      <a href="https://proveedor.example.com/ayuda">Ayuda</a>
      <iframe src="https://proveedor.example.com/curso?course_token=abc"></iframe>
    </body></html>`;
    expect(dominiosDe(conIframe)).toEqual(['https://proveedor.example.com']);
  });

  // Un `.js` no tiene `<a href>`, así que nada se descarta ahí. Es donde un driver de
  // despacho arma la URL del proveedor, y ese escaneo no se toca.
  it('no descarta nada dentro de un JavaScript', () => {
    expect(dominiosDe(`var url = "https://proveedor.example.com/lanzar";`)).toEqual([
      'https://proveedor.example.com',
    ]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx jest lib/sig/__tests__/scorm-manifiesto.test.ts -t "no es un origen de contenido"
```

Esperado: **FAIL** en los dos primeros `it`. `dominiosDe(SOLO_ENLACE)` devuelve `['https://org8fcf0faf.crm3.dynamics.com']` en vez de `[]`, y la clase es `DESPACHO` en vez de `AUTOCONTENIDO`. Los otros tres ya pasan: están para fijar que el cambio no abre una puerta.

- [ ] **Step 3: Cambiar `dominiosDe`**

En `lib/sig/scorm-manifiesto.ts`, agregá la constante justo después de `NAMESPACES` / `esNamespace`, y reemplazá la función `dominiosDe` completa:

```ts
/// El destino de un `<a href>`. No incluye `<link href>` ni `<base href>` a propósito: el
/// primero CARGA una hoja de estilos y el segundo reescribe todas las URL relativas del
/// documento, y las dos cosas sí son orígenes de contenido.
const ANCLA_HREF = /<a\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi;

/// Los orígenes que aparecen en un texto. Heurística deliberada y acotada: no pretende
/// encontrar todo lo que un curso pueda cargar en tiempo de ejecución — para eso está la
/// CSP, que bloquea lo no declarado y lo hace visible (P18).
///
/// **Un `<a href>` no cuenta.** No carga nada y no transmite nada: es una navegación que la
/// persona puede tomar, con su propia sesión y en otra pestaña, y ninguna directiva de CSP
/// la gobierna. Contarlo clasificaría como DESPACHO a un curso que enlaza a una norma, a un
/// manual o a la intranet —que es lo normal en un curso del SGSI— y haría que la bitácora
/// afirmara un envío de datos a un tercero que nunca ocurre. Es el mismo argumento de
/// `NAMESPACES`, aplicado a los hipervínculos.
///
/// La regla es ASIMÉTRICA a propósito: se descarta el origen cuyas apariciones son TODAS
/// destinos de enlace. Basta con que aparezca una vez cargándose —un `<script src>`, un
/// `<iframe>`, un `fetch`, un `window.location`— para que cuente como antes. Eso es lo que
/// impide que sea una puerta: un despacho real CARGA al tercero, y esa carga se sigue viendo.
export function dominiosDe(texto: string): string[] {
  const todos = (texto.match(ORIGEN_EXTERNO) ?? []).filter((o) => !esNamespace(o));
  if (todos.length === 0) return [];

  const apariciones = new Map<string, number>();
  for (const o of todos) apariciones.set(o, (apariciones.get(o) ?? 0) + 1);

  const comoEnlace = new Map<string, number>();
  for (const [, href] of texto.matchAll(ANCLA_HREF)) {
    for (const o of href.match(ORIGEN_EXTERNO) ?? []) {
      comoEnlace.set(o, (comoEnlace.get(o) ?? 0) + 1);
    }
  }

  const cargados = [...apariciones.entries()]
    .filter(([origen, veces]) => veces > (comoEnlace.get(origen) ?? 0))
    .map(([origen]) => origen);

  return [...new Set(cargados)].sort();
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx jest lib/sig/__tests__/scorm-manifiesto.test.ts
```

Esperado: **PASS**, todo el archivo. Prestá atención a las pruebas viejas de DESPACHO (las de `course_token` y la del driver en un `.js`): tienen que seguir en verde. Si alguna se puso roja, el filtro se comió una carga real y hay que arreglarlo, no ajustar la prueba.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-manifiesto.ts lib/sig/__tests__/scorm-manifiesto.test.ts
git commit -m "fix(scorm): un hipervinculo no convierte el paquete en DESPACHO

\`dominiosDe\` contaba cualquier https:// del HTML del SCO sin mirar que hacia.
Un curso que enlaza a una norma, a un manual o a la intranet —lo normal en un
curso del SGSI— se clasificaba DESPACHO, y con eso \`abrirIntento\` anotaba en la
bitacora «correo y nombre → ese dominio» en cada apertura. No ocurre: el SCO no
transmite nada, hay un enlace que la persona puede clicar, y si lo clica va con
su propia sesion. Una entrada falsa ahi contamina la unica lista que alguien
consultaria para responder a quien le compartimos datos de colaboradores.

Se descarta el origen cuyas apariciones son TODAS destinos de <a href>. La
asimetria es deliberada: basta una carga —script, iframe, fetch— para que cuente
como antes. Un despacho real carga al tercero, y esa carga se sigue viendo.

Es el mismo argumento del filtro de NAMESPACES, aplicado a los hipervinculos."
```

---

## Tarea 5 · Migrar el paquete: `imsmanifest.xml` y `scorm-api.js`

**Por qué:** acá está el **bloqueante**. El curso son dos páginas en el mismo iframe y `scorm-api.js` llama a `terminar()` en `beforeunload`. El runner vive en el iframe padre y no se recarga, así que `Terminate` cierra la sesión antes de que el cuestionario empiece: `Initialize` devuelve 104 y cada `SetValue` 133 — **la evaluación no reporta nada**. Y ese `Terminate` dispara un commit final con `completion_status = incomplete`, que no registra.

**Preparación (una sola vez, antes del Step 1):**

```bash
mkdir -p /tmp/leads2004 && cd /tmp/leads2004
unzip -o -q ~/Downloads/gestionar-leads-scorm12.zip
```

Trabajá ahí. Los siete PNG, el `.mp4` y `estilos.css` no se tocan.

**Files:**
- Modify: `/tmp/leads2004/imsmanifest.xml`
- Modify: `/tmp/leads2004/scorm-api.js`

- [ ] **Step 1: Reescribir `imsmanifest.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFIESTO-D365-CC-M1"
          version="1.0"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
          xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
          xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
          xmlns:imsss="http://www.imsglobal.org/xsd/imsss">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>

  <organizations default="ORG-D365">
    <organization identifier="ORG-D365">
      <title>Dynamics 365 Contact Center — Asesor comercial</title>

      <item identifier="ITEM-M1" identifierref="RES-M1" isvisible="true">
        <title>Módulo 1 · Gestionar clientes potenciales</title>
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="RES-M1" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html"/>
      <file href="cuestionario.html"/>
      <file href="scorm-api.js"/>
      <file href="estilos.css"/>
      <file href="img/leads-01-lista.png"/>
      <file href="img/leads-02-selector-vistas.png"/>
      <file href="img/leads-03-ficha.png"/>
      <file href="img/leads-04-fase-calificar.png"/>
      <file href="img/leads-05-pestana-detalles.png"/>
      <file href="img/leads-06-escala-tiempo.png"/>
      <file href="img/leads-07-selector-formulario.png"/>
      <file href="video/01-gestionar-leads.mp4"/>
    </resource>
  </resources>
</manifest>
```

Tres cosas que, si se erran, el paquete se rechaza o se clasifica mal:

1. **`<schemaversion>` dice `2004 4th Edition` exacto.** `EDICIONES_SOPORTADAS` (`lib/sig/scorm-manifiesto.ts:32`) compara la cadena completa, sin normalizar.
2. `adlcp:scormType` con **T mayúscula** (en 1.2 era `scormtype`).
3. **`adlcp:masteryscore` desaparece y no se reemplaza.** En 2004 vive en la secuenciación, y no se incluye: la nota de aprobación la fija `notaMinima` del contenido en el SIG (P15), no el autor del curso. El cuestionario conserva su propio `MINIMO` de 80 para decidir qué le muestra a la persona.

> **Aviso operativo, anotalo para el paso de publicación (tarea 9):** si `notaMinima` del contenido en el SIG y el `MINIMO` del cuestionario no coinciden, **el curso puede felicitar a alguien que el SIG reprueba**. Hay que publicarlos iguales. El SIG manda.

- [ ] **Step 2: Reescribir `scorm-api.js` completo**

```js
/**
 * Puente mínimo con la API de SCORM 2004 4th Edition.
 *
 * El LMS inyecta `API_1484_11` en window, o en el window padre si el contenido corre dentro
 * de un iframe. Hay que subir por la jerarquía hasta encontrarlo: es el error más común al
 * empaquetar SCORM, porque en pruebas locales el contenido suele estar en el mismo window y
 * funciona, y dentro del LMS real está anidado y deja de encontrarse.
 *
 * **ESTE CURSO SON DOS PÁGINAS Y UN SOLO SCO.** `index.html` y `cuestionario.html` se cargan
 * en el mismo iframe; el LMS vive en el iframe padre y NO se recarga al navegar entre ellas.
 * De ahí las dos reglas que ordenan este archivo:
 *
 *   1. `beforeunload` sólo hace `Commit`. NUNCA `Terminate`. Un `Terminate` al pasar de la
 *      lección al cuestionario le dice al LMS que el curso acabó: la sesión se cierra, el
 *      `Initialize` de la segunda página recibe 104 y cada `SetValue` recibe 133. La
 *      evaluación no reportaría nada — ni nota, ni completitud, ni interacciones.
 *   2. El `Initialize` de la segunda página recibe 103 (Already Initialized). No es un
 *      error que haya que sortear: es el estándar diciendo «esta sesión ya está abierta»,
 *      que es exactamente lo que queremos. Se trata como éxito.
 *
 * `Terminate` se llama UNA vez, desde `cuestionario.html`, después de reportar el resultado.
 */
(function (global) {
  'use strict';

  var api = null;
  var iniciado = false;

  var YA_INICIALIZADO = '103';

  /** Duración ISO 8601 de SCORM 2004: `PT1H23M45S`. NO es el `HHHH:MM:SS.SS` de 1.2. */
  function duracionISO(segundos) {
    var s = Math.max(0, Math.round(segundos || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    return 'PT' + h + 'H' + m + 'M' + (s % 60) + 'S';
  }

  /** Marca de tiempo ISO 8601 local, sin milisegundos: `2026-09-18T14:23:05`. */
  function momentoISO(fecha) {
    var d = fecha || new Date();
    function dd(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()) + 'T' +
           dd(d.getHours()) + ':' + dd(d.getMinutes()) + ':' + dd(d.getSeconds());
  }

  function buscarEnJerarquia(win) {
    var intentos = 0;
    while (win && intentos < 10) {
      if (win.API_1484_11) return win.API_1484_11;
      if (win.parent === win) break;
      win = win.parent;
      intentos += 1;
    }
    return null;
  }

  function obtenerAPI() {
    if (api) return api;
    api = buscarEnJerarquia(window);
    if (!api && window.opener) api = buscarEnJerarquia(window.opener);
    return api;
  }

  var SCORM = {
    /** ¿Estamos dentro de un LMS? Si no, el contenido igual debe poder leerse. */
    disponible: function () {
      return obtenerAPI() !== null;
    },

    iniciar: function () {
      var a = obtenerAPI();
      if (!a) return false;
      if (a.Initialize('') === 'true') { iniciado = true; return true; }
      // 103 · la segunda página del SCO. Misma sesión, que es lo que queremos.
      if (a.GetLastError() === YA_INICIALIZADO) { iniciado = true; return true; }
      return false;
    },

    obtener: function (clave) {
      var a = obtenerAPI();
      return a ? a.GetValue(clave) : '';
    },

    guardar: function (clave, valor) {
      var a = obtenerAPI();
      if (!a) return false;
      return a.SetValue(clave, String(valor)) === 'true';
    },

    persistir: function () {
      var a = obtenerAPI();
      return a ? a.Commit('') === 'true' : false;
    },

    /**
     * Reporta el resultado de la evaluación.
     *
     * En 2004 completitud y éxito son DOS hechos distintos, y ésa es la mejora que motivó la
     * migración: `completed` + `failed` significa «vio el curso entero y no pasó», que en
     * 1.2 no se podía decir.
     *
     * `completion_status` es `completed` TAMBIÉN al reprobar, y es deliberado: el veredicto
     * del SIG sólo registra el intento si el curso se completó. Reportar `incomplete` al
     * reprobar borraría la evidencia de que la persona lo intentó.
     */
    reportarResultado: function (puntaje, aprobo) {
      if (!obtenerAPI()) return false;
      this.guardar('cmi.completion_status', 'completed');
      this.guardar('cmi.success_status', aprobo ? 'passed' : 'failed');
      this.guardar('cmi.score.scaled', puntaje / 100);   // 0–1, la única normalizada
      this.guardar('cmi.score.raw', puntaje);
      this.guardar('cmi.score.min', 0);
      this.guardar('cmi.score.max', 100);
      this.guardar('cmi.progress_measure', 1);
      return this.persistir();
    },

    /**
     * Registra una pregunta individual en `cmi.interactions`.
     *
     * Esto es lo que permite al LMS decir «falló la pregunta 3» en lugar de sólo «sacó 80».
     *
     * `respuesta` y `correcta` van como identificadores de opción (a, b, c…), que es el
     * formato del tipo `choice`.
     */
    registrarInteraccion: function (indice, datos) {
      if (!obtenerAPI()) return false;
      var n = 'cmi.interactions.' + indice + '.';
      this.guardar(n + 'id', datos.id);
      this.guardar(n + 'type', 'choice');
      this.guardar(n + 'learner_response', datos.respuesta);
      this.guardar(n + 'correct_responses.0.pattern', datos.correcta);
      this.guardar(n + 'result', datos.acerto ? 'correct' : 'incorrect');
      this.guardar(n + 'weighting', 1);
      this.guardar(n + 'timestamp', momentoISO(datos.momento));
      this.guardar(n + 'latency', duracionISO(datos.segundos));
      return true;
    },

    /** Tiempo de ESTA sesión. El LMS lo acumula en `cmi.total_time`. */
    reportarTiempoSesion: function (segundos) {
      if (!obtenerAPI()) return false;
      return this.guardar('cmi.session_time', duracionISO(segundos));
    },

    marcarEnCurso: function () {
      if (!obtenerAPI()) return false;
      // En 2004 no hay que leer nada antes: `completion_status` y `success_status` son
      // campos separados, así que marcar la completitud no puede degradar un `passed`.
      if (this.obtener('cmi.completion_status') !== 'completed') {
        this.guardar('cmi.completion_status', 'incomplete');
      }
      return this.persistir();
    },

    /** UNA sola llamada, desde `cuestionario.html`, cuando el curso de verdad acabó. */
    terminar: function (salida) {
      var a = obtenerAPI();
      if (!a || !iniciado) return false;
      this.guardar('cmi.exit', salida || 'normal');
      a.Commit('');
      iniciado = false;
      return a.Terminate('') === 'true';
    },
  };

  global.SCORM = SCORM;

  // **Commit, no Terminate.** Ver el encabezado: un `Terminate` acá mata la sesión al pasar
  // de la lección al cuestionario, y la evaluación no llega a reportar nada.
  //
  // Si la persona abandona a mitad y cierra la pestaña, no hay `Terminate` nunca: el intento
  // queda abierto con su avance, y el LMS lo recoge como abandonado si se cuelga. Es el
  // comportamiento correcto — no sabemos si va a volver.
  global.addEventListener('beforeunload', function () {
    if (iniciado) SCORM.persistir();
  });
})(window);
```

- [ ] **Step 3: Verificar el manifiesto contra el analizador real**

Esto es lo que dice si el paquete entra o no, sin necesidad de subirlo. Desde la raíz del repo:

```bash
cat > /tmp/verificar-manifiesto.mjs <<'EOF'
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analizarManifiesto } from './lib/sig/scorm-manifiesto.ts';

const raiz = '/tmp/leads2004';
const archivos = [];
(function caminar(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) caminar(p);
    else archivos.push(relative(raiz, p).split('\\').join('/'));
  }
})(raiz);

const contenidos = {};
for (const a of archivos) {
  if (/\.(html?|m?js)$/i.test(a)) contenidos[a] = readFileSync(join(raiz, a), 'utf8');
}

console.log(JSON.stringify(
  analizarManifiesto(readFileSync(join(raiz, 'imsmanifest.xml'), 'utf8'), archivos, contenidos),
  null, 2,
));
EOF
npx tsx /tmp/verificar-manifiesto.mjs
```

Esperado, exactamente:

```json
{
  "ok": true,
  "paquete": {
    "edicion": "2004 4th Edition",
    "organizacionId": "ORG-D365",
    "tituloOrganizacion": "Dynamics 365 Contact Center — Asesor comercial",
    "entradaHref": "index.html",
    "clase": "AUTOCONTENIDO",
    "dominiosExternos": [],
    "cursoExternoId": null
  }
}
```

`clase: AUTOCONTENIDO` y `dominiosExternos: []` sólo salen así **con la tarea 4 ya aplicada**. Si dice `DESPACHO`, volvé a la tarea 4 antes de seguir.

> **No hay commit en esta tarea.** El paquete vive fuera del repositorio (spec §7): las capturas
> son de una lista de leads real y el HTML lleva el identificador del tenant. Lo que sí está
> versionado es la receta — este plan y el §4.A del spec.

---

## Tarea 6 · Migrar el paquete: `index.html` y el avance

**Por qué:** acá sale el porcentaje, que es la razón de haber migrado. `<nav class="pasos">` **no** es un navegador de pasos —es el pie con el enlace a la evaluación—; los pasos son siete `<h2>` en una página con scroll, así que el avance es **hasta dónde llegó la persona**.

**Files:**
- Modify: `/tmp/leads2004/index.html` (sólo el `<script>` del pie, líneas 95-102)

- [ ] **Step 1: Poner un id a cada `<h2>` de paso**

Los siete `<h2>` (líneas 36, 51, 55, 65, 78, 81, 86) pasan a llevar `id="paso1"` … `id="paso7"`, en ese orden. Por ejemplo, la línea 36:

```html
<h2 id="paso1">Paso 1 · Abre tu lista de trabajo</h2>
```

y así hasta:

```html
<h2 id="paso7">Paso 7 · Cambiar de formulario</h2>
```

No cambia nada más de esas líneas: sólo se agrega el atributo.

- [ ] **Step 2: Reemplazar el `<script>` del pie**

Reemplazá el bloque de las líneas 95-102 (`<script> … </script>`, el que llama a `marcarVisto`) por:

```html
<script>
  // Ocho unidades: los siete pasos de la lección y el cuestionario. El octavo lo reporta
  // `cuestionario.html`, así que desde acá el techo es 7/8.
  var TOTAL = 8;
  var alcanzado = 0;

  function reportarAvance(unidad) {
    // Marca de agua: volver a subir NO deshace lo leído. Sin esto, el porcentaje bajaría
    // cada vez que alguien vuelve a mirar una captura, y el tablero mostraría un retroceso
    // que no ocurrió.
    if (unidad <= alcanzado) return;
    alcanzado = unidad;
    SCORM.guardar('cmi.progress_measure', alcanzado / TOTAL);
    SCORM.guardar('cmi.location', String(alcanzado));
    SCORM.persistir();
  }

  if (SCORM.disponible() && SCORM.iniciar()) {
    SCORM.marcarEnCurso();

    // Se reanuda donde quedó. `cmi.entry` lo fija el LMS: `resume` si el intento anterior
    // se suspendió, `ab-initio` si es nuevo.
    if (SCORM.obtener('cmi.entry') === 'resume') {
      var guardado = parseInt(SCORM.obtener('cmi.location'), 10);
      if (guardado > 0) {
        alcanzado = Math.min(guardado, 7);
        var destino = document.getElementById('paso' + alcanzado);
        if (destino) destino.scrollIntoView();
      }
    }

    // Un paso cuenta cuando entra en pantalla. `IntersectionObserver` y no el evento de
    // scroll: el navegador lo resuelve sin correr JavaScript en cada píxel, y el video de
    // 2,2 MB ya compite por el hilo.
    if (window.IntersectionObserver) {
      var observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          reportarAvance(Number(e.target.id.replace('paso', '')));
        });
      }, { threshold: 0.25 });

      for (var i = 1; i <= 7; i += 1) {
        var h = document.getElementById('paso' + i);
        if (h) observador.observe(h);
      }
    } else {
      // Sin observador no se finge precisión: se reporta el primer paso y nada más. Un
      // porcentaje inventado es peor que ninguno.
      reportarAvance(1);
    }
  } else {
    document.getElementById('avisoSinLms').hidden = false;
  }
</script>
```

> **No agregues un `Terminate` acá.** Es exactamente el bloqueante que motiva la tarea 5: matar la sesión antes del cuestionario.

- [ ] **Step 3: Comprobar que no quedó ningún rastro de 1.2**

```bash
grep -n "LMS\|cmi\.core\|marcarVisto\|lesson_status\|student_response" /tmp/leads2004/index.html /tmp/leads2004/scorm-api.js
```

Esperado: **ninguna coincidencia**. Si aparece alguna, quedó una llamada de 1.2 sin migrar.

---

## Tarea 7 · Migrar el paquete: `cuestionario.html` y el cierre

**Por qué:** es la única salida del SCO que afirma que el curso acabó, y la que dispara el cierre con `final = true`. Las cinco interacciones se registran **antes** del resultado: si el LMS corta la sesión al recibir el estado final, ya llegaron.

**Files:**
- Modify: `/tmp/leads2004/cuestionario.html`

- [ ] **Step 1: Ajustar el `iniciar()` del arranque**

Reemplazá el bloque que hoy dice:

```js
if (SCORM.disponible()) {
  SCORM.iniciar();
} else {
  document.getElementById('avisoSinLms').hidden = false;
}
```

por:

```js
// `iniciar()` recibe 103 (Already Initialized) porque `index.html` ya abrió la sesión y el
// LMS vive en el iframe padre, que no se recargó. El shim lo trata como éxito: es la misma
// sesión, que es lo que queremos.
if (SCORM.disponible() && SCORM.iniciar()) {
  // Llegar acá significa que la lección se recorrió entera: siete de ocho unidades. El 8/8
  // lo pone `reportarResultado`, y sólo al calificar — un 100 % antes de responder afirmaría
  // que el curso terminó cuando falta justo lo que se evalúa.
  SCORM.guardar('cmi.progress_measure', 7 / 8);
  // La marca de reanudación sí avanza a 8: si vuelve, ya estuvo en el cuestionario.
  SCORM.guardar('cmi.location', '8');
  SCORM.persistir();
} else {
  document.getElementById('avisoSinLms').hidden = false;
}
```

- [ ] **Step 2: Reemplazar el bloque de reporte final**

Reemplazá las cuatro líneas que hoy reportan (las de `registrarInteraccion`, `reportarTiempoSesion` y `reportarResultado`, justo antes de `document.getElementById('calificar').disabled = true;`) por:

```js
  // El detalle por pregunta va ANTES del resultado: si el LMS corta la sesión al recibir el
  // estado final, las interacciones ya llegaron.
  interacciones.forEach(function (it, n) { SCORM.registrarInteraccion(n, it); });
  SCORM.reportarTiempoSesion((Date.now() - inicioSesion) / 1000);
  SCORM.reportarResultado(puntaje, aprobo);

  // **La ÚNICA llamada a `Terminate` del curso.** Acá el curso de verdad acabó: es lo que
  // dispara el cierre con `final = true` en el LMS — el veredicto, el registro y, si el
  // resultado alcanza, el cierre de la asignación.
  //
  // `exit = normal` y no `suspend`: el intento se cierra. Reprobado también cierra el
  // intento; lo que sigue abierta es la asignación, para poder repetir la evaluación.
  SCORM.terminar('normal');
```

Fijate en la firma: `reportarResultado(puntaje, aprobo)` toma **dos** argumentos ahora, no tres. El `MINIMO` ya no viaja al LMS —lo decide `notaMinima` del contenido en el SIG (P15)— y el vocabulario `passed`/`failed` lo arma el shim.

- [ ] **Step 3: Comprobar que no quedó ningún rastro de 1.2**

```bash
grep -n "LMS\|cmi\.core\|lesson_status\|student_response\|reportarResultado(puntaje, MINIMO" /tmp/leads2004/cuestionario.html
```

Esperado: **ninguna coincidencia**.

- [ ] **Step 4: Empaquetar**

```bash
cd /tmp/leads2004 && rm -f ~/Downloads/gestionar-leads-scorm2004.zip \
  && zip -r -q ~/Downloads/gestionar-leads-scorm2004.zip . -x '.*' \
  && unzip -l ~/Downloads/gestionar-leads-scorm2004.zip
```

Esperado: 15 archivos, `imsmanifest.xml` **en la raíz** (no dentro de una carpeta — `guardarPaquete` lo busca exactamente en `imsmanifest.xml`).

---

## Tarea 8 · Los tres checks del harness

- [ ] **Step 1: Correr la verificación completa**

Con la herramienta **Bash**, no PowerShell:

```bash
npm run verificar:build
```

Esperado: `prisma generate` → `tsc --noEmit` 0 errores → `lint` 0 errores (se toleran los 5 warnings preexistentes) → `test` todo verde → `build` compila.

`verificar:migraciones` **no aplica**: este plan no agrega migraciones.

- [ ] **Step 2: Si `tsc` reporta un error en un archivo que no tocaste**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

El caché incremental se pone rancio y reporta errores ya arreglados.

---

## Tarea 9 · La prueba de punta a punta (Regla 3)

**Aplica**: hay pantalla, hay estado, hay decisión de la persona, y hay un flujo de varios pasos donde la salida de uno alimenta al siguiente. Los tres bugs que `HARNESS.md` documenta sobrevivieron a una suite verde.

Esto se ejecuta **a mano**, contra la aplicación corriendo. No hay spec de Playwright para el flujo de cursos —es deuda conocida, `HARNESS.md` §«El runner de punta a punta»—, así que **el recorrido escrito en el PR es la única evidencia que queda**.

- [ ] **Step 1: Publicar el contenido con la nota mínima correcta**

Creá o editá el `CURSO_VIRTUAL` de clase paquete y **poné `notaMinima` = 80**, igual que el `MINIMO` del cuestionario. Si no coinciden, el curso felicita a alguien que el SIG reprueba.

- [ ] **Step 2: Ejecutar el recorrido y anotar lo que se ve**

```
Recorrido (gestionar-leads 2004, 15 archivos, 3,1 MB):
  1. Subir el .zip migrado        -> aceptado; clase AUTOCONTENIDO, dominios externos: ninguno
  2. Revisar la bitácora          -> SIN entrada «datos_a_tercero»
  3. Asignarlo y abrirlo          -> el curso carga; el video reproduce
  4. Adelantar el video a 1:30    -> salta de inmediato
  5. Bajar hasta el Paso 4        -> /mi-sig muestra «Va por el 50 %»
  6. Cerrar la pestaña a mitad    -> «Guardado en el 50 % para seguir»
  7. Reabrir                      -> reanuda en el Paso 4
  8. Responder el cuestionario    -> nota reportada; la asignación pasa a REALIZADA
  9. Revisar el intento en la BD  -> las 5 interacciones CON su correct_responses.0.pattern
 10. Reabrir ya cerrada           -> modo repaso: no crea intento ni escribe
```

Los pasos **2** y **9** no se ven mirando la pantalla; hay que ir a buscarlos. Son los que justifican las tareas 4 y 1.

Para el paso 9, contra la base donde corriste la prueba:

```sql
SELECT jsonb_pretty(cmi) FROM intento_scorm ORDER BY id DESC LIMIT 1;
```

Esperado: cinco bloques `cmi.interactions.N.*`, cada uno con `id`, `type`, `learner_response`, **`correct_responses.0.pattern`**, `result`, `timestamp` y `latency`.

> **Usá la base local (5432), no producción (15432).** Producción es de sólo lectura por el túnel, y este recorrido escribe.

- [ ] **Step 3: Si algo del recorrido falla**

No lo arregles a ojo. Escribí primero el test que reproduce el fallo y verificalo en rojo (Regla 1), después el arreglo. Un recorrido que sólo pasa a veces no es evidencia.

- [ ] **Step 4: Commit del recorrido en el PR**

El recorrido ejecutado, **paso por paso y con lo que se vio**, va en la descripción del PR. No basta con «probado»: eso no lo puede verificar ni quien revisa ni quien vuelva dentro de seis meses.

---

## Al terminar

Las tres reglas del harness, en orden:

| | |
|---|---|
| **Regla 1** | Cada tarea del 1 al 4 vio su test en rojo antes del arreglo. Las tareas 5-7 son el paquete, fuera del repo: su verificación es el paso 3 de la tarea 5 y el recorrido de la tarea 9 |
| **Regla 2** | `npm run verificar:build` en limpio (tarea 8) |
| **Regla 3** | El recorrido de la tarea 9, escrito en el PR |

**Lo que queda nombrado y no resuelto** (está en el spec, §8): multi-SCO sigue prohibido y ahora pesa más, porque en cuanto existan los módulos 2, 3 y 4 la tentación es empaquetarlos juntos. El detalle por pregunta se guarda completo y ninguna pantalla lo lee. Y SCORM 1.2 sigue rechazado, por decisión.
