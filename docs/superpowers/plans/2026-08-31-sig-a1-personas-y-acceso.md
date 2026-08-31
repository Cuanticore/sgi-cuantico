# SIG · A1 — Personas y acceso · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el SIG sepa quiénes son las personas de la organización —espejo de Azure AD, con área y cargo propios— y que toda cuenta autenticada entre como Colaborador en vez de recibir el rol completo del SGSI.

**Architecture:** La entidad `Persona` se sincroniza desde Microsoft Graph; el Directorio manda sobre nombre, correo y existencia, y el SIG manda sobre área y cargo. La decisión de qué cambia en cada sincronización vive en un módulo **puro** (`lib/sig/personas.ts`) que se prueba sin base de datos, siguiendo el patrón de `lib/sgsi/`; la acción de servidor solo aplica ese plan dentro de una transacción con bitácora. En paralelo, `lib/sgsi/permisos.ts` gana el rol Colaborador como piso y pierde el interruptor `SGI_ACCESO_SIN_GRUPO`.

**Tech Stack:** Next.js 16 App Router · TypeScript 5 · Prisma 7.9.1 + Postgres · NextAuth v4 + Azure AD · Jest 30 (jsdom, `ts-jest` vía `next/jest`) · Microsoft Graph.

**Diseño:** `docs/superpowers/specs/2026-08-31-sig-personas-tareas-design.md` §3.1, §6

---

## Contexto: dónde encaja este plan

El módulo A de la especificación es grande —seis entidades y seis pantallas— y se parte en cuatro planes, cada uno entregando software funcionando por sí solo:

| Plan | Contenido |
|---|---|
| **A1 (este)** | `Persona`, sincronización con el Directorio, rol Colaborador y retiro de `SGI_ACCESO_SIN_GRUPO`. |
| A2 | Motor de tareas: contenidos, obligaciones, asignaciones, generación idempotente y registro de realizado. |
| A3 | Las dos superficies: Mi SIG y Operación, con el header de cinco pestañas. |
| A4 | Notificaciones, indicadores y exportaciones. |

**A1 no trae pantalla.** La pantalla de Personas del diseño (§4.2) vive bajo la pestaña Operación, que no existe todavía, y se construye en A3 junto con el resto del shell. A1 entrega el dominio, la sincronización y el modelo de permisos, verificables por pruebas y por la lista de comprobación manual del final.

## ⚠️ Cambio de comportamiento en producción

`SGI_ACCESO_SIN_GRUPO` está **definido en el `.env` de producción** (no en `.env.example`) y hoy le da a toda cuenta sin grupo reconocido el rol completo del SGSI. Al terminar este plan, esas mismas cuentas pasan a ser **Colaborador**: pierden el inventario de activos, el registro de riesgos y la parametrización.

Eso es exactamente lo que la especificación pide, pero **hay que avisarlo antes de desplegar**. Quien deba conservar acceso al SGSI necesita estar en `Responsables SIG`, `SIG-Propietarios` o `SIG-Auditoría` en el Directorio. Verificar la membresía **antes** de la tarea 6, no después.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` (modificar) | Modelo `Persona` y las relaciones inversas en `Area` y `CargoResponsable`. |
| `lib/sig/personas.ts` (crear) | **Puro.** Normaliza correos y decide el plan de sincronización: altas, cambios, inactivaciones y reactivaciones. Sin Prisma, sin sesión, sin red. |
| `lib/sig/__tests__/personas.test.ts` (crear) | Pruebas del módulo puro. |
| `lib/sgsi/directorio.ts` (modificar) | `leerDirectorioCompleto()`: las personas del Directorio **con su `oid`**, o `null` si Graph no está configurado. |
| `app/sig/acciones/personas.ts` (crear) | Acción de servidor: aplica el plan en una transacción, con bitácora. |
| `lib/sgsi/permisos.ts` (modificar) | Rol Colaborador como piso, permiso `misig:ver`, retiro de `SGI_ACCESO_SIN_GRUPO`. |
| `lib/sgsi/__tests__/permisos.test.ts` (modificar) | Se reescribe el bloque del interruptor retirado. |
| `app/lib/auth.ts` (modificar) | Captura el `oid` del token para el alta al iniciar sesión. |

`lib/sig/` es un directorio nuevo, hermano de `lib/sgsi/`: lo que es del SIG entero no cuelga del módulo de seguridad.

---

## Task 1: Modelo `Persona` y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_persona/migration.sql` (la genera Prisma)

- [ ] **Step 1: Levantar la base de desarrollo**

```bash
npm run db:up
```

Expected: el contenedor de Postgres queda arriba. Si ya lo estaba, Docker lo dice y no falla.

- [ ] **Step 2: Agregar el modelo al esquema**

Al final de `prisma/schema.prisma`, antes de nada que sea un enum suelto, agregar:

```prisma
/// Espejo del Directorio Activo. AD manda sobre nombre, correo y existencia; el SIG manda
/// sobre área y cargo, que son atributos de gestión y no de identidad.
///
/// La identidad es el `oid` de Azure, no el correo: un cambio de apellido cambia el UPN y
/// no debe crear una persona nueva ni huerfanar sus registros.
///
/// No hay columna de rol. El rol lo dan los grupos del Directorio (lib/sgsi/permisos.ts),
/// que es la respuesta que un auditor busca cuando pregunta quién autorizó un permiso.
model Persona {
  id             Int       @id @default(autoincrement())
  /// Object id de Azure AD. Estable aunque cambie el correo.
  oid            String    @unique
  /// userPrincipalName, normalizado a minúsculas.
  correo         String    @unique
  nombre         String
  /// Baja lógica: quien sale de la organización deja de estar activa, nunca se borra,
  /// porque sus registros de realizado sostienen una auditoría.
  activa         Boolean   @default(true)
  sincronizadaEn DateTime? @map("sincronizada_en")
  areaId         Int?      @map("area_id")
  cargoId        Int?      @map("cargo_id")
  creadaEn       DateTime  @default(now()) @map("creada_en")

  area  Area?             @relation(fields: [areaId], references: [id])
  cargo CargoResponsable? @relation(fields: [cargoId], references: [id])

  @@map("persona")
}
```

- [ ] **Step 3: Agregar las relaciones inversas**

En `model Area`, junto a `activos` y `contadores`, agregar:

```prisma
  personas   Persona[]
```

En `model CargoResponsable`, agregar:

```prisma
  personas Persona[]
```

- [ ] **Step 4: Generar y aplicar la migración**

```bash
npx prisma migrate dev --name persona
```

Expected: crea `prisma/migrations/<timestamp>_persona/`, aplica el SQL y regenera el cliente. El SQL debe contener `CREATE TABLE "persona"` y **ningún `DROP`**.

- [ ] **Step 5: Verificar que el proyecto sigue compilando**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sig): modelo Persona, espejo del Directorio con area y cargo propios"
```

---

## Task 2: El plan de sincronización, puro y probado

Este es el corazón del plan. Todo lo que decide qué cambia vive acá, sin Prisma y sin red, y por eso se puede probar de verdad.

**Files:**
- Create: `lib/sig/personas.ts`
- Test: `lib/sig/__tests__/personas.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `lib/sig/__tests__/personas.test.ts`:

```ts
// lib/sig/__tests__/personas.test.ts
//
// Este módulo decide quién entra, quién cambia y a quién se le apaga la cuenta en el SIG,
// así que los casos que importan son los que hacen daño: una lectura vacía del Directorio
// que apagaría a toda la organización, y un cambio de correo que duplicaría a una persona
// en vez de renombrarla.

import { normalizarCorreo, planificarSincronizacion } from '../personas';

const ADA = { oid: 'oid-ada', nombre: 'Ada Lovelace', correo: 'ada@cuantico.com' };
const GRACE = { oid: 'oid-grace', nombre: 'Grace Hopper', correo: 'grace@cuantico.com' };

function existente(e: typeof ADA, activa = true) {
  return { ...e, activa };
}

describe('normalizarCorreo', () => {
  it('baja a minúsculas y recorta espacios', () => {
    expect(normalizarCorreo('  Ada@Cuantico.COM ')).toBe('ada@cuantico.com');
  });
});

describe('altas', () => {
  it('quien está en el Directorio y no en la base, entra', () => {
    const plan = planificarSincronizacion([ADA], []);
    expect(plan.altas).toEqual([{ ...ADA, correo: 'ada@cuantico.com' }]);
    expect(plan.cambios).toEqual([]);
    expect(plan.inactivaciones).toEqual([]);
  });

  it('no hay alta cuando ya existe', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA)]);
    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([]);
  });
});

describe('cambios', () => {
  it('un nombre distinto produce un cambio de nombre', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA, nombre: 'Ada Byron' }],
      [existente(ADA)],
    );
    expect(plan.cambios).toEqual([
      { oid: 'oid-ada', campo: 'nombre', anterior: 'Ada Lovelace', nuevo: 'Ada Byron' },
    ]);
  });

  // El caso que justifica que la identidad sea el oid y no el correo. Con el correo como
  // clave, esto crearía una persona nueva y dejaría huérfanos sus registros.
  it('un correo distinto con el mismo oid renombra, no duplica', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA, correo: 'ada.byron@cuantico.com' }],
      [existente(ADA)],
    );
    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([
      {
        oid: 'oid-ada',
        campo: 'correo',
        anterior: 'ada@cuantico.com',
        nuevo: 'ada.byron@cuantico.com',
      },
    ]);
  });

  it('el correo se compara sin distinguir mayúsculas', () => {
    const plan = planificarSincronizacion([{ ...ADA, correo: 'ADA@CUANTICO.COM' }], [existente(ADA)]);
    expect(plan.cambios).toEqual([]);
  });
});

describe('inactivación y reactivación', () => {
  it('quien desaparece del Directorio se inactiva, no se borra', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA), existente(GRACE)]);
    expect(plan.inactivaciones.map((p) => p.oid)).toEqual(['oid-grace']);
  });

  it('quien ya estaba inactiva no se vuelve a inactivar', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA), existente(GRACE, false)]);
    expect(plan.inactivaciones).toEqual([]);
  });

  it('quien reaparece se reactiva', () => {
    const plan = planificarSincronizacion([ADA, GRACE], [existente(ADA), existente(GRACE, false)]);
    expect(plan.reactivaciones.map((p) => p.oid)).toEqual(['oid-grace']);
  });
});

describe('la salvaguarda', () => {
  // Graph devolviendo una lista vacía es indistinguible de una organización que se quedó
  // sin gente, y la segunda no ocurre nunca. Sin esta regla, un permiso mal configurado en
  // la app registration apaga a toda la empresa en una sola corrida.
  it('un Directorio vacío no inactiva a nadie', () => {
    const plan = planificarSincronizacion([], [existente(ADA), existente(GRACE)]);
    expect(plan.inactivaciones).toEqual([]);
    expect(plan.altas).toEqual([]);
    expect(plan.abortado).toBe(true);
    expect(plan.motivo).toContain('vacío');
  });

  it('un Directorio con gente no aborta', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA)]);
    expect(plan.abortado).toBe(false);
    expect(plan.motivo).toBeNull();
  });

  it('ignora entradas sin oid o sin correo', () => {
    const plan = planificarSincronizacion(
      [ADA, { oid: '', nombre: 'Sin oid', correo: 'x@cuantico.com' }],
      [],
    );
    expect(plan.altas.map((a) => a.oid)).toEqual(['oid-ada']);
    expect(plan.ignoradas).toBe(1);
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

```bash
npx jest lib/sig/__tests__/personas.test.ts
```

Expected: FAIL — `Cannot find module '../personas'`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/sig/personas.ts`:

```ts
// lib/sig/personas.ts
//
// Qué cambia en el SIG cuando se lee el Directorio Activo. Puro a propósito: sin Prisma,
// sin sesión y sin red, porque es la lógica que puede apagarle la cuenta a toda la
// organización y tiene que ser probable sin levantar nada.
//
// La identidad es el `oid` de Azure, no el correo. Un matrimonio, un apellido corregido o
// una migración de dominio cambian el UPN sin cambiar a la persona.

export interface EntradaDirectorio {
  oid: string;
  nombre: string;
  correo: string;
}

export interface PersonaExistente extends EntradaDirectorio {
  activa: boolean;
}

export interface CambioPersona {
  oid: string;
  campo: 'nombre' | 'correo';
  anterior: string;
  nuevo: string;
}

export interface PlanSincronizacion {
  altas: EntradaDirectorio[];
  cambios: CambioPersona[];
  inactivaciones: PersonaExistente[];
  reactivaciones: EntradaDirectorio[];
  /// Entradas del Directorio descartadas por venir sin oid o sin correo.
  ignoradas: number;
  /// True cuando el plan se descarta entero por no ser confiable. El llamador no debe
  /// aplicar nada.
  abortado: boolean;
  motivo: string | null;
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

const PLAN_VACIO: Omit<PlanSincronizacion, 'abortado' | 'motivo' | 'ignoradas'> = {
  altas: [],
  cambios: [],
  inactivaciones: [],
  reactivaciones: [],
};

/// Compara lo que dice el Directorio contra lo que tiene la base y devuelve qué hacer.
///
/// Nunca borra: quien desaparece se inactiva. Y si el Directorio viene vacío, no devuelve
/// nada que aplicar — una lista vacía es indistinguible de una organización sin gente, y
/// la segunda no ocurre nunca.
export function planificarSincronizacion(
  directorio: readonly EntradaDirectorio[],
  existentes: readonly PersonaExistente[],
): PlanSincronizacion {
  const validas = directorio.filter((e) => e.oid.trim() !== '' && e.correo.trim() !== '');
  const ignoradas = directorio.length - validas.length;

  if (validas.length === 0) {
    return {
      ...PLAN_VACIO,
      ignoradas,
      abortado: true,
      motivo:
        'El Directorio devolvió un listado vacío. No se aplica nada: una lectura vacía ' +
        'no distingue entre un fallo de permisos y una organización sin personas.',
    };
  }

  const porOid = new Map(existentes.map((p) => [p.oid, p]));
  const vistos = new Set<string>();

  const altas: EntradaDirectorio[] = [];
  const cambios: CambioPersona[] = [];
  const reactivaciones: EntradaDirectorio[] = [];

  for (const cruda of validas) {
    const entrada: EntradaDirectorio = {
      oid: cruda.oid,
      nombre: cruda.nombre.trim(),
      correo: normalizarCorreo(cruda.correo),
    };
    vistos.add(entrada.oid);

    const actual = porOid.get(entrada.oid);
    if (!actual) {
      altas.push(entrada);
      continue;
    }

    if (actual.nombre !== entrada.nombre) {
      cambios.push({
        oid: entrada.oid,
        campo: 'nombre',
        anterior: actual.nombre,
        nuevo: entrada.nombre,
      });
    }
    if (normalizarCorreo(actual.correo) !== entrada.correo) {
      cambios.push({
        oid: entrada.oid,
        campo: 'correo',
        anterior: normalizarCorreo(actual.correo),
        nuevo: entrada.correo,
      });
    }
    if (!actual.activa) reactivaciones.push(entrada);
  }

  const inactivaciones = existentes.filter((p) => p.activa && !vistos.has(p.oid));

  return { altas, cambios, inactivaciones, reactivaciones, ignoradas, abortado: false, motivo: null };
}
```

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

