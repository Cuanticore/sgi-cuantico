# Player SCORM 2004 · Fase 1 — el paquete entra y se ejecuta (REQ-SIG-14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir un paquete SCORM 2004 a una capacitación, ejecutarlo dentro de la aplicación desde un origen aislado, y que su avance —completitud, nota, tiempo, `suspend_data`— se persista y se pueda reanudar.

**Architecture:** Tres documentos y una frontera de origen. La página del player vive en el origen de la aplicación y es la única que habla con el servidor; el *runner* vive en un origen distinto, define `window.API_1484_11` **en memoria** (la API de SCORM es sincrónica y `postMessage` no lo es, así que el modelo de datos se mantiene en el runner y se persiste en cada `Commit`), y el SCO cuelga de un iframe anidado del mismo origen que el runner, que es lo que le permite encontrar la API subiendo por `window.parent`. Las decisiones —qué elemento es escribible, qué código de error corresponde, cómo se llama una duración, qué ruta de un zip es segura— viven en módulos puros con pruebas.

**Tech Stack:** Next 16 (App Router, route handlers, client components), Prisma 7 + Postgres, `yauzl` (descompresión con validación previa), `fast-xml-parser` (manifiesto, sin entidades externas), jest (`npm test`).

**Requerimiento:** `docs/handoff_sig/player-scorm-2004.md` — reglas P1…P20, decisiones D-1…D-5.

**Fase 2 (plan aparte):** cierre de la asignación, retiro del formulario manual, `mode=review`, trabajo de abandono, bitácora del envío al tercero, superficies de operación.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sig/scorm-tiempo.ts` **(crear)** | **Puro.** `PT1H23M45S` ↔ segundos, y la acumulación de `total_time` |
| `lib/sig/scorm-modelo.ts` **(crear)** | **Puro.** El modelo de datos CMI: qué existe, qué acceso tiene, qué tipo admite, qué código de error corresponde. Es el corazón |
| `lib/sig/scorm-zip.ts` **(crear)** | **Puro.** Qué ruta de un zip es segura y qué límites lo hacen inaceptable |
| `lib/sig/scorm-manifiesto.ts` **(crear)** | **Puro.** Del XML al paquete: edición, SCO de entrada, clase, dominios externos |
| `lib/sig/scorm-token.ts` **(crear)** | **Puro.** El token firmado de un intento (P4) |
| `lib/sig/scorm-paquete.ts` **(crear)** | Impuro. Descomprime validando y escribe `PaqueteScorm` + `ArchivoScorm` |
| `app/sig/acciones/scorm.ts` **(crear)** | Server actions: analizar y guardar un paquete (con compuerta de permiso) |
| `app/scorm/runner/page.tsx` **(crear)** | El runner: define `API_1484_11` y anida el SCO. **Origen de contenido** |
| `app/scorm/archivo/[paqueteId]/[...ruta]/route.ts` **(crear)** | Sirve los bytes del paquete con su CSP. **Origen de contenido** |
| `app/mi-sig/curso/[asignacionId]/page.tsx` **(crear)** | La página del player. **Origen de la aplicación** |
| `app/mi-sig/curso/[asignacionId]/Player.client.tsx` **(crear)** | El puente `postMessage` ↔ server actions |
| `app/mi-sig/acciones/curso.ts` **(crear)** | Server actions `abrirIntento` y `guardarIntento` |
| `prisma/schema.prisma` **(modificar)** | `PaqueteScorm`, `ArchivoScorm`, `IntentoScorm` y sus enums |
| `.env.example` **(modificar)** | Las cuatro variables de §14 del requerimiento |

---

## Task 1: Dependencias y configuración

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Instalar las dos dependencias**

```bash
npm install yauzl fast-xml-parser
npm install --save-dev @types/yauzl
```

**Por qué estas dos.** Node no sabe descomprimir un zip por sí solo. `yauzl` permite leer el **directorio central primero** —o sea, conocer nombre y tamaño descomprimido de cada entrada **antes** de extraer nada—, que es justo lo que hace falta para rechazar una bomba zip sin habérsela comido (P6). Una librería que descomprime todo de una pasada obligaría a confiar primero y validar después. `fast-xml-parser` es un parser sin dependencias nativas al que se le puede **apagar la resolución de entidades**, que es el ataque XXE del manifiesto (P7).

- [ ] **Step 2: Verificar que ninguna trae scripts de instalación**

```bash
grep -n "allowScripts" -A 8 package.json
```

Expected: el bloque `allowScripts` sigue igual. `yauzl` y `fast-xml-parser` no ejecutan scripts de post-instalación; si npm pidiera autorizarlos, hay que revisarlo antes de aceptar.

- [ ] **Step 3: Declarar las variables**

Agregar a `.env.example`:

```
# ─── Player SCORM 2004 (REQ-SIG-14) ───────────────────────────────────────────
# Origen DISTINTO al de la aplicación desde el que se sirve el contenido de los
# cursos. Es un requisito de aislamiento, no una preferencia: el JavaScript de un
# curso es código de un tercero. Necesita DNS y certificado propios.
SCORM_ORIGEN_CONTENIDO=https://cursos.sig.cuantico.com
# El origen de la aplicación que el runner acepta en postMessage. Sin él, no corre.
SCORM_ORIGEN_APP=https://sig.cuantico.com
# Techo del .zip. Se valida ANTES de descomprimir.
SCORM_TAMANO_MAX_MB=200
# Minutos sin actividad tras los cuales un intento se marca ABANDONADO (fase 2).
SCORM_INTENTO_ABANDONO_MINUTOS=720
#
# Las cookies de sesión deben seguir siendo host-only (sin Domain=.cuantico.com):
# un cookie de dominio compartido anula el aislamiento del subdominio en silencio.
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(sig): dependencias y variables del player SCORM"
```

---

## Task 2: Duraciones ISO 8601

**Files:**
- Create: `lib/sig/scorm-tiempo.ts`
- Test: `lib/sig/__tests__/scorm-tiempo.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sig/__tests__/scorm-tiempo.test.ts`:

```ts
// lib/sig/__tests__/scorm-tiempo.test.ts
//
// SCORM 2004 mide el tiempo en duraciones ISO 8601 (`PT1H23M45S`), no en segundos. Se
// prueba acá porque un error de conversión no se ve: el curso reporta 40 minutos, la base
// guarda 40 segundos, y el informe de capacitación queda mintiendo sin que nada falle.

import { aSegundos, aDuracion, sumarDuraciones } from '../scorm-tiempo';

describe('aSegundos', () => {
  it('lee horas, minutos y segundos', () => {
    expect(aSegundos('PT1H23M45S')).toBe(5025);
  });

  it('lee una duración con solo minutos', () => {
    expect(aSegundos('PT40M')).toBe(2400);
  });

  it('lee fracciones de segundo', () => {
    expect(aSegundos('PT0.5S')).toBe(0.5);
  });

  it('lee días y años, que el estándar admite', () => {
    expect(aSegundos('P1DT2H')).toBe(93600);
  });

  it('una duración vacía es cero, no NaN', () => {
    expect(aSegundos('PT0H0M0S')).toBe(0);
  });

  // Un valor inválido tiene que ser detectable: es un 406 para el curso, no un 0 silencioso.
  it('devuelve null cuando no es una duración', () => {
    expect(aSegundos('40 minutos')).toBeNull();
    expect(aSegundos('')).toBeNull();
    expect(aSegundos('P')).toBeNull();
  });
});

describe('aDuracion', () => {
  it('vuelve al formato del estándar', () => {
    expect(aDuracion(5025)).toBe('PT1H23M45S');
  });

  it('cero se escribe explícito', () => {
    expect(aDuracion(0)).toBe('PT0H0M0S');
  });

  it('ida y vuelta conserva el valor', () => {
    expect(aSegundos(aDuracion(3661))).toBe(3661);
  });
});

