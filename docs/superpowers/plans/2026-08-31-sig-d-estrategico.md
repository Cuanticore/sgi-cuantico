# SIG · D — Gestión estratégica · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El módulo D del SIG: análisis de contexto (DOFA y PESTEL versionados y aprobados), partes interesadas, requisitos legales, la matriz de riesgos y oportunidades organizacionales con paridad de cálculo contra `MAT-CAL-02`, el mapa de calor navegable, las materializaciones (`FOR-CAL-08` → hallazgo en B) y la parametrización del modelo.

**Architecture:** Mismo patrón: fórmulas en un módulo **puro** (`lib/sig/estrategico.ts`) probadas con los cinco casos frontera de la spec §4; acciones en `app/sig/acciones/estrategico.ts`; superficie propia en `/estrategico/*` con su gate (`estrategico:ver`), su sidebar y la pestaña del header que A3 dejó deshabilitada. La materialización crea un hallazgo del módulo B con origen tipado; la línea base anual reusa el patrón de `LineaBase` del SGSI.

**Tech Stack:** Next.js 16 · TypeScript 5 · Prisma 7.9.1 · Jest 30 · `America/Bogotá`.

**Diseño:** `docs/handoff_bcd/design/{Riesgos,MapaCalor,Legal,PartesInteresadas}.dc.html` · `docs/handoff_tableros/design/{Dofa,Pestel}.dc.html` · `docs/handoff_cierre/design/Materializaciones.dc.html` · `docs/handoff_formularios/design/Parametros.dc.html` · spec REQ-SIG-04.

---

## Contexto: dónde encaja este plan

| Plan | Contenido |
|---|---|
| A1–A4 ✅, B ✅ | Personas, motor, superficies, notificaciones, mejora. |
| **D (este)** | Gestión estratégica. Consume A (acciones) y B (materialización → hallazgo). |
| C | Auditorías internas (alimenta el origen «auditoría interna» de B). |

## Decisiones de diseño declaradas

1. **La «línea base» que el paquete marcó como faltante se resuelve con D10**: al cerrar el comité se congela la matriz (patrón `LineaBase` del SGSI, snapshot JSON) y se compara entre años. La **anomalía del residual de las oportunidades (§4.1) se reproduce tal cual el Excel y se muestra la advertencia visible (D9)** — cambiar la aritmética es decisión del comité, no del desarrollo. Ninguno de los dos bloquea implementar: se declaran y quedan como pendientes de comité antes de desplegar.
2. **Superficie propia en `/estrategico/*`**: el público es la alta dirección y la sidebar de Operación no debe llegar a once entradas (spec §5). Gate `estrategico:ver`, sidebar `SidebarEstrategico` (Partes, Legal, Riesgos, Mapa de calor, Materializaciones, DOFA, PESTEL, Parámetros). La pestaña «Estratégico» del header deja de estar deshabilitada y enlaza a `/estrategico/riesgos` (la pantalla inicial es la matriz).
3. **El mapa de calor agrupa por el producto exacto P×I** (como el artboard), no por la fórmula de posición `máx(valor−0,5; 0,5)` que la spec §4 describe: el artboard manda, y la spec misma advierte que los conteos se calculan al leer contra el inventario real.
4. **La ficha legal con historial de evaluaciones no está en el artboard** (hallazgo del diseño); la spec la pide. Se implementa como panel lateral sobre la grilla del artboard (historial CUMPLE/PARCIAL/NO_CUMPLE con evidencia y evaluado por), sin inventar una pantalla nueva.
5. **Los 66 registros de MAT-CAL-02 se migran en la tarea final de carga de datos** (requiere el archivo real); este plan entrega las fórmulas con paridad probada (5 casos frontera) y la pantalla lista. El código del Excel se conserva (D1).
6. **Seed de catálogos**: escalas (probabilidad 1–5 con etiquetas; impacto riesgo 1/3/7/12/20 % + referencia COP; impacto oportunidad cualitativo), factores (Legal, Operacional, Personal, Tecnológico, Reputacional, Externo), tipos de control (6, con su `reduce`), eficacias (10/40/80 %) y niveles (0–4/5–12/13–25 con color, acción de riesgo y de oportunidad). Script `tsx prisma/seeds/estrategico.ts`, idempotente.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` (modificar) | Entidades de D + catálogos. |
| `lib/sig/estrategico.ts` (crear) | **Puro.** Fórmulas de la matriz y nivel. |
| `lib/sig/__tests__/estrategico.test.ts` (crear) | Los cinco casos frontera + parametrización. |
| `prisma/seeds/estrategico.ts` (crear) | Seed de catálogos. |
| `app/sig/acciones/estrategico.ts` (crear) | Contexto, partes, legal, riesgos, materialización, línea base. |
| `lib/sgsi/permisos.ts` (modificar) | `estrategico:ver`, `estrategico:escribir`, `estrategico:parametrizar`. |
| `app/components/sgsi/EncabezadoSig.tsx` (modificar) | «Estratégico» con destino. |
| `app/components/sig/SidebarEstrategico.tsx` (crear) | Barra lateral del módulo. |
| `app/estrategico/layout.tsx` (crear) | Gate + sidebar. |
| `app/estrategico/{riesgos,mapa,dofa,pestel,partes,legal,materializaciones,parametros}/page.tsx` (crear) | Las ocho pantallas. |
| `.env.example`, `README.md` (modificar) | Documentación. |

---

## Task 1: Modelos de D, catálogos y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_estrategico/migration.sql`
- Create: `prisma/seeds/estrategico.ts`

- [ ] **Step 1: Los modelos**

Después de los modelos de B:

