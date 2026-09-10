# Edición de persona y pertenencias — Plan de implementación (REQ-SIG-15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que desde la tabla de Personas se pueda decir a qué área, a qué cargo y a qué grupos de interés pertenece alguien, que al guardar la aplicación informe **cuántas tareas quedaron creadas para esa persona** con su desglose por origen, y que **ninguna de esas tareas nazca vencida**.

**Architecture:** La regla que decide *qué periodos existen para quién y con qué plazo* —el piso de la asignación— vive en los módulos puros `lib/sig/periodos.ts` y `lib/sig/generacion.ts`, y la llaman **los dos disparos**: el popup al guardar y el cron de las 05:00. El popup guarda la pertenencia y genera las asignaciones en **una sola transacción de Prisma**, sin salir a la red, y para **una sola persona**. Las tres pestañas de lectura no piden permisos nuevos; el bloqueo de cuenta sí, y detrás de una bandera que arranca apagada.

**Tech Stack:** Next 16.3.2 (App Router, Server Actions), Prisma 7 + Postgres, Microsoft Graph v1.0 con `axios`, jest + ts-jest (`npm test`).

**Requerimiento:** `docs/handoff_sig/edicion-de-persona.md` v1.1 — las reglas se citan como P1…P30 y las decisiones como D-1…D-10.
**Fuente de verdad por encima de la spec:** `docs/handoff_sig/decisiones-2026-09-02.md`.

---

## Preparación · antes de la Task 1

```bash
npm install
npx prisma generate      # ← NO es opcional
npm test
npx tsc --noEmit -p tsconfig.json
npm run lint
```

**`npx prisma generate` primero, y otra vez después de cada `migrate dev`.** Con el cliente desactualizado, `tsc` reporta errores del tipo «Property 'x' does not exist on type 'PrismaClient'» en archivos que nadie tocó.

**Estado verde del repositorio, medido el 2026-09-10 sobre `ebf7235`:**

| Comando | Resultado esperado |
|---|---|
| `npm test` | **58 suites, 1095 pruebas, todas pasan** (~35–80 s) |
| `npx tsc --noEmit -p tsconfig.json` | **0 errores** |
| `npm run lint` | **0 errores, 5 advertencias** — las cinco son preexistentes |

