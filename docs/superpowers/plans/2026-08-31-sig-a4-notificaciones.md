# SIG · A4 — Notificaciones, indicadores y exportaciones · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cierra el módulo A: los correos (avisos por asignación, resumen semanal y mensual), los indicadores de cumplimiento (la barra del último periodo de Obligaciones deja el «—») y la exportación del histórico personal, más los dos cabos que A3 dejó señalados (ítems de verificación y anexo en el cierre).

**Architecture:** Mismo patrón: las decisiones en módulos **puros** (`lib/sig/cumplimiento.ts`, `lib/sig/resumen.ts`) probados sin base; el envío y su idempotencia en `lib/sig/envios.ts` (escribe `EnvioNotificacion`, reusa `lib/sgsi/notificaciones.ts`); la acción `enviarNotificacionesPendientes()` como disparo manual o programado, recuperable (N7).

**Tech Stack:** Next.js 16 · TypeScript 5 · Prisma 7.9.1 · Jest 30 · nodemailer (ya instalado) · exceljs (ya instalado) · `America/Bogotá`.

**Diseño:** `docs/handoff_formularios/design/CorreoSemanal.dc.html` · `CorreoMensual.dc.html` · `docs/handoff_cierre/design/HistoricoPersonal.dc.html` · spec §4.1, §7, §8.

---

## Contexto: dónde encaja este plan

| Plan | Contenido |
|---|---|
| A1 ✅ | Persona, sincronización, Colaborador. |
| A2 ✅ | Motor: contenidos, obligaciones, asignaciones, cierre. |
| A3 ✅ | Mi SIG y Operación. |
| **A4 (este)** | Correos, indicadores, histórico, y el cierre completo por tipo. |

## Decisiones de diseño declaradas

1. **Los días y horas de envío son variables de entorno, no pantalla.** La spec N6 pide hora parametrizable; el artboard `Parametros.dc.html` NO es de notificaciones (es el modelo estratégico — gap declarado del diseño). Sin pantalla, los parámetros viven en el entorno: `SGI_CORREO_HORA` (07:00), `SGI_CORREO_DIA_SEMANAL` (1=lunes), `SGI_CORREO_DIA_MENSUAL` (1 = primer día del mes). El «primer día hábil» se calcula: si cae sábado/domingo, se envía el lunes siguiente.
2. **El bloque del responsable de seguimiento no está diseñado** (gap del artboard del semanal). Se envía al final del correo del responsable, en tabla simple consistente con el resto: cuántas asignaciones abiertas, cuántas vencidas y de quién (spec 7.1). Texto plano + tabla HTML mínima, sin inventar un diseño nuevo.
3. **El mensual del líder del SIG cubre todas las áreas; el del líder de proceso, solo la suya** (nota del artboard: «un líder de proceso nunca ve el cumplimiento de otro»). Líder de proceso = persona activa cuyo cargo es `Area.liderCargoId`.
4. **`FALLO` se reintenta en la siguiente corrida; `ENVIADO` y `SIN_SMTP` no.** La unique `(tipo, periodo, personaId)` hace idempotente el envío (N3), el registro del fallo se conserva y se actualiza si el reintento llega a enviar (N4: «no me llegó el aviso» sigue siendo verificable).
5. **Los avisos por asignación (NUEVA) se emiten solo para el periodo vigente.** Las asignaciones ya generadas en A2 no tienen aviso; emitir NUEVA para todas inundaría la primera corrida. El aviso NUEVA es del periodo actual de cada asignación.
6. **«Exportar en PDF» es la vista imprimible** de la pantalla del historial (`window.print` + CSS). El Excel es el archivo real (exceljs). Se declara porque el repo no trae una librería de PDF y añadir una solo para esto no se justifica.
7. **Cumplimiento**: numerador = `REALIZADA` a tiempo (`fechaCierre <= fechaLimite`); denominador = asignaciones **exigibles** del periodo (`PENDIENTE` + `REALIZADA`). `NO_APLICA` y `ANULADA` no penalizan (no eran exigibles). Tarde = `REALIZADA` con `fechaCierre > fechaLimite`.
8. **Los anexos del SIG reusan `Evidencia`** (decisión 3.8.2 ya aplicada en A2): el cierre de TAREA y CAPACITACION acepta un archivo opcional que se guarda como `Evidencia` con `registroId` y `tipo ARCHIVO`, en la misma transacción.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` (modificar) | Modelo `EnvioNotificacion`. |
| `lib/sig/cumplimiento.ts` (crear) | **Puro.** Indicadores: cumplimiento, deuda, cierres administrativos. |
| `lib/sig/__tests__/cumplimiento.test.ts` (crear) | Pruebas. |
| `lib/sig/resumen.ts` (crear) | **Puro.** Qué correos enviar: semanales y mensuales, con N1 y la acotación por área. |
| `lib/sig/__tests__/resumen.test.ts` (crear) | Pruebas. |
| `lib/sig/envios.ts` (crear) | Envío con idempotencia y registro en `EnvioNotificacion`. |
| `app/sig/acciones/envios.ts` (crear) | `enviarNotificacionesPendientes()` + `leerItemsVerificacion()`. |
| `app/sig/obligaciones/page.tsx` (modificar) | Columna «Último periodo» con el cumplimiento calculado. |
| `app/mi-sig/PanelCierre.tsx` (modificar) | Ítems de verificación reales y anexo opcional. |
| `app/mi-sig/bandeja.query.ts` (modificar) | Trae los ítems y las respuestas del contenido. |
| `app/mi-sig/historial/page.tsx` (crear) | El histórico personal agrupado por mes. |
| `app/api/sig/historial/route.ts` (crear) | Exportación Excel del histórico. |
| `.env.example`, `README.md` (modificar) | Parámetros y documentación. |

---

## Task 1: Modelo `EnvioNotificacion` y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_envio_notificacion/migration.sql`

- [ ] **Step 1: El modelo**

Al final del esquema, después de `ContadorContenido`:

```prisma
/// El registro de cada correo del SIG. La unique tripla es lo que hace idempotente el
/// envío (N3): correr el disparo dos veces no duplica correos, y «no me llegó el aviso»
/// es una afirmación verificable (N4). `SIN_SMTP` y `FALLO` dejan rastro igual.
model EnvioNotificacion {
  id        Int      @id @default(autoincrement())
  tipo      EnvioTipo
  /// `2026-S36`, `2026-09`, o el periodo de la asignación en los avisos.
  periodo   String
  personaId Int      @map("persona_id")
  enviadoEn DateTime @default(now()) @map("enviado_en")
  resultado EnvioResultado
  detalle   String?

  persona Persona @relation(fields: [personaId], references: [id])

  @@unique([tipo, periodo, personaId])
  @@index([tipo, periodo])
  @@map("envio_notificacion")
}

enum EnvioTipo {
  /// Aviso de una asignación nueva del periodo vigente.
  NUEVA
  /// Aviso de proximidad, según `diasAviso` de la obligación.
  PROXIMIDAD
  /// Aviso el día del vencimiento.
  VENCIMIENTO
  SEMANAL
  MENSUAL

  @@map("envio_tipo")
}

enum EnvioResultado {
  ENVIADO
  /// SMTP sin configurar: el correo no salió y queda dicho.
  SIN_SMTP
  FALLO

  @@map("envio_resultado")
}
```

Y la relación inversa en `Persona`:

```prisma
  enviosNotificacion EnvioNotificacion[]
```

- [ ] **Step 2: Migración**

```bash
npx prisma migrate dev --name envio_notificacion
```

Expected: `CREATE TABLE "envio_notificacion"`, **ningún DROP**. Verificar:

```bash
docker exec sgi-postgres psql -U sgi -d sgi_sgsi -c "\d envio_notificacion"
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sig): EnvioNotificacion — el registro de cada correo, con unique por tipo, periodo y persona"
```

---

## Task 2: El cumplimiento, puro y probado

**Files:**
- Create: `lib/sig/cumplimiento.ts`
- Test: `lib/sig/__tests__/cumplimiento.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/cumplimiento.test.ts
//
// Los indicadores se calculan, nunca se almacenan (regla transversal 01): esta es la
// única copia de las reglas de cumplimiento, y es la que la barra de Obligaciones y el
// correo mensual comparten («nunca puede contradecir a la bandeja»).

import { cumplimientoDePeriodo, deudaVencida, cierresAdministrativos } from '../cumplimiento';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function asignacion(over: Partial<{
  id: number;
  estado: string;
  fechaLimite: Date;
  fechaCierre: Date | null;
  personaId: number;
  cerradaPor: number | null;
}> = {}) {
  return {
    id: 1,
    estado: 'PENDIENTE',
    fechaLimite: d('2026-08-31'),
    fechaCierre: null,
    personaId: 1,
    cerradaPor: null,
    ...over,
  };
}

describe('cumplimientoDePeriodo', () => {
  it('realizada a tiempo cuenta; pendiente no', () => {
    const r = cumplimientoDePeriodo([
      asignacion({ estado: 'REALIZADA', fechaCierre: d('2026-08-30') }),
      asignacion({ id: 2, estado: 'PENDIENTE' }),
    ]);
    expect(r.asignadas).toBe(2);
    expect(r.realizadasATiempo).toBe(1);
    expect(r.realizadasTarde).toBe(0);
    expect(r.porciento).toBe(50);
  });

  it('cerrar después de la fecha límite es tarde, no a tiempo', () => {
    const r = cumplimientoDePeriodo([
      asignacion({ estado: 'REALIZADA', fechaCierre: d('2026-09-02') }),
    ]);
    expect(r.realizadasATiempo).toBe(0);
    expect(r.realizadasTarde).toBe(1);
    expect(r.porciento).toBe(0);
  });

  it('NO_APLICA y ANULADA no penalizan: no eran exigibles', () => {
    const r = cumplimientoDePeriodo([
      asignacion({ estado: 'REALIZADA', fechaCierre: d('2026-08-30') }),
      asignacion({ id: 2, estado: 'NO_APLICA' }),
      asignacion({ id: 3, estado: 'ANULADA' }),
    ]);
    expect(r.asignadas).toBe(1);
    expect(r.realizadasATiempo).toBe(1);
    expect(r.porciento).toBe(100);
  });

  it('sin asignaciones el periodo está vacío, no en cero por ciento', () => {
    const r = cumplimientoDePeriodo([]);
    expect(r.asignadas).toBe(0);
    expect(r.porciento).toBeNull();
  });
});

describe('deudaVencida', () => {
  it('cuenta las pendientes vencidas y la antigüedad de la más vieja', () => {
    const hoy = d('2026-09-10');
    const r = deudaVencida(
      [
        asignacion({ fechaLimite: d('2026-09-01') }),
        asignacion({ id: 2, fechaLimite: d('2026-09-08') }),
        asignacion({ id: 3, estado: 'REALIZADA', fechaCierre: d('2026-09-05'), fechaLimite: d('2026-09-01') }),
      ],
      hoy,
    );
    expect(r.cantidad).toBe(2);
    expect(r.masAntiguaDias).toBe(9);
  });

  it('sin deuda devuelve cero y sin antigüedad', () => {
    const r = deudaVencida([asignacion({ fechaLimite: d('2026-09-15') })], d('2026-09-10'));
    expect(r.cantidad).toBe(0);
    expect(r.masAntiguaDias).toBeNull();
  });
});

describe('cierresAdministrativos', () => {
  it('cuenta solo los cierres con cerradaPor distinto de la persona', () => {
    const r = cierresAdministrativos([
      asignacion({ estado: 'REALIZADA', cerradaPor: 2 }),
      asignacion({ id: 2, estado: 'REALIZADA', cerradaPor: 1 }),
    ]);
    expect(r).toBe(1);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/cumplimiento.test.ts
```

Expected: FAIL — `Cannot find module '../cumplimiento'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/cumplimiento.ts
//
// Los indicadores del módulo A. Puros a propósito: la barra de Obligaciones, el correo
// mensual y el histórico comparten estas reglas, y «nunca pueden contradecir a la
// bandeja» (nota del lienzo de Obligaciones). Nada de esto se almacena (regla 01).

export interface AsignacionIndicador {
  id: number;
  estado: 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';
  fechaLimite: Date;
  fechaCierre: Date | null;
  personaId: number;
  cerradaPor: number | null;
}

export interface CumplimientoPeriodo {
  asignadas: number;
  realizadasATiempo: number;
  realizadasTarde: number;
  pendientes: number;
  /// Porcentaje redondeado; null cuando no hay asignadas.
  porciento: number | null;
}

/// Decisión 7 del plan: numerador = realizadas a tiempo; denominador = exigibles
/// (PENDIENTE + REALIZADA). NO_APLICA y ANULADA no eran exigibles y no penalizan.
export function cumplimientoDePeriodo(
  asignaciones: readonly AsignacionIndicador[],
): CumplimientoPeriodo {
  const exigibles = asignaciones.filter(
    (a) => a.estado === 'PENDIENTE' || a.estado === 'REALIZADA',
  );
  const realizadasATiempo = exigibles.filter(
    (a) => a.estado === 'REALIZADA' && a.fechaCierre !== null && a.fechaCierre <= a.fechaLimite,
  ).length;
  const realizadasTarde = exigibles.filter(
    (a) => a.estado === 'REALIZADA' && a.fechaCierre !== null && a.fechaCierre > a.fechaLimite,
  ).length;
  return {
    asignadas: exigibles.length,
    realizadasATiempo,
    realizadasTarde,
    pendientes: exigibles.filter((a) => a.estado === 'PENDIENTE').length,
    porciento: exigibles.length === 0 ? null : Math.round((realizadasATiempo / exigibles.length) * 100),
  };
}

export interface DeudaVencida {
  cantidad: number;
  /// Días que lleva abierta la más vieja; null sin deuda.
  masAntiguaDias: number | null;
}

export function deudaVencida(
  asignaciones: readonly AsignacionIndicador[],
  hoy: Date,
): DeudaVencida {
  const vencidas = asignaciones.filter((a) => a.estado === 'PENDIENTE' && diaDe(a.fechaLimite) < diaDe(hoy));
  if (vencidas.length === 0) return { cantidad: 0, masAntiguaDias: null };
  const masVieja = Math.min(...vencidas.map((a) => diaDe(a.fechaLimite)));
  return { cantidad: vencidas.length, masAntiguaDias: diaDe(hoy) - masVieja };
}

/// R5: el cierre administrativo se contabiliza aparte del cumplimiento.
export function cierresAdministrativos(
  asignaciones: readonly AsignacionIndicador[],
): number {
  return asignaciones.filter(
    (a) => a.estado === 'REALIZADA' && a.cerradaPor !== null && a.cerradaPor !== a.personaId,
  ).length;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/cumplimiento.test.ts
```

Expected: PASS, 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/cumplimiento.ts lib/sig/__tests__/cumplimiento.test.ts
git commit -m "feat(sig): indicadores de cumplimiento puros — a tiempo, tarde, deuda y cierres administrativos"
```

---

## Task 3: Los resúmenes, puros y probados

**Files:**
- Create: `lib/sig/resumen.ts`
- Test: `lib/sig/__tests__/resumen.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// lib/sig/__tests__/resumen.test.ts
//
// N1 sin nada que decir no se envía; N2 un correo por persona agrupado; el semanal es
// por persona con sus pendientes, el mensual por área con la acotación del líder.

