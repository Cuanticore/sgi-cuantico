# Firma por enlace público — Plan de implementación (REQ-SIG-19)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien salió de la organización con documentos sin firmar pueda firmarlos con un enlace único enviado a su correo personal, y que **el acta declare el medio real de identificación** en vez de invocar una autenticación corporativa que no ocurrió.

**Architecture:** Un solo núcleo de firma con dos puertas. La transacción de `firmarYAceptar` —registro, evidencia, acta, cierre y bitácora, que es la regla F7— se **extrae** a `asentarFirma(tx, …)`, y la llaman `firmarYAceptar` (sesión corporativa) y `firmarConEnlace` (enlace público). El texto del acta gana una variante del numeral 5 que sólo se emite cuando el medio es el enlace: con sesión corporativa el texto sale **byte por byte idéntico**, así que ninguna acta existente cambia de huella. Del token se guarda el hash y nunca el token. La ruta pública es **una** y no crece.

**Tech Stack:** Next 16.3.2 (App Router, ruta pública + Server Action), Prisma 7 + Postgres, `nodemailer` vía `lib/sgsi/notificaciones.ts`, `node:crypto`, jest + ts-jest.

**Requerimiento:** `docs/handoff_sig/firma-con-enlace-publico.md` — reglas P1…P22, decisiones D-1…D-9.
**Extiende:** REQ-SIG-02 · `docs/handoff_a/lectura-aceptacion-firma.md` (reglas F1…F7).
**Depende de:** REQ-SIG-15 §3.3 (el correo personal editable) y §6 (el bloqueo), que es lo que crea este caso.
**Fuente de verdad por encima de la spec:** `docs/handoff_sig/decisiones-2026-09-02.md`.

---

## Preparación · antes de la Task 1

Igual que el plan de REQ-SIG-15: `npm install`, `npx prisma generate`, y el baseline verde de **58 suites / 1095 pruebas**, `tsc` en 0, lint con 0 errores y 5 advertencias preexistentes. El servicio de compose es **`sgi-postgres`**.

**Este plan se ejecuta DESPUÉS de REQ-SIG-15**, y el orden no es negociable: el bloqueo de cuenta es lo que produce el caso que este requerimiento resuelve, y `correoPersonal` sólo se puede cargar desde el popup de REQ-SIG-15 §3.3.

---

## Lo primero que se midió, y lo que salió

La consulta de §1, corrida el 2026-09-10 **contra la base de desarrollo local**:

```
 nombre | correo | correo_personal | documento_identidad | pendientes
--------+--------+-----------------+---------------------+------------
(0 rows)
```

El cero no dice nada por sí solo. El contexto de esa misma base sí:

| Cifra | Valor |
|---|---|
| Personas | 90 |
| Inactivas | **54 — y las 54 son invitadas B2B (`#ext#`)** |
| Cuentas internas | 36, **todas activas** |
| Con `correo_personal` | **0** |
| Con `documento_identidad` | **0** |
| Contenidos con `exigeFirma` | **0** |

**Tres conclusiones, y dos son trabajo que no es de programación.**

1. **No hay un solo ex colaborador en esta base.** Las 36 cuentas internas están todas activas. El caso que el requerimiento resuelve **no existe todavía** en los datos: va a existir el día que el botón de bloqueo de REQ-SIG-15 se use por primera vez.
2. **Nadie tiene correo personal ni documento de identidad.** D-7 y P5 exigen **las dos** para emitir el enlace. Con los datos de hoy, este requerimiento **no podría ayudar a nadie**: cada intento de emisión terminaría diciendo qué falta. Cargar esos dos campos es el primer trabajo, y se hace desde el popup de REQ-SIG-15 §3.3 — que es otra razón del orden.
3. **La consulta hay que correrla contra producción.** Esta base es de desarrollo y su censo es un espejo parcial. **El número que decide si esto es un caso o son cincuenta es el de producción, y no lo tengo.**

### Hallazgo · la consulta de §1 cuenta invitados como ex colaboradores

El filtro es `not p.activa`. En este tenant eso selecciona **exactamente las 54 cuentas invitadas B2B y nada más**: aliados de Tiindux, la UNAD y otros, que nunca fueron colaboradores.

