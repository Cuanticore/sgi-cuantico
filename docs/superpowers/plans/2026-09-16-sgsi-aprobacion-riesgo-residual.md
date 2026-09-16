# Aprobación del riesgo residual · plan de implementación

> **Para quien ejecuta:** los pasos llevan casilla (`- [ ]`). Cada tarea es TDD estricto: el
> test primero, **visto en rojo**, y recién después el código. Es la Regla 1 de `HARNESS.md`
> y no tiene excepción salvo las que ese documento nombra.

**Objetivo:** que la aplicación genere el acta de aprobación del riesgo residual, la entregue
en PDF firmable, y registre quién la firmó cuando vuelve firmada en papel.

**Arquitectura:** toda la lógica vive en módulos **puros** de `lib/sgsi/` que no conocen
Prisma ni React — se prueban con literales y sin base de datos. Las server actions sólo leen,
escriben y llaman a esos módulos. El único módulo que toca puppeteer es `lib/pdf.ts`, para que
Chromium no se cuele en el grafo de nadie más.

**Stack:** Next 16 (App Router), Prisma 7 + PostgreSQL, Jest + Testing Library, `exceljs`,
`puppeteer-core` (nuevo), Tailwind 4.

**Especificación:** `docs/superpowers/specs/2026-09-16-sgsi-aprobacion-riesgo-residual-design.md`

---

## Estado de ejecución · 16/09/2026

| Tarea | Estado |
|---|---|
| 1 · Alcance | Hecha · 5 pruebas |
| 2 · Huella del alcance | Hecha · 6 pruebas |
| 3 · Firmantes | Hecha · 6 pruebas |
| 4 · Estado del acta | Hecha · 9 pruebas |
| 5 · Esquema y migración | Hecha, **sin aplicar contra una base real** — ver abajo |
| 6 · HTML del acta | Hecha · 8 pruebas |
| 7 · PDF y Dockerfile | Hecha, **Chromium sin ejecutar nunca** — ver abajo |
| 8 · Lectura de la pantalla | Hecha |
| 9 · Server actions | Hecha · la prueba de frontera cubre 38 archivos |
| 10 · Descargas y Excel | Hecha · 5 pruebas |
| 11 · Pantalla | Hecha · 9 pruebas |
| 11b · Popup de registro de firmas | Hecha · 7 pruebas. No estaba en el plan original: el plan dejaba el botón sin destino |
| 12 · Los cuatro checks | **Verde**: 0 errores de tipos, 0 de lint, 2476 pruebas en 136 suites, el build compila |
| 13 · Recorrido de punta a punta | **NO EJECUTADO** |

### Lo que NO se pudo verificar, y por qué

En la máquina donde se implementó esto **no hay base de datos ni Docker**, así que tres cosas
quedaron escritas y sin ejercitar ni una vez:

1. **La migración no se ha aplicado.** El SQL se generó con `prisma migrate diff` contra el
   esquema anterior —comparado línea a línea con la salida de Prisma, coincide— pero ningún
   Postgres lo ha corrido. Antes de mergear: `npx prisma migrate dev` sobre una base real.
2. **Chromium nunca se ejecutó.** `lib/pdf.ts` compila y el build lo empaqueta, pero nadie ha
   generado un PDF. Lo que está verificado es que `puppeteer-core` resuelve en el bundle; lo
   que no, que el binario arranque y produzca un documento legible.
3. **Ninguna escritura se ha ejercitado.** Emitir, cargar soporte, registrar firma y anular no
   se han corrido contra una base. La lógica que podía equivocarse está en los módulos puros y
   sí está probada; lo que falta es la costura entre esos módulos y Prisma — que es
   exactamente dónde vivían los tres bugs que motivaron `HARNESS.md`.

**La Tarea 13 es obligatoria antes de mergear.** No es formalidad: los tres defectos que
originaron este harness pasaron una suite en verde y reventaron en el primer uso real.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sgsi/alcance-residual.ts` | **Puro.** Qué activos entran, su huella, y quién firma cada proceso |
| `lib/sgsi/estado-acta-residual.ts` | **Puro.** El estado vigente de un acta: desactualizada, vencida, aprobada |
| `lib/sgsi/acta-residual-documento.ts` | **Puro.** El HTML del acta. Mismo patrón que `informe-documento.ts` |
| `lib/sgsi/registro-residual-libro.ts` | **Puro-ish.** El Excel del registro, con `exceljs` |
| `lib/pdf.ts` | El único que toca puppeteer. HTML → bytes |
| `prisma/schema.prisma` | Cuatro modelos nuevos |
| `app/sgsi/riesgo-residual/acta.query.ts` | La lectura de la pantalla |
| `app/sgsi/acciones/acta-residual.ts` | `'use server'` · emitir, cargar soporte, marcar firma, anular |
| `app/components/sgsi/riesgo-residual/PantallaRiesgoResidual.tsx` | El cliente |
| `app/sgsi/riesgo-residual/page.tsx` | El servidor de la pantalla |
| `app/api/sgsi/acta-residual/route.ts` | Descarga del PDF, del soporte y del Excel |
| `app/components/sgsi/SidebarSgsi.tsx:100` | La entrada del menú |
| `Dockerfile:47` | Chromium en la etapa runner |

---

## Contrato de tipos

Se define una vez, en la Tarea 1, y **todas las tareas posteriores usan exactamente estos
nombres.** Cambiarlos a mitad de camino es el defecto que la revisión de este plan busca.

```ts
// lib/sgsi/alcance-residual.ts
export interface ActivoParaAlcance {
  id: number;
  codigo: string;
  nombre: string;
  areaId: number;
  proceso: string;
  /// Las cifras residuales de TODOS sus riesgos vigentes, como llegan de Prisma
  /// (`Decimal.toString()`). `null` es «sin calcular», y uno solo contamina al activo entero.
  residuales: readonly (string | null)[];
}

export interface FilaAlcance {
  activoId: number;
  codigo: string;
  nombre: string;
  areaId: number;
  proceso: string;
  banda: string;
  cifra: string;
}

export interface Alcance {
  filas: FilaAlcance[];
  sinCalcular: number;
  fueraDeBanda: number;
}
```

---

## Tarea 1 · El alcance: qué activos entran al acta

**Archivos:**
- Crear: `lib/sgsi/alcance-residual.ts`
- Test: `lib/sgsi/__tests__/alcance-residual.test.ts`

- [ ] **Paso 1 · Escribe el test que falla**

```ts
// lib/sgsi/__tests__/alcance-residual.test.ts
import { seleccionarAlcance, type ActivoParaAlcance } from '../alcance-residual';

const BANDAS = [
  { nombre: 'Crítico', desde: 6, hasta: 999, orden: 1 },
  { nombre: 'Alto', desde: 4, hasta: 5.9999, orden: 2 },
  { nombre: 'Medio', desde: 2, hasta: 3.9999, orden: 3 },
  { nombre: 'Bajo', desde: 0, hasta: 1.9999, orden: 4 },
];

function activo(p: Partial<ActivoParaAlcance> & { id: number }): ActivoParaAlcance {
  return {
    codigo: `TEC-SRV-000${p.id}`,
    nombre: `Activo ${p.id}`,
    areaId: 1,
    proceso: 'Tecnología',
    residuales: [],
    ...p,
  };
}