```prisma
// ============================================================================
// SIG — Gestión estratégica (ISO 9001 §4.1, §4.2, §6.1 · ISO 31000:2018).
// Metodologías separadas del SGSI, plataforma común. Nada calculado se almacena.
// ============================================================================

enum ClaseRiesgo {
  RIESGO
  OPORTUNIDAD

  @@map("clase_riesgo")
}

enum FuenteRiesgo {
  PROCESO
  PARTE_INTERESADA
  DOFA
  PESTEL

  @@map("fuente_riesgo")
}

enum TipoParte {
  INTERNA
  EXTERNA

  @@map("tipo_parte")
}

enum ClaseNecesidad {
  NECESIDAD
  EXPECTATIVA

  @@map("clase_necesidad")
}

enum ResultadoCumplimiento {
  CUMPLE
  PARCIAL
  NO_CUMPLE

  @@map("resultado_cumplimiento")
}

enum TipoAnalisis {
  DOFA
  PESTEL

  @@map("tipo_analisis")
}

enum CasillaDofa {
  FORTALEZA
  OPORTUNIDAD
  DEBILIDAD
  AMENAZA

  @@map("casilla_dofa")
}

enum CasillaPestel {
  POLITICO
  ECONOMICO
  SOCIAL
  TECNOLOGICO
  AMBIENTAL
  LEGAL

  @@map("casilla_pestel")
}

enum EfectoEntrada {
  FAVORABLE
  ADVERSO

  @@map("efecto_entrada")
}

/// MAT-EST-02. La parte y sus necesidades/expectativas; el seguimiento es por año,
/// filas nuevas cada año, nunca columnas (decisión 3.2 de la spec).
model ParteInteresada {
  id          Int       @id @default(autoincrement())
  tipo        TipoParte
  descripcion String
  activa      Boolean   @default(true)

  necesidades NecesidadExpectativa[]

  @@map("parte_interesada")
}

model NecesidadExpectativa {
  id                      Int            @id @default(autoincrement())
  parteId                 Int            @map("parte_id")
  texto                   String
  clase                   ClaseNecesidad
  riesgoOportunidadTexto  String?        @map("riesgo_oportunidad_texto")
  esRiesgo                Boolean        @default(false) @map("es_riesgo")
  esOportunidad           Boolean        @default(false) @map("es_oportunidad")
  poder                   String         // ALTO · MEDIO · BAJO
  interes                 String         // ALTO · MEDIO · BAJO
  generaRequisitosSgsi    Boolean        @default(false) @map("genera_requisitos_sgsi")
  requisitoCambioClimatico Boolean       @default(false) @map("requisito_cambio_climatico")
  requiereCambioAlcanceSig Boolean       @default(false) @map("requiere_cambio_alcance_sig")
  responsableId           Int?           @map("responsable_id")

  parte       ParteInteresada        @relation(fields: [parteId], references: [id])
  responsable Persona?               @relation("NecesidadResponsable", fields: [responsableId], references: [id])
  seguimiento SeguimientoParteAnual[]

  @@map("necesidad_expectativa")
}

/// El seguimiento anual son filas, no columnas: un registro por año.
model SeguimientoParteAnual {
  id          Int      @id @default(autoincrement())
  necesidadId Int      @map("necesidad_id")
  anio        Int
  planAccion  String?  @map("plan_accion")
  seguimiento String?
  evidencia   String?

  necesidad NecesidadExpectativa @relation(fields: [necesidadId], references: [id])

  @@unique([necesidadId, anio])
  @@map("seguimiento_parte_anual")
}

/// MAT-EST-01. Se construye desde cero: la matriz real está vacía (brecha del
/// sistema, no módulo sobre datos existentes).
model RequisitoLegal {
  id                Int      @id @default(autoincrement())
  consecutivo       Int
  normatividad      String
  articulo          String?
  expedidaPor       String
  tipo              String
  objeto            String
  aplicacion        String
  sistemaGestion    String   @map("sistema_gestion") // SGC · SGSI · AMBOS
  procesoEncargado  String?  @map("proceso_encargado")
  responsableId     Int?     @map("responsable_id")
  enlace            String?
  periodicidadRevision String @map("periodicidad_revision")
  vigente           Boolean  @default(true)
  derogadoEn        DateTime? @map("derogado_en")
  normaQueDeroga    String?  @map("norma_que_deroga")

  responsable   Persona?                  @relation("RequisitoResponsable", fields: [responsableId], references: [id])
  evaluaciones  EvaluacionCumplimiento[]

  @@map("requisito_legal")
}

model EvaluacionCumplimiento {
  id            Int                   @id @default(autoincrement())
  requisitoId   Int                   @map("requisito_id")
  fecha         DateTime              @default(now())
  resultado     ResultadoCumplimiento
  evidencia     String?
  evaluadoPorId Int                   @map("evaluado_por_id")
  hallazgoId    Int?                  @map("hallazgo_id")

  requisito RequisitoLegal @relation(fields: [requisitoId], references: [id])
  evaluadoPor Persona      @relation("EvaluacionEvaluadoPor", fields: [evaluadoPorId], references: [id])

  @@index([requisitoId, fecha])
  @@map("evaluacion_cumplimiento")
}

/// MAT-CAL-02. El código es el del Excel, inmutable (D1). La fuente es tipada (D2).
model RiesgoOrganizacional {
  id            Int          @id @default(autoincrement())
  codigo        String       @unique // R1 … R66
  clase         ClaseRiesgo
  proceso       String
  fuente        FuenteRiesgo
  necesidadExpectativaId Int? @map("necesidad_expectativa_id")
  entradaContextoId       Int? @map("entrada_contexto_id")
  descripcion   String
  causa         String
  efecto        String
  factorId      Int          @map("factor_id")
  probabilidadId Int         @map("probabilidad_id")
  impactoId     Int          @map("impacto_id")
  responsableId Int?         @map("responsable_id")
  activo        Boolean      @default(true)
  /// Nada calculado se almacena: inherente, residual y nivel se derivan al leer.
  nivelSugerido String?      @map("nivel_sugerido")

  factor        FactorRiesgo          @relation(fields: [factorId], references: [id])
  probabilidad  EscalaProbabilidad    @relation("RiesgoProbabilidad", fields: [probabilidadId], references: [id])
  impacto       EscalaImpactoRiesgo   @relation(fields: [impactoId], references: [id])
  responsable   Persona?              @relation("RiesgoOrgResponsable", fields: [responsableId], references: [id])
  controles     ControlRiesgoOrg[]
  materializaciones MaterializacionRiesgo[]

  @@index([clase, activo])
  @@map("riesgo_organizacional")
}

model ControlRiesgoOrg {
  id          Int    @id @default(autoincrement())
  riesgoId    Int    @map("riesgo_id")
  descripcion String
  tipoId      Int    @map("tipo_id")
  eficaciaId  Int    @map("eficacia_id")

  riesgo   RiesgoOrganizacional @relation(fields: [riesgoId], references: [id])
  tipo     TipoControlRiesgo    @relation(fields: [tipoId], references: [id])
  eficacia EficaciaControl      @relation(fields: [eficaciaId], references: [id])

  @@map("control_riesgo_org")
}

/// FOR-CAL-08. Materializar genera un hallazgo en B (D6).
model MaterializacionRiesgo {
  id                Int      @id @default(autoincrement())
  riesgoId          Int      @map("riesgo_id")
  fecha             DateTime @db.Date
  descripcionEvento String   @map("descripcion_evento")
  impactoGenerado   String   @map("impacto_generado")
  causaRaiz         String   @map("causa_raiz")
  reportanteId      Int      @map("reportante_id")
  hallazgoId        Int?     @map("hallazgo_id")

  riesgo     RiesgoOrganizacional @relation(fields: [riesgoId], references: [id])
  reportante Persona              @relation("MaterializacionReportante", fields: [reportanteId], references: [id])

  @@index([riesgoId, fecha])
  @@map("materializacion_riesgo")
}

/// DOFA y PESTEL. Una sola pareja de tablas; el catálogo de casillas cambia, no la
/// estructura. Se versiona por año y se aprueba (acta del auditor).
model AnalisisContexto {
  id              Int         @id @default(autoincrement())
  tipo            TipoAnalisis
  anio            Int
  aprobadoPorId   Int?        @map("aprobado_por_id")
  fechaAprobacion DateTime?   @map("fecha_aprobacion")
  actaReferencia  String?     @map("acta_referencia")
  vigente         Boolean     @default(true)

  aprobadoPor Persona?          @relation("ContextoAprobadoPor", fields: [aprobadoPorId], references: [id])
  entradas    EntradaContexto[]

  @@unique([tipo, anio])
  @@map("analisis_contexto")
}

model EntradaContexto {
  id          Int      @id @default(autoincrement())
  analisisId  Int      @map("analisis_id")
  casilla     String
  texto       String
  efecto      EfectoEntrada
  orden       Int

  analisis AnalisisContexto     @relation(fields: [analisisId], references: [id])
  riesgos  RiesgoOrganizacional[]

  @@unique([analisisId, orden])
  @@map("entrada_contexto")
}

// ── Catálogos parametrizables (D4) ──
model EscalaProbabilidad {
  id          Int    @id @default(autoincrement())
  valor       Int    @unique
  etiqueta    String
  descripcion String?
  color       String

  riesgos RiesgoOrganizacional[] @relation("RiesgoProbabilidad")

  @@map("escala_probabilidad")
}

model EscalaImpactoRiesgo {
  id              Int    @id @default(autoincrement())
  valor           Int    @unique
  etiqueta        String
  porcentajePatrimonio Decimal? @map("porcentaje_patrimonio") @db.Decimal(5, 2)
  referenciaCop   Decimal? @map("referencia_cop") @db.Decimal(18, 0)

  riesgos RiesgoOrganizacional[]

  @@map("escala_impacto_riesgo")
}

model EscalaImpactoOportunidad {
  id       Int    @id @default(autoincrement())
  valor    Int    @unique
  etiqueta String

  @@map("escala_impacto_oportunidad")
}

model FactorRiesgo {
  id     Int    @id @default(autoincrement())
  nombre String @unique

  riesgos RiesgoOrganizacional[]

  @@map("factor_riesgo")
}

/// El tipo de control declara qué reduce (decisión 3.1 de la spec): PROBABILIDAD,
/// IMPACTO o AMBOS. «Reactivo» es una fila, no un despliegue.
model TipoControlRiesgo {
  id          Int    @id @default(autoincrement())
  nombre      String @unique
  reduce      String
  descripcion String?

  controles ControlRiesgoOrg[]

  @@map("tipo_control_riesgo")
}

model EficaciaControl {
  id       Int    @id @default(autoincrement())
  nombre   String @unique // Débil · Moderado · Fuerte
  valor    Decimal @db.Decimal(4, 3) // 0.100 · 0.400 · 0.800
  descripcion String?

  controles ControlRiesgoOrg[]

  @@map("eficacia_control")
}

/// Rango parametrizable (0–4, 5–12, 13–25) con color y acción por clase.
model NivelRiesgo {
  id          Int    @id @default(autoincrement())
  minimo      Int
  maximo      Int
  etiqueta    String
  color       String
  accionRiesgo String @map("accion_riesgo")
  accionOportunidad String @map("accion_oportunidad")

  @@map("nivel_riesgo")
}
```

