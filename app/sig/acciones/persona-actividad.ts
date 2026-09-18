'use server';

// app/sig/acciones/persona-actividad.ts
//
// Lo que una persona tiene abierto, y lo que se formó. Las dos pestañas nuevas del popup
// de Personas leen de acá.
//
// ── POR QUÉ NO VIAJA EN EL CENSO ─────────────────────────────────────────────────────────
//
// `censo.query.ts` mandaba dentro de cada una de las 91 filas el arreglo completo de
// asignaciones abiertas, y ese arreglo llegaba al navegador de cualquiera que abriera la
// pantalla para alimentar un panel que se mira de a una persona. Es el mismo patrón que
// `PopupPersona` ya rechaza tres veces —contactos (P9.3), grupos (P10) y resumen— con el
// mismo argumento, y acá era peor: la pestaña necesita ADEMÁS el tipo de contenido y el
// avance del curso, así que sumarlo al censo habría multiplicado el problema.
//
// El censo conserva los dos NÚMEROS —`pendientes` y `vencidas`— porque ésos son la columna
// y se miran siempre. La lista se pide al abrir.
//
// ── POR QUÉ HAY `autorConPermiso` SI HOY NO RECHAZA A NADIE ──────────────────────────────
//
// `POR_GRUPO` (`lib/sgsi/permisos.ts`) tiene una sola entrada, `Líderes SIG`, y trae todos
// los permisos; el layout de `/sig` exige `operacion:ver`. De ahí se sigue que quien ve la
// pantalla de Personas ya tiene `personas:administrar`: no hay rol intermedio.
//
// La verificación está igual porque **una server action es un endpoint público**: tiene su
// propia URL y NO hereda la puerta del layout. Sin esta línea, cualquiera con sesión —del
// grupo o no— podría leer la carga de trabajo de toda la organización. Existe para que la
// afirmación del párrafo anterior siga siendo verdad el día que alguien cree el segundo
// grupo del Directorio.
//
// ── EL TIPO SE RESUELVE ACÁ, NO EN EL NAVEGADOR ──────────────────────────────────────────
//
// `esFormacion` se aplica en el servidor y viaja resuelto. Es la única forma de que la
// pestaña Pendientes y la pestaña Formación no puedan discrepar sobre qué cuenta como
// formación: hay una sola evaluación de la regla, no dos.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import { diasHasta, esVencida } from '@/lib/sig/cierre';
import {
  avanceDelCurso,
  esFormacion,
  TIPOS_DE_FORMACION,
  type ClaseCurso,
  type ProgresoDeCurso,
} from '@/lib/sig/formacion';

export interface PendienteDePersona {
  /// El id de la ASIGNACIÓN, no el del contenido.
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  /// Resuelto en el servidor (ver el encabezado).
  esFormacion: boolean;
  periodo: string;
  /// ISO completo, como ya lo mandaba el censo.
  fechaLimite: string;
  vencida: boolean;
  /// Días calendario hasta la fecha límite: **positivos cuando falta, negativos cuando ya
  /// pasó**. Es el signo que devuelve `diasHasta` y el que `textoPlazo` espera, y se calcula
  /// en el servidor para que la cuenta no dependa del reloj del navegador de quien mira.
  dias: number;
  progreso: ProgresoDeCurso | null;
  sinProgresoPorque: string | null;
}

export interface ResultadoPendientes extends Resultado {
  /// `null` cuando la lectura falló. Una lista vacía es «no tiene nada abierto», que es una
  /// respuesta distinta y no se puede confundir con un fallo de permiso.
  pendientes: PendienteDePersona[] | null;
}

export interface FilaFormacion {
  asignacionId: number;
  codigo: string;
  titulo: string;
  tipo: string;
  claseCurso: ClaseCurso | null;
  periodo: string;
  fechaLimite: string;
  estado: string;
  fechaCierre: string | null;
  vencida: boolean;
  dias: number;
  /// De `RegistroRealizado`, o del intento cuando el cierre lo hizo el reproductor.
  /// `null` es «no reportó nota», que **no es un cero**.
  calificacion: number | null;
  aprobado: boolean | null;
  notaMinima: number | null;
  /// «1 h 14 min». `null` cuando no hay intentos de los que sacarlo.
  tiempoTotal: string | null;
  progreso: ProgresoDeCurso | null;
  sinProgresoPorque: string | null;
  /// El de una NO_APLICA o una ANULADA. Es lo que separa una exención documentada de una
  /// laguna.
  motivo: string | null;
}

export interface ResultadoFormacion extends Resultado {
  enCurso: FilaFormacion[] | null;
  realizadas: FilaFormacion[] | null;
  /// NO_APLICA y ANULADA. No son «realizada» y no son «pendiente»: son decisiones que
  /// alguien tomó con motivo, y meterlas en cualquiera de los otros dos grupos convierte una
  /// exención en una laguna o en un logro.
  noCursadas: FilaFormacion[] | null;
}

