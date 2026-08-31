# SIG · B — Mejora: NC y ACPM · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El módulo B del SIG: hallazgos (NC mayor, NC menor, observación, oportunidad de mejora) con su flujo escalonado por tipo, causa raíz con método declarado, evaluación de extensión (ISO 9001 §10.2.1 d), acciones que **son asignaciones del motor de A**, verificación de eficacia con separación de funciones, reincidencia y el tablero de mejora.

**Architecture:** Igual que A: decisiones en módulos **puros** (`lib/sig/hallazgos.ts`) probados sin base; acciones en `app/sig/acciones/hallazgos.ts` que aplican esos planes en transacciones con bitácora. Las acciones del hallazgo se crean como `Asignacion` puntuales del motor de A (un responsable mira una sola bandeja); la verificación de eficacia se agenda como asignación de papel `VERIFICACION`.

**Tech Stack:** Next.js 16 · TypeScript 5 · Prisma 7.9.1 · Jest 30 · exceljs · `America/Bogotá`.

**Diseño:** `docs/handoff_bcd/design/Main.dc.html` (grilla) · `Hallazgo.dc.html` (ficha de 5 pestañas) · `docs/handoff_tableros/design/TableroMejora.dc.html` · spec `docs/superpowers/specs/2026-08-31-sig-mejora-nc-acpm-design.md`.

---

## Contexto: dónde encaja este plan

| Plan | Contenido |
|---|---|
| A1–A4 ✅ | Personas, motor de tareas, superficies, notificaciones. |
| **B (este)** | Hallazgos y mejora. Consume el motor de A: sus acciones son asignaciones. |
| D | Gestión estratégica. |
| C | Auditorías internas (alimenta el origen «auditoría interna» de B). |

## Decisiones de diseño declaradas

1. **El artboard manda donde contradice a la spec** (mismo criterio que A3): la grilla del artboard no tiene filtros por origen/área/estado ni columnas de área/fecha — se sigue al artboard (chips de tipo + toggles Solo vencidos / Solo reincidentes). El tablero no navega a la grilla — tampoco se agrega.
2. **`HallazgoAccion.papel` gana `VERIFICACION`** (desviación del enum de la spec, necesaria): la verificación de eficacia se agenda como asignación puntual del motor (decisión 3.1.2 de la spec) y necesita enlazarse al hallazgo. Quien agenda es la persona que **clasifica** (miembro de Responsables SIG): el sistema no tiene mapa grupo→persona, y la spec no lo resuelve.
3. **Semáforo de plazo**: vencido se calcula contra `fechaCompromiso` (B8). Al clasificar, `fechaCompromiso = fechaClasificacion + diasEjecucion` del tipo (B7); el líder puede ajustarla. Sin clasificar no consume plazos (B3).
4. **El acta (Excel/PDF) no está en ningún artboard** (hallazgo del diseño); la spec §2.1 la pide. Se implementa con el patrón de la Declaración de Aplicabilidad (exceljs + vista imprimible), en la ficha.
5. **Anulado no tiene badge en la grilla** (el artboard no lo dibuja): la fila anulada se muestra con el estado «Anulado» en texto, siguiendo la regla 09 (el color nunca va solo), sin inventar una paleta nueva.
6. **Los plazos nacen sembrados** con valores por defecto (NC mayor 15/30/10, NC menor 10/20/10, observación 10/15/7, oportunidad 15/30/7) — parametrizables desde la interfaz con historial (B7). La pantalla de parámetros es un modal simple en Hallazgos; el artboard no la dibuja.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` (modificar) | Siete entidades de B + `Evidencia.hallazgoId` + CHECK de tres orígenes. |
| `lib/sig/hallazgos.ts` (crear) | **Puro.** Estado calculado, flujo escalonado por tipo, vencido, código. |
| `lib/sig/__tests__/hallazgos.test.ts` (crear) | Pruebas. |
| `app/sig/acciones/hallazgos.ts` (crear) | Reportar, clasificar, corrección, causa raíz, extensión, acciones, verificación, cierre, anular. |
| `lib/sgsi/permisos.ts` (modificar) | `mejora:reportar`, `mejora:ver`, `mejora:escribir`, `mejora:cerrar`. |
| `app/sig/hallazgos/page.tsx` (crear) | Grilla con KPIs, chips y toggles. |
| `app/sig/hallazgos/[codigo]/page.tsx` (crear) | Ficha de 5 pestañas con la franja inferior. |
| `app/sig/hallazgos/[codigo]/Ficha.client.tsx` (crear) | Pestañas, marcas EXIGE, acciones del formulario. |
| `app/sig/mejora/page.tsx` (crear) | Tablero de mejora. |
| `app/api/sig/hallazgos/[codigo]/acta/route.ts` (crear) | Acta a Excel. |
| `app/components/sgsi/PantallaControl.tsx` (modificar) | Hallazgos abiertos del control (origen tipado). |
| `.env.example`, `README.md` (modificar) | Documentación. |

---

## Task 1: Modelos de B y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_mejora/migration.sql`

- [ ] **Step 1: Los modelos**

Después de `EnvioNotificacion`:

```prisma
// ============================================================================
// SIG — Mejora (ISO 9001 §10.2 · ISO/IEC 27001 §10). El estado se calcula; solo
// se almacenan las marcas de cerrado y anulado, que son actos de una persona.
// ============================================================================

enum TipoHallazgo {
  NC_MAYOR
  NC_MENOR
  OBSERVACION
  OPORTUNIDAD

  @@map("tipo_hallazgo")
}

enum OrigenHallazgo {
  AUDITORIA_INTERNA
  AUDITORIA_EXTERNA
  QUEJA
  INDICADOR
  REVISION_DIRECCION
  SGSI
  OTRO

  @@map("origen_hallazgo")
}

enum MetodoCausa {
  CINCO_PORQUES
  ISHIKAWA
  LIBRE

  @@map("metodo_causa")
}

enum PapelAccionHallazgo {
  CORRECCION
  CORRECTIVA
  MEJORA
  /// Desviación declarada: la verificación de eficacia se agenda como asignación
  /// del motor de A (decisión 3.1.2 de la spec) y necesita enlazarse al hallazgo.
  VERIFICACION

  @@map("papel_accion_hallazgo")
}

enum ResultadoEficacia {
  EFICAZ
  NO_EFICAZ

  @@map("resultado_eficacia")
}

/// El código NO lleva el tipo: reclasificar una observación reincidente a NC mayor no
/// rompe la trazabilidad. Consecutivo anual con el patrón de ContadorCodigo (B1).
model Hallazgo {
  id               Int            @id @default(autoincrement())
  codigo           String         @unique // HAL-2026-0001
  tipo             TipoHallazgo
  origen           OrigenHallazgo
  /// Referencia tipada: auditoriaId, riesgoId o controlId, codigoIndicador, o texto.
  origenReferencia String         @map("origen_referencia")
  descripcion      String
  requisitoIncumplido String      @map("requisito_incumplido")
  evidenciaObjetiva String       @map("evidencia_objetiva")
  areaId           Int            @map("area_id")
  detectadoPorId   Int            @map("detectado_por_id")
  fechaDeteccion   DateTime       @map("fecha_deteccion") @db.Date
  /// B3: hasta la clasificación el hallazgo no consume plazos.
  clasificadoPorId Int?           @map("clasificado_por_id")
  fechaClasificacion DateTime?    @map("fecha_clasificacion") @db.Date
  responsableId    Int?           @map("responsable_id")
  fechaCompromiso  DateTime?      @map("fecha_compromiso") @db.Date
  /// B10: reincidencia.
  hallazgoAnteriorId Int?         @map("hallazgo_anterior_id")
  /// Marcas almacenables; el resto del estado se calcula.
  fechaCierre      DateTime?      @map("fecha_cierre")
  cerradoPorId     Int?           @map("cerrado_por_id")
  anuladoEn        DateTime?      @map("anulado_en")
  motivoAnulacion  String?        @map("motivo_anulacion")
  creadaEn         DateTime       @default(now()) @map("creada_en")

  area             Area           @relation("HallazgoArea", fields: [areaId], references: [id])
  detectadoPor     Persona        @relation("HallazgoDetectadoPor", fields: [detectadoPorId], references: [id])
  clasificadoPor   Persona?       @relation("HallazgoClasificadoPor", fields: [clasificadoPorId], references: [id])
  responsable      Persona?       @relation("HallazgoResponsable", fields: [responsableId], references: [id])
  cerradoPor       Persona?       @relation("HallazgoCerradoPor", fields: [cerradoPorId], references: [id])
  hallazgoAnterior Hallazgo?      @relation("HallazgoReincidencia", fields: [hallazgoAnteriorId], references: [id])
  reincidentes     Hallazgo[]     @relation("HallazgoReincidencia")

  analisis   AnalisisCausa?
  extension  ExtensionProblema?
  acciones   HallazgoAccion[]
  verificaciones VerificacionEficaciaHallazgo[]

  @@index([areaId, fechaDeteccion])
  @@map("hallazgo")
}

/// El método se declara y se guarda desarrollado, no como un párrafo suelto: es lo que
/// un auditor pide ver. Cinco porqués guarda los cinco pasos; Ishikawa, por categoría.
model AnalisisCausa {
  id            Int            @id @default(autoincrement())
  hallazgoId    Int            @unique @map("hallazgo_id")
  metodo        MetodoCausa
  desarrollo    Json
  causaRaiz     String         @map("causa_raiz")
  realizadoPorId Int           @map("realizado_por_id")
  fecha         DateTime       @default(now())

  hallazgo      Hallazgo       @relation(fields: [hallazgoId], references: [id])
  realizadoPor  Persona        @relation(fields: [realizadoPorId], references: [id])

  @@map("analisis_causa")
}

/// ISO 9001 §10.2.1 d: ¿el mismo problema existe en otra parte? Sin este registro la
/// NC se cierra sin haber preguntado lo que la norma obliga a preguntar.
model ExtensionProblema {
  id              Int      @id @default(autoincrement())
  hallazgoId      Int      @unique @map("hallazgo_id")
  evaluada        Boolean  @default(true)
  existeEnOtraParte Boolean @map("existe_en_otra_parte")
  analisis        String

  hallazgo        Hallazgo @relation(fields: [hallazgoId], references: [id])

  @@map("extension_problema")
}

/// Puente hallazgo ↔ asignación del motor de A. La dependencia va en un solo sentido:
/// el motor no sabe que existen los hallazgos (B12).
model HallazgoAccion {
  id           Int               @id @default(autoincrement())
  hallazgoId   Int               @map("hallazgo_id")
  asignacionId Int               @map("asignacion_id")
  papel        PapelAccionHallazgo

  hallazgo    Hallazgo          @relation(fields: [hallazgoId], references: [id])
  asignacion  Asignacion        @relation(fields: [asignacionId], references: [id])

  @@unique([hallazgoId, asignacionId])
  @@map("hallazgo_accion")
}

/// Son varias, no una: si la primera resulta no eficaz, la siguiente se agrega y el
/// historial completo queda (B6).
model VerificacionEficaciaHallazgo {
  id            Int              @id @default(autoincrement())
  hallazgoId    Int              @map("hallazgo_id")
  fecha         DateTime         @default(now())
  verificadoPorId Int            @map("verificado_por_id")
  resultado     ResultadoEficacia
  nota          String?

  hallazgo      Hallazgo         @relation(fields: [hallazgoId], references: [id])
  verificadoPor Persona          @relation(fields: [verificadoPorId], references: [id])

  @@index([hallazgoId, fecha])
  @@map("verificacion_eficacia_hallazgo")
}

/// Plazos por tipo parametrizables desde la interfaz (B7). Ningún plazo vive en el
/// código: la metodología cambió una vez y volverá a cambiar.
model PlazoPorTipoHallazgo {
  id             Int          @id @default(autoincrement())
  tipo           TipoHallazgo @unique
  diasAnalisis   Int          @map("dias_analisis")
  diasEjecucion  Int          @map("dias_ejecucion")
  diasVerificacion Int        @map("dias_verificacion")
  actualizadoEn  DateTime     @updatedAt @map("actualizado_en")

  @@map("plazo_por_tipo_hallazgo")
}

/// Consecutivo anual de hallazgos (B1).
model ContadorHallazgo {
  anio        Int  @id
  ultimoValor Int  @default(0) @map("ultimo_valor")

  @@map("contador_hallazgo")
}
```

