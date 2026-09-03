import 'server-only';

// lib/sig/trabajos.ts
//
// Los trabajos programados (docs/handoff_sig/trabajos-programados.md).
//
// Hasta ahora el motor de tareas NO se movía solo: `generarAsignaciones()` y los correos
// semanal y mensual existían, pero lo único que los disparaba era un botón. Los periodos
// no se abrían y los resúmenes no salían salvo que alguien entrara y apretara algo.
//
// Este módulo es el núcleo; el catálogo de qué existe está en `trabajos-catalogo.ts`.
// Vive en `lib/` con `server-only` —y no en un
// archivo de acciones— por una razón de seguridad concreta: en un archivo `'use server'`
// TODA exportación se vuelve una server action invocable desde el navegador. Poner acá el
// núcleo, que corre SIN compuerta de permiso porque detrás hay un cron y no una persona,
// habría creado exactamente eso: una acción que escribe en la base sin preguntar quién es.
// Mismo patrón que `lib/sgsi/directorio.ts`.
//
// El autor entra como parámetro. La compuerta de permiso se queda en la acción que llama;
// la ruta del cron ya se autenticó con su secreto y pasa `sistema`.

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { planificarGeneracion } from '@/lib/sig/generacion';
import { TRABAJOS, trabajoPorNombre } from '@/lib/sig/trabajos-catalogo';


export interface ResultadoTrabajo {
  /// Cuántas cosas produjo. Es la columna `creados` de la ejecución.
  creados: number;
  /// El conteo por tipo, para leer la corrida sin abrir el log del servidor.
  detalle: string;
}


// ── generar-asignaciones ────────────────────────────────────────────────────────────────

/// Abre los periodos que correspondan. T1: es idempotente por diseño —`Asignacion` tiene
/// `@@unique([obligacionId, personaId, periodo])`— así que el cron puede reintentar sin
/// miedo, y esa restricción está en el esquema justamente por esto.
export async function generarAsignacionesComo(
  autor: string,
  hoy: Date,
): Promise<ResultadoTrabajo> {
  const [obligaciones, personas, existentes, activos] = await Promise.all([
    prisma.obligacion.findMany({
      select: {
        id: true,
        contenidoId: true,
        alcance: true,
        alcancePersonaId: true,
        alcanceCargoId: true,
        alcanceAreaId: true,
        alcanceActivoId: true,
        alcanceTipoActivoId: true,
        alcanceNivelActivoId: true,
        responsableSeguimientoId: true,
        periodicidad: true,
        fechaInicio: true,
        plazoDias: true,
        activa: true,
        // R12 · sin esto toda obligacion se leeria como anclada y una flotante nunca
        // generaria su segundo ciclo.
        anclaje: true,
      },
    }),
    prisma.persona.findMany({
      select: { id: true, activa: true, areaId: true, cargoId: true },
    }),
    prisma.asignacion.findMany({
      // `fechaApertura` y `fechaCierre` las usa SOLO el anclaje flotante, que necesita
      // saber cual fue el ultimo ciclo y si se cerro. El anclado las ignora.
      select: {
        obligacionId: true,
        personaId: true,
        periodo: true,
        activoId: true,
        fechaApertura: true,
        fechaCierre: true,
      },
    }),
    // Los activos, para los alcances por activo y por tipo (D3). El propietario es un
    // CARGO, no una persona.
    prisma.activo.findMany({
      select: { id: true, activo: true, tipoId: true, propietarioId: true },
    }),
  ]);

  const plan = planificarGeneracion(obligaciones, personas, existentes, hoy, 90, activos);
  if (plan.crear.length === 0) {
    return { creados: 0, detalle: 'no había periodos nuevos por abrir' };
  }

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
          activoId: a.activoId,
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

  const periodos = [...new Set(plan.crear.map((a) => a.periodo))].sort();
  return {
    creados: plan.crear.length,
    detalle: `${plan.crear.length} asignación(es) en ${periodos.length} periodo(s): ${periodos.join(', ')}`,
  };
}

// ── El cableado ─────────────────────────────────────────────────────────────────────────

