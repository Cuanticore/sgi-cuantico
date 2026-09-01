# SIG · C — Auditorías internas · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cierra el paquete SIG: el programa anual (`FOR-CAL-04`), la ficha de auditoría con sus cuatro pestañas (Plan, Ejecución, Actas, Informe), el catálogo de numerales, las auditorías externas y a proveedores, y el tablero. Al emitir el informe final, cada NC y OM se promueve a hallazgo del módulo B.

**Architecture:** Mismo patrón: decisiones en un módulo **puro** (`lib/sig/auditorias.ts`) probado sin base; acciones en `app/sig/acciones/auditorias.ts`; pantallas bajo la sidebar de Operación (grupos TAREAS · MEJORA · AUDITORÍA · CONFIGURACIÓN, como la spec §4). El permiso del auditor es **por asignación** (`EquipoAuditor`), no un grupo de AD.

**Tech Stack:** Next.js 16 · TypeScript 5 · Prisma 7.9.1 · Jest 30 · exceljs · `America/Bogotá`.

**Diseño:** `docs/handoff_bcd/design/{Programa,Auditoria}.dc.html` · `docs/handoff_tableros/design/TableroAuditoria.dc.html` · `docs/handoff_cierre/design/{AuditoriasExternas,Normas}.dc.html` · spec REQ-SIG-05.

---

## Contexto: dónde encaja este plan

| Plan | Contenido |
|---|---|
| A1–A4 ✅, B ✅, D ✅ | Personas, motor, superficies, notificaciones, mejora, estratégico. |
| **C (este)** | Auditorías internas. Cierra el ciclo: al emitir el informe final promueve NC y OM a hallazgos de B. |

## Decisiones de diseño declaradas

1. **El «perfil auditor» que el paquete marcó como faltante está definido en la spec** (`PerfilAuditor` con aprobación del Consulting Director, regla C3): se implementa con el modelo y la aprobación la registra quien tiene `auditoria:administrar`. No bloquea implementar: C3 se valida en el servidor al asignar un auditor líder.
2. **El auditor es un permiso por asignación** (spec §6): las acciones de notas e informe verifican que la persona está en `EquipoAuditor` de esa auditoría (o tiene `auditoria:administrar`), además del permiso de grupo `auditoria:ejecutar`. Un grupo de AD no puede seguir el ritmo de los ciclos de auditoría.
3. **Los numerales de ISO/IEC 27001:2022 son los 13 de gestión** (4.1–10.2); los 93 controles del Anexo A ya viven en la base del SGSI y se auditan por su tabla, no se duplican (nota del artboard Normas). El catálogo de `RequisitoNorma` cubre ISO 9001 completo y los numerales de gestión de 27001.
4. **El filtro de Ejecución es solo por tipo** (el artboard no tiene proceso/numeral, contra la spec §4): el lienzo manda, mismo criterio que en A3 y B.
5. **Las notas promovibles son NC y OM** (C5); RM, Fortaleza y OK no promueven (C9). Los chips «Va a Mejora» aparecen solo cuando el informe es final.
6. **El tablero no navega a la grilla** (el artboard no lo dibuja).
7. **La sidebar de Operación se agrupa con separadores** (spec §4): TAREAS (OBL/CAL/TAR/CON) · MEJORA (HAL/MEJ) · AUDITORÍA (PRG/AUD) · CONFIGURACIÓN (PER/NRM). «Auditorías externas» vive dentro de la ficha de auditoría como pestaña de listado en `PRG`… no: la spec §4 la pone como pantalla propia; el artboard la dibuja con su propia lista+ficha. Se implementa como pantalla `/sig/auditorias/externas` con entrada propia en AUDITORÍA.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` (modificar) | Entidades de C. |
| `lib/sig/auditorias.ts` (crear) | **Puro.** Estado calculado, independencia, vencimiento, promoción. |
| `lib/sig/__tests__/auditorias.test.ts` (crear) | Pruebas. |
| `prisma/seeds/normas.ts` (crear) | Seed de normas y numerales. |
| `app/sig/acciones/auditorias.ts` (crear) | Programa, plan, notas, actas, informe, externas, perfiles. |
| `lib/sgsi/permisos.ts` (modificar) | `auditoria:ver`, `auditoria:ejecutar`, `auditoria:administrar`. |
| `app/sig/programa/page.tsx` (crear) | La grilla proceso × mes. |
| `app/sig/auditorias/[id]/page.tsx` (crear) | La ficha de cuatro pestañas. |
| `app/sig/auditorias/externas/page.tsx` (crear) | Registro de externas y a proveedores. |
| `app/sig/normas/page.tsx` (crear) | Catálogo de numerales. |
| `app/sig/tablero-auditoria/page.tsx` (crear) | El tablero. |
| `app/components/sig/SidebarOperacion.tsx` (modificar) | Grupos con separadores. |
| `.env.example`, `README.md` (modificar) | Documentación. |

---

## Task 1: Modelos de C, migración y seed de normas

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_auditorias/migration.sql`
- Create: `prisma/seeds/normas.ts`