**El servicio de Postgres en compose se llama `sgi-postgres`, no `postgres`.** Todo comando de verificación va como:

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c '…'
```

---

## Preguntas que bloquean, y hay que responder antes de la Task 1

La spec cierra diez decisiones, pero la fórmula del piso (§5.2, P16) tiene tres huecos que **no se pueden adivinar**: cada uno cambia qué tareas recibe una persona real, y elegir mal produce exactamente lo que D-5 vino a prohibir.

### Q1 · ¿Cuál es el término de pertenencia en los alcances por activo?

P16 dice que el tercer término del piso es `areaDesde | cargoDesde | miembro.desde`, «según el alcance». Los alcances `ACTIVO` y `TIPO_ACTIVO` no están en esa lista, y sin embargo alcanzan personas: `generacion.ts:189-193` llega a ellas **porque ocupan el cargo propietario del activo**.

- **Propuesta:** el término es `cargoDesde` — la persona está sujeta a la revisión del activo desde que ocupa el cargo que lo posee. Es lo que hace que ponerle un cargo a alguien hoy no le cobre las revisiones de los activos del año pasado.
- **Y el caso del faltante de propietario:** cuando el activo no tiene dueño, la asignación va al `responsableSeguimientoId` (D3). Esa persona no llega por pertenencia sino por ser la responsable, así que **su término de pertenencia es nulo** y su piso es `max(obligacion.creadaEn, su ingreso)`. Propuesta: así.

### Q2 · ¿La periodicidad `UNICA` se corre o se descarta?

Una obligación `UNICA` no tiene ventana que cierre: es un solo periodo. Si alguien entra tres años después de que se creó el acuerdo de confidencialidad, ¿lo debe?

- **Propuesta: se corre, nunca se descarta.** `fechaApertura = max(apertura, piso)` y `fechaLimite = fechaApertura + plazoDias`. Descartarla dejaría a quien entra hoy **sin el acuerdo de confidencialidad**, que es justo lo que PRO-TAL-01 exige antes de habilitar cualquier acceso (REQ-SIG-02 §5). El riesgo de la otra opción es mucho peor que el de esta.

### Q3 · ¿El primer ciclo flotante se corre?

`periodoFlotante` (`generacion.ts:238-241`) abre el primer ciclo en `obligacion.fechaInicio` cuando no hay ciclo previo. La verificación 4 de §11 pide «Variante flotante: apertura hoy, no enero», lo que implica que sí.

- **Propuesta:** sí, `apertura = max(obligacion.fechaInicio, piso)`. Los ciclos siguientes nacen del cierre del anterior y ese cierre ya es posterior al piso por construcción, así que no necesitan tratamiento.

**Estas tres van juntas en una sola respuesta.** El resto del plan no depende de ellas: las tareas 2 a 13 se pueden ejecutar con cualquiera de las respuestas, y solo la Task 1 queda bloqueada.

---

## Hallazgos previos · dónde la spec no coincide con el código

Anotados y no corregidos por cuenta propia, según el punto 8 del encargo.

**H1 · La prueba que la verificación 1 da por existente no existe.** §11 dice «la prueba que ya compara `personasAlcanzadas` con `resolverAlcance`, extendida al valor nuevo». No hay tal prueba: `lib/sig/__tests__/prevision.test.ts` ejercita `personasAlcanzadas` **sola**, y `resolverAlcance` es una función **privada** de `generacion.ts:134` que ningún test importa. La equivalencia entre los dos lados —que es la que protege contra el defecto de `NIVEL_ACTIVO` que `prevision.ts:26-33` documenta— **nunca se comprobó**. Hay que exportar `resolverAlcance` y **crear** esa prueba. Es la Task 2 y es trabajo nuevo, no una extensión.

**H2 · `PersonaGenerable` necesita tres fechas, no una.** P16 dice «`PersonaGenerable` suma `desde: Date`», pero la fórmula del mismo párrafo necesita `areaDesde`, `cargoDesde` y la fecha de la membresía del grupo, y cuál aplica lo decide el alcance —que se conoce en `resolverAlcance`, no en el arreglo de personas. Un solo campo `desde` obligaría a construir un arreglo de personas distinto por obligación. Se implementa la fórmula precisa: `PersonaGenerable` suma `ingreso`, `areaDesde`, `cargoDesde` y `gruposDesde`, y `Destinatario` suma `pertenenciaDesde`, que es el término que el alcance eligió.

**H3 · Los periodos anclados se calculan una vez para todos los destinatarios.** `generacion.ts:294` hace `periodosAnclados = periodosHasta(...)` **fuera** del bucle de destinatarios, y los reusa para todos. Con el piso, la apertura y la fecha límite pasan a ser **por persona**. La forma de conservar el cálculo compartido es dejar `periodosHasta` como el calendario puro que ya es —igual para todos— y aplicar el piso por destinatario con una función nueva. Eso es lo que la Task 1 construye, y es la razón por la que `PeriodoGenerable` necesita saber dónde termina su ventana.

**H4 · La consulta de medición de REQ-SIG-19 no distingue ex colaboradores de invitados.** No es de este requerimiento pero lo toca: ver el plan de REQ-SIG-19, §Hallazgos.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sig/periodos.ts` **(modificar)** | `PeriodoGenerable` suma `finVentana`; nueva `aplicarPiso()`. **Puro** |
| `lib/sig/__tests__/periodos.test.ts` **(modificar)** | Las pruebas del piso: las cuatro de §11 |
| `lib/sig/generacion.ts` **(modificar)** | `PersonaGenerable` y `ObligacionGenerable` suman fechas; `Destinatario` suma `pertenenciaDesde`; `resolverAlcance` se **exporta** y resuelve `GRUPO_INTERES`; el piso se aplica por destinatario |
| `lib/sig/__tests__/generacion-piso.test.ts` **(crear)** | «Ninguna asignación nace vencida», sobre el plan completo |
| `lib/sig/__tests__/alcance-equivalente.test.ts` **(crear)** | H1 · previsión y generación resuelven el mismo conjunto |
| `lib/sig/prevision.ts` **(modificar)** | `GRUPO_INTERES` en `personasAlcanzadas` y en `EntradaPrevision` |
| `lib/sig/pertenencias.ts` **(crear)** | **Puro.** El desglose por origen de P3 y el conteo por pertenencia |
| `lib/sig/__tests__/pertenencias.test.ts` **(crear)** | |
| `prisma/schema.prisma` **(modificar)** | `GrupoInteres`, `MiembroGrupoInteres`, `ContactoEmergencia`, `Persona.areaDesde`/`cargoDesde`, `AlcanceObligacion += GRUPO_INTERES`, `Obligacion.alcanceGrupoInteresId`, `ParametroSku` |
| `lib/sgsi/permisos.ts` **(modificar)** | `personas:bloquear` al vocabulario (D-9) |
| `app/components/sgsi/Pestanas.tsx` **(crear)** | P1 · pestañas con teclado real. No en línea |
| `app/sig/personas/PopupPersona.tsx` **(crear)** | El popup, cuatro pestañas |
| `app/sig/personas/Personas.client.tsx` **(modificar)** | El panel lateral pasa a ser el pie de la pestaña de datos base |
| `app/sig/acciones/personas-edicion.ts` **(crear)** | Guardar pertenencias + generar en la misma transacción |
| `app/sig/acciones/personas-bloqueo.ts` **(crear)** | Bloquear / desbloquear |
| `lib/sgsi/graph-licencias.ts` **(crear)** | Las dos consultas de §3.2, degradando por separado |
| `lib/sgsi/graph-bloqueo.ts` **(crear)** | `PATCH accountEnabled` + `revokeSignInSessions` |
| `app/sig/personas/page.tsx` **(modificar)** | `resumirCorrida` filtra por motivo de sincronización (P28) |
| `app/components/sgsi/obligaciones/NuevaObligacion.tsx` **(modificar)** | P11 · el selector de grupo de interés; sale «Todas las personas» |
| `.env.example` **(modificar)** | `GRAPH_BLOQUEO_HABILITADO=false` |