describe('sumarDuraciones', () => {
  // `cmi.total_time` lo acumula el LMS, no el curso: es la suma de las sesiones.
  it('acumula el tiempo total con la sesión nueva', () => {
    expect(sumarDuraciones('PT1H', 'PT30M')).toBe('PT1H30M0S');
  });

  it('una sesión inválida no destruye el total acumulado', () => {
    expect(sumarDuraciones('PT1H', 'basura')).toBe('PT1H0M0S');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-tiempo`
Expected: FAIL — `Cannot find module '../scorm-tiempo'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-tiempo.ts`:

```ts
// lib/sig/scorm-tiempo.ts
//
// Las duraciones del modelo de datos de SCORM 2004 (`timeinterval (second, 10, 2)`), que
// son ISO 8601 y no segundos.
//
// Puro y aparte porque es la conversión que, si se equivoca, no falla: guarda un número
// plausible pero falso, y el informe de capacitación lo repite sin que nada avise.

const PATRON =
  /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const SEGUNDOS = {
  anio: 31_536_000,
  mes: 2_592_000,
  dia: 86_400,
  hora: 3_600,
  minuto: 60,
};

/// `null` cuando no es una duración válida. Es `null` y no `0` a propósito: el llamador
/// tiene que poder devolverle 406 al curso, y un cero silencioso le haría creer que su
/// valor se aceptó.
export function aSegundos(duracion: string): number | null {
  if (duracion === 'P' || duracion === '' || duracion === 'PT') return null;
  const m = PATRON.exec(duracion);
  if (m === null) return null;
  const n = (i: number) => (m[i] === undefined ? 0 : Number(m[i]));
  return (
    n(1) * SEGUNDOS.anio +
    n(2) * SEGUNDOS.mes +
    n(3) * SEGUNDOS.dia +
    n(4) * SEGUNDOS.hora +
    n(5) * SEGUNDOS.minuto +
    n(6)
  );
}

export function aDuracion(segundos: number): string {
  const total = Math.max(0, segundos);
  const horas = Math.floor(total / SEGUNDOS.hora);
  const minutos = Math.floor((total % SEGUNDOS.hora) / SEGUNDOS.minuto);
  const resto = total % SEGUNDOS.minuto;
  // Los segundos se escriben sin decimales cuando son enteros: `PT1H23M45S` y no
  // `PT1H23M45.00S`, que es lo que un curso espera leer de vuelta.
  const seg = Number.isInteger(resto) ? String(resto) : resto.toFixed(2);
  return `PT${horas}H${minutos}M${seg}S`;
}

/// Suma la sesión al total. Una sesión inválida se ignora en vez de perder el acumulado:
/// el tiempo ya invertido por la persona no se borra por un valor mal formado del curso.
export function sumarDuraciones(total: string, sesion: string): string {
  const a = aSegundos(total) ?? 0;
  const b = aSegundos(sesion) ?? 0;
  return aDuracion(a + b);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-tiempo`
Expected: PASS — 11 pruebas

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-tiempo.ts lib/sig/__tests__/scorm-tiempo.test.ts
git commit -m "feat(sig): las duraciones ISO 8601 del modelo de datos de SCORM"
```

---

## Task 3: El modelo de datos CMI

**Files:**
- Create: `lib/sig/scorm-modelo.ts`
- Test: `lib/sig/__tests__/scorm-modelo.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sig/__tests__/scorm-modelo.test.ts`:

```ts
// lib/sig/__tests__/scorm-modelo.test.ts
//
// P8 · los códigos de error se implementan, no se aproximan. Un curso bien hecho RAMIFICA
// según el código: devolver siempre 101 hace que decida mal y que el defecto parezca del
// curso. Es la misma lección de `graph-fallo.ts` — un error que significa cinco cosas manda
// a la gente a arreglar lo que no está roto.
//
// Estas pruebas son el contrato que comparten el runner (en el navegador) y el servidor: la
// validación corre en los dos lados con este mismo módulo, así que una discrepancia entre
// lo que el curso creyó guardar y lo que se guardó es imposible por construcción.

import {
  ELEMENTO_NO_DEFINIDO,
  ELEMENTO_SOLO_ESCRITURA,
  ELEMENTO_SOLO_LECTURA,
  FALLO_GENERAL_AL_FIJAR,
  FIJAR_ANTES_DE_INICIALIZAR,
  OBTENER_ANTES_DE_INICIALIZAR,
  OBTENER_DESPUES_DE_TERMINAR,
  OK,
  TIPO_INCORRECTO,
  VALOR_FUERA_DE_RANGO,
  YA_INICIALIZADO,
  frase,
  indiceDe,
  normalizar,
  validarEscritura,
  validarLectura,
  validarInitialize,
} from '../scorm-modelo';

const ABIERTO = { iniciado: true, terminado: false };

describe('normalizar e indiceDe', () => {
  // Las colecciones se direccionan con un índice; el modelo se declara una sola vez con `n`.
  it('reemplaza el índice por n', () => {
    expect(normalizar('cmi.objectives.3.id')).toBe('cmi.objectives.n.id');
    expect(normalizar('cmi.interactions.12.result')).toBe('cmi.interactions.n.result');
  });

  it('deja intacto lo que no es colección', () => {
    expect(normalizar('cmi.completion_status')).toBe('cmi.completion_status');
  });

  it('extrae el índice', () => {
    expect(indiceDe('cmi.objectives.3.id')).toBe(3);
    expect(indiceDe('cmi.completion_status')).toBeNull();
  });
});

describe('máquina de estados', () => {
  it('Initialize dos veces es 103', () => {
    expect(validarInitialize({ iniciado: false, terminado: false })).toBe(OK);
    expect(validarInitialize(ABIERTO)).toBe(YA_INICIALIZADO);
  });

  it('leer antes de Initialize es 122', () => {
    expect(validarLectura('cmi.learner_id', { iniciado: false, terminado: false })).toBe(
      OBTENER_ANTES_DE_INICIALIZAR,
    );
  });

  it('leer después de Terminate es 123', () => {
    expect(validarLectura('cmi.learner_id', { iniciado: true, terminado: true })).toBe(
      OBTENER_DESPUES_DE_TERMINAR,
    );
  });

  it('escribir antes de Initialize es 132', () => {
    expect(
      validarEscritura('cmi.location', 'p3', { iniciado: false, terminado: false }, { objetivos: 0, interacciones: 0 }),
    ).toBe(FIJAR_ANTES_DE_INICIALIZAR);
  });
});

describe('acceso a los elementos', () => {
  it('un elemento inexistente es 401', () => {
    expect(validarLectura('cmi.inventado', ABIERTO)).toBe(ELEMENTO_NO_DEFINIDO);
  });

  // `cmi.total_time` lo acumula el LMS. Si el curso pudiera escribirlo, el tiempo total de
  // capacitación de la organización sería lo que cada curso quiera decir.
  it('escribir un elemento de solo lectura es 404', () => {
    expect(validarEscritura('cmi.total_time', 'PT1H', ABIERTO, { objetivos: 0, interacciones: 0 })).toBe(
      ELEMENTO_SOLO_LECTURA,
    );
    expect(validarEscritura('cmi.learner_id', 'otro', ABIERTO, { objetivos: 0, interacciones: 0 })).toBe(
      ELEMENTO_SOLO_LECTURA,
    );
  });

  it('leer un elemento de solo escritura es 405', () => {
    expect(validarLectura('cmi.session_time', ABIERTO)).toBe(ELEMENTO_SOLO_ESCRITURA);
    expect(validarLectura('cmi.exit', ABIERTO)).toBe(ELEMENTO_SOLO_ESCRITURA);
  });

  it('los elementos que el requerimiento exige existen', () => {
    for (const e of [
      'cmi._version',
      'cmi.completion_status',
      'cmi.success_status',
      'cmi.score.scaled',
      'cmi.score.raw',
      'cmi.progress_measure',
      'cmi.location',
      'cmi.suspend_data',
      'cmi.entry',
      'cmi.credit',
      'cmi.mode',
      'cmi.launch_data',
      'cmi.scaled_passing_score',
      'cmi.completion_threshold',
      'cmi.objectives.n.id',
      'cmi.interactions.n.id',
      'adl.nav.request',
    ]) {
      expect(validarLectura(e, ABIERTO)).not.toBe(ELEMENTO_NO_DEFINIDO);
    }
  });
});

describe('validación de valores', () => {
  const conteos = { objetivos: 0, interacciones: 0 };

  it('un vocabulario fuera de lista es 406', () => {
    expect(validarEscritura('cmi.completion_status', 'terminado', ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
    expect(validarEscritura('cmi.completion_status', 'completed', ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.success_status', 'passed', ABIERTO, conteos)).toBe(OK);
  });

  it('una nota fuera de rango es 407', () => {
    expect(validarEscritura('cmi.score.scaled', '1.5', ABIERTO, conteos)).toBe(VALOR_FUERA_DE_RANGO);
    expect(validarEscritura('cmi.score.scaled', '-1', ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.progress_measure', '-0.1', ABIERTO, conteos)).toBe(
      VALOR_FUERA_DE_RANGO,
    );
  });

  it('una nota que no es número es 406', () => {
    expect(validarEscritura('cmi.score.scaled', 'ocho', ABIERTO, conteos)).toBe(TIPO_INCORRECTO);
  });

  it('una duración mal formada es 406', () => {
    expect(validarEscritura('cmi.session_time', '40 minutos', ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
    expect(validarEscritura('cmi.session_time', 'PT40M', ABIERTO, conteos)).toBe(OK);
  });

  // §6 · `suspend_data` son 64 000 caracteres en 2004 (4 096 era 1.2). Truncarlo es perder
  // el avance de alguien en un curso de 40 minutos, y eso se paga con que no lo repita.
  it('suspend_data admite 64 000 caracteres y rechaza 64 001', () => {
    expect(validarEscritura('cmi.suspend_data', 'x'.repeat(64_000), ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.suspend_data', 'x'.repeat(64_001), ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
  });

  it('location admite 1 000 caracteres', () => {
    expect(validarEscritura('cmi.location', 'x'.repeat(1_000), ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.location', 'x'.repeat(1_001), ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
  });
});

describe('colecciones', () => {
  // P9 · escribir el índice 3 cuando el conteo es 1 es 351. Aceptarlo en silencio hace que
  // un curso que consulta `_count` y recibe basura escriba basura.
  it('un índice fuera de orden es 351', () => {
    expect(
      validarEscritura('cmi.objectives.3.id', 'obj-3', ABIERTO, { objetivos: 1, interacciones: 0 }),
    ).toBe(FALLO_GENERAL_AL_FIJAR);
  });

  it('el índice siguiente al conteo se acepta: es agregar', () => {
    expect(
      validarEscritura('cmi.objectives.1.id', 'obj-2', ABIERTO, { objetivos: 1, interacciones: 0 }),
    ).toBe(OK);
  });

  it('un índice existente se acepta: es corregir', () => {
    expect(
      validarEscritura('cmi.objectives.0.id', 'obj-1', ABIERTO, { objetivos: 1, interacciones: 0 }),
    ).toBe(OK);
  });
});

describe('frase', () => {
  it('cada código tiene su frase del estándar', () => {
    expect(frase(0)).toBe('No Error');
    expect(frase(404)).toBe('Data Model Element Is Read Only');
    expect(frase(9999)).toBe('General Exception');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-modelo`
Expected: FAIL — `Cannot find module '../scorm-modelo'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-modelo.ts`:

```ts
// lib/sig/scorm-modelo.ts
//
// El modelo de datos de SCORM 2004 3rd Edition: qué elementos existen, quién puede
// escribirlos, qué valores admiten y qué código de error corresponde a cada infracción.
//
// Es el corazón del player y es PURO, por dos razones que se refuerzan:
//
//   1. Se puede probar de verdad, sin navegador y sin base de datos.
//   2. Corre EN LOS DOS LADOS. El runner valida en el navegador para poder responderle al
//      curso de forma sincrónica —la API de SCORM no admite esperar—, y el servidor valida
//      otra vez antes de persistir (P5), porque un cliente puede mandar cualquier cosa. Al
//      ser el mismo módulo, no hay dos criterios que puedan discrepar.

import { aSegundos } from './scorm-tiempo';

// ── Códigos de error del estándar (P8) ──────────────────────────────────────────────────

export const OK = 0;
export const EXCEPCION_GENERAL = 101;
export const FALLO_GENERAL_AL_INICIALIZAR = 102;
export const YA_INICIALIZADO = 103;
export const CONTENIDO_TERMINADO = 104;
export const FALLO_GENERAL_AL_TERMINAR = 111;
export const TERMINAR_ANTES_DE_INICIALIZAR = 112;
export const TERMINAR_DESPUES_DE_TERMINAR = 113;
export const OBTENER_ANTES_DE_INICIALIZAR = 122;
export const OBTENER_DESPUES_DE_TERMINAR = 123;
export const FIJAR_ANTES_DE_INICIALIZAR = 132;
export const FIJAR_DESPUES_DE_TERMINAR = 133;
export const CONFIRMAR_ANTES_DE_INICIALIZAR = 142;
export const CONFIRMAR_DESPUES_DE_TERMINAR = 143;
export const ARGUMENTO_GENERAL_INVALIDO = 201;
export const FALLO_GENERAL_AL_OBTENER = 301;
export const FALLO_GENERAL_AL_FIJAR = 351;
export const FALLO_GENERAL_AL_CONFIRMAR = 391;
export const ELEMENTO_NO_DEFINIDO = 401;
export const ELEMENTO_NO_IMPLEMENTADO = 402;
export const VALOR_NO_INICIALIZADO = 403;
export const ELEMENTO_SOLO_LECTURA = 404;
export const ELEMENTO_SOLO_ESCRITURA = 405;
export const TIPO_INCORRECTO = 406;
export const VALOR_FUERA_DE_RANGO = 407;
export const DEPENDENCIA_NO_ESTABLECIDA = 408;

/// Las frases son las del estándar y van EN INGLÉS: `GetErrorString` es parte de la API que
/// consume el curso, no un mensaje para una persona. Lo que sí va en español es el
/// diagnóstico nuestro (`GetDiagnostic`), que es donde se explica qué pasó.
const FRASES: Record<number, string> = {
  0: 'No Error',
  101: 'General Exception',
  102: 'General Initialization Failure',
  103: 'Already Initialized',
  104: 'Content Instance Terminated',
  111: 'General Termination Failure',
  112: 'Termination Before Initialization',
  113: 'Termination After Termination',
  122: 'Retrieve Data Before Initialization',
  123: 'Retrieve Data After Termination',
  132: 'Store Data Before Initialization',
  133: 'Store Data After Termination',
  142: 'Commit Before Initialization',
  143: 'Commit After Termination',
  201: 'General Argument Error',
  301: 'General Get Failure',
  351: 'General Set Failure',
  391: 'General Commit Failure',
  401: 'Undefined Data Model Element',
  402: 'Unimplemented Data Model Element',
  403: 'Data Model Element Value Not Initialized',
  404: 'Data Model Element Is Read Only',
  405: 'Data Model Element Is Write Only',
  406: 'Data Model Element Type Mismatch',
  407: 'Data Model Element Value Out Of Range',
  408: 'Data Model Dependency Not Established',
};

export function frase(codigo: number): string {
  return FRASES[codigo] ?? FRASES[EXCEPCION_GENERAL];
}

// ── El modelo ───────────────────────────────────────────────────────────────────────────

export type Acceso = 'RO' | 'RW' | 'WO';

export type Tipo =
  | { clase: 'cadena'; largoMaximo: number }
  | { clase: 'vocabulario'; valores: readonly string[] }
  | { clase: 'decimal'; minimo: number; maximo: number }
  | { clase: 'duracion' }
  | { clase: 'entero'; minimo: number };

export interface Definicion {
  acceso: Acceso;
  tipo: Tipo;
}

const ESTADO_COMPLETITUD = ['completed', 'incomplete', 'not attempted', 'unknown'] as const;
const ESTADO_EXITO = ['passed', 'failed', 'unknown'] as const;
const SALIDA = ['time-out', 'suspend', 'logout', 'normal', ''] as const;
const ENTRADA = ['ab-initio', 'resume', ''] as const;
const MODO = ['browse', 'normal', 'review'] as const;
const CREDITO = ['credit', 'no-credit'] as const;
const NAVEGACION = ['continue', 'previous', 'choice', 'exit', 'exitAll', 'abandon', 'abandonAll', '_none_'] as const;

const cadena = (largoMaximo: number): Tipo => ({ clase: 'cadena', largoMaximo });
const vocabulario = (valores: readonly string[]): Tipo => ({ clase: 'vocabulario', valores });
const decimal = (minimo: number, maximo: number): Tipo => ({ clase: 'decimal', minimo, maximo });

/// Los elementos del requerimiento §6, con `n` donde va el índice de una colección.
export const ELEMENTOS: Record<string, Definicion> = {
  'cmi._version': { acceso: 'RO', tipo: cadena(20) },
  'cmi.learner_id': { acceso: 'RO', tipo: cadena(4000) },
  'cmi.learner_name': { acceso: 'RO', tipo: cadena(250) },
  'cmi.completion_status': { acceso: 'RW', tipo: vocabulario(ESTADO_COMPLETITUD) },
  'cmi.success_status': { acceso: 'RW', tipo: vocabulario(ESTADO_EXITO) },
  'cmi.score.scaled': { acceso: 'RW', tipo: decimal(-1, 1) },
  'cmi.score.raw': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.score.min': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.score.max': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.progress_measure': { acceso: 'RW', tipo: decimal(0, 1) },
  'cmi.session_time': { acceso: 'WO', tipo: { clase: 'duracion' } },
  'cmi.total_time': { acceso: 'RO', tipo: { clase: 'duracion' } },
  'cmi.location': { acceso: 'RW', tipo: cadena(1000) },
  'cmi.suspend_data': { acceso: 'RW', tipo: cadena(64_000) },
  'cmi.entry': { acceso: 'RO', tipo: vocabulario(ENTRADA) },
  'cmi.exit': { acceso: 'WO', tipo: vocabulario(SALIDA) },
  'cmi.credit': { acceso: 'RO', tipo: vocabulario(CREDITO) },
  'cmi.mode': { acceso: 'RO', tipo: vocabulario(MODO) },
  'cmi.launch_data': { acceso: 'RO', tipo: cadena(4000) },
  'cmi.scaled_passing_score': { acceso: 'RO', tipo: decimal(-1, 1) },
  'cmi.completion_threshold': { acceso: 'RO', tipo: decimal(0, 1) },
  'cmi.max_time_allowed': { acceso: 'RO', tipo: { clase: 'duracion' } },
  'cmi.time_limit_action': {
    acceso: 'RO',
    tipo: vocabulario(['exit,message', 'continue,message', 'exit,no message', 'continue,no message']),
  },
  'cmi.objectives._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.objectives.n.id': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.objectives.n.success_status': { acceso: 'RW', tipo: vocabulario(ESTADO_EXITO) },
  'cmi.objectives.n.completion_status': { acceso: 'RW', tipo: vocabulario(ESTADO_COMPLETITUD) },
  'cmi.objectives.n.progress_measure': { acceso: 'RW', tipo: decimal(0, 1) },
  'cmi.objectives.n.description': { acceso: 'RW', tipo: cadena(250) },
  'cmi.objectives.n.score.scaled': { acceso: 'RW', tipo: decimal(-1, 1) },
  'cmi.objectives.n.score.raw': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.objectives.n.score.min': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.objectives.n.score.max': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.interactions._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.interactions.n.id': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.interactions.n.type': {
    acceso: 'RW',
    tipo: vocabulario([
      'true-false', 'choice', 'fill-in', 'long-fill-in', 'likert', 'matching',
      'performance', 'sequencing', 'numeric', 'other',
    ]),
  },
  'cmi.interactions.n.timestamp': { acceso: 'RW', tipo: cadena(30) },
  'cmi.interactions.n.learner_response': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.interactions.n.correct_responses._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.interactions.n.result': { acceso: 'RW', tipo: cadena(250) },
  'cmi.interactions.n.weighting': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.interactions.n.latency': { acceso: 'RW', tipo: { clase: 'duracion' } },
  'cmi.interactions.n.description': { acceso: 'RW', tipo: cadena(250) },
  'cmi.interactions.n.objectives._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.comments_from_learner._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.comments_from_learner.n.comment': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.comments_from_learner.n.location': { acceso: 'RW', tipo: cadena(250) },
  'cmi.comments_from_learner.n.timestamp': { acceso: 'RW', tipo: cadena(30) },
  // D-3 · con un solo SCO la navegación es trivial, pero los elementos EXISTEN: un curso
  // que pregunta y recibe 401 puede decidir que el LMS está roto.
  'adl.nav.request': { acceso: 'RW', tipo: vocabulario(NAVEGACION) },
  'adl.nav.request_valid.continue': { acceso: 'RO', tipo: cadena(20) },
  'adl.nav.request_valid.previous': { acceso: 'RO', tipo: cadena(20) },
};

const INDICE = /\.(\d+)\./;

export function normalizar(elemento: string): string {
  return elemento.replace(/\.\d+\./g, '.n.');
}

export function indiceDe(elemento: string): number | null {
  const m = INDICE.exec(elemento);
  return m === null ? null : Number(m[1]);
}

export function definicionDe(elemento: string): Definicion | null {
  return ELEMENTOS[normalizar(elemento)] ?? null;
}

export interface EstadoSesion {
  iniciado: boolean;
  terminado: boolean;
}

export interface Conteos {
  objetivos: number;
  interacciones: number;
}

export function validarInitialize(s: EstadoSesion): number {
  if (s.terminado) return CONTENIDO_TERMINADO;
  if (s.iniciado) return YA_INICIALIZADO;
  return OK;
}

export function validarTerminate(s: EstadoSesion): number {
  if (s.terminado) return TERMINAR_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return TERMINAR_ANTES_DE_INICIALIZAR;
  return OK;
}

export function validarCommit(s: EstadoSesion): number {
  if (s.terminado) return CONFIRMAR_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return CONFIRMAR_ANTES_DE_INICIALIZAR;
  return OK;
}

export function validarLectura(elemento: string, s: EstadoSesion): number {
  if (s.terminado) return OBTENER_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return OBTENER_ANTES_DE_INICIALIZAR;
  const def = definicionDe(elemento);
  if (def === null) return ELEMENTO_NO_DEFINIDO;
  if (def.acceso === 'WO') return ELEMENTO_SOLO_ESCRITURA;
  return OK;
}

export function validarValor(tipo: Tipo, valor: string): number {
  switch (tipo.clase) {
    case 'cadena':
      return valor.length > tipo.largoMaximo ? TIPO_INCORRECTO : OK;
    case 'vocabulario':
      return tipo.valores.includes(valor) ? OK : TIPO_INCORRECTO;
    case 'decimal': {
      if (valor.trim() === '' || Number.isNaN(Number(valor))) return TIPO_INCORRECTO;
      const n = Number(valor);
      return n < tipo.minimo || n > tipo.maximo ? VALOR_FUERA_DE_RANGO : OK;
    }
    case 'duracion':
      return aSegundos(valor) === null ? TIPO_INCORRECTO : OK;
    case 'entero': {
      if (!/^-?\d+$/.test(valor)) return TIPO_INCORRECTO;
      return Number(valor) < tipo.minimo ? VALOR_FUERA_DE_RANGO : OK;
    }
  }
}

export function validarEscritura(
  elemento: string,
  valor: string,
  s: EstadoSesion,
  conteos: Conteos,
): number {
  if (s.terminado) return FIJAR_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return FIJAR_ANTES_DE_INICIALIZAR;

  const def = definicionDe(elemento);
  if (def === null) return ELEMENTO_NO_DEFINIDO;
  if (def.acceso === 'RO') return ELEMENTO_SOLO_LECTURA;

  // P9 · las colecciones se llenan EN ORDEN: se puede corregir un índice existente o
  // agregar el siguiente, nada más. Un salto significa que el curso perdió la cuenta, y
  // aceptarlo guarda un hueco que después nadie puede interpretar.
  const indice = indiceDe(elemento);
  if (indice !== null) {
    const normalizado = normalizar(elemento);
    const tope = normalizado.startsWith('cmi.objectives')
      ? conteos.objetivos
      : normalizado.startsWith('cmi.interactions')
        ? conteos.interacciones
        : Number.MAX_SAFE_INTEGER;
    if (indice > tope) return FALLO_GENERAL_AL_FIJAR;
  }

  return validarValor(def.tipo, valor);
}

/// Los elementos de solo lectura que el LMS entrega al abrir la sesión. Puro para poder
/// probar que un intento reanudado devuelve lo que el anterior dejó (P10).
export interface DatosDeLanzamiento {
  learnerId: string;
  learnerName: string;
  entry: 'ab-initio' | 'resume';
  mode: 'normal' | 'review';
  credit: 'credit' | 'no-credit';
  totalTime: string;
  location: string;
  suspendData: string;
  completionStatus: string;
  successStatus: string;
  scoreScaled: string | null;
  progressMeasure: string | null;
  launchData: string;
  scaledPassingScore: string | null;
  completionThreshold: string | null;
}

export function modeloInicial(d: DatosDeLanzamiento): Record<string, string> {
  const modelo: Record<string, string> = {
    'cmi._version': '1.0',
    'cmi.learner_id': d.learnerId,
    'cmi.learner_name': d.learnerName,
    'cmi.entry': d.entry,
    'cmi.mode': d.mode,
    'cmi.credit': d.credit,
    'cmi.total_time': d.totalTime,
    'cmi.location': d.location,
    'cmi.suspend_data': d.suspendData,
    'cmi.completion_status': d.completionStatus,
    'cmi.success_status': d.successStatus,
    'cmi.launch_data': d.launchData,
    'cmi.objectives._count': '0',
    'cmi.interactions._count': '0',
    'cmi.comments_from_learner._count': '0',
    'adl.nav.request': '_none_',
    // D-3 · un solo SCO: no hay a dónde continuar ni volver, y el estándar pide que se diga.
    'adl.nav.request_valid.continue': 'unsupported',
    'adl.nav.request_valid.previous': 'unsupported',
  };
  if (d.scoreScaled !== null) modelo['cmi.score.scaled'] = d.scoreScaled;
  if (d.progressMeasure !== null) modelo['cmi.progress_measure'] = d.progressMeasure;
  if (d.scaledPassingScore !== null) modelo['cmi.scaled_passing_score'] = d.scaledPassingScore;
  if (d.completionThreshold !== null) modelo['cmi.completion_threshold'] = d.completionThreshold;
  return modelo;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-modelo`
Expected: PASS — 20 pruebas

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-modelo.ts lib/sig/__tests__/scorm-modelo.test.ts
git commit -m "feat(sig): el modelo de datos de SCORM 2004 con sus codigos de error"
```

---

## Task 4: Rutas seguras y límites del zip

**Files:**
- Create: `lib/sig/scorm-zip.ts`
- Test: `lib/sig/__tests__/scorm-zip.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sig/__tests__/scorm-zip.test.ts`:

```ts
// lib/sig/__tests__/scorm-zip.test.ts
//
// P6 · descomprimir es un camino hostil. El .zip lo sube una persona, y un paquete puede
// traer `../../etc/passwd` en un nombre de archivo, 40 000 entradas, o 10 GB comprimidos en
// 2 MB. Estas reglas se prueban acá para que el módulo que descomprime no tenga que
// decidir nada: sólo obedecer.

import {
  LIMITE_ARCHIVOS,
  excedeElTotal,
  limiteDescomprimido,
  rutaSegura,
} from '../scorm-zip';

describe('rutaSegura', () => {
  it('acepta una ruta relativa normal', () => {
    expect(rutaSegura('shared/launchpage.html')).toBe('shared/launchpage.html');
  });

  it('normaliza las barras invertidas de Windows', () => {
    expect(rutaSegura('shared\\js\\app.js')).toBe('shared/js/app.js');
  });

  it('quita el ./ inicial', () => {
    expect(rutaSegura('./imsmanifest.xml')).toBe('imsmanifest.xml');
  });

  // Zip slip: la entrada escapa del directorio del paquete.
  it('rechaza el escape con ..', () => {
    expect(rutaSegura('../../etc/passwd')).toBeNull();
    expect(rutaSegura('a/../../b')).toBeNull();
  });

  it('rechaza una ruta absoluta', () => {
    expect(rutaSegura('/etc/passwd')).toBeNull();
    expect(rutaSegura('C:/Windows/system32')).toBeNull();
  });

  it('rechaza los bytes nulos', () => {
    expect(rutaSegura('a\u0000b.html')).toBeNull();
  });

  it('rechaza una ruta vacía', () => {
    expect(rutaSegura('')).toBeNull();
    expect(rutaSegura('   ')).toBeNull();
  });
});

describe('límites', () => {
  it('el techo descomprimido es cuatro veces el del zip', () => {
    expect(limiteDescomprimido(200)).toBe(200 * 1024 * 1024 * 4);
  });

  it('el conteo de archivos tiene techo', () => {
    expect(LIMITE_ARCHIVOS).toBe(2000);
  });

  // Bomba zip: 2 MB comprimidos que se expanden a 10 GB.
  it('detecta la expansión desmedida', () => {
    expect(excedeElTotal(10 * 1024 ** 3, limiteDescomprimido(200))).toBe(true);
    expect(excedeElTotal(50 * 1024 ** 2, limiteDescomprimido(200))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-zip`
Expected: FAIL — `Cannot find module '../scorm-zip'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-zip.ts`:

```ts
// lib/sig/scorm-zip.ts
//
// Qué entrada de un .zip es aceptable. Puro: el módulo que descomprime no decide, obedece.

/// Un curso normal trae decenas o cientos de archivos. Dos mil es holgado y a la vez corta
/// un paquete con 40 000 entradas, que no es un curso sino un problema.
export const LIMITE_ARCHIVOS = 2000;

/// Cuatro veces el techo del zip. Un curso comprime bien (HTML, JS, imágenes ya
/// comprimidas), así que 4× cubre el caso legítimo y deja fuera la bomba.
export function limiteDescomprimido(maxZipMb: number): number {
  return maxZipMb * 1024 * 1024 * 4;
}

export function excedeElTotal(acumulado: number, limite: number): boolean {
  return acumulado > limite;
}

/// La ruta normalizada, o `null` si la entrada no se puede aceptar. Devuelve la ruta y no un
/// booleano a propósito: quien descomprime debe usar SIEMPRE la versión normalizada, y si
/// tuviera que normalizar por su cuenta habría dos implementaciones de la misma regla.
export function rutaSegura(nombre: string): string | null {
  if (nombre.includes('\u0000')) return null;

  const normalizada = nombre.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (normalizada === '') return null;

  // Absolutas: POSIX y Windows.
  if (normalizada.startsWith('/') || /^[A-Za-z]:/.test(normalizada)) return null;

  const partes = normalizada.split('/');
  if (partes.some((p) => p === '..')) return null;

  return normalizada;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-zip`
Expected: PASS — 11 pruebas

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-zip.ts lib/sig/__tests__/scorm-zip.test.ts
git commit -m "feat(sig): las reglas que hacen seguro descomprimir un paquete"
```

---

## Task 5: El manifiesto

**Files:**
- Create: `lib/sig/scorm-manifiesto.ts`
- Test: `lib/sig/__tests__/scorm-manifiesto.test.ts`

- [ ] **Step 1: Escribir la prueba que falla, con el manifiesto real del paquete entregado**

Crear `lib/sig/__tests__/scorm-manifiesto.test.ts`:

```ts
// lib/sig/__tests__/scorm-manifiesto.test.ts
//
// El manifiesto del paquete ENTREGADO está acá tal como viene (recortado a lo que importa),
// porque es el caso real: un paquete de DESPACHO cuyo contenido no está en el zip. La
// verificación 3 del requerimiento es exactamente esta prueba.

import { analizarManifiesto } from '../scorm-manifiesto';

const ENTREGADO = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="SingleCourseManifest" version="1.1"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
          xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations default="B0">
    <organization identifier="B0">
      <title>Codificación Segura</title>
      <item identifier="it1" identifierref="c1" isvisible="true">
        <title>Codificación Segura</title>
        <imsss:sequencing>
          <imsss:deliveryControls tracked="true" completionSetByContent="true" objectiveSetByContent="true"/>
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="c1" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

const AUTOCONTENIDO = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="M1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="O1">
    <organization identifier="O1">
      <title>Inducción SGSI</title>
      <item identifier="i1" identifierref="r1"><title>Módulo único</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormType="sco" href="shared/launch.html">
      <file href="shared/launch.html"/>
    </resource>
  </resources>
</manifest>`;

const DOS_SCO = AUTOCONTENIDO.replace(
  '<item identifier="i1" identifierref="r1"><title>Módulo único</title></item>',
  '<item identifier="i1" identifierref="r1"><title>Uno</title></item>' +
    '<item identifier="i2" identifierref="r1"><title>Dos</title></item>',
);

const SCORM_12 = AUTOCONTENIDO.replace('2004 4th Edition', '1.2');

describe('analizarManifiesto · el paquete entregado', () => {
  const r = analizarManifiesto(ENTREGADO, [
    'imsmanifest.xml',
    'index.html',
    'adlcp_v1p3.xsd',
  ]);

  it('lo acepta', () => {
    expect(r.ok).toBe(true);
  });

  it('detecta la edición y el título', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.edicion).toBe('2004 3rd Edition');
    expect(r.paquete.tituloOrganizacion).toBe('Codificación Segura');
    expect(r.paquete.organizacionId).toBe('B0');
  });

  it('encuentra el SCO de entrada', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.entradaHref).toBe('index.html');
  });

  // §2 · el curso NO está en el zip: index.html carga un driver y un iframe de un tercero.
  // Es lo que separa «este curso no comparte datos» de «este curso comparte correo y
  // nombre», así que la clase no es decorativa.
  it('lo clasifica como DESPACHO por el contenido del SCO', () => {
    const conShell = analizarManifiesto(ENTREGADO, ['imsmanifest.xml', 'index.html'], {
      'index.html':
        '<script src="https://my.coursebox.ai/assets/scripts/scormxd-driver.min.js"></script>' +
        '<iframe name="sxdclient_iframe"></iframe>' +
        '<script>new ScormXDDriver("2004").init("sxdclient_iframe", {remoteurl: "https://my.coursebox.ai"});</script>',
    });
    if (!conShell.ok) throw new Error(conShell.motivo);
    expect(conShell.paquete.clase).toBe('DESPACHO');
    expect(conShell.paquete.dominiosExternos).toEqual(['https://my.coursebox.ai']);
  });
});

describe('analizarManifiesto · un paquete autocontenido', () => {
  it('lo clasifica como AUTOCONTENIDO y sin dominios externos', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html': '<script src="scorm-api.js"></script><h1>Inducción</h1>',
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.clase).toBe('AUTOCONTENIDO');
    expect(r.paquete.dominiosExternos).toEqual([]);
  });
});

describe('analizarManifiesto · lo que se rechaza con motivo', () => {
  // D-3 · fase 1 es un solo SCO. Ejecutar el primero y dar por hecho el curso completo
  // sería peor que rechazarlo: la asignación se cerraría con medio curso visto.
  it('rechaza el multi-SCO diciendo cuántos encontró', () => {
    const r = analizarManifiesto(DOS_SCO, ['imsmanifest.xml', 'shared/launch.html']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/2 SCO/);
  });

  it('rechaza SCORM 1.2 nombrando la versión', () => {
    const r = analizarManifiesto(SCORM_12, ['imsmanifest.xml', 'shared/launch.html']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/1\.2/);
  });

  it('rechaza el manifiesto cuyo SCO no está en el paquete', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/shared\/launch\.html/);
  });

  it('rechaza un XML que no es un manifiesto', () => {
    const r = analizarManifiesto('<html><body>no soy un manifiesto</body></html>', []);
    expect(r.ok).toBe(false);
  });

  // P7 · XXE. El archivo lo sube un humano y el parser no debe resolver entidades externas.
  it('no resuelve entidades externas', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE manifest [<!ENTITY secreto SYSTEM "file:///etc/passwd">]>
<manifest identifier="M" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata><schemaversion>2004 3rd Edition</schemaversion></metadata>
  <organizations default="O"><organization identifier="O"><title>&secreto;</title>
    <item identifier="i" identifierref="r"><title>t</title></item></organization></organizations>
  <resources><resource identifier="r" type="webcontent" href="a.html"><file href="a.html"/></resource></resources>
</manifest>`;
    const r = analizarManifiesto(xxe, ['imsmanifest.xml', 'a.html']);
    // Pase o falle el análisis, lo que NUNCA puede aparecer es el contenido del archivo.
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/root:/);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-manifiesto`
Expected: FAIL — `Cannot find module '../scorm-manifiesto'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-manifiesto.ts`:

```ts
// lib/sig/scorm-manifiesto.ts
//
// Del `imsmanifest.xml` a lo que la aplicación necesita saber: edición, SCO de entrada, y
// —lo que más importa— si el curso está EN el paquete o lo entrega un tercero (D-1).
//
// Puro: recibe el XML y la lista de archivos, y devuelve un veredicto. La descompresión
// vive en `scorm-paquete.ts`.

import { XMLParser } from 'fast-xml-parser';

export type ClasePaquete = 'AUTOCONTENIDO' | 'DESPACHO';

export interface PaqueteAnalizado {
  edicion: string;
  organizacionId: string;
  tituloOrganizacion: string;
  entradaHref: string;
  clase: ClasePaquete;
  /// Los orígenes que el paquete necesita. Poblado ACÁ, al analizar, y no adivinado en
  /// tiempo de ejecución: la CSP de un curso es una decisión que se toma al subirlo (D-5).
  dominiosExternos: string[];
}

export type Resultado =
  | { ok: true; paquete: PaqueteAnalizado }
  | { ok: false; motivo: string };

const EDICIONES_SOPORTADAS = ['2004 2nd Edition', '2004 3rd Edition', '2004 4th Edition'];

/// P7 · sin entidades. Un manifiesto con `<!ENTITY x SYSTEM "file:///etc/passwd">` es el
/// ataque XXE, y acá el archivo lo sube una persona.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  processEntities: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

function comoArreglo<T>(valor: T | T[] | undefined): T[] {
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

const ORIGEN_EXTERNO = /https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?/g;

/// Los orígenes que aparecen en el HTML del SCO. Es una heurística deliberada y acotada: si
/// el SCO de entrada apunta a un dominio, el curso NO es autocontenido y hay que decirlo.
/// No pretende encontrar todo lo que un curso pueda cargar en tiempo de ejecución — para eso
/// está la CSP, que bloquea lo que no se declaró y lo hace visible (P18).
export function dominiosDe(html: string): string[] {
  const encontrados = html.match(ORIGEN_EXTERNO) ?? [];
  return [...new Set(encontrados)].sort();
}

export function analizarManifiesto(
  xml: string,
  archivos: string[],
  contenidos: Record<string, string> = {},
): Resultado {
  let raiz: Record<string, unknown>;
  try {
    raiz = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, motivo: `el imsmanifest.xml no es XML válido: ${String(e)}` };
  }

  const manifest = raiz['manifest'] as Record<string, unknown> | undefined;
  if (manifest === undefined) {
    return { ok: false, motivo: 'el archivo no tiene un elemento <manifest>: no es un paquete SCORM' };
  }

  const metadata = manifest['metadata'] as Record<string, unknown> | undefined;
  const edicion = String(metadata?.['schemaversion'] ?? '').trim();
  if (edicion === '') {
    return { ok: false, motivo: 'el manifiesto no declara <schemaversion>' };
  }
  if (!edicionSoportada(edicion)) {
    return {
      ok: false,
      motivo:
        `este player soporta SCORM 2004 y el paquete declara «${edicion}». ` +
        'SCORM 1.2 usa otro modelo de datos (cmi.core.*) y otra API: agregarlo «de paso» ' +
        'es la vía rápida a un player que cumple mal los dos.',
    };
  }

  const organizaciones = manifest['organizations'] as Record<string, unknown> | undefined;
  const lista = comoArreglo(organizaciones?.['organization'] as Record<string, unknown>[]);
  const predeterminada = String(organizaciones?.['@default'] ?? '');
  const organizacion =
    lista.find((o) => String(o['@identifier']) === predeterminada) ?? lista[0];
  if (organizacion === undefined) {
    return { ok: false, motivo: 'el manifiesto no tiene ninguna <organization>' };
  }

  const items = comoArreglo(organizacion['item'] as Record<string, unknown>[]);
  const conRecurso = items.filter((i) => i['@identifierref'] !== undefined);
  if (conRecurso.length === 0) {
    return { ok: false, motivo: 'la organización no tiene ningún <item> con recurso asociado' };
  }
  // D-3 · fase 1 es un solo SCO.
  if (conRecurso.length > 1) {
    return {
      ok: false,
      motivo:
        `el paquete trae ${conRecurso.length} SCO y esta versión ejecuta uno solo. ` +
        'Se rechaza en vez de ejecutar el primero: cerrar la asignación con medio curso ' +
        'visto es peor que no aceptar el paquete.',
    };
  }

  const recursos = manifest['resources'] as Record<string, unknown> | undefined;
  const referencia = String(conRecurso[0]['@identifierref']);
  const recurso = comoArreglo(recursos?.['resource'] as Record<string, unknown>[]).find(
    (r) => String(r['@identifier']) === referencia,
  );
  if (recurso === undefined) {
    return { ok: false, motivo: `el item apunta al recurso «${referencia}», que no existe` };
  }

  const href = String(recurso['@href'] ?? '').trim();
  if (href === '') {
    return { ok: false, motivo: `el recurso «${referencia}» no declara href de entrada` };
  }
  if (!archivos.includes(href)) {
    return {
      ok: false,
      motivo: `el manifiesto declara «${href}» como entrada y ese archivo no está en el paquete`,
    };
  }

  const dominios = dominiosDe(contenidos[href] ?? '');
  const titulo = String(
    (organizacion['title'] as string | undefined) ?? conRecurso[0]['title'] ?? 'Curso sin título',
  );

  return {
    ok: true,
    paquete: {
      edicion,
      organizacionId: String(organizacion['@identifier'] ?? 'sin-id'),
      tituloOrganizacion: titulo,
      entradaHref: href,
      // D-1 · si el SCO de entrada apunta afuera, el contenido NO está en el paquete y su
      // huella no congela nada. La etiqueta es lo que permite decir qué se puede afirmar
      // ante un auditor.
      clase: dominios.length > 0 ? 'DESPACHO' : 'AUTOCONTENIDO',
      dominiosExternos: dominios,
    },
  };
}

function edicionSoportada(edicion: string): boolean {
  return EDICIONES_SOPORTADAS.includes(edicion);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-manifiesto`
Expected: PASS — 10 pruebas

- [ ] **Step 5: Commit**

```bash
git add lib/sig/scorm-manifiesto.ts lib/sig/__tests__/scorm-manifiesto.test.ts
git commit -m "feat(sig): analisis del manifiesto, con despacho y autocontenido distinguidos"
```

---

## Task 6: El modelo de datos

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Agregar los enums y los tres modelos**

```prisma
enum ClasePaquete {
  /// Los archivos están en el paquete y se sirven desde el origen aislado. `zipSha256`
  /// congela lo que la persona vio.
  AUTOCONTENIDO
  /// El contenido lo entrega un tercero. La huella cubre la cáscara, NO el curso: el
  /// proveedor puede cambiarlo mañana y el hash queda idéntico (D-1).
  DESPACHO

  @@map("clase_paquete")
}

enum EstadoIntento {
  EN_CURSO
  SUSPENDIDO
  COMPLETADO
  ABANDONADO

  @@map("estado_intento")
}

model PaqueteScorm {
  id                 Int          @id @default(autoincrement())
  contenidoId        Int          @map("contenido_id")
  version            Int
  clase              ClasePaquete
  edicion            String
  organizacionId     String       @map("organizacion_id")
  tituloOrganizacion String       @map("titulo_organizacion")
  /// El href del recurso del SCO, relativo a la raíz del paquete.
  entradaHref        String       @map("entrada_href")
  /// Los orígenes que el paquete declaró al analizarse. La CSP se arma con esto (D-5).
  dominiosExternos   String[]     @map("dominios_externos")
  zipSha256          String       @map("zip_sha256")
  zipTamano          Int          @map("zip_tamano")
  archivos           Int
  subidoPorId        Int?         @map("subido_por_id")
  subidoEn           DateTime     @default(now()) @map("subido_en")

  contenido ContenidoSig       @relation(fields: [contenidoId], references: [id])
  subidoPor Persona?           @relation("PaqueteSubidoPor", fields: [subidoPorId], references: [id])
  archivosDelPaquete ArchivoScorm[]
  intentos  IntentoScorm[]
  versiones VersionContenido[] @relation("VersionPaquete")

  @@unique([contenidoId, version])
  @@map("paquete_scorm")
}

model ArchivoScorm {
  id        Int    @id @default(autoincrement())
  paqueteId Int    @map("paquete_id")
  /// Ruta relativa YA normalizada (`scorm-zip.ts`). Es la llave con la que responde el
  /// servidor de archivos.
  ruta      String
  mime      String
  tamano    Int
  sha256    String
  bytes     Bytes

  paquete PaqueteScorm @relation(fields: [paqueteId], references: [id], onDelete: Cascade)

  @@unique([paqueteId, ruta])
  @@map("archivo_scorm")
}

model IntentoScorm {
  id                  Int           @id @default(autoincrement())
  asignacionId        Int           @map("asignacion_id")
  personaId           Int           @map("persona_id")
  /// El paquete EFECTIVAMENTE ejecutado, no el vigente. Sin esto, el historial deja de ser
  /// verificable en el momento en que alguien actualiza un curso.
  paqueteId           Int           @map("paquete_id")
  numero              Int
  estado              EstadoIntento @default(EN_CURSO)
  completionStatus    String        @default("unknown") @map("completion_status")
  successStatus       String        @default("unknown") @map("success_status")
  scoreScaled         Decimal?      @map("score_scaled") @db.Decimal(5, 4)
  progressMeasure     Decimal?      @map("progress_measure") @db.Decimal(5, 4)
  location            String?
  /// 64 000 caracteres: `Text` y no `VarChar`. Truncarlo es perder el avance de alguien.
  suspendData         String?       @map("suspend_data") @db.Text
  entry               String        @default("ab-initio")
  exit                String?
  mode                String        @default("normal")
  sessionTimeSegundos Int           @default(0) @map("session_time_segundos")
  totalTimeSegundos   Int           @default(0) @map("total_time_segundos")
  /// El modelo COMPLETO tal como quedó, con objetivos e interacciones. Las columnas de
  /// arriba responden los tableros; esto responde al auditor que pregunta «¿cómo sabe que
  /// aprobó?» — y es el dato que no se puede reconstruir después.
  cmi                 Json
  iniciadoEn          DateTime      @default(now()) @map("iniciado_en")
  ultimaActividadEn   DateTime      @default(now()) @map("ultima_actividad_en")
  terminadoEn         DateTime?     @map("terminado_en")
  registroId          Int?          @unique @map("registro_id")
  ip                  String?
  agente              String?

  asignacion Asignacion         @relation(fields: [asignacionId], references: [id])
  persona    Persona            @relation("IntentoPersona", fields: [personaId], references: [id])
  paquete    PaqueteScorm       @relation(fields: [paqueteId], references: [id])
  registro   RegistroRealizado? @relation("RegistroIntento", fields: [registroId], references: [id])

  @@unique([asignacionId, numero])
  @@index([estado, ultimaActividadEn])
  @@map("intento_scorm")
}
```

- [ ] **Step 2: Agregar las relaciones inversas**

En `model ContenidoSig`:

```prisma
  paquetes PaqueteScorm[]
```

En `model VersionContenido` (P2 · la versión del contenido congela el paquete):

```prisma
  /// P2 · qué paquete se ejecutaba cuando esta versión se publicó.
  paqueteScormId Int?          @map("paquete_scorm_id")
  paqueteScorm   PaqueteScorm? @relation("VersionPaquete", fields: [paqueteScormId], references: [id])
```

En `model Persona`:

```prisma
  paquetesSubidos PaqueteScorm[] @relation("PaqueteSubidoPor")
  intentosScorm   IntentoScorm[] @relation("IntentoPersona")
```

En `model Asignacion`:

```prisma
  intentosScorm IntentoScorm[]
```

En `model RegistroRealizado`:

```prisma
  intentoScorm IntentoScorm? @relation("RegistroIntento")
```

- [ ] **Step 3: Aplicar la migración**

```bash
npm run db:up
npx prisma migrate dev --name scorm_paquetes_e_intentos
```

Expected: `Your database is now in sync with your schema`.

- [ ] **Step 4: Verificar el tipo de `suspend_data`**

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select column_name, data_type from information_schema.columns where table_name='intento_scorm' and column_name in ('suspend_data','cmi');"
```

Expected: `suspend_data | text` y `cmi | jsonb`. Si `suspend_data` saliera `character varying`, un curso perdería el avance al pasar de 255 caracteres.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sig): paquetes SCORM, sus archivos y los intentos de cada persona"
```

---

## Task 7: Subir y analizar un paquete

**Files:**
- Create: `lib/sig/scorm-paquete.ts`
- Create: `app/sig/acciones/scorm.ts`

- [ ] **Step 1: Escribir el extractor**

Crear `lib/sig/scorm-paquete.ts`:

```ts
import 'server-only';

// lib/sig/scorm-paquete.ts
//
// Descomprime un .zip de SCORM VALIDANDO ANTES de extraer, y lo guarda.
//
// El orden importa y es la razón de usar `yauzl`: primero se lee el directorio central
// —nombre y tamaño descomprimido de cada entrada— y sólo si todo el paquete pasa los
// límites se extrae. Una librería que descomprime de una pasada obligaría a confiar
// primero y validar después, que con una bomba zip llega tarde.

import { createHash } from 'node:crypto';
import yauzl from 'yauzl';
import { prisma } from '@/lib/db';
import { LIMITE_ARCHIVOS, excedeElTotal, limiteDescomprimido, rutaSegura } from '@/lib/sig/scorm-zip';
import { analizarManifiesto, type Resultado } from '@/lib/sig/scorm-manifiesto';

export interface EntradaExtraida {
  ruta: string;
  bytes: Buffer;
}

const MIMES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  xsd: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  pdf: 'application/pdf',
  vtt: 'text/vtt',
};

/// El MIME se decide por extensión y con lista blanca. Lo que no está en la lista se sirve
/// como `application/octet-stream`: nunca se adivina `text/html` para una extensión
/// desconocida, porque eso convierte un archivo cualquiera en una página ejecutable dentro
/// del origen de contenido.
export function mimeDe(ruta: string): string {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? '';
  return MIMES[ext] ?? 'application/octet-stream';
}

export function extraer(zip: Buffer, maxZipMb: number): Promise<EntradaExtraida[]> {
  const techo = limiteDescomprimido(maxZipMb);

  return new Promise((resolver, rechazar) => {
    yauzl.fromBuffer(zip, { lazyEntries: true }, (err, archivo) => {
      if (err || !archivo) return rechazar(err ?? new Error('el .zip no se pudo abrir'));

      const salida: EntradaExtraida[] = [];
      let acumulado = 0;
      let contadas = 0;

      archivo.readEntry();

      archivo.on('entry', (entrada: yauzl.Entry) => {
        // Los directorios no se guardan: la ruta completa de cada archivo ya los implica.
        if (entrada.fileName.endsWith('/')) return archivo.readEntry();

        const ruta = rutaSegura(entrada.fileName);
        if (ruta === null) {
          archivo.close();
          return rechazar(
            new Error(
              `el paquete trae una entrada con ruta insegura («${entrada.fileName}»). ` +
                'Se rechaza completo: un solo archivo que escapa del directorio es un ataque, ' +
                'no un descuido.',
            ),
          );
        }

        contadas += 1;
        if (contadas > LIMITE_ARCHIVOS) {
          archivo.close();
          return rechazar(
            new Error(`el paquete trae más de ${LIMITE_ARCHIVOS} archivos: eso no es un curso`),
          );
        }

        acumulado += entrada.uncompressedSize;
        if (excedeElTotal(acumulado, techo)) {
          archivo.close();
          return rechazar(
            new Error(
              `descomprimido el paquete supera ${Math.round(techo / 1024 / 1024)} MB. ` +
                'Se detiene ANTES de extraer: es el caso de la bomba zip.',
            ),
          );
        }

        archivo.openReadStream(entrada, (err2, flujo) => {
          if (err2 || !flujo) {
            archivo.close();
            return rechazar(err2 ?? new Error(`no se pudo leer «${ruta}»`));
          }
          const trozos: Buffer[] = [];
          flujo.on('data', (t: Buffer) => trozos.push(t));
          flujo.on('end', () => {
            salida.push({ ruta, bytes: Buffer.concat(trozos) });
            archivo.readEntry();
          });
          flujo.on('error', (e) => {
            archivo.close();
            rechazar(e);
          });
        });
      });

      archivo.on('end', () => resolver(salida));
      archivo.on('error', (e) => rechazar(e));
    });
  });
}

export interface PaqueteGuardado {
  paqueteId: number;
  version: number;
}

/// Analiza y guarda. Devuelve el resultado del análisis sin guardar nada cuando el paquete
/// no pasa: un paquete rechazado no debe dejar filas a medio escribir.
export async function guardarPaquete(
  contenidoId: number,
  zip: Buffer,
  personaId: number | null,
  maxZipMb: number,
): Promise<{ ok: true; guardado: PaqueteGuardado } | { ok: false; motivo: string }> {
  const entradas = await extraer(zip, maxZipMb);

  const manifiesto = entradas.find((e) => e.ruta === 'imsmanifest.xml');
  if (manifiesto === undefined) {
    return {
      ok: false,
      motivo:
        'el paquete no tiene imsmanifest.xml en la raíz. Sin manifiesto no hay paquete SCORM: ' +
        'no se puede saber cuál es el SCO ni qué edición declara.',
    };
  }

  const rutas = entradas.map((e) => e.ruta);
  // Sólo el HTML se le pasa al análisis: es donde se ve si el curso apunta afuera (D-1).
  const contenidos: Record<string, string> = {};
  for (const e of entradas) {
    if (e.ruta.endsWith('.html') || e.ruta.endsWith('.htm')) {
      contenidos[e.ruta] = e.bytes.toString('utf8');
    }
  }

  const analisis: Resultado = analizarManifiesto(
    manifiesto.bytes.toString('utf8'),
    rutas,
    contenidos,
  );
  if (!analisis.ok) return { ok: false, motivo: analisis.motivo };

  const ultimo = await prisma.paqueteScorm.findFirst({
    where: { contenidoId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (ultimo?.version ?? 0) + 1;

  const paquete = await prisma.paqueteScorm.create({
    data: {
      contenidoId,
      version,
      clase: analisis.paquete.clase,
      edicion: analisis.paquete.edicion,
      organizacionId: analisis.paquete.organizacionId,
      tituloOrganizacion: analisis.paquete.tituloOrganizacion,
      entradaHref: analisis.paquete.entradaHref,
      dominiosExternos: analisis.paquete.dominiosExternos,
      zipSha256: createHash('sha256').update(zip).digest('hex'),
      zipTamano: zip.length,
      archivos: entradas.length,
      subidoPorId: personaId,
    },
    select: { id: true },
  });

  // En lotes: `createMany` con 2 000 archivos y sus bytes en una sola sentencia puede
  // pasarse del límite de parámetros del protocolo de Postgres.
  const LOTE = 50;
  for (let i = 0; i < entradas.length; i += LOTE) {
    await prisma.archivoScorm.createMany({
      data: entradas.slice(i, i + LOTE).map((e) => ({
        paqueteId: paquete.id,
        ruta: e.ruta,
        mime: mimeDe(e.ruta),
        tamano: e.bytes.length,
        sha256: createHash('sha256').update(e.bytes).digest('hex'),
        bytes: e.bytes,
      })),
    });
  }

  return { ok: true, guardado: { paqueteId: paquete.id, version } };
}
```

- [ ] **Step 2: La server action con su compuerta de permiso**

Crear `app/sig/acciones/scorm.ts`:

```ts
'use server';

// app/sig/acciones/scorm.ts
//
// Subir un paquete a una capacitación. La compuerta va acá —en la acción— porque en un
// archivo `'use server'` toda exportación es invocable desde el navegador.

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { registrar } from '@/lib/sgsi/bitacora';
import { guardarPaquete } from '@/lib/sig/scorm-paquete';

export interface RespuestaSubida {
  ok: boolean;
  mensaje: string;
}

export async function subirPaqueteScorm(datos: FormData): Promise<RespuestaSubida> {
  const sesion = await getServerSession(authOptions);
  const correo = sesion?.user?.email;
  if (!correo) return { ok: false, mensaje: 'sin sesión' };

  const rol = rolDesdeGrupos(sesion.user?.grupos);
  // Subir un curso es configurar el sistema documental, no cerrar una tarea: el permiso es
  // el de escribir en operación, el mismo que gobierna los contenidos.
  if (!puede(rol, 'operacion:escribir')) {
    return { ok: false, mensaje: 'sin permiso para configurar contenidos' };
  }

  const contenidoId = Number(datos.get('contenidoId'));
  const archivo = datos.get('archivo');
  if (!Number.isInteger(contenidoId) || !(archivo instanceof File)) {
    return { ok: false, mensaje: 'falta el contenido o el archivo' };
  }

  const maxMb = Number(process.env.SCORM_TAMANO_MAX_MB ?? 200);
  // El techo se valida ANTES de descomprimir (P6): un .zip de 3 GB no debe llegar a yauzl.
  if (archivo.size > maxMb * 1024 * 1024) {
    return {
      ok: false,
      mensaje: `el paquete pesa ${Math.round(archivo.size / 1024 / 1024)} MB y el techo es ${maxMb} MB`,
    };
  }

  const contenido = await prisma.contenidoSig.findUnique({
    where: { id: contenidoId },
    select: { id: true, tipo: true, codigo: true },
  });
  if (contenido === null) return { ok: false, mensaje: 'el contenido no existe' };
  if (contenido.tipo !== 'CAPACITACION') {
    return {
      ok: false,
      mensaje:
        'sólo una CAPACITACION puede tener paquete SCORM. P1: un curso no es un tipo nuevo ' +
        'de contenido, es una capacitación con paquete.',
    };
  }

  const persona = await prisma.persona.findUnique({
    where: { correo },
    select: { id: true },
  });

  let resultado;
  try {
    resultado = await guardarPaquete(
      contenidoId,
      Buffer.from(await archivo.arrayBuffer()),
      persona?.id ?? null,
      maxMb,
    );
  } catch (e) {
    // Los rechazos del extractor son mensajes para una persona, no trazas: dicen qué tiene
    // el paquete y por qué no se acepta.
    return { ok: false, mensaje: e instanceof Error ? e.message : 'el paquete no se pudo leer' };
  }

  if (!resultado.ok) return { ok: false, mensaje: resultado.motivo };

  const paquete = await prisma.paqueteScorm.findUnique({
    where: { id: resultado.guardado.paqueteId },
    select: { clase: true, edicion: true, dominiosExternos: true, archivos: true, zipSha256: true },
  });

  await registrar({ bitacora: prisma.bitacora }, correo, [
    {
      tabla: 'paquete_scorm',
      registroId: String(resultado.guardado.paqueteId),
      campo: 'alta',
      anterior: null,
      nuevo: `${contenido.codigo} v${resultado.guardado.version} · ${paquete?.clase} · ${paquete?.edicion}`,
      motivo:
        paquete?.clase === 'DESPACHO'
          ? `paquete de despacho · el contenido lo entrega ${paquete.dominiosExternos.join(', ')} ` +
            'y el correo y el nombre de cada persona se le transmiten (D-4)'
          : 'paquete autocontenido · el contenido no sale de la aplicación',
    },
  ]);

  revalidatePath('/sig/contenidos');

  return {
    ok: true,
    mensaje:
      `Paquete v${resultado.guardado.version} guardado · ${paquete?.edicion} · ${paquete?.archivos} archivos · ` +
      (paquete?.clase === 'DESPACHO'
        ? `DESPACHO: el contenido lo entrega ${paquete.dominiosExternos.join(', ')}. ` +
          'El correo y el nombre de cada persona se transmiten a ese tercero, y la huella del ' +
          'paquete NO congela el curso.'
        : 'AUTOCONTENIDO: el contenido no sale de la aplicación.'),
  };
}
```

- [ ] **Step 3: Probar con el paquete real (verificación 3)**

Crear un script temporal y correrlo con `tsx`:

```bash
cat > /tmp/probar-paquete.ts <<'EOF'
import { readFileSync } from 'node:fs';
import { extraer } from './lib/sig/scorm-paquete';
import { analizarManifiesto } from './lib/sig/scorm-manifiesto';

const zip = readFileSync('C:/Users/danie/Downloads/scorm_package_2004.zip');
const entradas = await extraer(zip, 200);
const manifiesto = entradas.find((e) => e.ruta === 'imsmanifest.xml')!;
const html: Record<string, string> = {};
for (const e of entradas) if (e.ruta.endsWith('.html')) html[e.ruta] = e.bytes.toString('utf8');
console.log('archivos:', entradas.length);
console.log(JSON.stringify(analizarManifiesto(manifiesto.bytes.toString('utf8'), entradas.map((e) => e.ruta), html), null, 2));
EOF
npx tsx /tmp/probar-paquete.ts
```

Expected:
```
archivos: 17
{ "ok": true, "paquete": { "edicion": "2004 3rd Edition", ..., "entradaHref": "index.html",
  "clase": "DESPACHO", "dominiosExternos": ["https://my.coursebox.ai"] } }
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
rm /tmp/probar-paquete.ts
git add lib/sig/scorm-paquete.ts app/sig/acciones/scorm.ts
git commit -m "feat(sig): subida de paquetes SCORM con descompresion validada"
```

---

## Task 8: El origen de contenido

**Files:**
- Create: `app/scorm/archivo/[paqueteId]/[...ruta]/route.ts`
- Create: `lib/sig/scorm-origen.ts`

- [ ] **Step 1: El guardián de origen, puro y compartido**

Crear `lib/sig/scorm-origen.ts`:

```ts
// lib/sig/scorm-origen.ts
//
// P3 · el contenido del curso se sirve desde un origen DISTINTO al de la aplicación, y las
// rutas de ese origen no deben responder en el origen de la aplicación.
//
// Puro para que la regla se escriba una vez y la usen la ruta de archivos, el runner y sus
// pruebas. El `sandbox` del iframe no sustituye esto: sin `allow-same-origin` el SCO no
// puede alcanzar `API_1484_11` por la cadena de padres —que es como funciona SCORM— y con
// `allow-same-origin` el sandbox queda anulado por definición del estándar.

export function hostDe(origen: string | undefined): string | null {
  if (origen === undefined || origen.trim() === '') return null;
  try {
    return new URL(origen).host.toLowerCase();
  } catch {
    return null;
  }
}

/// `true` cuando la petición llegó al host del origen de contenido. Si la variable no está
/// configurada, devuelve `false`: sin origen aislado el player no corre, y correrlo en el
/// origen de la aplicación sería darle a un tercero el JavaScript de la sesión.
export function esOrigenDeContenido(hostDeLaPeticion: string | null, origenContenido: string | undefined): boolean {
  const esperado = hostDe(origenContenido);
  if (esperado === null || hostDeLaPeticion === null) return false;
  return hostDeLaPeticion.toLowerCase() === esperado;
}

/// La CSP del contenido de un paquete. `default-src 'none'` y sólo lo que el paquete
/// declaró: en un AUTOCONTENIDO no se permite ningún dominio externo, y en un DESPACHO
/// exactamente los suyos (D-5).
export function cspDelPaquete(dominios: readonly string[]): string {
  const externos = dominios.join(' ');
  const con = (base: string) => (externos === '' ? base : `${base} ${externos}`);
  return [
    "default-src 'none'",
    con("script-src 'self' 'unsafe-inline' 'unsafe-eval'"),
    con("style-src 'self' 'unsafe-inline'"),
    con("img-src 'self' data: blob:"),
    con("media-src 'self' data: blob:"),
    con("font-src 'self' data:"),
    con("connect-src 'self'"),
    con("frame-src 'self'"),
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
```

> `'unsafe-inline'` y `'unsafe-eval'` en `script-src` no son un descuido: los cursos SCORM son HTML generado por herramientas de autoría y prácticamente todos usan scripts en línea. La contención real de este contenido es **el origen aparte**, no la CSP; la CSP acota a dónde puede *hablar* el curso, que es lo que aporta valor acá.

- [ ] **Step 2: Escribir la prueba del guardián y de la CSP**

Crear `lib/sig/__tests__/scorm-origen.test.ts`:

```ts
import { cspDelPaquete, esOrigenDeContenido, hostDe } from '../scorm-origen';

describe('esOrigenDeContenido', () => {
  it('acepta el host configurado', () => {
    expect(esOrigenDeContenido('cursos.sig.cuantico.com', 'https://cursos.sig.cuantico.com')).toBe(true);
  });

  it('rechaza el host de la aplicación', () => {
    expect(esOrigenDeContenido('sig.cuantico.com', 'https://cursos.sig.cuantico.com')).toBe(false);
  });

  // Sin origen aislado el player NO corre. Correrlo en el origen de la aplicación le daría
  // al JavaScript del curso la sesión de quien lo está viendo.
  it('sin variable configurada no habilita nada', () => {
    expect(esOrigenDeContenido('cursos.sig.cuantico.com', undefined)).toBe(false);
    expect(esOrigenDeContenido('cursos.sig.cuantico.com', '')).toBe(false);
  });

  it('hostDe tolera basura', () => {
    expect(hostDe('no-es-una-url')).toBeNull();
  });
});

describe('cspDelPaquete', () => {
  it('un autocontenido no permite ningún dominio externo', () => {
    const csp = cspDelPaquete([]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('un despacho permite exactamente los suyos', () => {
    const csp = cspDelPaquete(['https://my.coursebox.ai']);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://my.coursebox.ai");
    expect(csp).toContain('frame-src \'self\' https://my.coursebox.ai');
  });
});
```

Run: `npm test -- scorm-origen`
Expected: primero FAIL por módulo inexistente; con el Step 1 aplicado, PASS — 6 pruebas.

- [ ] **Step 3: La ruta que sirve los archivos**

Crear `app/scorm/archivo/[paqueteId]/[...ruta]/route.ts`:

```ts
// app/scorm/archivo/[paqueteId]/[...ruta]/route.ts
//
// Sirve los bytes de un paquete SCORM. Vive en el ORIGEN DE CONTENIDO y sólo responde ahí.
//
// No exige sesión a propósito (P3): el contenido de un curso es público dentro de la
// organización y el control de acceso está en la página del player, que sí la exige. Lo que
// no puede pasar es que esta ruta responda en el origen de la aplicación — ahí el
// JavaScript del curso tendría el origen de la sesión.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { cspDelPaquete, esOrigenDeContenido } from '@/lib/sig/scorm-origen';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paqueteId: string; ruta: string[] }> },
) {
  const cabeceras = await headers();
  if (!esOrigenDeContenido(cabeceras.get('host'), process.env.SCORM_ORIGEN_CONTENIDO)) {
    return new NextResponse('no disponible en este origen', { status: 404 });
  }

  const { paqueteId, ruta } = await params;
  const id = Number(paqueteId);
  if (!Number.isInteger(id)) return new NextResponse('paquete inválido', { status: 400 });

  const archivo = await prisma.archivoScorm.findUnique({
    where: { paqueteId_ruta: { paqueteId: id, ruta: ruta.join('/') } },
    select: {
      bytes: true,
      mime: true,
      sha256: true,
      paquete: { select: { dominiosExternos: true } },
    },
  });
  if (archivo === null) return new NextResponse('archivo no encontrado', { status: 404 });

  const buffer = Buffer.from(archivo.bytes);
  return new NextResponse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    {
      headers: {
        'Content-Type': archivo.mime,
        'Content-Length': String(buffer.length),
        // El contenido de un paquete es inmutable: una versión nueva es un paquete nuevo con
        // otro id, así que la URL cambia. Sin esto se leería de Postgres en cada vista.
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${archivo.sha256}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': cspDelPaquete(archivo.paquete.dominiosExternos),
      },
    },
  );
}
```

- [ ] **Step 4: La regla del proxy inverso**

En el servidor (Coolify/nginx), el host `cursos.sig.cuantico.com` debe enrutar **sólo** `/scorm/*` hacia la aplicación y devolver 404 en todo lo demás. Documentarlo en `deploy/` junto a los demás scripts:

```
# deploy/origen-cursos.nginx.example
# El origen de contenido del player SCORM sirve DOS rutas y nada más.
# Sin esta regla, /mi-sig y /sig quedan alcanzables en el host de contenido: no filtran
# datos —las cookies de sesión son host-only y ahí no hay sesión— pero exponen superficie
# de la aplicación al JavaScript de un curso, y eso no tiene ninguna razón de existir.
server {
  server_name cursos.sig.cuantico.com;
  location ~ ^/scorm/ { proxy_pass http://sgi-app:3004; }
  location / { return 404; }
}
```

- [ ] **Step 5: Verificar el guardián a mano**

Con `npm run dev` y `SCORM_ORIGEN_CONTENIDO=http://localhost:3004` en el `.env` local (en desarrollo el aislamiento no existe; se prueba el camino, no la contención):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: sig.cuantico.com" \
  http://localhost:3004/scorm/archivo/1/index.html
```

Expected: `404` — el host no es el del origen de contenido.

- [ ] **Step 6: Commit**

```bash
git add lib/sig/scorm-origen.ts lib/sig/__tests__/scorm-origen.test.ts app/scorm deploy/origen-cursos.nginx.example
git commit -m "feat(sig): el origen aislado que sirve el contenido de los cursos"
```

---

## Task 9: El runner y la API

**Files:**
- Create: `app/scorm/runner/page.tsx`
- Create: `app/scorm/runner/Runner.client.tsx`

- [ ] **Step 1: La página que valida el origen**

Crear `app/scorm/runner/page.tsx`:

```tsx
// app/scorm/runner/page.tsx
//
// El runner vive en el origen de contenido y no tiene sesión ni acceso a la base: recibe el
// estado del intento por `postMessage` desde la página del player y le devuelve los cambios.
// El SCO cuelga de un iframe anidado del MISMO origen, que es lo que le permite encontrar
// `API_1484_11` subiendo por `window.parent`.

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { esOrigenDeContenido } from '@/lib/sig/scorm-origen';
import Runner from './Runner.client';

export default async function Page() {
  const cabeceras = await headers();
  if (!esOrigenDeContenido(cabeceras.get('host'), process.env.SCORM_ORIGEN_CONTENIDO)) {
    notFound();
  }
  const origenApp = process.env.SCORM_ORIGEN_APP ?? '';
  if (origenApp === '') notFound();

  return <Runner origenApp={origenApp} />;
}
```

- [ ] **Step 2: El shim de la API**

Crear `app/scorm/runner/Runner.client.tsx`:

```tsx
'use client';

// app/scorm/runner/Runner.client.tsx
//
// **Por qué el modelo de datos vive EN MEMORIA acá.** La API de SCORM es SINCRÓNICA:
// `GetValue` devuelve el valor en el mismo turno, y `postMessage` no puede hacer eso. Si el
// shim tuviera que preguntarle al servidor por cada lectura, no habría forma de responderle
// al curso. Por eso el runner recibe el modelo COMPLETO antes de crear el iframe del SCO,
// responde de memoria, y persiste en cada `Commit` y en `Terminate`.
//
// La validación usa el MISMO módulo puro que el servidor (`scorm-modelo.ts`). No es
// duplicación: es el mismo código corriendo en los dos lados, y por eso lo que el curso
// creyó guardar y lo que se guardó no pueden discrepar.

import { useEffect, useRef, useState } from 'react';
import {
  CONFIRMAR_ANTES_DE_INICIALIZAR,
  EXCEPCION_GENERAL,
  FALLO_GENERAL_AL_CONFIRMAR,
  OK,
  VALOR_NO_INICIALIZADO,
  frase,
  indiceDe,
  normalizar,
  validarCommit,
  validarEscritura,
  validarInitialize,
  validarLectura,
  validarTerminate,
} from '@/lib/sig/scorm-modelo';

interface Props {
  origenApp: string;
}

type MensajeDelPlayer =
  | { tipo: 'ESTADO'; modelo: Record<string, string>; entradaUrl: string; soloLectura: boolean }
  | { tipo: 'GUARDADO'; ok: boolean };

export default function Runner({ origenApp }: Props) {
  const [entradaUrl, setEntradaUrl] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const modelo = useRef<Record<string, string>>({});
  const sesion = useRef({ iniciado: false, terminado: false });
  const ultimoError = useRef(OK);
  const diagnostico = useRef('');
  const soloLectura = useRef(false);

  useEffect(() => {
    function conteos() {
      return {
        objetivos: Number(modelo.current['cmi.objectives._count'] ?? '0'),
        interacciones: Number(modelo.current['cmi.interactions._count'] ?? '0'),
      };
    }

    function alPlayer(mensaje: unknown) {
      window.parent.postMessage(mensaje, origenApp);
    }

    function commit(final: boolean) {
      const codigo = final ? OK : validarCommit(sesion.current);
      if (codigo !== OK) {
        ultimoError.current = codigo;
        return 'false';
      }
      if (soloLectura.current) return 'true'; // P12 · `mode=review` no escribe nada.
      alPlayer({ tipo: 'COMMIT', modelo: modelo.current, final });
      return 'true';
    }

    const API = {
      Initialize(_arg: string): string {
        const codigo = validarInitialize(sesion.current);
        ultimoError.current = codigo;
        if (codigo !== OK) return 'false';
        sesion.current.iniciado = true;
        return 'true';
      },
      Terminate(_arg: string): string {
        const codigo = validarTerminate(sesion.current);
        ultimoError.current = codigo;
        if (codigo !== OK) return 'false';
        commit(true);
        sesion.current.terminado = true;
        return 'true';
      },
      GetValue(elemento: string): string {
        const codigo = validarLectura(elemento, sesion.current);
        if (codigo !== OK) {
          ultimoError.current = codigo;
          diagnostico.current = `no se pudo leer «${elemento}»: ${frase(codigo)}`;
          return '';
        }
        const valor = modelo.current[elemento];
        if (valor === undefined) {
          // 403 y no cadena vacía: «no inicializado» y «vacío» son cosas distintas, y un
          // curso que las confunde muestra un progreso que no existe.
          ultimoError.current = VALOR_NO_INICIALIZADO;
          return '';
        }
        ultimoError.current = OK;
        return valor;
      },
      SetValue(elemento: string, valor: string): string {
        const codigo = validarEscritura(elemento, valor, sesion.current, conteos());
        ultimoError.current = codigo;
        if (codigo !== OK) {
          diagnostico.current = `no se pudo fijar «${elemento}» = «${valor}»: ${frase(codigo)}`;
          return 'false';
        }
        modelo.current[elemento] = valor;

        // Los `_count` los mantiene el LMS, no el curso: si el SCO escribió el índice
        // siguiente, la colección creció.
        const indice = indiceDe(elemento);
        if (indice !== null) {
          const normalizado = normalizar(elemento);
          const clave = normalizado.startsWith('cmi.objectives')
            ? 'cmi.objectives._count'
            : normalizado.startsWith('cmi.interactions')
              ? 'cmi.interactions._count'
              : null;
          if (clave !== null && indice + 1 > Number(modelo.current[clave] ?? '0')) {
            modelo.current[clave] = String(indice + 1);
          }
        }
        return 'true';
      },
      Commit(_arg: string): string {
        if (!sesion.current.iniciado) {
          ultimoError.current = CONFIRMAR_ANTES_DE_INICIALIZAR;
          return 'false';
        }
        const r = commit(false);
        if (r === 'true') ultimoError.current = OK;
        else if (ultimoError.current === OK) ultimoError.current = FALLO_GENERAL_AL_CONFIRMAR;
        return r;
      },
      GetLastError(): string {
        return String(ultimoError.current);
      },
      GetErrorString(codigo: string): string {
        return frase(Number(codigo));
      },
      GetDiagnostic(codigo: string): string {
        // El diagnóstico es NUESTRO y va en español: es lo que alguien lee cuando el curso
        // no avanza. `GetErrorString` es del estándar y va en inglés.
        return diagnostico.current === '' ? frase(Number(codigo)) : diagnostico.current;
      },
    };

    (window as unknown as { API_1484_11: typeof API }).API_1484_11 = API;

    function alRecibir(evento: MessageEvent) {
      // P3 · el origen se valida SIEMPRE. Un `origin: '*'` acá es entregarle la API a
      // cualquier página que logre abrir el runner en un iframe.
      if (evento.origin !== origenApp) return;
      const mensaje = evento.data as MensajeDelPlayer;
      if (mensaje.tipo === 'ESTADO') {
        modelo.current = { ...mensaje.modelo };
        soloLectura.current = mensaje.soloLectura;
        setEntradaUrl(mensaje.entradaUrl);
      }
      if (mensaje.tipo === 'GUARDADO' && !mensaje.ok) {
        // El servidor rechazó la escritura: el intento está cerrado o el token venció. El
        // curso tiene que enterarse, o seguiría acumulando avance que no se guarda.
        ultimoError.current = EXCEPCION_GENERAL;
        diagnostico.current = 'el servidor rechazó el guardado: el intento ya no está abierto';
        setAviso('Tu avance dejó de guardarse porque este intento ya se cerró. Volvé a abrir el curso.');
      }
    }

    window.addEventListener('message', alRecibir);
    alPlayer({ tipo: 'LISTO' });

    // P13 · muchos cursos no llaman `Terminate` si se cierra la pestaña. Un commit acá
    // salva el avance de los últimos minutos.
    function alOcultar() {
      if (sesion.current.iniciado && !sesion.current.terminado) commit(false);
    }
    window.addEventListener('pagehide', alOcultar);
    document.addEventListener('visibilitychange', alOcultar);

    return () => {
      window.removeEventListener('message', alRecibir);
      window.removeEventListener('pagehide', alOcultar);
      document.removeEventListener('visibilitychange', alOcultar);
    };
  }, [origenApp]);

  return (
    <div style={{ margin: 0, height: '100vh', overflow: 'hidden' }}>
      {aviso !== null && (
        <p style={{ background: '#fee', color: '#900', padding: '8px', margin: 0 }}>{aviso}</p>
      )}
      {entradaUrl === null ? (
        <p style={{ padding: '16px', fontFamily: 'system-ui' }}>Cargando el curso…</p>
      ) : (
        <iframe
          title="curso"
          src={entradaUrl}
          style={{ width: '100%', height: '100%', border: 0 }}
          allow="fullscreen; autoplay"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/scorm/runner
git commit -m "feat(sig): el runner con la API_1484_11 en memoria"
```

---

## Task 10: El token del intento y las server actions

**Files:**
- Create: `lib/sig/scorm-token.ts`
- Test: `lib/sig/__tests__/scorm-token.test.ts`
- Create: `app/mi-sig/acciones/curso.ts`

- [ ] **Step 1: Escribir la prueba del token**

Crear `lib/sig/__tests__/scorm-token.test.ts`:

```ts
// lib/sig/__tests__/scorm-token.test.ts
//
// P4 · cada ejecución lleva un token firmado. Sin esto, cambiar un número en la URL
// alcanzaría para escribir en el intento de otra persona.

import { firmarIntento, verificarIntento } from '../scorm-token';

const SECRETO = 'secreto-de-prueba';

describe('token de intento', () => {
  it('ida y vuelta devuelve el intento', () => {
    const token = firmarIntento(42, SECRETO, 900);
    expect(verificarIntento(token, SECRETO)).toEqual(expect.objectContaining({ intentoId: 42 }));
  });

  it('un token manipulado no vale', () => {
    const token = firmarIntento(42, SECRETO, 900);
    const otro = token.slice(0, -3) + 'aaa';
    expect(verificarIntento(otro, SECRETO)).toBeNull();
  });

  it('un token firmado con otro secreto no vale', () => {
    expect(verificarIntento(firmarIntento(42, 'otro', 900), SECRETO)).toBeNull();
  });

  it('un token vencido no vale', () => {
    expect(verificarIntento(firmarIntento(42, SECRETO, -1), SECRETO)).toBeNull();
  });

  it('basura no revienta', () => {
    expect(verificarIntento('', SECRETO)).toBeNull();
    expect(verificarIntento('a.b.c', SECRETO)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- scorm-token`
Expected: FAIL — `Cannot find module '../scorm-token'`

- [ ] **Step 3: Implementar**

Crear `lib/sig/scorm-token.ts`:

```ts
// lib/sig/scorm-token.ts
//
// El token que autoriza una ejecución. Mismo mecanismo que `firmarAnexo` en
// `lib/sgsi/anexo-archivo.ts`: HMAC con vigencia corta, sin estado en la base.
//
// El secreto entra por parámetro y no se lee del entorno acá para que el módulo sea puro y
// probable — quien llama pasa `SGI_RUTAS_SECRETO`, igual que los anexos.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function firmarIntento(intentoId: number, secreto: string, vigenciaSegundos = 900): string {
  const exp = Math.floor(Date.now() / 1000) + vigenciaSegundos;
  const mensaje = `${intentoId}:${exp}`;
  const firma = createHmac('sha256', secreto).update(mensaje).digest('base64url');
  return `${Buffer.from(mensaje).toString('base64url')}.${firma}`;
}

export function verificarIntento(
  token: string,
  secreto: string,
): { intentoId: number; exp: number } | null {
  const [base, firma] = token.split('.');
  if (!base || !firma) return null;
  try {
    const mensaje = Buffer.from(base, 'base64url').toString('utf8');
    const [idTexto, expTexto] = mensaje.split(':');
    const intentoId = Number(idTexto);
    const exp = Number(expTexto);
    if (!Number.isInteger(intentoId) || !Number.isFinite(exp)) return null;

    const esperada = createHmac('sha256', secreto).update(mensaje).digest();
    const recibida = Buffer.from(firma, 'base64url');
    if (esperada.length !== recibida.length) return null;
    if (!timingSafeEqual(esperada, recibida)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;

    return { intentoId, exp };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- scorm-token`
Expected: PASS — 5 pruebas

- [ ] **Step 5: Las server actions**

Crear `app/mi-sig/acciones/curso.ts`:

```ts
'use server';

// app/mi-sig/acciones/curso.ts
//
// Abrir un intento y guardar su avance. Son las dos únicas puertas por las que el player
// escribe, y las dos verifican la sesión: el token del intento autoriza QUÉ intento, la
// sesión autoriza a QUIÉN (P4/P5).

import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { aDuracion, aSegundos, sumarDuraciones } from '@/lib/sig/scorm-tiempo';
import { modeloInicial, validarEscritura } from '@/lib/sig/scorm-modelo';
import { firmarIntento, verificarIntento } from '@/lib/sig/scorm-token';

function secreto(): string {
  return process.env.SGI_RUTAS_SECRETO ?? process.env.NEXTAUTH_SECRET ?? 'sgi-dev-secret';
}

export interface Apertura {
  ok: boolean;
  mensaje?: string;
  token?: string;
  modelo?: Record<string, string>;
  entradaUrl?: string;
  soloLectura?: boolean;
  runnerUrl?: string;
}

/// Abre —o reanuda— el intento de una asignación. Devuelve el modelo COMPLETO porque el
/// runner necesita responder `GetValue` de memoria (la API de SCORM es sincrónica).
export async function abrirIntento(asignacionId: number): Promise<Apertura> {
  const sesion = await getServerSession(authOptions);
  const correo = sesion?.user?.email;
  if (!correo) return { ok: false, mensaje: 'sin sesión' };

  const asignacion = await prisma.asignacion.findUnique({
    where: { id: asignacionId },
    select: {
      id: true,
      estado: true,
      personaId: true,
      persona: { select: { correo: true, nombre: true } },
      contenido: {
        select: {
          id: true,
          version: true,
          notaMinima: true,
          paquetes: { orderBy: { version: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (asignacion === null) return { ok: false, mensaje: 'la asignación no existe' };
  // El curso lo hace su titular. Un cierre administrativo es otra cosa y va por su camino.
  if (asignacion.persona.correo !== correo) return { ok: false, mensaje: 'no es tu asignación' };

  const paquete = asignacion.contenido?.paquetes[0];
  if (paquete === undefined) return { ok: false, mensaje: 'esta capacitación no tiene paquete SCORM' };

  const cabeceras = await headers();
  const origenContenido = process.env.SCORM_ORIGEN_CONTENIDO;
  if (origenContenido === undefined || origenContenido.trim() === '') {
    return {
      ok: false,
      mensaje:
        'SCORM_ORIGEN_CONTENIDO no está configurado. El curso no se ejecuta sin origen ' +
        'aislado: correrlo en el origen de la aplicación le daría al JavaScript del curso ' +
        'la sesión de quien lo abre.',
    };
  }

  const anterior = await prisma.intentoScorm.findFirst({
    where: { asignacionId },
    orderBy: { numero: 'desc' },
  });

  // P12 · cerrada la asignación, el curso se abre en `mode=review`: no escribe y no crea
  // intento. Que alguien quiera repasar lo que ya aprobó no debe arriesgar su registro.
  const soloLectura = asignacion.estado === 'REALIZADA';

  // P10/P11 · se reanuda lo suspendido; lo cerrado con `normal` abre un intento NUEVO. Los
  // intentos no se sobreescriben: cuántas veces alguien intentó una capacitación y con qué
  // resultado es lo que un auditor pregunta.
  const reanudable =
    anterior !== null && (anterior.estado === 'SUSPENDIDO' || anterior.estado === 'EN_CURSO');

  const intento = soloLectura
    ? anterior
    : reanudable
      ? anterior
      : await prisma.intentoScorm.create({
          data: {
            asignacionId,
            personaId: asignacion.personaId,
            paqueteId: paquete.id,
            numero: (anterior?.numero ?? 0) + 1,
            entry: 'ab-initio',
            mode: 'normal',
            cmi: {},
            ip: cabeceras.get('x-forwarded-for') ?? cabeceras.get('x-real-ip'),
            agente: cabeceras.get('user-agent'),
          },
        });

  if (intento === null) return { ok: false, mensaje: 'no hay ningún intento para revisar' };

  const guardado = (intento.cmi ?? {}) as Record<string, string>;
  const modelo = {
    ...modeloInicial({
      // D-4 · el correo corporativo y el nombre. En un paquete DESPACHO estos dos valores
      // SALEN hacia el tercero, porque el propio SCO los pone en la URL del contenido.
      learnerId: asignacion.persona.correo,
      learnerName: asignacion.persona.nombre,
      entry: reanudable && anterior !== null && anterior.estado === 'SUSPENDIDO' ? 'resume' : 'ab-initio',
      mode: soloLectura ? 'review' : 'normal',
      credit: soloLectura ? 'no-credit' : 'credit',
      totalTime: aDuracion(intento.totalTimeSegundos),
      location: intento.location ?? '',
      suspendData: intento.suspendData ?? '',
      completionStatus: intento.completionStatus,
      successStatus: intento.successStatus,
      scoreScaled: intento.scoreScaled === null ? null : String(intento.scoreScaled),
      progressMeasure: intento.progressMeasure === null ? null : String(intento.progressMeasure),
      launchData: '',
      scaledPassingScore: null,
      completionThreshold: null,
    }),
    // Lo guardado gana sobre lo inicial: objetivos e interacciones vuelven como quedaron.
    ...guardado,
  };

  return {
    ok: true,
    token: firmarIntento(intento.id, secreto()),
    modelo,
    runnerUrl: `${origenContenido.replace(/\/+$/, '')}/scorm/runner`,
    entradaUrl:
      `${origenContenido.replace(/\/+$/, '')}/scorm/archivo/${paquete.id}/` +
      paquete.entradaHref.split('/').map(encodeURIComponent).join('/'),
    soloLectura,
  };
}

export interface Guardado {
  ok: boolean;
  mensaje?: string;
}

/// P5 · el servidor NO acepta el modelo sin validarlo. Un cliente puede mandar
/// `cmi.success_status=passed`; acá se comprueba que el elemento sea escribible, que el
/// valor cumpla su tipo y que el intento esté abierto.
export async function guardarIntento(
  token: string,
  modelo: Record<string, string>,
  final: boolean,
): Promise<Guardado> {
  const sesion = await getServerSession(authOptions);
  const correo = sesion?.user?.email;
  if (!correo) return { ok: false, mensaje: 'sin sesión' };

  const verificado = verificarIntento(token, secreto());
  if (verificado === null) return { ok: false, mensaje: 'el token del intento no es válido' };

  const intento = await prisma.intentoScorm.findUnique({
    where: { id: verificado.intentoId },
    select: {
      id: true,
      estado: true,
      totalTimeSegundos: true,
      persona: { select: { correo: true } },
    },
  });
  if (intento === null) return { ok: false, mensaje: 'el intento no existe' };
  if (intento.persona.correo !== correo) return { ok: false, mensaje: 'no es tu intento' };
  if (intento.estado === 'COMPLETADO' || intento.estado === 'ABANDONADO') {
    return { ok: false, mensaje: 'el intento ya está cerrado' };
  }

  const abierto = { iniciado: true, terminado: false };
  const conteos = {
    objetivos: Number(modelo['cmi.objectives._count'] ?? '0'),
    interacciones: Number(modelo['cmi.interactions._count'] ?? '0'),
  };

  // Se descartan los elementos que el curso no podía escribir. No se rechaza el lote
  // completo: un solo valor inválido no debe costarle a la persona los 40 minutos que ya
  // invirtió — pero tampoco se guarda lo que no correspondía.
  const limpio: Record<string, string> = {};
  for (const [elemento, valor] of Object.entries(modelo)) {
    if (elemento.endsWith('._count') || elemento.startsWith('adl.nav.')) {
      limpio[elemento] = valor;
      continue;
    }
    if (validarEscritura(elemento, valor, abierto, conteos) === 0) limpio[elemento] = valor;
  }

  const sesionSegundos = aSegundos(limpio['cmi.session_time'] ?? '') ?? 0;
  const exit = limpio['cmi.exit'] ?? null;
  const completion = limpio['cmi.completion_status'] ?? 'unknown';

  await prisma.intentoScorm.update({
    where: { id: intento.id },
    data: {
      cmi: limpio,
      completionStatus: completion,
      successStatus: limpio['cmi.success_status'] ?? 'unknown',
      scoreScaled: limpio['cmi.score.scaled'] === undefined ? null : Number(limpio['cmi.score.scaled']),
      progressMeasure:
        limpio['cmi.progress_measure'] === undefined ? null : Number(limpio['cmi.progress_measure']),
      location: limpio['cmi.location'] ?? null,
      suspendData: limpio['cmi.suspend_data'] ?? null,
      exit,
      sessionTimeSegundos: Math.round(sesionSegundos),
      // `total_time` lo acumula el LMS (§6): sólo al cerrar la sesión, o se sumaría dos
      // veces con cada `Commit` intermedio.
      totalTimeSegundos: final
        ? (aSegundos(sumarDuraciones(aDuracion(intento.totalTimeSegundos), aDuracion(sesionSegundos))) ?? 0)
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

  return { ok: true };
}
```

> **El cierre de la asignación NO va acá.** `guardarIntento` deja el intento en `COMPLETADO`, y el mapeo a `RegistroRealizado` —con `aprobadoDe()` y `notaMinima`— es la Task 1 de la fase 2. Hacerlo en este plan mezclaría «el curso corre» con «el curso cierra la tarea», y son dos cosas que se verifican distinto.

- [ ] **Step 6: Commit**

```bash
git add lib/sig/scorm-token.ts lib/sig/__tests__/scorm-token.test.ts app/mi-sig/acciones/curso.ts
git commit -m "feat(sig): token de intento y las dos puertas por las que el player escribe"
```

---

## Task 11: La página del player

**Files:**
- Create: `app/mi-sig/curso/[asignacionId]/page.tsx`
- Create: `app/mi-sig/curso/[asignacionId]/Player.client.tsx`

- [ ] **Step 1: La página**

Crear `app/mi-sig/curso/[asignacionId]/page.tsx`:

```tsx
// app/mi-sig/curso/[asignacionId]/page.tsx
//
// P19 · esta ruta cae bajo el matcher de `/mi-sig/:path*` en `middleware.ts`, así que exige
// sesión sin agregar ninguna puerta nueva.

import { notFound } from 'next/navigation';
import { abrirIntento } from '@/app/mi-sig/acciones/curso';
import Player from './Player.client';

export default async function Page({ params }: { params: Promise<{ asignacionId: string }> }) {
  const { asignacionId } = await params;
  const id = Number(asignacionId);
  if (!Number.isInteger(id)) notFound();

  const apertura = await abrirIntento(id);
  if (!apertura.ok) {
    // P18 · cuando el curso no puede abrirse, la pantalla dice por qué. Un iframe en blanco
    // hace que la persona crea que la herramienta está rota y que quien administra no tenga
    // nada que mirar.
    return (
      <main style={{ padding: '24px', fontFamily: 'system-ui', maxWidth: '48rem' }}>
        <h1>No se pudo abrir el curso</h1>
        <p>{apertura.mensaje}</p>
      </main>
    );
  }

  return (
    <Player
      token={apertura.token as string}
      modelo={apertura.modelo as Record<string, string>}
      runnerUrl={apertura.runnerUrl as string}
      entradaUrl={apertura.entradaUrl as string}
      soloLectura={apertura.soloLectura === true}
    />
  );
}
```

- [ ] **Step 2: El puente**

Crear `app/mi-sig/curso/[asignacionId]/Player.client.tsx`:

```tsx
'use client';

// app/mi-sig/curso/[asignacionId]/Player.client.tsx
//
// El puente entre el runner (otro origen) y el servidor. Es el único que habla con la base:
// el runner no tiene sesión, y por eso una API robada en el origen de contenido no alcanza
// para escribir nada.

import { useEffect, useRef, useState } from 'react';
import { guardarIntento } from '@/app/mi-sig/acciones/curso';

interface Props {
  token: string;
  modelo: Record<string, string>;
  runnerUrl: string;
  entradaUrl: string;
  soloLectura: boolean;
}

export default function Player({ token, modelo, runnerUrl, entradaUrl, soloLectura }: Props) {
  const marco = useRef<HTMLIFrameElement>(null);
  const ultimoModelo = useRef<Record<string, string>>(modelo);
  const [estado, setEstado] = useState('Cargando el curso…');
  const [progreso, setProgreso] = useState(Number(modelo['cmi.progress_measure'] ?? '0'));
  const [inicializado, setInicializado] = useState(false);

  const origenRunner = new URL(runnerUrl).origin;

  useEffect(() => {
    async function alRecibir(evento: MessageEvent) {
      if (evento.origin !== origenRunner) return;
      const mensaje = evento.data as
        | { tipo: 'LISTO' }
        | { tipo: 'COMMIT'; modelo: Record<string, string>; final: boolean };

      if (mensaje.tipo === 'LISTO') {
        marco.current?.contentWindow?.postMessage(
          { tipo: 'ESTADO', modelo, entradaUrl, soloLectura },
          origenRunner,
        );
        return;
      }

      if (mensaje.tipo === 'COMMIT') {
        setInicializado(true);
        ultimoModelo.current = mensaje.modelo;
        setProgreso(Number(mensaje.modelo['cmi.progress_measure'] ?? '0'));
        const r = await guardarIntento(token, mensaje.modelo, mensaje.final);
        setEstado(
          r.ok
            ? `Avance guardado · ${new Date().toLocaleTimeString('es-CO')}`
            : (r.mensaje ?? 'no se pudo guardar'),
        );
        marco.current?.contentWindow?.postMessage({ tipo: 'GUARDADO', ok: r.ok }, origenRunner);
      }
    }

    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [entradaUrl, modelo, origenRunner, soloLectura, token]);

  // P13 · commit automático cada 60 s. Muchos cursos no llaman `Terminate` si se cierra la
  // pestaña, y sin esto se perderían los últimos minutos de avance.
  useEffect(() => {
    if (soloLectura) return;
    const reloj = setInterval(() => {
      void guardarIntento(token, ultimoModelo.current, false);
    }, 60_000);
    return () => clearInterval(reloj);
  }, [soloLectura, token]);

  // P18 · si el SCO no llamó Initialize en 30 s, algo lo bloqueó: un dominio externo que la
  // CSP no permite, la entrada que no existe, o el servidor sin salida a internet. Se dice.
  useEffect(() => {
    const reloj = setTimeout(() => {
      if (!inicializado) {
        setEstado(
          'El curso no respondió en 30 segundos. Suele ser un dominio externo que la política ' +
            'de contenido no permite —si el paquete es de despacho, necesita salida a internet—, ' +
            'o el archivo de entrada del paquete. Avisá al líder del SIG con el nombre del curso.',
        );
      }
    }, 30_000);
    return () => clearTimeout(reloj);
  }, [inicializado]);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #ddd', fontFamily: 'system-ui' }}>
        <progress value={progreso} max={1} style={{ width: '12rem' }} />{' '}
        <span>{Math.round(progreso * 100)} %</span>
        {soloLectura && <strong> · repaso: este intento no se registra</strong>}
        <span style={{ float: 'right', color: '#555' }}>{estado}</span>
      </header>
      <iframe
        ref={marco}
        title="runner del curso"
        src={runnerUrl}
        style={{ flex: 1, border: 0, width: '100%' }}
        allow="fullscreen; autoplay"
      />
    </main>
  );
}
```

- [ ] **Step 3: Verificación 4 — el paquete entregado corre de punta a punta**

```bash
npm run db:up && npm run dev
```

1. Crear una `CAPACITACION` en `/sig/contenidos` y subirle `scorm_package_2004.zip`. El aviso debe decir **DESPACHO** y nombrar `https://my.coursebox.ai`.
2. Crear una obligación que la asigne, o abrir una asignación existente de ese contenido.
3. Abrir `/mi-sig/curso/<asignacionId>`: el curso de Coursebox debe cargar dentro del player.
4. Comprobar que llegó el primer `Commit`:

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U sgi -d sgi_sgsi -c \
"select id, numero, estado, completion_status, success_status, score_scaled, total_time_segundos from intento_scorm order by id desc limit 3;"
```

Expected: una fila `EN_CURSO` con el modelo poblado en `cmi`.

- [ ] **Step 4: Verificación 6 — reanudar**

Avanzar en el curso, cerrar la pestaña, volver a `/mi-sig/curso/<asignacionId>`.
Expected: `cmi.entry` llega como `resume` y `location`/`suspend_data` vuelven con lo que había. Comprobar en la base que `suspend_data` no está vacío.

- [ ] **Step 5: Verificación 8 — aislamiento**

En la consola del navegador, dentro del iframe del runner:

```js
window.parent.document
```

Expected: `SecurityError` / `Blocked a frame with origin …` — el runner no puede ver el documento de la aplicación. En desarrollo, con los dos orígenes en `localhost:3004`, esta prueba **no aplica**: hay que hacerla en el entorno con los dos hostnames.

- [ ] **Step 6: Verificación 9 — el token no es transferible**

```bash
# Con la sesión de OTRA persona, reusar el token del intento ajeno.
curl -s -X POST http://localhost:3004/mi-sig/curso/1 -H "Cookie: <sesión de otra persona>" | head -5
```

Y, más directo, en la consola con la sesión de otra persona: llamar `guardarIntento` con el token ajeno.
Expected: `no es tu intento`.

- [ ] **Step 7: Correr todo y cerrar**

Run: `npm test && npm run lint && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && npm run build`
Expected: verde en las cuatro.

- [ ] **Step 8: Commit**

```bash
git add app/mi-sig/curso
git commit -m "feat(sig): la pagina del player, con progreso, guardado automatico y el aviso cuando el curso no carga"
```

---

## Cobertura del requerimiento en esta fase

| Verificación (§13 del requerimiento) | Tarea |
|---|---|
| 1 · modelo de datos y códigos de error | Task 3 |
| 2 · duraciones ISO 8601 | Task 2 |
| 3 · análisis del manifiesto con el paquete real | Task 5 + Task 7 · Step 3 |
| 4 · el paquete entregado corre de punta a punta | Task 11 · Step 3 |
| 6 · reanudar funciona | Task 11 · Step 4 |
| 7 · `suspend_data` grande no se trunca | Task 3 (validación) + Task 6 · Step 4 (`text`) |
| 8 · aislamiento de origen | Task 8 + Task 11 · Step 5 |
| 9 · el token no es reutilizable ni transferible | Task 10 + Task 11 · Step 6 |
| 10 · zip slip, bomba zip y XXE | Task 4 (rutas y límites) + Task 5 (XXE) + Task 7 (extractor) |
| 12 · el multi-SCO se rechaza y lo dice | Task 5 |

**Quedan para la fase 2:** verificación 5 (paquete autocontenido de punta a punta, con CSP sin dominios externos), 11 (`completed` sin `passed` no cierra) y 13 (el intento colgado no bloquea), más el cierre de la asignación, el retiro del formulario manual, el trabajo de abandono, la bitácora del envío al tercero (P20) y las superficies de operación.