- [ ] **Step 1: Los modelos**

```prisma
// ============================================================================
// SIG — Auditorías internas (ISO 9001 §9.2 · ISO/IEC 27001 §9.2). El estado se
// calcula; lo único almacenado es `emitidoEn` y `cerradaEn`, actos de una persona.
// ============================================================================

enum TipoAuditoria {
  INTERNA
  EXTERNA
  PROVEEDOR

  @@map("tipo_auditoria")
}

enum TipoNota {
  OK
  NC
  OM
  RM
  FORTALEZA

  @@map("tipo_nota")
}

enum TipoActa {
  APERTURA
  CIERRE

  @@map("tipo_acta")
}

enum VersionInforme {
  PRELIMINAR
  FINAL

  @@map("version_informe")
}

enum PapelEquipo {
  LIDER
  AUDITOR
  EN_FORMACION
  EXPERTO

  @@map("papel_equipo")
}

/// El catálogo de numerales (decisión 3.1.1: catálogo, no constante).
model NormaAuditable {
  id      Int    @id @default(autoincrement())
  codigo  String @unique // "ISO 9001:2015"
  nombre  String
  version String
  activa  Boolean @default(true)

  requisitos RequisitoNorma[]

  @@map("norma_auditable")
}

model RequisitoNorma {
  id        Int    @id @default(autoincrement())
  normaId   Int    @map("norma_id")
  numeral   String // "4.1"
  titulo    String
  orden     Int
  auditable Boolean @default(true)

  norma NormaAuditable @relation(fields: [normaId], references: [id])

  @@unique([normaId, numeral])
  @@map("requisito_norma")
}

/// FOR-CAL-04: el programa anual.
model ProgramaAuditoria {
  id               Int      @id @default(autoincrement())
  anio             Int      @unique
  alcance          String
  objetivo         String
  criterios        String
  metodos          String
  aprobadoPorId    Int?     @map("aprobado_por_id")
  fechaAprobacion  DateTime? @map("fecha_aprobacion")

  aprobadoPor Persona?          @relation("ProgramaAprobadoPor", fields: [aprobadoPorId], references: [id])
  programadas AuditoriaProgramada[]

  @@map("programa_auditoria")
}

model AuditoriaProgramada {
  id               Int       @id @default(autoincrement())
  programaId       Int       @map("programa_id")
  procesoRef       String    @map("proceso_ref")
  meses            String    // "2,3" — meses del programa
  tipo             TipoAuditoria @default(INTERNA)
  responsableId    Int       @map("responsable_id")
  plazoInformeDias Int       @map("plazo_informe_dias")

  programa     ProgramaAuditoria @relation(fields: [programaId], references: [id])
  responsable  Persona           @relation("ProgramadaResponsable", fields: [responsableId], references: [id])
  auditorias   Auditoria[]

  @@map("auditoria_programada")
}

/// La auditoría concreta. El estado se calcula (decisión 3.1.4).
model Auditoria {
  id            Int          @id @default(autoincrement())
  programadaId  Int?         @map("programada_id")
  tipo          TipoAuditoria
  fechaInicio   DateTime     @map("fecha_inicio") @db.Date
  fechaFin      DateTime?    @map("fecha_fin") @db.Date
  sitio         String
  objeto        String
  alcance       String
  criterios     String
  auditorLiderId Int        @map("auditor_lider_id")
  entidadAuditora String?    @map("entidad_auditora")
  /// Actos de una persona; el resto del estado se calcula.
  emitidoEn     DateTime?    @map("emitido_en")
  cerradaEn     DateTime?    @map("cerrada_en")

  programada  AuditoriaProgramada? @relation(fields: [programadaId], references: [id])
  auditorLider Persona             @relation("AuditoriaLider", fields: [auditorLiderId], references: [id])
  equipo      EquipoAuditor[]
  celdas      CeldaPlan[]
  actas       ActaAuditoria[]
  informes    InformeAuditoria[]

  @@map("auditoria")
}

model EquipoAuditor {
  id          Int           @id @default(autoincrement())
  auditoriaId Int           @map("auditoria_id")
  personaId   Int?          @map("persona_id")
  nombreExterno String?     @map("nombre_externo")
  papel       PapelEquipo

  auditoria Auditoria @relation(fields: [auditoriaId], references: [id])
  persona   Persona?  @relation("EquipoAuditorPersona", fields: [personaId], references: [id])

  @@map("equipo_auditor")
}

/// Hoja PLAN de FOR-CAL-06: la matriz proceso × numeral.
model CeldaPlan {
  id              Int      @id @default(autoincrement())
  auditoriaId     Int      @map("auditoria_id")
  procesoRef      String   @map("proceso_ref")
  requisitoNormaId Int     @map("requisito_norma_id")
  hora            String?
  auditorId       Int?     @map("auditor_id")
  planificada     Boolean  @default(true)

  auditoria Auditoria     @relation(fields: [auditoriaId], references: [id])
  requisito RequisitoNorma @relation(fields: [requisitoNormaId], references: [id])
  notas     NotaAuditor[]

  @@unique([auditoriaId, procesoRef, requisitoNormaId])
  @@map("celda_plan")
}

/// Una nota por celda: la cobertura es medible y no hay notas huérfanas (C4).
model NotaAuditor {
  id           Int      @id @default(autoincrement())
  celdaId      Int      @map("celda_id")
  notaEvidencia String   @map("nota_evidencia")
  tipo         TipoNota
  fecha        DateTime @default(now())
  auditorId    Int      @map("auditor_id")
  hallazgoId   Int?     @map("hallazgo_id")

  celda   CeldaPlan @relation(fields: [celdaId], references: [id])
  auditor Persona   @relation("NotaAuditorAutor", fields: [auditorId], references: [id])

  @@map("nota_auditor")
}

model ActaAuditoria {
  id         Int      @id @default(autoincrement())
  auditoriaId Int     @map("auditoria_id")
  tipo       TipoActa
  fecha      DateTime @db.Date
  asistentes String
  contenido  String

  auditoria Auditoria @relation(fields: [auditoriaId], references: [id])

  @@unique([auditoriaId, tipo])
  @@map("acta_auditoria")
}

model InformeAuditoria {
  id           Int            @id @default(autoincrement())
  auditoriaId  Int            @map("auditoria_id")
  version      VersionInforme
  fechaInforme DateTime       @map("fecha_informe") @db.Date
  conclusiones String
  recomendaciones String
  emitidoPorId Int?           @map("emitido_por_id")
  emitidoEn    DateTime?      @map("emitido_en")

  auditoria  Auditoria @relation(fields: [auditoriaId], references: [id])
  emitidoPor Persona?  @relation("InformeEmitidoPor", fields: [emitidoPorId], references: [id])

  @@unique([auditoriaId, version])
  @@map("informe_auditoria")
}

/// C3: solo una persona con perfil aprobado por el Consulting Director puede ser
/// auditor líder. Los datos que PRO-CAL-04 exige para habilitar.
model PerfilAuditor {
  id                  Int      @id @default(autoincrement())
  personaId           Int?     @map("persona_id")
  nombreExterno       String?  @map("nombre_externo")
  formacion           String
  certificacion       String
  entidadCertificadora String  @map("entidad_certificadora")
  vigencia            DateTime @db.Date
  experienciaAnios    Int      @map("experiencia_anios")
  aprobadoPorId       Int?     @map("aprobado_por_id")
  aprobadoEn          DateTime? @map("aprobado_en")

  persona     Persona? @relation("PerfilPersona", fields: [personaId], references: [id])
  aprobadoPor Persona? @relation("PerfilAprobadoPor", fields: [aprobadoPorId], references: [id])

  @@map("perfil_auditor")
}
```

