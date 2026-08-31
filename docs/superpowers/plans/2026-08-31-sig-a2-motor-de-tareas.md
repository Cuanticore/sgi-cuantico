# SIG · A2 — Motor de tareas · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El motor que el resto del SIG consume: contenidos reutilizables, la lista maestra de obligaciones del numeral 8, la generación idempotente de asignaciones con su alcance resuelto al generar, y el registro de realizado con validación por tipo de contenido. Sin superficies — esas son A3.

**Architecture:** Igual que A1: las decisiones viven en módulos **puros** (`lib/sig/periodos.ts`, `lib/sig/generacion.ts`, `lib/sig/cierre.ts`) probados sin base de datos; las acciones de servidor (`app/sig/acciones/tareas.ts`) solo aplican esos planes dentro de una transacción con bitácora. El código de asignación es consecutivo por tipo de contenido, siguiendo el precedente de `ContadorCodigo`.

**Tech Stack:** Next.js 16 App Router · TypeScript 5 · Prisma 7.9.1 + Postgres · Jest 30 (jsdom, `ts-jest` vía `next/jest`) · `America/Bogotá` (UTC−5, sin DST: un día UTC es un día Bogotá).

**Diseño:** `docs/superpowers/specs/2026-08-31-sig-personas-tareas-design.md` §3.2–3.6, §5, §6, §8 · `docs/handoff_a/design/modulo-a-personas-y-tareas.html` (solo como referencia de valores; las pantallas son de A3).

---

## Contexto: dónde encaja este plan

| Plan | Contenido |
|---|---|
| A1 ✅ | `Persona`, sincronización con el Directorio, rol Colaborador y retiro de `SGI_ACCESO_SIN_GRUPO`. |
| **A2 (este)** | Contenidos, obligaciones, asignaciones, generación idempotente y registro de realizado. |
| A3 | Las dos superficies: Mi SIG y Operación, con el header de cinco pestañas. |
| A4 | Notificaciones, indicadores y exportaciones. |

**A2 no trae pantalla.** Entrega el dominio y las acciones, verificables por pruebas y por la lista de comprobación manual del final. La pantalla de Personas de Operación (§4.2) y el botón de sincronizar ya tienen su acción (A1); el resto de la UI llega en A3.

## Decisiones de diseño declaradas (donde la spec deja lugar a elegir)

1. **`modalidad` es `String`.** La spec la nombra sin catálogo y el diseño no la muestra. No se inventa un enum que el negocio no definió; la validación vive en el servidor como hoy.
2. **`aprobado` se congeló en el registro.** Es derivable de `calificacion >= notaMinima`, pero `notaMinima` pertenece al contenido y cambia con R10. El registro es inmutable y debe seguir siendo verificable: se guarda la decisión del cierre, como `RiesgoCalculo` congela lo calculado.
3. **El enum de respuesta se llama `ValorRespuesta`.** La spec llama a la tabla `RespuestaItem`; Prisma no permite que un enum y un modelo compartan nombre.
4. **`RegistroRealizado` es 1:N con `Asignacion`.** La spec dice «uno a uno con la asignación cerrada», pero R8 exige conservar el registro anterior al reabrir. Cada cierre crea uno; el vigente es el último.
5. **La restricción «exactamente uno» de `Evidencia` se aplica dos veces**: un `CHECK` en el SQL de la migración (a mano, Prisma no lo genera) y la validación en la acción que cuelga anexos.
6. **Las fechas son `@db.Date` y se comparan por día en UTC.** Bogotá no tiene DST; un día UTC es un día Bogotá. «Vencida» se calcula: `día(hoy) > día(fechaLimite)`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` (modificar) | Seis modelos nuevos + enums + `Evidencia.controlId` opcional y `registroId`. |
| `lib/sig/periodos.ts` (crear) | **Puro.** Etiquetas y aperturas de periodo por periodicidad, horizonte de 90 días. |
| `lib/sig/__tests__/periodos.test.ts` (crear) | Pruebas del módulo puro. |
| `lib/sig/generacion.ts` (crear) | **Puro.** Resuelve el alcance al generar y el plan idempotente de altas. |
| `lib/sig/__tests__/generacion.test.ts` (crear) | Pruebas del módulo puro. |
| `lib/sig/cierre.ts` (crear) | **Puro.** Validaciones de cierre por tipo, vencida y extemporáneo. |
| `lib/sig/__tests__/cierre.test.ts` (crear) | Pruebas del módulo puro. |
| `app/sig/acciones/tareas.ts` (crear) | Acciones: generar, cerrar, reabrir, prorrogar, anular, no aplica, reasignar, contenidos y obligaciones. |
| `lib/sgsi/permisos.ts` (modificar) | Permisos `operacion:ver`, `operacion:escribir`, `operacion:administrar`. |
| `lib/sgsi/__tests__/permisos.test.ts` (modificar) | Pruebas de los permisos nuevos. |
| `.env.example`, `README.md` (modificar) | Documentación del motor. |

---

## Task 1: Modelos del motor y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_motor_tareas/migration.sql` (generada por Prisma, editada a mano para el CHECK)

- [ ] **Step 1: Agregar los enums al esquema**

Después del modelo `Persona` (al final del archivo), agregar:

```prisma
// ============================================================================
// SIG — Motor de tareas. The numeral-8 register: what the SIG must do, who must
// do it and how often. Everything derived (vencida, cumplimiento) is computed at
// read time, never stored.
// ============================================================================

enum TipoContenido {
  CAPACITACION
  LECTURA
  VERIFICACION
  TAREA

  @@map("tipo_contenido")
}

enum AlcanceObligacion {
  PERSONA
  CARGO
  AREA
  TODOS

  @@map("alcance_obligacion")
}

enum Periodicidad {
  UNICA
  DIARIA
  SEMANAL
  MENSUAL
  TRIMESTRAL
  SEMESTRAL
  ANUAL

  @@map("periodicidad")
}

enum EstadoAsignacion {
  PENDIENTE
  REALIZADA
  NO_APLICA
  ANULADA

  @@map("estado_asignacion")
}

/// Respuesta de un ítem de verificación. Nombre distinto de `RespuestaItem` porque
/// Prisma no admite que un enum y un modelo compartan identificador.
enum ValorRespuesta {
  CUMPLE
  NO_CUMPLE
  NO_APLICA

  @@map("valor_respuesta")
}
```

- [ ] **Step 2: Agregar los modelos**

Después de los enums:

```prisma
/// Contenido reutilizable: capacitación, lectura, verificación o tarea. El código es
/// consecutivo por tipo (CAP-001, LEC-003...), generado con un contador atómico.
///
/// Bloques condicionales por tipo, siguiendo el precedente de `AccionPlan`: los campos
/// que no aplican al tipo quedan nulos y el cierre los valida.
model ContenidoSig {
  id                  Int           @id @default(autoincrement())
  codigo              String        @unique
  tipo                TipoContenido
  titulo              String
  descripcion         String
  procedimientoOrigen String?       @map("procedimiento_origen")
  /// Sube al editar un contenido que ya generó asignaciones (R10): un acuse de lectura
  /// debe seguir siendo verificable contra la versión que se leyó.
  version             Int           @default(1)
  activo              Boolean       @default(true)
  creadaEn            DateTime      @default(now()) @map("creada_en")
  actualizadoEn       DateTime      @updatedAt @map("actualizado_en")

  // LECTURA — documento referenciado, no gestionado acá.
  documentoCodigo  String? @map("documento_codigo")
  documentoNombre  String? @map("documento_nombre")
  documentoVersion String? @map("documento_version")
  documentoUrl     String? @map("documento_url")

  // CAPACITACION
  duracionHoras   Decimal? @map("duracion_horas")
  modalidad       String?
  exigeEvaluacion Boolean  @default(false) @map("exige_evaluacion")
  notaMinima      Decimal? @map("nota_minima")

  items       ItemVerificacion[]
  obligaciones Obligacion[]

  @@map("contenido_sig")
}

/// Ítems de un contenido VERIFICACION. La primitiva que el módulo C reutilizará.
model ItemVerificacion {
  id             Int      @id @default(autoincrement())
  contenidoId    Int      @map("contenido_id")
  orden          Int
  texto          String
  obligatorio    Boolean  @default(true)
  permiteNoAplica Boolean @default(true) @map("permite_no_aplica")

  contenido ContenidoSig @relation(fields: [contenidoId], references: [id])

  @@unique([contenidoId, orden])
  @@map("item_verificacion")
}

/// La lista maestra del numeral 8: qué contenido, a quién, cada cuánto y con qué plazo.
/// El alcance se resuelve al generar (R2), no al definir.
model Obligacion {
  id                       Int               @id @default(autoincrement())
  contenidoId              Int               @map("contenido_id")
  alcance                  AlcanceObligacion
  alcancePersonaId         Int?              @map("alcance_persona_id")
  alcanceCargoId           Int?              @map("alcance_cargo_id")
  alcanceAreaId            Int?              @map("alcance_area_id")
  periodicidad             Periodicidad
  fechaInicio              DateTime          @map("fecha_inicio") @db.Date
  plazoDias                Int               @map("plazo_dias")
  diasAviso                Int               @map("dias_aviso")
  notificar                Boolean           @default(true)
  responsableSeguimientoId Int               @map("responsable_seguimiento_id")
  activa                   Boolean           @default(true)
  creadaEn                 DateTime          @default(now()) @map("creada_en")

  contenido               ContenidoSig        @relation(fields: [contenidoId], references: [id])
  alcancePersona          Persona?            @relation("ObligacionAlcancePersona", fields: [alcancePersonaId], references: [id])
  alcanceCargo            CargoResponsable?   @relation(fields: [alcanceCargoId], references: [id])
  alcanceArea             Area?               @relation(fields: [alcanceAreaId], references: [id])
  responsableSeguimiento  Persona             @relation("ObligacionSeguimiento", fields: [responsableSeguimientoId], references: [id])
  asignaciones            Asignacion[]

  @@map("obligacion")
}

/// Una instancia concreta: obligación + persona + periodo. La unique tripla es lo que
/// hace idempotente la generación: correrla dos veces no duplica nada.
model Asignacion {
  id            Int               @id @default(autoincrement())
  obligacionId  Int?              @map("obligacion_id")
  contenidoId   Int?              @map("contenido_id")
  /// Obligatorios cuando no hay contenido; ignorados cuando lo hay.
  titulo        String?
  descripcion   String?
  personaId     Int               @map("persona_id")
  /// Etiqueta legible del periodo: `2026-T3`, `2026-09`, `2026-S36`, `2026`.
  periodo       String
  fechaApertura DateTime          @map("fecha_apertura") @db.Date
  fechaLimite   DateTime          @map("fecha_limite") @db.Date
  estado        EstadoAsignacion  @default(PENDIENTE)
  fechaCierre   DateTime?         @map("fecha_cierre")
  /// Distinto de `personaId` solo en un cierre administrativo (R5).
  cerradaPor    Int?              @map("cerrada_por")
  /// Obligatorio en prórroga, anulación, no aplica y cierre administrativo.
  motivo        String?
  creadaEn      DateTime          @default(now()) @map("creada_en")

  obligacion        Obligacion?         @relation(fields: [obligacionId], references: [id])
  contenido         ContenidoSig?       @relation(fields: [contenidoId], references: [id])
  persona           Persona             @relation("AsignacionPersona", fields: [personaId], references: [id])
  cerradaPorPersona Persona?            @relation("AsignacionCerradaPor", fields: [cerradaPor], references: [id])
  registros         RegistroRealizado[]

  @@unique([obligacionId, personaId, periodo])
  @@index([personaId, estado])
  @@index([fechaLimite])
  @@map("asignacion")
}

/// El registro de un cierre, inmutable. 1:N con la asignación a propósito: al reabrir
/// (R8) el anterior se conserva y el nuevo cierre crea otro; el vigente es el último.
/// Quién lo registró no se repite acá: es `Asignacion.cerradaPor`.
model RegistroRealizado {
  id           Int      @id @default(autoincrement())
  asignacionId Int      @map("asignacion_id")
  fechaHora    DateTime @default(now()) @map("fecha_hora")
  nota         String?

  // LECTURA — la versión del documento en el momento del acuse (R10).
  versionLeida String? @map("version_leida")
  // CAPACITACION
  asistio      Boolean?
  calificacion Decimal?
  /// Congelado al cerrar: derivable de `notaMinima`, pero esa vive en el contenido y
  /// cambia; el registro debe seguir siendo verificable (R10).
  aprobado     Boolean?

  asignacion Asignacion       @relation(fields: [asignacionId], references: [id])
  respuestas RespuestaItem[]

  @@index([asignacionId])
  @@map("registro_realizado")
}

model RespuestaItem {
  id         Int            @id @default(autoincrement())
  registroId Int            @map("registro_id")
  itemId     Int            @map("item_id")
  respuesta  ValorRespuesta
  nota       String?

  registro RegistroRealizado @relation(fields: [registroId], references: [id])
  item     ItemVerificacion  @relation(fields: [itemId], references: [id])

  @@unique([registroId, itemId])
  @@map("respuesta_item")
}

/// Códigos consecutivos por tipo de contenido (CAP-001, LEC-003...). El mismo patrón
/// que `ContadorCodigo`: upsert atómico, porque MAX()+1 entregaría un número retirado.
model ContadorContenido {
  tipo        TipoContenido @id
  ultimoValor Int           @default(0) @map("ultimo_valor")

  @@map("contador_contenido")
}
```

- [ ] **Step 3: Abrir `Evidencia` al SIG**

En `model Evidencia`, cambiar:

```prisma
  controlId Int           @map("control_id")
```

por:

```prisma
  /// Exactamente uno de `controlId` o `registroId` está presente — lo impone un CHECK
  /// en la migración y la validación de la acción. La evidencia del SGSI y el anexo del
  /// SIG comparten la misma tabla: versionado, baja lógica y bytes en base, sin espejo.
  controlId  Int?  @map("control_id")
  registroId Int?  @map("registro_id")
```

Y la relación:

```prisma
  control Control @relation(fields: [controlId], references: [id])
```

por:

```prisma
  control Control? @relation(fields: [controlId], references: [id])
```

- [ ] **Step 4: Migración**

```bash
npx prisma migrate dev --name motor_tareas
```

Expected: crea la migración, aplica y regenera el cliente. El SQL debe contener `CREATE TABLE` para los seis modelos nuevos, `ALTER TABLE "evidencia" DROP NOT NULL` en `control_id`, `ADD COLUMN registro_id`, y **ningún `DROP COLUMN`**.

- [ ] **Step 5: Agregar el CHECK a mano**

Al final de la migración generada, agregar:

```sql
-- Evidencia: exactamente un origen (control del SGSI o registro del SIG), nunca ambos,
-- nunca ninguno. Los datos existentes tienen control_id, así que el CHECK no rompe nada.
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_un_solo_origen" CHECK (
  (control_id IS NOT NULL)::int + (registro_id IS NOT NULL)::int = 1
);
```

Luego aplicar de nuevo (ya está aplicada; el CHECK se agrega con un `migrate dev` posterior o directamente en la base de desarrollo):

```bash
npx prisma migrate dev
```

Expected: sin cambios pendientes. Verificar el CHECK en la base:

```bash
docker exec sgi-postgres psql -U sgi -d sgi_sgsi -c "\d evidencia"
```

- [ ] **Step 6: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sig): motor de tareas — modelos ContenidoSig, Obligacion, Asignacion y registro de realizado"
```

---

## Task 2: Los periodos, puros y probados

**Files:**
- Create: `lib/sig/periodos.ts`
- Test: `lib/sig/__tests__/periodos.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/periodos.test.ts
//
// Las etiquetas y aperturas de periodo son la identidad de una asignación: la unique
// tripla (obligación, persona, periodo) depende de que dos corridas etiqueten igual.

import {
  aperturaDePeriodo,
  etiquetaDePeriodo,
  periodosHasta,
  PeriodoGenerable,
} from '../periodos';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('etiquetaDePeriodo', () => {
  it('etiqueta un día con su fecha ISO', () => {
    expect(etiquetaDePeriodo('DIARIA', d('2026-09-01'))).toBe('2026-09-01');
  });

  it('etiqueta una semana con su número ISO', () => {
    expect(etiquetaDePeriodo('SEMANAL', d('2026-08-31'))).toBe('2026-S36');
  });

  it('etiqueta un mes con año y mes', () => {
    expect(etiquetaDePeriodo('MENSUAL', d('2026-09-15'))).toBe('2026-09');
  });

  it('etiqueta un trimestre', () => {
    expect(etiquetaDePeriodo('TRIMESTRAL', d('2026-10-01'))).toBe('2026-T4');
  });

  it('etiqueta un semestre', () => {
    expect(etiquetaDePeriodo('SEMESTRAL', d('2026-07-01'))).toBe('2026-S2');
  });

  it('etiqueta un año', () => {
    expect(etiquetaDePeriodo('ANUAL', d('2026-03-01'))).toBe('2026');
  });

  it('etiqueta UNICA con la fecha de inicio', () => {
    expect(etiquetaDePeriodo('UNICA', d('2026-11-30'))).toBe('2026-11-30');
  });
});