Eso importa dos veces:

- **Como medición**, el número que la consulta devuelva va a estar inflado por gente que no pertenece al alcance del requerimiento.
- **Como conducta**, P4 exige `Persona.activa = false` para emitir el enlace. Tomado literal, la aplicación **le emitiría un enlace de firma al correo personal de un aliado de otra organización**. Es la misma frontera que REQ-SIG-15 P21.3 protege del otro lado, y que `lib/sgsi/graph-usuario.ts:18-22` ya sabe trazar con `userType === 'Guest'`.

**Propuesta —y necesita respuesta antes de la Task 5:** que la emisión exija, además de `activa = false`, que la persona **sea colaboradora de la organización**. El esquema ya distingue `retiradoEn` de `activa`, y su propio comentario dice que son «dos fuentes del mismo hecho» derivadas juntas en `lib/sig/colaboradores.ts`: `activa` espeja el Directorio y `retiradoEn` es el retiro de la **organización**. La condición sería `retiradoEn IS NOT NULL`, o el filtro de invitados que ya existe. **No lo decido yo:** cambia a quién le llega un correo.

---

## Preguntas que bloquean

**Q1 · El filtro de invitados en la emisión** (arriba). Bloquea la Task 5.

**Q2 · D-3 · el visto bueno legal.** Si la firma electrónica simple por enlace alcanza para lo que la organización le va a dar. **No bloquea construir; bloquea usarlo con ex colaboradores.** Lo que hay que llevar a esa revisión está listado en la spec: el texto del numeral 5 (§7), las dos piezas de identificación (P5), el plazo (§6) y el uso único (D-5).

**Q3 · D-8 · el plazo.** 7 días por defecto. Es parámetro, así que cambiarlo después **no es un despliegue** — pero conviene confirmar el valor antes de que salga el primer correo.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sig/enlace-firma.ts` **(crear)** | **Puro.** Token, hash, código, estado del enlace, verificación del documento, tope de intentos |
| `lib/sig/__tests__/enlace-firma.test.ts` **(crear)** | |
| `lib/sig/firma.ts` **(modificar)** | `DatosDelActa` gana el medio y el canal; los numerales 1, 4 y 5 varían **sólo** en la vía por enlace |
| `lib/sig/__tests__/firma.test.ts` **(modificar)** | **El golden de la vía corporativa**: byte por byte |
| `prisma/schema.prisma` **(modificar)** | `EnlaceFirma`, `MedioIdentificacion`, `ContadorEnlace`, y tres campos en `ActaAceptacion` |
| `app/sig/acciones/firma.ts` **(modificar)** | `asentarFirma` extraída; `firmarYAceptar` la llama |
| `app/sig/acciones/enlace-firma.ts` **(crear)** | `emitirEnlace`, `reenviarEnlace`, `revocarEnlace`, `firmarConEnlace` |
| `app/firmar/[token]/page.tsx` **(crear)** | La única ruta pública |
| `app/firmar/[token]/PanelPublico.tsx` **(crear)** | Espeja `app/mi-sig/PanelFirma.tsx` con el mínimo de P11 |
| `middleware.ts` **(modificar)** | **Sólo un comentario** (P10). No se renombra a `proxy.ts` |
| `lib/sgsi/notificaciones.ts` **(reusar)** | El correo del enlace y la constancia |
| `.env.example` **(modificar)** | `FIRMA_ENLACE_DIAS=7` |

---

## Task 1: El núcleo puro del enlace

**Files:** `lib/sig/enlace-firma.ts`, `lib/sig/__tests__/enlace-firma.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