---

## Task 1: El piso — ninguna asignación nace vencida

**Bloqueada por Q1, Q2 y Q3.** Es la tarea que cambia la conducta del generador para todo el sistema (D-5), así que es la primera y la que más pruebas lleva.

**Files:**
- Modify: `lib/sig/periodos.ts`
- Modify: `lib/sig/generacion.ts`
- Test: `lib/sig/__tests__/periodos.test.ts`, `lib/sig/__tests__/generacion-piso.test.ts`

- [ ] **Step 1: Escribir la prueba que falla — el piso puro**

En `lib/sig/__tests__/periodos.test.ts`, agregar el bloque de `aplicarPiso`. Los cuatro casos son los de §11:

```ts
describe('aplicarPiso', () => {
  const MENSUAL = {
    periodicidad: 'MENSUAL' as const,
    fechaInicio: new Date('2026-01-01T00:00:00.000Z'),
    plazoDias: 15,
  };
  const HOY = new Date('2026-09-10T00:00:00.000Z');

  // §11.4 · los nueve meses cerrados antes de la pertenencia NO existen.
  it('descarta el periodo cuya ventana entera terminó antes del piso', () => {
    const calendario = periodosHasta(MENSUAL, HOY, 0);
    const piso = new Date('2026-09-10T00:00:00.000Z');
    const r = aplicarPiso(calendario, piso, 15);
    expect(r.map((p) => p.etiqueta)).toEqual(['2026-09']);
  });

  // §11.3 · el periodo EN CURSO se genera con el plazo COMPLETO desde el piso.
  // Sin esto, quien entra el 28 recibe la tarea del mes con límite el 16: vencida
  // en el mismo instante en que se crea.
  it('corre la apertura y con ella la fecha límite', () => {
    const calendario = periodosHasta(MENSUAL, new Date('2026-09-28T00:00:00.000Z'), 0);
    const piso = new Date('2026-09-28T00:00:00.000Z');
    const [p] = aplicarPiso(calendario, piso, 15).slice(-1);
    expect(p.apertura.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(p.fechaLimite.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  // §11.5 · la etiqueta NO cambia. Es lo que sostiene la unique de idempotencia.
  it('no toca la etiqueta del calendario', () => {
    const calendario = periodosHasta(MENSUAL, new Date('2026-09-28T00:00:00.000Z'), 0);
    const [p] = aplicarPiso(calendario, new Date('2026-09-28T00:00:00.000Z'), 15).slice(-1);
    expect(p.etiqueta).toBe('2026-09');
  });

  // Q2 · UNICA no tiene ventana que cierre: se corre, no se descarta.
  it('UNICA se corre y nunca se descarta', () => {
    const unica = periodosHasta(
      { periodicidad: 'UNICA', fechaInicio: new Date('2023-01-01T00:00:00.000Z'), plazoDias: 10 },
      HOY,
      0,
    );
    const r = aplicarPiso(unica, HOY, 10);
    expect(r).toHaveLength(1);
    expect(r[0].fechaLimite.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('un piso anterior a todo no cambia nada', () => {
    const calendario = periodosHasta(MENSUAL, HOY, 0);
    const piso = new Date('2025-01-01T00:00:00.000Z');
    expect(aplicarPiso(calendario, piso, 15)).toEqual(calendario);
  });
});
```

Run: `npm test -- periodos`
Expected: FAIL — `aplicarPiso is not a function`

- [ ] **Step 2: `PeriodoGenerable` gana `finVentana`**

`aplicarPiso` no puede decidir si descartar un periodo sin saber dónde termina su ventana, y esa información hoy se pierde: `periodosHasta` devuelve apertura y fecha límite, y la fecha límite **no es** el fin de la ventana (con plazo 15 días en una obligación mensual, la ventana dura 30 y el plazo 15).