```bash
npx jest lib/sig/__tests__/personas.test.ts
```

Expected: PASS, 12 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/sig/personas.ts lib/sig/__tests__/personas.test.ts
git commit -m "feat(sig): plan de sincronizacion de personas, con salvaguarda de directorio vacio"
```

---

## Task 3: Leer el Directorio con el `oid`

`leerDirectorio()` alimenta las menciones `@` y no cambia. Se agrega una función aparte porque la sincronización **exige Graph**: el respaldo actual se arma con los autores de la bitácora, y de ahí no salen personas nuevas ni object ids.

**Files:**
- Modify: `lib/sgsi/directorio.ts`

- [ ] **Step 1: Agregar la función**

Al final de `lib/sgsi/directorio.ts`, agregar:

```ts
export interface PersonaDirectorioCompleta {
  oid: string;
  nombre: string;
  correo: string;
}

/// Las personas del Directorio CON su object id, para sincronizar la tabla `persona`.
///
/// Devuelve `null` cuando Graph no está configurado o falla. A diferencia de
/// `leerDirectorio()`, acá no hay respaldo: el respaldo se arma con los autores de la
/// bitácora, que no traen object id y no son el censo de la organización. Sincronizar
/// contra una lista inventada es peor que no sincronizar.
export async function leerDirectorioCompleto(): Promise<PersonaDirectorioCompleta[] | null> {
  const tenant = process.env.SHAREPOINT_TENANT_ID;
  const cliente = process.env.SHAREPOINT_CLIENT_ID;
  const secreto = process.env.SHAREPOINT_CLIENT_SECRET;
  if (!tenant || !cliente || !secreto) return null;
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cliente,
        client_secret: secreto,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    if (!tokenRes.ok) return null;
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) return null;

    // `accountEnabled` distingue a quien sigue en la organización de quien tiene la cuenta
    // bloqueada: una cuenta deshabilitada no debe recibir tareas.
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/users' +
        '?$select=id,displayName,userPrincipalName,accountEnabled&$top=999&$orderby=displayName',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      value?: {
        id?: string;
        displayName?: string;
        userPrincipalName?: string;
        accountEnabled?: boolean;
      }[];
    };
    return (data.value ?? [])
      .filter((u) => u.id && u.displayName && u.userPrincipalName && u.accountEnabled !== false)
      .map((u) => ({
        oid: u.id as string,
        nombre: u.displayName as string,
        correo: u.userPrincipalName as string,
      }));
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/sgsi/directorio.ts
git commit -m "feat(sig): leerDirectorioCompleto — personas del Directorio con su object id"
```

---

## Task 4: La acción de sincronización

**Files:**
- Create: `app/sig/acciones/personas.ts`

- [ ] **Step 1: Escribir la acción**

Crear `app/sig/acciones/personas.ts`:

```ts
'use server';

// app/sig/acciones/personas.ts
//
// Aplica contra la base el plan que decidió `lib/sig/personas.ts`. Acá no hay lógica de
// negocio: si una regla se puede probar, vive en el módulo puro y no en esta acción.
//
// Todo ocurre en una transacción con la bitácora adentro: una sincronización a medias que
// dejó gente inactiva sin registrar por qué es exactamente el artefacto que una auditoría
// busca.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { leerDirectorioCompleto } from '@/lib/sgsi/directorio';
import { planificarSincronizacion } from '@/lib/sig/personas';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';

export interface ResultadoSincronizacion extends Resultado {
  altas: number;
  actualizadas: number;
  inactivadas: number;
  reactivadas: number;
  ignoradas: number;
}

const VACIO = { altas: 0, actualizadas: 0, inactivadas: 0, reactivadas: 0, ignoradas: 0 };