describe('aperturaDePeriodo', () => {
  it('una semana abre en su lunes, aunque la fecha caiga en domingo', () => {
    expect(aperturaDePeriodo('SEMANAL', d('2026-09-06'))).toEqual(d('2026-08-31'));
  });

  it('un mes abre el día 1', () => {
    expect(aperturaDePeriodo('MENSUAL', d('2026-09-30'))).toEqual(d('2026-09-01'));
  });

  it('un trimestre abre el primer día del trimestre', () => {
    expect(aperturaDePeriodo('TRIMESTRAL', d('2026-08-15'))).toEqual(d('2026-07-01'));
  });

  it('un semestre abre el primer día del semestre', () => {
    expect(aperturaDePeriodo('SEMESTRAL', d('2026-12-01'))).toEqual(d('2026-07-01'));
  });

  it('UNICA abre en la propia fecha', () => {
    expect(aperturaDePeriodo('UNICA', d('2026-11-30'))).toEqual(d('2026-11-30'));
  });
});

describe('periodosHasta', () => {
  const base = {
    id: 1,
    periodicidad: 'MENSUAL' as const,
    fechaInicio: d('2026-01-05'),
    plazoDias: 10,
  };

  it('genera todos los periodos desde el inicio hasta el horizonte', () => {
    const hoy = d('2026-03-15');
    const periodos = periodosHasta(base, hoy, 90);
    // Horizonte: 15/03 + 90 días = 13/06. Entran enero a junio; julio abre el 1 y no alcanza.
    expect(periodos.map((p) => p.etiqueta)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(periodos[2].apertura).toEqual(d('2026-03-01'));
    expect(periodos[2].fechaLimite).toEqual(d('2026-03-11'));
  });

  it('el horizonte suma días a la fecha de hoy, no a la de inicio', () => {
    const hoy = d('2026-06-30');
    const periodos = periodosHasta(base, hoy, 90);
    expect(periodos.at(-1)!.etiqueta).toBe('2026-09');
  });

  it('UNICA produce exactamente un periodo, etiquetado con su fecha de inicio', () => {
    const periodos = periodosHasta({ ...base, periodicidad: 'UNICA' }, d('2026-09-01'), 90);
    expect(periodos).toHaveLength(1);
    expect(periodos[0].etiqueta).toBe('2026-01-05');
    expect(periodos[0].fechaLimite).toEqual(d('2026-01-15'));
  });

  it('una periodicidad ANUAL abre el 1 de enero', () => {
    const periodos = periodosHasta({ ...base, periodicidad: 'ANUAL' }, d('2026-06-01'), 90);
    expect(periodos[0].etiqueta).toBe('2026');
    expect(periodos[0].apertura).toEqual(d('2026-01-01'));
  });

  it('no genera nada cuando la fecha de inicio está después del horizonte', () => {
    // 01/09 + 90 días = 30/11, y el primer periodo abre el 01/01: fuera de alcance.
    const periodos = periodosHasta(base, d('2025-09-01'), 90);
    expect(periodos).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/periodos.test.ts
```

Expected: FAIL — `Cannot find module '../periodos'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/periodos.ts
//
// La etiqueta y la apertura de cada periodo. Puro a propósito: la unique tripla
// (obligación, persona, periodo) depende de que dos corridas de la generación etiqueten
// igual, y la frontera del día se prueba sin base de datos.
//
// America/Bogotá es UTC−5 sin DST: un día UTC es un día Bogotá, así que las fechas se
// tratan como días puros (medianoche UTC) y la comparación es por año-mes-día.

import type { Periodicidad } from '@prisma/client';

export interface PeriodoGenerable {
  etiqueta: string;
  apertura: Date;
  fechaLimite: Date;
}

interface EntradaPeriodos {
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/// Semana ISO: lunes como primer día. 2026-08-31 (lunes) es la semana 36 de 2026.
function semanaIso(fecha: Date): number {
  const copia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = (copia.getUTCDay() + 6) % 7;
  copia.setUTCDate(copia.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(copia.getUTCFullYear(), 0, 4));
  const diaPrimero = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - diaPrimero + 3);
  return 1 + Math.round((copia.getTime() - primerJueves.getTime()) / (7 * 24 * 3600 * 1000));
}

function diaDeSemana(periodicidad: Periodicidad, fecha: Date): number {
  const d = fecha.getUTCDate();
  switch (periodicidad) {
    case 'DIARIA':
    case 'UNICA':
      return d;
    case 'SEMANAL':
      return d - ((fecha.getUTCDay() + 6) % 7);
    case 'MENSUAL':
      return 1;
    case 'TRIMESTRAL':
      return 1;
    case 'SEMESTRAL':
      return 1;
    case 'ANUAL':
      return 1;
  }
}

function mesDe(periodicidad: Periodicidad, fecha: Date): number {
  switch (periodicidad) {
    case 'TRIMESTRAL':
      return Math.floor(fecha.getUTCMonth() / 3) * 3;
    case 'SEMESTRAL':
      return Math.floor(fecha.getUTCMonth() / 6) * 6;
    default:
      return fecha.getUTCMonth();
  }
}

function desplazar(periodicidad: Periodicidad, fecha: Date, saltos: number): Date {
  const r = new Date(fecha);
  switch (periodicidad) {
    case 'DIARIA':
    case 'UNICA':
      r.setUTCDate(r.getUTCDate() + saltos);
      break;
    case 'SEMANAL':
      r.setUTCDate(r.getUTCDate() + saltos * 7);
      break;
    case 'MENSUAL':
      r.setUTCMonth(r.getUTCMonth() + saltos);
      break;
    case 'TRIMESTRAL':
      r.setUTCMonth(r.getUTCMonth() + saltos * 3);
      break;
    case 'SEMESTRAL':
      r.setUTCMonth(r.getUTCMonth() + saltos * 6);
      break;
    case 'ANUAL':
      r.setUTCFullYear(r.getUTCFullYear() + saltos);
      break;
  }
  return r;
}

/// `2026-S36`, `2026-09`, `2026-T3`, `2026-S2`, `2026`, o la fecha ISO en UNICA y DIARIA.
export function etiquetaDePeriodo(periodicidad: Periodicidad, fecha: Date): string {
  const año = fecha.getUTCFullYear();
  switch (periodicidad) {
    case 'DIARIA':
    case 'UNICA':
      return iso(fecha);
    case 'SEMANAL':
      return `${año}-S${String(semanaIso(fecha)).padStart(2, '0')}`;
    case 'MENSUAL':
      return `${año}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
    case 'TRIMESTRAL':
      return `${año}-T${Math.floor(fecha.getUTCMonth() / 3) + 1}`;
    case 'SEMESTRAL':
      return `${año}-S${Math.floor(fecha.getUTCMonth() / 6) + 1}`;
    case 'ANUAL':
      return String(año);
  }
}

/// El primer día del periodo que contiene a `fecha`.
export function aperturaDePeriodo(periodicidad: Periodicidad, fecha: Date): Date {
  if (periodicidad === 'DIARIA' || periodicidad === 'UNICA') return new Date(fecha);
  return new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      mesDe(periodicidad, fecha),
      diaDeSemana(periodicidad, fecha),
    ),
  );
}

/// Todos los periodos desde `fechaInicio` cuya apertura cae dentro del horizonte
/// (hoy + `horizonteDias`). UNICA produce exactamente uno. La fecha límite es la
/// apertura más `plazoDias` días (spec 3.4: «días desde la apertura del periodo»).
export function periodosHasta(
  entrada: EntradaPeriodos,
  hoy: Date,
  horizonteDias = 90,
): PeriodoGenerable[] {
  const { periodicidad, fechaInicio, plazoDias } = entrada;
  if (periodicidad === 'UNICA') {
    const apertura = aperturaDePeriodo(periodicidad, fechaInicio);
    return [{ etiqueta: iso(fechaInicio), apertura, fechaLimite: sumarDias(apertura, plazoDias) }];
  }

  const limite = sumarDias(hoy, horizonteDias);
  const periodos: PeriodoGenerable[] = [];
  let cursor = aperturaDePeriodo(periodicidad, fechaInicio);
  let saltos = 0;
  while (cursor.getTime() <= limite.getTime()) {
    periodos.push({ etiqueta: etiquetaDePeriodo(periodicidad, cursor), apertura: cursor, fechaLimite: sumarDias(cursor, plazoDias) });
    saltos += 1;
    cursor = aperturaDePeriodo(periodicidad, desplazar(periodicidad, fechaInicio, saltos));
  }
  return periodos;
}

function sumarDias(fecha: Date, dias: number): Date {
  const r = new Date(fecha);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/periodos.test.ts
```

Expected: PASS, 16 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/periodos.ts lib/sig/__tests__/periodos.test.ts
git commit -m "feat(sig): periodos del motor — etiquetas, aperturas y horizonte de 90 dias"
```

---

## Task 3: La generación, pura y probada

**Files:**
- Create: `lib/sig/generacion.ts`
- Test: `lib/sig/__tests__/generacion.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/generacion.test.ts
//
// R1 la generación es idempotente; R2 el alcance se resuelve al generar, no al definir;
// R11 desactivar una obligación no genera nada nuevo y no toca lo generado.

import { planificarGeneracion } from '../generacion';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-09-15');

const contenido = { id: 10, tipo: 'LECTURA' as const };

const obligacionBase = {
  id: 1,
  contenidoId: contenido.id,
  alcance: 'TODOS' as const,
  alcancePersonaId: null,
  alcanceCargoId: null,
  alcanceAreaId: null,
  periodicidad: 'MENSUAL' as const,
  fechaInicio: d('2026-09-01'),
  plazoDias: 10,
  activa: true,
};

const ADA = { id: 1, activa: true, areaId: 3, cargoId: 7 };
const GRACE = { id: 2, activa: true, areaId: 3, cargoId: 8 };
const LINUS = { id: 3, activa: false, areaId: 4, cargoId: 7 };

function persona(p: typeof ADA, sobre = p) {
  return { ...sobre, id: p.id };
}

describe('planificarGeneracion — alcance TODOS', () => {
  // Cada persona recibe TODOS los periodos del horizonte (sep–dic desde el 15/09:
  // 15/09 + 90 días = 14/12). Los casos de alcance comparan sobre el periodo actual.
  function delPeriodo(plan: ReturnType<typeof planificarGeneracion>, etiqueta: string) {
    return plan.crear.filter((c) => c.periodo === etiqueta);
  }

  it('alcanza a todas las personas activas', () => {
    const plan = planificarGeneracion([obligacionBase], [ADA, GRACE, LINUS], [], HOY);
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId).sort()).toEqual([1, 2]);
  });

  it('no alcanza a quien no está activa', () => {
    const plan = planificarGeneracion([obligacionBase], [ADA, LINUS], [], HOY);
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId)).toEqual([1]);
  });

  it('una corrida segunda con las existentes no duplica nada', () => {
    const primera = planificarGeneracion([obligacionBase], [ADA, GRACE], [], HOY);
    const segunda = planificarGeneracion(
      [obligacionBase],
      [ADA, GRACE],
      primera.crear.map((c) => ({ obligacionId: 1, personaId: c.personaId, periodo: c.periodo })),
      HOY,
    );
    expect(segunda.crear).toEqual([]);
  });
});

describe('planificarGeneracion — alcance por cargo, área y persona', () => {
  it('CARGO alcanza a quienes ocupan el cargo hoy (R2)', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, alcance: 'CARGO', alcanceCargoId: 7 }],
      [ADA, GRACE, LINUS],
      [],
      HOY,
    );
    // Linus está inactiva: no ocupa nada.
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId).sort()).toEqual([1]);
  });

  it('AREA alcanza a las personas activas del área', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, alcance: 'AREA', alcanceAreaId: 3 }],
      [ADA, GRACE, LINUS],
      [],
      HOY,
    );
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId).sort()).toEqual([1, 2]);
  });

  it('PERSONA alcanza solo a esa persona, y solo si está activa', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, alcance: 'PERSONA', alcancePersonaId: 3 }],
      [ADA, GRACE, LINUS],
      [],
      HOY,
    );
    expect(plan.crear).toEqual([]);
  });
});