En `lib/sig/periodos.ts`:

```ts
export interface PeriodoGenerable {
  etiqueta: string;
  apertura: Date;
  fechaLimite: Date;
  /// Dónde termina la ventana de este periodo: la apertura del siguiente. Es lo que
  /// permite decidir si el piso lo dejó atrás por completo (P17.1), y NO se puede
  /// derivar de `fechaLimite`: el plazo suele ser más corto que el periodo.
  ///
  /// En `UNICA` es `null`: un periodo único no cierra, así que nunca se descarta (Q2).
  finVentana: Date | null;
}
```

`periodosHasta` lo puebla con el cursor siguiente, que ya calcula en el bucle (`periodos.ts:148`), y `null` en la rama `UNICA`.

- [ ] **Step 3: Escribir `aplicarPiso`**

```ts
/// P16–P18 · el piso de una asignación. Ver `edicion-de-persona.md §5.2`.
///
/// Dos efectos y ni uno más:
///   1. Un periodo cuya ventana entera terminó antes del piso NO se genera.
///   2. El periodo en curso se genera con el plazo COMPLETO contado desde el piso.
///
/// Lo que NO hace, y es deliberado: **no toca la etiqueta**. La etiqueta es del
/// calendario, y la unique `(obligacion, persona, periodo, activo)` es lo que hace
/// idempotente al cron. Una etiqueta con la fecha de ingreso crearía una segunda fila
/// para el mismo periodo en la corrida siguiente (P18).
export function aplicarPiso(
  periodos: readonly PeriodoGenerable[],
  piso: Date,
  plazoDias: number,
): PeriodoGenerable[] {
  const salida: PeriodoGenerable[] = [];
  for (const p of periodos) {
    // Q2 · sin ventana que cierre, no hay nada que descartar: sólo se corre.
    if (p.finVentana !== null && piso.getTime() >= p.finVentana.getTime()) continue;
    if (piso.getTime() <= p.apertura.getTime()) {
      salida.push(p);
      continue;
    }
    const apertura = new Date(piso);
    salida.push({
      etiqueta: p.etiqueta,
      apertura,
      fechaLimite: sumarDias(apertura, plazoDias),
      finVentana: p.finVentana,
    });
  }
  return salida;
}
```

Run: `npm test -- periodos`
Expected: PASS

- [ ] **Step 4: Los tipos del generador**

En `lib/sig/generacion.ts`:

```ts
export interface PersonaGenerable {
  id: number;
  activa: boolean;
  areaId: number | null;
  cargoId: number | null;
  /// H2 · el piso necesita las TRES fechas, y cuál aplica lo decide el alcance. Un solo
  /// campo `desde` obligaría a rearmar el arreglo de personas por obligación.
  ///
  /// `fechaIngreso ?? creadaEn`: quien no tiene fecha de ingreso cargada no puede quedar
  /// sin piso —eso le devolvería los nueve periodos vencidos— así que cae en la fecha en
  /// que el censo lo trajo, que es lo más antiguo que la aplicación puede afirmar.
  ingreso: Date;
  areaDesde: Date | null;
  cargoDesde: Date | null;
  /// Membresías VIGENTES (`hasta IS NULL`) con su fecha de inicio.
  gruposDesde?: readonly { grupoId: number; desde: Date }[];
}

export interface ObligacionGenerable {
  // … lo que ya tiene …
  /// El piso incluye este instante: no se puede exigir algo antes de que la obligación
  /// exista. Ya está en el esquema (`schema.prisma:1315`).
  creadaEn: Date;
  alcanceGrupoInteresId?: number | null;
}

interface Destinatario {
  personaId: number;
  activoId: number | null;
  /// El término de pertenencia del piso, ya elegido por el alcance. `null` cuando el
  /// alcance no tiene pertenencia con principio propio (`TODOS`, `PERSONA`) o cuando la
  /// persona llegó por ser responsable de seguimiento y no por pertenecer (Q1).
  pertenenciaDesde: Date | null;
}
```

- [ ] **Step 5: Escribir la prueba que falla — el plan completo**

Crear `lib/sig/__tests__/generacion-piso.test.ts`. La aserción central es **una sola sobre el plan entero**, que es lo que fija D-5:

```ts
// §11.2 · la prueba que fija D-5. No comprueba un caso: comprueba que NINGUNA
// asignación del plan nazca vencida, con el plazo a propósito corto.
it('ninguna asignación nace vencida, en los cuatro casos de §5.2', () => {
  const plan = planificarGeneracion(OBLIGACIONES, PERSONAS, [], HOY, 90, ACTIVOS);
  expect(plan.crear.length).toBeGreaterThan(0);
  for (const a of plan.crear) {
    expect(a.fechaLimite.getTime()).toBeGreaterThanOrEqual(HOY.getTime());
  }
});
```