export async function sincronizarDirectorio(): Promise<ResultadoSincronizacion> {
  return ejecutar<ResultadoSincronizacion>(async () => {
    const autor = await autorConPermiso('personas:administrar');

    const directorio = await leerDirectorioCompleto();
    if (directorio === null) {
      return {
        ok: false,
        mensaje:
          'Microsoft Graph no está configurado (SHAREPOINT_TENANT_ID / CLIENT_ID / CLIENT_SECRET) ' +
          'o no respondió. No se cambió nada.',
        ...VACIO,
      };
    }

    const existentes = await prisma.persona.findMany({
      select: { oid: true, nombre: true, correo: true, activa: true },
    });

    const plan = planificarSincronizacion(directorio, existentes);
    if (plan.abortado) {
      return { ok: false, mensaje: plan.motivo as string, ...VACIO };
    }

    const ahora = new Date();

    await prisma.$transaction(async (tx) => {
      for (const alta of plan.altas) {
        const creada = await tx.persona.create({
          data: {
            oid: alta.oid,
            nombre: alta.nombre,
            correo: alta.correo,
            activa: true,
            sincronizadaEn: ahora,
          },
        });
        await registrarAlta(tx, autor, 'persona', String(creada.id));
      }

      for (const cambio of plan.cambios) {
        // Escrito con la condición explícita y no con `{ [cambio.campo]: ... }`: una clave
        // computada se ensancha a `{ [x: string]: string }` y Prisma rechaza el tipo.
        const persona = await tx.persona.update({
          where: { oid: cambio.oid },
          data:
            cambio.campo === 'nombre'
              ? { nombre: cambio.nuevo, sincronizadaEn: ahora }
              : { correo: cambio.nuevo, sincronizadaEn: ahora },
        });
        await registrar(tx, autor, [
          {
            tabla: 'persona',
            registroId: String(persona.id),
            campo: cambio.campo,
            anterior: cambio.anterior,
            nuevo: cambio.nuevo,
            motivo: 'sincronización con el Directorio Activo',
          },
        ]);
      }

      for (const baja of plan.inactivaciones) {
        const persona = await tx.persona.update({
          where: { oid: baja.oid },
          data: { activa: false, sincronizadaEn: ahora },
        });
        await registrarBaja(
          tx,
          autor,
          'persona',
          String(persona.id),
          'ya no figura en el Directorio Activo',
        );
      }

      for (const alta of plan.reactivaciones) {
        const persona = await tx.persona.update({
          where: { oid: alta.oid },
          data: { activa: true, sincronizadaEn: ahora },
        });
        await registrar(tx, autor, [
          {
            tabla: 'persona',
            registroId: String(persona.id),
            campo: 'baja lógica',
            anterior: 'dado de baja',
            nuevo: 'vigente',
            motivo: 'reapareció en el Directorio Activo',
          },
        ]);
      }
    });

    revalidatePath('/sig/personas');

    return {
      ok: true,
      mensaje:
        `Directorio sincronizado: ${plan.altas.length} alta(s), ${plan.cambios.length} ` +
        `actualización(es), ${plan.inactivaciones.length} inactivación(es), ` +
        `${plan.reactivaciones.length} reactivación(es).`,
      altas: plan.altas.length,
      actualizadas: plan.cambios.length,
      inactivadas: plan.inactivaciones.length,
      reactivadas: plan.reactivaciones.length,
      ignoradas: plan.ignoradas,
    };
  });
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: **falla** con `Argument of type '"personas:administrar"' is not assignable to parameter of type 'Permiso'`. Es lo esperado: el permiso se crea en la tarea 6. Anotarlo y seguir.

- [ ] **Step 3: Commit**

```bash
git add app/sig/acciones/personas.ts
git commit -m "feat(sig): accion de sincronizacion del Directorio, transaccional y con bitacora"
```

---

## Task 5: Alta al iniciar sesión

Sincronizar el Directorio entero es un acto del líder del SIG. Pero una persona que inicia sesión ya se identificó, y esperar a la próxima sincronización para existir no tiene sentido.

**Files:**
- Modify: `lib/sig/personas.ts`
- Modify: `lib/sig/__tests__/personas.test.ts`
- Modify: `app/lib/auth.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Agregar al final de `lib/sig/__tests__/personas.test.ts`:

```ts
import { entradaDesdePerfil } from '../personas';

describe('entradaDesdePerfil', () => {
  it('arma la entrada con el oid, el nombre y el UPN del token', () => {
    expect(
      entradaDesdePerfil({
        oid: 'oid-ada',
        name: 'Ada Lovelace',
        preferred_username: 'Ada@Cuantico.com',
      }),
    ).toEqual({ oid: 'oid-ada', nombre: 'Ada Lovelace', correo: 'ada@cuantico.com' });
  });

  it('acepta `email` cuando el token no trae preferred_username', () => {
    expect(
      entradaDesdePerfil({ oid: 'oid-ada', name: 'Ada Lovelace', email: 'ada@cuantico.com' }),
    ).toEqual({ oid: 'oid-ada', nombre: 'Ada Lovelace', correo: 'ada@cuantico.com' });
  });

  // Sin oid no hay identidad, y adivinarla por el correo es justo lo que este módulo evita.
  it('devuelve null sin oid, sin correo o sin perfil', () => {
    expect(entradaDesdePerfil({ name: 'Ada', email: 'ada@cuantico.com' })).toBeNull();
    expect(entradaDesdePerfil({ oid: 'oid-ada', name: 'Ada' })).toBeNull();
    expect(entradaDesdePerfil(undefined)).toBeNull();
  });

  it('usa el correo como nombre cuando el token no trae displayName', () => {
    expect(entradaDesdePerfil({ oid: 'oid-ada', email: 'ada@cuantico.com' })).toEqual({
      oid: 'oid-ada',
      nombre: 'ada@cuantico.com',
      correo: 'ada@cuantico.com',
    });
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
npx jest lib/sig/__tests__/personas.test.ts
```

Expected: FAIL — `entradaDesdePerfil is not a function`.

- [ ] **Step 3: Implementar**

Agregar al final de `lib/sig/personas.ts`:

```ts
export interface PerfilToken {
  oid?: unknown;
  name?: unknown;
  email?: unknown;
  preferred_username?: unknown;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/// La entrada de Directorio que se deduce del token de quien acaba de iniciar sesión.
///
/// Devuelve `null` si falta el object id o el correo: sin identidad no se crea a nadie, y
/// deducirla del nombre es exactamente el atajo que este módulo existe para no tomar.
export function entradaDesdePerfil(perfil: PerfilToken | undefined | null): EntradaDirectorio | null {
  if (!perfil) return null;
  const oid = texto(perfil.oid);
  const correo = texto(perfil.preferred_username) ?? texto(perfil.email);
  if (!oid || !correo) return null;
  return {
    oid,
    nombre: texto(perfil.name) ?? normalizarCorreo(correo),
    correo: normalizarCorreo(correo),
  };
}
```

- [ ] **Step 4: Correr para verificar que pasa**

```bash
npx jest lib/sig/__tests__/personas.test.ts
```

Expected: PASS, 16 pruebas.

- [ ] **Step 5: Dar de alta a quien inicia sesión**

En `app/lib/auth.ts`, agregar el import y el callback `signIn`. El archivo queda así:

```ts
import { AuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { prisma } from '@/lib/db';
import { entradaDesdePerfil } from '@/lib/sig/personas';

export const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    // Quien inicia sesión ya se identificó contra el Directorio: existe. Esperar a la
    // próxima sincronización para darle entidad solo produce tareas sin destinatario.
    //
    // Un fallo acá NO impide entrar: la sesión no depende de que la fila exista, y negar el
    // acceso por un problema de base de datos sería una regresión de disponibilidad a
    // cambio de nada.
    async signIn({ profile }) {
      const entrada = entradaDesdePerfil(profile as Record<string, unknown> | undefined);
      if (!entrada) return true;
      try {
        await prisma.persona.upsert({
          where: { oid: entrada.oid },
          update: {
            nombre: entrada.nombre,
            correo: entrada.correo,
            activa: true,
            sincronizadaEn: new Date(),
          },
          create: {
            oid: entrada.oid,
            nombre: entrada.nombre,
            correo: entrada.correo,
            activa: true,
            sincronizadaEn: new Date(),
          },
        });
      } catch (error) {
        console.error('[sig] no se pudo registrar la persona al iniciar sesión', error);
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      // Directory group membership, from which every permission derives. The claim only
      // arrives if the app registration is configured to emit it; when it is absent the
      // role is Colaborador — see lib/sgsi/permisos.ts.
      const grupos = (profile as { groups?: unknown } | undefined)?.groups;
      if (Array.isArray(grupos)) {
        token.grupos = grupos.filter((g): g is string => typeof g === 'string');
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.grupos = (token.grupos as string[] | undefined) ?? undefined;
      }
      return session;
    },
  },
};
```

- [ ] **Step 6: Verificar que compila y que la suite sigue verde**

```bash
npx tsc --noEmit && npm test
```

Expected: `tsc` sigue reportando **solo** el error de `'personas:administrar'` de la tarea 4. Jest pasa.

- [ ] **Step 7: Commit**

```bash
git add lib/sig/personas.ts lib/sig/__tests__/personas.test.ts app/lib/auth.ts
git commit -m "feat(sig): alta de la persona al iniciar sesion, sin bloquear el acceso si falla"
```

---

## Task 6: Rol Colaborador y retiro de `SGI_ACCESO_SIN_GRUPO`

**Antes de empezar:** confirmar con el líder del SIG que quien deba conservar acceso al SGSI está en uno de los tres grupos del Directorio. Ver la advertencia del encabezado.

**Files:**
- Modify: `lib/sgsi/permisos.ts`
- Modify: `lib/sgsi/__tests__/permisos.test.ts`

- [ ] **Step 1: Reescribir las pruebas**

En `lib/sgsi/__tests__/permisos.test.ts`:

1. **Borrar** el bloque `afterEach` de las líneas 13–16 y el `describe('SGI_ACCESO_SIN_GRUPO — acceso abierto, por decisión', ...)` completo.
2. **Reemplazar** el `describe('lo que NO debe otorgar acceso', ...)` por este:

```ts
describe('el piso es Colaborador, no el SGSI', () => {
  it('un token con grupos ajenos es Colaborador y solo ve lo suyo', () => {
    const rol = rolDesdeGrupos(['Domain Users', 'Todos-Cuantico']);
    expect(rol.grupos).toEqual([]);
    expect(puede(rol, 'misig:ver')).toBe(true);
    expect(nombreDelRol(rol)).toBe('Colaborador');
  });

  // La razón de ser de este plan: antes, con SGI_ACCESO_SIN_GRUPO puesto, esta misma
  // cuenta recibía el inventario de activos, el registro de riesgos y la parametrización.
  it('un Colaborador NO alcanza nada del SGSI', () => {
    const rol = rolDesdeGrupos(['Domain Users']);
    for (const permiso of [
      'sgsi:ver',
      'sgsi:escribir',
      'activo:valorar',
      'riesgo:tratar',
      'parametrizacion:escribir',
      'bitacora:ver',
      'evidencia:ver',
      'evidencia:escribir',
      'personas:administrar',
    ] as const) {
      expect(puede(rol, permiso)).toBe(false);
    }
  });

  it('sin claim, también es Colaborador', () => {
    for (const claim of [undefined, null, []] as const) {
      expect(nombreDelRol(rolDesdeGrupos(claim))).toBe('Colaborador');
      expect(puede(rolDesdeGrupos(claim), 'misig:ver')).toBe(true);
      expect(puede(rolDesdeGrupos(claim), 'sgsi:ver')).toBe(false);
    }
  });

  it('un object id parecido pero distinto no recibe más que Colaborador', () => {
    // Un dígito cambiado. Nada acá hace matching por patrón.
    const rol = rolDesdeGrupos(['d04a62e7-11ce-4faf-a1b2-7e77fb7ba59c']);
    expect(rol.grupos).toEqual([]);
    expect(puede(rol, 'sgsi:ver')).toBe(false);
  });

  it('un prefijo del nombre no recibe más que Colaborador', () => {
    expect(rolDesdeGrupos(['Responsables']).grupos).toEqual([]);
    expect(rolDesdeGrupos(['Responsables SIG-Lectura']).grupos).toEqual([]);
  });

  // La variable se retiró. Si alguien la deja puesta en un .env viejo, no debe hacer nada.
  it('SGI_ACCESO_SIN_GRUPO ya no otorga nada', () => {
    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.seguridad;
    process.env.SGI_ROL_POR_DEFECTO = GRUPOS.seguridad;
    try {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'sgsi:escribir')).toBe(false);
    } finally {
      delete process.env.SGI_ACCESO_SIN_GRUPO;
      delete process.env.SGI_ROL_POR_DEFECTO;
    }
  });
});

describe('los tres grupos conservan lo suyo y además ven Mi SIG', () => {
  it('todo rol reconocido tiene misig:ver: nadie deja de tener tareas propias', () => {
    for (const grupo of [GRUPOS.seguridad, GRUPOS.propietarios, GRUPOS.auditoria]) {
      expect(puede(rolDesdeGrupos([grupo]), 'misig:ver')).toBe(true);
    }
  });

  it('solo el líder del SIG administra personas', () => {
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'personas:administrar')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'personas:administrar')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'personas:administrar')).toBe(false);
  });
});
```

3. En el `describe('Responsables SIG', ...)`, la prueba `'no duplica el grupo...'` sigue esperando `nombreDelRol(rol) === 'Líder del SIG'`. **No se toca:** un grupo reconocido sigue mandando.

- [ ] **Step 2: Correr para verificar que falla**

```bash
npx jest lib/sgsi/__tests__/permisos.test.ts
```

Expected: FAIL — `misig:ver` y `personas:administrar` no existen en el tipo `Permiso`, y `nombreDelRol` devuelve `'Sin acceso al SGSI'`.

- [ ] **Step 3: Implementar**

En `lib/sgsi/permisos.ts`:

**3a.** Reemplazar el comentario de cabecera de las líneas 1–30 por:

```ts
// lib/sgsi/permisos.ts
//
// Permissions derive from Directory group membership. The application stores no roles of
// its own: what a person can do is what their AD groups say, which is the answer an
// auditor is looking for when they ask who authorised a change.
//
//   SIG-Seguridad     read and write across the whole SGSI, parameterisation included
//   SIG-Propietarios  value and treat the assets of their own process
//   SIG-Auditoría     read only, with access to the bitácora and the evidence
//
// EL PISO ES COLABORADOR
//
// Toda cuenta autenticada del tenant que no esté en ninguno de esos grupos es Colaborador:
// ve sus propias tareas en Mi SIG y nada más. No es un grupo del Directorio — es lo que
// queda cuando no hay ninguno, y por eso `Rol.grupos` viene vacío.
//
// Esto reemplazó a `SGI_ACCESO_SIN_GRUPO`, que existía porque sin grupo reconocido no se
// entraba a ninguna parte, y cuyo efecto era darle a cualquiera que iniciara sesión el
// inventario de activos, el registro de riesgos, las banderas de datos personales de la
// Ley 1581 y la parametrización del método. Con Colaborador como piso, esa variable dejó
// de tener razón de ser y se retiró. Si quedó puesta en un `.env` viejo, no hace nada.
```

**3b.** Agregar los dos permisos nuevos al tipo:

```ts
export type Permiso =
  | 'misig:ver'
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