Relaciones inversas en `Persona`:

```prisma
  programasAprobados      ProgramaAuditoria[] @relation("ProgramaAprobadoPor")
  programadasResponsable  AuditoriaProgramada[] @relation("ProgramadaResponsable")
  auditoriasLideradas     Auditoria[] @relation("AuditoriaLider")
  equipoAuditorias        EquipoAuditor[] @relation("EquipoAuditorPersona")
  notasAuditor            NotaAuditor[] @relation("NotaAuditorAutor")
  informesEmitidos        InformeAuditoria[] @relation("InformeEmitidoPor")
  perfilesAuditor         PerfilAuditor[] @relation("PerfilPersona")
  perfilesAprobados       PerfilAuditor[] @relation("PerfilAprobadoPor")
```

- [ ] **Step 2: Migración**

```bash
npx prisma migrate dev --name auditorias
```

Expected: `CREATE TABLE` para las entidades nuevas, **ningún DROP COLUMN**.

- [ ] **Step 3: Seed de normas**

`prisma/seeds/normas.ts` (tsx, idempotente): ISO 9001:2015 con sus numerales auditables (4.1–4.4, 5.1–5.3, 6.1–6.3, 7.1–7.5 con 7.1.5 no auditable, 8.1, 8.2–8.7 auditables, 9.1–9.3, 10.1–10.3) y ISO/IEC 27001:2022 con los 13 numerales de gestión (4.1–10.2); los encabezados de capítulo vienen no auditables.

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seeds/normas.ts
git commit -m "feat(sig): modelos de auditorias — programa, plan, notas, actas, informe y perfil"
```

---

## Task 2: El dominio puro — estado, independencia y promoción

**Files:**
- Create: `lib/sig/auditorias.ts`
- Test: `lib/sig/__tests__/auditorias.test.ts`

- [ ] **Step 1: Las pruebas**

```ts
// lib/sig/__tests__/auditorias.test.ts
//
// El estado se calcula (decisión 3.1.4); C2 independencia; C7 vencimiento contra el
// plazo; C5 solo NC y OM promueven (C9).