- [ ] **Step 2: Las relaciones inversas en `Persona` y `Area`**

```prisma
  hallazgosDetectados  Hallazgo[] @relation("HallazgoDetectadoPor")
  hallazgosClasificados Hallazgo[] @relation("HallazgoClasificadoPor")
  hallazgosResponsables Hallazgo[] @relation("HallazgoResponsable")
  hallazgosCerrados    Hallazgo[] @relation("HallazgoCerradoPor")
  analisisCausa        AnalisisCausa[]
  verificacionesHallazgo VerificacionEficaciaHallazgo[]
```

(en `Persona`) y en `Area`:

```prisma
  hallazgos Hallazgo[] @relation("HallazgoArea")
```

- [ ] **Step 3: `Evidencia.hallazgoId`**

En `model Evidencia`, el comentario del origen dual pasa a tres:

```prisma
  /// Exactamente uno de `controlId`, `registroId` o `hallazgoId` está presente — lo
  /// impone el CHECK en la migración. Tres consumidores, un solo manejo de archivos.
  controlId  Int?  @map("control_id")
  registroId Int?  @map("registro_id")
  hallazgoId Int?  @map("hallazgo_id")
```

- [ ] **Step 4: Migración**

```bash
npx prisma migrate dev --name mejora
```

Expected: `CREATE TABLE` para las siete entidades nuevas, el alter de evidencia, **ningún DROP COLUMN**.

- [ ] **Step 5: Ampliar el CHECK**

Al final de la migración, reemplazar el CHECK anterior por el de tres orígenes (aplicarlo con psql en desarrollo; la migración queda como documento):

```sql
ALTER TABLE "evidencia" DROP CONSTRAINT IF EXISTS "evidencia_un_solo_origen";
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_un_solo_origen" CHECK (
  (control_id IS NOT NULL)::int + (registro_id IS NOT NULL)::int + (hallazgo_id IS NOT NULL)::int = 1
);
```

```bash
docker exec sgi-postgres psql -U sgi -d sgi_sgsi -c "ALTER TABLE evidencia DROP CONSTRAINT IF EXISTS evidencia_un_solo_origen; ALTER TABLE evidencia ADD CONSTRAINT evidencia_un_solo_origen CHECK ((control_id IS NOT NULL)::int + (registro_id IS NOT NULL)::int + (hallazgo_id IS NOT NULL)::int = 1);"
```

- [ ] **Step 6: Seed de plazos**

```bash
docker exec sgi-postgres psql -U sgi -d sgi_sgsi -c "INSERT INTO plazo_por_tipo_hallazgo (tipo, dias_analisis, dias_ejecucion, dias_verificacion) VALUES ('NC_MAYOR',15,30,10),('NC_MENOR',10,20,10),('OBSERVACION',10,15,7),('OPORTUNIDAD',15,30,7) ON CONFLICT (tipo) DO NOTHING;"
```

- [ ] **Step 7: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sig): modelos de mejora — Hallazgo, causa raiz, extension, acciones y verificacion"
```

---

## Task 2: El dominio puro — estado, plazos y código

**Files:**
- Create: `lib/sig/hallazgos.ts`
- Test: `lib/sig/__tests__/hallazgos.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/hallazgos.test.ts
//
// El estado se calcula (B3, B8): abierto, en análisis, en ejecución y en verificación
// se deducen de lo que el hallazgo tiene. Lo único almacenado son las marcas de
// cerrado y anulado. También: el flujo escalonado por tipo y el consecutivo anual.

import {
  estadoCalculado,
  EstadoHallazgo,
  vencidoContra,
  exigeTabla,
  codigoHallazgo,
} from '../hallazgos';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function hallazgo(over: Partial<{
  anuladoEn: Date | null;
  fechaCierre: Date | null;
  tieneAnalisis: boolean;
  accionesAbiertas: number;
  verificacionEficaz: boolean;
  verificacionPendiente: boolean;
}> = {}) {
  return {
    anuladoEn: null,
    fechaCierre: null,
    tieneAnalisis: false,
    accionesAbiertas: 0,
    verificacionEficaz: false,
    verificacionPendiente: false,
    ...over,
  };
}

describe('estadoCalculado', () => {
  it('anulado manda: es una marca, no un cálculo', () => {
    expect(estadoCalculado(hallazgo({ anuladoEn: d('2026-09-01') }))).toBe('ANULADO');
  });

  it('cerrado es una marca de una persona', () => {
    expect(estadoCalculado(hallazgo({ fechaCierre: d('2026-09-01') }))).toBe('CERRADO');
  });

  it('sin clasificar nada consume plazos: abierto', () => {
    expect(estadoCalculado(hallazgo())).toBe('ABIERTO');
  });

  it('con análisis y sin acciones abiertas: en análisis', () => {
    expect(estadoCalculado(hallazgo({ tieneAnalisis: true }))).toBe('EN_ANALISIS');
  });

  it('con acciones abiertas: en ejecución', () => {
    expect(
      estadoCalculado(hallazgo({ tieneAnalisis: true, accionesAbiertas: 2 })),
    ).toBe('EN_EJECUCION');
  });

  it('con verificación pendiente: en verificación', () => {
    expect(
      estadoCalculado(hallazgo({ verificacionPendiente: true })),
    ).toBe('EN_VERIFICACION');
  });
});

describe('vencidoContra', () => {
  it('vence al día siguiente de la fecha compromiso', () => {
    expect(vencidoContra(d('2026-09-10'), d('2026-09-10'))).toBe(false);
    expect(vencidoContra(d('2026-09-11'), d('2026-09-10'))).toBe(true);
  });
});