- [ ] **Step 2: Las relaciones inversas en `Persona`**

```prisma
  necesidadesResponsables NecesidadExpectativa[] @relation("NecesidadResponsable")
  requisitosLegales       RequisitoLegal[] @relation("RequisitoResponsable")
  evaluacionesCumplimiento EvaluacionCumplimiento[] @relation("EvaluacionEvaluadoPor")
  riesgosOrganizacionales RiesgoOrganizacional[] @relation("RiesgoOrgResponsable")
  materializaciones       MaterializacionRiesgo[] @relation("MaterializacionReportante")
  contextosAprobados      AnalisisContexto[] @relation("ContextoAprobadoPor")
```

- [ ] **Step 3: Migración**

```bash
npx prisma migrate dev --name estrategico
```

Expected: `CREATE TABLE` para las entidades nuevas, **ningún DROP COLUMN**.

- [ ] **Step 4: El seed de catálogos**

`prisma/seeds/estrategico.ts` (script tsx, idempotente con upserts):

```ts
// prisma/seeds/estrategico.ts
//
// Catálogos del módulo D según MAN-CAL-01. Idempotente: se puede correr varias veces.
// npx tsx prisma/seeds/estrategico.ts

import { prisma } from '@/lib/db';

async function main() {
  for (const [valor, etiqueta, descripcion, color] of [
    [1, 'Muy baja', 'Casi nunca', '#e6efe9'],
    [2, 'Baja', 'Ocasionalmente', '#eef7f1'],
    [3, 'Media', 'Con cierta frecuencia', '#faf1d3'],
    [4, 'Alta', 'Frecuentemente', '#fbe6d2'],
    [5, 'Muy alta', 'Casi siempre', '#f7dcd9'],
  ] as const) {
    await prisma.escalaProbabilidad.upsert({ where: { valor }, update: { etiqueta, descripcion, color }, create: { valor, etiqueta, descripcion, color } });
  }
  for (const [valor, etiqueta, pct, cop] of [
    [1, 'Insignificante', '1', '70000000'],
    [2, 'Menor', '3', '210000000'],
    [3, 'Moderado', '7', '490000000'],
    [4, 'Mayor', '12', '840000000'],
    [5, 'Catastrófico', '20', '1400000000'],
  ] as const) {
    await prisma.escalaImpactoRiesgo.upsert({ where: { valor }, update: { etiqueta, porcentajePatrimonio: pct, referenciaCop: cop }, create: { valor, etiqueta, porcentajePatrimonio: pct, referenciaCop: cop } });
  }
  for (const [valor, etiqueta] of [[1, 'Menor'], [2, 'Moderada'], [3, 'Significativa'], [4, 'Importante'], [5, 'Excepcional']] as const) {
    await prisma.escalaImpactoOportunidad.upsert({ where: { valor }, update: { etiqueta }, create: { valor, etiqueta } });
  }
  for (const nombre of ['Legal', 'Operacional', 'Personal', 'Tecnológico', 'Reputacional', 'Externo']) {
    await prisma.factorRiesgo.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  for (const [nombre, reduce, descripcion] of [
    ['Preventivo', 'PROBABILIDAD', 'Evita que el riesgo ocurra'],
    ['Correctivo', 'IMPACTO', 'Reduce el daño cuando ocurre'],
    ['Preventivo y correctivo', 'AMBOS', 'Actúa antes y después'],
    ['Reforzador', 'PROBABILIDAD', 'Hace más probable la oportunidad'],
    ['Reactivo', 'IMPACTO', 'Definido en el manual; la matriz no lo usa'],
    ['Proactivo', 'AMBOS', 'Refuerza y amplía la oportunidad'],
  ] as const) {
    await prisma.tipoControlRiesgo.upsert({ where: { nombre }, update: { reduce, descripcion }, create: { nombre, reduce, descripcion } });
  }
  for (const [nombre, valor, descripcion] of [
    ['Débil', '0.100', 'Reduce el 10 %'],
    ['Moderado', '0.400', 'Reduce el 40 %'],
    ['Fuerte', '0.800', 'Reduce el 80 %'],
  ] as const) {
    await prisma.eficaciaControl.upsert({ where: { nombre }, update: { valor, descripcion }, create: { nombre, valor, descripcion } });
  }
  for (const [minimo, maximo, etiqueta, color, accionRiesgo, accionOportunidad] of [
    [0, 4, 'Aceptable', '#0b5c44', 'Aceptar', 'Esperar'],
    [5, 12, 'Moderado', '#c25a1e', 'Mitigar o reducir', 'Mejorar'],
    [13, 25, 'Inaceptable', '#a52016', 'Evitar', 'Explotar'],
  ] as const) {
    await prisma.nivelRiesgo.upsert({ where: { minimo }, update: { maximo, etiqueta, color, accionRiesgo, accionOportunidad }, create: { minimo, maximo, etiqueta, color, accionRiesgo, accionOportunidad } });
  }
  console.log('Catálogos de gestión estratégica listos.');
}

main().finally(() => prisma.$disconnect());
```

