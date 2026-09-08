# Player SCORM 2004 · Fase 2 — el curso cierra la tarea y la operación lo ve (REQ-SIG-14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el resultado que reporta el curso cierre la asignación por sí solo —con el veredicto del SIG y no el del autor del curso—, que nadie pueda declararse aprobado a mano en una capacitación con paquete, y que la operación pueda ver los intentos, subir paquetes y detectar lo que quedó colgado.

**Architecture:** El mapeo de «lo que reportó el SCO» a «lo que se escribe en `RegistroRealizado`» vive en un módulo puro que **reusa `aprobadoDe()` y `cierraLaAsignacion()`** de `lib/sig/cierre.ts`: dos formas de decidir si alguien aprobó terminan discrepando, y la discrepancia se descubre en la auditoría. El cierre ocurre dentro de la transacción que ya escribe el intento; el formulario manual desaparece cuando hay paquete; y lo que queda abierto sin actividad lo recoge un trabajo programado.

**Tech Stack:** Next 16, Prisma 7 + Postgres, jest (`npm test`).

**Depende de:** `docs/superpowers/plans/2026-09-08-sig-scorm-f1-ejecucion.md` completo (paquete, API, runner, player, `abrirIntento`/`guardarIntento`).

**Requerimiento:** `docs/handoff_sig/player-scorm-2004.md` — reglas P14…P20, decisiones D-1/D-4.

---

## Preparación

La fase 1 tiene que estar aplicada y verde. Antes de empezar:

```bash
npx prisma generate
npm test
npx tsc --noEmit -p tsconfig.json
```

**Estado verde del repositorio antes de la fase 1**, para que sepas contra qué comparás: `npm test` 49 suites y 911 pruebas, `tsc` 0 errores, `lint` 0 errores y 5 advertencias preexistentes. La fase 1 suma sus propias pruebas a ese total. Si `tsc` te reporta errores del tipo «Property 'intentoScorm' does not exist on type 'PrismaClient'», el cliente quedó sin regenerar después de la migración: corré `npx prisma generate`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sig/scorm-cierre.ts` **(crear)** | **Puro.** De `completion_status`/`success_status`/`score` al cierre, con el veredicto de `notaMinima` |
| `lib/sig/scorm-abandono.ts` **(crear)** | **Puro.** Cuándo un intento sin actividad se considera abandonado |
| `app/mi-sig/acciones/curso.ts` **(modificar)** | Cierra la asignación al completar; registra el envío de datos al tercero |
| `app/mi-sig/bandeja.query.ts` **(modificar)** | La tarjeta dice si el contenido tiene paquete |
| `app/mi-sig/PanelCierre.tsx` **(modificar)** | Con paquete: abre el curso en vez de pedir asistencia y nota (P14) |
| `app/sig/acciones/tareas.ts` **(modificar)** | Rechaza el cierre manual de una capacitación con paquete (P14) |
| `lib/sig/anomalias.ts` **(modificar)** | Los intentos abandonados y los despachos caídos como anomalía |
| `lib/sig/trabajos-catalogo.ts` · `lib/sig/trabajos.ts` **(modificar)** | El trabajo `abandonar-intentos-scorm` |
| `app/sig/contenidos/Contenidos.client.tsx` **(modificar)** | Subir el paquete y ver su análisis antes de guardar |
| `app/mi-sig/historial/page.tsx` · `app/sig/colaboradores/[id]/page.tsx` **(modificar)** | Los intentos con su resultado, nota y tiempo |

---

## Task 1: El mapeo de resultado a cierre

**Files:**
- Create: `lib/sig/scorm-cierre.ts`
- Test: `lib/sig/__tests__/scorm-cierre.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sig/__tests__/scorm-cierre.test.ts`:

```ts
// lib/sig/__tests__/scorm-cierre.test.ts
//
// Lo que se prueba acá es quién tiene la última palabra sobre si alguien aprobó.
//
// P15 · la da `notaMinima` del SIG, no el curso. `cmi.scaled_passing_score` es lo que opina
// el autor del contenido; `notaMinima` es lo que exige la organización. Y el veredicto se
// calcula con `aprobadoDe()`, que ya existe y ya se usa en el cierre manual: dos formas de
// decidir lo mismo terminan discrepando, y la discrepancia aparece en la auditoría.

import { calificacionDe, veredictoDelIntento } from '../scorm-cierre';

const COMPLETO = {
  completionStatus: 'completed',
  successStatus: 'passed',
  scoreScaled: 0.9,
  scoreRaw: null,
  scoreMin: null,
  scoreMax: null,
};

const CON_EVALUACION = { exigeEvaluacion: true, notaMinima: 80 };
const SIN_EVALUACION = { exigeEvaluacion: false, notaMinima: null };

describe('calificacionDe', () => {
  it('scaled manda y se lleva a 0–100', () => {
    expect(calificacionDe({ ...COMPLETO, scoreScaled: 0.9 })).toBe(90);
  });

  it('sin scaled normaliza raw contra min y max', () => {
    expect(
      calificacionDe({ ...COMPLETO, scoreScaled: null, scoreRaw: 15, scoreMin: 0, scoreMax: 20 }),
    ).toBe(75);
  });

  it('sin min declarado asume cero', () => {
    expect(
      calificacionDe({ ...COMPLETO, scoreScaled: null, scoreRaw: 8, scoreMin: null, scoreMax: 10 }),
    ).toBe(80);
  });

  // Un raw sin máximo no se puede normalizar: inventar un 100 sería inventar la nota.
  it('raw sin máximo no produce nota', () => {
    expect(
      calificacionDe({ ...COMPLETO, scoreScaled: null, scoreRaw: 8, scoreMin: null, scoreMax: null }),
    ).toBeNull();
  });

  it('sin ninguna nota devuelve null', () => {
    expect(calificacionDe({ ...COMPLETO, scoreScaled: null })).toBeNull();
  });
});