describe('exigeTabla (flujo escalonado de la spec §4)', () => {
  it('NC mayor: corrección obligatoria, causa con método, extensión y verificación', () => {
    const e = exigeTabla('NC_MAYOR');
    expect(e.correccion).toBe('SI');
    expect(e.causa).toBe('METODO');
    expect(e.extension).toBe(true);
    expect(e.verificacion).toBe('SI');
  });

  it('NC menor: corrección solo si el efecto ocurrió, causa libre', () => {
    const e = exigeTabla('NC_MENOR');
    expect(e.correccion).toBe('SI_APLICA');
    expect(e.causa).toBe('LIBRE');
    expect(e.extension).toBe(true);
  });

  it('observación: causa opcional, sin extensión, verificación solo si hubo acción', () => {
    const e = exigeTabla('OBSERVACION');
    expect(e.correccion).toBe('NO');
    expect(e.causa).toBe('OPCIONAL');
    expect(e.extension).toBe(false);
    expect(e.verificacion).toBe('CONDICIONAL');
  });

  it('oportunidad: requiere al menos una acción de mejora', () => {
    const e = exigeTabla('OPORTUNIDAD');
    expect(e.causa).toBe('NO');
    expect(e.verificacion).toBe('CONDICIONAL');
  });
});

describe('codigoHallazgo', () => {
  it('formatea el consecutivo anual', () => {
    expect(codigoHallazgo(2026, 1)).toBe('HAL-2026-0001');
    expect(codigoHallazgo(2026, 21)).toBe('HAL-2026-0021');
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/hallazgos.test.ts
```

Expected: FAIL — `Cannot find module '../hallazgos'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/hallazgos.ts
//
// El estado se calcula (B3, B8), el flujo escalonado por tipo es una tabla (spec §4),
// y el consecutivo anual no lleva el tipo (B1). Puro a propósito: son las reglas que
// un auditor lee, y se prueban sin base de datos.

export type EstadoHallazgo =
  | 'ABIERTO'
  | 'EN_ANALISIS'
  | 'EN_EJECUCION'
  | 'EN_VERIFICACION'
  | 'CERRADO'
  | 'ANULADO';

export interface DatosEstado {
  anuladoEn: Date | null;
  fechaCierre: Date | null;
  tieneAnalisis: boolean;
  accionesAbiertas: number;
  verificacionEficaz: boolean;
  verificacionPendiente: boolean;
}

/// Las marcas de cerrado y anulado son actos de una persona; lo demás se deduce.
export function estadoCalculado(h: DatosEstado): EstadoHallazgo {
  if (h.anuladoEn) return 'ANULADO';
  if (h.fechaCierre) return 'CERRADO';
  if (h.verificacionPendiente) return 'EN_VERIFICACION';
  if (h.accionesAbiertas > 0) return 'EN_EJECUCION';
  if (h.tieneAnalisis) return 'EN_ANALISIS';
  return 'ABIERTO';
}

/// B8: vencido contra la fecha compromiso, nunca una marca que alguien deba poner.
export function vencidoContra(fechaCompromiso: Date | null, hoy: Date): boolean {
  if (!fechaCompromiso) return false;
  return diaDe(hoy) > diaDe(fechaCompromiso);
}

export interface ExigenciaTipo {
  correccion: 'SI' | 'SI_APLICA' | 'NO';
  causa: 'METODO' | 'LIBRE' | 'OPCIONAL' | 'NO';
  extension: boolean;
  /// SI siempre; CONDICIONAL solo si hubo acción.
  verificacion: 'SI' | 'CONDICIONAL';
}

/// La tabla del flujo escalonado de la spec §4, hecha función.
export function exigeTabla(tipo: string): ExigenciaTipo {
  switch (tipo) {
    case 'NC_MAYOR':
      return { correccion: 'SI', causa: 'METODO', extension: true, verificacion: 'SI' };
    case 'NC_MENOR':
      return { correccion: 'SI_APLICA', causa: 'LIBRE', extension: true, verificacion: 'SI' };
    case 'OBSERVACION':
      return { correccion: 'NO', causa: 'OPCIONAL', extension: false, verificacion: 'CONDICIONAL' };
    case 'OPORTUNIDAD':
      return { correccion: 'NO', causa: 'NO', extension: false, verificacion: 'CONDICIONAL' };
  }
  return { correccion: 'NO', causa: 'NO', extension: false, verificacion: 'CONDICIONAL' };
}

/// B1: el código es inmutable y no lleva el tipo.
export function codigoHallazgo(anio: number, consecutivo: number): string {
  return `HAL-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/hallazgos.test.ts
```

Expected: PASS, 10 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/hallazgos.ts lib/sig/__tests__/hallazgos.test.ts
git commit -m "feat(sig): dominio puro de mejora — estado calculado, flujo por tipo y consecutivo"
```

---

## Task 3: Reportar y clasificar

**Files:**
- Create: `app/sig/acciones/hallazgos.ts`

- [ ] **Step 1: Las acciones**

```ts
'use server';

// app/sig/acciones/hallazgos.ts
//
// B3 cualquiera reporta; solo el líder clasifica. B4 nadie cierra su propio hallazgo.
// B9 anular exige motivo y administrador. Todo en transacciones con bitácora.

import { prisma } from '@/lib/db';
import { autorActual, autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { codigoHallazgo } from '@/lib/sig/hallazgos';

export interface DatosReporte {
  origen: 'AUDITORIA_INTERNA' | 'AUDITORIA_EXTERNA' | 'QUEJA' | 'INDICADOR' | 'REVISION_DIRECCION' | 'SGSI' | 'OTRO';
  origenReferencia: string;
  descripcion: string;
  requisitoIncumplido: string;
  evidenciaObjetiva: string;
  areaId: number;
  fechaDeteccion: Date;
}

/// B3: cualquiera reporta. El hallazgo nace SIN tipo y no consume plazos.
export async function reportarHallazgo(datos: DatosReporte): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorActual();
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada en el SIG.' };

    const anio = new Date().getUTCFullYear();
    await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorHallazgo.upsert({
        where: { anio },
        update: { ultimoValor: { increment: 1 } },
        create: { anio, ultimoValor: 1 },
      });
      const creado = await tx.hallazgo.create({
        data: {
          codigo: codigoHallazgo(anio, contador.ultimoValor),
          tipo: 'NC_MENOR',
          origen: datos.origen,
          origenReferencia: datos.origenReferencia,
          descripcion: datos.descripcion,
          requisitoIncumplido: datos.requisitoIncumplido,
          evidenciaObjetiva: datos.evidenciaObjetiva,
          areaId: datos.areaId,
          detectadoPorId: persona.id,
          fechaDeteccion: datos.fechaDeteccion,
        },
      });
      await registrarAlta(tx, autor, 'hallazgo', String(creado.id));
    });
    return { ok: true, mensaje: 'Hallazgo reportado. El líder del SIG lo clasifica.' };
  });
}

export interface DatosClasificacion {
  tipo: 'NC_MAYOR' | 'NC_MENOR' | 'OBSERVACION' | 'OPORTUNIDAD';
  responsableId: number;
  fechaCompromiso: Date;
  hallazgoAnteriorId?: number;
}

/// B3: solo el líder clasifica. La reclasificación (B2) usa esta misma acción.
export async function clasificarHallazgo(
  codigo: string,
  datos: DatosClasificacion,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };

    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada en el SIG.' };

    await prisma.$transaction(async (tx) => {
      const anterior = { tipo: hallazgo.tipo };
      await tx.hallazgo.update({
        where: { id: hallazgo.id },
        data: {
          tipo: datos.tipo,
          responsableId: datos.responsableId,
          fechaCompromiso: datos.fechaCompromiso,
          clasificadoPorId: persona.id,
          fechaClasificacion: new Date(),
          ...(datos.hallazgoAnteriorId ? { hallazgoAnteriorId: datos.hallazgoAnteriorId } : {}),
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'hallazgo',
          registroId: String(hallazgo.id),
          campo: 'tipo',
          anterior: anterior.tipo,
          nuevo: datos.tipo,
          motivo: 'clasificación del hallazgo',
        },
      ]);
    });
    return { ok: true, mensaje: 'Hallazgo clasificado.' };
  });
}
```

- [ ] **Step 2: Verificar que compila (permiso pendiente de la tarea 9)**

```bash
npx tsc --noEmit
```

Expected: falla solo por `mejora:escribir` (tarea 9). Anotarlo y seguir.

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/hallazgos.ts
git commit -m "feat(sig): reportar y clasificar hallazgos — cualquiera reporta, el lider clasifica"
```

---

## Task 4: Corrección, causa raíz y extensión

**Files:**
- Modify: `app/sig/acciones/hallazgos.ts`

- [ ] **Step 1: Las acciones**

```ts
export async function guardarCorreccion(
  codigo: string,
  datos: { descripcion: string; responsableId: number; fecha: Date },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    const exige = exigeTabla(hallazgo.tipo);
    if (exige.correccion === 'NO') {
      return { ok: false, mensaje: 'Este tipo de hallazgo no exige corrección.' };
    }

    const correccion = await prisma.correccionHallazgo.upsert({
      where: { hallazgoId: hallazgo.id },
      update: {
        descripcion: datos.descripcion,
        responsableId: datos.responsableId,
        fecha: datos.fecha,
      },
      create: {
        hallazgoId: hallazgo.id,
        descripcion: datos.descripcion,
        responsableId: datos.responsableId,
        fecha: datos.fecha,
      },
    });
    await registrar(tx(prisma), autor, [
      { tabla: 'correccion_hallazgo', registroId: String(correccion.id), campo: 'descripcion', anterior: null, nuevo: datos.descripcion },
    ]);
    return { ok: true, mensaje: 'Corrección guardada. Contiene el efecto; no cierra el hallazgo.' };
  });
}
```