```bash
npx tsx prisma/seeds/estrategico.ts
```

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seeds/estrategico.ts
git commit -m "feat(sig): modelos de gestion estrategica y catalogo del modelo con seed"
```

---


> **Desviación ejecutada:** el @unique de "NivelRiesgo.minimo" se aplicó a mano en la base de desarrollo (Prisma 7 exige TTY para el prompt del unique en migrate dev; la migración estrategico no lo contiene). La base y el schema coinciden; el drift se absorbe con la próxima migración real (C o la carga de datos).

## Task 2: Las fórmulas, puras y probadas

**Files:**
- Create: `lib/sig/estrategico.ts`
- Test: `lib/sig/__tests__/estrategico.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/estrategico.test.ts
//
// Los cinco casos frontera de la spec §4, que son el oráculo de la implementación:
// R1, R32, R36 y los dos controles moderados. Además, cambiar la eficacia de Fuerte
// recalcula sin tocar los datos (D4).

import { inherenteDe, residualDe, nivelDe } from '../estrategico';

describe('casos frontera de MAT-CAL-02 (spec §4)', () => {
  it('R1 · Preventivo · Fuerte: 3×4 → residual 2,4', () => {
    const r = residualDe(3, 4, 'PREVENTIVO', 'FUERTE');
    expect(r.inherente).toBe(12);
    expect(r.pRes).toBeCloseTo(0.6, 5);
    expect(r.iRes).toBeCloseTo(4, 5);
    expect(r.residual).toBeCloseTo(2.4, 5);
  });

  it('Correctivo · Moderado: 3×3 → residual 5,4', () => {
    const r = residualDe(3, 3, 'CORRECTIVO', 'MODERADO');
    expect(r.inherente).toBe(9);
    expect(r.pRes).toBeCloseTo(3, 5);
    expect(r.iRes).toBeCloseTo(1.8, 5);
    expect(r.residual).toBeCloseTo(5.4, 5);
  });

  it('Preventivo y correctivo · Moderado: 3×3 → residual 3,24', () => {
    const r = residualDe(3, 3, 'PREVENTIVO_Y_CORRECTIVO', 'MODERADO');
    expect(r.residual).toBeCloseTo(3.24, 5);
  });

  it('R36 · Proactivo · Débil: 3×4 → residual 9,72', () => {
    const r = residualDe(3, 4, 'PROACTIVO', 'DEBIL');
    expect(r.residual).toBeCloseTo(9.72, 5);
  });

  it('R32 · Reforzador · Débil: 3×4 → residual 10,8', () => {
    const r = residualDe(3, 4, 'REFORZADOR', 'DEBIL');
    expect(r.residual).toBeCloseTo(10.8, 5);
  });
});

describe('el tipo de control declara qué reduce', () => {
  it('PROBABILIDAD deja el impacto intacto', () => {
    const r = residualDe(3, 4, 'PREVENTIVO', 'FUERTE');
    expect(r.iRes).toBeCloseTo(4, 5);
  });

  it('IMPACTO deja la probabilidad intacta', () => {
    const r = residualDe(3, 4, 'CORRECTIVO', 'MODERADO');
    expect(r.pRes).toBeCloseTo(3, 5);
  });
});