describe('veredictoDelIntento', () => {
  it('un curso sin terminar no registra ni cierra', () => {
    const v = veredictoDelIntento({ ...COMPLETO, completionStatus: 'incomplete' }, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: false, cierra: false }),
    );
    expect(v.motivo).toMatch(/todavía no/i);
  });

  it('completado y aprobado por encima del mínimo cierra', () => {
    const v = veredictoDelIntento(COMPLETO, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: true, asistio: true, calificacion: 90, aprobado: true }),
    );
  });

  // P15 · el curso dice «passed» pero la organización exige 80 y sacó 60. Manda el SIG.
  it('aprobado por el curso pero bajo el mínimo del SIG no cierra', () => {
    const v = veredictoDelIntento({ ...COMPLETO, scoreScaled: 0.6 }, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: false, aprobado: false, calificacion: 60 }),
    );
    expect(v.motivo).toMatch(/80/);
  });

  it('reprobado por el curso registra el intento y deja la asignación abierta', () => {
    const v = veredictoDelIntento(
      { ...COMPLETO, successStatus: 'failed', scoreScaled: 0.4 },
      CON_EVALUACION,
    );
    expect(v).toEqual(expect.objectContaining({ registrar: true, cierra: false, aprobado: false }));
  });

  // P16 · «terminé» sin resultado, en una capacitación que exige evaluación, no es aprobar.
  // Cerrarla como aprobada sería inventar el dato que falta.
  it('completado sin resultado no cierra cuando se exige evaluación', () => {
    const v = veredictoDelIntento({ ...COMPLETO, successStatus: 'unknown' }, CON_EVALUACION);
    expect(v.registrar).toBe(true);
    expect(v.cierra).toBe(false);
    expect(v.motivo).toMatch(/no reportó/i);
  });

  it('sin evaluación exigida, completar alcanza', () => {
    const v = veredictoDelIntento(
      { ...COMPLETO, successStatus: 'unknown', scoreScaled: null },
      SIN_EVALUACION,
    );
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: true, aprobado: null, calificacion: null }),
    );
  });

  it('con evaluación exigida y sin nota mínima declarada, el resultado del curso alcanza', () => {
    const v = veredictoDelIntento(COMPLETO, { exigeEvaluacion: true, notaMinima: null });
    expect(v).toEqual(expect.objectContaining({ cierra: true, aprobado: true }));
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-cierre`
Expected: FAIL — `Cannot find module '../scorm-cierre'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-cierre.ts`:

```ts
// lib/sig/scorm-cierre.ts
//
// De lo que reportó el SCO a lo que se escribe en `RegistroRealizado`.
//
// Reusa `aprobadoDe()` y `cierraLaAsignacion()` de `cierre.ts` en vez de reimplementar el
// veredicto (P15). Esa función ya congela el `aprobado` del cierre manual y ya sabe que una
// capacitación reprobada NO cierra: el intento queda registrado con su nota y la obligación
// sigue exigible para repetir la evaluación. Un curso SCORM no cambia esa regla — sólo
// cambia quién trae los datos.

import { aprobadoDe, cierraLaAsignacion } from './cierre';

export interface ResultadoDelSco {
  completionStatus: string;
  successStatus: string;
  scoreScaled: number | null;
  scoreRaw: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
}

export interface ExigenciaDelContenido {
  exigeEvaluacion: boolean;
  notaMinima: number | null;
}

export interface Veredicto {
  /// ¿Se crea el `RegistroRealizado`? Un curso a medias no deja registro; un curso
  /// terminado sí, aunque no cierre.
  registrar: boolean;
  /// ¿La asignación pasa a REALIZADA?
  cierra: boolean;
  asistio: boolean;
  calificacion: number | null;
  /// `null` cuando no hay nada que aprobar: sin evaluación exigida o sin nota.
  aprobado: boolean | null;
  /// La frase que ve la persona. Dice qué pasó y qué falta, en ese orden.
  motivo: string;
}

/// La nota en 0–100. `cmi.score.scaled` manda porque es la única que el estándar define
/// normalizada; `raw` sólo sirve si el curso declaró su máximo, y sin máximo no se
/// normaliza: inventar un 100 sería inventar la nota.
export function calificacionDe(r: ResultadoDelSco): number | null {
  if (r.scoreScaled !== null) return redondear(r.scoreScaled * 100);
  if (r.scoreRaw === null || r.scoreMax === null) return null;
  const min = r.scoreMin ?? 0;
  const rango = r.scoreMax - min;
  if (rango <= 0) return null;
  return redondear(((r.scoreRaw - min) / rango) * 100);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function veredictoDelIntento(
  r: ResultadoDelSco,
  e: ExigenciaDelContenido,
): Veredicto {
  if (r.completionStatus !== 'completed') {
    return {
      registrar: false,
      cierra: false,
      asistio: false,
      calificacion: null,
      aprobado: null,
      motivo: 'el curso todavía no reportó que terminó',
    };
  }

  const calificacion = calificacionDe(r);

  // P16 · «terminé» sin resultado, en una capacitación que exige evaluación, no alcanza.
  if (e.exigeEvaluacion && r.successStatus === 'unknown' && calificacion === null) {
    return {
      registrar: true,
      cierra: false,
      asistio: true,
      calificacion: null,
      aprobado: null,
      motivo:
        'el curso reportó que terminó pero no reportó resultado, y esta capacitación exige ' +
        'evaluación. La asignación sigue abierta.',
    };
  }

  const aprobado = decidirAprobado(r, e, calificacion);

  // La regla de si cierra es la MISMA del cierre manual, con los datos del curso.
  const cierra = cierraLaAsignacion({
    tipo: 'CAPACITACION',
    asistio: true,
    calificacion,
    exigeEvaluacion: e.exigeEvaluacion,
    notaMinima: e.notaMinima,
  })
    ? aprobado !== false
    : false;

  return {
    registrar: true,
    cierra,
    asistio: true,
    calificacion,
    aprobado,
    motivo: cierra
      ? 'el curso reportó que terminó y el resultado cumple lo exigido'
      : aprobado === false && e.notaMinima !== null
        ? `el resultado no alcanza la nota mínima exigida (${e.notaMinima}). El intento queda ` +
          'registrado y la asignación sigue abierta para repetir la evaluación.'
        : 'el curso reportó reprobado. El intento queda registrado y la asignación sigue abierta.',
  };
}

/// El orden importa. Primero el veredicto del SIG cuando hay nota mínima —P15—, y sólo si
/// no hay con qué decidir se toma lo que dijo el curso.
function decidirAprobado(
  r: ResultadoDelSco,
  e: ExigenciaDelContenido,
  calificacion: number | null,
): boolean | null {
  // `aprobadoDe` acepta `number | null | undefined` y devuelve `null` cuando no se puede
  // decidir (falta la nota o el mínimo): `lib/sig/cierre.ts:145-158`.
  const porNota = aprobadoDe(calificacion, e.notaMinima);
  if (porNota !== null) return porNota;
  if (r.successStatus === 'passed') return true;
  if (r.successStatus === 'failed') return false;
  return null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-cierre`
Expected: PASS — 13 pruebas

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-cierre.ts lib/sig/__tests__/scorm-cierre.test.ts
git commit -m "feat(sig): el resultado del curso se traduce al cierre con el veredicto del SIG"
```

---

## Task 2: Cerrar la asignación al completar

**Files:**
- Modify: `app/mi-sig/acciones/curso.ts` (la función `guardarIntento` de la fase 1)

- [ ] **Step 1: Traer lo que hace falta para decidir**

En `guardarIntento`, ampliar la consulta del intento:

```ts
  const intento = await prisma.intentoScorm.findUnique({
    where: { id: verificado.intentoId },
    select: {
      id: true,
      estado: true,
      totalTimeSegundos: true,
      asignacionId: true,
      registroId: true,
      mode: true,
      persona: { select: { correo: true } },
      asignacion: {
        select: {
          id: true,
          estado: true,
          personaId: true,
          contenido: {
            select: {
              id: true,
              version: true,
              exigeEvaluacion: true,
              notaMinima: true,
              versiones: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
            },
          },
        },
      },
    },
  });
```

- [ ] **Step 2: Cerrar en la misma transacción que cierra el intento**

Reemplazar el `await prisma.intentoScorm.update({...})` final por una transacción:

```ts
  const veredicto = final
    ? veredictoDelIntento(
        {
          completionStatus: completion,
          successStatus: limpio['cmi.success_status'] ?? 'unknown',
          scoreScaled:
            limpio['cmi.score.scaled'] === undefined ? null : Number(limpio['cmi.score.scaled']),
          scoreRaw: limpio['cmi.score.raw'] === undefined ? null : Number(limpio['cmi.score.raw']),
          scoreMin: limpio['cmi.score.min'] === undefined ? null : Number(limpio['cmi.score.min']),
          scoreMax: limpio['cmi.score.max'] === undefined ? null : Number(limpio['cmi.score.max']),
        },
        {
          exigeEvaluacion: intento.asignacion.contenido?.exigeEvaluacion ?? false,
          notaMinima:
            intento.asignacion.contenido?.notaMinima === null ||
            intento.asignacion.contenido?.notaMinima === undefined
              ? null
              : Number(intento.asignacion.contenido.notaMinima),
        },
      )
    : null;

  // P12 · `mode=review` no escribe nada: quien repasa lo que ya aprobó no arriesga su
  // registro. El intento de repaso no existe como fila, pero la guarda va acá también por
  // si alguna vez se abre uno.
  const registra =
    veredicto !== null && veredicto.registrar && intento.mode !== 'review' && intento.registroId === null;

  await prisma.$transaction(async (tx) => {
    await tx.intentoScorm.update({
      where: { id: intento.id },
      data: {
        cmi: limpio,
        completionStatus: completion,
        successStatus: limpio['cmi.success_status'] ?? 'unknown',
        scoreScaled:
          limpio['cmi.score.scaled'] === undefined ? null : Number(limpio['cmi.score.scaled']),
        progressMeasure:
          limpio['cmi.progress_measure'] === undefined ? null : Number(limpio['cmi.progress_measure']),
        location: limpio['cmi.location'] ?? null,
        suspendData: limpio['cmi.suspend_data'] ?? null,
        exit,
        sessionTimeSegundos: Math.round(sesionSegundos),
        totalTimeSegundos: final
          ? (aSegundos(
              sumarDuraciones(aDuracion(intento.totalTimeSegundos), aDuracion(sesionSegundos)),
            ) ?? 0)
          : intento.totalTimeSegundos,
        estado: !final
          ? 'EN_CURSO'
          : exit === 'suspend'
            ? 'SUSPENDIDO'
            : completion === 'completed'
              ? 'COMPLETADO'
              : 'SUSPENDIDO',
        terminadoEn: final ? new Date() : null,
        ultimaActividadEn: new Date(),
      },
    });

    if (!registra || veredicto === null) return;

    // El registro se crea UNA vez por intento (`intento.registroId` es único): un `Commit`
    // final repetido —los hay, cuando el curso llama Commit y después Terminate— no puede
    // duplicar el cierre.
    const registro = await tx.registroRealizado.create({
      data: {
        asignacionId: intento.asignacionId,
        asistio: veredicto.asistio,
        calificacion: veredicto.calificacion,
        // Congelado al cerrar: `notaMinima` vive en el contenido y cambia; el registro debe
        // seguir siendo verificable (R10).
        aprobado: veredicto.aprobado,
        versionContenidoId: intento.asignacion.contenido?.versiones[0]?.id ?? null,
        nota: `curso SCORM · intento registrado por el player · ${veredicto.motivo}`,
      },
    });

    await tx.intentoScorm.update({
      where: { id: intento.id },
      data: { registroId: registro.id },
    });

    if (veredicto.cierra && intento.asignacion.estado === 'PENDIENTE') {
      await tx.asignacion.update({
        where: { id: intento.asignacionId },
        data: {
          estado: 'REALIZADA',
          fechaCierre: new Date(),
          // No es un cierre administrativo: lo cerró la persona haciendo el curso.
          cerradaPor: intento.asignacion.personaId,
        },
      });
    }

    await registrar(tx, correo, [
      {
        tabla: 'intento_scorm',
        registroId: String(intento.id),
        campo: veredicto.cierra ? 'cierre' : 'intento',
        anterior: null,
        nuevo:
          `${completion}/${limpio['cmi.success_status'] ?? 'unknown'} · ` +
          `${veredicto.calificacion ?? 'sin nota'}`,
        motivo: veredicto.motivo,
      },
    ]);
  });

  return { ok: true, mensaje: veredicto?.motivo };
```

Agregar los imports que faltan al inicio del archivo:

```ts
import { registrar } from '@/lib/sgsi/bitacora';
import { veredictoDelIntento } from '@/lib/sig/scorm-cierre';
```

Y ampliar la interfaz de respuesta:

```ts
export interface Guardado {
  ok: boolean;
  mensaje?: string;
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: sin errores.

- [ ] **Step 4: Verificación 11 — completar sin resultado no cierra**

```bash
npm run db:up && npm run dev
```

Con una capacitación con `exigeEvaluacion = true` y paquete, terminar el curso reportando `completion_status=completed` y `success_status=unknown`:

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select i.id, i.estado, i.completion_status, i.success_status, a.estado as asignacion, r.nota
 from intento_scorm i join asignacion a on a.id = i.asignacion_id
 left join registro_realizado r on r.id = i.registro_id order by i.id desc limit 3;"
```

Expected: intento `COMPLETADO`, **asignación `PENDIENTE`**, y la nota del registro explicando que el curso no reportó resultado.

- [ ] **Step 5: Verificar que el cierre no se duplica**

Volver a llamar `guardarIntento` con `final = true` sobre el mismo intento (desde la consola del navegador con el token vigente).
Expected: `el intento ya está cerrado` — y en la base, **un** solo `registro_realizado` para esa asignación.

- [ ] **Step 6: Commit**

```bash
git add app/mi-sig/acciones/curso.ts
git commit -m "feat(sig): el curso cierra la asignacion, y no la cierra cuando no debe"
```

---

## Task 3: Retirar el cierre manual cuando hay paquete (P14)

**Files:**
- Modify: `app/mi-sig/bandeja.query.ts`
- Modify: `app/mi-sig/PanelCierre.tsx`
- Modify: `app/sig/acciones/tareas.ts`

- [ ] **Step 1: La tarjeta dice si hay paquete**

En `app/mi-sig/bandeja.query.ts`, agregar a `TarjetaBandeja`:

```ts
  /// P14 · con paquete SCORM, el cierre lo hace el player: el formulario de asistencia y
  /// nota desaparece. Dejar los dos caminos abiertos permitiría declararse aprobado en el
  /// curso que no se abrió, y anularía la razón de ser del player.
  tienePaqueteScorm: boolean;
```

En la consulta de asignaciones, incluir el paquete del contenido:

```ts
        contenido: {
          select: {
            // … los campos que ya trae …
            paquetes: { select: { id: true }, take: 1 },
          },
        },
```

Y al armar cada tarjeta:

```ts
      tienePaqueteScorm: (a.contenido?.paquetes.length ?? 0) > 0,
```

- [ ] **Step 2: El panel abre el curso en vez de pedir asistencia**

En `app/mi-sig/PanelCierre.tsx`, antes del bloque de `CAPACITACION`:

```tsx
  // P14 · el cierre lo hace el player. Acá no hay nada que declarar.
  if (tarjeta.tipo === 'CAPACITACION' && tarjeta.tienePaqueteScorm) {
    return (
      <section style={{ width: 396, padding: 16 }}>
        <h2>{tarjeta.titulo}</h2>
        <p>
          Esta capacitación es un curso en línea. Se cierra sola cuando el curso reporta que
          la terminaste: no hay que registrar asistencia ni nota a mano.
        </p>
        <a href={`/mi-sig/curso/${tarjeta.id}`}>Abrir el curso</a>
        {tarjeta.exigeEvaluacion && tarjeta.notaMinima !== null && (
          <p>Se aprueba con {tarjeta.notaMinima} o más.</p>
        )}
      </section>
    );
  }
```

- [ ] **Step 3: El servidor también lo rechaza**

En `app/sig/acciones/tareas.ts`, dentro de `cerrarAsignacion`, después de traer el contenido y antes de validar:

```ts
  // P14 · la compuerta real va en el servidor. Retirar el formulario de la pantalla no
  // alcanza: la acción es invocable desde el navegador, y una capacitación con paquete
  // tiene que ser incerrable a mano por quien la debe hacer.
  if (contenido?.tipo === 'CAPACITACION' && datos.asistio !== undefined) {
    const conPaquete = await prisma.paqueteScorm.findFirst({
      where: { contenidoId: contenido.id },
      select: { id: true },
    });
    if (conPaquete !== null) {
      return {
        ok: false,
        mensaje:
          'esta capacitación tiene un curso en línea: se cierra con el curso, no declarando ' +
          'asistencia. Abrila desde «Abrir el curso».',
      };
    }
  }
```

> **El cierre administrativo sigue siendo posible.** Esta compuerta se dispara sólo cuando llegan `asistio`/`calificacion`; un cierre administrativo con motivo (R5) pasa por su propio camino y no toca estos campos. Verificar contra el archivo real que el cierre administrativo no manda `asistio`, y si lo hace, condicionar además por `puede(rol, 'operacion:administrar')`.

- [ ] **Step 4: Verificar en la pantalla y en el servidor**

```bash
npm run dev
```

1. En `/mi-sig`, la tarjeta de la capacitación con paquete muestra «Abrir el curso» y **no** los campos de asistencia y nota.
2. Desde la consola del navegador, llamar `cerrarAsignacion(<id>, { asistio: true, calificacion: 100 })`.
   Expected: `esta capacitación tiene un curso en línea…`.

- [ ] **Step 5: Commit**

```bash
git add app/mi-sig/bandeja.query.ts app/mi-sig/PanelCierre.tsx app/sig/acciones/tareas.ts
git commit -m "feat(sig): con paquete SCORM la capacitacion no se cierra a mano"
```

---

## Task 4: Registrar el envío de datos al tercero (P20)

**Files:**
- Modify: `app/mi-sig/acciones/curso.ts` (`abrirIntento`)

- [ ] **Step 1: Anotar cada lanzamiento de un despacho**

En `abrirIntento`, después de resolver el paquete y antes del `return`:

```ts
  // P20 · en un paquete de DESPACHO, el correo y el nombre de la persona salen hacia el
  // tercero: el propio SCO los pone en la URL del contenido (§2). Sin este registro, la
  // organización no puede responder «a quién le compartimos los datos de nuestros
  // colaboradores y cuándo», que es lo que un titular de datos tiene derecho a preguntar.
  if (paquete.clase === 'DESPACHO') {
    await registrar({ bitacora: prisma.bitacora }, correo, [
      {
        tabla: 'intento_scorm',
        registroId: String(intento.id),
        campo: 'datos_a_tercero',
        anterior: null,
        nuevo: `correo y nombre → ${paquete.dominiosExternos.join(', ')}`,
        motivo: `lanzamiento del curso ${paquete.tituloOrganizacion} (paquete de despacho, D-4)`,
      },
    ]);
  }
```

Ampliar el `select` del paquete en la consulta de la asignación para traer lo que el registro necesita:

```ts
          paquetes: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              entradaHref: true,
              clase: true,
              dominiosExternos: true,
              tituloOrganizacion: true,
            },
          },
```

Y agregar el import:

```ts
import { registrar } from '@/lib/sgsi/bitacora';
```

- [ ] **Step 2: Verificar que queda registrado**

Abrir el curso del paquete entregado y consultar:

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select tabla, campo, nuevo, motivo from bitacora where campo = 'datos_a_tercero' order by id desc limit 3;"
```

Expected: una fila por lanzamiento, con `correo y nombre → https://my.coursebox.ai`.

- [ ] **Step 3: Commit**

```bash
git add app/mi-sig/acciones/curso.ts
git commit -m "feat(sig): queda registrado que el correo y el nombre salieron hacia el tercero"
```

---

## Task 5: El intento colgado no bloquea (P13)

**Files:**
- Create: `lib/sig/scorm-abandono.ts`
- Test: `lib/sig/__tests__/scorm-abandono.test.ts`
- Modify: `lib/sig/trabajos-catalogo.ts` · `lib/sig/trabajos.ts`
- Modify: `docs/handoff_sig/trabajos-programados.md` · `deploy/trabajos-cron.example`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sig/__tests__/scorm-abandono.test.ts`:

```ts
// lib/sig/__tests__/scorm-abandono.test.ts
//
// P13 · muchos cursos no llaman `Terminate` si se cierra la pestaña. Un intento que queda
// EN_CURSO para siempre bloquearía el siguiente —se reanudaría el colgado en vez de abrir
// uno nuevo—, así que se marca ABANDONADO conservando lo comprometido.

import { estaAbandonado, umbralDeAbandono } from '../scorm-abandono';

const AHORA = new Date('2026-09-08T18:00:00.000Z');

describe('umbralDeAbandono', () => {
  it('usa la variable cuando está', () => {
    expect(umbralDeAbandono('60')).toBe(60 * 60_000);
  });

  it('sin variable son 12 horas', () => {
    expect(umbralDeAbandono(undefined)).toBe(720 * 60_000);
  });

  it('una variable basura cae al valor por omisión en vez de dar NaN', () => {
    expect(umbralDeAbandono('ayer')).toBe(720 * 60_000);
    expect(umbralDeAbandono('0')).toBe(720 * 60_000);
  });
});

describe('estaAbandonado', () => {
  it('sin actividad por más del umbral, sí', () => {
    const hace13h = new Date('2026-09-08T05:00:00.000Z');
    expect(estaAbandonado(hace13h, AHORA, umbralDeAbandono('720'))).toBe(true);
  });

  it('con actividad reciente, no', () => {
    const hace10min = new Date('2026-09-08T17:50:00.000Z');
    expect(estaAbandonado(hace10min, AHORA, umbralDeAbandono('720'))).toBe(false);
  });

  it('justo en el umbral todavía no', () => {
    const hace12h = new Date('2026-09-08T06:00:00.000Z');
    expect(estaAbandonado(hace12h, AHORA, umbralDeAbandono('720'))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-abandono`
Expected: FAIL — `Cannot find module '../scorm-abandono'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-abandono.ts`:

```ts
// lib/sig/scorm-abandono.ts
//
// Cuándo un intento sin actividad se da por abandonado. Puro para que el umbral se pruebe
// sin esperar doce horas.

const POR_OMISION_MINUTOS = 720;

export function umbralDeAbandono(variable: string | undefined): number {
  const minutos = Number(variable);
  if (!Number.isFinite(minutos) || minutos <= 0) return POR_OMISION_MINUTOS * 60_000;
  return minutos * 60_000;
}

export function estaAbandonado(ultimaActividad: Date, ahora: Date, umbralMs: number): boolean {
  return ahora.getTime() - ultimaActividad.getTime() > umbralMs;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-abandono`
Expected: PASS — 6 pruebas

- [ ] **Step 5: Declarar y cablear el trabajo**

En `lib/sig/trabajos-catalogo.ts`:

```ts
  {
    nombre: 'abandonar-intentos-scorm',
    descripcion:
      'Marca ABANDONADO todo intento SCORM sin actividad por más de ' +
      'SCORM_INTENTO_ABANDONO_MINUTOS (12 h por omisión), conservando lo que el curso ya ' +
      'comprometió. Sin esto, un intento colgado se reanudaría para siempre en vez de ' +
      'dejar abrir uno nuevo (P13).',
    cuando: 'Cada hora, :40',
    disponible: true,
  },
```

En `lib/sig/trabajos.ts`, dentro de `IMPLEMENTACIONES`:

```ts
  'abandonar-intentos-scorm': async (autor, hoy) => {
    const { abandonarIntentosScorm } = await import('@/lib/sig/trabajos-scorm');
    return abandonarIntentosScorm(autor, hoy);
  },
```

Crear `lib/sig/trabajos-scorm.ts`:

```ts
import 'server-only';

// lib/sig/trabajos-scorm.ts
//
// El trabajo que recoge los intentos colgados. Vive aparte de `trabajos.ts` por el mismo
// criterio que `trabajos-notificaciones.ts`: el núcleo despacha, cada trabajo se lee solo.

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { estaAbandonado, umbralDeAbandono } from '@/lib/sig/scorm-abandono';

export async function abandonarIntentosScorm(
  autor: string,
  hoy: Date,
): Promise<{ creados: number; detalle: string }> {
  const umbral = umbralDeAbandono(process.env.SCORM_INTENTO_ABANDONO_MINUTOS);

  const abiertos = await prisma.intentoScorm.findMany({
    where: { estado: 'EN_CURSO' },
    select: { id: true, ultimaActividadEn: true, completionStatus: true },
  });

  const colgados = abiertos.filter((i) => estaAbandonado(i.ultimaActividadEn, hoy, umbral));
  if (colgados.length === 0) {
    return { creados: 0, detalle: `${abiertos.length} intentos abiertos, ninguno colgado` };
  }

  for (const i of colgados) {
    // Se marca el estado y NADA más: lo que el curso ya comprometió —`location`,
    // `suspend_data`, objetivos, interacciones— se conserva intacto, porque el próximo
    // intento no debería costarle a la persona lo que ya avanzó.
    await prisma.intentoScorm.update({
      where: { id: i.id },
      data: { estado: 'ABANDONADO', exit: 'time-out' },
    });
    await registrar({ bitacora: prisma.bitacora }, autor, [
      {
        tabla: 'intento_scorm',
        registroId: String(i.id),
        campo: 'estado',
        anterior: 'EN_CURSO',
        nuevo: 'ABANDONADO',
        motivo: `sin actividad por más de ${Math.round(umbral / 60_000)} minutos`,
      },
    ]);
  }

  return {
    creados: colgados.length,
    detalle: `${colgados.length} intentos marcados ABANDONADO de ${abiertos.length} abiertos`,
  };
}
```

- [ ] **Step 6: Verificación 13 — el intento colgado no bloquea**

```bash
# Envejecer a mano un intento en curso y correr el trabajo.
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"update intento_scorm set ultima_actividad_en = now() - interval '13 hours' where estado = 'EN_CURSO';"

curl -s -X POST http://localhost:3004/api/sig/trabajos/abandonar-intentos-scorm \
  -H "Authorization: Bearer $SIG_TRABAJOS_SECRET"
```

Expected: `resultado: "EXITOSO"` con `creados: 1`. Después, abrir de nuevo `/mi-sig/curso/<asignacionId>`:
Expected: se crea un intento **nuevo** (`numero` + 1) con `entry = ab-initio`, y el anterior conserva su `suspend_data`.

- [ ] **Step 7: Documentarlo**

En `docs/handoff_sig/trabajos-programados.md §3`:

```markdown
| `abandonar-intentos-scorm` | Cada hora, :40 | Marca ABANDONADO los intentos SCORM sin actividad, conservando lo comprometido (REQ-SIG-14 · P13) |
```

En `deploy/trabajos-cron.example`:

```
40 * * * * curl -s -X POST -H "Authorization: Bearer $SIG_TRABAJOS_SECRET" https://sig.cuantico.com/api/sig/trabajos/abandonar-intentos-scorm >> /var/log/sig-trabajos.log 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add lib/sig/scorm-abandono.ts lib/sig/__tests__/scorm-abandono.test.ts lib/sig/trabajos-scorm.ts lib/sig/trabajos-catalogo.ts lib/sig/trabajos.ts docs/handoff_sig/trabajos-programados.md deploy/trabajos-cron.example
git commit -m "feat(sig): los intentos SCORM colgados se recogen y no bloquean el siguiente"
```

---

## Task 6: Subir el paquete desde la pantalla de contenidos

**Files:**
- Modify: `app/sig/contenidos/Contenidos.client.tsx`
- Modify: `app/sig/contenidos/page.tsx`
- Modify: `app/sig/acciones/tareas.ts:651` y `:742` (publicación de versión)

- [ ] **Step 1: Traer los paquetes a la pantalla**

En `app/sig/contenidos/page.tsx`, agregar al `select` de cada contenido:

```ts
        paquetes: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            clase: true,
            edicion: true,
            archivos: true,
            dominiosExternos: true,
            tituloOrganizacion: true,
            zipSha256: true,
            subidoEn: true,
          },
        },
```

- [ ] **Step 2: El formulario, con la advertencia antes de guardar**

En `Contenidos.client.tsx`, para un contenido de tipo `CAPACITACION`:

```tsx
{/* D-1/D-4 · la clase del paquete NO es decorativa: separa «este curso no comparte datos»
    de «este curso comparte correo y nombre», y separa «la huella congela lo que la persona
    vio» de «el proveedor puede cambiar el curso mañana». Se dice con esas palabras, y se
    dice ANTES de guardar. */}
<form
  onSubmit={async (e) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget as HTMLFormElement);
    datos.set('contenidoId', String(contenido.id));
    const r = await subirPaqueteScorm(datos);
    setMensajeScorm(r.mensaje);
  }}
>
  <input type="file" name="archivo" accept=".zip" required />
  <button type="submit">Subir paquete SCORM</button>
</form>

{mensajeScorm !== null && <p>{mensajeScorm}</p>}

{contenido.paquetes.length > 0 && (
  <table>
    <thead>
      <tr><th>Versión</th><th>Clase</th><th>Edición</th><th>Archivos</th><th>Huella</th></tr>
    </thead>
    <tbody>
      {contenido.paquetes.map((p) => (
        <tr key={p.id}>
          <td>v{p.version}</td>
          <td>
            {p.clase === 'DESPACHO' ? (
              <span title={`El contenido lo entrega ${p.dominiosExternos.join(', ')}`}>
                Despacho — comparte correo y nombre con {p.dominiosExternos.join(', ')}
              </span>
            ) : (
              'Autocontenido — el contenido no sale de la aplicación'
            )}
          </td>
          <td>{p.edicion}</td>
          <td>{p.archivos}</td>
          <td>
            {p.clase === 'DESPACHO'
              ? `${p.zipSha256.slice(0, 12)} (cubre la cáscara, no el curso)`
              : p.zipSha256.slice(0, 12)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}
```

Con el import de la acción:

```ts
import { subirPaqueteScorm } from '@/app/sig/acciones/scorm';
```

- [ ] **Step 3: P2 — la versión del contenido congela el paquete**

En `app/sig/acciones/tareas.ts`, en los **dos** lugares donde se crea `versionContenido` (líneas ~651 y ~742), agregar al `data`:

```ts
          // P2 · un registro contra «Codificación Segura v2» tiene que seguir apuntando al
          // paquete que se ejecutó, aunque mañana se suba una v3. Sin esto el historial de
          // capacitación deja de ser verificable en el momento en que alguien actualiza un
          // curso.
          paqueteScormId: paqueteVigenteId,
```

Y, antes de la transacción en cada caso, resolver el paquete vigente:

```ts
  const paqueteVigente = await prisma.paqueteScorm.findFirst({
    where: { contenidoId },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  const paqueteVigenteId = paqueteVigente?.id ?? null;
```

- [ ] **Step 4: Verificar**

```bash
npm run dev
```

1. Subir `scorm_package_2004.zip` a una capacitación: la tabla debe decir **«Despacho — comparte correo y nombre con https://my.coursebox.ai»** y que la huella cubre la cáscara.
2. Subir un paquete de dos SCO: rechazo con el motivo (verificación 12 de la fase 1, ahora desde la pantalla).
3. Publicar una versión del contenido y comprobar el congelado:

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select id, contenido_id, version, paquete_scorm_id from version_contenido order by id desc limit 3;"
```

Expected: `paquete_scorm_id` poblado en la versión nueva.

- [ ] **Step 5: Commit**

```bash
git add app/sig/contenidos app/sig/acciones/tareas.ts
git commit -m "feat(sig): subir paquetes SCORM desde contenidos, con la advertencia de que comparte datos"
```

---

## Task 7: Los intentos se ven, y lo colgado se cuenta

**Files:**
- Modify: `app/mi-sig/historial/page.tsx`
- Modify: `app/sig/colaboradores/[id]/page.tsx`
- Modify: `lib/sig/anomalias.ts`
- Test: `lib/sig/__tests__/anomalias.test.ts`

- [ ] **Step 1: Escribir la prueba de la anomalía**

Agregar a `lib/sig/__tests__/anomalias.test.ts`:

```ts
describe('intentosScormAbandonados', () => {
  // Un intento abandonado es una capacitación que alguien empezó y el sistema dio por
  // perdida. Si nadie lo mira, la persona queda con la tarea abierta y sin saber por qué.
  it('cuenta los abandonados y no los demás', () => {
    expect(
      intentosScormAbandonados([
        { estado: 'ABANDONADO' },
        { estado: 'ABANDONADO' },
        { estado: 'COMPLETADO' },
        { estado: 'EN_CURSO' },
      ]),
    ).toBe(2);
  });

  it('una lista vacía es cero', () => {
    expect(intentosScormAbandonados([])).toBe(0);
  });
});
```

Y el import correspondiente al inicio del archivo de pruebas:

```ts
import { intentosScormAbandonados } from '../anomalias';
```

- [ ] **Step 2: Implementar la anomalía**

En `lib/sig/anomalias.ts`, junto a las demás funciones de conteo:

```ts
export interface IntentoScormEstado {
  estado: 'EN_CURSO' | 'SUSPENDIDO' | 'COMPLETADO' | 'ABANDONADO';
}

/// P13 · un intento abandonado significa que alguien empezó una capacitación y el sistema
/// la dio por perdida. Sin contarlo, esa persona queda con su tarea abierta y sin saber por
/// qué — y quien administra no tiene dónde verlo.
export function intentosScormAbandonados(intentos: readonly IntentoScormEstado[]): number {
  return intentos.filter((i) => i.estado === 'ABANDONADO').length;
}
```

Agregar la clave al tipo `ClaveAnomalia` y su declaración a `DECLARADAS`:

```ts
  {
    clave: 'INTENTO_SCORM_ABANDONADO',
    singular: 'intento de curso abandonado sin cerrar',
    plural: 'intentos de curso abandonados sin cerrar',
    donde: 'SIG · Mis tareas',
    ruta: '/mi-sig',
  },
```

Agregar la fuente a `FuentesDeAnomalias` y su uso en `anomaliasDelSistema`, siguiendo el patrón de las demás (`null` cuando la consulta no se pudo hacer, para no afirmar cero):

```ts
  intentosScorm: readonly IntentoScormEstado[] | null;
```

- [ ] **Step 3: Alimentar la fuente desde la pantalla**

En la página que arma `FuentesDeAnomalias` (`app/sig/estado/page.tsx`), agregar a las consultas en paralelo:

```ts
    prisma.intentoScorm.findMany({ select: { estado: true } }),
```

y pasarla como `intentosScorm`.

- [ ] **Step 4: Los intentos en el historial y en la ficha**

En `app/mi-sig/historial/page.tsx`, traer los intentos de la persona:

```ts
  const intentos = await prisma.intentoScorm.findMany({
    where: { persona: { correo } },
    orderBy: { iniciadoEn: 'desc' },
    select: {
      id: true,
      numero: true,
      estado: true,
      completionStatus: true,
      successStatus: true,
      scoreScaled: true,
      totalTimeSegundos: true,
      iniciadoEn: true,
      paquete: { select: { tituloOrganizacion: true, version: true } },
    },
  });
```

Y renderizarlos con `aDuracion(totalTimeSegundos)` para el tiempo y `scoreScaled * 100` para la nota. En `app/sig/colaboradores/[id]/page.tsx`, la misma consulta filtrada por `personaId`, junto a la lista de actas que ya está ahí.

- [ ] **Step 5: Verificar**

Run: `npm test -- anomalias`
Expected: PASS, incluidas las dos pruebas nuevas.

```bash
npm run dev
```

1. `/sig/estado` cuenta los intentos abandonados.
2. `/mi-sig/historial` lista los intentos con nota y tiempo.
3. `/sig/colaboradores/<id>` los muestra junto a las actas.

- [ ] **Step 6: Commit**

```bash
git add lib/sig/anomalias.ts lib/sig/__tests__/anomalias.test.ts app/sig/estado app/mi-sig/historial app/sig/colaboradores
git commit -m "feat(sig): los intentos de curso se ven, y los abandonados cuentan como anomalia"
```

---

## Task 8: Verificación 5 — un paquete autocontenido, de punta a punta

**Files:** ninguno. Es la verificación que la fase 1 no podía hacer, porque el paquete entregado es de despacho.

- [ ] **Step 1: Conseguir un paquete de referencia**

Descargar un paquete **autocontenido** de SCORM 2004 3rd Edition —los *Golf Examples* de ADL son el patrón de referencia habitual— y guardarlo fuera del repositorio.

- [ ] **Step 2: Subirlo y comprobar que se clasifica bien**

Subirlo a una capacitación de prueba.
Expected: la tabla dice **Autocontenido**, `dominiosExternos` vacío, y la cantidad de archivos coincide con el contenido del zip.

- [ ] **Step 3: Ejecutarlo sin dominios externos permitidos**

Abrir el curso y comprobar en la pestaña de red del navegador que **ninguna** petición sale a un dominio externo, y en la consola que no hay violaciones de CSP.
Expected: el curso funciona completo con `default-src 'none'` y sólo `'self'`.

- [ ] **Step 4: Terminarlo y comprobar el cierre**

Completar el curso aprobando.

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select i.numero, i.estado, i.completion_status, i.success_status, i.score_scaled,
        i.total_time_segundos, r.asistio, r.calificacion, r.aprobado, a.estado as asignacion
 from intento_scorm i left join registro_realizado r on r.id = i.registro_id
 join asignacion a on a.id = i.asignacion_id order by i.id desc limit 2;"
```

Expected: intento `COMPLETADO`, registro con `asistio = t` y su nota, `aprobado` congelado, y asignación `REALIZADA`.

- [ ] **Step 5: Repasar en `mode=review`**

Volver a abrir el curso ya cerrado.
Expected: el encabezado dice «repaso: este intento no se registra», y en la base **no** aparece un intento nuevo ni cambia el registro.

- [ ] **Step 6: Correr todo y cerrar la fase**

Run: `npm test && npm run lint && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && npm run build`
Expected: verde en las cuatro.

---

## Cobertura del requerimiento

| Verificación (§13 del requerimiento) | Tarea |
|---|---|
| 5 · un paquete autocontenido corre de punta a punta | Task 8 |
| 11 · el curso no cierra lo que no reportó | Task 1 + Task 2 · Step 4 |
| 13 · el intento colgado no bloquea | Task 5 · Step 6 |
| P14 · no se puede cerrar a mano | Task 3 · Step 4 |
| P15 · el veredicto lo da `notaMinima` | Task 1 |
| P20 · el envío al tercero queda registrado | Task 4 |
| P2 · la versión del contenido congela el paquete | Task 6 · Step 3 |

Las verificaciones 1, 2, 3, 4, 6, 7, 8, 9, 10 y 12 las cubrió la fase 1.

## Qué queda explícitamente fuera

- **El motor de secuenciación IMS SS y el multi-SCO** (D-3). El paquete multi-SCO se rechaza con motivo; ejecutar el primero y dar por hecho el curso completo cerraría la asignación con medio curso visto.
- **SCORM 1.2.**
- **Convertir a PDF los certificados de curso.** No existe tal artefacto: el cierre es un `RegistroRealizado`, y si además se quiere una constancia firmada, eso ya lo hace el mecanismo de leer/aceptar/firmar cuando el contenido tiene `exigeFirma` (P17).
- **La cobertura contractual del envío de datos al tercero** (D-4). El player lo registra y lo advierte; que exista el contrato es de gobierno.