Más los cuatro casos por separado —persona nueva, pertenencia nueva, obligación con inicio retroactivo, anclaje flotante— y la idempotencia de §11.5: correr el plan dos veces alimentando la segunda con lo creado en la primera produce **cero**.

Run: `npm test -- generacion-piso`
Expected: FAIL

- [ ] **Step 6: Aplicar el piso por destinatario**

En `planificarGeneracion`, `periodosHasta` **se sigue calculando una vez** —el calendario es el mismo para todos— y el piso se aplica dentro del bucle:

```ts
    for (const destino of destinatarios) {
      const persona = porId.get(destino.personaId);
      // P16 · el más tardío de los tres. Sin `persona` no se genera: es un destinatario
      // que el alcance produjo y el censo no tiene, y adivinarle un piso sería
      // devolverle los periodos vencidos.
      if (!persona) continue;
      const piso = maximo([
        obligacion.creadaEn,
        persona.ingreso,
        destino.pertenenciaDesde,
      ]);

      const calendario = anclados
        ? periodosAnclados
        : periodoFlotante(obligacion, destino, existentes);
      const periodos = aplicarPiso(calendario, piso, obligacion.plazoDias);
      // … el resto igual …
    }
```

`maximo` descarta los `null` y vive en el mismo módulo puro.

- [ ] **Step 7: El piso también en el primer ciclo flotante (Q3)**

`periodoFlotante` devuelve el primer ciclo abriendo en `obligacion.fechaInicio`. Al pasar por `aplicarPiso` con `finVentana: null`, se corre y no se descarta — que es lo que Q3 propone. **Verificar que la rama de «último ciclo cerrado» no se corre**: su apertura es la fecha de cierre, que ya es posterior al piso.

- [ ] **Step 8: Todo verde**

Run: `npm test && npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: 58+ suites en verde. **Las pruebas existentes de `generacion.test.ts`, `generacion-activo.test.ts` y `generacion-anclaje.test.ts` van a fallar** hasta que sus fixtures sumen `creadaEn` e `ingreso`: es la señal de que el tipo hizo su trabajo. Actualizar los fixtures con fechas antiguas, que es la conducta previa.

- [ ] **Step 9: Commit**

```bash
git add lib/sig/periodos.ts lib/sig/generacion.ts lib/sig/__tests__
git commit -m "fix(sig): ninguna asignacion nace vencida — el piso de la pertenencia"
```

---

## Task 2: La equivalencia de alcance que nadie estaba probando (H1)

**Files:**
- Modify: `lib/sig/generacion.ts` (exportar `resolverAlcance`)
- Test: `lib/sig/__tests__/alcance-equivalente.test.ts` **(crear)**

- [ ] **Step 1: Escribir la prueba que falla**

Recorre **todos** los valores del enum `AlcanceObligacion` importado de Prisma y exige que los dos lados resuelvan el mismo conjunto de personas. Es la prueba que `prevision.ts:26-33` describe y que no existía: es la que hace que agregar `GRUPO_INTERES` no pueda devolver cero en un lado y no en el otro.

Run: `npm test -- alcance-equivalente`
Expected: FAIL — `resolverAlcance is not exported`

- [ ] **Step 2: Exportar `resolverAlcance` y hacer pasar la prueba con los alcances de hoy**

Run: `npm test -- alcance-equivalente`
Expected: PASS con los siete valores actuales.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(sig): la equivalencia de alcance entre prevision y generacion"
```

---

## Task 3: El modelo de datos

**Files:** `prisma/schema.prisma`, `prisma/migrations/<timestamp>_grupos_interes_y_pertenencias/`

- [ ] **Step 1: Las tres tablas nuevas y las dos columnas**

`GrupoInteres`, `MiembroGrupoInteres` y `ContactoEmergencia` como §4.1/4.2, `Persona.areaDesde`/`cargoDesde` como §4.3.

- [ ] **Step 2: El alcance nuevo**

`AlcanceObligacion` suma `GRUPO_INTERES`; `Obligacion` suma `alcanceGrupoInteresId Int?` → `GrupoInteres`.

> **Esto rompe la compilación a propósito.** `prevision.ts` importa el enum de Prisma y su `switch` es exhaustivo, así que `tsc` va a exigir resolver el valor nuevo en los dos lados. Es la propiedad que `prevision.ts:26-33` documenta y la que evitó que `NIVEL_ACTIVO` volviera a pasar.

- [ ] **Step 3: El SKU parametrizable (P6)**