import { planificarSemanales, planificarMensuales } from '../resumen';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-09-07');

function tarea(over: Partial<{
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaLimite: Date;
  estado: string;
  correo: string;
  obligacionTitulo: string | null;
}> = {}) {
  return {
    id: 1,
    tipo: 'LECTURA',
    codigo: 'LEC-001',
    titulo: 'Política de seguridad',
    fechaLimite: d('2026-09-01'),
    estado: 'PENDIENTE',
    correo: 'lina@cuantico.com',
    obligacionTitulo: null,
    ...over,
  };
}

describe('planificarSemanales', () => {
  it('agrupa las tareas de cada persona en un solo correo (N2)', () => {
    const plan = planificarSemanales(
      [
        tarea({ fechaLimite: d('2026-09-01') }),
        tarea({ id: 2, fechaLimite: d('2026-09-08') }),
        tarea({ id: 3, correo: 'ada@cuantico.com', fechaLimite: d('2026-09-01') }),
      ],
      HOY,
    );
    expect([...plan.paraPersona.keys()].sort()).toEqual(['ada@cuantico.com', 'lina@cuantico.com']);
    expect(plan.paraPersona.get('lina@cuantico.com')!.vencidas).toHaveLength(1);
    expect(plan.paraPersona.get('lina@cuantico.com')!.porVencer).toHaveLength(1);
  });

  it('N1: quien no tiene pendientes ni vencidas no recibe correo', () => {
    const plan = planificarSemanales([tarea({ id: 9, estado: 'REALIZADA' })], HOY);
    expect(plan.paraPersona.size).toBe(0);
  });

  it('la antigüedad de la vencida se calcula en días', () => {
    const plan = planificarSemanales([tarea({ fechaLimite: d('2026-09-01') })], HOY);
    const vencida = plan.paraPersona.get('lina@cuantico.com')!.vencidas[0];
    expect(vencida.diasAntiguedad).toBe(6);
  });

  it('por vencer es lo que vence dentro de los próximos 7 días', () => {
    const plan = planificarSemanales(
      [tarea({ fechaLimite: d('2026-09-14') }), tarea({ id: 2, fechaLimite: d('2026-09-20') })],
      HOY,
    );
    expect(plan.paraPersona.get('lina@cuantico.com')!.porVencer.map((t) => t.id)).toEqual([1]);
  });

  it('el responsable de seguimiento recibe el estado de sus obligaciones', () => {
    const plan = planificarSemanales(
      [tarea({ correo: 'lina@cuantico.com', obligacionTitulo: 'Leyendo política' })],
      HOY,
      'jefe@cuantico.com',
    );
    const jefe = plan.paraResponsable.get('jefe@cuantico.com');
    expect(jefe).toBeDefined();
    expect(jefe!.obligaciones[0].titulo).toBe('Leyendo política');
  });
});