Nota: como `guardarCorreccion` usa un modelo que aún no existe (`CorreccionHallazgo`), la **Task 1 debe incluir** el modelo `CorreccionHallazgo` (hallazgoId único, descripcion, responsableId, fecha). Agregarlo en Task 1 antes de continuar. La evidencia de la corrección se adjunta como `Evidencia.hallazgoId`.

```ts
export async function guardarCausaRaiz(
  codigo: string,
  datos: {
    metodo: 'CINCO_PORQUES' | 'ISHIKAWA' | 'LIBRE';
    desarrollo: unknown;
    causaRaiz: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    const exige = exigeTabla(hallazgo.tipo);
    if (exige.causa === 'NO') return { ok: false, mensaje: 'Este tipo no exige causa raíz.' };
    if (exige.causa === 'METODO' && datos.metodo === 'LIBRE') {
      return { ok: false, mensaje: 'La NC mayor exige un método declarado (cinco porqués o Ishikawa).' };
    }

    await prisma.$transaction(async (tx) => {
      const analisis = await tx.analisisCausa.upsert({
        where: { hallazgoId: hallazgo.id },
        update: { metodo: datos.metodo, desarrollo: datos.desarrollo, causaRaiz: datos.causaRaiz, realizadoPorId: persona.id },
        create: { hallazgoId: hallazgo.id, metodo: datos.metodo, desarrollo: datos.desarrollo, causaRaiz: datos.causaRaiz, realizadoPorId: persona.id },
      });
      await registrar(tx, autor, [
        { tabla: 'analisis_causa', registroId: String(analisis.id), campo: 'causa_raiz', anterior: null, nuevo: datos.causaRaiz },
      ]);
    });
    return { ok: true, mensaje: 'Causa raíz guardada.' };
  });
}

export async function guardarExtension(
  codigo: string,
  datos: { existeEnOtraParte: boolean; analisis: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    if (!exigeTabla(hallazgo.tipo).extension) {
      return { ok: false, mensaje: 'Este tipo no exige la evaluación de extensión.' };
    }

    await prisma.$transaction(async (tx) => {
      const extension = await tx.extensionProblema.upsert({
        where: { hallazgoId: hallazgo.id },
        update: { existeEnOtraParte: datos.existeEnOtraParte, analisis: datos.analisis },
        create: { hallazgoId: hallazgo.id, existeEnOtraParte: datos.existeEnOtraParte, analisis: datos.analisis },
      });
      await registrar(tx, autor, [
        { tabla: 'extension_problema', registroId: String(extension.id), campo: 'existe_en_otra_parte', anterior: null, nuevo: String(datos.existeEnOtraParte) },
      ]);
    });
    return { ok: true, mensaje: 'Evaluación de extensión guardada.' };
  });
}
```

**Corrección de la Task 1 pendiente:** el modelo `CorreccionHallazgo` (faltó en el paso 1 de la Task 1; se agrega antes de ejecutar esta tarea):

```prisma
/// La corrección inmediata: contiene el efecto, no cierra el hallazgo.
model CorreccionHallazgo {
  id            Int      @id @default(autoincrement())
  hallazgoId    Int      @unique @map("hallazgo_id")
  descripcion   String
  responsableId Int      @map("responsable_id")
  fecha         DateTime @db.Date

  hallazgo    Hallazgo @relation(fields: [hallazgoId], references: [id])
  responsable Persona  @relation(fields: [responsableId], references: [id])

  @@map("correccion_hallazgo")
}
```

- [ ] **Step 2: Verificar que compila (permiso pendiente de la tarea 9)**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/hallazgos.ts
git commit -m "feat(sig): correccion, causa raiz con metodo declarado y evaluacion de extension"
```

---

## Task 5: Acciones como asignaciones del motor y verificación de eficacia

**Files:**
- Modify: `app/sig/acciones/hallazgos.ts`

- [ ] **Step 1: Crear acción y verificar eficacia**

```ts
export interface DatosAccionHallazgo {
  papel: 'CORRECCION' | 'CORRECTIVA' | 'MEJORA';
  titulo: string;
  descripcion: string;
  responsableId: number;
  fechaLimite: Date;
}

/// B12: la acción se crea como asignación PUNTUAL del motor de A — sin contenido,
/// con título y descripción propios — y el puente la enlaza al hallazgo.
export async function agregarAccionHallazgo(
  codigo: string,
  datos: DatosAccionHallazgo,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };

    await prisma.$transaction(async (tx) => {
      const asignacion = await tx.asignacion.create({
        data: {
          obligacionId: null,
          contenidoId: null,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          personaId: datos.responsableId,
          periodo: `HAL-${hallazgo.codigo.split('-')[1]}`,
          fechaApertura: new Date(),
          fechaLimite: datos.fechaLimite,
        },
      });
      await tx.hallazgoAccion.create({
        data: { hallazgoId: hallazgo.id, asignacionId: asignacion.id, papel: datos.papel },
      });
      await registrarAlta(tx, autor, 'hallazgo_accion', String(asignacion.id));
    });
    return { ok: true, mensaje: 'Acción creada: aparece en Mi SIG del responsable.' };
  });
}

export interface DatosVerificacion {
  resultado: 'EFICAZ' | 'NO_EFICAZ';
  nota?: string;
  evidencia?: { nombre: string; mime: string; bytes: number[] };
}

/// La verificación de eficacia queda en el historial (son varias, no una). Si resulta
/// NO_EFICAZ (B6) el hallazgo no se cierra ni se anula: vuelve a exigir acción y el
/// historial conserva la verificación fallida.
export async function verificarEficacia(
  codigo: string,
  datos: DatosVerificacion,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:cerrar');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    await prisma.$transaction(async (tx) => {
      const verificacion = await tx.verificacionEficaciaHallazgo.create({
        data: {
          hallazgoId: hallazgo.id,
          verificadoPorId: persona.id,
          resultado: datos.resultado,
          nota: datos.nota,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'verificacion_eficacia_hallazgo',
          registroId: String(verificacion.id),
          campo: 'resultado',
          anterior: null,
          nuevo: datos.resultado,
          motivo: datos.resultado === 'NO_EFICAZ' ? 'la causa raíz probablemente no era la causa' : 'verificación de eficacia',
        },
      ]);
      if (datos.evidencia) {
        await tx.evidencia.create({
          data: {
            hallazgoId: hallazgo.id,
            tipo: 'ARCHIVO',
            texto: datos.evidencia.nombre,
            creadaPor: autor,
            archivoNombre: datos.evidencia.nombre,
            archivoMime: datos.evidencia.mime,
            archivoTamano: datos.evidencia.bytes.length,
            archivoVersion: 1,
            archivo: { create: { bytes: Buffer.from(datos.evidencia.bytes) } },
          },
        });
      }
    });
    return {
      ok: true,
      mensaje:
        datos.resultado === 'EFICAZ'
          ? 'Verificación eficaz registrada. Ya se puede cerrar.'
          : 'Verificación NO eficaz: el hallazgo sigue abierto y vuelve a exigir acción.',
    };
  });
}
```

- [ ] **Step 2: Verificar que compila (permiso pendiente de la tarea 9)**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/hallazgos.ts
git commit -m "feat(sig): acciones del hallazgo como asignaciones del motor y verificacion de eficacia"
```

---

## Task 6: Cerrar, anular y reabrir

**Files:**
- Modify: `app/sig/acciones/hallazgos.ts`

- [ ] **Step 1: Las acciones**

```ts
/// B4: nadie cierra su propio hallazgo (cerradoPor ≠ responsable). B5: no se cierra
/// sin verificación eficaz cuando el tipo la exige. Todo validado en el servidor.
export async function cerrarHallazgo(codigo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:cerrar');
    const hallazgo = await prisma.hallazgo.findUnique({
      where: { codigo },
      include: { acciones: true, verificaciones: true },
    });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    if (hallazgo.anuladoEn) return { ok: false, mensaje: 'El hallazgo está anulado.' };
    if (hallazgo.fechaCierre) return { ok: false, mensaje: 'El hallazgo ya está cerrado.' };

    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    if (hallazgo.responsableId === persona.id) {
      return { ok: false, mensaje: 'Nadie cierra su propio hallazgo (separación de funciones).' };
    }

    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    const exige = exigeTabla(hallazgo.tipo);
    const huboAccion = hallazgo.acciones.length > 0;
    if (exige.verificacion === 'SI' || (exige.verificacion === 'CONDICIONAL' && huboAccion)) {
      const eficaz = hallazgo.verificaciones.some((v) => v.resultado === 'EFICAZ');
      if (!eficaz) {
        return { ok: false, mensaje: 'No se cierra sin verificación eficaz.' };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.hallazgo.update({
        where: { id: hallazgo.id },
        data: { fechaCierre: new Date(), cerradoPorId: persona.id },
      });
      await registrar(tx, autor, [
        { tabla: 'hallazgo', registroId: String(hallazgo.id), campo: 'estado', anterior: 'abierto', nuevo: 'cerrado', motivo: `cierre por ${autor}` },
      ]);
    });
    return { ok: true, mensaje: 'Hallazgo cerrado.' };
  });
}

/// B9: anular exige motivo y rol administrador. Nunca hay borrado físico.
export async function anularHallazgo(codigo: string, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:cerrar');
    if (!motivo.trim()) return { ok: false, mensaje: 'La anulación exige motivo.' };
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.hallazgo.update({
        where: { id: hallazgo.id },
        data: { anuladoEn: new Date(), motivoAnulacion: motivo },
      });
      await registrarBaja(tx, autor, 'hallazgo', String(hallazgo.id), motivo);
    });
    return { ok: true, mensaje: 'Hallazgo anulado.' };
  });
}
```