```ts
describe('generarToken', () => {
  // §6 · 32 bytes en base64url. NO un UUID: su formato invita a tratarlo como
  // identificador —se pega en tickets, se registra en logs— y no toda librería que los
  // genera usa un generador criptográfico.
  it('son 43 caracteres de base64url y nunca se repite', () => {
    const a = generarToken();
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generarToken()).not.toBe(a);
  });
});

describe('hashDeToken', () => {
  // P2 · la verificación es una BÚSQUEDA por hash, no una comparación de secretos, así
  // que no hay que preocuparse por tiempos: no se compara nada.
  it('es estable y no devuelve el token', () => {
    const t = generarToken();
    expect(hashDeToken(t)).toBe(hashDeToken(t));
    expect(hashDeToken(t)).not.toContain(t);
    expect(hashDeToken(t)).toHaveLength(64);
  });
});

describe('estadoDelEnlace', () => {
  // P13 · inexistente, expirado, revocado y bloqueado producen LA MISMA página. Acá se
  // distinguen porque el servidor necesita saber; la pantalla no los muestra.
  it('distingue los cinco estados', () => { /* … */ });
  it('usado tiene prioridad sobre expirado', () => { /* … */ });
});

describe('documentoCoincide', () => {
  // D-7 · el documento se VERIFICA, no sólo se registra. Con sesión corporativa la
  // identidad la aporta Azure; sin sesión, este tecleo es lo único que separa «quien
  // tiene el enlace» de «quien es la persona».
  it('ignora espacios, puntos y guiones', () => {
    expect(documentoCoincide(' 1.234.567-8 ', '12345678')).toBe(true);
  });
  it('no acepta un documento distinto', () => {
    expect(documentoCoincide('12345679', '12345678')).toBe(false);
  });
});

describe('tope de intentos', () => {
  // P14 · un documento son entre seis y diez dígitos: sin tope, quien consiga un enlace
  // lo adivina.
  it('al quinto intento queda bloqueado', () => {
    expect(quedaBloqueado(4)).toBe(false);
    expect(quedaBloqueado(5)).toBe(true);
  });
});

describe('puedeEmitir', () => {
  it('rechaza una cuenta habilitada', () => { /* P4 */ });
  it('rechaza sin correo personal, y lo dice', () => { /* P5 */ });
  it('rechaza sin documento de identidad, y lo dice', () => { /* P5 */ });
  it('devuelve TODO lo que falta, no el primer error', () => { /* como validarFirma */ });
});
```

Run: `npm test -- enlace-firma` → FAIL

- [ ] **Step 2: Escribir el módulo**

`codigoEnlace(anio, consecutivo)` con el mismo patrón que `codigoActa`: `ENL-2026-0007`.
`diasDeValidez()` lee `FIRMA_ENLACE_DIAS` y cae en **7** (D-8).

- [ ] **Step 3:** `npm test -- enlace-firma` → PASS
- [ ] **Step 4: Commit** — `feat(sig): el nucleo puro del enlace de firma`

---

## Task 2: El acta dice la verdad, y las existentes no cambian

**Es la tarea más delicada del plan.** Toca el artefacto probatorio.

**Files:** `lib/sig/firma.ts`, `lib/sig/__tests__/firma.test.ts`

- [ ] **Step 1: Escribir primero el golden de la vía corporativa**

Antes de tocar `textoDelActa`, congelar su salida actual como cadena literal en la prueba:

```ts
// Verificación 5 · NINGUNA acta existente puede cambiar de huella. Este golden es la
// prueba de que la variante del enlace no se filtró a la vía corporativa: si alguien
// agrega una línea al numeral 1 sin condicionarla al medio, esta prueba falla y dice
// exactamente qué carácter cambió.
//
// P20 · el orden de los campos es fijo. Reordenarlo cambiaría la huella de todas las
// actas futuras sin cambiar su contenido, y dos actas iguales dejarían de tener la
// misma huella.
const ACTA_CORPORATIVA_CONGELADA = `ACTA DE ACEPTACIÓN Y FIRMA · ACT-2026-0001
…`;

it('la vía corporativa produce el texto byte por byte', () => {
  expect(textoDelActa(DATOS_CORPORATIVOS)).toBe(ACTA_CORPORATIVA_CONGELADA);
});

it('y su huella no se mueve', () => {
  expect(generarActa(DATOS_CORPORATIVOS).hash).toBe('<hash congelado>');
});
```

Run: `npm test -- firma` → PASS **antes** de cambiar nada. Ese verde es el punto de partida.

- [ ] **Step 2: Escribir la prueba que falla — la variante por enlace**