/// Las asignaciones abiertas de una persona, enriquecidas.
export async function pendientesDePersona(personaId: number): Promise<ResultadoPendientes> {
  const r = await ejecutar<ResultadoPendientes>(async () => {
    await autorConPermiso('personas:administrar');
    const id = exigirId(personaId, 'la persona');

    const filas = await prisma.asignacion.findMany({
      // **El mismo predicado que la columna del censo**: `{ personaId, estado: 'PENDIENTE' }`,
      // sin filtros de fecha ni de tipo. Si acá se agregara uno, el número de la columna y el
      // largo de esta lista dejarían de coincidir, y ése es exactamente el defecto del
      // `rowCount` que HARNESS.md documenta: dos piezas contando lo mismo desde orígenes
      // distintos.
      where: { personaId: id, estado: 'PENDIENTE' },
      orderBy: { fechaLimite: 'asc' },
      select: {
        id: true,
        titulo: true,
        periodo: true,
        fechaLimite: true,
        contenido: { select: SELECT_CONTENIDO },
        obligacion: { select: { contenido: { select: SELECT_CONTENIDO } } },
        intentosScorm: { select: SELECT_INTENTO },
      },
    });

    const hoy = new Date();
    const pendientes = filas.map((f) => {
      const contenido = f.contenido ?? f.obligacion?.contenido ?? null;
      const tipo = contenido?.tipo ?? 'TAREA';
      const { progreso, sinProgresoPorque } = avanceDelCurso(
        tipo,
        contenido?.claseCurso ?? null,
        f.intentosScorm.map(comoIntento),
      );

      return {
        id: f.id,
        codigo: contenido?.codigo ?? '—',
        titulo: contenido?.titulo ?? f.titulo ?? 'Asignación puntual',
        tipo,
        esFormacion: esFormacion(tipo),
        periodo: f.periodo,
        fechaLimite: f.fechaLimite.toISOString(),
        vencida: esVencida('PENDIENTE', f.fechaLimite, hoy),
        dias: diasHasta(f.fechaLimite, hoy),
        progreso,
        sinProgresoPorque,
      };
    });

    // Vencidas primero, y dentro de cada grupo por fecha límite. La formación NO se sube al
    // tope: hacerlo empujaría hacia abajo una lectura vencida y le enseñaría a quien mira que
    // lo de arriba es lo que urge, cuando no lo es. Se distingue por su marca y su filtro.
    pendientes.sort((a, b) =>
      a.vencida === b.vencida
        ? a.fechaLimite.localeCompare(b.fechaLimite)
        : a.vencida
          ? -1
          : 1,
    );

    return { ok: true, mensaje: 'ok', pendientes };
  });

  return { ...r, pendientes: r.ok ? (r.pendientes ?? []) : null };
}