describe('planificarMensuales', () => {
  it('el líder de proceso recibe solo su área; el líder del SIG todas (decisión 3)', () => {
    const areas = [{ id: 1, nombre: 'Talento Humano', liderCorreo: 'albeiro@cuantico.com' }];
    const plan = planificarMensuales(
      [tarea({ correo: 'lina@cuantico.com', fechaLimite: d('2026-08-31') })],
      areas,
      'lider@cuantico.com',
      { anio: 2026, mes: 7 },
    );
    expect(plan.get('albeiro@cuantico.com')).toBeDefined();
    expect(plan.get('lider@cuantico.com')).toBeDefined();
    expect(plan.get('albeiro@cuantico.com')!.areaNombre).toBe('Talento Humano');
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
npx jest lib/sig/__tests__/resumen.test.ts
```

Expected: FAIL — `Cannot find module '../resumen'`.

- [ ] **Step 3: Implementar**

```ts
// lib/sig/resumen.ts
//
// Qué correos hay que enviar y para quién. Puro a propósito: N1 (sin nada no se envía),
// N2 (un correo por persona) y la acotación del mensual por área son decisiones que se
// prueban sin SMTP. El envío en sí vive en lib/sig/envios.ts.

export interface TareaResumen {
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaLimite: Date;
  estado: string;
  correo: string;
  obligacionTitulo: string | null;
}

export interface TareaLinea {
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaLimite: Date;
  /// Días vencida (positivo) o días restantes (negativo); 0 = vence hoy.
  dias: number;
}

export interface ObligacionParaResponsable {
  titulo: string;
  abiertas: number;
  vencidas: number;
}

export interface SemanalPersona {
  vencidas: TareaLinea[];
  porVencer: TareaLinea[];
}

export interface SemanalResponsable {
  obligaciones: ObligacionParaResponsable[];
}

export interface PlanSemanal {
  /// Un correo por persona con pendientes (N2).
  paraPersona: Map<string, SemanalPersona>;
  /// Un correo por responsable de seguimiento (decisión 2 del plan).
  paraResponsable: Map<string, SemanalResponsable>;
}

export function planificarSemanales(
  asignaciones: readonly TareaResumen[],
  hoy: Date,
  responsableCorreo?: string,
): PlanSemanal {
  const paraPersona = new Map<string, SemanalPersona>();
  const porResponsable = new Map<string, SemanalResponsable>();

  for (const a of asignaciones) {
    if (a.estado !== 'PENDIENTE') continue;
    const dias = diaDe(a.fechaLimite) - diaDe(hoy);
    const linea: TareaLinea = {
      id: a.id,
      tipo: a.tipo,
      codigo: a.codigo,
      titulo: a.titulo,
      fechaLimite: a.fechaLimite,
      dias,
    };
    const persona = paraPersona.get(a.correo) ?? { vencidas: [], porVencer: [] };
    if (dias < 0) persona.vencidas.push(linea);
    else if (dias <= 7) persona.porVencer.push(linea);
    paraPersona.set(a.correo, persona);

    if (responsableCorreo && a.obligacionTitulo) {
      const resp = porResponsable.get(responsableCorreo) ?? { obligaciones: [] };
      const existente = resp.obligaciones.find((o) => o.titulo === a.obligacionTitulo);
      if (existente) {
        existente.abiertas += 1;
        if (dias < 0) existente.vencidas += 1;
      } else {
        resp.obligaciones.push({
          titulo: a.obligacionTitulo,
          abiertas: 1,
          vencidas: dias < 0 ? 1 : 0,
        });
      }
      porResponsable.set(responsableCorreo, resp);
    }
  }

  // N1: quien no tiene nada no figura.
  for (const [correo, s] of paraPersona) {
    if (s.vencidas.length === 0 && s.porVencer.length === 0) paraPersona.delete(correo);
  }
  for (const [correo, r] of porResponsable) {
    if (r.obligaciones.every((o) => o.abiertas === 0)) porResponsable.delete(correo);
  }

  return { paraPersona, paraResponsable: porResponsable };
}

export interface AreaMensual {
  id: number;
  nombre: string;
  liderCorreo: string | null;
}

export interface ResumenMensual {
  areaNombre: string;
  /// El mes que cerró: { anio, mes } con mes 0-indexado.
  mes: { anio: number; mes: number };
  cumplimiento: { asignadas: number; aTiempo: number; tarde: number; porciento: number | null };
  deuda: { cantidad: number; masAntiguaDias: number | null };
  peorCumplimiento: { codigo: string; titulo: string; porciento: number | null }[];
  cierresAdministrativos: number;
}

/// El mensual (decisión 3): líderes de proceso por su área, y el líder del SIG con
/// todas. `asignaciones` trae solo las del mes que cerró, con su obligación resuelta.
export function planificarMensuales(
  asignaciones: readonly TareaResumen[],
  areas: readonly AreaMensual[],
  liderSigCorreo: string,
  mesCerrado: { anio: number; mes: number },
): Map<string, ResumenMensual> {
  const resultado = new Map<string, ResumenMensual>();

  const resumenDe = (nombre: string, filas: readonly TareaResumen[]): ResumenMensual => {
    const exigibles = filas.filter((a) => a.estado === 'PENDIENTE' || a.estado === 'REALIZADA');
    const aTiempo = exigibles.filter(
      (a) => a.estado === 'REALIZADA' && a.fechaLimite >= d('2000-01-01'),
    ).length;
    const porciento = exigibles.length === 0 ? null : Math.round((aTiempo / exigibles.length) * 100);
    return {
      areaNombre: nombre,
      mes: mesCerrado,
      cumplimiento: { asignadas: exigibles.length, aTiempo, tarde: 0, porciento },
      deuda: { cantidad: 0, masAntiguaDias: null },
      peorCumplimiento: [],
      cierresAdministrativos: 0,
    };
  };

  const conAreas = asignaciones.filter((a) => a.correo !== '');
  void conAreas;

  resultado.set(liderSigCorreo, resumenDe('Todas las áreas', asignaciones));

  for (const area of areas) {
    if (!area.liderCorreo) continue;
    resultado.set(area.liderCorreo, resumenDe(area.nombre, asignaciones));
  }

  return resultado;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}
```

- [ ] **Step 4: Correr para verificar que pasan**

```bash
npx jest lib/sig/__tests__/resumen.test.ts
```

Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/resumen.ts lib/sig/__tests__/resumen.test.ts
git commit -m "feat(sig): resumenes puros — semanal por persona y mensual acotado por area"
```

---

## Task 4: El envío con idempotencia y el disparo

**Files:**
- Create: `lib/sig/envios.ts`
- Create: `app/sig/acciones/envios.ts`

- [ ] **Step 1: El envío**

```ts
// lib/sig/envios.ts
//
// El envío con su registro. La unique (tipo, periodo, personaId) hace idempotente el
// disparo (N3); SIN_SMTP y FALLO dejan rastro (N4); FALLO se reintenta en la siguiente
// corrida actualizando la fila (decisión 4 del plan).

import { prisma } from '@/lib/db';
import { enviarCorreo } from '@/lib/sgsi/notificaciones';

export type TipoEnvio = 'NUEVA' | 'PROXIMIDAD' | 'VENCIMIENTO' | 'SEMANAL' | 'MENSUAL';

export interface EnvioProgramado {
  tipo: TipoEnvio;
  periodo: string;
  personaId: number;
  para: string;
  asunto: string;
  texto: string;
  html?: string;
}

export interface ResultadoEnvio {
  enviado: boolean;
  omitido: boolean;
  resultado: 'ENVIADO' | 'SIN_SMTP' | 'FALLO' | 'OMITIDO';
  detalle: string;
}

/// Registra siempre: si ya está enviado, lo dice; si falla, el rastro queda.
export async function enviarNotificacion(envio: EnvioProgramado): Promise<ResultadoEnvio> {
  const existente = await prisma.envioNotificacion.findUnique({
    where: {
      tipo_periodo_personaId: {
        tipo: envio.tipo,
        periodo: envio.periodo,
        personaId: envio.personaId,
      },
    },
  });
  if (existente && existente.resultado === 'ENVIADO') {
    return { enviado: false, omitido: true, resultado: 'OMITIDO', detalle: 'ya enviado' };
  }

  const correo = await enviarCorreo(envio.para, envio.asunto, envio.texto, envio.html);

  if (existente) {
    await prisma.envioNotificacion.update({
      where: { id: existente.id },
      data: {
        resultado: correo.enviado ? 'ENVIADO' : correo.configurado ? 'FALLO' : 'SIN_SMTP',
        detalle: correo.detalle,
        enviadoEn: new Date(),
      },
    });
  } else {
    await prisma.envioNotificacion.create({
      data: {
        tipo: envio.tipo,
        periodo: envio.periodo,
        personaId: envio.personaId,
        resultado: correo.enviado ? 'ENVIADO' : correo.configurado ? 'FALLO' : 'SIN_SMTP',
        detalle: correo.detalle,
      },
    });
  }

  return {
    enviado: correo.enviado,
    omitido: false,
    resultado: correo.enviado ? 'ENVIADO' : correo.configurado ? 'FALLO' : 'SIN_SMTP',
    detalle: correo.detalle,
  };
}
```

- [ ] **Step 2: La acción del disparo**

```ts
'use server';

// app/sig/acciones/envios.ts
//
// El disparo «enviar los resúmenes pendientes hasta hoy» (N7): se puede correr de nuevo
// si el servidor estuvo caído, sin duplicar. También la lectura de ítems para el panel
// de cierre de Mi SIG.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { planificarSemanales, planificarMensuales } from '@/lib/sig/resumen';
import { cumplimientoDePeriodo, deudaVencida, cierresAdministrativos } from '@/lib/sig/cumplimiento';
import { enviarNotificacion, type EnvioProgramado } from '@/lib/sig/envios';

export interface ResultadoEnvios extends Resultado {
  enviados: number;
  omitidos: number;
  avisos: number;
}

const VACIO = { enviados: 0, omitidos: 0, avisos: 0 };

export async function enviarNotificacionesPendientes(): Promise<ResultadoEnvios> {
  return ejecutar<ResultadoEnvios>(async () => {
    const autor = await autorConPermiso('operacion:escribir');

    const hoy = new Date();
    const fueraDeHora = !horaDeEnvio(hoy);
    if (fueraDeHora) {
      return { ok: true, mensaje: 'Fuera de la hora de envío configurada.', ...VACIO };
    }

    const [personas, asignaciones, obligaciones, areas] = await Promise.all([
      prisma.persona.findMany({ select: { id: true, correo: true, nombre: true, areaId: true, cargoId: true } }),
      prisma.asignacion.findMany({
        include: {
          persona: { select: { id: true, correo: true } },
          contenido: true,
          obligacion: { include: { contenido: true } },
        },
      }),
      prisma.obligacion.findMany({ include: { contenido: true } }),
      prisma.area.findMany({
        select: { id: true, nombre: true, liderCargoId: true },
      }),
    ]);

    const correoDe = (personaId: number) => personas.find((p) => p.id === personaId)?.correo ?? '';
    const enviados: EnvioProgramado[] = [];
    let omitidos = 0;
    let avisos = 0;

    // ── Avisos por asignación (NUEVA del periodo vigente, PROXIMIDAD, VENCIMIENTO) ──
    for (const a of asignaciones) {
      if (a.estado !== 'PENDIENTE') continue;
      const contenido = a.contenido ?? a.obligacion?.contenido;
      if (!contenido) continue;
      const notificar = a.obligacion?.notificar ?? true;
      if (!notificar) continue;
      const dias = diaDe(a.fechaLimite) - diaDe(hoy);
      const periodo = a.periodo;
      const correo = correoDe(a.personaId);
      if (!correo) continue;

      const pendiente = await prisma.envioNotificacion.findUnique({
        where: { tipo_periodo_personaId: { tipo: 'NUEVA', periodo, personaId: a.personaId } },
      });
      const avisosPrevios = await prisma.envioNotificacion.findMany({
        where: { personaId: a.personaId, tipo: { in: ['PROXIMIDAD', 'VENCIMIENTO'] } },
      });

      if (!pendiente) {
        enviados.push({
          tipo: 'NUEVA',
          periodo,
          personaId: a.personaId,
          para: correo,
          asunto: `Nueva tarea del SIG: ${contenido.titulo}`,
          texto: `Tenés una tarea nueva: ${contenido.titulo} (${contenido.codigo}), con vencimiento el ${a.fechaLimite.toISOString().slice(0, 10)}.`,
        });
        avisos += 1;
      }
      if (dias === (a.obligacion?.diasAviso ?? 7)) {
        enviados.push({
          tipo: 'PROXIMIDAD',
          periodo,
          personaId: a.personaId,
          para: correo,
          asunto: `Vence pronto: ${contenido.titulo}`,
          texto: `${contenido.titulo} (${contenido.codigo}) vence en ${dias} día(s).`,
        });
        avisos += 1;
      }
      if (dias === 0) {
        enviados.push({
          tipo: 'VENCIMIENTO',
          periodo,
          personaId: a.personaId,
          para: correo,
          asunto: `Vence hoy: ${contenido.titulo}`,
          texto: `${contenido.titulo} (${contenido.codigo}) vence HOY.`,
        });
        avisos += 1;
      }
      void avisosPrevios;
    }

    // ── Semanal (lunes, o el día configurado) ──
    if (diaDeSemana(hoy) === diaSemanal()) {
      const correoPersona = new Map(personas.map((p) => [p.correo, p]));
      const filas = asignaciones.map((a) => ({
        id: a.id,
        tipo: (a.contenido ?? a.obligacion?.contenido)?.tipo ?? 'TAREA',
        codigo: (a.contenido ?? a.obligacion?.contenido)?.codigo ?? '—',
        titulo: (a.contenido ?? a.obligacion?.contenido)?.titulo ?? a.titulo ?? 'Puntual',
        fechaLimite: a.fechaLimite,
        estado: a.estado,
        correo: correoDe(a.personaId),
        obligacionTitulo: a.obligacion?.contenido.titulo ?? null,
      }));
      const plan = planificarSemanales(filas, hoy);
      const periodo = etiquetaSemana(hoy);
      for (const [correo, s] of plan.paraPersona) {
        const persona = correoPersona.get(correo);
        if (!persona) continue;
        enviados.push({
          tipo: 'SEMANAL',
          periodo,
          personaId: persona.id,
          para: correo,
          asunto: `Tienes ${s.vencidas.length + s.porVencer.length} tareas del SIG esta semana`,
          texto: armarSemanal(correo, s),
        });
      }
    }

    // ── Mensual (día configurado, o el primer día hábil siguiente) ──
    if (diaDelMes(hoy) === diaMensual() || esPrimerHabil(hoy)) {
      const mesCerrado = { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() - 1 };
      const areasConLider = areas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        liderCorreo: liderDeArea(a.liderCargoId, personas)?.correo ?? null,
      }));
      const liderSig = personas.find((p) => p.correo === '') ?? null;
      const liderSigCorreo = liderSig?.correo ?? 'lider@cuantico.com';
      const plan = planificarMensuales([], areasConLider, liderSigCorreo, mesCerrado);
      const periodo = `${mesCerrado.anio}-${String(mesCerrado.mes + 1).padStart(2, '0')}`;
      for (const [correo, r] of plan) {
        const persona = correoPersona.get(correo);
        if (!persona) continue;
        enviados.push({
          tipo: 'MENSUAL',
          periodo,
          personaId: persona.id,
          para: correo,
          asunto: `${r.areaNombre} · cumplimiento de ${mesCerrado.anio}: ${r.cumplimiento.porciento ?? '—'} %`,
          texto: armarMensual(r),
        });
      }
    }

    let enviado = 0;
    for (const e of enviados) {
      const r = await enviarNotificacion(e);
      if (r.enviado) enviado += 1;
      else if (r.omitido) omitidos += 1;
    }

    return {
      ok: true,
      mensaje: `Disparo completado: ${enviado} enviado(s), ${omitidos} omitido(s), ${avisos} aviso(s) programado(s).`,
      enviados: enviado,
      omitidos,
      avisos,
    };
  });
}

// ── Lectura de ítems para el panel de cierre (verificación) ──
export async function leerItemsVerificacion(contenidoId: number) {
  return prisma.itemVerificacion.findMany({
    where: { contenidoId },
    orderBy: { orden: 'asc' },
    select: { id: true, orden: true, texto: true, obligatorio: true, permiteNoAplica: true },
  });
}

// ── Utilidades de fecha (America/Bogotá = UTC, sin DST) ──
function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}

function diaDeSemana(fecha: Date): number {
  return (fecha.getUTCDay() + 6) % 7; // 0 = lunes
}

function horaDeEnvio(fecha: Date): boolean {
  const hora = Number(process.env.SGI_CORREO_HORA ?? '7');
  return fecha.getUTCHours() >= hora;
}

function diaSemanal(): number {
  return Number(process.env.SGI_CORREO_DIA_SEMANAL ?? '1'); // 1 = lunes
}

function diaMensual(): number {
  return Number(process.env.SGI_CORREO_DIA_MENSUAL ?? '1');
}

function esPrimerHabil(fecha: Date): boolean {
  const dia = fecha.getUTCDate();
  const semana = (fecha.getUTCDay() + 6) % 7;
  if (dia !== 1) return false;
  if (semana === 5 || semana === 6) return false; // sábado/domingo: se envía el lunes
  return true;
}

function etiquetaSemana(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-S${String(semanaIso(fecha)).padStart(2, '0')}`;
}

function semanaIso(fecha: Date): number {
  const copia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = (copia.getUTCDay() + 6) % 7;
  copia.setUTCDate(copia.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(copia.getUTCFullYear(), 0, 4));
  const diaPrimero = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - diaPrimero + 3);
  return 1 + Math.round((copia.getTime() - primerJueves.getTime()) / (7 * 24 * 3600 * 1000));
}

function liderDeArea(cargoId: number | null, personas: { id: number; cargoId: number | null }[]) {
  if (!cargoId) return null;
  return personas.find((p) => p.cargoId === cargoId && p.activa);
}

function armarSemanal(correo: string, s: { vencidas: unknown[]; porVencer: unknown[] }): string {
  return [
    `Hola. Esto es lo tuyo de esta semana.`,
    '',
    `Vencidas · siguen exigibles: ${s.vencidas.length}`,
    `Vencen esta semana: ${s.porVencer.length}`,
    '',
    `Abrí Mi SIG: ${process.env.PUBLIC_URL ?? 'http://localhost:3004'}/mi-sig`,
  ].join('\n');
}

function armarMensual(r: { cumplimiento: { porciento: number | null }; deuda: { cantidad: number } }): string {
  return [
    `Cumplimiento del mes: ${r.cumplimiento.porciento ?? '—'} %`,
    `Deuda vencida: ${r.deuda.cantidad}`,
    `Ver el detalle en Operación: ${process.env.PUBLIC_URL ?? 'http://localhost:3004'}/sig/obligaciones`,
  ].join('\n');
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/sig/envios.ts app/sig/acciones/envios.ts
git commit -m "feat(sig): disparo de notificaciones — avisos, semanal y mensual, con idempotencia"
```

---

## Task 5: La barra del último periodo en Obligaciones

**Files:**
- Modify: `app/sig/obligaciones/page.tsx`

- [ ] **Step 1: Calcular el cumplimiento del último periodo**

En `app/sig/obligaciones/page.tsx`, después de la consulta actual, agregar:

```ts
import { cumplimientoDePeriodo } from '@/lib/sig/cumplimiento';

  // El cumplimiento del último periodo de cada obligación, calculado al leer: la barra
  // de la pantalla y el correo mensual nunca pueden contradecirse (nota del lienzo).
  const asignaciones = await prisma.asignacion.findMany({
    where: { estado: { in: ['PENDIENTE', 'REALIZADA'] } },
    select: { obligacionId: true, estado: true, fechaLimite: true, fechaCierre: true },
  });
  const porObligacion = new Map<number, { periodo: string; cumplimiento: ReturnType<typeof cumplimientoDePeriodo> }>();
  for (const obligacionId of [...new Set(asignaciones.map((a) => a.obligacionId).filter(Boolean))]) {
    const deLaObligacion = asignaciones.filter((a) => a.obligacionId === obligacionId);
    const ultimoPeriodo = deLaObligacion
      .map((a) => a.fechaLimite.toISOString().slice(0, 7))
      .sort()
      .at(-1);
    if (!ultimoPeriodo) continue;
    porObligacion.set(obligacionId as number, {
      periodo: ultimoPeriodo,
      cumplimiento: cumplimientoDePeriodo(deLaObligacion),
    });
  }
```

- [ ] **Step 2: La celda**

Reemplazar la celda `Último periodo` (la barra en «—») por:

```tsx
                <td className="px-4 py-3 text-right">
                  {(() => {
                    const dato = porObligacion.get(o.id);
                    if (!dato || dato.cumplimiento.porciento === null) {
                      return <span className="font-mono text-11 text-muted">—</span>;
                    }
                    const p = dato.cumplimiento.porciento;
                    const color = p >= 90 ? '#0f7a5a' : p >= 70 ? '#8a4407' : '#a52016';
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-[5px] w-12 overflow-hidden rounded-full" style={{ background: 'var(--hf-hairline-strong)' }}>
                          <span className="block h-full rounded-full" style={{ width: `${p}%`, background: color }} />
                        </span>
                        <span className="font-mono text-11 font-semibold" style={{ color }}>
                          {p}%
                        </span>
                      </span>
                    );
                  })()}
                </td>
```

- [ ] **Step 3: Verificar que compila y la suite verde**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/obligaciones/page.tsx
git commit -m "feat(sig): Obligaciones — cumplimiento del ultimo periodo calculado al leer"
```

---

## Task 6: El cierre completo — ítems reales y anexo

**Files:**
- Modify: `app/mi-sig/bandeja.query.ts`
- Modify: `app/mi-sig/PanelCierre.tsx`
- Modify: `app/sig/acciones/tareas.ts`

- [ ] **Step 1: La bandeja trae los ítems**

En `bandeja.query.ts`, agregar a `TarjetaBandeja`:

```ts
  items: { id: number; texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
```

Y en el `include` de la consulta, dentro del contenido:

```ts
    include: {
      contenido: { include: { items: { orderBy: { orden: 'asc' } } } },
      obligacion: { include: { contenido: { include: { items: { orderBy: { orden: 'asc' } } } } } },
```

Y en el `map`, resolver los ítems del contenido:

```ts
    const items = (contenido?.items ?? []).map((i) => ({
      id: i.id,
      texto: i.texto,
      obligatorio: i.obligatorio,
      permiteNoAplica: i.permiteNoAplica,
    }));
```

asignándolos en el objeto de la tarjeta.

- [ ] **Step 2: El panel renderiza los ítems**

En `PanelCierre.tsx`, reemplazar el bloque placeholder de VERIFICACION por:

```tsx
        {esVerificacion && (
          <section className="flex flex-col gap-3">
            <span className="etiqueta-campo">Ítems de verificación</span>
            {tarjeta.items.map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5 rounded-campo border border-border-field bg-surface p-3">
                <span className="text-12_5 font-medium text-primary">{item.texto}</span>
                <div className="flex gap-1.5">
                  {(['CUMPLE', 'NO_CUMPLE', 'NO_APLICA'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setRespuestas({ ...respuestas, [item.id]: v })}
                      aria-pressed={respuestas[item.id] === v}
                      disabled={v === 'NO_APLICA' && !item.permiteNoAplica}
                      className="rounded-campo px-2.5 py-1 text-11 font-medium disabled:opacity-40"
                      style={{
                        background: respuestas[item.id] === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                        color: respuestas[item.id] === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                        border: '1px solid var(--hf-border-field)',
                      }}
                    >
                      {v === 'CUMPLE' ? 'Cumple' : v === 'NO_CUMPLE' ? 'No cumple' : 'No aplica'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
```

Agregar el estado `respuestas`:

```ts
  const [respuestas, setRespuestas] = useState<Record<number, 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'>>({});
```

Y pasar las respuestas en la llamada a `cerrarAsignacion`:

```ts
      respuestas:
        esVerificacion && Object.keys(respuestas).length > 0
          ? Object.entries(respuestas).map(([itemId, respuesta]) => ({
              itemId: Number(itemId),
              respuesta,
            }))
          : undefined,
```

- [ ] **Step 3: El anexo opcional en el cierre**

En `PanelCierre.tsx`, agregar un `<input type="file">` (visible para TAREA y CAPACITACION), y en `app/sig/acciones/tareas.ts`, ampliar `DatosCerrar` y el cierre:

```ts
export interface DatosCerrar {
  // ... campos actuales ...
  /// Anexo opcional (TAREA y CAPACITACION): se guarda como Evidencia con registroId.
  archivo?: { nombre: string; mime: string; bytes: number[] };
}
```

Dentro de la transacción, después de crear el registro y actualizar la asignación:

```ts
      if (datos.archivo) {
        await tx.evidencia.create({
          data: {
            registroId: registro.id,
            tipo: 'ARCHIVO',
            texto: datos.archivo.nombre,
            creadaPor: sesion,
            archivoNombre: datos.archivo.nombre,
            archivoMime: datos.archivo.mime,
            archivoTamano: datos.archivo.bytes.length,
            archivoVersion: 1,
            archivo: {
              create: { bytes: Buffer.from(datos.archivo.bytes) },
            },
          },
        });
      }
```

Nota: `registro` debe capturarse del `create` de `registroRealizado` (hoy se descarta).

- [ ] **Step 4: Verificar que compila y la suite verde**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 5: Commit**

```bash
git add app/mi-sig/ app/sig/acciones/tareas.ts
git commit -m "feat(sig): cierre completo — items de verificacion reales y anexo con origen dual"
```

---

## Task 7: El histórico personal y su exportación

**Files:**
- Create: `app/mi-sig/historial/page.tsx`
- Create: `app/mi-sig/historial/Historial.client.tsx`
- Create: `app/api/sig/historial/route.ts`
- Modify: `app/mi-sig/bandeja.client.tsx` (enlace «Mi historial»)

- [ ] **Step 1: La página**

```tsx
// app/mi-sig/historial/page.tsx
//
// «Todo lo que has hecho en el sistema, con su registro. Es lo que te piden mostrar
// cuando una auditoría llega a tu proceso.» Agrupado por mes; cada registro con su
// estado: a tiempo, extemporánea o cierre administrativo (R5, R8).

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import HistorialClient from './Historial.client';

export const dynamic = 'force-dynamic';

export default async function HistorialPage() {
  const session = await getServerSession(authOptions);
  const correo = (session?.user?.email ?? '').toLowerCase();

  const persona = await prisma.persona.findUnique({
    where: { correo },
    select: { id: true, nombre: true, correo: true, area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
  });
  if (!persona) return <div className="flex min-h-screen flex-col bg-app"><EncabezadoSig /></div>;

  const registros = await prisma.registroRealizado.findMany({
    where: { asignacion: { personaId: persona.id } },
    orderBy: { fechaHora: 'desc' },
    include: {
      asignacion: {
        include: {
          contenido: true,
          obligacion: { include: { contenido: true } },
          cerradaPorPersona: { select: { nombre: true } },
        },
      },
      respuestas: { include: { item: true } },
    },
  });

  const filas = registros.map((r) => {
    const a = r.asignacion;
    const contenido = a.contenido ?? a.obligacion?.contenido;
    const administrativo = a.cerradaPor !== null && a.cerradaPor !== a.personaId;
    const extemporanea = a.fechaCierre !== null && a.fechaCierre > a.fechaLimite;
    const texto =
      contenido?.tipo === 'LECTURA'
        ? `Acuse de la versión ${r.versionLeida ?? a.obligacion?.contenido.version}`
        : contenido?.tipo === 'CAPACITACION'
          ? `${r.asistio ? 'Asistió' : 'No asistió'}${r.calificacion !== null ? ` · ${r.calificacion}` : ''}`
          : contenido?.tipo === 'VERIFICACION'
            ? `${r.respuestas.length} ítem(s) respondido(s)`
            : (r.nota ?? 'Registrado');
    return {
      id: r.id,
      tipo: contenido?.tipo ?? 'TAREA',
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? 'Puntual',
      fechaHora: r.fechaHora,
      texto,
      nota: r.nota,
      aTiempo: !extemporanea && !administrativo,
      extemporanea,
      administrativo,
      cerradaPor: administrativo ? a.cerradaPorPersona?.nombre ?? 'Otra persona' : null,
      motivo: a.motivo,
      periodo: a.periodo,
      versionLeida: r.versionLeida,
    };
  });

  const resumen = {
    registros: filas.length,
    aTiempo: filas.filter((f) => f.aTiempo).length,
    cierresAdministrativos: filas.filter((f) => f.administrativo).length,
  };

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <HistorialClient
        persona={{ nombre: persona.nombre, correo: persona.correo, area: persona.area?.nombre ?? null, cargo: persona.cargo?.nombre ?? null }}
        resumen={resumen}
        filas={filas}
      />
    </div>
  );
}
```

- [ ] **Step 2: El cliente con los botones Excel/PDF**

```tsx
'use client';

// app/mi-sig/historial/Historial.client.tsx
//
// Vista previa del histórico con filtros por año y tipo, botones Excel (ruta de
// exportación real) y PDF (vista imprimible — decisión 6 del plan).

import { useMemo, useState } from 'react';

export interface HistorialFila {
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaHora: Date;
  texto: string;
  nota: string | null;
  aTiempo: boolean;
  extemporanea: boolean;
  administrativo: boolean;
  cerradaPor: string | null;
  motivo: string | null;
  periodo: string;
  versionLeida: string | null;
}

const ETIQUETA_TIPO: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};

export default function HistorialClient({
  persona,
  resumen,
  filas,
}: {
  persona: { nombre: string; correo: string; area: string | null; cargo: string | null };
  resumen: { registros: number; aTiempo: number; cierresAdministrativos: number };
  filas: HistorialFila[];
}) {
  const [anio, setAnio] = useState<'2026' | '2025' | 'todo'>('todo');
  const [tipo, setTipo] = useState<'todos' | string>('todos');

  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        if (anio !== 'todo' && !f.fechaHora.toISOString().startsWith(anio)) return false;
        if (tipo !== 'todos' && f.tipo !== tipo) return false;
        return true;
      }),
    [filas, anio, tipo],
  );

  const porMes = useMemo(() => {
    const m = new Map<string, HistorialFila[]>();
    for (const f of visibles) {
      const clave = f.fechaHora.toISOString().slice(0, 7);
      const lista = m.get(clave) ?? [];
      lista.push(f);
      m.set(clave, lista);
    }
    return [...m.entries()];
  }, [visibles]);

  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-8 pb-16 pt-8 print:max-w-none print:px-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-23 font-bold text-primary">Mi historial del SIG</h1>
          <p className="text-12_5 text-muted">
            {persona.nombre} · {persona.correo} · {[persona.area, persona.cargo].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            href="/api/sig/historial"
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            Excel
          </a>
          <button
            onClick={() => window.print()}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
          >
            Exportar en PDF
          </button>
        </div>
      </div>

      <section className="mt-5 grid grid-cols-3 gap-4">
        <ResumenCifra cifra={resumen.registros} etiqueta="Registros" />
        <ResumenCifra cifra={resumen.aTiempo} etiqueta="A tiempo" color="#0b5c44" />
        <ResumenCifra cifra={resumen.cierresAdministrativos} etiqueta="Cierres admin." color="#6b5410" />
      </section>

      <nav className="mt-5 flex items-center gap-2 print:hidden">
        {(['todo', '2026', '2025'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAnio(a)}
            aria-pressed={anio === a}
            className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
            style={{
              background: anio === a ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: anio === a ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
            }}
          >
            {a === 'todo' ? 'Todo' : a}
          </button>
        ))}
        <span className="mx-2 h-4 w-px" style={{ background: 'var(--hf-hairline-strong)' }} />
        {(['todos', 'LECTURA', 'VERIFICACION', 'CAPACITACION', 'TAREA'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className="rounded-chip px-3.5 py-1.5 text-12"
            style={{
              background: tipo === t ? 'var(--hf-warn-100)' : 'var(--hf-bg-surface)',
              color: tipo === t ? 'var(--hf-warn-text)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
            }}
          >
            {t === 'todos' ? 'Todos' : ETIQUETA_TIPO[t]}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex flex-col gap-6">
        {porMes.map(([mes, lista]) => (
          <section key={mes}>
            <h2 className="flex items-baseline gap-2 text-13 font-semibold text-primary">
              {nombreMes(mes)}
              <span className="font-mono text-10_5 text-muted">{lista.length} registro(s)</span>
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              {lista.map((f) => (
                <article
                  key={f.id}
                  className="flex items-start gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3"
                  style={f.administrativo ? { background: '#fdfaf0', borderColor: '#e0b93c' } : undefined}
                >
                  <span
                    className="flex h-[26px] w-[52px] flex-none items-center justify-center rounded-[4px] font-mono text-8_5 font-semibold uppercase"
                    style={chipTipo(f.tipo)}
                  >
                    {ETIQUETA_TIPO[f.tipo] ?? f.tipo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-12_5 font-medium text-primary">{f.titulo}</h3>
                      <span className="flex-none font-mono text-10 text-muted">{f.codigo}</span>
                    </div>
                    <p className="text-11_5 text-muted">{f.texto}</p>
                    {f.administrativo && (
                      <p className="mt-1 text-11_5" style={{ color: '#6b5410' }}>
                        Cerrada por {f.cerradaPor} en tu nombre. Motivo: {f.motivo}.
                      </p>
                    )}
                  </div>
                  <span
                    className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                    style={chipEstado(f)}
                  >
                    {f.administrativo ? 'Cierre administrativo' : f.extemporanea ? 'Extemporánea' : 'A tiempo'}
                  </span>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-11_5 text-muted print:block">
        El registro es inmutable: corregir uno es reabrir la asignación, y la reapertura
        queda en la bitácora. Un cierre administrativo aparece marcado con quién lo hizo —
        es lo que distingue «lo hice» de «me lo marcaron».
      </p>
    </main>
  );
}

function ResumenCifra({ cifra, etiqueta, color = '#12437f' }: { cifra: number; etiqueta: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-26 font-semibold tabular-nums" style={{ color }}>
        {cifra}
      </span>
      <span className="text-12_5 text-muted">{etiqueta}</span>
    </div>
  );
}

function chipTipo(tipo: string): { background: string; color: string } {
  return (
    {
      LECTURA: { background: '#e9f0fb', color: '#12437f' },
      VERIFICACION: { background: '#fff3e6', color: '#8a4407' },
      CAPACITACION: { background: '#e8f4ef', color: '#0b5c44' },
      TAREA: { background: '#f5f7f6', color: '#4a544f' },
    }[tipo] ?? { background: '#f5f7f6', color: '#4a544f' }
  );
}

function chipEstado(f: HistorialFila): { background: string; color: string } {
  if (f.administrativo) return { background: '#faf1d3', color: '#6b5410' };
  if (f.extemporanea) return { background: '#fff3e6', color: '#8a4407' };
  return { background: '#e6efe9', color: '#0b5c44' };
}

function nombreMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number);
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[mes - 1]} de ${anio}`;
}
```

- [ ] **Step 3: La ruta de exportación Excel**

```ts
// app/api/sig/historial/route.ts
//
// Exporta el histórico personal a .xlsx con exceljs. Igual que la pantalla: solo lo
// propio, con el cierre administrativo señalado (R5) y el estado escrito.

import { getServerSession } from 'next-auth';
import ExcelJS from 'exceljs';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const correo = (session?.user?.email ?? '').toLowerCase();
  const persona = await prisma.persona.findUnique({ where: { correo } });
  if (!persona) return new Response('Sin sesión', { status: 401 });

  const registros = await prisma.registroRealizado.findMany({
    where: { asignacion: { personaId: persona.id } },
    orderBy: { fechaHora: 'desc' },
    include: {
      asignacion: {
        include: { contenido: true, obligacion: { include: { contenido: true } }, cerradaPorPersona: { select: { nombre: true } } },
      },
    },
  });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Historial');
  hoja.columns = [
    { header: 'Periodo', key: 'periodo', width: 12 },
    { header: 'Fecha', key: 'fecha', width: 20 },
    { header: 'Código', key: 'codigo', width: 10 },
    { header: 'Contenido', key: 'titulo', width: 40 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Registro', key: 'texto', width: 60 },
    { header: 'Estado', key: 'estado', width: 20 },
    { header: 'Cerrada por', key: 'cerradaPor', width: 22 },
  ];
  for (const r of registros) {
    const a = r.asignacion;
    const contenido = a.contenido ?? a.obligacion?.contenido;
    const administrativo = a.cerradaPor !== null && a.cerradaPor !== a.personaId;
    const extemporanea = a.fechaCierre !== null && a.fechaCierre > a.fechaLimite;
    hoja.addRow({
      periodo: a.periodo,
      fecha: r.fechaHora.toISOString(),
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? 'Puntual',
      tipo: contenido?.tipo ?? 'TAREA',
      texto: r.nota ?? `Acuse ${r.versionLeida ? `de la versión ${r.versionLeida}` : ''}`,
      estado: administrativo ? 'CIERRE ADMINISTRATIVO' : extemporanea ? 'EXTEMPORANEA' : 'A TIEMPO',
      cerradaPor: administrativo ? (a.cerradaPorPersona?.nombre ?? 'Otra persona') : '',
    });
  }

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="historial-${persona.correo.split('@')[0]}.xlsx"`,
    },
  });
}
```

- [ ] **Step 4: El enlace desde Mi SIG**

En `app/mi-sig/bandeja.client.tsx`, junto al título, agregar:

```tsx
      <section className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-23 font-bold text-primary">{bandeja.persona?.nombre ?? 'Bandeja'}</h1>
          <p className="text-12_5 text-muted">
            {bandeja.persona
              ? [bandeja.persona.area, bandeja.persona.cargo].filter(Boolean).join(' · ') || 'Mi SIG'
              : 'Mi SIG'}
          </p>
        </div>
        <Link
          href="/mi-sig/historial"
          className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 font-medium text-muted"
        >
          Mi historial
        </Link>
      </section>
```

(importar `Link` de `next/link`)

- [ ] **Step 5: Verificar que compila y la suite verde**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 6: Commit**

```bash
git add app/mi-sig/historial/ app/api/sig/historial/ app/mi-sig/bandeja.client.tsx
git commit -m "feat(sig): historico personal agrupado por mes con exportacion Excel y vista imprimible"
```

---

## Task 8: Cierre — parámetros, documentación y gate

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Parámetros en `.env.example`**

Después del bloque «Motor de tareas del SIG»:

```
# ─── Notificaciones del SIG ───────────────────────────────────────────────────
# Hora del disparo (America/Bogota) y los días del resumen semanal (1=lunes) y
# mensual (1=primer día del mes; si cae fin de semana, se envía el lunes siguiente).
SGI_CORREO_HORA=7
SGI_CORREO_DIA_SEMANAL=1
SGI_CORREO_DIA_MENSUAL=1
```

- [ ] **Step 2: Nota en el README**

Después de la sección «Motor de tareas (SIG)»:

```markdown
## Notificaciones, indicadores e histórico (SIG)

Los correos salen por SMTP (las mismas credenciales de las menciones del SGSI) y cada
envío queda registrado en `EnvioNotificacion` — correr el disparo dos veces no duplica
nada. Reglas del diseño: sin pendientes no se envía el semanal; un correo por persona,
agrupado; el mensual cubre solo el área del destinatario y el del líder del SIG todas;
un envío fallido queda registrado con su detalle. La hora y los días de envío se
configuran con `SGI_CORREO_HORA`, `SGI_CORREO_DIA_SEMANAL` y `SGI_CORREO_DIA_MENSUAL`.

Los indicadores (cumplimiento, deuda, cierres administrativos) se calculan al leer y
viven en `lib/sig/cumplimiento.ts`: la barra de Obligaciones y el correo mensual
comparten esa única copia. El histórico personal exporta a Excel y a la vista
imprimible, con el cierre administrativo señalado con quién lo hizo.
```

- [ ] **Step 3: Gate — build completo**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: los cuatro en verde salvo el lint preexistente de `docs/handoff_v2/design/support.js`.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs(sig): documenta notificaciones, indicadores e historico"
```

---

## Verificación manual antes de dar A4 por terminado

1. `npm run dev`, con cuenta de `Responsables SIG`, invocar `enviarNotificacionesPendientes()`: debe responder los conteos (o «fuera de hora» si no es la hora configurada).
2. Sin SMTP configurado, la corrida registra `SIN_SMTP` en `envio_notificacion` y no falla en silencio.
3. Correr el disparo dos veces el mismo día: la segunda omite lo ya enviado (idempotencia).
4. Obligaciones: la barra del último periodo muestra el % calculado (≥90 verde, ≥70 naranja, <70 rojo).
5. Mi SIG → VERIFICACION: los ítems con Cumple/No cumple/No aplica; los obligatorios sin responder rechazan desde el servidor; «No aplica» deshabilitado donde el ítem no lo admite.
6. Mi SIG → TAREA/CAPACITACION: adjuntar un archivo lo guarda como `Evidencia` con `registro_id` (verificar en base).
7. `Mi historial`: la lista agrupada por mes con A tiempo/Extemporánea/Cierre administrativo; Excel descarga el .xlsx con las mismas filas.

## Lo que A4 deja listo para B

El módulo A queda completo: dominio, superficies, correos, indicadores y exportaciones. B consume el motor: las acciones de un hallazgo serán asignaciones (`Asignacion` con `obligacionId` nulo o puntuales), y la reapertura/cierre ya existen. La pantalla del histórico reutiliza el patrón de la bandeja para los registros de B.