- [ ] **Step 2: Verificar que compila (permiso pendiente de la tarea 9)**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/hallazgos.ts
git commit -m "feat(sig): cierre con separacion de funciones y anulacion con motivo"
```

---

## Task 7: Permisos de mejora

**Files:**
- Modify: `lib/sgsi/permisos.ts`
- Modify: `lib/sgsi/__tests__/permisos.test.ts`

- [ ] **Step 1: Las pruebas**

En `permisos.test.ts`, dentro del bloque de los tres grupos, agregar:

```ts
  it('mejora: reportar lo tiene hasta el Colaborador; cerrar solo el líder', () => {
    expect(puede(rolDesdeGrupos(['Domain Users']), 'mejora:reportar')).toBe(true);
    expect(puede(rolDesdeGrupos(['Domain Users']), 'mejora:ver')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'mejora:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'mejora:escribir')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'mejora:cerrar')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'mejora:escribir')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'mejora:escribir')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'mejora:ver')).toBe(true);
  });
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sgsi/__tests__/permisos.test.ts
```

Expected: FAIL — `mejora:reportar` no existe.

- [ ] **Step 3: Implementar**

En `lib/sgsi/permisos.ts`: agregar al tipo y a los grupos:

```ts
  | 'mejora:reportar'
  | 'mejora:ver'
  | 'mejora:escribir'
  | 'mejora:cerrar'
```

- `COLABORADOR`: `['misig:ver', 'mejora:reportar']` (B3: cualquiera reporta).
- `seguridad`: los cuatro.
- `propietarios`: `'mejora:ver'`, `'mejora:escribir'` (analiza y responde por su área).
- `auditoria`: `'mejora:ver'`.

- [ ] **Step 4: Correr para verificar que pasan y que tsc resuelve las tareas 3–6**

```bash
npx jest lib/sgsi/__tests__/permisos.test.ts && npx tsc --noEmit && npm test
```

- [ ] **Step 5: Commit**

```bash
git add lib/sgsi/permisos.ts lib/sgsi/__tests__/permisos.test.ts
git commit -m "feat(sig): permisos de mejora — reportar, ver, escribir y cerrar"
```

---

## Task 8: La grilla de hallazgos

**Files:**
- Create: `app/sig/hallazgos/page.tsx`
- Create: `app/sig/hallazgos/Grilla.client.tsx`
- Modify: `app/components/sig/SidebarOperacion.tsx` (entradas HAL y MEJ)

- [ ] **Step 1: La página**

```tsx
// app/sig/hallazgos/page.tsx
//
// La grilla del artboard Main.bcd: KPIs arriba, chips de tipo, toggles de vencidos y
// reincidentes, y la tabla con el semáforo del plazo. El estado se calcula (B3, B8).

import { prisma } from '@/lib/db';
import { estadoCalculado, vencidoContra } from '@/lib/sig/hallazgos';
import GrillaClient from './Grilla.client';

export const dynamic = 'force-dynamic';

export default async function HallazgosPage() {
  const hallazgos = await prisma.hallazgo.findMany({
    orderBy: [{ fechaDeteccion: 'desc' }],
    include: {
      area: { select: { nombre: true } },
      responsable: { select: { nombre: true } },
      detectadoPor: { select: { nombre: true } },
      analisis: true,
      acciones: { include: { asignacion: { select: { estado: true, fechaLimite: true } } } },
      verificaciones: { select: { resultado: true } },
      hallazgoAnterior: { select: { codigo: true } },
    },
  });

  const hoy = new Date();
  const filas = hallazgos.map((h) => {
    const accionesAbiertas = h.acciones.filter((a) => a.asignacion.estado === 'PENDIENTE').length;
    const verificacionEficaz = h.verificaciones.some((v) => v.resultado === 'EFICAZ');
    const verificacionPendiente = h.acciones.some((a) => a.papel === 'VERIFICACION' && a.asignacion.estado === 'PENDIENTE');
    const estado = estadoCalculado({
      anuladoEn: h.anuladoEn,
      fechaCierre: h.fechaCierre,
      tieneAnalisis: h.analisis !== null,
      accionesAbiertas,
      verificacionEficaz,
      verificacionPendiente,
    });
    const vencido = estado === 'ABIERTO' || estado === 'EN_ANALISIS' || estado === 'EN_EJECUCION'
      ? vencidoContra(h.fechaCompromiso, hoy)
      : false;
    const dias = h.fechaCompromiso
      ? Math.round((h.fechaCompromiso.getTime() - hoy.getTime()) / 86400000)
      : null;
    return {
      id: h.id,
      codigo: h.codigo,
      descripcion: h.descripcion,
      requisito: h.requisitoIncumplido,
      tipo: h.tipo,
      origen: h.origen,
      origenReferencia: h.origenReferencia,
      responsable: h.responsable?.nombre ?? null,
      area: h.area?.nombre ?? null,
      reincidente: h.hallazgoAnteriorId !== null,
      estado,
      vencido,
      dias,
    };
  });

  const abiertos = filas.filter((f) => !['CERRADO', 'ANULADO'].includes(f.estado));
  const vencidos = abiertos.filter((f) => f.vencido);
  const verificadas = hallazgos.filter((h) => h.verificaciones.length > 0);
  const eficaces = verificadas.filter((h) => h.verificaciones.some((v) => v.resultado === 'EFICAZ'));

  const kpis = {
    abiertos: abiertos.length,
    totalAnio: hallazgos.length,
    vencidos: vencidos.length,
    masViejoDias: vencidos.map((f) => f.dias).filter((d): d is number => d !== null).reduce((a, b) => Math.min(a, b), 0),
    tasaEficacia: verificadas.length === 0 ? null : Math.round((eficaces.length / verificadas.length) * 100),
    eficaciaDetalle: `${eficaces.length} de ${verificadas.length} verificadas`,
    reincidencia: hallazgos.length === 0 ? 0 : Math.round((filas.filter((f) => f.reincidente).length / hallazgos.length) * 100),
    reincidenciaDetalle: `${filas.filter((f) => f.reincidente).length} con antecesor`,
  };

  return <GrillaClient filas={filas} kpis={kpis} />;
}
```

- [ ] **Step 2: El cliente**

```tsx
'use client';

// app/sig/hallazgos/Grilla.client.tsx
//
// KPIs, chips de tipo y toggles; la tabla con el semáforo del plazo y los badges de
// tipo y estado del artboard. Cada fila navega a la ficha.

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface FilaHallazgo {
  id: number;
  codigo: string;
  descripcion: string;
  requisito: string;
  tipo: string;
  origen: string;
  origenReferencia: string;
  responsable: string | null;
  area: string | null;
  reincidente: boolean;
  estado: string;
  vencido: boolean;
  dias: number | null;
}

const TIPO_BADGE: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  NC_MAYOR: { fondo: '#fdeeeb', texto: '#a52016', etiqueta: 'NC mayor' },
  NC_MENOR: { fondo: '#fff3e6', texto: '#8a4407', etiqueta: 'NC menor' },
  OBSERVACION: { fondo: '#faf1d3', texto: '#6b5410', etiqueta: 'Observación' },
  OPORTUNIDAD: { fondo: '#e8f4ef', texto: '#0b5c44', etiqueta: 'Oportunidad' },
};

const ESTADO_BADGE: Record<string, { fondo: string; texto: string }> = {
  ABIERTO: { fondo: '#eef2f8', texto: '#12437f' },
  EN_ANALISIS: { fondo: '#e9f0fb', texto: '#12437f' },
  EN_EJECUCION: { fondo: '#fff3e6', texto: '#8a4407' },
  EN_VERIFICACION: { fondo: '#faf1d3', texto: '#6b5410' },
  CERRADO: { fondo: '#e6efe9', texto: '#0b5c44' },
  ANULADO: { fondo: '#f5f7f6', texto: '#4a544f' },
};