describe('seleccionarAlcance', () => {
  it('admite Crítico y Alto, y deja fuera Medio y Bajo', () => {
    const r = seleccionarAlcance(
      [
        activo({ id: 1, residuales: ['7.5'] }),
        activo({ id: 2, residuales: ['4.2'] }),
        activo({ id: 3, residuales: ['2.5'] }),
        activo({ id: 4, residuales: ['0.5'] }),
      ],
      BANDAS,
    );
    expect(r.filas.map((f) => f.codigo)).toEqual(['TEC-SRV-0001', 'TEC-SRV-0002']);
    expect(r.fueraDeBanda).toBe(2);
    expect(r.sinCalcular).toBe(0);
  });

  it('toma el PEOR riesgo del activo, no el primero', () => {
    const r = seleccionarAlcance([activo({ id: 1, residuales: ['1.0', '7.5', '2.0'] })], BANDAS);
    expect(r.filas[0].banda).toBe('Crítico');
    expect(r.filas[0].cifra).toBe('7.5');
  });

  // La regla que sostiene todo lo demás, y la razón por la que este módulo existe.
  it('un solo riesgo sin calcular saca al activo entero, y lo cuenta aparte', () => {
    const r = seleccionarAlcance([activo({ id: 1, residuales: ['7.5', null] })], BANDAS);
    expect(r.filas).toHaveLength(0);
    expect(r.sinCalcular).toBe(1);
  });

  it('un activo sin riesgos no es «sin calcular»: no entra al análisis', () => {
    const r = seleccionarAlcance([activo({ id: 1, residuales: [] })], BANDAS);
    expect(r.filas).toHaveLength(0);
    expect(r.sinCalcular).toBe(0);
    expect(r.fueraDeBanda).toBe(0);
  });

  it('ordena por cifra descendente: el que más expone, primero', () => {
    const r = seleccionarAlcance(
      [
        activo({ id: 1, residuales: ['4.5'] }),
        activo({ id: 2, residuales: ['9.0'] }),
        activo({ id: 3, residuales: ['6.1'] }),
      ],
      BANDAS,
    );
    expect(r.filas.map((f) => f.cifra)).toEqual(['9', '6.1', '4.5']);
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest lib/sgsi/__tests__/alcance-residual.test.ts
```

Esperado: `Cannot find module '../alcance-residual'`.

- [ ] **Paso 3 · Escribe el módulo**

```ts
// lib/sgsi/alcance-residual.ts
//
// Qué activos entran al acta de aprobación del riesgo residual, y quién firma cada proceso.
// Módulo PURO: sin Prisma y sin React. Lo que hay acá es lo que alguien firma, y una cuenta
// que necesita una base de datos para probarse es una cuenta que nadie prueba.
//
// EL COLAPSO DE MUCHOS RIESGOS A UNA BANDA ES EL DE `peorBanda`, Y NO UNA COPIA.
// Si esta pantalla y el informe de valoración discreparan sobre la banda de un activo, el
// acta firmada quedaría sin respaldo documental: diría que se aprobó un «Alto» que el
// informe imprime como «Crítico».

import Decimal from 'decimal.js';
import type { Umbral } from './clasificar';
import { peorBanda } from './informe-valoracion';

export interface ActivoParaAlcance {
  id: number;
  codigo: string;
  nombre: string;
  areaId: number;
  proceso: string;
  /// Las cifras residuales de TODOS sus riesgos vigentes. `null` es «sin calcular», y uno
  /// solo contamina al activo entero.
  residuales: readonly (string | null)[];
}

export interface FilaAlcance {
  activoId: number;
  codigo: string;
  nombre: string;
  areaId: number;
  proceso: string;
  banda: string;
  cifra: string;
}

export interface Alcance {
  filas: FilaAlcance[];
  /// Activos excluidos porque al menos un riesgo suyo no tiene residual calculado. NO es un
  /// cero y no se puede sumar a «fuera de banda»: es deuda del modelo, no ausencia de riesgo.
  sinCalcular: number;
  /// Activos con residual calculado que quedaron en Medio o Bajo.
  fueraDeBanda: number;
}

/// Las bandas que exigen aprobación. Se nombran acá una sola vez para que el acta, las
/// tarjetas y el Excel digan exactamente las mismas.
export const BANDAS_APROBABLES = ['Crítico', 'Alto'] as const;

export function seleccionarAlcance(
  activos: readonly ActivoParaAlcance[],
  umbrales: readonly Umbral[],
  bandasAprobables: readonly string[] = BANDAS_APROBABLES,
): Alcance {
  const filas: FilaAlcance[] = [];
  let sinCalcular = 0;
  let fueraDeBanda = 0;

  for (const a of activos) {
    // Un activo sin riesgos no entra al análisis: no hay nada que calcular, y contarlo como
    // «sin calcular» afirmaría una causa que es falsa para él.
    if (a.residuales.length === 0) continue;

    const banda = peorBanda(
      a.residuales.map((r) => (r === null ? null : Number(r))),
      umbrales,
    );
    if (banda === null) {
      sinCalcular += 1;
      continue;
    }
    if (!bandasAprobables.includes(banda)) {
      fueraDeBanda += 1;
      continue;
    }

    // La cifra que se imprime es la PEOR, la misma de la que salió la banda.
    const peor = a.residuales.reduce<Decimal>(
      (m, r) => (r !== null && new Decimal(r).gt(m) ? new Decimal(r) : m),
      new Decimal(0),
    );
    filas.push({
      activoId: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      areaId: a.areaId,
      proceso: a.proceso,
      banda,
      cifra: peor.toString(),
    });
  }

  // Peor primero. El acta se lee de arriba hacia abajo y el que más expone es el que primero
  // hay que mirar. El código desempata para que el orden sea determinista.
  filas.sort((x, y) => {
    const d = new Decimal(y.cifra).comparedTo(new Decimal(x.cifra));
    return d !== 0 ? d : x.codigo.localeCompare(y.codigo);
  });

  return { filas, sinCalcular, fueraDeBanda };
}
```

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest lib/sgsi/__tests__/alcance-residual.test.ts
```

Esperado: 5 pruebas en verde.

- [ ] **Paso 5 · Commit**

```bash
git add lib/sgsi/alcance-residual.ts lib/sgsi/__tests__/alcance-residual.test.ts
git commit -m "feat(sgsi): el alcance del acta de riesgo residual, y por que un solo riesgo sin calcular saca al activo"
```

---

## Tarea 2 · La huella del alcance

Es lo que permite decir «esta acta ya no describe las cifras vigentes» (6a de la
especificación). Sin ella, un acta firmada afirma para siempre algo que dejó de ser cierto.

**Archivos:**
- Modificar: `lib/sgsi/alcance-residual.ts`
- Test: `lib/sgsi/__tests__/alcance-residual.test.ts`

- [ ] **Paso 1 · Escribe el test que falla**

```ts
// añadir a lib/sgsi/__tests__/alcance-residual.test.ts
import { huellaDeAlcance, type FilaAlcance } from '../alcance-residual';

function fila(p: Partial<FilaAlcance> & { codigo: string }): FilaAlcance {
  return {
    activoId: 1,
    nombre: 'x',
    areaId: 1,
    proceso: 'Tecnología',
    banda: 'Alto',
    cifra: '4.5',
    ...p,
  };
}

describe('huellaDeAlcance', () => {
  it('no cambia si sólo cambia el orden de la lista', () => {
    const a = [fila({ codigo: 'A-1' }), fila({ codigo: 'B-2' })];
    const b = [fila({ codigo: 'B-2' }), fila({ codigo: 'A-1' })];
    expect(huellaDeAlcance(a)).toBe(huellaDeAlcance(b));
  });

  it('cambia si cambia una cifra', () => {
    const a = [fila({ codigo: 'A-1', cifra: '4.5' })];
    const b = [fila({ codigo: 'A-1', cifra: '4.6' })];
    expect(huellaDeAlcance(a)).not.toBe(huellaDeAlcance(b));
  });

  it('cambia si cambia una banda', () => {
    const a = [fila({ codigo: 'A-1', banda: 'Alto' })];
    const b = [fila({ codigo: 'A-1', banda: 'Crítico' })];
    expect(huellaDeAlcance(a)).not.toBe(huellaDeAlcance(b));
  });

  it('cambia si entra un activo nuevo', () => {
    const a = [fila({ codigo: 'A-1' })];
    const b = [fila({ codigo: 'A-1' }), fila({ codigo: 'A-2' })];
    expect(huellaDeAlcance(a)).not.toBe(huellaDeAlcance(b));
  });

  // Que un activo se renombre no cambia lo que se aprobó: se aprobó su riesgo, no su nombre.
  it('no cambia si sólo cambia el nombre del activo', () => {
    const a = [fila({ codigo: 'A-1', nombre: 'Servidor' })];
    const b = [fila({ codigo: 'A-1', nombre: 'Servidor de aplicaciones' })];
    expect(huellaDeAlcance(a)).toBe(huellaDeAlcance(b));
  });

  it('la lista vacía tiene huella, y es estable', () => {
    expect(huellaDeAlcance([])).toBe(huellaDeAlcance([]));
    expect(huellaDeAlcance([])).toHaveLength(64);
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest lib/sgsi/__tests__/alcance-residual.test.ts -t huellaDeAlcance
```

Esperado: `huellaDeAlcance is not a function`.

- [ ] **Paso 3 · Implementa**

```ts
// añadir a lib/sgsi/alcance-residual.ts
import { createHash } from 'node:crypto';

/// SHA-256 de lo que el acta afirma: código, banda y cifra de cada activo, ordenado por
/// código para que el mismo alcance dé siempre la misma huella.
///
/// **No entran el nombre ni el proceso, a propósito.** Renombrar un activo o moverlo de área
/// no cambia el riesgo que alguien aprobó, y hacer que invalide un acta firmada obligaría a
/// recoger firmas otra vez por una corrección ortográfica.
export function huellaDeAlcance(filas: readonly FilaAlcance[]): string {
  const canonica = [...filas]
    .map((f) => `${f.codigo}|${f.banda}|${f.cifra}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonica).digest('hex');
}
```

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest lib/sgsi/__tests__/alcance-residual.test.ts
```

Esperado: 11 pruebas en verde.

- [ ] **Paso 5 · Commit**

```bash
git add lib/sgsi/alcance-residual.ts lib/sgsi/__tests__/alcance-residual.test.ts
git commit -m "feat(sgsi): la huella del alcance, que es lo que deja caducar un acta cuando cambian las cifras"
```

---

## Tarea 3 · Los firmantes: de proceso a persona

**Archivos:**
- Modificar: `lib/sgsi/alcance-residual.ts`
- Test: `lib/sgsi/__tests__/alcance-residual.test.ts`

- [ ] **Paso 1 · Escribe el test que falla**

```ts
// añadir a lib/sgsi/__tests__/alcance-residual.test.ts
import { resolverFirmantes, type ProcesoParaFirma } from '../alcance-residual';

describe('resolverFirmantes', () => {
  const tecnologia: ProcesoParaFirma = {
    areaId: 1,
    proceso: 'Tecnología',
    cargoId: 10,
    cargoNombre: 'Líder de Tecnología',
    candidatos: [{ id: 100, nombre: 'Ana Ruiz' }],
  };

  it('resuelve el proceso cuyo cargo líder tiene una persona', () => {
    const [f] = resolverFirmantes([tecnologia], [fila({ codigo: 'A-1', areaId: 1 })]);
    expect(f.resoluble).toBe(true);
    expect(f.candidatos).toHaveLength(1);
    expect(f.activos).toBe(1);
  });

  it('con varias personas en el cargo, todas son candidatas', () => {
    const [f] = resolverFirmantes(
      [{ ...tecnologia, candidatos: [{ id: 100, nombre: 'Ana Ruiz' }, { id: 101, nombre: 'Luis Paz' }] }],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(f.resoluble).toBe(true);
    expect(f.candidatos.map((c) => c.nombre)).toEqual(['Ana Ruiz', 'Luis Paz']);
  });

  // Los dos estados que la pantalla NO puede confundir: uno es deuda del catálogo de cargos,
  // el otro es una firma que falta.
  it('un cargo líder sin persona activa NO es resoluble', () => {
    const [f] = resolverFirmantes(
      [{ ...tecnologia, candidatos: [] }],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(f.resoluble).toBe(false);
    expect(f.candidatos).toHaveLength(0);
  });

  it('un área sin cargo líder tampoco es resoluble, y lo dice distinto', () => {
    const [f] = resolverFirmantes(
      [{ ...tecnologia, cargoId: null, cargoNombre: null, candidatos: [] }],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(f.resoluble).toBe(false);
    expect(f.cargoId).toBeNull();
  });

  it('omite los procesos que no ponen ningún activo en el acta', () => {
    const contabilidad: ProcesoParaFirma = { ...tecnologia, areaId: 2, proceso: 'Contabilidad' };
    const firmantes = resolverFirmantes([tecnologia, contabilidad], [fila({ codigo: 'A-1', areaId: 1 })]);
    expect(firmantes.map((f) => f.proceso)).toEqual(['Tecnología']);
  });

  it('ordena por cantidad de activos, de mayor a menor', () => {
    const contabilidad: ProcesoParaFirma = { ...tecnologia, areaId: 2, proceso: 'Contabilidad' };
    const firmantes = resolverFirmantes(
      [tecnologia, contabilidad],
      [
        fila({ codigo: 'A-1', areaId: 1 }),
        fila({ codigo: 'A-2', areaId: 2 }),
        fila({ codigo: 'A-3', areaId: 2 }),
      ],
    );
    expect(firmantes.map((f) => f.proceso)).toEqual(['Contabilidad', 'Tecnología']);
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest lib/sgsi/__tests__/alcance-residual.test.ts -t resolverFirmantes
```

Esperado: `resolverFirmantes is not a function`.

- [ ] **Paso 3 · Implementa**

```ts
// añadir a lib/sgsi/alcance-residual.ts

/// Un proceso tal como llega del catálogo: su cargo líder y las personas que hoy lo ocupan.
export interface ProcesoParaFirma {
  areaId: number;
  proceso: string;
  /// `Area.liderCargoId`. Nulo cuando el área no tiene cargo líder declarado.
  cargoId: number | null;
  cargoNombre: string | null;
  /// Las personas ACTIVAS cuyo `cargoId` es ese cargo. Puede haber varias, o ninguna.
  candidatos: { id: number; nombre: string }[];
}

/// Un renglón de la hoja de firmas.
export interface FirmanteProceso {
  areaId: number;
  proceso: string;
  cargoId: number | null;
  cargoNombre: string | null;
  /// Las personas que pueden firmar por el proceso. Basta con que UNA firme.
  candidatos: { id: number; nombre: string }[];
  /// Falso cuando el área no tiene cargo líder, o el cargo no tiene persona activa.
  ///
  /// **No se confunde con «todavía no ha firmado».** Un proceso no resoluble es una deuda del
  /// catálogo de cargos y no se arregla insistiéndole a nadie; uno resoluble sin firma es una
  /// persona a la que hay que buscar. La pantalla los dice distinto porque se resuelven
  /// distinto.
  resoluble: boolean;
  /// Cuántos activos del acta pertenecen a este proceso.
  activos: number;
}

/// La hoja de firmas: un renglón por proceso QUE PONE ACTIVOS en el acta.
///
/// Un proceso sin activos en banda Alta o Crítica no tiene nada que aprobar, y hacerlo firmar
/// una lista vacía enseña a firmar sin leer.
export function resolverFirmantes(
  procesos: readonly ProcesoParaFirma[],
  filas: readonly FilaAlcance[],
): FirmanteProceso[] {
  const porArea = new Map<number, number>();
  for (const f of filas) porArea.set(f.areaId, (porArea.get(f.areaId) ?? 0) + 1);

  return procesos
    .filter((p) => (porArea.get(p.areaId) ?? 0) > 0)
    .map((p) => ({
      areaId: p.areaId,
      proceso: p.proceso,
      cargoId: p.cargoId,
      cargoNombre: p.cargoNombre,
      candidatos: p.candidatos,
      resoluble: p.cargoId !== null && p.candidatos.length > 0,
      activos: porArea.get(p.areaId) ?? 0,
    }))
    .sort((a, b) => b.activos - a.activos || a.proceso.localeCompare(b.proceso));
}
```

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest lib/sgsi/__tests__/alcance-residual.test.ts
```

Esperado: 17 pruebas en verde.

- [ ] **Paso 5 · Commit**

```bash
git add lib/sgsi/alcance-residual.ts lib/sgsi/__tests__/alcance-residual.test.ts
git commit -m "feat(sgsi): los firmantes del acta salen del cargo lider del proceso, y «sin resolver» no es «sin firmar»"
```

---

## Tarea 4 · El estado vigente del acta

**Archivos:**
- Crear: `lib/sgsi/estado-acta-residual.ts`
- Test: `lib/sgsi/__tests__/estado-acta-residual.test.ts`

- [ ] **Paso 1 · Escribe el test que falla**

```ts
// lib/sgsi/__tests__/estado-acta-residual.test.ts
import { estadoVigente, type ActaParaEstado } from '../estado-acta-residual';

const HOY = new Date('2026-09-16T12:00:00Z');

function acta(p: Partial<ActaParaEstado> = {}): ActaParaEstado {
  return {
    estado: 'EMITIDA',
    alcanceHash: 'aaa',
    generadaEn: new Date('2026-09-01T00:00:00Z'),
    procesos: 3,
    procesosFirmados: 0,
    ...p,
  };
}

describe('estadoVigente', () => {
  it('una acta recién emitida y sin firmas sigue EMITIDA', () => {
    expect(estadoVigente(acta(), 'aaa', HOY, 12)).toBe('EMITIDA');
  });

  it('con todos los procesos firmados pasa a APROBADA', () => {
    expect(estadoVigente(acta({ procesos: 3, procesosFirmados: 3 }), 'aaa', HOY, 12)).toBe('APROBADA');
  });

  it('con firmas parciales NO está aprobada', () => {
    expect(estadoVigente(acta({ procesos: 3, procesosFirmados: 2 }), 'aaa', HOY, 12)).toBe('EMITIDA');
  });

  it('si la huella actual difiere de la firmada, queda DESACTUALIZADA', () => {
    expect(estadoVigente(acta({ procesosFirmados: 3, procesos: 3 }), 'bbb', HOY, 12)).toBe('DESACTUALIZADA');
  });

  it('pasada la vigencia queda VENCIDA', () => {
    const vieja = acta({ generadaEn: new Date('2025-09-01T00:00:00Z'), procesos: 3, procesosFirmados: 3 });
    expect(estadoVigente(vieja, 'aaa', HOY, 12)).toBe('VENCIDA');
  });

  // Desactualizada gana a vencida: decir «venció» de una acta cuyas cifras además cambiaron
  // manda a renovar lo que en realidad hay que rehacer.
  it('desactualizada gana a vencida', () => {
    const vieja = acta({ generadaEn: new Date('2025-09-01T00:00:00Z'), procesos: 3, procesosFirmados: 3 });
    expect(estadoVigente(vieja, 'bbb', HOY, 12)).toBe('DESACTUALIZADA');
  });

  it('una acta ANULADA no vuelve a ningún otro estado', () => {
    expect(estadoVigente(acta({ estado: 'ANULADA' }), 'bbb', HOY, 12)).toBe('ANULADA');
  });

  it('un acta sin procesos que firmar no se declara aprobada sola', () => {
    expect(estadoVigente(acta({ procesos: 0, procesosFirmados: 0 }), 'aaa', HOY, 12)).toBe('EMITIDA');
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest lib/sgsi/__tests__/estado-acta-residual.test.ts
```

Esperado: `Cannot find module '../estado-acta-residual'`.

- [ ] **Paso 3 · Implementa**

```ts
// lib/sgsi/estado-acta-residual.ts
//
// El estado de un acta se CALCULA AL LEER, nunca se guarda resuelto. Una banda guardada es
// un segundo lugar donde una cifra puede vivir, y dos lugares es como un informe termina
// contradiciéndose — la misma doctrina de `lib/sgsi/clasificar.ts`.
//
// La columna `estado` de la tabla guarda sólo lo que NO es derivable: si el acta fue anulada
// a mano. Todo lo demás sale de comparar la huella y la fecha contra el momento en que se lee.

export type EstadoActa = 'EMITIDA' | 'APROBADA' | 'DESACTUALIZADA' | 'VENCIDA' | 'ANULADA';

export interface ActaParaEstado {
  /// Lo guardado. Sólo `ANULADA` es significativo acá; el resto se recalcula.
  estado: EstadoActa;
  alcanceHash: string;
  generadaEn: Date;
  procesos: number;
  procesosFirmados: number;
}

/// Suma meses a una fecha sin arrastrar una librería. El día 31 en un mes de 30 cae al
/// último día del mes, que es lo que cualquiera espera de «un año después».
function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

export function estadoVigente(
  acta: ActaParaEstado,
  huellaActual: string,
  hoy: Date,
  vigenciaMeses: number,
): EstadoActa {
  // Anular es un acto deliberado con motivo escrito. Nada lo revierte al leer.
  if (acta.estado === 'ANULADA') return 'ANULADA';

  // **Desactualizada gana a vencida, y el orden importa.** Decirle «venció, renuévela» a
  // alguien cuya acta además ya no describe las cifras vigentes lo manda a recoger firmas
  // sobre un documento que hay que rehacer, no renovar.
  if (huellaActual !== acta.alcanceHash) return 'DESACTUALIZADA';

  if (hoy > sumarMeses(acta.generadaEn, vigenciaMeses)) return 'VENCIDA';

  // Un acta sin procesos que firmar no se declara aprobada sola: aprobada significa que
  // alguien firmó, y nadie firmó.
  if (acta.procesos > 0 && acta.procesosFirmados >= acta.procesos) return 'APROBADA';

  return 'EMITIDA';
}
```

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest lib/sgsi/__tests__/estado-acta-residual.test.ts
```

Esperado: 8 pruebas en verde.

- [ ] **Paso 5 · Commit**

```bash
git add lib/sgsi/estado-acta-residual.ts lib/sgsi/__tests__/estado-acta-residual.test.ts
git commit -m "feat(sgsi): el estado del acta residual se calcula al leer, y desactualizada gana a vencida"
```

---

## Tarea 5 · El esquema

Sin test: es una migración sin comportamiento observable, que es una de las excepciones que
`HARNESS.md` nombra en la Regla 1.

**Archivos:**
- Modificar: `prisma/schema.prisma`
- Crear: `prisma/migrations/<timestamp>_acta_riesgo_residual/migration.sql` (lo genera Prisma)

- [ ] **Paso 1 · Añade los modelos al final de `prisma/schema.prisma`**

```prisma
// ─── Aprobación del riesgo residual ────────────────────────────────────────────────────

enum EstadoActaResidual {
  EMITIDA
  APROBADA
  DESACTUALIZADA
  VENCIDA
  ANULADA

  @@map("estado_acta_residual")
}

/// El acta de aprobación del riesgo residual de un periodo.
///
/// **Se firma FUERA del sistema**, en papel o en sesión. La aplicación genera el documento y
/// registra quién lo firmó cuando vuelve. Hay en el repositorio un mecanismo completo de firma
/// electrónica (`ActaAceptacion`, REQ-SIG-02) y **no se usa acá a propósito**: la decisión del
/// 16/09/2026 fue firmar por fuera. Si mañana se quiere electrónica, el camino es
/// `ContenidoSig` con `exigeFirma` y no hay que construir nada.
model ActaRiesgoResidual {
  id              Int                @id @default(autoincrement())
  /// `ARR-2026-001`. El año va en el código porque la numeración se reinicia con él.
  codigo          String             @unique
  periodo         String
  /// Sólo `ANULADA` es significativo: el resto lo recalcula `estadoVigente` al leer.
  estado          EstadoActaResidual @default(EMITIDA)
  /// SHA-256 de `código|banda|cifra` de cada activo, ordenado. Si el de hoy difiere, el acta
  /// afirma cifras que ya no son las vigentes.
  alcanceHash     String             @map("alcance_hash")
  /// Cuántos activos quedaron FUERA por eficacia desconocida. Va en el acta y en el tablero:
  /// un acta que no lo dice se lee como si cubriera todo.
  sinCalcular     Int                @map("sin_calcular")
  generadaEn      DateTime           @default(now()) @map("generada_en")
  generadaPorId   Int                @map("generada_por_id")
  /// SHA-256 del PDF emitido.
  documentoSha256 String             @map("documento_sha256")
  /// El PDF. En base de datos, con el precedente de `EvidenciaArchivo` y la misma razón: la
  /// evidencia que sostiene una auditoría no vive en un bucket que alguien puede vaciar.
  ///
  /// **Ninguna consulta de listado selecciona esta columna.** Sólo la ruta de descarga.
  documento       Bytes
  motivoAnulacion String?            @map("motivo_anulacion")

  generadaPor Persona                    @relation("ActaResidualGeneradaPor", fields: [generadaPorId], references: [id])
  activos     ActivoActaResidual[]
  firmantes   FirmanteActaResidual[]
  soportes    SoporteActaResidual[]

  @@index([periodo])
  @@map("acta_riesgo_residual")
}

/// El detalle CONGELADO: un renglón por activo del acta.
///
/// Los textos se copian y no se referencian. El acta tiene que seguir diciendo lo que decía
/// aunque el activo se renombre o cambie de área — es la doctrina de la regla F2 de
/// `ActaAceptacion`, y acá importa igual: es evidencia ante un auditor.
model ActivoActaResidual {
  id                     Int     @id @default(autoincrement())
  actaId                 Int     @map("acta_id")
  activoId               Int     @map("activo_id")
  codigo                 String
  nombre                 String
  proceso                String
  banda                  String
  cifraResidual          Decimal @map("cifra_residual") @db.Decimal(12, 4)
  /// El plan de tratamiento citado, cuando existe. Se cita, no se reescribe.
  planCodigo             String? @map("plan_codigo")
  planTipo               String? @map("plan_tipo")
  /// La justificación de la excepción, para la banda Crítica.
  ///
  /// **Nula al emitir, y a propósito.** El acta se firma en papel: el PDF imprime esta columna
  /// en blanco para que se escriba a mano junto a la firma. Esta fila existe para
  /// TRANSCRIBIRLA después, de modo que la excepción se pueda consultar sin abrir el escaneo.
  /// Exigirla al emitir obligaría a redactar en pantalla una justificación que todavía no se
  /// ha discutido en la sesión donde se firma.
  justificacionExcepcion String? @map("justificacion_excepcion")

  acta   ActaRiesgoResidual @relation(fields: [actaId], references: [id], onDelete: Cascade)
  activo Activo             @relation("ActivoEnActaResidual", fields: [activoId], references: [id])

  @@unique([actaId, activoId])
  @@map("activo_acta_residual")
}

/// Un renglón de la hoja de firmas: un proceso.
model FirmanteActaResidual {
  id          Int      @id @default(autoincrement())
  actaId      Int      @map("acta_id")
  areaId      Int      @map("area_id")
  proceso     String
  cargoId     Int?     @map("cargo_id")
  cargoNombre String?  @map("cargo_nombre")
  /// **Falso ≠ «no ha firmado».** `resoluble` en false es una deuda del catálogo de cargos —el
  /// área no tiene líder, o el cargo no tiene persona activa—; `resoluble` en true con
  /// `aprobo` en false es una persona a la que hay que buscar. Se resuelven distinto, así que
  /// se guardan distinto.
  resoluble   Boolean
  activos     Int
  aprobo      Boolean  @default(false)
  /// Quién firmó EN EL PAPEL, elegida entre los candidatos del cargo. Nula hasta que firme.
  firmanteId  Int?     @map("firmante_id")
  fechaFirma  DateTime? @map("fecha_firma") @db.Date
  soporteId   Int?     @map("soporte_id")
  /// Quién REGISTRÓ la firma en el sistema. Casi nunca es quien firmó, y el sistema no puede
  /// afirmar que la persona actuó dentro de él cuando firmó en papel.
  registradoPorId Int?  @map("registrado_por_id")
  motivo          String?

  acta          ActaRiesgoResidual   @relation(fields: [actaId], references: [id], onDelete: Cascade)
  area          Area                 @relation("AreaEnActaResidual", fields: [areaId], references: [id])
  firmante      Persona?             @relation("FirmanteActaResidual", fields: [firmanteId], references: [id])
  registradoPor Persona?             @relation("RegistradorActaResidual", fields: [registradoPorId], references: [id])
  soporte       SoporteActaResidual? @relation(fields: [soporteId], references: [id])

  @@unique([actaId, areaId])
  @@map("firmante_acta_residual")
}

/// El acta firmada que vuelve escaneada. Uno a muchos: una aprobación puede recogerse en dos
/// sesiones, y cada carga cubre a quienes firmaron en ella.
model SoporteActaResidual {
  id             Int      @id @default(autoincrement())
  actaId         Int      @map("acta_id")
  nombreOriginal String   @map("nombre_original")
  mime           String
  tamano         Int
  sha256         String
  /// Ninguna consulta de listado selecciona esta columna. Sólo la ruta de descarga.
  bytes          Bytes
  cargadoPorId   Int      @map("cargado_por_id")
  cargadoEn      DateTime @default(now()) @map("cargado_en")
  motivo         String?

  acta       ActaRiesgoResidual     @relation(fields: [actaId], references: [id], onDelete: Cascade)
  cargadoPor Persona                @relation("SoporteResidualCargadoPor", fields: [cargadoPorId], references: [id])
  firmantes  FirmanteActaResidual[]

  @@map("soporte_acta_residual")
}
```

- [ ] **Paso 2 · Declara las relaciones inversas**

En `model Persona`, añade:

```prisma
  actasResidualGeneradas   ActaRiesgoResidual[]   @relation("ActaResidualGeneradaPor")
  firmasResidual           FirmanteActaResidual[] @relation("FirmanteActaResidual")
  firmasResidualRegistradas FirmanteActaResidual[] @relation("RegistradorActaResidual")
  soportesResidualCargados SoporteActaResidual[]  @relation("SoporteResidualCargadoPor")
```

En `model Activo`, añade:

```prisma
  actasResidual ActivoActaResidual[] @relation("ActivoEnActaResidual")
```

En `model Area`, añade:

```prisma
  actasResidual FirmanteActaResidual[] @relation("AreaEnActaResidual")
```

- [ ] **Paso 3 · Genera la migración y el cliente**

```bash
npx prisma migrate dev --name acta_riesgo_residual
npx prisma generate
```

Esperado: la migración se crea y aplica sin pérdida de datos (sólo hay tablas nuevas).

- [ ] **Paso 4 · Comprueba que los tipos compilan**

```bash
npx tsc --noEmit
```

Esperado: 0 errores. Si aparecen ~30 errores de `@prisma/client`, el cliente no se regeneró:
vuelve al paso 3.

- [ ] **Paso 5 · Añade el parámetro de vigencia**

En `prisma/seeds/escalas.ts`, dentro del arreglo `parametros`:

```ts
{
  clave: 'vigencia_acta_residual_meses',
  valor: '12',
  descripcion: 'Meses que una acta de aprobación del riesgo residual sigue vigente antes de exigir renovación.',
},
```

- [ ] **Paso 6 · Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seeds/escalas.ts
git commit -m "feat(sgsi): las cuatro tablas del acta de aprobacion del riesgo residual"
```

---

## Tarea 6 · El HTML del acta

**Archivos:**
- Crear: `lib/sgsi/acta-residual-documento.ts`
- Test: `lib/sgsi/__tests__/acta-residual-documento.test.ts`

Lee primero `lib/sgsi/informe-documento.ts:29-37`: **todo va en estilos en línea y los colores
son literales.** No es descuido, es que el importador de HTML de Word ignora las hojas de
estilo y no resuelve propiedades personalizadas de CSS.

- [ ] **Paso 1 · Escribe el test que falla**

```ts
// lib/sgsi/__tests__/acta-residual-documento.test.ts
import { actaResidualHtml, type DatosActaResidual } from '../acta-residual-documento';

function datos(p: Partial<DatosActaResidual> = {}): DatosActaResidual {
  return {
    codigo: 'ARR-2026-001',
    periodo: '2026',
    generadaEn: '2026-09-16',
    generadaPor: 'Daniel Medina',
    alcanceHash: 'a'.repeat(64),
    sinCalcular: 0,
    filas: [],
    firmantes: [],
    ...p,
  };
}

const ALTO = {
  activoId: 1, codigo: 'TEC-SRV-0001', nombre: 'Servidor', areaId: 1,
  proceso: 'Tecnología', banda: 'Alto', cifra: '4.5',
};
const CRITICO = {
  activoId: 2, codigo: 'TEC-BDD-0002', nombre: 'Base de datos', areaId: 1,
  proceso: 'Tecnología', banda: 'Crítico', cifra: '8.1',
};

describe('actaResidualHtml', () => {
  it('separa las excepciones al criterio de los activos en banda Alta', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO, CRITICO] }));
    const iExcepciones = html.indexOf('Excepciones al criterio de aceptación');
    const iAltos = html.indexOf('Activos en banda Alta');
    expect(iExcepciones).toBeGreaterThan(-1);
    expect(iAltos).toBeGreaterThan(-1);
    expect(html).toContain('TEC-BDD-0002');
    expect(html).toContain('TEC-SRV-0001');
  });

  it('dice en el acta cuántos activos quedaron sin calcular', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO], sinCalcular: 12 }));
    expect(html).toContain('12');
    expect(html).toContain('sin calcular');
  });

  // Un acta que no lo dice se lee como si cubriera todo el inventario.
  it('cuando no hay activos sin calcular lo dice igual, con un cero', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO], sinCalcular: 0 }));
    expect(html).toContain('sin calcular');
  });

  it('rotula los procesos sin firmante resoluble en la hoja de firmas', () => {
    const html = actaResidualHtml(
      datos({
        filas: [ALTO],
        firmantes: [
          { areaId: 1, proceso: 'Tecnología', cargoId: null, cargoNombre: null, candidatos: [], resoluble: false, activos: 1 },
        ],
      }),
    );
    expect(html).toContain('Sin firmante resoluble');
  });

  it('imprime la huella del alcance en la constancia', () => {
    const html = actaResidualHtml(datos({ alcanceHash: 'b'.repeat(64) }));
    expect(html).toContain('b'.repeat(64));
  });

  it('escapa el HTML de los nombres', () => {
    const html = actaResidualHtml(
      datos({ filas: [{ ...ALTO, nombre: '<script>alert(1)</script>' }] }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest lib/sgsi/__tests__/acta-residual-documento.test.ts
```

Esperado: `Cannot find module '../acta-residual-documento'`.

- [ ] **Paso 3 · Implementa**

Estructura obligatoria, en este orden (§«El acta» de la especificación): encabezado ·
declaración · resumen · activos en banda Alta · excepciones al criterio · hoja de firmas ·
constancia.

```ts
// lib/sgsi/acta-residual-documento.ts
//
// El acta de aprobación del riesgo residual, como documento: una función pura que devuelve
// HTML. Misma decisión que `lib/sgsi/informe-documento.ts`, y por las mismas razones: la
// App Router prohíbe `react-dom/server` en su grafo, y esto además se puede probar.
//
// TODO VA EN ESTILOS EN LÍNEA Y LOS COLORES SON LITERALES. Es feo y es deliberado: el
// importador de HTML de Word ignora las hojas de estilo y no resuelve `var(--…)`.

import type { FilaAlcance, FirmanteProceso } from './alcance-residual';

export interface DatosActaResidual {
  codigo: string;
  periodo: string;
  /// `AAAA-MM-DD`.
  generadaEn: string;
  generadaPor: string;
  alcanceHash: string;
  sinCalcular: number;
  filas: readonly FilaAlcance[];
  firmantes: readonly FirmanteProceso[];
}

const TINTA = '#1f2a37';
const SUAVE = '#5b6875';
const LINEA = '#d7dde3';
const CABECERA = '#f1f4f7';
const CRITICO_BG = '#a52016';

const S = {
  cuerpo: `font-family:'Segoe UI',Calibri,Arial,sans-serif;font-size:10.5pt;color:${TINTA};line-height:1.45`,
  h1: `font-size:16pt;font-weight:700;color:#12263f;margin:0 0 4pt`,
  h2: `font-size:12pt;font-weight:700;color:#12263f;margin:18pt 0 6pt`,
  tabla: 'border-collapse:collapse;width:100%;font-size:9.5pt;margin:0 0 14pt',
  th: `border:1px solid ${LINEA};background:${CABECERA};padding:4pt 6pt;text-align:left;font-weight:600`,
  td: `border:1px solid ${LINEA};padding:4pt 6pt;vertical-align:top`,
  num: `border:1px solid ${LINEA};padding:4pt 6pt;text-align:right`,
  nota: `font-size:9pt;color:${SUAVE};margin:0 0 10pt`,
};

/// La declaración de lo que se firma. **Vive en código y versionada acá**, no en la base:
/// si mañana cambia la redacción, las actas ya emitidas conservan la suya porque su PDF ya
/// está congelado. Es la doctrina de la regla F2 de `ActaAceptacion`.
const DECLARACION = [
  'Quienes firmamos este documento, en calidad de responsables de los procesos relacionados,',
  'declaramos que conocemos el riesgo residual de los activos de información listados a',
  'continuación, que comprendemos el nivel de exposición que representan después de los',
  'controles aplicados, y que lo aceptamos como riesgo asumido por la organización para el',
  'periodo indicado.',
  '',
  'Esta aprobación no extingue la obligación de tratamiento: los planes citados siguen',
  'vigentes, y el riesgo aquí aprobado se revisa al vencimiento de este documento o antes si',
  'las cifras que lo sustentan cambian.',
].join(' ');

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tablaDeActivos(filas: readonly FilaAlcance[], conJustificacion: boolean): string {
  const p: string[] = [
    `<table style="${S.tabla}"><thead><tr>`,
    `<th style="${S.th}">Código</th><th style="${S.th}">Activo</th>`,
    `<th style="${S.th}">Proceso</th><th style="${S.th}">Banda</th>`,
    `<th style="${S.th};text-align:right">Residual</th>`,
    conJustificacion ? `<th style="${S.th}">Justificación de la excepción</th>` : '',
    '</tr></thead><tbody>',
  ];
  for (const f of filas) {
    p.push(
      `<tr><td style="${S.td};white-space:nowrap;font-family:Consolas,monospace">${esc(f.codigo)}</td>`,
      `<td style="${S.td}">${esc(f.nombre)}</td>`,
      `<td style="${S.td}">${esc(f.proceso)}</td>`,
      `<td style="${S.td};white-space:nowrap">${esc(f.banda)}</td>`,
      `<td style="${S.num}">${esc(f.cifra)}</td>`,
      conJustificacion ? `<td style="${S.td}">&nbsp;</td>` : '',
      '</tr>',
    );
  }
  p.push('</tbody></table>');
  return p.join('');
}

export function actaResidualHtml(d: DatosActaResidual): string {
  const criticos = d.filas.filter((f) => f.banda === 'Crítico');
  const altos = d.filas.filter((f) => f.banda !== 'Crítico');

  const p: string[] = [
    `<div style="${S.cuerpo}">`,
    `<h1 style="${S.h1}">Acta de aprobación del riesgo residual</h1>`,
    `<p style="${S.nota}">${esc(d.codigo)} · Periodo ${esc(d.periodo)} · Generada el ${esc(d.generadaEn)} por ${esc(d.generadaPor)}</p>`,

    `<h2 style="${S.h2}">1 · Declaración</h2>`,
    `<p style="margin:0 0 12pt;[text-wrap:pretty]">${esc(DECLARACION)}</p>`,

    `<h2 style="${S.h2}">2 · Resumen</h2>`,
    `<table style="${S.tabla}"><tbody>`,
    `<tr><td style="${S.td}">Activos en banda Crítica (excepciones)</td><td style="${S.num}">${criticos.length}</td></tr>`,
    `<tr><td style="${S.td}">Activos en banda Alta</td><td style="${S.num}">${altos.length}</td></tr>`,
    `<tr><td style="${S.td}">Procesos que firman</td><td style="${S.num}">${d.firmantes.length}</td></tr>`,
    `<tr><td style="${S.td}">Activos excluidos por residual <strong>sin calcular</strong></td><td style="${S.num}">${d.sinCalcular}</td></tr>`,
    '</tbody></table>',
    `<p style="${S.nota}">Los activos <strong>sin calcular</strong> quedan fuera de esta acta y no se aprueban: basta con que un riesgo del activo no tenga residual calculado para que su peor cifra sea desconocida, y firmar un techo que nadie midió no es aprobar nada. Eficacia desconocida no es riesgo bajo.</p>`,
  ];

  if (altos.length > 0) {
    p.push(`<h2 style="${S.h2}">3 · Activos en banda Alta</h2>`, tablaDeActivos(altos, false));
  }

  if (criticos.length > 0) {
    p.push(
      `<h2 style="${S.h2}">4 · Excepciones al criterio de aceptación</h2>`,
      `<p style="${S.nota}">El criterio de aceptación vigente declara la banda Crítica como <strong style="color:${CRITICO_BG}">no aceptable — mitigar o evitar</strong>. Aprobar estos activos no es aceptarlos dentro del criterio: es una excepción, y cada una exige justificación escrita.</p>`,
      tablaDeActivos(criticos, true),
    );
  }

  p.push(`<h2 style="${S.h2}">5 · Hoja de firmas</h2>`);
  p.push(
    `<table style="${S.tabla}"><thead><tr>`,
    `<th style="${S.th}">Proceso</th><th style="${S.th}">Cargo</th><th style="${S.th}">Nombre</th>`,
    `<th style="${S.th};text-align:right">Activos</th><th style="${S.th}">Firma</th><th style="${S.th}">Fecha</th>`,
    '</tr></thead><tbody>',
  );
  for (const f of d.firmantes) {
    // Nunca una celda vacía: no distingue «nadie puede firmar esto» de «se nos olvidó».
    const nombre = f.resoluble
      ? esc(f.candidatos.map((c) => c.nombre).join(' / '))
      : '<strong>Sin firmante resoluble</strong>';
    p.push(
      `<tr><td style="${S.td}">${esc(f.proceso)}</td>`,
      `<td style="${S.td}">${esc(f.cargoNombre ?? '—')}</td>`,
      `<td style="${S.td}">${nombre}</td>`,
      `<td style="${S.num}">${f.activos}</td>`,
      `<td style="${S.td};height:30pt">&nbsp;</td><td style="${S.td}">&nbsp;</td></tr>`,
    );
  }
  p.push('</tbody></table>');

  p.push(
    `<h2 style="${S.h2}">6 · Constancia</h2>`,
    `<p style="${S.nota}">Huella SHA-256 del alcance aprobado:<br><span style="font-family:Consolas,monospace;font-size:8.5pt">${esc(d.alcanceHash)}</span></p>`,
    `<p style="${S.nota}">La huella se calcula sobre el código, la banda y la cifra residual de cada activo listado. Si alguna de esas cifras cambia, esta acta deja de describir el riesgo vigente y el sistema la marca como desactualizada.</p>`,
    '</div>',
  );

  return p.join('');
}
```

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest lib/sgsi/__tests__/acta-residual-documento.test.ts
```

Esperado: 6 pruebas en verde.

- [ ] **Paso 5 · Commit**

```bash
git add lib/sgsi/acta-residual-documento.ts lib/sgsi/__tests__/acta-residual-documento.test.ts
git commit -m "feat(sgsi): el documento del acta residual, con las excepciones al criterio en su propia seccion"
```

---

## Tarea 7 · El PDF

No lleva prueba unitaria: lanzar Chromium en Jest haría la suite lenta y frágil. El HTML ya
está probado en la Tarea 6; que ese HTML se convierta en PDF lo cubren el build y el recorrido
manual de la Tarea 13.

**Archivos:**
- Crear: `lib/pdf.ts`
- Modificar: `Dockerfile:47`, `package.json`

- [ ] **Paso 1 · Instala la dependencia**

```bash
npm install puppeteer-core
```

**`puppeteer` a secas NO sirve:** descarga un Chromium enlazado contra glibc que no arranca en
`node:22-alpine`. Es `puppeteer-core` más el Chromium del sistema.

- [ ] **Paso 2 · Escribe el módulo**

```ts
// lib/pdf.ts
import 'server-only';

// El ÚNICO módulo que toca puppeteer. Vive aislado para que Chromium no entre al grafo de
// módulos de nadie más: cualquier archivo que lo importe arrastra el navegador entero.
//
// UNA SOLA INSTANCIA, UNA RENDERIZACIÓN A LA VEZ.
//
// Este servidor ya mató un proceso por falta de memoria una vez —la cicatriz de `rowCount`
// inflado, en HARNESS.md—. Lanzar un Chromium por petición lo repite: cada instancia son
// ~120 MB y varias simultáneas agotan la máquina. El navegador se reutiliza y las peticiones
// hacen fila.

import puppeteer, { type Browser } from 'puppeteer-core';

/// `--no-sandbox` es necesario porque el contenedor corre como usuario no privilegiado
/// (`Dockerfile:99`) sin capacidades adicionales. Es aceptable **porque sólo se renderiza HTML
/// generado por esta aplicación**, nunca contenido de terceros. Escrito acá para que quien lo
/// lea no lo tome por descuido.
const ARGUMENTOS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

const RUTA_CHROMIUM = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser';

let navegador: Browser | null = null;
let fila: Promise<unknown> = Promise.resolve();

async function obtenerNavegador(): Promise<Browser> {
  if (navegador !== null && navegador.connected) return navegador;
  navegador = await puppeteer.launch({
    executablePath: RUTA_CHROMIUM,
    args: ARGUMENTOS,
    headless: true,
  });
  return navegador;
}

/// Convierte HTML en un PDF tamaño carta. Las peticiones se serializan: la segunda espera a
/// que termine la primera.
export async function htmlAPdf(html: string): Promise<Buffer> {
  const mio = fila.then(async () => {
    const b = await obtenerNavegador();
    const pagina = await b.newPage();
    try {
      await pagina.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`, {
        waitUntil: 'load',
        timeout: 30_000,
      });
      const bytes = await pagina.pdf({
        format: 'letter',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
        timeout: 30_000,
      });
      return Buffer.from(bytes);
    } finally {
      await pagina.close();
    }
  });
  // La fila avanza pase lo que pase: un fallo no puede dejar la cola bloqueada para siempre.
  fila = mio.catch(() => undefined);
  return mio;
}
```

- [ ] **Paso 3 · Añade Chromium a la etapa runner del `Dockerfile`**

Reemplaza la línea 47 (`RUN apk add --no-cache openssl libc6-compat`) por:

```dockerfile
# Chromium para `lib/pdf.ts`. Va en el RUNNER y no sólo en el builder: el PDF se genera en
# tiempo de ejecución. Es el paquete del sistema y no el que descarga puppeteer, porque ese
# está enlazado contra glibc y no arranca en Alpine — cuesta ~300 MB y es la única forma.
RUN apk add --no-cache openssl libc6-compat \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true
```

- [ ] **Paso 4 · Verifica que el build resuelve la dependencia**

```bash
npm run build
```

Esperado: compila. Si falla con `Module not found: puppeteer-core`, declara el paquete en
`next.config.js`:

```js
serverExternalPackages: ['puppeteer-core'],
```

y vuelve a correrlo.

- [ ] **Paso 5 · Commit**

```bash
git add lib/pdf.ts Dockerfile package.json package-lock.json next.config.js
git commit -m "feat: generacion de PDF con chromium del sistema, una instancia y una renderizacion a la vez"
```

---

## Tarea 8 · La lectura de la pantalla

**Archivos:**
- Crear: `app/sgsi/riesgo-residual/acta.query.ts`

Sin prueba unitaria propia: es I/O contra Prisma y **toda su lógica ya está probada** en las
tareas 1 a 4. Este archivo sólo lee y arma.

- [ ] **Paso 1 · Escribe la consulta**

```ts
import 'server-only';