/// Qué función corre cada trabajo. El catálogo dice qué existe y qué está construido; esto
/// dice cómo. Están separados porque el catálogo se puede probar y este archivo no: importa
/// Prisma, y un módulo que importa Prisma no carga en jest.
const IMPLEMENTACIONES: Record<string, (autor: string, hoy: Date) => Promise<ResultadoTrabajo>> = {
  'generar-asignaciones': generarAsignacionesComo,
  'enviar-notificaciones': async (autor) => {
    const { enviarNotificacionesComo } = await import('@/lib/sig/trabajos-notificaciones');
    const r = await enviarNotificacionesComo(autor);
    if (!r.ok) throw new Error(r.mensaje);
    return { creados: r.enviados, detalle: r.mensaje };
  },
};

// Al cargar el módulo, no a las 5 de la mañana. Un trabajo marcado `disponible` sin
// implementación devolvería 200 sin hacer nada —la falla en silencio que `EjecucionTrabajo`
// vino a impedir— y una implementación sin declarar sería código que el cron nunca llama.
for (const t of TRABAJOS) {
  const implementado = IMPLEMENTACIONES[t.nombre] !== undefined;
  if (t.disponible !== implementado) {
    throw new Error(
      `El trabajo «${t.nombre}» está declarado como ${t.disponible ? 'disponible' : 'no disponible'} ` +
        `y ${implementado ? 'sí' : 'no'} tiene implementación. El catálogo y el cableado tienen que coincidir.`,
    );
  }
}

// ── La corrida, con su registro ─────────────────────────────────────────────────────────

export interface Corrida {
  ejecucionId: number;
  resultado: 'EXITOSO' | 'FALLIDO' | 'PARCIAL';
  creados: number;
  detalle: string;
  error: string | null;
}

/// Corre un trabajo y deja constancia SIEMPRE, también cuando falla.
///
/// La fila se abre ANTES de correr y se cierra después. Si el proceso muere en el medio, la
/// ejecución queda con `fin` nulo — y eso es información: dice que el trabajo arrancó y no
/// terminó, que es distinto de no haber corrido nunca.
export async function correrTrabajo(
  nombre: string,
  invocadoPor: string,
  autor: string,
  hoy: Date = new Date(),
): Promise<Corrida> {
  const definicion = trabajoPorNombre(nombre);
  const correr = IMPLEMENTACIONES[nombre];
  if (!definicion || !correr) {
    throw new Error(`El trabajo «${nombre}» no está construido todavía.`);
  }

  const ejecucion = await prisma.ejecucionTrabajo.create({
    data: { trabajo: nombre, invocadoPor },
  });

  try {
    const r = await correr(autor, hoy);
    await prisma.ejecucionTrabajo.update({
      where: { id: ejecucion.id },
      data: { fin: new Date(), resultado: 'EXITOSO', creados: r.creados, detalle: r.detalle },
    });
    return {
      ejecucionId: ejecucion.id,
      resultado: 'EXITOSO',
      creados: r.creados,
      detalle: r.detalle,
      error: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'error desconocido';
    await prisma.ejecucionTrabajo.update({
      where: { id: ejecucion.id },
      data: { fin: new Date(), resultado: 'FALLIDO', error },
    });
    // Se registra y se DEVUELVE como fallida — no se re-lanza. La ruta lee `resultado` y
    // responde 500, que es lo único que el cron mira; una excepción acá se convertiría en
    // el 500 genérico de Next y perdería el `ejecucionId` con el que se rastrea la corrida.
    return {
      ejecucionId: ejecucion.id,
      resultado: 'FALLIDO',
      creados: 0,
      detalle: '',
      error,
    };
  }
}

/// Si la generación no corrió ayer, el tablero lo dice.
///
/// El documento lo pone por encima de cualquier indicador de cumplimiento, y con razón: sin
/// generación no hay asignaciones, y sin asignaciones todos los porcentajes salen altos
/// porque el denominador está vacío. Un sistema que no generó ayer no está al 100 %: está
/// sin datos, y esas dos cosas se ven igual en una barra.
export async function ultimaCorridaExitosa(nombre: string): Promise<Date | null> {
  const fila = await prisma.ejecucionTrabajo.findFirst({
    where: { trabajo: nombre, resultado: 'EXITOSO' },
    orderBy: { inicio: 'desc' },
    select: { inicio: true },
  });
  return fila?.inicio ?? null;
}