```ts
it('el numeral 5 por enlace NO menciona cuenta corporativa', () => {
  const t = textoDelActa(DATOS_POR_ENLACE);
  expect(t).not.toContain('cuenta corporativa');
  expect(t).toContain('su cuenta ya estaba deshabilitada al momento de la firma');
});

it('el numeral 1 suma el canal y el 4 el medio', () => {
  const t = textoDelActa(DATOS_POR_ENLACE);
  expect(t).toContain('Correo personal (canal de notificación): daniel.medina@gmail.com');
  expect(t).toContain('Medio de identificación: enlace único de un solo uso (ENL-2026-0007)');
  expect(t).toContain('Enviado a: daniel.medina@gmail.com el 2026-09-10T14:02:11.000Z');
});

// P19 · lo que el acta no puede afirmar, no lo afirma. Decir «registrada por RRHH el 3
// de marzo» sin poder probarlo es peor que decir que no consta.
it('sin fecha de registro del correo, lo dice', () => {
  const t = textoDelActa({ ...DATOS_POR_ENLACE, canal: { ...CANAL, registradoEn: null } });
  expect(t).toContain('sin registro de origen');
});
```

Run: `npm test -- firma` → FAIL

- [ ] **Step 3: Extender `DatosDelActa` sin tocar la vía existente**

```ts
export type MedioDelActa = 'SESION_CORPORATIVA' | 'ENLACE_CORREO_PERSONAL';

export interface DatosDelActa {
  // … lo que ya tiene, sin mover ni un campo …
  /// Ausente se lee como `SESION_CORPORATIVA`, que es lo que había antes de que este
  /// campo existiera: agregarlo **no cambia la conducta de nada que ya estuviera**.
  medio?: MedioDelActa;
  /// Sólo en la vía por enlace. `null` en `registradoEn` cuando no consta (P19).
  canal?: {
    correoPersonal: string;
    enlaceCodigo: string;
    enviadoEn: Date;
    registradoEn: Date | null;
  };
}
```

Y en `textoDelActa`, las tres variaciones **condicionadas**:

```ts
const porEnlace = (d.medio ?? 'SESION_CORPORATIVA') === 'ENLACE_CORREO_PERSONAL';
```

El numeral 5 va en dos constantes separadas y no en una plantilla con huecos: **el texto de la vía corporativa no se toca ni se reformatea**, porque cualquier cambio —un espacio, un salto de línea— cambia la huella de todas las actas futuras y rompe el golden del Step 1.

- [ ] **Step 4:** `npm test -- firma` → PASS, **incluido el golden del Step 1**
- [ ] **Step 5: Commit** — `feat(sig): el acta declara el medio real de identificacion`

---

## Task 3: El modelo de datos

**Files:** `prisma/schema.prisma`

- [ ] **Step 1: `MedioIdentificacion` y los tres campos de `ActaAceptacion`**

`medioIdentificacion` con **`@default(SESION_CORPORATIVA)`**: es lo que hace que la migración no toque ninguna acta existente — todas las que hay se firmaron con sesión corporativa, y eso es verdad.

- [ ] **Step 2: `EnlaceFirma`** como §4.1, con `@@index([asignacionId])` y `@@index([expiraEn])`
- [ ] **Step 3: `ContadorEnlace`**

**Adición que la spec implica y no nombra.** `EnlaceFirma.codigo` es `ENL-2026-0007`, un consecutivo por año. Se resuelve con una tabla contador y **no con `count(*)`**, por la razón que `ContadorActa` ya documenta: contar filas y sumar uno produce dos códigos iguales cuando dos emisiones ocurren a la vez. Mismo patrón, mismo motivo.

- [ ] **Step 4: Migración**

```bash
npx prisma migrate dev --name enlace_firma
npx prisma generate
```