// app/sgsi/riesgo-residual/acta.query.ts
//
// La lectura detrás de la pantalla de aprobación del riesgo residual. Arma, no decide: el
// alcance, la huella, los firmantes y el estado salen de los módulos puros de `lib/sgsi/`.

import { prisma } from '@/lib/db';
import {
  huellaDeAlcance,
  resolverFirmantes,
  seleccionarAlcance,
  type ActivoParaAlcance,
  type FilaAlcance,
  type FirmanteProceso,
  type ProcesoParaFirma,
} from '@/lib/sgsi/alcance-residual';
import { estadoVigente, type EstadoActa } from '@/lib/sgsi/estado-acta-residual';

export interface VistaRiesgoResidual {
  periodo: string;
  filas: FilaAlcance[];
  firmantes: FirmanteProceso[];
  sinCalcular: number;
  fueraDeBanda: number;
  huellaActual: string;
  acta: {
    id: number;
    codigo: string;
    estado: EstadoActa;
    generadaEn: string;
    generadaPor: string;
    sinCalcular: number;
    renglones: {
      areaId: number;
      proceso: string;
      cargoNombre: string | null;
      resoluble: boolean;
      activos: number;
      aprobo: boolean;
      firmante: string | null;
      fechaFirma: string | null;
      soporteId: number | null;
      registradoPor: string | null;
    }[];
    soportes: { id: number; nombre: string; tamano: number; sha256: string; cargadoEn: string }[];
  } | null;
}