**3c.** En `POR_GRUPO`, agregar `'misig:ver'` como primer permiso de los tres grupos, y `'personas:administrar'` solo a `seguridad`:

```ts
const POR_GRUPO: Record<Grupo, Permiso[]> = {
  [GRUPOS.seguridad]: [
    'misig:ver',
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
  // (el comentario extenso de propietarios se conserva tal cual)
  [GRUPOS.propietarios]: ['misig:ver', 'sgsi:ver', 'activo:valorar', 'riesgo:tratar', 'evidencia:escribir'],
  [GRUPOS.auditoria]: ['misig:ver', 'sgsi:ver', 'bitacora:ver', 'evidencia:ver'],
};
```

**3d.** Reemplazar la constante `SIN_ACCESO` por el rol Colaborador:

```ts
/// Lo que recibe una cuenta autenticada sin ningún grupo reconocido: sus propias tareas.
const COLABORADOR: Rol = {
  grupos: [],
  permisos: new Set<Permiso>(['misig:ver']),
  esPorDefecto: false,
};
```

**3e.** Borrar la función `accesoSinGrupo()` completa y reescribir `rolDesdeGrupos`:

```ts
/// Derives the role from the token's groups. Sin grupo reconocido, Colaborador.
export function rolDesdeGrupos(grupos: readonly string[] | undefined | null): Rol {
  const encontrados = reconocidos(grupos ?? []);
  if (encontrados.length === 0) return COLABORADOR;
  return { grupos: encontrados, permisos: permisosDe(encontrados), esPorDefecto: false };
}
```