describe('planificarGeneracion — periodos y estado', () => {
  it('genera todos los periodos del horizonte con sus fechas', () => {
    const plan = planificarGeneracion([obligacionBase], [ADA], [], HOY);
    // Horizonte: 15/09 + 90 días = 14/12: entran septiembre a diciembre.
    expect(plan.crear).toEqual([
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-09',
        fechaApertura: d('2026-09-01'),
        fechaLimite: d('2026-09-11'),
      },
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-10',
        fechaApertura: d('2026-10-01'),
        fechaLimite: d('2026-10-11'),
      },
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-11',
        fechaApertura: d('2026-11-01'),
        fechaLimite: d('2026-11-11'),
      },
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-12',
        fechaApertura: d('2026-12-01'),
        fechaLimite: d('2026-12-11'),
      },
    ]);
  });

  it('una obligación UNICA genera un solo periodo por persona', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, periodicidad: 'UNICA' }],
      [ADA, GRACE],
      [],
      HOY,
    );
    expect(plan.crear).toHaveLength(2);
    expect(plan.crear[0].periodo).toBe('2026-09-01');
  });

  it('una obligación inactiva no genera nada (R11)', () => {
    const plan = planificarGeneracion([{ ...obligacionBase, activa: false }], [ADA], [], HOY);
    expect(plan.crear).toEqual([]);
  });

  it('una persona que ingresa después recibe solo los periodos no generados (R2)', () => {
    const plan = planificarGeneracion(
      [obligacionBase],
      [ADA],
      [{ obligacionId: 1, personaId: 1, periodo: '2026-09' }],
      HOY,
    );
    // ADA ya tiene septiembre; quedan octubre a diciembre dentro del horizonte.
    expect(plan.crear.map((c) => c.periodo)).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/generacion.test.ts
```

Expected: FAIL — `Cannot find module '../generacion'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/generacion.ts
//
// Qué asignaciones faltan por crear. Puro a propósito: la idempotencia (R1) y el
// alcance resuelto al generar (R2) son decisiones que se prueban sin base de datos.
//
// Nunca toca lo ya generado: una obligación desactivada (R11) o una persona que entra
// después (R2) recibe solo lo que aún no existe.

import type { AlcanceObligacion, Periodicidad } from '@prisma/client';
import { periodosHasta } from './periodos';

export interface ObligacionGenerable {
  id: number;
  contenidoId: number;
  alcance: AlcanceObligacion;
  alcancePersonaId: number | null;
  alcanceCargoId: number | null;
  alcanceAreaId: number | null;
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
  activa: boolean;
}

export interface PersonaGenerable {
  id: number;
  activa: boolean;
  areaId: number | null;
  cargoId: number | null;
}

export interface AsignacionExistente {
  obligacionId: number | null;
  personaId: number;
  periodo: string;
}

export interface AsignacionACrear {
  obligacionId: number | null;
  contenidoId: number | null;
  personaId: number;
  periodo: string;
  fechaApertura: Date;
  fechaLimite: Date;
}

export interface PlanGeneracion {
  crear: AsignacionACrear[];
}

/// Quienes debe alcanzar una obligación, resuelto HOY (R2): quien ingrese después recibe
/// los periodos siguientes, nunca los pasados.
function resolverAlcance(
  obligacion: ObligacionGenerable,
  personas: readonly PersonaGenerable[],
): PersonaGenerable[] {
  const activas = personas.filter((p) => p.activa);
  switch (obligacion.alcance) {
    case 'PERSONA':
      return activas.filter((p) => p.id === obligacion.alcancePersonaId);
    case 'CARGO':
      return activas.filter((p) => p.cargoId === obligacion.alcanceCargoId);
    case 'AREA':
      return activas.filter((p) => p.areaId === obligacion.alcanceAreaId);
    case 'TODOS':
      return activas;
  }
}

export function planificarGeneracion(
  obligaciones: readonly ObligacionGenerable[],
  personas: readonly PersonaGenerable[],
  existentes: readonly AsignacionExistente[],
  hoy: Date,
  horizonteDias = 90,
): PlanGeneracion {
  const yaExiste = new Set(
    existentes.map((e) => `${e.obligacionId ?? 'x'}|${e.personaId}|${e.periodo}`),
  );
  const crear: AsignacionACrear[] = [];

  for (const obligacion of obligaciones) {
    if (!obligacion.activa) continue; // R11: no genera nada nuevo.

    const alcanzadas = resolverAlcance(obligacion, personas);
    if (alcanzadas.length === 0) continue;

    const periodos = periodosHasta(obligacion, hoy, horizonteDias);
    for (const persona of alcanzadas) {
      for (const periodo of periodos) {
        const clave = `${obligacion.id}|${persona.id}|${periodo.etiqueta}`;
        if (yaExiste.has(clave)) continue;
        yaExiste.add(clave);
        crear.push({
          obligacionId: obligacion.id,
          contenidoId: obligacion.contenidoId,
          personaId: persona.id,
          periodo: periodo.etiqueta,
          fechaApertura: periodo.apertura,
          fechaLimite: periodo.fechaLimite,
        });
      }
    }
  }

  return { crear };
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/generacion.test.ts
```

Expected: PASS, 10 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/generacion.ts lib/sig/__tests__/generacion.test.ts
git commit -m "feat(sig): generacion idempotente de asignaciones, alcance resuelto al generar"
```

---

## Task 4: El cierre, puro y probado

**Files:**
- Create: `lib/sig/cierre.ts`
- Test: `lib/sig/__tests__/cierre.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/cierre.test.ts
//
// R4 el cierre se valida en el servidor; R3 la vencida sigue viva y el extemporáneo se
// deduce de las fechas. Los casos que importan son los que dejarían pasar un cierre
// inválido.

import { validarCierre, esVencida, esExtemporaneo, aprobadoDe } from '../cierre';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('validarCierre — LECTURA', () => {
  it('exige la versión leída', () => {
    expect(validarCierre({ tipo: 'LECTURA', versionLeida: undefined })).toContain(
      'indique la versión que leyó',
    );
  });

  it('acepta con la versión', () => {
    expect(validarCierre({ tipo: 'LECTURA', versionLeida: 'v3' })).toEqual([]);
  });
});

describe('validarCierre — CAPACITACION', () => {
  it('exige la asistencia', () => {
    expect(validarCierre({ tipo: 'CAPACITACION', asistio: undefined })).toEqual([
      'registre la asistencia',
    ]);
  });

  it('sin evaluación no exige calificación', () => {
    expect(
      validarCierre({ tipo: 'CAPACITACION', asistio: true, exigeEvaluacion: false }),
    ).toEqual([]);
  });

  it('con evaluación exige la calificación', () => {
    expect(
      validarCierre({ tipo: 'CAPACITACION', asistio: true, exigeEvaluacion: true, calificacion: undefined }),
    ).toEqual(['registre la calificación']);
  });
});

describe('validarCierre — VERIFICACION', () => {
  it('exige responder los ítems obligatorios', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [
        { itemId: 1, obligatorio: true, permiteNoAplica: true, respuesta: undefined },
        { itemId: 2, obligatorio: false, permiteNoAplica: true, respuesta: undefined },
      ],
    });
    expect(errores).toContain('el ítem 1 es obligatorio');
    expect(errores).not.toContain('el ítem 2 es obligatorio');
  });

  it('NO_APLICA solo donde el ítem lo permite', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [
        { itemId: 1, obligatorio: true, permiteNoAplica: false, respuesta: 'NO_APLICA' },
      ],
    });
    expect(errores).toContain('el ítem 1 no admite "no aplica"');
  });
});

describe('validarCierre — TAREA', () => {
  it('no exige nada más que la nota, que es opcional', () => {
    expect(validarCierre({ tipo: 'TAREA', nota: undefined })).toEqual([]);
  });
});

describe('vencida y extemporáneo (R3)', () => {
  it('vence al día siguiente de la fecha límite, no el mismo día', () => {
    expect(esVencida('PENDIENTE', d('2026-09-11'), d('2026-09-11'))).toBe(false);
    expect(esVencida('PENDIENTE', d('2026-09-11'), d('2026-09-12'))).toBe(true);
  });

  it('una asignación cerrada nunca está vencida', () => {
    expect(esVencida('REALIZADA', d('2026-09-11'), d('2026-12-01'))).toBe(false);
  });

  it('extemporáneo es cerrar después de la fecha límite', () => {
    expect(esExtemporaneo(d('2026-09-12'), d('2026-09-11'))).toBe(true);
    expect(esExtemporaneo(d('2026-09-11'), d('2026-09-11'))).toBe(false);
  });
});

describe('aprobadoDe', () => {
  it('aprueba con la nota mínima o más', () => {
    expect(aprobadoDe(80, 80)).toBe(true);
    expect(aprobadoDe(79.9, 80)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/cierre.test.ts
```

Expected: FAIL — `Cannot find module '../cierre'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/cierre.ts
//
// Qué hace válido un cierre y qué se deduce de las fechas. Puro a propósito: R4 manda
// que la validación viva en el servidor, y esta es la única copia de esas reglas.

import type { TipoContenido, ValorRespuesta } from '@prisma/client';

export interface RespuestaCierre {
  itemId: number;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  respuesta: ValorRespuesta | undefined;
  nota?: string | null;
}

export interface DatosCierre {
  tipo: TipoContenido;
  versionLeida?: string | null;
  asistio?: boolean | null;
  calificacion?: number | null;
  exigeEvaluacion?: boolean;
  notaMinima?: number | null;
  respuestas?: RespuestaCierre[];
}

/// Devuelve los errores del cierre; vacío significa válido. La interfaz ayuda, no decide.
export function validarCierre(datos: DatosCierre): string[] {
  const errores: string[] = [];

  switch (datos.tipo) {
    case 'LECTURA':
      if (!datos.versionLeida?.trim()) errores.push('indique la versión que leyó');
      break;

    case 'CAPACITACION':
      if (datos.asistio === undefined || datos.asistio === null) {
        errores.push('registre la asistencia');
      } else if (datos.asistio && datos.exigeEvaluacion) {
        if (datos.calificacion === undefined || datos.calificacion === null) {
          errores.push('registre la calificación');
        }
      }
      break;

    case 'VERIFICACION':
      for (const r of datos.respuestas ?? []) {
        if (!r.respuesta) {
          if (r.obligatorio) errores.push(`el ítem ${r.itemId} es obligatorio`);
        } else if (r.respuesta === 'NO_APLICA' && !r.permiteNoAplica) {
          errores.push(`el ítem ${r.itemId} no admite "no aplica"`);
        }
      }
      break;

    case 'TAREA':
      break;
  }

  return errores;
}

/// R3: la vencida se calcula, nunca se guarda. Vence al día siguiente de la fecha
/// límite; el mismo día sigue en plazo.
export function esVencida(
  estado: string,
  fechaLimite: Date,
  hoy: Date,
): boolean {
  if (estado !== 'PENDIENTE') return false;
  return diaDe(hoy) > diaDe(fechaLimite);
}

/// Extemporáneo se deduce de las fechas: cerró después de la fecha límite.
export function esExtemporaneo(fechaCierre: Date | null, fechaLimite: Date): boolean {
  if (!fechaCierre) return false;
  return diaDe(fechaCierre) > diaDe(fechaLimite);
}

/// La decisión del cierre, congelada en el registro (ver cabecera del plan, decisión 2).
export function aprobadoDe(calificacion: number | null | undefined, notaMinima: number | null | undefined): boolean | null {
  if (calificacion === null || calificacion === undefined || notaMinima === null || notaMinima === undefined) {
    return null;
  }
  return calificacion >= notaMinima;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/cierre.test.ts
```

Expected: PASS, 12 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/cierre.ts lib/sig/__tests__/cierre.test.ts
git commit -m "feat(sig): validacion de cierre por tipo y vencida calculada, nunca guardada"
```

---

## Task 5: La acción de generación

**Files:**
- Create: `app/sig/acciones/tareas.ts`

- [ ] **Step 1: Escribir la acción**

```ts
'use server';

// app/sig/acciones/tareas.ts
//
// Aplica contra la base los planes que decidieron los módulos puros de lib/sig/. Acá no
// hay reglas de negocio: si una decisión se puede probar, vive en el módulo puro.
//
// Todo ocurre en una transacción con la bitácora adentro (regla transversal 07): una
// generación a medias que no dejó rastro es exactamente el artefacto que una auditoría
// busca.

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { planificarGeneracion } from '@/lib/sig/generacion';

export interface ResultadoGeneracion extends Resultado {
  creadas: number;
}

export async function generarAsignaciones(): Promise<ResultadoGeneracion> {
  return ejecutar<ResultadoGeneracion>(async () => {
    const autor = await autorConPermiso('operacion:escribir');

    const [obligaciones, personas, existentes] = await Promise.all([
      prisma.obligacion.findMany({
        select: {
          id: true,
          contenidoId: true,
          alcance: true,
          alcancePersonaId: true,
          alcanceCargoId: true,
          alcanceAreaId: true,
          periodicidad: true,
          fechaInicio: true,
          plazoDias: true,
          activa: true,
        },
      }),
      prisma.persona.findMany({
        select: { id: true, activa: true, areaId: true, cargoId: true },
      }),
      prisma.asignacion.findMany({
        select: { obligacionId: true, personaId: true, periodo: true },
      }),
    ]);

    const plan = planificarGeneracion(obligaciones, personas, existentes, new Date());
    if (plan.crear.length === 0) {
      return { ok: true, mensaje: 'No hay asignaciones nuevas por generar.', creadas: 0 };
    }

    const ahora = new Date();
    await prisma.$transaction(async (tx) => {
      for (const a of plan.crear) {
        const creada = await tx.asignacion.create({
          data: {
            obligacionId: a.obligacionId,
            contenidoId: a.contenidoId,
            personaId: a.personaId,
            periodo: a.periodo,
            fechaApertura: a.fechaApertura,
            fechaLimite: a.fechaLimite,
          },
        });
        await registrar(tx, autor, [
          {
            tabla: 'asignacion',
            registroId: String(creada.id),
            campo: 'alta',
            anterior: null,
            nuevo: `generada · ${a.periodo}`,
            motivo: 'generación idempotente de asignaciones',
          },
        ]);
      }
    });

    return {
      ok: true,
      mensaje: `Generación completada: ${plan.crear.length} asignación(es) nueva(s).`,
      creadas: plan.crear.length,
    };
  });
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: **falla** con `Argument of type '"operacion:escribir"' is not assignable to parameter of type 'Permiso'`. Es lo esperado: el permiso se crea en la tarea 9. Anotarlo y seguir.

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/tareas.ts
git commit -m "feat(sig): accion de generacion de asignaciones, transaccional y con bitacora"
```

---

## Task 6: Cerrar y reabrir

**Files:**
- Modify: `app/sig/acciones/tareas.ts`

- [ ] **Step 1: Escribir la acción de cierre**

Agregar a `app/sig/acciones/tareas.ts`:

```ts
import { validarCierre, esExtemporaneo, aprobadoDe } from '@/lib/sig/cierre';
import { autorActual } from '@/app/sgsi/acciones/sesion';
import { registrarBaja } from '@/lib/sgsi/bitacora';

export interface DatosCerrar {
  versionLeida?: string;
  asistio?: boolean;
  calificacion?: number;
  nota?: string;
  respuestas?: { itemId: number; respuesta: 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'; nota?: string }[];
  /// Motivo obligatorio en el cierre administrativo (R5).
  motivo?: string;
}

export interface ResultadoCierre extends Resultado {
  extemporaneo: boolean;
  administrativo: boolean;
}

/// La persona asignada cierra lo suyo; un miembro de `operacion:administrar` puede
/// cerrar cualquier asignación, con motivo (R5). El registro es inmutable: se crea,
/// nunca se edita.
export async function cerrarAsignacion(
  id: number,
  datos: DatosCerrar,
): Promise<ResultadoCierre> {
  return ejecutar<ResultadoCierre>(async () => {
    const sesion = await autorActual();
    const asignacion = await prisma.asignacion.findUnique({
      where: { id },
      include: {
        contenido: true,
        persona: true,
        obligacion: { include: { contenido: true } },
      },
    });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.', extemporaneo: false, administrativo: false };

    const contenido = asignacion.contenido ?? asignacion.obligacion?.contenido;
    if (!contenido) return { ok: false, mensaje: 'La asignación no tiene contenido.', extemporaneo: false, administrativo: false };

    const esAdministrativo = asignacion.persona.correo !== sesion;
    if (esAdministrativo) {
      await autorConPermiso('operacion:administrar');
      if (!datos.motivo?.trim()) {
        return { ok: false, mensaje: 'El cierre administrativo exige motivo.', extemporaneo: false, administrativo: true };
      }
    }

    const errores = validarCierre({
      tipo: contenido.tipo,
      versionLeida: datos.versionLeida,
      asistio: datos.asistio,
      calificacion: datos.calificacion,
      exigeEvaluacion: contenido.exigeEvaluacion,
      notaMinima: contenido.notaMinima ? Number(contenido.notaMinima) : null,
      respuestas: datos.respuestas,
    });
    if (errores.length > 0) {
      return { ok: false, mensaje: errores.join('. '), extemporaneo: false, administrativo: esAdministrativo };
    }

    const ahora = new Date();
    const extemporaneo = esExtemporaneo(ahora, asignacion.fechaLimite);

    await prisma.$transaction(async (tx) => {
      await tx.registroRealizado.create({
        data: {
          asignacionId: asignacion.id,
          nota: datos.nota,
          versionLeida: contenido.tipo === 'LECTURA' ? datos.versionLeida : null,
          asistio: contenido.tipo === 'CAPACITACION' ? datos.asistio : null,
          calificacion: contenido.tipo === 'CAPACITACION' ? datos.calificacion : null,
          aprobado:
            contenido.tipo === 'CAPACITACION'
              ? aprobadoDe(datos.calificacion, contenido.notaMinima ? Number(contenido.notaMinima) : null)
              : null,
          respuestas:
            contenido.tipo === 'VERIFICACION' && datos.respuestas
              ? {
                  create: datos.respuestas.map((r) => ({
                    itemId: r.itemId,
                    respuesta: r.respuesta,
                    nota: r.nota,
                  })),
                }
              : undefined,
        },
      });

      await tx.asignacion.update({
        where: { id: asignacion.id },
        data: {
          estado: 'REALIZADA',
          fechaCierre: ahora,
          cerradaPor: esAdministrativo ? undefined : asignacion.personaId,
          motivo: esAdministrativo ? datos.motivo : null,
        },
      });

      await registrar(tx, sesion, [
        {
          tabla: 'asignacion',
          registroId: String(asignacion.id),
          campo: 'estado',
          anterior: 'PENDIENTE',
          nuevo: 'REALIZADA',
          motivo: esAdministrativo ? `cierre administrativo · ${datos.motivo}` : 'cierre propio',
        },
      ]);
    });

    return {
      ok: true,
      mensaje: esAdministrativo
        ? `Cierre administrativo registrado${extemporaneo ? ' (extemporáneo)' : ''}.`
        : `Cierre registrado${extemporaneo ? ' (extemporáneo)' : ''}.`,
      extemporaneo,
      administrativo: esAdministrativo,
    };
  });
}
```

Nota: en el `update`, `cerradaPor: esAdministrativo ? undefined : asignacion.personaId` deja el valor anterior cuando es administrativo. Si la asignación se reabrió, `cerradaPor` quedó nulo y el administrativo debe quedar registrado: corregir a:

```ts
      const personaQueCierra = esAdministrativo
        ? await tx.persona.findUnique({ where: { correo: sesion }, select: { id: true } })
        : null;

      await tx.asignacion.update({
        where: { id: asignacion.id },
        data: {
          estado: 'REALIZADA',
          fechaCierre: ahora,
          cerradaPor: personaQueCierra?.id ?? asignacion.personaId,
          motivo: esAdministrativo ? datos.motivo : null,
        },
      });
```

- [ ] **Step 2: Escribir la acción de reapertura**

Agregar a `app/sig/acciones/tareas.ts`:

```ts
/// R8: reabrir no sobrescribe. El registro anterior se conserva; el próximo cierre crea
/// uno nuevo. Exige motivo y bitácora con el valor anterior.
export async function reabrirAsignacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La reapertura exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'REALIZADA') {
      return { ok: false, mensaje: 'Solo se reabre una asignación realizada.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { estado: 'PENDIENTE', fechaCierre: null, cerradaPor: null, motivo: null },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'estado',
          anterior: 'REALIZADA',
          nuevo: 'PENDIENTE',
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación reabierta. El registro anterior se conserva.' };
  });
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sigue fallando solo por `'operacion:escribir'` / `'operacion:administrar'` (tarea 9). La acción debe compilar sin errores propios.

- [ ] **Step 4: Commit**

```bash
git add app/sig/acciones/tareas.ts
git commit -m "feat(sig): cierre con validacion por tipo y reapertura que conserva el registro"
```

---

## Task 7: Prorrogar, anular, no aplica y reasignar

**Files:**
- Modify: `app/sig/acciones/tareas.ts`

- [ ] **Step 1: Escribir las acciones**

Agregar a `app/sig/acciones/tareas.ts`:

```ts
/// R6: prorrogar deja huella. Cambia la fecha límite con motivo obligatorio y valor
/// anterior en bitácora: el hecho de haber prorrogado no desaparece.
export async function prorrogarAsignacion(
  id: number,
  nuevaFechaLimite: Date,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La prórroga exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo se prorroga una asignación pendiente.' };
    }
    if (nuevaFechaLimite <= asignacion.fechaLimite) {
      return { ok: false, mensaje: 'La nueva fecha límite debe ser posterior a la actual.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { fechaLimite: nuevaFechaLimite },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'fecha_limite',
          anterior: asignacion.fechaLimite,
          nuevo: nuevaFechaLimite,
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Fecha límite prorrogada.' };
  });
}

/// R7: anular exige motivo. Nunca hay borrado físico.
export async function anularAsignacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La anulación exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo se anula una asignación pendiente.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { estado: 'ANULADA', motivo },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'estado',
          anterior: 'PENDIENTE',
          nuevo: 'ANULADA',
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación anulada.' };
  });
}

/// R7: «no aplica» exige motivo. Lo pide quien tiene la asignación o quien escribe en
/// Operación.
export async function noAplicaAsignacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const sesion = await autorActual();
    const asignacion = await prisma.asignacion.findUnique({
      where: { id },
      include: { persona: true },
    });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo una asignación pendiente puede marcarse como no aplica.' };
    }
    if (asignacion.persona.correo !== sesion) {
      await autorConPermiso('operacion:escribir');
    }
    if (!motivo.trim()) return { ok: false, mensaje: 'El motivo es obligatorio.' };

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { estado: 'NO_APLICA', motivo },
      });
      await registrar(tx, sesion, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'estado',
          anterior: 'PENDIENTE',
          nuevo: 'NO_APLICA',
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación marcada como no aplica.' };
  });
}

/// R9: reasignar no cierra nada: la asignación abierta pasa a otra persona, con motivo.
export async function reasignarAsignacion(
  id: number,
  nuevaPersonaId: number,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La reasignación exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo se reasigna una asignación pendiente.' };
    }
    const persona = await prisma.persona.findUnique({ where: { id: nuevaPersonaId } });
    if (!persona) return { ok: false, mensaje: 'La persona destino no existe.' };
    if (!persona.activa) return { ok: false, mensaje: 'La persona destino está inactiva.' };

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { personaId: nuevaPersonaId },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'persona_id',
          anterior: asignacion.personaId,
          nuevo: nuevaPersonaId,
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación reasignada.' };
  });
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: solo el error del permiso (tarea 9).

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/tareas.ts
git commit -m "feat(sig): prorrogar, anular, no aplica y reasignar — con motivo y bitacora"
```

---

## Task 8: Contenidos y obligaciones

**Files:**
- Modify: `app/sig/acciones/tareas.ts`

- [ ] **Step 1: Escribir las acciones**

Agregar a `app/sig/acciones/tareas.ts`:

```ts
import { registrarAlta } from '@/lib/sgsi/bitacora';

export interface DatosContenido {
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA';
  titulo: string;
  descripcion: string;
  procedimientoOrigen?: string;
  documentoCodigo?: string;
  documentoNombre?: string;
  documentoVersion?: string;
  documentoUrl?: string;
  duracionHoras?: number;
  modalidad?: string;
  exigeEvaluacion?: boolean;
  notaMinima?: number;
  items?: { texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
}

function validarDatosContenido(datos: DatosContenido): string[] {
  const errores: string[] = [];
  if (!datos.titulo.trim()) errores.push('el título es obligatorio');
  if (datos.tipo === 'LECTURA' && !datos.documentoVersion?.trim()) {
    errores.push('la versión del documento es obligatoria');
  }
  if (datos.tipo === 'VERIFICACION' && (!datos.items || datos.items.length === 0)) {
    errores.push('una verificación necesita al menos un ítem');
  }
  return errores;
}

/// R10: editar un contenido que ya generó asignaciones sube su versión; los registros
/// cerrados conservan la versión que se realizó.
export async function crearContenido(datos: DatosContenido): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const errores = validarDatosContenido(datos);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorContenido.upsert({
        where: { tipo: datos.tipo },
        update: { ultimoValor: { increment: 1 } },
        create: { tipo: datos.tipo, ultimoValor: 1 },
      });
      const prefijo: Record<DatosContenido['tipo'], string> = {
        CAPACITACION: 'CAP',
        LECTURA: 'LEC',
        VERIFICACION: 'LVE',
        TAREA: 'TAR',
      };
      const codigo = `${prefijo[datos.tipo]}-${String(contador.ultimoValor).padStart(3, '0')}`;

      const creado = await tx.contenidoSig.create({
        data: {
          codigo,
          tipo: datos.tipo,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          procedimientoOrigen: datos.procedimientoOrigen ?? null,
          documentoCodigo: datos.documentoCodigo ?? null,
          documentoNombre: datos.documentoNombre ?? null,
          documentoVersion: datos.documentoVersion ?? null,
          documentoUrl: datos.documentoUrl ?? null,
          duracionHoras: datos.duracionHoras ?? null,
          modalidad: datos.modalidad ?? null,
          exigeEvaluacion: datos.exigeEvaluacion ?? false,
          notaMinima: datos.notaMinima ?? null,
          items:
            datos.tipo === 'VERIFICACION'
              ? {
                  create: (datos.items ?? []).map((item, i) => ({
                    orden: i + 1,
                    texto: item.texto,
                    obligatorio: item.obligatorio,
                    permiteNoAplica: item.permiteNoAplica,
                  })),
                }
              : undefined,
        },
      });
      await registrarAlta(tx, autor, 'contenido_sig', String(creado.id));
    });

    return { ok: true, mensaje: 'Contenido creado.' };
  });
}

export interface DatosEditarContenido extends Partial<DatosContenido> {}

/// R10: si el contenido ya tiene asignaciones, la edición sube la versión; los acuses
/// previos conservan la versión que se realizó.
export async function editarContenido(id: number, datos: DatosEditarContenido): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const contenido = await prisma.contenidoSig.findUnique({
      where: { id },
      include: { _count: { select: { obligaciones: true } } },
    });
    if (!contenido) return { ok: false, mensaje: 'El contenido no existe.' };

    const conAsignaciones = contenido._count.obligaciones > 0;
    const version = conAsignaciones ? contenido.version + 1 : contenido.version;

    await prisma.$transaction(async (tx) => {
      await tx.contenidoSig.update({
        where: { id },
        data: {
          ...(datos.titulo !== undefined && { titulo: datos.titulo }),
          ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
          ...(datos.procedimientoOrigen !== undefined && { procedimientoOrigen: datos.procedimientoOrigen }),
          ...(datos.documentoCodigo !== undefined && { documentoCodigo: datos.documentoCodigo }),
          ...(datos.documentoNombre !== undefined && { documentoNombre: datos.documentoNombre }),
          ...(datos.documentoVersion !== undefined && { documentoVersion: datos.documentoVersion }),
          ...(datos.documentoUrl !== undefined && { documentoUrl: datos.documentoUrl }),
          ...(datos.duracionHoras !== undefined && { duracionHoras: datos.duracionHoras }),
          ...(datos.modalidad !== undefined && { modalidad: datos.modalidad }),
          ...(datos.exigeEvaluacion !== undefined && { exigeEvaluacion: datos.exigeEvaluacion }),
          ...(datos.notaMinima !== undefined && { notaMinima: datos.notaMinima }),
          version,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'contenido_sig',
          registroId: String(id),
          campo: 'version',
          anterior: contenido.version,
          nuevo: version,
          motivo: conAsignaciones
            ? 'edición de contenido publicado: sube la versión'
            : 'edición sin asignaciones: la versión no cambia',
        },
      ]);
    });

    return {
      ok: true,
      mensaje: conAsignaciones ? 'Contenido editado: la versión subió.' : 'Contenido editado.',
    };
  });
}

export interface DatosObligacion {
  contenidoId: number;
  alcance: 'PERSONA' | 'CARGO' | 'AREA' | 'TODOS';
  alcancePersonaId?: number;
  alcanceCargoId?: number;
  alcanceAreaId?: number;
  periodicidad: 'UNICA' | 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  fechaInicio: Date;
  plazoDias: number;
  diasAviso: number;
  notificar?: boolean;
  responsableSeguimientoId: number;
}

function validarDatosObligacion(datos: DatosObligacion): string[] {
  const errores: string[] = [];
  if (datos.plazoDias <= 0) errores.push('el plazo debe ser positivo');
  if (datos.diasAviso < 0) errores.push('los días de aviso no pueden ser negativos');
  const cuantos = [datos.alcancePersonaId, datos.alcanceCargoId, datos.alcanceAreaId].filter((v) => v !== undefined).length;
  if (datos.alcance !== 'TODOS' && cuantos !== 1) {
    errores.push('el alcance exige exactamente un destino');
  }
  if (datos.alcance === 'TODOS' && cuantos !== 0) {
    errores.push('el alcance TODOS no lleva destino');
  }
  return errores;
}

export async function crearObligacion(datos: DatosObligacion): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const errores = validarDatosObligacion(datos);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const contenido = await prisma.contenidoSig.findUnique({ where: { id: datos.contenidoId } });
    if (!contenido) return { ok: false, mensaje: 'El contenido no existe.' };

    await prisma.$transaction(async (tx) => {
      const creada = await tx.obligacion.create({
        data: {
          contenidoId: datos.contenidoId,
          alcance: datos.alcance,
          alcancePersonaId: datos.alcancePersonaId ?? null,
          alcanceCargoId: datos.alcanceCargoId ?? null,
          alcanceAreaId: datos.alcanceAreaId ?? null,
          periodicidad: datos.periodicidad,
          fechaInicio: datos.fechaInicio,
          plazoDias: datos.plazoDias,
          diasAviso: datos.diasAviso,
          notificar: datos.notificar ?? true,
          responsableSeguimientoId: datos.responsableSeguimientoId,
        },
      });
      await registrarAlta(tx, autor, 'obligacion', String(creada.id));
    });

    return { ok: true, mensaje: 'Obligación creada. Genera asignaciones en la próxima corrida.' };
  });
}

/// R11: desactivar deja de generar periodos nuevos y no toca los ya generados.
export async function desactivarObligacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La desactivación exige motivo.' };

    const obligacion = await prisma.obligacion.findUnique({ where: { id } });
    if (!obligacion) return { ok: false, mensaje: 'La obligación no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.obligacion.update({ where: { id }, data: { activa: false } });
      await registrarBaja(tx, autor, 'obligacion', String(id), motivo);
    });

    return { ok: true, mensaje: 'Obligación desactivada. Las asignaciones ya generadas no cambian.' };
  });
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: solo el error del permiso (tarea 9).

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/tareas.ts
git commit -m "feat(sig): contenidos con version por publicacion y obligaciones con alcance tipado"
```

---

## Task 9: Permisos de Operación

**Files:**
- Modify: `lib/sgsi/permisos.ts`
- Modify: `lib/sgsi/__tests__/permisos.test.ts`

- [ ] **Step 1: Agregar las pruebas**

En `lib/sgsi/__tests__/permisos.test.ts`, dentro del bloque `'los tres grupos conservan lo suyo y además ven Mi SIG'`, agregar:

```ts
  it('los permisos de Operación: escribir y administrar son del líder; ver es de lectura total', () => {
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'operacion:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'operacion:escribir')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'operacion:administrar')).toBe(true);

    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'operacion:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'operacion:escribir')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'operacion:administrar')).toBe(false);

    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'operacion:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'operacion:escribir')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'operacion:administrar')).toBe(false);
  });

  it('un Colaborador no alcanza nada de Operación', () => {
    for (const permiso of ['operacion:ver', 'operacion:escribir', 'operacion:administrar'] as const) {
      expect(puede(rolDesdeGrupos(['Domain Users']), permiso)).toBe(false);
    }
  });
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sgsi/__tests__/permisos.test.ts
```

Expected: FAIL — `operacion:ver` no existe en el tipo `Permiso`.

- [ ] **Step 3: Implementar**

En `lib/sgsi/permisos.ts`:

**3a.** En el tipo:

```ts
export type Permiso =
  | 'misig:ver'
  | 'operacion:ver'
  | 'operacion:escribir'
  | 'operacion:administrar'
  | 'sgsi:ver'
  | 'sgsi:escribir'
  | 'activo:valorar'
  | 'riesgo:tratar'
  | 'parametrizacion:escribir'
  | 'bitacora:ver'
  | 'evidencia:ver'
  | 'evidencia:escribir'
  | 'personas:administrar';
```

**3b.** En `POR_GRUPO`:

```ts
  [GRUPOS.seguridad]: [
    'misig:ver',
    'operacion:ver',
    'operacion:escribir',
    'operacion:administrar',
    'sgsi:ver',
    'sgsi:escribir',
    'activo:valorar',
    'riesgo:tratar',
    'parametrizacion:escribir',
    'bitacora:ver',
    'evidencia:ver',
    'evidencia:escribir',
    'personas:administrar',
  ],
```

```ts
  [GRUPOS.propietarios]: [
    'misig:ver',
    'operacion:ver',
    'sgsi:ver',
    'activo:valorar',
    'riesgo:tratar',
    'evidencia:escribir',
  ],
```

```ts
  [GRUPOS.auditoria]: ['misig:ver', 'operacion:ver', 'sgsi:ver', 'bitacora:ver', 'evidencia:ver'],
```

Nota: la acotación de `operacion:ver` de propietarios a su área se implementa en A3, cuando exista la superficie; el permiso ya está concedido.

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sgsi/__tests__/permisos.test.ts
```

Expected: PASS.

- [ ] **Step 5: tsc, que resuelve el error de las tareas 5–8, y suite completa**

```bash
npx tsc --noEmit && npm test
```

Expected: `tsc` sin errores y Jest verde.

- [ ] **Step 6: Commit**

```bash
git add lib/sgsi/permisos.ts lib/sgsi/__tests__/permisos.test.ts
git commit -m "feat(sig): permisos de Operacion — ver, escribir y administrar el motor de tareas"
```

---

## Task 10: Cierre — documentación y compilación

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Documentar en `.env.example`**

Después del bloque de la sincronización de personas (que ya está), agregar:

```
# ─── Motor de tareas del SIG ───────────────────────────────────────────────────
# Sin variables: la generación y los cierres usan la zona America/Bogota fija.
# Las notificaciones (resumen semanal y mensual) llegan en A4.
```

- [ ] **Step 2: Nota en el README**

Al final de `README.md`, después de la sección «Personas y acceso (SIG)», agregar:

```markdown
## Motor de tareas (SIG)

`ContenidoSig` (capacitación, lectura, verificación o tarea), `Obligacion` (la lista
maestra del numeral 8) y `Asignacion` (la instancia concreta por persona y periodo)
forman el motor que los módulos B, C y D consumen. La generación es **idempotente**:
se puede correr cuantas veces se quiera y nunca duplica, porque la unique tripla
(obligación, persona, periodo) lo impide. El alcance se resuelve al generar, no al
definir: quien ingresa después recibe los periodos siguientes, nunca los pasados.

«Vencida» no es un estado: es `PENDIENTE` con fecha límite anterior a hoy, calculada
al leer. Todo cierre se valida en el servidor (ítems obligatorios, versión leída,
nota mínima) y queda en `RegistroRealizado`, inmutable. Reabrir conserva el registro
anterior y el nuevo cierre crea otro.
```

- [ ] **Step 3: Gate — build completo**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: los cuatro en verde salvo el lint preexistente de `docs/handoff_v2/design/support.js` (ajeno a este plan, ya documentado).

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs(sig): documenta el motor de tareas y su generacion idempotente"
```

---

## Verificación manual antes de dar A2 por terminado

1. `npm run dev`, iniciar sesión con una cuenta de `Responsables SIG`.
2. Crear un contenido de prueba (LECTURA con versión, por ejemplo) y una obligación MENSUAL con alcance TODOS.
3. Invocar `generarAsignaciones()` dos veces: la primera crea, la segunda dice «No hay asignaciones nuevas».
4. Confirmar en la base: `select oid, correo from persona;` y `select periodo, estado, fecha_limite from asignacion order by id;`
5. Cerrar una asignación de LECTURA sin versión: debe rechazar. Con versión: debe aceptar.
6. Confirmar el registro: `select asignacion_id, version_leida, fecha_hora from registro_realizado order by id;`
7. Prorrogar una asignación y verificar la bitácora: `select campo, valor_anterior, valor_nuevo, motivo from bitacora where tabla='asignacion' order by id desc limit 10;`
8. Reabrir la asignación cerrada: el registro anterior sigue y el estado vuelve a PENDIENTE.
9. Verificar el CHECK de evidencia: `\d evidencia` muestra `evidencia_un_solo_origen`.

## Lo que A2 deja listo para A3

Los seis modelos del motor poblados y accionables por servidor; `operacion:ver`, `operacion:escribir` y `operacion:administrar` en el modelo de permisos; y `lib/sig/` con los tres módulos puros (periodos, generación, cierre) que las superficies de A3 van a llamar. El cierre administrativo, la prórroga, la anulación y la reasignación ya existen como acciones; A3 les pone botones.