import { estadoAuditoria, esIndependiente, vencidoEntrega, promueveHallazgo } from '../auditorias';

describe('estadoAuditoria', () => {
  it('sin notas: planificada', () => {
    expect(estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 0, preliminar: false })).toBe('PLANIFICADA');
  });

  it('con notas y sin informe: en ejecución', () => {
    expect(estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 3, preliminar: false })).toBe('EN_EJECUCION');
  });

  it('con preliminar: informe preliminar', () => {
    expect(estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 3, preliminar: true })).toBe('INFORME_PRELIMINAR');
  });

  it('emitida manda: es un acto de una persona', () => {
    expect(estadoAuditoria({ emitidoEn: new Date(), cerradaEn: null, notas: 3, preliminar: true })).toBe('EMITIDA');
  });
});

describe('esIndependiente (C2)', () => {
  it('un auditor no puede auditar el proceso del que es responsable', () => {
    expect(esIndependiente('Gestión de calidad', 'Gestión de calidad')).toBe(false);
    expect(esIndependiente('Gestión comercial', 'Gestión de calidad')).toBe(true);
  });
});

describe('vencidoEntrega (C7)', () => {
  it('vence cuando pasan los días del plazo desde el cierre', () => {
    expect(vencidoEntrega(new Date('2026-02-20'), 4, new Date('2026-02-24'))).toBe(false);
    expect(vencidoEntrega(new Date('2026-02-20'), 4, new Date('2026-02-25'))).toBe(true);
  });
});