- [ ] **Step 5: Verificación 5 — las actas existentes no cambiaron**

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"select count(*) total, count(*) filter (where medio_identificacion='SESION_CORPORATIVA') corporativas from acta_aceptacion;"
```

Expected: los dos números iguales. Y recalcular el SHA-256 del texto de cada acta previa contra su `acta_hash`: **coincide**.

- [ ] **Step 6: Commit**

---

## Task 4: Un solo núcleo, dos puertas (P15)

**Si esta tarea se hace mal, el requerimiento está arruinado.** Son cinco escrituras acopladas cuya regla F7 es que ocurren juntas o no ocurren; la segunda copia se desincroniza en el primer cambio y el defecto aparece en las actas de **una sola** de las dos vías.

**Files:** `app/sig/acciones/firma.ts`

- [ ] **Step 1: Extraer `asentarFirma` sin cambiar ninguna conducta**

```ts
/// Las cinco escrituras de la regla F7, en la transacción de quien llame. Recibe al AUTOR
/// y al MEDIO en vez de deducirlos: es lo que permite que las dos vías compartan esto sin
/// que ninguna finja una sesión que no tuvo.
async function asentarFirma(
  tx: Prisma.TransactionClient,
  e: {
    asignacion: …; contenido: …; version: …; datos: DatosFirma;
    autor: string;              // P16 · `enlace:ENL-… · correo` en la vía pública
    medio: MedioDelActa;
    canal?: { … };
    ip: string | null; agente: string | null;
  },
): Promise<{ codigo: string; evidenciaId: number; actaId: number }>
```

`firmarYAceptar` queda con sus cuatro puertas y una llamada. **Las tres primeras puertas se conservan idénticas** (P17): la asignación existe, no está cerrada, y el contenido exige firma y tiene su `VersionContenido`. La cuarta —`persona.correo !== sesion`— se queda en `firmarYAceptar` y **no baja** a `asentarFirma`: es la puerta de la sesión, y la vía por enlace la reemplaza por el token más el documento verificado.

- [ ] **Step 2: La encolada de REQ-SIG-13 va adentro**

`asentarFirma` crea también la fila `PublicacionSoporte` **dentro** de la transacción, y devuelve el `evidenciaId` para que quien llame dispare la publicación **fuera** (P10 de REQ-SIG-13). Las dos vías publican su acta en SharePoint; una firma por enlace no es menos auditable.

- [ ] **Step 3: Verificación 6 — una sola implementación**

```bash
rg -n "actaAceptacion\.create" app/ lib/
```

Expected: **exactamente una línea**, dentro de `asentarFirma`. Dos es el defecto que P15 describe.

- [ ] **Step 4:** `npm test -- firma && npx tsc --noEmit -p tsconfig.json`
Expected: las 26 pruebas de firma en verde **sin haberlas tocado**. Si alguna cambia, la extracción cambió conducta.

- [ ] **Step 5: Commit** — `refactor(sig): un solo nucleo de firma para las dos vias`

---

## Task 5: Emitir el enlace

**Bloqueada por Q1.**

**Files:** `app/sig/acciones/enlace-firma.ts`, y el botón en el popup de REQ-SIG-15 §3.3

- [ ] **Step 1: `emitirEnlace(asignacionId, …)`** — exige `personas:administrar`, valida con `puedeEmitir` y **rechaza con la lista de lo que falta**, nunca en silencio
- [ ] **Step 2: P6 — emitir uno nuevo revoca el anterior** en la misma transacción, con motivo `reemplazado por ENL-…`. Dos enlaces válidos para la misma firma significa que el viejo —el que quedó en un correo reenviado, en una captura, en un ticket— sigue sirviendo
- [ ] **Step 3: P3 — en la bitácora va el `codigo`, jamás el token**
- [ ] **Step 4: P7 — un enlace por asignación, un correo por persona.** Cuatro correos por cuatro documentos es hostil sin ganar nada; cuatro **actos de firma** por cuatro declaraciones sí importa
- [ ] **Step 5: Verificación 11** — intentarlo sobre una persona `activa`: rechazado
- [ ] **Step 6: Commit**

---

## Task 6: El correo

- [ ] **Step 1:** reusa `lib/sgsi/notificaciones.ts`. **No `EnvioNotificacion`** (P8): su `@@unique([tipo, periodo, personaId])` es lo que hace idempotentes los avisos del cron y exactamente lo que impediría **reenviar** a alguien que dice que no le llegó. El envío se cuenta en `EnlaceFirma.vecesEnviado`
- [ ] **Step 2:** el correo dice qué firmar, **por qué se le escribe a una dirección personal**, hasta cuándo sirve, y a quién escribirle si no reconoce la solicitud. **Sin adjunto** y sin ningún dato personal más que el nombre
- [ ] **Step 3:** si `PUBLIC_URL` no está definida, **el enlace no se emite**: un correo con un enlace a `localhost` es un correo perdido
- [ ] **Step 4: Verificación 12** — inspeccionar el enlace: **sólo el token** (P9). Ni el id de la persona, ni el correo, ni el id de la asignación
- [ ] **Step 5: Commit**

---

## Task 7: La ruta pública

**Files:** `app/firmar/[token]/page.tsx`, `app/firmar/[token]/PanelPublico.tsx`, `middleware.ts`

- [ ] **Step 1: El comentario en `middleware.ts`** (P10)

`middleware.ts:24-39` enumera **lo protegido**, así que una ruta nueva nace pública **por omisión** — cómodo hoy, peligroso el día que alguien agregue `/firmar/panel-interno`. Va un comentario diciendo que `/firmar` es deliberadamente pública y que su autorización es el token.

> **No se renombra `middleware.ts` a `proxy.ts`.** Next 16.3.2 lo pide en cada arranque de `next dev` («the middleware file convention is deprecated»). El proyecto lo mantiene así a propósito y la advertencia se ignora.

- [ ] **Step 2: La página con el mínimo de P11** — el nombre de la persona y el documento a firmar. **Nada de área, cargo, otras tareas, otros documentos ni navegación hacia la aplicación.** El nombre sí, porque sin él nadie sabe si la solicitud es para él
- [ ] **Step 3: P12 — `Referrer-Policy: no-referrer` y ni un enlace externo.** El token va en la ruta, así que cualquier recurso de tercero se lo lleva en la cabecera `Referer`. Y la ruta **se excluye del registro de accesos**, o se enmascara el último segmento: un token en un log es un token
- [ ] **Step 4: P13 — los cuatro casos malos producen la misma página.** Inexistente, expirado, revocado y bloqueado: la misma frase neutral, sin nombres y sin decir cuál es. Distinguirlos convierte la ruta en un oráculo para saber si un token adivinado existe
- [ ] **Step 5: La excepción que sí informa** — un enlace **ya usado** dice que ya se firmó, con la fecha y el código del acta. Quien vuelve a abrir su propio enlace necesita esa confirmación, y a esa altura ya no hay nada que proteger
- [ ] **Step 6: D-5 — abrirlo, cuantas veces haga falta.** Lo que se consume una sola vez es **la firma**
- [ ] **Step 7: Verificaciones 9, 10, 13 y 14**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/firmar/<token>   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/mi-sig           # 307
```