**3f.** En `nombreDelRol`, cambiar la primera línea:

```ts
  if (rol.grupos.length === 0) return 'Colaborador';
```

- [ ] **Step 4: Correr para verificar que pasa**

```bash
npx jest lib/sgsi/__tests__/permisos.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verificar que ya no queda ninguna referencia al interruptor**

```powershell
Get-ChildItem -Recurse -Include *.ts,*.tsx -File | Where-Object { $_.FullName -notlike "*node_modules*" } | Select-String -Pattern "SGI_ACCESO_SIN_GRUPO|SGI_ROL_POR_DEFECTO|esPorDefecto"
```

Expected: solo la prueba que verifica que la variable ya no otorga nada, y los usos de `esPorDefecto` en la interfaz. **`esPorDefecto` se conserva en el tipo `Rol`**: siempre vale `false` ahora, pero quitarlo obligaría a tocar `ShellSig.tsx` y `EncabezadoSig.tsx`, que no son de este plan. Si aparece algo más, resolverlo antes de seguir.

- [ ] **Step 6: Toda la suite y el tipado**

```bash
npx tsc --noEmit && npm test
```

Expected: `tsc` sin errores —el de la tarea 4 se resuelve acá— y Jest verde.

- [ ] **Step 7: Commit**

```bash
git add lib/sgsi/permisos.ts lib/sgsi/__tests__/permisos.test.ts
git commit -m "feat(sig): rol Colaborador como piso y retiro de SGI_ACCESO_SIN_GRUPO"
```

---

## Task 7: Cierre — documentación y compilación

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Documentar en `.env.example`**

Después del bloque `# ─── SharePoint / Microsoft Graph ───`, agregar:

```
# El mismo app credential se usa para sincronizar las PERSONAS del SIG desde Microsoft
# Graph (permiso de aplicación User.Read.All). Sin estas tres variables, la sincronización
# no corre y lo dice; nunca inventa un listado.
```

- [ ] **Step 2: Nota en el README**

Agregar al final de `README.md`:

```markdown
## Personas y acceso (SIG)

Toda cuenta autenticada del tenant entra como **Colaborador**: ve sus propias tareas en Mi
SIG y nada del SGSI. Los permisos del SGSI siguen viniendo de tres grupos del Directorio —
`Responsables SIG`, `SIG-Propietarios`, `SIG-Auditoría`.

La tabla `persona` es un espejo del Directorio: se crea la fila al iniciar sesión y el
líder del SIG puede sincronizar el censo completo desde Microsoft Graph. Quien desaparece
del Directorio se **inactiva**, nunca se borra, porque sus registros sostienen una
auditoría. Área y cargo son del SIG y la sincronización no los toca.
```

- [ ] **Step 3: Gate — build completo**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: los cuatro en verde. El tablero de indicadores y las once pantallas del SGSI siguen renderizando.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs(sig): documenta el rol Colaborador y la sincronizacion de personas"
```

---

## Verificación manual antes de dar A1 por terminado

1. `npm run dev`, iniciar sesión con una cuenta del tenant que **no** esté en ningún grupo del SIG. Debe entrar, y `/sgsi` debe negarle el acceso.
2. Confirmar en la base que la fila apareció: `select oid, correo, nombre, activa, sincronizada_en from persona;`
3. Con una cuenta de `Responsables SIG`, invocar `sincronizarDirectorio()` y verificar el mensaje con los cuatro conteos.
4. Confirmar la bitácora: `select tabla, campo, valor_anterior, valor_nuevo, motivo, usuario from bitacora where tabla = 'persona' order by id desc limit 20;`
5. Con las tres variables de Graph vacías, invocar la sincronización otra vez: debe responder que no está configurada **y no cambiar nada**.

## Lo que A1 deja listo para A2

`Persona` con área y cargo, poblada y sincronizable; `personas:administrar` y `misig:ver` en el modelo de permisos; y `lib/sig/` como el lugar donde vive lo que es del SIG entero y no del SGSI.