export async function leerRiesgoResidual(periodo: string): Promise<VistaRiesgoResidual> {
  const [activos, umbrales, areas, actaFila, parametro] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        areaId: true,
        area: { select: { nombre: true } },
        riesgos: {
          where: { obsoleto: false },
          select: { riesgoResidual: true },
        },
      },
    }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.area.findMany({
      where: { activa: true },
      orderBy: { orden: 'asc' },
      select: {
        id: true,
        nombre: true,
        liderCargoId: true,
        liderCargo: { select: { id: true, nombre: true } },
      },
    }),
    prisma.actaRiesgoResidual.findFirst({
      where: { periodo },
      orderBy: { generadaEn: 'desc' },
      // `documento` NO se selecciona: es el blob del PDF y sólo lo toca la ruta de descarga.
      select: {
        id: true,
        codigo: true,
        estado: true,
        alcanceHash: true,
        sinCalcular: true,
        generadaEn: true,
        generadaPor: { select: { nombre: true } },
        firmantes: {
          orderBy: { activos: 'desc' },
          select: {
            areaId: true, proceso: true, cargoNombre: true, resoluble: true, activos: true,
            aprobo: true, fechaFirma: true, soporteId: true,
            firmante: { select: { nombre: true } },
            registradoPor: { select: { nombre: true } },
          },
        },
        soportes: {
          orderBy: { cargadoEn: 'asc' },
          select: { id: true, nombreOriginal: true, tamano: true, sha256: true, cargadoEn: true },
        },
      },
    }),
    prisma.parametro.findUnique({ where: { clave: 'vigencia_acta_residual_meses' } }),
  ]);

  const bandas = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: Number(u.desde),
    hasta: Number(u.hasta),
  }));

  const paraAlcance: ActivoParaAlcance[] = activos.map((a) => ({
    id: a.id,
    codigo: a.codigo ?? `sin-codigo-${a.id}`,
    nombre: a.nombre,
    areaId: a.areaId,
    proceso: a.area.nombre,
    residuales: a.riesgos.map((r) => r.riesgoResidual?.toString() ?? null),
  }));

  const alcance = seleccionarAlcance(paraAlcance, bandas);
  const huellaActual = huellaDeAlcance(alcance.filas);

  // Las personas del cargo líder de cada área. Se consultan en un solo golpe y se agrupan acá.
  const cargosLideres = areas.map((a) => a.liderCargoId).filter((x): x is number => x !== null);
  const personas = await prisma.persona.findMany({
    where: { activa: true, cargoId: { in: cargosLideres } },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, cargoId: true },
  });
  const porCargo = new Map<number, { id: number; nombre: string }[]>();
  for (const p of personas) {
    if (p.cargoId === null) continue;
    porCargo.set(p.cargoId, [...(porCargo.get(p.cargoId) ?? []), { id: p.id, nombre: p.nombre }]);
  }

  const procesos: ProcesoParaFirma[] = areas.map((a) => ({
    areaId: a.id,
    proceso: a.nombre,
    cargoId: a.liderCargoId,
    cargoNombre: a.liderCargo?.nombre ?? null,
    candidatos: a.liderCargoId === null ? [] : (porCargo.get(a.liderCargoId) ?? []),
  }));

  const firmantes = resolverFirmantes(procesos, alcance.filas);
  const vigenciaMeses = Number(parametro?.valor ?? 12);

  return {
    periodo,
    filas: alcance.filas,
    firmantes,
    sinCalcular: alcance.sinCalcular,
    fueraDeBanda: alcance.fueraDeBanda,
    huellaActual,
    acta:
      actaFila === null
        ? null
        : {
            id: actaFila.id,
            codigo: actaFila.codigo,
            estado: estadoVigente(
              {
                estado: actaFila.estado,
                alcanceHash: actaFila.alcanceHash,
                generadaEn: actaFila.generadaEn,
                procesos: actaFila.firmantes.filter((f) => f.resoluble).length,
                procesosFirmados: actaFila.firmantes.filter((f) => f.aprobo).length,
              },
              huellaActual,
              new Date(),
              vigenciaMeses,
            ),
            generadaEn: actaFila.generadaEn.toISOString().slice(0, 10),
            generadaPor: actaFila.generadaPor.nombre,
            sinCalcular: actaFila.sinCalcular,
            renglones: actaFila.firmantes.map((f) => ({
              areaId: f.areaId,
              proceso: f.proceso,
              cargoNombre: f.cargoNombre,
              resoluble: f.resoluble,
              activos: f.activos,
              aprobo: f.aprobo,
              firmante: f.firmante?.nombre ?? null,
              fechaFirma: f.fechaFirma?.toISOString().slice(0, 10) ?? null,
              soporteId: f.soporteId,
              registradoPor: f.registradoPor?.nombre ?? null,
            })),
            soportes: actaFila.soportes.map((s) => ({
              id: s.id,
              nombre: s.nombreOriginal,
              tamano: s.tamano,
              sha256: s.sha256,
              cargadoEn: s.cargadoEn.toISOString().slice(0, 10),
            })),
          },
  };
}
```

> **Nota sobre `procesos` en `estadoVigente`:** se cuentan sólo los renglones `resoluble`. Un
> proceso sin firmante resoluble no puede firmar nunca, y exigir su firma dejaría el acta
> eternamente sin aprobar por una deuda del catálogo de cargos. La tarjeta lo muestra aparte
> para que la deuda no quede escondida.

- [ ] **Paso 2 · Comprueba que compila**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Paso 3 · Commit**

```bash
git add app/sgsi/riesgo-residual/acta.query.ts
git commit -m "feat(sgsi): la lectura de la pantalla de riesgo residual"
```

---

## Tarea 9 · Las server actions

**Archivos:**
- Crear: `app/sgsi/acciones/acta-residual.ts`

**Cuidado con `'use server'`:** en un archivo así **cada export es un endpoint**, y `export
const` está prohibido — es exactamente el error que tumbó el despliegue del 16/09/2026.
`lib/__tests__/use-server.test.ts` lo verifica sobre todos los archivos a la vez; no lo
saltes.

- [ ] **Paso 1 · Escribe las acciones**

```ts
'use server';