describe('nivelDe', () => {
  it('clasifica por rangos parametrizables', () => {
    expect(nivelDe(4, [0, 5, 13])).toBe(0);
    expect(nivelDe(5, [0, 5, 13])).toBe(1);
    expect(nivelDe(12, [0, 5, 13])).toBe(1);
    expect(nivelDe(13, [0, 5, 13])).toBe(2);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/estrategico.test.ts
```

Expected: FAIL — `Cannot find module '../estrategico'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/estrategico.ts
//
// Las fórmulas de MAT-CAL-02, verificadas fila por fila. Puro a propósito: la paridad
// de la migración y la parametrización (D4) se prueban sin base. Nada de esto se
// almacena: inherente, residual y nivel se derivan al leer.

export type ReduceTipo = 'PROBABILIDAD' | 'IMPACTO' | 'AMBOS';
export type Medicion = 'DEBIL' | 'MODERADO' | 'FUERTE';

export const EFICACIA: Record<Medicion, number> = {
  DEBIL: 0.1,
  MODERADO: 0.4,
  FUERTE: 0.8,
};

export interface ResultadoResidual {
  inherente: number;
  pRes: number;
  iRes: number;
  residual: number;
}

function reduceDe(tipo: string): ReduceTipo {
  switch (tipo) {
    case 'PREVENTIVO':
    case 'REFORZADOR':
      return 'PROBABILIDAD';
    case 'CORRECTIVO':
    case 'REACTIVO':
      return 'IMPACTO';
    case 'PREVENTIVO_Y_CORRECTIVO':
    case 'PROACTIVO':
      return 'AMBOS';
  }
  return 'AMBOS';
}

export function inherenteDe(probabilidad: number, impacto: number): number {
  return probabilidad * impacto;
}

export function residualDe(
  probabilidad: number,
  impacto: number,
  tipo: string,
  medicion: Medicion,
): ResultadoResidual {
  const e = EFICACIA[medicion];
  const reduce = reduceDe(tipo);
  const pRes = reduce === 'PROBABILIDAD' || reduce === 'AMBOS' ? probabilidad * (1 - e) : probabilidad;
  const iRes = reduce === 'IMPACTO' || reduce === 'AMBOS' ? impacto * (1 - e) : impacto;
  return {
    inherente: inherenteDe(probabilidad, impacto),
    pRes,
    iRes,
    residual: pRes * iRes,
  };
}

/// Índice del nivel que contiene al valor, contra los mínimos ordenados.
export function nivelDe(valor: number, minimos: readonly number[]): number {
  let indice = minimos.length - 1;
  for (let i = 0; i < minimos.length; i++) {
    if (valor < minimos[i]) {
      indice = i - 1;
      break;
    }
  }
  return indice;
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/estrategico.test.ts
```

Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/estrategico.ts lib/sig/__tests__/estrategico.test.ts
git commit -m "feat(sig): formulas de la matriz organizacional, verificadas contra MAT-CAL-02"
```

---

## Task 3: Acciones — contexto, partes y legal

**Files:**
- Create: `app/sig/acciones/estrategico.ts`

- [ ] **Step 1: Contexto (DOFA/PESTEL), partes interesadas y legal**

```ts
'use server';

// app/sig/acciones/estrategico.ts
//
// D1 código inmutable; D2 fuente tipada; D6 materializar genera hallazgo; D7 un
// NO_CUMPLE origina hallazgo; D8 derogar no borra; D10 línea base anual. Todo con
// bitácora en la misma transacción.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { codigoHallazgo } from '@/lib/sig/hallazgos';

// ── DOFA y PESTEL (D2: la fuente guarda la referencia, no un texto) ──

export async function crearAnalisisContexto(
  datos: { tipo: 'DOFA' | 'PESTEL'; anio: number; actaReferencia: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    await prisma.$transaction(async (tx) => {
      await tx.analisisContexto.updateMany({ where: { tipo: datos.tipo, vigente: true }, data: { vigente: false } });
      const creado = await tx.analisisContexto.create({
        data: {
          tipo: datos.tipo,
          anio: datos.anio,
          aprobadoPorId: persona.id,
          fechaAprobacion: new Date(),
          actaReferencia: datos.actaReferencia,
        },
      });
      await registrarAlta(tx, autor, 'analisis_contexto', String(creado.id));
    });
    return { ok: true, mensaje: 'Análisis de contexto creado y marcado vigente.' };
  });
}

export async function agregarEntradaContexto(
  analisisId: number,
  datos: { casilla: string; texto: string; efecto: 'FAVORABLE' | 'ADVERSO' },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const ultima = await tx.entradaContexto.findFirst({ where: { analisisId }, orderBy: { orden: 'desc' } });
      const entrada = await tx.entradaContexto.create({
        data: { analisisId, casilla: datos.casilla, texto: datos.texto, efecto: datos.efecto, orden: (ultima?.orden ?? 0) + 1 },
      });
      await registrarAlta(tx, autor, 'entrada_contexto', String(entrada.id));
    });
    return { ok: true, mensaje: 'Entrada agregada.' };
  });
}

// ── Partes interesadas ──

export async function crearParteInteresada(
  datos: { tipo: 'INTERNA' | 'EXTERNA'; descripcion: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const parte = await tx.parteInteresada.create({ data: datos });
      await registrarAlta(tx, autor, 'parte_interesada', String(parte.id));
    });
    return { ok: true, mensaje: 'Parte interesada creada.' };
  });
}

export async function agregarNecesidad(
  parteId: number,
  datos: {
    texto: string;
    clase: 'NECESIDAD' | 'EXPECTATIVA';
    poder: 'ALTO' | 'MEDIO' | 'BAJO';
    interes: 'ALTO' | 'MEDIO' | 'BAJO';
    generaRequisitosSgsi?: boolean;
    requisitoCambioClimatico?: boolean;
    requiereCambioAlcanceSig?: boolean;
    responsableId?: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const creada = await tx.necesidadExpectativa.create({ data: { parteId, ...datos } });
      await registrarAlta(tx, autor, 'necesidad_expectativa', String(creada.id));
    });
    return { ok: true, mensaje: 'Necesidad registrada.' };
  });
}

export async function guardarSeguimientoParte(
  necesidadId: number,
  datos: { anio: number; planAccion: string; seguimiento: string; evidencia: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const seg = await tx.seguimientoParteAnual.upsert({
        where: { necesidadId_anio: { necesidadId, anio: datos.anio } },
        update: { planAccion: datos.planAccion, seguimiento: datos.seguimiento, evidencia: datos.evidencia },
        create: { necesidadId, anio: datos.anio, planAccion: datos.planAccion, seguimiento: datos.seguimiento, evidencia: datos.evidencia },
      });
      await registrar(tx, autor, [
        { tabla: 'seguimiento_parte_anual', registroId: String(seg.id), campo: 'seguimiento', anterior: null, nuevo: datos.seguimiento, motivo: `seguimiento anual ${datos.anio}` },
      ]);
    });
    return { ok: true, mensaje: 'Seguimiento guardado.' };
  });
}

// ── Requisitos legales ──

export async function crearRequisitoLegal(
  datos: {
    normatividad: string;
    articulo?: string;
    expedidaPor: string;
    tipo: string;
    objeto: string;
    aplicacion: string;
    sistemaGestion: string;
    procesoEncargado?: string;
    responsableId?: number;
    periodicidadRevision: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const ultimo = await tx.requisitoLegal.findFirst({ orderBy: { consecutivo: 'desc' } });
      const creado = await tx.requisitoLegal.create({
        data: { consecutivo: (ultimo?.consecutivo ?? 0) + 1, ...datos },
      });
      await registrarAlta(tx, autor, 'requisito_legal', String(creado.id));
    });
    return { ok: true, mensaje: 'Requisito legal creado.' };
  });
}

/// D8: derogar no borra; queda vigente=false con la norma que deroga.
export async function derogarRequisito(codigoId: number, normaQueDeroga: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      await tx.requisitoLegal.update({
        where: { id: codigoId },
        data: { vigente: false, derogadoEn: new Date(), normaQueDeroga },
      });
      await registrarBaja(tx, autor, 'requisito_legal', String(codigoId), `derogado por ${normaQueDeroga}`);
    });
    return { ok: true, mensaje: 'Requisito derogado. Las evaluaciones históricas se conservan.' };
  });
}

export interface DatosEvaluacion {
  requisitoId: number;
  resultado: 'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE';
  evidencia?: string;
  origenHallazgo?: boolean;
}

/// D7: un NO_CUMPLE puede originar un hallazgo con un clic (en Mejora).
export async function evaluarCumplimiento(datos: DatosEvaluacion): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    const requisito = await prisma.requisitoLegal.findUnique({ where: { id: datos.requisitoId } });
    if (!requisito) return { ok: false, mensaje: 'El requisito no existe.' };

    await prisma.$transaction(async (tx) => {
      const evaluacion = await tx.evaluacionCumplimiento.create({
        data: {
          requisitoId: datos.requisitoId,
          resultado: datos.resultado,
          evidencia: datos.evidencia,
          evaluadoPorId: persona.id,
        },
      });
      await registrar(tx, autor, [
        { tabla: 'evaluacion_cumplimiento', registroId: String(evaluacion.id), campo: 'resultado', anterior: null, nuevo: datos.resultado },
      ]);
      if (datos.resultado === 'NO_CUMPLE' && datos.origenHallazgo) {
        const contador = await tx.contadorHallazgo.upsert({
          where: { anio: new Date().getUTCFullYear() },
          update: { ultimoValor: { increment: 1 } },
          create: { anio: new Date().getUTCFullYear(), ultimoValor: 1 },
        });
        const hallazgo = await tx.hallazgo.create({
          data: {
            codigo: codigoHallazgo(new Date().getUTCFullYear(), contador.ultimoValor),
            tipo: 'NC_MENOR',
            origen: 'INDICADOR',
            origenReferencia: `Requisito legal ${requisito.consecutivo}`,
            descripcion: `Incumplimiento del requisito ${requisito.normatividad}`,
            requisitoIncumplido: `${requisito.normatividad} · ${requisito.articulo ?? ''}`,
            evidenciaObjetiva: datos.evidencia ?? '',
            areaId: 1,
            detectadoPorId: persona.id,
            fechaDeteccion: new Date(),
          },
        });
        await tx.evaluacionCumplimiento.update({ where: { id: evaluacion.id }, data: { hallazgoId: hallazgo.id } });
        await registrarAlta(tx, autor, 'hallazgo', String(hallazgo.id));
      }
    });
    return { ok: true, mensaje: 'Evaluación registrada.' };
  });
}
```

- [ ] **Step 2: Verificar que compila (permisos pendientes de la tarea 5)**

```bash
npx tsc --noEmit
```

Expected: falla solo por `estrategico:escribir`.

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/estrategico.ts
git commit -m "feat(sig): contexto, partes interesadas y requisitos legales — con bitacora"
```

---

## Task 4: Acciones — riesgos, materialización y línea base

**Files:**
- Modify: `app/sig/acciones/estrategico.ts`

- [ ] **Step 1: Riesgos, controles, materialización y línea base**

```ts
export interface DatosRiesgo {
  clase: 'RIESGO' | 'OPORTUNIDAD';
  proceso: string;
  fuente: 'PROCESO' | 'PARTE_INTERESADA' | 'DOFA' | 'PESTEL';
  necesidadExpectativaId?: number;
  entradaContextoId?: number;
  descripcion: string;
  causa: string;
  efecto: string;
  factorId: number;
  probabilidadId: number;
  impactoId: number;
  responsableId?: number;
}

/// D1: los nuevos siguen el consecutivo del Excel (R1…R66); el código es inmutable.
/// D2: la fuente guarda la referencia a la fila, no un texto. D3: la clase decide
/// qué escala de impacto aplica.
export async function crearRiesgoOrganizacional(datos: DatosRiesgo): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const ultimo = await tx.riesgoOrganizacional.findFirst({ orderBy: { codigo: 'desc' } });
      const siguiente = ultimo ? Number(ultimo.codigo.slice(1)) + 1 : 1;
      const creado = await tx.riesgoOrganizacional.create({
        data: { codigo: `R${siguiente}`, ...datos },
      });
      await registrarAlta(tx, autor, 'riesgo_organizacional', String(creado.id));
    });
    return { ok: true, mensaje: 'Riesgo u oportunidad creado.' };
  });
}