/// La formación de una persona, en tres grupos.
export async function formacionDePersona(personaId: number): Promise<ResultadoFormacion> {
  const r = await ejecutar<ResultadoFormacion>(async () => {
    await autorConPermiso('personas:administrar');
    const id = exigirId(personaId, 'la persona');

    // Se filtra por TIPO declarado, por los dos caminos por los que un contenido puede colgar
    // de una asignación. Una asignación puntual —sin contenido— nunca es formación: no hay
    // tipo que declarar.
    const filas = await prisma.asignacion.findMany({
      where: {
        personaId: id,
        OR: [
          { contenido: { tipo: { in: [...TIPOS_DE_FORMACION] } } },
          { obligacion: { contenido: { tipo: { in: [...TIPOS_DE_FORMACION] } } } },
        ],
      },
      orderBy: { fechaLimite: 'desc' },
      select: {
        id: true,
        titulo: true,
        periodo: true,
        fechaLimite: true,
        estado: true,
        fechaCierre: true,
        motivo: true,
        contenido: { select: SELECT_CONTENIDO },
        obligacion: { select: { contenido: { select: SELECT_CONTENIDO } } },
        intentosScorm: { select: SELECT_INTENTO },
        // El último cierre es el vigente: al reabrir (R8) el anterior se conserva y el nuevo
        // crea otro. Tomar el primero daría la nota de un cierre que ya fue revertido.
        registros: {
          orderBy: { fechaHora: 'desc' },
          take: 1,
          select: { calificacion: true, aprobado: true },
        },
      },
    });

    const hoy = new Date();
    const todas: FilaFormacion[] = filas.map((f) => {
      const contenido = f.contenido ?? f.obligacion?.contenido ?? null;
      const tipo = contenido?.tipo ?? 'CAPACITACION';
      const intentos = f.intentosScorm.map(comoIntento);
      const { progreso, sinProgresoPorque } = avanceDelCurso(
        tipo,
        contenido?.claseCurso ?? null,
        intentos,
      );
      const registro = f.registros[0] ?? null;
      // Los intentos SIN convertir: `calificacionDe` y `tiempoDe` necesitan `scoreScaled` y
      // `totalTimeSegundos`, que `comoIntento` no lleva porque no deciden nada del avance.
      const intentosCrudos = f.intentosScorm;

      return {
        asignacionId: f.id,
        codigo: contenido?.codigo ?? '—',
        titulo: contenido?.titulo ?? f.titulo ?? 'Formación',
        tipo,
        claseCurso: contenido?.claseCurso ?? null,
        periodo: f.periodo,
        fechaLimite: f.fechaLimite.toISOString(),
        estado: f.estado,
        fechaCierre: f.fechaCierre?.toISOString() ?? null,
        vencida: esVencida(f.estado, f.fechaLimite, hoy),
        dias: diasHasta(f.fechaLimite, hoy),
        // La nota declarada manda sobre la del curso: es la que quedó congelada en el cierre
        // (R10) y la que un auditor puede verificar. El `scoreScaled` se usa sólo cuando no
        // hubo registro, que es el caso del cierre hecho por el reproductor.
        calificacion: calificacionDe(registro, intentosCrudos),
        aprobado: registro?.aprobado ?? null,
        notaMinima: contenido?.notaMinima === null || contenido?.notaMinima === undefined
          ? null
          : Number(contenido.notaMinima),
        tiempoTotal: tiempoDe(intentosCrudos),
        // Una formación cerrada no tiene «avance»: tiene resultado. Mostrar «100%» al lado de
        // «aprobó» sugiere dos hechos donde hay uno.
        progreso: f.estado === 'PENDIENTE' ? progreso : null,
        sinProgresoPorque: f.estado === 'PENDIENTE' ? sinProgresoPorque : null,
        motivo: f.motivo,
      };
    });

    return {
      ok: true,
      mensaje: 'ok',
      enCurso: todas.filter((x) => x.estado === 'PENDIENTE'),
      realizadas: todas.filter((x) => x.estado === 'REALIZADA'),
      noCursadas: todas.filter((x) => x.estado === 'NO_APLICA' || x.estado === 'ANULADA'),
    };
  });

  return {
    ...r,
    enCurso: r.ok ? (r.enCurso ?? []) : null,
    realizadas: r.ok ? (r.realizadas ?? []) : null,
    noCursadas: r.ok ? (r.noCursadas ?? []) : null,
  };
}

// ── Lo compartido ───────────────────────────────────────────────────────────────────────

const SELECT_CONTENIDO = {
  codigo: true,
  titulo: true,
  tipo: true,
  claseCurso: true,
  notaMinima: true,
} as const;

const SELECT_INTENTO = {
  numero: true,
  estado: true,
  progressMeasure: true,
  ultimaActividadEn: true,
  scoreScaled: true,
  totalTimeSegundos: true,
} as const;

interface IntentoLeido {
  numero: number;
  estado: string;
  progressMeasure: unknown;
  ultimaActividadEn: Date;
}

/// `progressMeasure` llega como `Decimal` de Prisma. `Number(null)` es 0, así que la
/// conversión tiene que preguntar por el nulo ANTES de convertir: ahí se perdería la
/// distinción entera entre «no reportó» y «reportó cero».
function comoIntento(i: IntentoLeido) {
  return {
    numero: i.numero,
    estado: i.estado,
    progressMeasure: i.progressMeasure === null ? null : Number(i.progressMeasure),
    ultimaActividadEn: i.ultimaActividadEn,
  };
}

function calificacionDe(
  registro: { calificacion: unknown } | null,
  intentos: { scoreScaled: unknown; numero: number }[],
): number | null {
  if (registro?.calificacion !== null && registro?.calificacion !== undefined) {
    return Number(registro.calificacion);
  }
  if (intentos.length === 0) return null;
  const vigente = intentos.reduce((a, b) => (b.numero > a.numero ? b : a));
  if (vigente.scoreScaled === null || vigente.scoreScaled === undefined) return null;
  // `scoreScaled` es 0–1; la pantalla habla en 0–100, como ya hace la ficha.
  return Math.round(Number(vigente.scoreScaled) * 10000) / 100;
}

/// El tiempo del intento vigente, en palabras. `null` cuando no hay intentos: cero minutos y
/// «no hay curso en línea» son cosas distintas.
function tiempoDe(intentos: { totalTimeSegundos: number; numero: number }[]): string | null {
  if (intentos.length === 0) return null;
  const vigente = intentos.reduce((a, b) => (b.numero > a.numero ? b : a));
  const horas = Math.floor(vigente.totalTimeSegundos / 3600);
  const minutos = Math.round((vigente.totalTimeSegundos % 3600) / 60);
  return horas === 0 ? `${minutos} min` : `${horas} h ${minutos} min`;
}