- [ ] **Step 8: Commit**

---

## Task 8: Firmar por enlace

**Files:** `app/sig/acciones/enlace-firma.ts`

- [ ] **Step 1: `firmarConEnlace(token, datos)`**

**No llama a `autorActual()`** (P16): no hay sesión y lanzaría `SinSesionError`. El autor de la bitácora es `enlace:ENL-2026-0007 · nombre@gmail.com`, **nunca el correo corporativo**, que afirmaría una sesión que no existió. Y acá **sí se puebla `Bitacora.ip`**, que el esquema tiene y hoy sólo usa el flujo de anexos.

- [ ] **Step 2: El documento se verifica** (D-7, P5). Si no coincide, `intentosFallidos + 1` y **no se firma**
- [ ] **Step 3: P14 — al quinto, `bloqueadoEn`.** El sexto **ni se evalúa**
- [ ] **Step 4: Llama a `asentarFirma`** con `medio: 'ENLACE_CORREO_PERSONAL'` y el canal. Cero duplicación
- [ ] **Step 5: Cierra el enlace** — `usadoEn`, `actaId`
- [ ] **Step 6: Verificaciones 3, 4, 7, 15 y 17**

```bash
# 7 · cinco intentos
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi \
  -c "select intentos_fallidos, bloqueado_en from enlace_firma where codigo='ENL-2026-0001';"
# 1 y 2 · el token no está en ninguna parte
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi \
  -c "select count(*) from enlace_firma where token_hash like '%<token>%';"   # 0
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi \
  -c "select count(*) from bitacora where valor_nuevo like '%<token>%' or valor_anterior like '%<token>%';"  # 0
```

