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

/// La misma cadena que `lib/sgsi/anexo-archivo.ts`: si el token del intento y la firma de
/// descarga de un anexo derivaran de secretos distintos, una rotación arreglaría uno y
/// dejaría el otro firmando con el valor de desarrollo sin que nada avise.
function secreto(): string {
  return (
    process.env.SGI_RUTAS_SECRETO ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    'sgi-dev-secret'
  );
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