Tabla propia para el nombre comercial del SKU, sembrada con los que Cuántico tiene hoy. **No un `Record` en el fuente**: obliga a desplegar el día que la organización compre un producto nuevo.

- [ ] **Step 4: Migración y siembra**

La migración crea las tablas **y siembra los dos grupos**: `TODOS` con `derivado = true`, `DESARROLLADORES` con `derivado = false` y **sin miembros**.

```bash
npm run db:up
npx prisma migrate dev --name grupos_interes_y_pertenencias
npx prisma generate
```

> **El timestamp de cualquier migración de DATOS tiene que ordenar DESPUÉS de la de esquema que la habilita.** Prisma aplica en orden lexicográfico del directorio; una fecha anterior revienta la cadena en cualquier base creada desde cero, aunque en la base local parezca funcionar. Comprobarlo con `migrate deploy` contra una base desechable, no con `migrate dev`.

- [ ] **Step 5: Verificar y commitear**

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi \
  -c "select codigo, derivado from grupo_interes order by orden;"
```

Expected: `TODOS · t` y `DESARROLLADORES · f`.

---

## Task 4: `GRUPO_INTERES` resuelto en los dos lados

**Files:** `lib/sig/generacion.ts`, `lib/sig/prevision.ts`, y las pruebas de la Task 2 extendidas.

- [ ] **Step 1: Extender la prueba de equivalencia al valor nuevo** (verificación 1)
- [ ] **Step 2: `resolverAlcance`** — la membresía **vigente** (`hasta IS NULL`), y el `pertenenciaDesde` del destinatario es `miembro.desde` (P13)
- [ ] **Step 3: `personasAlcanzadas`** — el mismo conjunto
- [ ] **Step 4: Los dos casos que motivan el requerimiento** (verificación 6): concienciación → todas las activas incluida una creada después; codificación segura → sólo los marcados
- [ ] **Step 5:** `npm test && npx tsc --noEmit -p tsconfig.json`
- [ ] **Step 6: Commit**

---

## Task 5: El permiso, y las pestañas accesibles

**Files:** `lib/sgsi/permisos.ts`, `app/components/sgsi/Pestanas.tsx`

- [ ] **Step 1: `personas:bloquear` al vocabulario** (D-9), concedido al grupo de responsables. **Ninguna clave existente se renombra.**
- [ ] **Step 2: `Pestanas.tsx`** — P1: `role="tablist"`/`tab`/`tabpanel`, flechas, `aria-selected`. En su propio archivo: la cuarta copia siempre deriva.
- [ ] **Step 3: Commit**

---

## Task 6: El popup y el guardado que informa un hecho

**Files:** `app/sig/personas/PopupPersona.tsx`, `app/sig/personas/Personas.client.tsx`, `app/sig/acciones/personas-edicion.ts`, `lib/sig/pertenencias.ts`

- [ ] **Step 1: El desglose por origen, puro y probado** (P3, verificación 11)

`lib/sig/pertenencias.ts` reparte el conteo entre área, cargo y activos-del-cargo. El desglose es obligatorio: un «47» pelado se lee como un error y nadie guarda.

- [ ] **Step 2: El popup, cuatro pestañas, 760 px**

Cabecera con nombre, correo y chip de rol, los tres **no editables** (D-1). Sin `personas:administrar`, el popup abre en **solo lectura** (P2).

- [ ] **Step 3: La previsión bajo los dos `select`** (P3), llamando **al mismo módulo puro** que el guardado usará (punto 3 del encargo).

- [ ] **Step 4: El guardado, en una sola transacción** (P14, P15, D-6)

```
$transaction:
  1. actualizar Persona (área, cargo, areaDesde, cargoDesde, datos de REQ-SIG-09)
  2. una fila de Bitacora POR CAMPO que cambió (P26)
  3. planificarGeneracion([esta persona]) → crear las asignaciones
  4. una fila de Bitacora del alta de asignaciones
```

**Nada de esto sale a la red**, así que no viola P10 de REQ-SIG-13. Y se genera **sólo para esta persona**: `correrTrabajo('generar-asignaciones')` devolvería el total del censo y el número informado dejaría de ser de nadie.

- [ ] **Step 5: Los pendientes del área anterior** (P4) — se listan, se ofrece reasignar o anular con motivo, y si no se hace nada **el mensaje los cuenta**. No se borran nunca.

- [ ] **Step 6: Verificaciones 8, 9, 10 y 12** contra la base:

```bash
# 8 · el número informado es el número creado
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi \
  -c "select count(*) from asignacion where persona_id = <X> and creada_en > '<T>';"