describe('promueveHallazgo (C5, C9)', () => {
  it('NC y OM promueven; OK, RM y Fortaleza no', () => {
    expect(promueveHallazgo('NC')).toBe(true);
    expect(promueveHallazgo('OM')).toBe(true);
    expect(promueveHallazgo('OK')).toBe(false);
    expect(promueveHallazgo('RM')).toBe(false);
    expect(promueveHallazgo('FORTALEZA')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/auditorias.test.ts
```

Expected: FAIL — `Cannot find module '../auditorias'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/auditorias.ts
//
// El estado se calcula (3.1.4), la independencia se bloquea en el servidor (C2),
// el vencimiento se calcula contra el plazo (C7) y solo NC/OM promueven (C5, C9).

export type EstadoAuditoria = 'PLANIFICADA' | 'EN_EJECUCION' | 'INFORME_PRELIMINAR' | 'EMITIDA';

export function estadoAuditoria(d: {
  emitidoEn: Date | null;
  cerradaEn: Date | null;
  notas: number;
  preliminar: boolean;
}): EstadoAuditoria {
  if (d.emitidoEn) return 'EMITIDA';
  if (d.preliminar) return 'INFORME_PRELIMINAR';
  if (d.notas > 0) return 'EN_EJECUCION';
  return 'PLANIFICADA';
}

/// C2: el auditor de una celda no puede ser el responsable del proceso auditado.
export function esIndependiente(procesoAuditado: string, procesoDelAuditor: string | null): boolean {
  return procesoAuditado !== procesoDelAuditor;
}

/// C7: el plazo viene del programa; el vencimiento se calcula.
export function vencidoEntrega(fechaCierre: Date, plazoDias: number, hoy: Date): boolean {
  const limite = new Date(fechaCierre);
  limite.setUTCDate(limite.getUTCDate() + plazoDias);
  return hoy.getTime() > limite.getTime();
}

/// C5 + C9: solo NC y OM generan hallazgo en B.
export function promueveHallazgo(tipo: string): boolean {
  return tipo === 'NC' || tipo === 'OM';
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/auditorias.test.ts
```

Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/auditorias.ts lib/sig/__tests__/auditorias.test.ts
git commit -m "feat(sig): dominio puro de auditorias — estado calculado, independencia y promocion"
```

---

## Task 3: Acciones — programa, plan, notas y actas

**Files:**
- Create: `app/sig/acciones/auditorias.ts`

- [ ] **Step 1: Las acciones**

```ts
'use server';

// app/sig/acciones/auditorias.ts
//
// C1 el programa del primer bimestre es una obligación del motor de A; C2 la
// independencia se bloquea en el servidor; C3 el líder necesita perfil aprobado;
// C4 toda nota cuelga de una celda; C5 emitir congela y promueve; C6 no se emite
// sin acta de cierre; C8 la externa exige su informe adjunto. Todo con bitácora.

import { prisma } from '@/lib/db';
import { autorActual, autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { codigoHallazgo } from '@/lib/sig/hallazgos';
import { esIndependiente, promueveHallazgo } from '@/lib/sig/auditorias';

// ── Programa (C1) ──

export async function crearPrograma(
  datos: { anio: number; alcance: string; objetivo: string; criterios: string; metodos: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    await prisma.programaAuditoria.upsert({
      where: { anio: datos.anio },
      update: datos,
      create: {
        ...datos,
        aprobadoPorId: persona?.id ?? null,
        fechaAprobacion: new Date(),
      },
    });
    return { ok: true, mensaje: 'Programa guardado. La elaboración del primer bimestre es obligación del motor de A.' };
  });
}

export async function programarAuditoria(
  datos: {
    programaId: number;
    procesoRef: string;
    meses: string;
    responsableId: number;
    plazoInformeDias: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    await prisma.auditoriaProgramada.create({ data: datos });
    return { ok: true, mensaje: 'Auditoría programada.' };
  });
}

// ── Crear la auditoría y el plan (C2, C3) ──

export async function crearAuditoria(
  datos: {
    programadaId?: number;
    fechaInicio: Date;
    fechaFin?: Date;
    sitio: string;
    objeto: string;
    alcance: string;
    criterios: string;
    auditorLiderId: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const perfil = await prisma.perfilAuditor.findFirst({
      where: { personaId: datos.auditorLiderId, aprobadoEn: { not: null } },
    });
    if (!perfil) {
      return { ok: false, mensaje: 'C3: el auditor líder necesita un perfil aprobado por el Consulting Director.' };
    }
    await prisma.$transaction(async (tx) => {
      const creada = await tx.auditoria.create({
        data: { ...datos, tipo: 'INTERNA' },
      });
      await tx.equipoAuditor.create({
        data: { auditoriaId: creada.id, personaId: datos.auditorLiderId, papel: 'LIDER' },
      });
      await registrarAlta(tx, autor, 'auditoria', String(creada.id));
    });
    return { ok: true, mensaje: 'Auditoría creada con su equipo.' };
  });
}

/// C2: la independencia se bloquea en el servidor. La celda queda marcada como no
/// planificada cuando se agrega durante la ejecución (C4).
export async function agregarCeldaPlan(
  auditoriaId: number,
  datos: { procesoRef: string; requisitoNormaId: number; hora?: string; auditorId: number; planificada?: boolean },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    const auditor = await prisma.persona.findUnique({ where: { id: datos.auditorId }, include: { cargo: true } });
    if (!esIndependiente(datos.procesoRef, auditor?.cargo?.nombre ?? null)) {
      return { ok: false, mensaje: 'C2: el auditor no puede auditar el proceso del que es responsable.' };
    }
    await prisma.$transaction(async (tx) => {
      const celda = await tx.celdaPlan.create({
        data: { auditoriaId, ...datos },
      });
      await registrarAlta(tx, autor, 'celda_plan', String(celda.id));
    });
    return { ok: true, mensaje: 'Celda del plan agregada.' };
  });
}

export async function registrarNota(
  celdaId: number,
  datos: { notaEvidencia: string; tipo: 'OK' | 'NC' | 'OM' | 'RM' | 'FORTALEZA' },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    await prisma.$transaction(async (tx) => {
      const nota = await tx.notaAuditor.create({
        data: { celdaId, ...datos, auditorId: persona.id },
      });
      await registrarAlta(tx, autor, 'nota_auditor', String(nota.id));
    });
    return { ok: true, mensaje: 'Nota registrada.' };
  });
}

export async function registrarActa(
  auditoriaId: number,
  datos: { tipo: 'APERTURA' | 'CIERRE'; fecha: Date; asistentes: string; contenido: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    await prisma.$transaction(async (tx) => {
      const acta = await tx.actaAuditoria.upsert({
        where: { auditoriaId_tipo: { auditoriaId, tipo: datos.tipo } },
        update: { fecha: datos.fecha, asistentes: datos.asistentes, contenido: datos.contenido },
        create: { auditoriaId, ...datos },
      });
      await registrar(tx, autor, [
        { tabla: 'acta_auditoria', registroId: String(acta.id), campo: 'contenido', anterior: null, nuevo: datos.contenido },
      ]);
    });
    return { ok: true, mensaje: 'Acta registrada.' };
  });
}
```

- [ ] **Step 2: Verificar que compila (permisos pendientes de la tarea 6)**

```bash
npx tsc --noEmit
```

Expected: falla solo por `auditoria:*`.

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/auditorias.ts
git commit -m "feat(sig): programa, plan con independencia, notas y actas"
```

---

## Task 4: Acciones — informe, emisión, externas y perfiles

**Files:**
- Modify: `app/sig/acciones/auditorias.ts`

- [ ] **Step 1: Las acciones**

```ts
export async function guardarInforme(
  auditoriaId: number,
  datos: { version: 'PRELIMINAR' | 'FINAL'; fechaInforme: Date; conclusiones: string; recomendaciones: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    await prisma.$transaction(async (tx) => {
      const informe = await tx.informeAuditoria.upsert({
        where: { auditoriaId_version: { auditoriaId, version: datos.version } },
        update: datos,
        create: { auditoriaId, ...datos },
      });
      await registrar(tx, autor, [
        { tabla: 'informe_auditoria', registroId: String(informe.id), campo: 'conclusiones', anterior: null, nuevo: datos.conclusiones },
      ]);
    });
    return { ok: true, mensaje: 'Informe guardado.' };
  });
}

/// C5: emitir el final congela las notas y promueve cada NC y OM a hallazgo en B,
/// con origen tipado a la auditoría, el proceso y el numeral. C6: exige acta de
/// cierre. Reabrir exige motivo y queda en bitácora.
export async function emitirInformeFinal(auditoriaId: number): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const auditoria = await prisma.auditoria.findUnique({
      where: { id: auditoriaId },
      include: {
        celdas: { include: { notas: true, requisito: true } },
        actas: true,
        programada: true,
      },
    });
    if (!auditoria) return { ok: false, mensaje: 'La auditoría no existe.' };
    const actaCierre = auditoria.actas.find((a) => a.tipo === 'CIERRE');
    if (!actaCierre) return { ok: false, mensaje: 'C6: no se emite el informe final sin acta de cierre.' };
    const yaEmitida = auditoria.informes?.some((i) => i.version === 'FINAL' && i.emitidoEn);
    if (yaEmitida) return { ok: false, mensaje: 'El informe final ya fue emitido.' };

    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });

    await prisma.$transaction(async (tx) => {
      await tx.informeAuditoria.updateMany({
        where: { auditoriaId, version: 'FINAL' },
        data: { emitidoPorId: persona?.id ?? null, emitidoEn: new Date() },
      });
      await tx.auditoria.update({ where: { id: auditoriaId }, data: { emitidoEn: new Date() } });

      const anio = new Date().getUTCFullYear();
      for (const celda of auditoria.celdas) {
        for (const nota of celda.notas) {
          if (!promueveHallazgo(nota.tipo) || nota.hallazgoId) continue;
          const contador = await tx.contadorHallazgo.upsert({
            where: { anio },
            update: { ultimoValor: { increment: 1 } },
            create: { anio, ultimoValor: 1 },
          });
          const hallazgo = await tx.hallazgo.create({
            data: {
              codigo: codigoHallazgo(anio, contador.ultimoValor),
              tipo: nota.tipo === 'NC' ? 'NC_MAYOR' : 'OBSERVACION',
              origen: 'AUDITORIA_INTERNA',
              origenReferencia: `AUD-${auditoriaId} · ${celda.procesoRef} · ${celda.requisito.numeral}`,
              descripcion: nota.notaEvidencia,
              requisitoIncumplido: `${celda.requisito.numeral} · ${celda.requisito.titulo}`,
              evidenciaObjetiva: nota.notaEvidencia,
              areaId: 1,
              detectadoPorId: nota.auditorId,
              fechaDeteccion: new Date(),
            },
          });
          await tx.notaAuditor.update({ where: { id: nota.id }, data: { hallazgoId: hallazgo.id } });
          await registrarAlta(tx, autor, 'hallazgo', String(hallazgo.id));
        }
      }
      await registrar(tx, autor, [
        { tabla: 'auditoria', registroId: String(auditoriaId), campo: 'emitidoEn', anterior: null, nuevo: 'emitido', motivo: 'emisión del informe final' },
      ]);
    });
    return { ok: true, mensaje: 'Informe final emitido: notas congeladas y NC/OM promovidos a Mejora.' };
  });
}