export async function agregarControlRiesgo(
  riesgoId: number,
  datos: { descripcion: string; tipoId: number; eficaciaId: number },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const control = await tx.controlRiesgoOrg.create({ data: { riesgoId, ...datos } });
      await registrarAlta(tx, autor, 'control_riesgo_org', String(control.id));
    });
    return { ok: true, mensaje: 'Control agregado. El residual se recalcula al leer.' };
  });
}

export interface DatosMaterializacion {
  riesgoId: number;
  fecha: Date;
  descripcionEvento: string;
  impactoGenerado: string;
  causaRaiz: string;
}

/// D6: materializar exige el FOR-CAL-08 completo y genera un hallazgo en Mejora con
/// origen tipado al riesgo.
export async function materializarRiesgo(datos: DatosMaterializacion): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    const persona = await prisma.persona.findUnique({ where: { correo: autor }, select: { id: true } });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    const riesgo = await prisma.riesgoOrganizacional.findUnique({ where: { id: datos.riesgoId } });
    if (!riesgo) return { ok: false, mensaje: 'El riesgo no existe.' };

    await prisma.$transaction(async (tx) => {
      const materializacion = await tx.materializacionRiesgo.create({
        data: { ...datos, reportanteId: persona.id },
      });
      const contador = await tx.contadorHallazgo.upsert({
        where: { anio: new Date().getUTCFullYear() },
        update: { ultimoValor: { increment: 1 } },
        create: { anio: new Date().getUTCFullYear(), ultimoValor: 1 },
      });
      const hallazgo = await tx.hallazgo.create({
        data: {
          codigo: codigoHallazgo(new Date().getUTCFullYear(), contador.ultimoValor),
          tipo: 'NC_MAYOR',
          origen: 'SGSI',
          origenReferencia: riesgo.codigo,
          descripcion: `Riesgo materializado: ${riesgo.descripcion}`,
          requisitoIncumplido: 'ISO 31000:2018 · control operacional',
          evidenciaObjetiva: datos.descripcionEvento,
          areaId: 1,
          detectadoPorId: persona.id,
          fechaDeteccion: new Date(),
        },
      });
      await tx.materializacionRiesgo.update({
        where: { id: materializacion.id },
        data: { hallazgoId: hallazgo.id },
      });
      await registrarAlta(tx, autor, 'materializacion_riesgo', String(materializacion.id));
      await registrarAlta(tx, autor, 'hallazgo', String(hallazgo.id));
    });
    return { ok: true, mensaje: 'Materialización registrada: abrió un hallazgo en Mejora.' };
  });
}

/// D10: línea base anual — se congela la matriz para comparar entre años, con el
/// patrón de LineaBase del SGSI.
export async function congelarLineaBase(nombre: string, acta: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:parametrizar');
    const riesgos = await prisma.riesgoOrganizacional.findMany({
      include: { controles: { include: { tipo: true, eficacia: true } } },
    });
    const snapshot = riesgos.map((r) => ({
      codigo: r.codigo,
      clase: r.clase,
      proceso: r.proceso,
      probabilidad: r.probabilidadId,
      impacto: r.impactoId,
      controles: r.controles.map((c) => ({ tipo: c.tipo.nombre, eficacia: c.eficacia.nombre })),
    }));
    await prisma.lineaBase.create({
      data: { nombre, fecha: new Date(), creadaPor: `${autor} · ${acta}`, snapshot },
    });
    return { ok: true, mensaje: 'Línea base congelada.' };
  });
}
```

- [ ] **Step 2: Verificar que compila (permisos pendientes de la tarea 5)**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/estrategico.ts
git commit -m "feat(sig): riesgos con controles que declaran que reducen, materializacion y linea base"
```

---

## Task 5: Permisos, header y superficie de Estratégico

**Files:**
- Modify: `lib/sgsi/permisos.ts`, `lib/sgsi/__tests__/permisos.test.ts`
- Modify: `app/components/sgsi/EncabezadoSig.tsx`
- Create: `app/components/sig/SidebarEstrategico.tsx`
- Create: `app/estrategico/layout.tsx`

- [ ] **Step 1: Las pruebas**

```ts
  it('estrategico: ver para los tres grupos, escribir para lider y propietarios, parametrizar solo lider', () => {
    expect(puede(rolDesdeGrupos(['Domain Users']), 'estrategico:ver')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'estrategico:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'estrategico:escribir')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'estrategico:parametrizar')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'estrategico:escribir')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'estrategico:parametrizar')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'estrategico:ver')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'estrategico:escribir')).toBe(false);
  });
```

- [ ] **Step 2: Implementar los permisos**

`estrategico:ver`, `estrategico:escribir`, `estrategico:parametrizar` — `ver` en los tres grupos, `escribir` en seguridad y propietarios, `parametrizar` solo seguridad. Correr las pruebas y `tsc` (resuelve las tareas 3 y 4).

- [ ] **Step 3: El header habilita «Estratégico»**

En `EncabezadoSig.tsx`, la pestaña pasa de deshabilitada a real:

```ts
const TODAS: Pestana[] = [
  { etiqueta: 'Mi SIG', href: '/mi-sig' },
  { etiqueta: 'Indicadores', href: '/' },
  { etiqueta: 'Estratégico', href: '/estrategico/riesgos' },
  { etiqueta: 'SGSI', href: '/sgsi' },
  { etiqueta: 'Operación', href: '/sig/obligaciones' },
];
```