// app/sgsi/acciones/acta-residual.ts
//
// Emitir el acta, cargar el acta firmada y registrar quién firmó.
//
// LA FIRMA OCURRE FUERA DEL SISTEMA, y eso cambia qué puede afirmar la aplicación. Cuando
// alguien marca una firma acá, el sistema NO está diciendo «esta persona actuó en la
// aplicación»: está diciendo «alguien registró que esta persona firmó en papel». Los dos
// hechos se guardan por separado —`firmanteId` y `registradoPorId`— porque a los seis meses la
// diferencia es lo único que distingue una firma de una afirmación sobre una firma.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from './sesion';
import { leerRiesgoResidual } from '@/app/sgsi/riesgo-residual/acta.query';
import { actaResidualHtml } from '@/lib/sgsi/acta-residual-documento';
import { htmlAPdf } from '@/lib/pdf';
import {
  ANEXOS_ACEPTADOS,
  esExtension,
  formatoTamano,
  mimePorContenido,
  sha256De,
} from '@/lib/sgsi/anexo-archivo';

export interface ResultadoActa extends Resultado {
  codigo?: string;
}

async function personaDe(correo: string): Promise<{ id: number; nombre: string }> {
  const p = await prisma.persona.findUnique({
    where: { correo: correo.toLowerCase() },
    select: { id: true, nombre: true },
  });
  if (p === null) {
    // No se emite un acta a nombre de alguien que el censo no conoce: el acta dice quién la
    // generó, y un correo suelto no es una persona del sistema.
    throw new Error(`No hay una persona registrada con el correo ${correo}.`);
  }
  return p;
}