export async function registrarAuditoriaExterna(
  datos: {
    entidadAuditora: string;
    tipo: 'EXTERNA' | 'PROVEEDOR';
    fechaInicio: Date;
    fechaFin?: Date;
    alcance: string;
    objeto: string;
    criterios: string;
    auditorLiderId: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    // C8: la externa exige entidad, fechas, alcance e informe adjunto (el informe se
    // adjunta como Evidencia con hallazgoId... la externa no es un hallazgo: se usa
    // el campo entidadAuditora + el adjunto queda en una nota de la auditoría).
    if (!datos.entidadAuditora.trim() || !datos.alcance.trim()) {
      return { ok: false, mensaje: 'C8: una auditoría externa exige entidad, fechas, alcance e informe adjunto.' };
    }
    await prisma.$transaction(async (tx) => {
      const creada = await tx.auditoria.create({
        data: { ...datos, sitio: 'Externa', fechaInicio: datos.fechaInicio },
      });
      await registrarAlta(tx, autor, 'auditoria', String(creada.id));
    });
    return { ok: true, mensaje: 'Auditoría externa registrada.' };
  });
}

export async function aprobarPerfilAuditor(
  datos: {
    personaId?: number;
    nombreExterno?: string;
    formacion: string;
    certificacion: string;
    entidadCertificadora: string;
    vigencia: Date;
    experienciaAnios: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      const perfil = await tx.perfilAuditor.create({
        data: { ...datos, aprobadoPorId: persona?.id ?? null, aprobadoEn: new Date() },
      });
      await registrarAlta(tx, autor, 'perfil_auditor', String(perfil.id));
    });
    return { ok: true, mensaje: 'Perfil de auditor aprobado (C3).' };
  });
}
```

- [ ] **Step 2: Verificar que compila (permisos pendientes de la tarea 6)**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/auditorias.ts
git commit -m "feat(sig): informe con emision que promueve NC y OM, externas y perfil de auditor"
```