# 9 · el cron no agrega nada después
curl -s -X POST -H "Authorization: Bearer $SIG_TRABAJOS_SECRET" \
  http://localhost:3004/api/sig/trabajos/generar-asignaciones
```

Expected: el conteo coincide con el mensaje; el cron devuelve **cero** para esa persona. Si aparece una, el número del popup era mentira.

- [ ] **Step 7: Commit**

---

## Task 7: Contactos y contactos de emergencia

- [ ] **Step 1:** `direccion`, `ciudad`, `telefono`, `correoPersonal` — ya en el esquema, sin dónde escribirse hasta hoy
- [ ] **Step 2:** los contactos de emergencia: **nombre, parentesco y teléfono. Nada más** (P9.2)
- [ ] **Step 3:** la finalidad «atención de emergencias del personal» entra a `TratamientoDatosPersonales` (P9.1). Un dato personal de un tercero fuera del RAT es un hallazgo
- [ ] **Step 4:** no aparecen en la ficha de Mi SIG ni en ninguna exportación del censo (P9.3)
- [ ] **Step 5: Commit**

---

## Task 8: Grupos de interés

- [ ] **Step 1:** casillas y no `select` — se pertenece a varios a la vez
- [ ] **Step 2:** **Todos** va marcada y **deshabilitada**, con la frase de por qué (P10, D-10)
- [ ] **Step 3:** la acción **rechaza** guardar una membresía en un grupo derivado (verificación 7)
- [ ] **Step 4:** la línea de P12 bajo el título: **un grupo de interés no otorga ningún permiso**
- [ ] **Step 5:** desmarcar lista los pendientes de ese grupo y **no los borra** (P13 → P4)
- [ ] **Step 6:**

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"select count(*) from miembro_grupo_interes m join grupo_interes g on g.id=m.grupo_id where g.derivado;"
```

Expected: `0`, siempre.

- [ ] **Step 7: Commit**

---

## Task 9: El selector de obligaciones (P11)

- [ ] **Step 1:** una sola opción «Un grupo de interés · quienes pertenezcan a él» con la lista de grupos activos
- [ ] **Step 2:** elegir **Todos** guarda `alcance: 'TODOS'` **sin** `alcanceGrupoInteresId`; cualquier otro guarda `GRUPO_INTERES` con su id
- [ ] **Step 3:** **«Todas las personas» sale del selector.** El valor del enum **no se borra** —lo usan las obligaciones que ya existen— pero deja de ofrecerse: dos entradas que producen el mismo conjunto es cómo alguien crea la obligación dos veces
- [ ] **Step 4:** las obligaciones que ya usan `TODOS` **no se migran**
- [ ] **Step 5: Commit**

---

## Task 10: Licencias — lee y no escribe

- [ ] **Step 1:** `lib/sgsi/graph-licencias.ts` con las dos consultas de §3.2, `licenseDetails` y no `assignedLicenses` (P5)
- [ ] **Step 2:** **cada una degrada por separado** (P8). Una lista vacía y un 403 no se ven igual nunca
- [ ] **Step 3:** el nombre comercial sale de la tabla de parámetros y **el código crudo se sigue mostrando al lado** (P6)
- [ ] **Step 4:** los tres cruces que el portal no puede hacer (P7): inventario por persona, licencia activa en cuenta inactiva, y sin licencia con tareas
- [ ] **Step 5: Verificación 13 — y anotar en REQ-SIG-15 §7 qué permiso las habilitó** (D-2). Es la deuda documental que la propia spec pide pagar al construir
- [ ] **Step 6: Verificación 14** — forzar un 403 en `/subscribedSkus` y comprobar que la lista de la persona sigue
- [ ] **Step 7: Commit**

---

## Task 11: Bloquear y desbloquear

- [ ] **Step 1:** `lib/sgsi/graph-bloqueo.ts` — los cuatro pasos de P19, **y `revokeSignInSessions` no es opcional**: sin él la persona sigue dentro hasta una hora y un bloqueo por incidente no contiene nada
- [ ] **Step 2:** confirmación **escribiendo el correo** de la persona (P20), no un «¿está seguro?»
- [ ] **Step 3:** los **tres bloqueos prohibidos** (P21): la propia cuenta, el último `RESPONSABLE` del grupo del SIG, y una persona ya inactiva —que en este tenant son las 54 invitadas B2B
- [ ] **Step 4:** el bloqueo **no cierra, no anula y no reasigna** nada por su cuenta (P22). Lista y ofrece
- [ ] **Step 5:** enlaza al trámite de desvinculación y dice que **no lo reemplaza** (P23, D-8)
- [ ] **Step 6:** desbloquear por el mismo camino, con motivo (P24)
- [ ] **Step 7:** el botón **no se dibuja** si `GRAPH_BLOQUEO_HABILITADO` no está en `true` (P25, verificación 19)
- [ ] **Step 8: Verificaciones 15 a 18** — necesitan **una cuenta de prueba en el tenant** y los dos permisos concedidos. Ver §Pendientes
- [ ] **Step 9: Commit**