/// Emite el acta del periodo: congela el alcance, genera el PDF y abre la hoja de firmas.
///
/// **Emitir es congelar.** No hay borrador: un acta a medio hacer que se puede editar no
/// congela nada, y lo que este documento tiene que congelar son las cifras que alguien firma.
export async function emitirActaResidual(periodo: string, motivo?: string): Promise<ResultadoActa> {
  return ejecutar<ResultadoActa>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const persona = await personaDe(autor);

    const vista = await leerRiesgoResidual(periodo);
    if (vista.filas.length === 0) {
      return {
        ok: false,
        mensaje: 'No hay activos en banda Alta o Crítica para este periodo: no hay nada que aprobar.',
      };
    }

    const consecutivo =
      (await prisma.actaRiesgoResidual.count({ where: { periodo } })) + 1;
    const codigo = `ARR-${periodo}-${String(consecutivo).padStart(3, '0')}`;

    const html = actaResidualHtml({
      codigo,
      periodo,
      generadaEn: new Date().toISOString().slice(0, 10),
      generadaPor: persona.nombre,
      alcanceHash: vista.huellaActual,
      sinCalcular: vista.sinCalcular,
      filas: vista.filas,
      firmantes: vista.firmantes,
    });
    const pdf = await htmlAPdf(html);

    // Los planes citados, resueltos en un golpe: el acta cita el plan de tratamiento cuando
    // existe en vez de volver a pedir la justificación que ya está escrita en él.
    const planes = await prisma.accionPlan.findMany({
      where: { activa: true },
      select: { codigo: true, origen: true, tipo: true },
    });

    await prisma.$transaction(async (tx) => {
      const acta = await tx.actaRiesgoResidual.create({
        data: {
          codigo,
          periodo,
          estado: 'EMITIDA',
          alcanceHash: vista.huellaActual,
          sinCalcular: vista.sinCalcular,
          generadaPorId: persona.id,
          documentoSha256: sha256De(pdf),
          documento: pdf,
        },
      });

      await tx.activoActaResidual.createMany({
        data: vista.filas.map((f) => {
          const plan = planes.find((p) => p.origen.includes(f.codigo));
          return {
            actaId: acta.id,
            activoId: f.activoId,
            codigo: f.codigo,
            nombre: f.nombre,
            proceso: f.proceso,
            banda: f.banda,
            cifraResidual: f.cifra,
            planCodigo: plan?.codigo ?? null,
            planTipo: plan?.tipo ?? null,
          };
        }),
      });

      await tx.firmanteActaResidual.createMany({
        data: vista.firmantes.map((f) => ({
          actaId: acta.id,
          areaId: f.areaId,
          proceso: f.proceso,
          cargoId: f.cargoId,
          cargoNombre: f.cargoNombre,
          resoluble: f.resoluble,
          activos: f.activos,
        })),
      });

      await registrarAlta(tx, autor, 'acta_riesgo_residual', codigo);
      await registrar(tx, autor, [
        {
          tabla: 'acta_riesgo_residual',
          registroId: codigo,
          campo: 'acta emitida',
          anterior: null,
          nuevo: `${vista.filas.length} activos · ${vista.firmantes.length} procesos · ${vista.sinCalcular} sin calcular · sha256 ${sha256De(pdf).slice(0, 12)}…`,
          motivo: motivo ?? null,
        },
      ]);
    });

    revalidatePath('/sgsi/riesgo-residual');
    return {
      ok: true,
      mensaje: `Se emitió ${codigo} con ${vista.filas.length} activos y ${vista.firmantes.length} procesos por firmar.`,
      codigo,
      cambios: 1,
    };
  });
}

export interface DatosSoporteActa {
  actaId: number;
  nombreOriginal: string;
  /// Los bytes del archivo, como los manda el cliente.
  bytes: number[];
  motivo?: string;
  /// Las áreas cuyos firmantes quedan cubiertos por este soporte, con quién firmó cada una.
  firmas: { areaId: number; firmanteId: number; fechaFirma: string }[];
}