---

## Task 5: Permisos de auditoría

**Files:**
- Modify: `lib/sgsi/permisos.ts`, `lib/sgsi/__tests__/permisos.test.ts`

- [ ] **Step 1: Las pruebas**

```ts
  it('auditoria: ver todos los grupos; ejecutar y administrar solo el líder', () => {
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'auditoria:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'auditoria:ejecutar')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'auditoria:administrar')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'auditoria:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'auditoria:ejecutar')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'auditoria:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'auditoria:ejecutar')).toBe(false);
    expect(puede(rolDesdeGrupos(['Domain Users']), 'auditoria:ver')).toBe(false);
  });
```

- [ ] **Step 2: Implementar**

`auditoria:ver` en los tres grupos, `auditoria:ejecutar` y `auditoria:administrar` solo en seguridad. (El auditor por asignación se resuelve en las acciones contra `EquipoAuditor`, no en los permisos de grupo.) Correr pruebas y `tsc` (resuelve las tareas 3 y 4).

- [ ] **Step 3: Commit**

```bash
git add lib/sgsi/permisos.ts lib/sgsi/__tests__/permisos.test.ts
git commit -m "feat(sig): permisos de auditoria — ver, ejecutar y administrar"
```

---

## Task 6: Programa y la ficha de la auditoría

**Files:**
- Create: `app/sig/programa/page.tsx`, `Programa.client.tsx`
- Create: `app/sig/auditorias/[id]/page.tsx`, `Auditoria.client.tsx`
- Modify: `app/components/sig/SidebarOperacion.tsx` (grupos con separadores + PRG/AUD)

- [ ] **Step 1: Programa**

La grilla proceso × mes (12 columnas) con casillas de 20×20 según estado (ejecutada ✓ verde, programada ✗ azul, vencida ! roja), badges de estado, el pie del plazo («cuatro días calendario, y el vencimiento se calcula»), el botón Exportar (a Excel, patrón exceljs) y el selector de año. Datos: `AuditoriaProgramada` con sus `meses`, contra las auditorías reales.

- [ ] **Step 2: La ficha de la auditoría**

Cuatro pestañas:

- **Plan**: la matriz proceso × numeral con las marcas ✗ azul (planificada) y + ámbar (agregada en ejecución, C4), el pie de cobertura («24 de 28 numerales · faltan…»), y la hora por celda.
- **Ejecución**: contadores (Notas/NC/OM/RM/Fortalezas con sus colores), chips de filtro por tipo, las notas con su badge de tipo, numeral y proceso, y el chip «Va a Mejora» cuando el informe es final.
- **Actas**: apertura y cierre con asistentes/contenido y el aviso ámbar de C6.
- **Informe**: segmento Preliminar/Final, campos de conclusiones y recomendaciones, fortalezas y oportunidades **derivadas de las notas** (no se capturan dos veces), el botón «Emitir el informe final» (C5) y «Ver los N hallazgos» cuando ya se emitió.