---

## Task 12: La franja de sincronización no se ensucia (P28)

- [ ] **Step 1:** `resumirCorrida` filtra por `motivo: 'sincronización con el Directorio Activo'`

Hoy la franja reconstruye la última corrida agrupando filas de `tabla: 'persona'` por `ocurridoEn`, y eso funciona porque `sincronizarDirectorio` es su **único** escritor. Este popup va a ser el segundo: sin el filtro, editar tres campos a mano se lee como una corrida de sincronización con tres actualizaciones. **Es parte de este requerimiento**: si no se hace, la franja empieza a mentir el día del despliegue.

- [ ] **Step 2: Verificación 20** — editar tres campos, recargar, y comprobar que la franja sigue mostrando la última corrida **de sincronización**
- [ ] **Step 3: Commit**

---

## Task 13: Cierre

- [ ] **Step 1:** `GRAPH_BLOQUEO_HABILITADO=false` en `.env.example` con su comentario. **Es la única variable nueva**
- [ ] **Step 2: Verificación 21** — teclado y foco: flechas entre pestañas, `aria-selected`, Escape cierra, el foco vuelve a la fila
- [ ] **Step 3:** `npm test && npm run lint && npx tsc --noEmit -p tsconfig.json && npm run build`
- [ ] **Step 4: Commit**

---

## Checklist del requerimiento · los 21 puntos de §11

| # | Verificación | Tarea |
|---|---|---|
| 1 | `GRUPO_INTERES` resuelve igual en previsión y generación | Task 2 + Task 4 · Step 1 |
| 2 | **Ninguna asignación nace vencida** | Task 1 · Step 5 |
| 3 | El periodo en curso lleva el plazo completo | Task 1 · Step 1 |
| 4 | Los periodos cerrados antes de la pertenencia no existen | Task 1 · Step 1 |
| 5 | La etiqueta del periodo no cambió | Task 1 · Step 1 |
| 6 | Los dos casos que motivan el requerimiento | Task 4 · Step 4 |
| 7 | El grupo derivado no admite miembros | Task 8 · Step 3 y 6 |
| 8 | El número informado es el número creado | Task 6 · Step 6 |
| 9 | El cron no agrega nada después | Task 6 · Step 6 |
| 10 | Idempotencia | Task 6 · Step 6 |
| 11 | El desglose por origen es correcto | Task 6 · Step 1 |
| 12 | Quitar el área no borra pendientes | Task 6 · Step 5 |
| 13 | Las licencias se leen sin conceder nada **+ anotar el permiso en §7** | Task 10 · Step 5 |
| 14 | Una consulta caída no tumba la otra | Task 10 · Step 6 |
| 15 | El bloqueo bloquea de verdad | Task 11 · Step 8 · **requiere tenant** |
| 16 | Los tres bloqueos prohibidos | Task 11 · Step 3 |
| 17 | Los pendientes de quien se bloquea siguen abiertos | Task 11 · Step 4 |
| 18 | El desbloqueo restituye | Task 11 · Step 8 · **requiere tenant** |
| 19 | Sin la variable, sin botón | Task 11 · Step 7 |
| 20 | La franja de sincronización no se ensucia | Task 12 · Step 2 |
| 21 | Teclado y foco | Task 13 · Step 2 |

---

## Pendientes que no dependen del desarrollo

1. **Los dos permisos de aplicación** de §7 —`User.EnableDisableAccount.All` y `User.RevokeSessions.All`— con consentimiento de administrador. Mientras no estén, `GRAPH_BLOQUEO_HABILITADO` queda en `false` y **el botón no se dibuja**: ese es el comportamiento correcto. **No se pide `User.ReadWrite.All`** por ninguna razón.
2. **Comprobar en el consentimiento** que la aplicación no pueda tocar cuentas privilegiadas (§7.1). Con D-7 —una sola registración que ya publica documentos y ahora deshabilita cuentas— ese límite es lo único que queda entre una credencial filtrada y el tenant. Deja de ser recomendación y es **requisito de despliegue**.
3. **Una cuenta de prueba en el tenant** con sesión abierta, para las verificaciones 15 y 18. Sin ella no se puede demostrar que la revocación de sesión funciona **sin esperar una hora**, que es el punto entero de P19.3.
4. **El consentimiento registrado en la bitácora del SGSI** (§7.2): quién lo concedió, cuándo y con qué justificación. Es A.8.2, no un detalle de configuración.