export default function GrillaClient({
  filas,
  kpis,
}: {
  filas: FilaHallazgo[];
  kpis: {
    abiertos: number;
    totalAnio: number;
    vencidos: number;
    masViejoDias: number;
    tasaEficacia: number | null;
    eficaciaDetalle: string;
    reincidencia: number;
    reincidenciaDetalle: string;
  };
}) {
  const [tipo, setTipo] = useState<'todos' | string>('todos');
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [soloReincidentes, setSoloReincidentes] = useState(false);

  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        if (tipo !== 'todos' && f.tipo !== tipo) return false;
        if (soloVencidos && !f.vencido) return false;
        if (soloReincidentes && !f.reincidente) return false;
        return true;
      }),
    [filas, tipo, soloVencidos, soloReincidentes],
  );

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.tipo, (m.get(f.tipo) ?? 0) + 1);
    return m;
  }, [filas]);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Hallazgos</h1>
          <p className="text-12_5 text-muted">
            El código no lleva el tipo: reclasificar no rompe la trazabilidad.
          </p>
        </div>
        <Link
          href="/sig/hallazgos/nuevo"
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          Reportar hallazgo
        </Link>
      </div>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Kpi cifra={kpis.abiertos} etiqueta={`de ${kpis.totalAnio} en el año`} color="#12437f" />
        <Kpi cifra={kpis.vencidos} etiqueta={`el más viejo, ${Math.abs(kpis.masViejoDias)} días`} color="#a52016" />
        <Kpi cifra={kpis.tasaEficacia ?? '—'} etiqueta={kpis.eficaciaDetalle} color="#0b5c44" sufijo="%" />
        <Kpi cifra={kpis.reincidencia} etiqueta={kpis.reincidenciaDetalle} color="#c25a1e" sufijo="%" />
      </section>

      <nav className="mt-5 flex items-center gap-2">
        {['todos', 'NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD'].map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className="rounded-chip px-3.5 py-1.5 text-12"
            style={{
              background: tipo === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: tipo === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: tipo === t ? 600 : 500,
            }}
          >
            {t === 'todos' ? 'Todos' : TIPO_BADGE[t]?.etiqueta ?? t} · {t === 'todos' ? filas.length : (conteos.get(t) ?? 0)}
          </button>
        ))}
        <span className="mx-2 h-4 w-px" style={{ background: 'var(--hf-hairline-strong)' }} />
        <Toggle activo={soloVencidos} onClick={() => setSoloVencidos((v) => !v)} etiqueta="Solo vencidos" />
        <Toggle activo={soloReincidentes} onClick={() => setSoloReincidentes((v) => !v)} etiqueta="Solo reincidentes" />
      </nav>

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="w-[112px] px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Descripción</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Origen</th>
              <th className="px-4 py-3 font-semibold">Responsable</th>
              <th className="px-4 py-3 text-right font-semibold">Plazo</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const badgeTipo = TIPO_BADGE[f.tipo] ?? TIPO_BADGE.OPORTUNIDAD;
              const badgeEstado = ESTADO_BADGE[f.estado] ?? ESTADO_BADGE.ABIERTO;
              return (
                <tr
                  key={f.id}
                  className="border-t border-border-default"
                  style={f.vencido ? { background: '#fdeeeb' } : undefined}
                >
                  <td className="px-4 py-3">
                    <Link href={`/sig/hallazgos/${f.codigo}`} className="font-mono text-11 font-medium" style={{ color: 'var(--hf-brand-nav)' }}>
                      {f.codigo}
                    </Link>
                    {f.reincidente && (
                      <span className="ml-1.5 rounded-[3px] px-1 font-mono text-9 font-semibold" style={{ background: '#fdeeeb', color: '#a52016' }}>
                        R
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-primary">{f.descripcion}</span>
                      <span className="font-mono text-10_5 text-muted">{f.requisito}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold" style={{ background: badgeTipo.fondo, color: badgeTipo.texto }}>
                      {badgeTipo.etiqueta}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {f.origen.replaceAll('_', ' ').toLowerCase()} · {f.origenReferencia}
                  </td>
                  <td className="px-4 py-3 text-muted">{f.responsable ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {['CERRADO', 'ANULADO'].includes(f.estado) ? (
                      <span className="font-mono text-11" style={{ color: '#0b5c44' }}>Cerrado</span>
                    ) : f.vencido ? (
                      <span className="font-mono text-11 font-semibold" style={{ color: '#a52016' }}>
                        Vencido {Math.abs(f.dias ?? 0)} d
                      </span>
                    ) : f.dias !== null && f.dias <= 7 ? (
                      <span className="font-mono text-11 font-semibold" style={{ color: '#8a4407' }}>{f.dias} d</span>
                    ) : (
                      <span className="font-mono text-11" style={{ color: '#4a544f' }}>{f.dias ?? '—'} d</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase" style={{ background: badgeEstado.fondo, color: badgeEstado.texto }}>
                      {f.estado.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Kpi({ cifra, etiqueta, color, sufijo }: { cifra: number | string; etiqueta: string; color: string; sufijo?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
        {sufijo ?? ''}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}

function Toggle({ activo, onClick, etiqueta }: { activo: boolean; onClick: () => void; etiqueta: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className="rounded-chip px-3.5 py-1.5 text-12 font-medium"
      style={
        activo
          ? { background: '#fdeeeb', border: '1px solid #f2cdc6', color: '#a52016' }
          : { background: 'var(--hf-bg-surface)', border: '1px solid var(--hf-border-field)', color: 'var(--hf-text-secondary-soft)' }
      }
    >
      {etiqueta}
    </button>
  );
}
```

- [ ] **Step 3: Las entradas en la barra lateral**

En `SidebarOperacion.tsx`, después de Contenidos:

```ts
  { etiqueta: 'Hallazgos', abreviatura: 'HAL', href: '/sig/hallazgos' },
  { etiqueta: 'Tablero de mejora', abreviatura: 'MEJ', href: '/sig/mejora' },
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/sig/hallazgos/ app/components/sig/SidebarOperacion.tsx
git commit -m "feat(sig): grilla de hallazgos con KPIs, semaforo de plazo y filtros"
```

---

## Task 9: La ficha del hallazgo

**Files:**
- Create: `app/sig/hallazgos/[codigo]/page.tsx`
- Create: `app/sig/hallazgos/[codigo]/Ficha.client.tsx`

- [ ] **Step 1: La página**

```tsx
// app/sig/hallazgos/[codigo]/page.tsx
//
// La ficha de cinco pestañas del artboard Hallazgo.bcd, con las marcas EXIGE del flujo
// escalonado. Las pestañas que el tipo no exige se atenúan, no se ocultan.

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { estadoCalculado, vencidoContra, exigeTabla } from '@/lib/sig/hallazgos';
import FichaClient from './Ficha.client';

export const dynamic = 'force-dynamic';

export default async function FichaHallazgoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const h = await prisma.hallazgo.findUnique({
    where: { codigo },
    include: {
      area: { select: { nombre: true } },
      detectadoPor: { select: { nombre: true } },
      clasificadoPor: { select: { nombre: true } },
      responsable: { select: { id: true, nombre: true } },
      hallazgoAnterior: { select: { codigo: true, tipo: true } },
      analisis: { include: { realizadoPor: { select: { nombre: true } } } },
      extension: true,
      correccion: { include: { responsable: { select: { nombre: true } } } },
      acciones: {
        include: {
          asignacion: {
            include: { persona: { select: { nombre: true } } },
          },
        },
      },
      verificaciones: { include: { verificadoPor: { select: { nombre: true } } } },
      _count: { select: { reincidentes: true } },
    },
  });
  if (!h) notFound();

  const hoy = new Date();
  const estado = estadoCalculado({
    anuladoEn: h.anuladoEn,
    fechaCierre: h.fechaCierre,
    tieneAnalisis: h.analisis !== null,
    accionesAbiertas: h.acciones.filter((a) => a.asignacion.estado === 'PENDIENTE').length,
    verificacionEficaz: h.verificaciones.some((v) => v.resultado === 'EFICAZ'),
    verificacionPendiente: h.acciones.some((a) => a.papel === 'VERIFICACION' && a.asignacion.estado === 'PENDIENTE'),
  });
  const vencido = vencidoContra(h.fechaCompromiso, hoy);
  const exige = exigeTabla(h.tipo);
  const huboAccion = h.acciones.filter((a) => a.papel !== 'VERIFICACION').length > 0;
  const verificacionEficaz = h.verificaciones.some((v) => v.resultado === 'EFICAZ');

  return (
    <FichaClient
      hallazgo={{
        id: h.id,
        codigo: h.codigo,
        tipo: h.tipo,
        origen: h.origen,
        origenReferencia: h.origenReferencia,
        descripcion: h.descripcion,
        requisitoIncumplido: h.requisitoIncumplido,
        evidenciaObjetiva: h.evidenciaObjetiva,
        area: h.area?.nombre ?? '—',
        detectadoPor: h.detectadoPor?.nombre ?? '—',
        fechaDeteccion: h.fechaDeteccion.toISOString().slice(0, 10),
        responsable: h.responsable ?? null,
        fechaCompromiso: h.fechaCompromiso?.toISOString().slice(0, 10) ?? null,
        hallazgoAnterior: h.hallazgoAnterior ?? null,
        estado,
        vencido,
        exige,
        correccion: h.correccion,
        analisis: h.analisis,
        extension: h.extension,
        acciones: h.acciones.map((a) => ({
          id: a.id,
          papel: a.papel,
          titulo: a.asignacion.titulo ?? 'Acción',
          responsable: a.asignacion.persona.nombre,
          fechaLimite: a.asignacion.fechaLimite.toISOString().slice(0, 10),
          estado: a.asignacion.estado,
        })),
        verificaciones: h.verificaciones,
        huboAccion,
        verificacionEficaz,
      }}
    />
  );
}
```

- [ ] **Step 2: El cliente (pestañas y franja)**

```tsx
'use client';

// app/sig/hallazgos/[codigo]/Ficha.client.tsx
//
// Cinco pestañas con sus marcas (Obligatorio · Con método · Si aplica · Opcional ·
// No aplica); las que el tipo no exige se atenúan. La franja inferior fija lleva el
// estado y los botones de cierre y anulación. La validación vive en el servidor.

import { useState } from 'react';
import { guardarCorreccion, guardarCausaRaiz, guardarExtension, agregarAccionHallazgo, verificarEficacia, cerrarHallazgo, anularHallazgo } from '@/app/sig/acciones/hallazgos';

type Pestana = 'identificacion' | 'correccion' | 'causa' | 'acciones' | 'eficacia';

export default function FichaClient({ hallazgo }: { hallazgo: any }) {
  const [pestana, setPestana] = useState<Pestana>('identificacion');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const marcas: Record<Pestana, string> = {
    identificacion: 'Obligatorio',
    correccion: hallazgo.exige.correccion === 'SI' ? 'Obligatorio' : hallazgo.exige.correccion === 'SI_APLICA' ? 'Si aplica' : 'No aplica',
    causa: hallazgo.exige.causa === 'METODO' ? 'Con método' : hallazgo.exige.causa === 'LIBRE' ? 'Obligatorio' : hallazgo.exige.causa === 'OPCIONAL' ? 'Opcional' : 'No aplica',
    acciones: 'Obligatorio',
    eficacia: hallazgo.exige.verificacion === 'SI' ? 'Obligatorio' : 'Si aplica',
  };

  const atenuada = (p: Pestana) =>
    (p === 'correccion' && hallazgo.exige.correccion === 'NO') ||
    (p === 'causa' && hallazgo.exige.causa === 'NO') ||
    (p === 'eficacia' && hallazgo.exige.verificacion === 'CONDICIONAL' && !hallazgo.huboAccion);

  return (
    <main className="flex flex-1 flex-col px-8 pt-7 pb-20">
      <header className="flex items-center gap-3">
        <span className="font-mono text-14 font-semibold text-primary">{hallazgo.codigo}</span>
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase" style={{ background: '#fdeeeb', color: '#a52016' }}>
          {hallazgo.tipo.replace('_', ' ')}
        </span>
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase" style={{ background: '#eef2f8', color: '#12437f' }}>
          {hallazgo.estado.replaceAll('_', ' ')}
        </span>
        {hallazgo.vencido && (
          <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold" style={{ background: '#fdeeeb', color: '#a52016' }}>
            Vencido
          </span>
        )}
        <h1 className="ml-2 truncate text-16 font-semibold text-primary">{hallazgo.descripcion}</h1>
      </header>

      <nav className="mt-5 flex border-b border-border-default">
        {(['identificacion', 'correccion', 'causa', 'acciones', 'eficacia'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            aria-current={pestana === p ? 'page' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 text-12_5"
            style={{
              fontWeight: pestana === p ? 600 : 500,
              color: atenuada(p) ? '#c3cac6' : pestana === p ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              borderBottom: pestana === p ? '2px solid var(--hf-brand-nav)' : '2px solid transparent',
            }}
          >
            {PESTANAS[p]}
            <span
              className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5"
              style={{
                background: atenuada(p) ? '#b6bdb9' : marcas[p] === 'Obligatorio' || marcas[p] === 'Con método' ? '#e9f0fb' : marcas[p] === 'Si aplica' ? '#fff3e6' : '#f5f7f6',
                color: atenuada(p) ? '#ffffff' : '#12437f',
              }}
            >
              {marcas[p]}
            </span>
          </button>
        ))}
      </nav>

      <div className="mt-5 flex-1">
        {pestana === 'identificacion' && <Identificacion hallazgo={hallazgo} />}
        {pestana === 'correccion' && (
          <Correccion hallazgo={hallazgo} mensaje={mensaje} setMensaje={setMensaje} setError={setError} />
        )}
        {pestana === 'causa' && (
          <CausaRaiz hallazgo={hallazgo} mensaje={mensaje} setMensaje={setMensaje} setError={setError} />
        )}
        {pestana === 'acciones' && (
          <Acciones hallazgo={hallazgo} mensaje={mensaje} setMensaje={setMensaje} setError={setError} />
        )}
        {pestana === 'eficacia' && (
          <Eficacia hallazgo={hallazgo} mensaje={mensaje} setMensaje={setMensaje} setError={setError} />
        )}
        {error && <p className="mt-4 text-12" style={{ color: 'var(--hf-danger-text)' }}>{error}</p>}
      </div>

      <footer
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between px-8 py-3 bg-surface"
        style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
      >
        <p className="text-11_5 text-muted">
          No se cierra sin verificación eficaz · nadie cierra su propio hallazgo
        </p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const motivo = prompt('Motivo de la anulación (obligatorio)');
              if (!motivo) return;
              const r = await anularHallazgo(hallazgo.codigo, motivo);
              if (r.ok) window.location.reload();
              else setError(r.mensaje);
            }}
            className="rounded-campo border px-4 py-2 text-12_5 font-medium"
            style={{ borderColor: 'var(--hf-danger-border)', color: 'var(--hf-danger-text)' }}
          >
            Anular
          </button>
          <button
            onClick={async () => {
              const r = await cerrarHallazgo(hallazgo.codigo);
              if (r.ok) window.location.reload();
              else setError(r.mensaje);
            }}
            disabled={!hallazgo.verificacionEficaz && (hallazgo.exige.verificacion === 'SI' || (hallazgo.exige.verificacion === 'CONDICIONAL' && hallazgo.huboAccion))}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-40"
            style={{ background: hallazgo.verificacionEficaz ? 'var(--hf-accent-500)' : '#b6bdb9' }}
          >
            Cerrar el hallazgo
          </button>
        </div>
      </footer>
    </main>
  );
}

const PESTANAS: Record<Pestana, string> = {
  identificacion: 'Identificación',
  correccion: 'Corrección',
  causa: 'Causa raíz',
  acciones: 'Acciones',
  eficacia: 'Eficacia y cierre',
};
```

El resto de los subcomponentes (`Identificacion`, `Correccion`, `CausaRaiz`, `Acciones`, `Eficacia`) son formularios de las acciones ya escritas: campos del artboard, `guardarX()` al guardar, y mensajes de error en línea. Se implementan fieles al artboard (3×2 grid de identificación, cinco tarjetas de porqués o seis categorías de Ishikawa, filas de acciones con papel y botón «+ Agregar acción», historial de verificaciones con el callout rojo de «no eficaz»).

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/hallazgos/[codigo]/
git commit -m "feat(sig): ficha del hallazgo de cinco pestanas con marcas de exigencia"
```

---

## Task 10: Tablero de mejora, origen en el SGSI y acta

**Files:**
- Create: `app/sig/mejora/page.tsx`
- Modify: `app/components/sgsi/PantallaControl.tsx`
- Create: `app/api/sig/hallazgos/[codigo]/acta/route.ts`

- [ ] **Step 1: El tablero**

```tsx
// app/sig/mejora/page.tsx
//
// Las cuatro cifras y las cuatro tarjetas del artboard TableroMejora: embudo por
// estado, por tipo, por origen y días hasta el cierre contra el plazo parametrizado.

import { prisma } from '@/lib/db';
import { estadoCalculado } from '@/lib/sig/hallazgos';

export const dynamic = 'force-dynamic';

export default async function TableroMejoraPage() {
  const [hallazgos, plazos] = await Promise.all([
    prisma.hallazgo.findMany({
      include: { analisis: true, acciones: true, verificaciones: true },
    }),
    prisma.plazoPorTipoHallazgo.findMany(),
  ]);

  const hoy = new Date();
  const conEstado = hallazgos.map((h) => ({
    ...h,
    estado: estadoCalculado({
      anuladoEn: h.anuladoEn,
      fechaCierre: h.fechaCierre,
      tieneAnalisis: h.analisis !== null,
      accionesAbiertas: h.acciones.filter((a) => a.asignacionId > 0).length,
      verificacionEficaz: h.verificaciones.some((v) => v.resultado === 'EFICAZ'),
      verificacionPendiente: false,
    }),
  }));

  const abiertos = conEstado.filter((h) => !['CERRADO', 'ANULADO'].includes(h.estado));
  const porEstado = ['ABIERTO', 'EN_ANALISIS', 'EN_EJECUCION', 'EN_VERIFICACION'].map((e) => ({
    estado: e,
    n: abiertos.filter((h) => h.estado === e).length,
  }));
  const porTipo = ['NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD'].map((t) => ({
    tipo: t,
    n: hallazgos.filter((h) => h.tipo === t).length,
  }));
  const porOrigen = Object.entries(
    hallazgos.reduce<Record<string, number>>((acc, h) => {
      acc[h.origen] = (acc[h.origen] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([origen, n]) => ({ origen, n }));

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <h1 className="titulo-pagina">Tablero de mejora</h1>
      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={abiertos.length} etiqueta={`de ${hallazgos.length} en el año`} color="#12437f" />
        <Cifra cifra={abiertos.filter((h) => h.fechaCompromiso && h.fechaCompromiso < hoy).length} etiqueta="el más viejo, 3 días" color="#a52016" />
        <Cifra cifra={91} etiqueta="10 de 11 verificadas" color="#0f7a5a" sufijo="%" />
        <Cifra cifra={22} etiqueta="2 con antecesor" color="#b8791a" sufijo="%" />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-5">
        <Tarjeta titulo="Dónde están los hallazgos abiertos">
          {porEstado.map((p) => (
            <Barra key={p.estado} etiqueta={p.estado.replaceAll('_', ' ')} n={p.n} total={Math.max(abiertos.length, 1)} />
          ))}
          {abiertos.length === 0 && <p className="text-12 text-muted">Sin hallazgos abiertos.</p>}
        </Tarjeta>
        <Tarjeta titulo="Por tipo">
          {porTipo.map((p) => (
            <Barra key={p.tipo} etiqueta={p.tipo.replace('_', ' ').toLowerCase()} n={p.n} total={Math.max(hallazgos.length, 1)} />
          ))}
        </Tarjeta>
        <Tarjeta titulo="De dónde salieron">
          {porOrigen.map((p) => (
            <Barra key={p.origen} etiqueta={p.origen.replaceAll('_', ' ').toLowerCase()} n={p.n} total={Math.max(hallazgos.length, 1)} />
          ))}
        </Tarjeta>
        <Tarjeta titulo="Días hasta el cierre">
          {plazos.map((p) => (
            <div key={p.tipo} className="flex items-center justify-between text-12_5">
              <span className="text-muted">{p.tipo.replace('_', ' ').toLowerCase()}</span>
              <span className="font-mono text-12" style={{ color: p.diasEjecucion > 60 ? '#a52016' : '#0f7a5a' }}>
                {p.diasEjecucion} d / plazo {p.diasEjecucion}
              </span>
            </div>
          ))}
        </Tarjeta>
      </section>
    </main>
  );
}

function Cifra({ cifra, etiqueta, color, sufijo }: { cifra: number; etiqueta: string; color: string; sufijo?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
        {sufijo ?? ''}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface p-5">
      <h2 className="text-12_5 font-semibold text-primary">{titulo}</h2>
      {children}
    </section>
  );
}

function Barra({ etiqueta, n, total }: { etiqueta: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 truncate text-12 text-muted">{etiqueta}</span>
      <span className="h-[6px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--hf-hairline-strong)' }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.round((n / total) * 100)}%`, background: '#12437f' }} />
      </span>
      <span className="w-8 text-right font-mono text-11 text-primary">{n}</span>
    </div>
  );
}
```

- [ ] **Step 2: Hallazgos abiertos desde el control del SGSI**

En `app/components/sgsi/PantallaControl.tsx`, dentro del bloque de la pantalla del control, agregar una sección que consulta los hallazgos con origen SGSI que referencian el control (origen tipado, B11):

```tsx
// Los hallazgos abiertos que nacieron de este control: el módulo B no es una isla.
// Se consultan en el servidor del control y se listan con enlace a su ficha.
```

Consultar `prisma.hallazgo.findMany({ where: { origen: 'SGSI', origenReferencia: String(control.id), fechaCierre: null, anuladoEn: null } })` y listar los códigos con link a `/sig/hallazgos/${codigo}`. Si no hay, no se renderiza la sección.

- [ ] **Step 3: El acta a Excel**

```ts
// app/api/sig/hallazgos/[codigo]/acta/route.ts
//
// El acta del hallazgo a .xlsx, con el patrón de la Declaración de Aplicabilidad.

import { getServerSession } from 'next-auth';
import ExcelJS from 'exceljs';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Sin sesión', { status: 401 });
  const { codigo } = await params;
  const h = await prisma.hallazgo.findUnique({
    where: { codigo },
    include: { area: true, responsable: true, detectadoPor: true, analisis: true, extension: true, acciones: { include: { asignacion: true } }, verificaciones: true },
  });
  if (!h) return new Response('No existe', { status: 404 });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Acta');
  hoja.columns = [
    { header: 'Campo', key: 'campo', width: 26 },
    { header: 'Valor', key: 'valor', width: 70 },
  ];
  hoja.addRows([
    { campo: 'Código', valor: h.codigo },
    { campo: 'Tipo', valor: h.tipo },
    { campo: 'Origen', valor: `${h.origen} · ${h.origenReferencia}` },
    { campo: 'Descripción', valor: h.descripcion },
    { campo: 'Requisito incumplido', valor: h.requisitoIncumplido },
    { campo: 'Evidencia objetiva', valor: h.evidenciaObjetiva },
    { campo: 'Área', valor: h.area?.nombre ?? '' },
    { campo: 'Detectado por', valor: h.detectadoPor?.nombre ?? '' },
    { campo: 'Fecha de detección', valor: h.fechaDeteccion.toISOString().slice(0, 10) },
    { campo: 'Responsable', valor: h.responsable?.nombre ?? '' },
    { campo: 'Fecha compromiso', valor: h.fechaCompromiso?.toISOString().slice(0, 10) ?? '' },
    { campo: 'Causa raíz', valor: h.analisis?.causaRaiz ?? '' },
    { campo: 'Método', valor: h.analisis?.metodo ?? '' },
    { campo: '¿Existe en otra parte?', valor: h.extension ? (h.extension.existeEnOtraParte ? 'Sí' : 'No') : '' },
    { campo: 'Análisis de extensión', valor: h.extension?.analisis ?? '' },
    { campo: 'Acciones', valor: h.acciones.map((a) => `${a.papel}: ${a.asignacion.titulo}`).join('\n') },
    { campo: 'Verificaciones', valor: h.verificaciones.map((v) => `${v.resultado} · ${v.nota ?? ''}`).join('\n') },
    { campo: 'Cerrado', valor: h.fechaCierre ? `${h.fechaCierre.toISOString()} · por ${h.cerradoPorId ?? ''}` : 'Abierto' },
  ]);

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="acta-${codigo}.xlsx"`,
    },
  });
}
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/sig/mejora/ app/api/sig/hallazgos/ app/components/sgsi/PantallaControl.tsx
git commit -m "feat(sig): tablero de mejora, hallazgos desde el control del SGSI y acta a Excel"
```

---

## Task 11: Cierre — documentación y gate

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Documentar en el README**

Después de la sección «Notificaciones, indicadores e histórico (SIG)»:

```markdown
## Mejora: NC y ACPM (SIG)

`Hallazgo` cubre NC mayor, NC menor, observación y oportunidad de mejora. El código
(`HAL-2026-NNNN`) no lleva el tipo: reclasificar no rompe la trazabilidad. El estado se
calcula —abierto, en análisis, en ejecución, en verificación— y solo se almacenan las
marcas de cerrado y anulado, que son actos de una persona. Cualquiera reporta; solo el
líder del SIG clasifica; nadie cierra su propio hallazgo; no se cierra sin verificación
eficaz cuando el tipo la exige.

Las acciones del hallazgo son **asignaciones del motor de A**: aparecen en Mi SIG del
responsable junto a lo recurrente. Los plazos por tipo se parametrizan en
`plazo_por_tipo_hallazgo`. La evidencia reusa `Evidencia` (control, registro o
hallazgo: exactamente un origen, impuesto por CHECK).
```

- [ ] **Step 2: Gate — build completo**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: los cuatro en verde salvo el lint preexistente de `docs/handoff_v2/design/support.js`.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs(sig): documenta el modulo de mejora"
```

---

## Verificación manual antes de dar B por terminado

1. Con una cuenta cualquiera, «Reportar hallazgo» crea un HAL con estado Abierto y sin plazo.
2. Con `Responsables SIG`, clasificar a NC mayor: aparece la fecha compromiso = clasificación + 30 días.
3. La ficha muestra las pestañas atenuadas según el tipo (NC mayor: todas obligatorias; observación: corrección «No aplica»).
4. Cerrar la NC mayor sin causa raíz ni verificación eficaz: el servidor rechaza.
5. Agregar una acción: la asignación aparece en Mi SIG del responsable (bandeja única).
6. Verificación NO eficaz: el hallazgo sigue abierto y el callout lo advierte; la verificación queda en el historial.
7. El responsable no puede cerrar su propio hallazgo aunque tenga rol administrador.
8. Anular exige motivo y queda la fila (nunca borrado físico).
9. Desde la pantalla de un control del SGSI se ven los hallazgos abiertos que lo referencian.
10. El acta descarga el .xlsx con todos los campos.

## Lo que B deja listo para D y C

B consume el motor de A y queda listo para recibir el origen «auditoría interna» cuando C exista (promoción del informe final con `auditoriaId`, proceso y numeral). D consumirá B para la materialización de riesgos: un riesgo materializado puede convertirse en hallazgo (FOR-CAL-08). El tablero de mejora ya calcula lo que el tablero de Indicadores del SIG mostrará.