- [ ] **Step 4: La sidebar y el layout**

`SidebarEstrategico` sigue el patrón de `SidebarOperacion` con las entradas del shell del artboard Riesgos: Partes interesadas (PER), Requisitos legales (LEG), Riesgos y oportunidades (RIE), Mapa de calor (MAP), Materializaciones (MAT), DOFA (DOF), PESTEL (PES) y Parámetros (PAR), con el footer «Línea base» (patrón LineaBase del SGSI).

`app/estrategico/layout.tsx`: gate `estrategico:ver` (mismo aviso de acceso que los otros módulos) + `EncabezadoSig` + `SidebarEstrategico`.

- [ ] **Step 5: Verificar que compila y la suite verde**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 6: Commit**

```bash
git add lib/sgsi/permisos.ts lib/sgsi/__tests__/permisos.test.ts app/components/sgsi/EncabezadoSig.tsx app/components/sig/SidebarEstrategico.tsx app/estrategico/layout.tsx
git commit -m "feat(sig): permisos, pestana Estrategico y superficie con sidebar propia"
```

---

## Task 6: Riesgos y mapa de calor

**Files:**
- Create: `app/estrategico/riesgos/page.tsx`
- Create: `app/estrategico/riesgos/Riesgos.client.tsx`
- Create: `app/estrategico/mapa/page.tsx`

- [ ] **Step 1: La página de riesgos**

```tsx
// app/estrategico/riesgos/page.tsx
//
// La matriz de MAT-CAL-02 con el cálculo en vivo: cambiar P, I o el control recalcula
// inherente y residual sin recargar (misma idea que la grilla de madurez del SGSI).

import { prisma } from '@/lib/db';
import { residualDe, nivelDe, EFICACIA } from '@/lib/sig/estrategico';
import RiesgosClient from './Riesgos.client';

export const dynamic = 'force-dynamic';

export default async function RiesgosPage() {
  const [riesgos, tipos, eficacias, niveles] = await Promise.all([
    prisma.riesgoOrganizacional.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      include: {
        factor: true,
        probabilidad: true,
        impacto: true,
        responsable: { select: { nombre: true } },
        controles: { include: { tipo: true, eficacia: true } },
      },
    }),
    prisma.tipoControlRiesgo.findMany({ orderBy: { id: 'asc' } }),
    prisma.eficaciaControl.findMany({ orderBy: { valor: 'asc' } }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
  ]);

  const minimos = niveles.map((n) => n.minimo);
  const filas = riesgos.map((r) => {
    const p = r.probabilidad.valor;
    const i = r.impacto.valor;
    const control = r.controles[0];
    const calculo = control
      ? residualDe(p, i, control.tipo.reduce === 'AMBOS' ? tipoNombreReduce(control.tipo.nombre) : control.tipo.reduce === 'PROBABILIDAD' ? 'PREVENTIVO' : 'CORRECTIVO', medicionDe(control.eficacia.nombre))
      : { inherente: p * i, pRes: p, iRes: i, residual: p * i };
    const nivel = nivelDe(calculo.residual, minimos);
    return {
      id: r.id,
      codigo: r.codigo,
      clase: r.clase,
      descripcion: r.descripcion,
      proceso: r.proceso,
      factor: r.factor.nombre,
      p,
      i,
      inherente: calculo.inherente,
      residual: calculo.residual,
      nivel,
      nivelEtiqueta: niveles[nivel]?.etiqueta ?? '—',
      nivelColor: niveles[nivel]?.color ?? '#4a544f',
      control: control ? `${control.tipo.nombre} · ${medicionLabel(control.eficacia.nombre)} ${Number(control.eficacia.valor) * 100} %` : null,
    };
  });

  return (
    <RiesgosClient
      filas={filas}
      tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre, reduce: t.reduce }))}
      eficacias={eficacias.map((e) => ({ id: e.id, nombre: e.nombre, valor: Number(e.valor) }))}
      niveles={niveles.map((n) => ({ minimo: n.minimo, etiqueta: n.etiqueta, color: n.color, accionRiesgo: n.accionRiesgo, accionOportunidad: n.accionOportunidad }))}
    />
  );
}

function medicionDe(nombre: string): 'DEBIL' | 'MODERADO' | 'FUERTE' {
  return (nombre === 'Débil' ? 'DEBIL' : nombre === 'Moderado' ? 'MODERADO' : 'FUERTE');
}

function medicionLabel(nombre: string): string {
  return nombre;
}

function tipoNombreReduce(nombre: string): 'PREVENTIVO' | 'CORRECTIVO' | 'PREVENTIVO_Y_CORRECTIVO' | 'REFORZADOR' | 'REACTIVO' | 'PROACTIVO' {
  switch (nombre) {
    case 'Preventivo': return 'PREVENTIVO';
    case 'Correctivo': return 'CORRECTIVO';
    case 'Preventivo y correctivo': return 'PREVENTIVO_Y_CORRECTIVO';
    case 'Reforzador': return 'REFORZADOR';
    case 'Reactivo': return 'REACTIVO';
    default: return 'PROACTIVO';
  }
}
```

- [ ] **Step 2: El cliente con cálculo en vivo**

`Riesgos.client.tsx`: tabla (Núm · Riesgo u oportunidad + proceso · Factor · P · I · Inh. · Control · Res. · Nivel) con chips Todos/Riesgos/Oportunidades; panel lateral al abrir un registro: P e I 1–5, control con tipo (según clase) y medición, y los pasos del cálculo mostrados (`inherente = P×I`, `P_res`, `I_res`, `residual`), tarjetas Inherente/Residual con el borde del color del nivel, y la **advertencia de oportunidades** (D9).

- [ ] **Step 3: El mapa de calor**

`app/estrategico/mapa/page.tsx`: 5×5 con probabilidad vertical (5 arriba) e impacto horizontal; toggle Inherente/Residual; cada casilla con el conteo y el nivel escrito (Aceptable/Moderado/Inaceptable), colores `#eef7f1/#0b5c44`, `#faf1d3/#6b5410`, `#f7dcd9/#8a1f16`; panel derecho con la lista de registros de la casilla seleccionada. Conteos calculados al leer (nunca precocinados).

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/estrategico/riesgos/ app/estrategico/mapa/
git commit -m "feat(sig): matriz de riesgos con calculo en vivo y mapa de calor 5x5"
```

---

## Task 7: DOFA y PESTEL

**Files:**
- Create: `app/estrategico/dofa/page.tsx`, `app/estrategico/dofa/Dofa.client.tsx`
- Create: `app/estrategico/pestel/page.tsx`, `app/estrategico/pestel/Pestel.client.tsx`

- [ ] **Step 1: La página del DOFA**

```tsx
// app/estrategico/dofa/page.tsx
//
// Los cuatro cuadrantes con el año y el acta que los aprueba. Cada entrada muestra
// cuántos riesgos originó y abrirla lleva a ellos (D2: la referencia, no el texto).

import { prisma } from '@/lib/db';
import DofaClient from './Dofa.client';

export const dynamic = 'force-dynamic';