- [ ] **Step 7: Commit**

---

## Task 9: La constancia

- [ ] **Step 1: P18** — al firmar, copia al correo personal con el código del acta, su huella y la fecha. Es constancia para quien firmó —que **ya no tiene dónde consultar su historial**, porque `/mi-sig` le está cerrado— y es la evidencia de que la notificación llegó a la dirección que el acta declara
- [ ] **Step 2: D-9** — y esto es lo único que se hace. **No** se agrega ruta pública para «ver mi historial» ni «descargar mi acta». Cada ruta pública nueva es superficie de ataque sobre la aplicación que gobierna el SGSI
- [ ] **Step 3: Verificación 16**
- [ ] **Step 4: Commit**

---

## Task 10: Cierre

- [ ] **Step 1: P22 — el correo personal enmascarado** en las pantallas de gestión (`d••••••@gmail.com`), completo **sólo** al emitir y en el acta. La lista del censo no necesita imprimir la dirección personal de 90 personas
- [ ] **Step 2: `FIRMA_ENLACE_DIAS=7`** en `.env.example`. Ninguna credencial nueva y **ningún permiso nuevo de Azure**: esta vía no habla con Graph
- [ ] **Step 3: Verificación 17 — la trazabilidad completa**, en los dos sentidos: desde `enlace_firma.codigo` al acta, a la evidencia y a la bitácora; y desde el acta de vuelta al enlace
- [ ] **Step 4:** `npm test && npm run lint && npx tsc --noEmit -p tsconfig.json && npm run build`
- [ ] **Step 5: Commit**

---

## Checklist del requerimiento · los 17 puntos de §11

| # | Verificación | Tarea |
|---|---|---|
| 1 | El token en claro no está en la base | Task 8 · Step 6 |
| 2 | Ni en la bitácora ni en los logs | Task 8 · Step 6 |
| 3 | Firmar por enlace produce un acta íntegra | Task 8 · Step 6 |
| 4 | **El acta dice la verdad** | Task 2 · Step 2 + Task 8 · Step 6 |
| 5 | **Las actas existentes no cambian** | Task 2 · Step 1 (golden) + Task 3 · Step 5 |
| 6 | Una sola implementación de la firma | Task 4 · Step 3 |
| 7 | Documento equivocado no firma | Task 8 · Step 6 |
| 8 | Reemitir invalida el anterior | Task 5 · Step 2 |
| 9 | Expirado, revocado e inexistente se ven igual | Task 7 · Step 4 |
| 10 | Usado dice que ya se firmó | Task 7 · Step 5 |
| 11 | No hay enlace para cuenta activa | Task 5 · Step 5 |
| 12 | La URL no lleva datos personales | Task 6 · Step 4 |
| 13 | La ruta pública no expone nada más | Task 7 · Step 2 |
| 14 | `/firmar` es pública y el resto no | Task 7 · Step 7 |
| 15 | La asignación queda cerrada de verdad | Task 8 · Step 6 |
| 16 | La constancia llega | Task 9 · Step 3 |
| 17 | Trazabilidad completa | Task 10 · Step 3 |

---

## Pendientes que no dependen del desarrollo

1. **Correr la consulta de §1 contra producción.** La de desarrollo devolvió cero y su censo no sirve para decidir. Es lo que dice si esto es un caso o son cincuenta.
2. **Cargar `correo_personal` y `documento_identidad`.** Hoy están en **0 de 90**, y D-7 exige los dos para emitir. Sin ellos este requerimiento no puede ayudar a nadie, y el trabajo se hace desde el popup de REQ-SIG-15 §3.3.
3. **El visto bueno legal de D-3** (Q2). No bloquea construir; **bloquea usarlo con ex colaboradores**.
4. **Confirmar el plazo de D-8** (Q3). Es parámetro: cambiarlo después no es un despliegue.
5. **Responder Q1** — si la emisión debe excluir a las cuentas invitadas B2B. Cambia a quién le llega un correo.