/// Carga el acta firmada y marca, en la misma operación, quiénes firmaron en ella.
///
/// **No se admite marcar una firma sin el papel que la sostiene**: sería exactamente el
/// registro que nadie puede auditar, y es la razón por la que las dos cosas van juntas y no en
/// dos acciones separadas.
export async function cargarSoporteActaResidual(datos: DatosSoporteActa): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const persona = await personaDe(autor);
    exigirId(datos.actaId, 'el acta');

    if (datos.firmas.length === 0) {
      return { ok: false, mensaje: 'Indica al menos un proceso cuya firma cubre este soporte.' };
    }

    const acta = await prisma.actaRiesgoResidual.findUnique({
      where: { id: datos.actaId },
      select: { id: true, codigo: true, estado: true },
    });
    if (!acta) return { ok: false, mensaje: 'El acta no existe.' };
    if (acta.estado === 'ANULADA') {
      return { ok: false, mensaje: `${acta.codigo} está anulada: emite una nueva.` };
    }

    const buffer = Buffer.from(datos.bytes);
    const m = /\.([a-z0-9]+)$/i.exec(datos.nombreOriginal.trim());
    const extension = m ? m[1].toLowerCase() : '';
    if (!esExtension(extension)) {
      return {
        ok: false,
        mensaje: `Tipo no permitido «${extension || 'sin extensión'}». Lista blanca: ${Object.keys(ANEXOS_ACEPTADOS).join(', ')}.`,
      };
    }
    // El MIME se verifica por CONTENIDO, no por extensión: una extensión es una afirmación,
    // el primer byte es un hecho. Misma regla que `app/api/sgsi/anexo/route.ts`.
    const mime = mimePorContenido(buffer);
    if (mime === null || mime !== ANEXOS_ACEPTADOS[extension]) {
      if (!(extension === 'jpg' && mime === 'image/jpeg')) {
        return {
          ok: false,
          mensaje: `El contenido no corresponde al tipo declarado (${mime ?? 'desconocido'}).`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      const soporte = await tx.soporteActaResidual.create({
        data: {
          actaId: acta.id,
          nombreOriginal: datos.nombreOriginal.trim(),
          mime: mime ?? 'application/octet-stream',
          tamano: buffer.length,
          sha256: sha256De(buffer),
          bytes: buffer,
          cargadoPorId: persona.id,
          motivo: datos.motivo ?? null,
        },
      });

      for (const f of datos.firmas) {
        await tx.firmanteActaResidual.update({
          where: { actaId_areaId: { actaId: acta.id, areaId: f.areaId } },
          data: {
            aprobo: true,
            firmanteId: f.firmanteId,
            fechaFirma: new Date(`${f.fechaFirma}T00:00:00.000Z`),
            soporteId: soporte.id,
            registradoPorId: persona.id,
            motivo: datos.motivo ?? null,
          },
        });
      }

      await registrar(tx, autor, [
        {
          tabla: 'acta_riesgo_residual',
          registroId: acta.codigo,
          campo: 'soporte cargado',
          anterior: null,
          nuevo: `${datos.nombreOriginal} · ${formatoTamano(buffer.length)} · sha256 ${sha256De(buffer).slice(0, 12)}…`,
          motivo: datos.motivo ?? null,
        },
        ...datos.firmas.map((f) => ({
          tabla: 'acta_riesgo_residual',
          registroId: acta.codigo,
          campo: `firma registrada · área ${f.areaId}`,
          anterior: null,
          nuevo: `firmó la persona ${f.firmanteId} el ${f.fechaFirma}`,
          // Quién registró, y a nombre de quién. La diferencia entre «yo firmé» y «alguien
          // registró que firmé» tiene que ser legible seis meses después.
          motivo: `registrada por ${autor}${datos.motivo ? ` · ${datos.motivo}` : ''}`,
        })),
      ]);
    });

    revalidatePath('/sgsi/riesgo-residual');
    return {
      ok: true,
      mensaje: `Se cargó el soporte y se registraron ${datos.firmas.length} firmas.`,
      cambios: datos.firmas.length,
    };
  });
}

/// Anula un acta con motivo obligatorio.
///
/// **Una firma registrada no se puede retirar.** Si se registró por error, se anula el acta
/// entera y se emite otra: corregir una firma en su sitio es reescribir evidencia.
export async function anularActaResidual(actaId: number, motivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(actaId, 'el acta');
    if (motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Anular un acta exige un motivo escrito: di qué pasó.' };
    }

    const acta = await prisma.actaRiesgoResidual.findUnique({
      where: { id: actaId },
      select: { codigo: true, estado: true },
    });
    if (!acta) return { ok: false, mensaje: 'El acta no existe.' };
    if (acta.estado === 'ANULADA') {
      return { ok: false, mensaje: `${acta.codigo} ya está anulada.` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.actaRiesgoResidual.update({
        where: { id: actaId },
        data: { estado: 'ANULADA', motivoAnulacion: motivo.trim() },
      });
      await registrar(tx, autor, [
        {
          tabla: 'acta_riesgo_residual',
          registroId: acta.codigo,
          campo: 'estado',
          anterior: acta.estado,
          nuevo: 'ANULADA',
          motivo: motivo.trim(),
        },
      ]);
    });

    revalidatePath('/sgsi/riesgo-residual');
    return { ok: true, mensaje: `${acta.codigo} quedó anulada.`, cambios: 1 };
  });
}
```

- [ ] **Paso 2 · Corre la prueba de la frontera cliente/servidor**

```bash
npx jest lib/__tests__/use-server.test.ts
```

Esperado: verde. Si falla con «export const en archivo 'use server'», convierte la constante
en una función o bájala a `lib/`.

- [ ] **Paso 3 · Comprueba que compila**

```bash
npx tsc --noEmit
```

- [ ] **Paso 4 · Commit**

```bash
git add app/sgsi/acciones/acta-residual.ts
git commit -m "feat(sgsi): emitir el acta residual, cargar el soporte firmado y registrar las firmas"
```

---

## Tarea 10 · Las descargas

**Archivos:**
- Crear: `app/api/sgsi/acta-residual/route.ts`
- Crear: `lib/sgsi/registro-residual-libro.ts`
- Test: `lib/sgsi/__tests__/registro-residual-libro.test.ts`

- [ ] **Paso 1 · Escribe el test del libro**

```ts
// lib/sgsi/__tests__/registro-residual-libro.test.ts
import { filasDelRegistro, type RenglonRegistro } from '../registro-residual-libro';

const BASE: RenglonRegistro = {
  codigo: 'TEC-SRV-0001',
  nombre: 'Servidor',
  proceso: 'Tecnología',
  banda: 'Alto',
  cifra: '4.5',
  planCodigo: 'PT-014',
  firmante: 'Ana Ruiz',
  fechaFirma: '2026-09-20',
};