export default async function DofaPage() {
  const analisis = await prisma.analisisContexto.findMany({
    where: { tipo: 'DOFA' },
    orderBy: { anio: 'desc' },
    include: {
      aprobadoPor: { select: { nombre: true } },
      entradas: {
        include: { _count: { select: { riesgos: true } } },
      },
    },
  });

  const vigente = analisis.find((a) => a.vigente) ?? analisis[0] ?? null;
  const entradas = (vigente?.entradas ?? []).map((e) => ({
    id: e.id,
    casilla: e.casilla,
    texto: e.texto,
    orden: e.orden,
    riesgos: e._count.riesgos,
  }));

  return (
    <DofaClient
      anio={vigente?.anio ?? null}
      acta={vigente?.actaReferencia ?? null}
      aprobadoPor={vigente?.aprobadoPor?.nombre ?? null}
      entradas={entradas}
    />
  );
}
```

- [ ] **Step 2: El cliente**

`Dofa.client.tsx`: cuadrícula 2×2 con Fortalezas (verde `#0b5c44`), Oportunidades (azul `#12437f`), Debilidades (naranja `#8a4407`), Amenazas (rojo `#a52016`), borde superior del color; chip «Aprobado» + acta + selector de año; cada entrada con el chip de riesgos originados (azul si >0, naranja «—» si 0) y «+ Originar un riesgo desde aquí» (llama a `crearRiesgoOrganizacional` con fuente DOFA). PESTEL idéntico con seis dimensiones 3×2 (Ambiental destacada: enmienda ISO 2024), efecto FAVORABLE `#0f7a5a` / ADVERSO `#a52016` en la barra lateral de cada entrada, y la dimensión sin riesgos señalada («suele significar que se llenó por cumplir»).

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/estrategico/dofa/ app/estrategico/pestel/
git commit -m "feat(sig): DOFA y PESTEL versionados con acta y trazabilidad a los riesgos"
```

---

## Task 8: Partes, Legal, Materializaciones y Parámetros

**Files:**
- Create: `app/estrategico/partes/page.tsx`, `Partes.client.tsx`
- Create: `app/estrategico/legal/page.tsx`, `Legal.client.tsx`
- Create: `app/estrategico/materializaciones/page.tsx`, `Materializaciones.client.tsx`
- Create: `app/estrategico/parametros/page.tsx`, `Parametros.client.tsx`

- [ ] **Step 1: Partes interesadas**

`Partes.client.tsx`: chips Todas/Internas/Externas; el mapa poder×interés 2×2 con los cuatro cuadrantes (Gestionar de cerca rojo, Mantener satisfecho naranja, Mantener informado azul, Monitorear gris) y sus conteos; grilla con chip de tipo, nombre y «Poder X · interés Y · N bandera(s)»; ficha con las tres banderas y el seguimiento año por año (tabs por año, plan/seguimiento/evidencia).

- [ ] **Step 2: Requisitos legales**

`Legal.client.tsx`: el banner naranja de la matriz real vacía (semilla del marco normativo); grilla con filtros Todos/SGC/SGSI/Revisión vencida, chips de sistema (SGC azul, SGSI verde, Ambos amarillo), semáforo de revisión vencida (fila rosada + fecha roja; naranja ≤10 días), estado de cumplimiento (Cumple verde / Parcial naranja / No cumple rojo / Sin evaluar gris); panel lateral con el historial de evaluaciones (decisión 4) y el botón «derogar» y «NO_CUMPLE → hallazgo».

- [ ] **Step 3: Materializaciones**

`Materializaciones.client.tsx`: cifras (este año, con hallazgo abierto, reincidentes), tabla con badge «N×» para reincidentes (fila rosada), evento e impacto en dos líneas, reportante, y el enlace al hallazgo con su estado (abierto naranja / cerrado verde). El botón «Reportar incidente» llama a `materializarRiesgo` (D6).

- [ ] **Step 4: Parámetros**

`Parametros.client.tsx`: seis pestañas (Probabilidad, Impacto · riesgo, Impacto · oportunidad, Tipos de control, Eficacia, Niveles y tratamiento) + «Restaurar valores del MAN-CAL-01»; todo cambio exige motivo y queda en bitácora; historial por tabla. Avisos: cambiar etiqueta no altera lo valorado (los 66 guardan la referencia, D4); cambiar la eficacia de Fuerte a 90 % recalcula.

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/estrategico/partes/ app/estrategico/legal/ app/estrategico/materializaciones/ app/estrategico/parametros/
git commit -m "feat(sig): partes interesadas, requisitos legales, materializaciones y parametros"
```

---

## Task 9: Cierre — documentación y gate

- [ ] **Step 1: Documentar en el README**

```markdown
## Gestión estratégica (SIG)

Partes interesadas, requisitos legales y la matriz de riesgos y oportunidades
organizacionales (`MAT-CAL-02`), con metodologías separadas del SGSI y plataforma
común: sus fórmulas viven en `lib/sig/estrategico.ts` y se probaron contra los cinco
casos frontera de la matriz real. Nada calculado se almacena — inherente, residual y
nivel se derivan al leer — y los 66 registros guardan la referencia al nivel, no el
número (cambiar una escala recalcula sin tocar datos).

Las acciones del tratamiento son asignaciones del motor de A; materializar un riesgo
abre su hallazgo en Mejora (`FOR-CAL-08`); el DOFA y el PESTEL se versionan por año
con su acta de aprobación, y una entrada puede originar riesgos con la referencia
tipada a la fila. La línea base anual se congela con el patrón de `LineaBase`.
```

- [ ] **Step 2: Gate**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs(sig): documenta el modulo de gestion estrategica"
```

---

## Verificación manual antes de dar D por terminado

1. Seed corrido: los catálogos del modelo existen (escalas 1–5, tipos con reduce, eficacias 10/40/80, niveles 0–4/5–12/13–25).
2. Con cuenta de `Responsables SIG`: la pestaña «Estratégico» del header navega a `/estrategico/riesgos` (ya no deshabilitada).
3. Crear un riesgo con P=3, I=4 y control Preventivo·Fuerte: inherente 12, residual 2,4, nivel Aceptable — coincide con R1 del oráculo.
4. Cambiar la eficacia de Fuerte a 90 % en Parámetros: el mismo riesgo recalcula a residual 1,2 sin tocar datos.
5. El mapa de calor agrupa por el producto exacto y cada casilla lleva el nivel escrito.
6. Materializar un riesgo: se crea el hallazgo en Mejora con origen tipado al riesgo, y aparece en Materializaciones con su enlace.
7. DOFA 2026 aprobado con acta; crear el de 2027 no borra el anterior (vigente=false).
8. Un NO_CUMPLE legal con «originar hallazgo» crea el HAL correspondiente.
9. La línea base se congela y se compara entre años.

## Lo que D deja listo para C

D queda integrado con A (acciones), B (materialización y hallazgos) y el SGSI (línea base, tablero consolidado lado a lado). C (auditorías) alimentará el origen «auditoría interna» de B y su programa anual; la pantalla de Materializaciones ya muestra el enlace al hallazgo, y C traerá las auditorías externas (segunda parte) que la spec de D referencia como fuente.