- [ ] **Step 3: La sidebar con grupos**

En `SidebarOperacion.tsx`, agrupar con separadores (patrón del artboard de la spec §4): TAREAS (OBL/CAL/TAR/CON) · MEJORA (HAL/MEJ) · AUDITORÍA (PRG → `/sig/programa`, AUD → `/sig/auditorias`, EXT → `/sig/auditorias/externas`) · CONFIGURACIÓN (PER → personas, NRM → `/sig/normas`).

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/sig/programa/ "app/sig/auditorias/[id]/" app/components/sig/SidebarOperacion.tsx
git commit -m "feat(sig): programa proceso por mes y ficha de auditoria de cuatro pestanas"
```

---

## Task 7: Externas, normas, tablero y cierre

**Files:**
- Create: `app/sig/auditorias/externas/page.tsx`, `Externas.client.tsx`
- Create: `app/sig/normas/page.tsx`, `Normas.client.tsx`
- Create: `app/sig/tablero-auditoria/page.tsx`

- [ ] **Step 1: Auditorías externas**

Lista con filtros (Todas/Certificadora/Segunda parte), badges por tipo (Certificación rojo, Seguimiento azul, Proveedor verde, Cliente ámbar), estado (Cerrada/En curso/Programada), y la ficha con entidad, fechas, alcance, el aviso de que el informe adjunto es obligatorio (C8) y los hallazgos capturados (enlace a Mejora).

- [ ] **Step 2: Normas y requisitos**

Selector ISO 9001 / ISO 27001, cifras (cargados/auditables/auditados alguna vez/nunca auditados), la tabla con Numeral · Título · Auditable (switch que exige motivo) · Veces auditado (barra: nunca rojo, ≥3 verde, resto ámbar) · Última vez · Hallazgos, y el botón «Cargar norma».

- [ ] **Step 3: El tablero**

Cifras (programa cumplido, cobertura de la norma con «SIN AUDITAR» en rojo y el aviso de los numerales faltantes, no conformidades, NC de años anteriores), la barra de cobertura, notas por tipo, hallazgos por proceso y la entrega del informe contra el plazo (la barra roja con la marca del plazo).

- [ ] **Step 4: Gate**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 5: Documentar el README y commit**

```markdown
## Auditorías internas (SIG)

El programa anual (`FOR-CAL-04`), el plan proceso × numeral, las notas con el
vocabulario OK · NC · OM · RM · Fortaleza, las actas y el informe en versión
preliminar y final. Emitir el final congela las notas y promueve cada NC y OM a
hallazgo del módulo B con origen tipado a la auditoría, el proceso y el numeral.
La independencia (C2) y el perfil del auditor (C3) se validan en el servidor.
```

```bash
git add .env.example README.md
git commit -m "docs(sig): documenta el modulo de auditorias internas"
```

---

## Verificación manual antes de dar C por terminado

1. `npx tsx --env-file=.env prisma/seeds/normas.ts` carga ISO 9001 y los numerales de gestión de 27001.
2. Con `Responsables SIG`: crear el programa 2026, programar los 9 procesos en febrero, crear la auditoría con un auditor líder **con perfil aprobado** (C3); sin perfil, el servidor rechaza.
3. Asignar a un auditor una celda de su propio proceso: el servidor rechaza (C2).
4. Registrar notas de los cinco tipos; el contador separa OK/NC/OM/RM/Fortaleza.
5. Emitir el final **sin acta de cierre**: rechaza (C6). Con el acta: emite y crea los hallazgos NC/OM en Mejora (C5); las fortalezas no promueven (C9).
6. Mientras el informe es preliminar, ninguna nota aparece en Mejora (criterio de aceptación).
7. Registrar la auditoría externa de ICONTEC con su informe (C8).
8. El tablero muestra la cobertura de la norma y los numerales nunca auditados en rojo.
9. El programa muestra el estado de cada casilla (ejecutada/programada/vencida) calculado contra las fechas (C7).

## Lo que C deja listo

El paquete SIG completo: A (personas, motor, superficies, notificaciones), B (mejora), D (estratégico) y C (auditorías) cerrando el ciclo — el informe final de C alimenta los hallazgos de B. Queda la **carga de datos** (censo, contenidos, obligaciones, los 66 registros de MAT-CAL-02, el programa 2026 con sus 9 procesos) y las decisiones del comité (anomalía del residual de oportunidades, SIC, áreas de Albeiro/Yuliet, FOR-CAL-04, grupos del Directorio).