describe('filasDelRegistro', () => {
  it('dice «pendiente» y no vacío cuando el proceso no ha firmado', () => {
    const [f] = filasDelRegistro([{ ...BASE, firmante: null, fechaFirma: null }]);
    expect(f.firmante).toBe('Pendiente de firma');
    expect(f.fechaFirma).toBe('');
  });

  it('conserva el plan citado, y pone una raya cuando no hay', () => {
    expect(filasDelRegistro([BASE])[0].planCodigo).toBe('PT-014');
    expect(filasDelRegistro([{ ...BASE, planCodigo: null }])[0].planCodigo).toBe('—');
  });

  it('marca la banda Crítica como excepción al criterio', () => {
    const [f] = filasDelRegistro([{ ...BASE, banda: 'Crítico' }]);
    expect(f.observacion).toContain('Excepción');
  });

  it('no marca excepción en banda Alta', () => {
    expect(filasDelRegistro([BASE])[0].observacion).toBe('');
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest lib/sgsi/__tests__/registro-residual-libro.test.ts
```

Esperado: `Cannot find module '../registro-residual-libro'`.

- [ ] **Paso 3 · Implementa el libro**

Sigue el patrón de `lib/sgsi/inventario-libro.ts`: una función pura que arma las filas y otra
que las escribe con `exceljs`. La pura es la que se prueba.

```ts
// lib/sgsi/registro-residual-libro.ts
//
// El registro de aprobación del riesgo residual, en Excel. La ARITMÉTICA Y LAS ETIQUETAS van
// en `filasDelRegistro`, que es pura y se prueba; `exceljs` sólo pinta.

import ExcelJS from 'exceljs';

export interface RenglonRegistro {
  codigo: string;
  nombre: string;
  proceso: string;
  banda: string;
  cifra: string;
  planCodigo: string | null;
  firmante: string | null;
  fechaFirma: string | null;
}

export interface FilaRegistro extends Omit<RenglonRegistro, 'planCodigo' | 'firmante' | 'fechaFirma'> {
  planCodigo: string;
  firmante: string;
  fechaFirma: string;
  observacion: string;
}

/// Una celda vacía en un registro que se archiva no dice nada: no distingue «nadie firmó» de
/// «se nos olvidó llenarlo». La palabra sí.
export function filasDelRegistro(renglones: readonly RenglonRegistro[]): FilaRegistro[] {
  return renglones.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    proceso: r.proceso,
    banda: r.banda,
    cifra: r.cifra,
    planCodigo: r.planCodigo ?? '—',
    firmante: r.firmante ?? 'Pendiente de firma',
    fechaFirma: r.fechaFirma ?? '',
    observacion:
      r.banda === 'Crítico'
        ? 'Excepción al criterio de aceptación: la banda Crítica se declara no aceptable.'
        : '',
  }));
}

export async function libroDelRegistro(renglones: readonly RenglonRegistro[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Riesgo residual');
  hoja.columns = [
    { key: 'codigo', header: 'CÓDIGO', width: 16 },
    { key: 'nombre', header: 'ACTIVO', width: 40 },
    { key: 'proceso', header: 'PROCESO', width: 24 },
    { key: 'banda', header: 'BANDA', width: 12 },
    { key: 'cifra', header: 'RESIDUAL', width: 12 },
    { key: 'planCodigo', header: 'PLAN', width: 12 },
    { key: 'firmante', header: 'FIRMÓ', width: 28 },
    { key: 'fechaFirma', header: 'FECHA', width: 14 },
    { key: 'observacion', header: 'OBSERVACIÓN', width: 60 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const f of filasDelRegistro(renglones)) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
```

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest lib/sgsi/__tests__/registro-residual-libro.test.ts
```

Esperado: 4 pruebas en verde.

- [ ] **Paso 5 · Escribe la ruta de descarga**

Copia la estructura de `app/api/sgsi/anexo/route.ts:239-312`: sesión, permiso `sgsi:ver`,
bitácora de la descarga con IP, y `X-Content-Type-Options: nosniff`.

```ts
// app/api/sgsi/acta-residual/route.ts
//
// Descarga del acta emitida (PDF), de un soporte firmado, y del registro en Excel.
// Misma doctrina que `app/api/sgsi/anexo/route.ts`: se registra en la bitácora QUIÉN descargó
// qué, porque el acta lleva el mapa de los activos más expuestos de la organización.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { registrar } from '@/lib/sgsi/bitacora';
import { libroDelRegistro } from '@/lib/sgsi/registro-residual-libro';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse('sin sesión', { status: 401 });
  const rol = rolDesdeGrupos(session.user?.grupos);
  if (!puede(rol, 'sgsi:ver')) return new NextResponse('sin permiso', { status: 403 });
  const autor = session.user?.email ?? 'desconocido';

  const url = new URL(req.url);
  const que = url.searchParams.get('que');
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id)) return new NextResponse('id inválido', { status: 400 });

  if (que === 'soporte') {
    const s = await prisma.soporteActaResidual.findUnique({
      where: { id },
      select: { bytes: true, mime: true, nombreOriginal: true, acta: { select: { codigo: true } } },
    });
    if (!s) return new NextResponse('soporte no encontrado', { status: 404 });
    await registrar({ bitacora: prisma.bitacora }, autor, [
      { tabla: 'acta_riesgo_residual', registroId: s.acta.codigo, campo: 'soporte descargado', anterior: null, nuevo: s.nombreOriginal },
    ]);
    return respuesta(Buffer.from(s.bytes), s.mime, s.nombreOriginal);
  }

  const acta = await prisma.actaRiesgoResidual.findUnique({
    where: { id },
    select: {
      codigo: true,
      documento: true,
      activos: {
        orderBy: { cifraResidual: 'desc' },
        select: {
          codigo: true, nombre: true, proceso: true, banda: true,
          cifraResidual: true, planCodigo: true, actaId: true,
        },
      },
      firmantes: {
        select: { proceso: true, fechaFirma: true, firmante: { select: { nombre: true } } },
      },
    },
  });
  if (!acta) return new NextResponse('acta no encontrada', { status: 404 });

  if (que === 'registro') {
    const porProceso = new Map(acta.firmantes.map((f) => [f.proceso, f]));
    const libro = await libroDelRegistro(
      acta.activos.map((a) => {
        const f = porProceso.get(a.proceso);
        return {
          codigo: a.codigo,
          nombre: a.nombre,
          proceso: a.proceso,
          banda: a.banda,
          cifra: a.cifraResidual.toString(),
          planCodigo: a.planCodigo,
          firmante: f?.firmante?.nombre ?? null,
          fechaFirma: f?.fechaFirma?.toISOString().slice(0, 10) ?? null,
        };
      }),
    );
    await registrar({ bitacora: prisma.bitacora }, autor, [
      { tabla: 'acta_riesgo_residual', registroId: acta.codigo, campo: 'registro descargado', anterior: null, nuevo: `${acta.activos.length} filas` },
    ]);
    return respuesta(
      libro,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `${acta.codigo}-registro.xlsx`,
    );
  }

  await registrar({ bitacora: prisma.bitacora }, autor, [
    { tabla: 'acta_riesgo_residual', registroId: acta.codigo, campo: 'acta descargada', anterior: null, nuevo: `${acta.activos.length} activos` },
  ]);
  return respuesta(Buffer.from(acta.documento), 'application/pdf', `${acta.codigo}.pdf`);
}

function respuesta(buffer: Buffer, mime: string, nombre: string): NextResponse {
  return new NextResponse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    },
  );
}
```

- [ ] **Paso 6 · Commit**

```bash
git add app/api/sgsi/acta-residual/route.ts lib/sgsi/registro-residual-libro.ts lib/sgsi/__tests__/registro-residual-libro.test.ts
git commit -m "feat(sgsi): descarga del acta, del soporte firmado y del registro en excel"
```

---

## Tarea 11 · La pantalla

**Archivos:**
- Crear: `app/sgsi/riesgo-residual/page.tsx`
- Crear: `app/components/sgsi/riesgo-residual/PantallaRiesgoResidual.tsx`
- Test: `app/components/sgsi/riesgo-residual/__tests__/PantallaRiesgoResidual.test.tsx`

Sigue el patrón de `app/components/sgsi/planes/PlanesTratamiento.tsx` para el componente y de
`app/components/sgsi/planes/__tests__/FranjaSinPlan.test.tsx` para la prueba.

- [ ] **Paso 1 · Escribe el test que falla**

```tsx
// app/components/sgsi/riesgo-residual/__tests__/PantallaRiesgoResidual.test.tsx
import { render, screen } from '@testing-library/react';
import PantallaRiesgoResidual from '../PantallaRiesgoResidual';
import type { VistaRiesgoResidual } from '@/app/sgsi/riesgo-residual/acta.query';

function vista(p: Partial<VistaRiesgoResidual> = {}): VistaRiesgoResidual {
  return {
    periodo: '2026',
    filas: [],
    firmantes: [],
    sinCalcular: 0,
    fueraDeBanda: 0,
    huellaActual: 'a'.repeat(64),
    acta: null,
    ...p,
  };
}

const FIRMANTE = {
  areaId: 1, proceso: 'Tecnología', cargoId: 10, cargoNombre: 'Líder de Tecnología',
  candidatos: [{ id: 1, nombre: 'Ana Ruiz' }], resoluble: true, activos: 3,
};

describe('PantallaRiesgoResidual', () => {
  // La tarjeta que impide que el tablero se vea completo cuando no lo está.
  it('cuenta los activos sin calcular en su propia tarjeta', () => {
    render(<PantallaRiesgoResidual datos={vista({ sinCalcular: 12 })} puedeEscribir />);
    expect(screen.getByText(/sin calcular/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('distingue «sin firmante resoluble» de «no ha firmado»', () => {
    render(
      <PantallaRiesgoResidual
        datos={vista({
          firmantes: [FIRMANTE, { ...FIRMANTE, areaId: 2, proceso: 'Legal', resoluble: false, candidatos: [], cargoNombre: null }],
        })}
        puedeEscribir
      />,
    );
    expect(screen.getByText(/sin firmante resoluble/i)).toBeInTheDocument();
    expect(screen.getByText(/pendiente de firma/i)).toBeInTheDocument();
  });

  it('sin acta emitida ofrece emitirla y no muestra estado', () => {
    render(<PantallaRiesgoResidual datos={vista({ firmantes: [FIRMANTE] })} puedeEscribir />);
    expect(screen.getByRole('button', { name: /emitir/i })).toBeInTheDocument();
  });

  it('con el acta desactualizada lo dice y no deja registrar firmas', () => {
    const datos = vista({
      firmantes: [FIRMANTE],
      acta: {
        id: 1, codigo: 'ARR-2026-001', estado: 'DESACTUALIZADA',
        generadaEn: '2026-09-01', generadaPor: 'Daniel Medina', sinCalcular: 0,
        renglones: [], soportes: [],
      },
    });
    render(<PantallaRiesgoResidual datos={datos} puedeEscribir />);
    expect(screen.getByText(/desactualizada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar acta firmada/i })).not.toBeInTheDocument();
  });

  it('sin permiso de escritura no ofrece ninguna acción que escriba', () => {
    render(<PantallaRiesgoResidual datos={vista({ firmantes: [FIRMANTE] })} puedeEscribir={false} />);
    expect(screen.queryByRole('button', { name: /emitir/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Paso 2 · Córrelo y confirma que está en rojo**

```bash
npx jest app/components/sgsi/riesgo-residual
```

Esperado: `Cannot find module '../PantallaRiesgoResidual'`.

- [ ] **Paso 3 · Escribe el componente**

> **Este es el único paso del plan que no trae el código completo, y es deliberado.** Un
> componente de presentación de ~400 líneas de Tailwind escrito a ciegas en un plan sale mal y
> se reescribe entero; lo que de verdad lo restringe son las cinco pruebas del Paso 1, que sí
> están completas, más los requisitos de abajo. Toda la lógica que podía equivocarse ya está
> probada en las tareas 1 a 4.

Requisitos que las pruebas fijan, y que no se pueden negociar al escribirlo:

1. Seis tarjetas: *Activos por aprobar* · *Críticos* · *Procesos cubiertos* · *Personas
   pendientes* · **Sin calcular** · *Sin firmante resoluble*.
2. La tabla de firmantes dice, por renglón, uno de tres textos: el nombre de quien firmó,
   `Pendiente de firma`, o `Sin firmante resoluble`. **Nunca una celda vacía.**
3. Con `estado === 'DESACTUALIZADA'` se oculta el botón de cargar acta firmada y se muestra el
   aviso: recoger firmas sobre cifras que cambiaron es recoger firmas que no valen.
4. Todo botón que escriba se renderiza sólo con `puedeEscribir`.
5. El copy va en español de Colombia: `tú` o impersonal, imperativo sin tilde aguda
   («registra», no «registrá»). Es la regla de `HARNESS.md`, y el resto del repositorio tiene
   voseo heredado que **no se debe copiar**.

- [ ] **Paso 4 · Córrelo y confirma que pasa**

```bash
npx jest app/components/sgsi/riesgo-residual
```

Esperado: 5 pruebas en verde.

- [ ] **Paso 5 · Escribe la página**

```tsx
// app/sgsi/riesgo-residual/page.tsx
//
// Aprobación del riesgo residual. ISO/IEC 27001:2022 6.1.3 e): debe conservarse información
// documentada de la aceptación de los riesgos residuales por sus propietarios.

import { leerRiesgoResidual } from './acta.query';
import { rolActual } from '@/app/sgsi/acciones/sesion';
import { puede } from '@/lib/sgsi/permisos';
import PantallaRiesgoResidual from '@/app/components/sgsi/riesgo-residual/PantallaRiesgoResidual';

export const dynamic = 'force-dynamic';

export default async function RiesgoResidualPage() {
  const periodo = String(new Date().getFullYear());
  const [datos, rol] = await Promise.all([leerRiesgoResidual(periodo), rolActual()]);
  return <PantallaRiesgoResidual datos={datos} puedeEscribir={puede(rol, 'sgsi:escribir')} />;
}
```

- [ ] **Paso 6 · Registra la entrada del menú**

En `app/components/sgsi/SidebarSgsi.tsx`, después de la línea 100 (`Planes de tratamiento`):

```ts
{ etiqueta: 'Riesgo residual', abreviatura: 'RES', href: '/sgsi/riesgo-residual' },
```

- [ ] **Paso 7 · Commit**

```bash
git add app/sgsi/riesgo-residual app/components/sgsi/riesgo-residual app/components/sgsi/SidebarSgsi.tsx
git commit -m "feat(sgsi): la pantalla de aprobacion del riesgo residual"
```

---

## Tarea 12 · Los cuatro checks

- [ ] **Paso 1 · Corre la verificación completa**

```bash
npm run verificar:build
```

Esperado: `prisma generate` · `tsc --noEmit` 0 errores · `lint` 0 errores (los 5 warnings
preexistentes se toleran) · toda la suite verde · el build compila.

Si `tsc` reporta un error en código que ya arreglaste, borra `tsconfig.tsbuildinfo` y repite:
el caché incremental queda rancio.

- [ ] **Paso 2 · Commit si algo se movió**

```bash
git add -A
git commit -m "chore(sgsi): los cuatro checks en limpio para el acta de riesgo residual"
```

---

## Tarea 13 · El recorrido de punta a punta

**No es opcional.** Es la Regla 3 de `HARNESS.md`, y este cambio la activa por todos lados:
hay pantalla con estado, un flujo de varios pasos donde la salida de uno alimenta al
siguiente, server actions invocadas desde la interfaz, y lectura de un archivo que sube el
usuario. Los tres bugs que motivaron el harness eran exactamente esta forma.

**No se puede automatizar hoy:** los specs de `e2e/` sólo leen porque corren contra
producción por el túnel, y esto escribe. Se hace a mano y se escribe en el PR.

- [ ] **Paso 1 · Levanta la aplicación contra una base con datos**

```powershell
$env:DATABASE_URL = '…'
npm run dev
```

- [ ] **Paso 2 · Ejecuta el recorrido y anota lo que ves en cada paso**

```
Recorrido ejecutado (periodo 2026):
  1. Abrir /sgsi/riesgo-residual   -> N activos Alto, M Críticos, K sin calcular
  2. Emitir el acta                -> ARR-2026-001, PDF descargable
  3. Abrir el PDF                  -> excepciones en su sección, hoja de firmas con los procesos,
                                      huella impresa al final
  4. Cargar el acta firmada        -> soporte registrado, sha256 visible
  5. Marcar dos firmas             -> los dos procesos quedan cubiertos, el resto pendiente
  6. Cambiar una madurez y volver  -> el acta aparece DESACTUALIZADA
  7. Descargar el registro         -> Excel con una fila por activo y su firmante
  8. Intentar cargar un .exe renombrado a .pdf -> rechazado por MIME verificado por contenido
```

- [ ] **Paso 3 · Pega ese recorrido en la descripción del PR**

No basta con «probado»: eso no lo puede verificar ni quien revisa ni quien vuelva dentro de
seis meses.

---

## Deuda que este plan deja abierta, y conviene no olvidar

1. **No hay spec de Playwright para este flujo**, y no lo puede haber mientras `e2e/` corra
   contra producción. Levantar una base sembrada local es la tarea que lo desbloquea, y
   desbloquea también el recorrido de carga de activos, que arrastra tres de las cuatro
   cicatrices del harness.
2. **La sección 5 del informe de valoración sigue sin decir quién aprobó.** Con estas tablas
   ya se puede: es unir `ActivoActaResidual` con lo que el informe ya imprime.
3. **`AccionPlan.fechaAprobacion` sigue sin escribirse** desde la aplicación.
4. **`CriterioAceptacion.ratificado` sigue sin poderse marcar**, y `aprueba` sigue sin nombrar
   a los dueños de proceso, que son quienes de verdad firman.
