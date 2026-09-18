'use server';

// app/mi-sig/acciones/curso.ts
//
// Abrir un intento y guardar su avance. Son las dos únicas puertas por las que el player
// escribe, y las dos verifican la sesión: el token del intento autoriza QUÉ intento, la
// sesión autoriza a QUIÉN (P4/P5).

import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { resultadoDeclarado, veredictoDelIntento } from '@/lib/sig/scorm-cierre';
import { aDuracion, aSegundos, sumarDuraciones } from '@/lib/sig/scorm-tiempo';
import { modeloInicial, validarEscritura } from '@/lib/sig/scorm-modelo';
import { firmarIntento, motivoDe, verificarIntento } from '@/lib/sig/scorm-token';

/// La misma cadena que `lib/sgsi/anexo-archivo.ts`: si el token del intento y la firma de
/// descarga de un anexo derivaran de secretos distintos, una rotación arreglaría uno y
/// dejaría el otro firmando con el valor de desarrollo sin que nada avise.
function secreto(): string {
  const configurado =
    process.env.SGI_RUTAS_SECRETO ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (configurado !== undefined && configurado.trim() !== '') return configurado;

  // EN PRODUCCIÓN NO HAY RESPALDO. El valor de reserva está escrito en este archivo y el
  // repositorio es legible: firmar tokens de producción con él equivale a no firmarlos —
  // cualquiera que lea el código puede fabricar uno para el intento de otra persona.
  //
  // Se rompe acá y fuerte, en vez de arrancar y ser inseguro en silencio. Es un fallo de
  // configuración del despliegue y tiene que verse el primer día, no en una auditoría.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SGI_RUTAS_SECRETO no está configurado. Los tokens del player SCORM se firman con él, ' +
        'y sin secreto propio cualquiera puede fabricar uno. Definilo en el entorno.',
    );
  }
  return 'sgi-dev-secret';
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
          paquetes: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              entradaHref: true,
              clase: true,
              dominiosExternos: true,
              tituloOrganizacion: true,
            },
          },
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

  // P20 · en un paquete de DESPACHO, el correo y el nombre de la persona salen hacia el
  // tercero: el propio SCO los pone en la URL del contenido (§2). Sin este registro, la
  // organización no puede responder «a quién le compartimos los datos de nuestros
  // colaboradores y cuándo», que es lo que un titular de datos tiene derecho a preguntar.
  //
  // Se anota también en `mode=review`: ahí no se crea intento ni se escribe nada, pero el
  // curso se lanza igual y los dos datos viajan igual. Un registro que se calla en el
  // repaso subcontaría exactamente los envíos que nadie está mirando.
  if (paquete.clase === 'DESPACHO') {
    await registrar({ bitacora: prisma.bitacora }, correo, [
      {
        tabla: 'intento_scorm',
        registroId: String(intento.id),
        campo: 'datos_a_tercero',
        anterior: null,
        nuevo: `correo y nombre → ${paquete.dominiosExternos.join(', ')}`,
        motivo: `lanzamiento del curso ${paquete.tituloOrganizacion} (paquete de despacho, D-4)`,
      },
    ]);
  }

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
  /// Un token FRESCO en cada guardado aceptado.
  ///
  /// Sin esto el token se emitía una sola vez al abrir el curso y nada lo renovaba: pasada
  /// su vigencia, el autoguardado y el commit final de `Terminate` se rechazaban, y la
  /// persona terminaba el curso con la asignación sin cerrar. Como el player guarda cada
  /// 60 s, con esto el token se renueva sesenta veces antes de acercarse a su vencimiento.
  token?: string;
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
  if (verificado === null) {
    // El mensaje distingue las dos causas, porque mandan a arreglar cosas distintas: un
    // vencido es «volvé a abrir el curso» y un inválido es «alguien tocó la petición».
    // Antes las dos llegaban a la pantalla como «este intento ya se cerró», que era falso.
    return {
      ok: false,
      mensaje:
        motivoDe(token, secreto()) === 'vencido'
          ? 'la sesión del curso venció. Volvé a abrirlo: tu avance guardado no se pierde.'
          : 'el token del intento no es válido',
    };
  }

  const intento = await prisma.intentoScorm.findUnique({
    where: { id: verificado.intentoId },
    select: {
      id: true,
      estado: true,
      totalTimeSegundos: true,
      asignacionId: true,
      registroId: true,
      mode: true,
      persona: { select: { correo: true } },
      asignacion: {
        select: {
          id: true,
          estado: true,
          personaId: true,
          contenido: {
            select: {
              id: true,
              version: true,
              exigeEvaluacion: true,
              notaMinima: true,
              versiones: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
            },
          },
        },
      },
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

  // P14/P15 · el veredicto se calcula con el módulo puro, el mismo que decide el cierre
  // manual. Sólo al cerrar la sesión: un `Commit` intermedio no cierra nada.
  const veredicto = final
    ? veredictoDelIntento(
        {
          completionStatus: completion,
          successStatus: limpio['cmi.success_status'] ?? 'unknown',
          scoreScaled:
            limpio['cmi.score.scaled'] === undefined ? null : Number(limpio['cmi.score.scaled']),
          scoreRaw: limpio['cmi.score.raw'] === undefined ? null : Number(limpio['cmi.score.raw']),
          scoreMin: limpio['cmi.score.min'] === undefined ? null : Number(limpio['cmi.score.min']),
          scoreMax: limpio['cmi.score.max'] === undefined ? null : Number(limpio['cmi.score.max']),
        },
        {
          exigeEvaluacion: intento.asignacion.contenido?.exigeEvaluacion ?? false,
          notaMinima:
            intento.asignacion.contenido?.notaMinima === null ||
            intento.asignacion.contenido?.notaMinima === undefined
              ? null
              : Number(intento.asignacion.contenido.notaMinima),
        },
      )
    : null;

  // P12 · `mode=review` no escribe nada: quien repasa lo que ya aprobó no arriesga su
  // registro. El intento de repaso no existe como fila, pero la guarda va acá también por
  // si alguna vez se abre uno.
  const registra =
    veredicto !== null && veredicto.registrar && intento.mode !== 'review' && intento.registroId === null;

  await prisma.$transaction(async (tx) => {
    await tx.intentoScorm.update({
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
        // Un `Commit` intermedio NO borra el cierre. Estaba escrito `final ? new Date() : null`,
        // y con eso un `Commit` posterior a un `Terminate` con `exit=suspend` —el intento
        // queda SUSPENDIDO, que sigue aceptando escrituras— dejaba un intento terminado sin
        // fecha de terminación. `undefined` es «no toques la columna» para Prisma.
        terminadoEn: final ? new Date() : undefined,
        ultimaActividadEn: new Date(),
      },
    });

    if (!registra || veredicto === null) return;

    // El registro se crea UNA vez por intento (`intento.registroId` es único): un `Commit`
    // final repetido —los hay, cuando el curso llama Commit y después Terminate— no puede
    // duplicar el cierre.
    const registro = await tx.registroRealizado.create({
      data: {
        asignacionId: intento.asignacionId,
        asistio: veredicto.asistio,
        calificacion: veredicto.calificacion,
        // Congelado al cerrar: `notaMinima` vive en el contenido y cambia; el registro debe
        // seguir siendo verificable (R10).
        aprobado: veredicto.aprobado,
        versionContenidoId: intento.asignacion.contenido?.versiones[0]?.id ?? null,
        nota: `curso SCORM · intento registrado por el player · ${veredicto.motivo}`,
      },
    });

    await tx.intentoScorm.update({
      where: { id: intento.id },
      data: { registroId: registro.id },
    });

    if (veredicto.cierra && intento.asignacion.estado === 'PENDIENTE') {
      await tx.asignacion.update({
        where: { id: intento.asignacionId },
        data: {
          estado: 'REALIZADA',
          fechaCierre: new Date(),
          // No es un cierre administrativo: lo cerró la persona haciendo el curso.
          cerradaPor: intento.asignacion.personaId,
        },
      });
    }

    await registrar(tx, correo, [
      {
        tabla: 'intento_scorm',
        registroId: String(intento.id),
        campo: veredicto.cierra ? 'cierre' : 'intento',
        anterior: null,
        nuevo:
          `${completion}/${limpio['cmi.success_status'] ?? 'unknown'} · ` +
          `${veredicto.calificacion ?? 'sin nota'}`,
        motivo: veredicto.motivo,
      },
    ]);
  });

  // El token se renueva SÓLO en el camino aceptado: renovarlo tras un rechazo le daría vida
  // nueva a una ejecución que el servidor acaba de negar.
  return {
    ok: true,
    mensaje: veredicto?.motivo,
    token: firmarIntento(verificado.intentoId, secreto()),
  };
}

export interface Declaracion {
  ok: boolean;
  mensaje?: string;
  /// El curso exige nota y no se declaró: la pantalla la pide y vuelve a llamar con ella.
  requiereNota?: boolean;
}

/// REQ-SIG-24 · la persona REGISTRA que terminó el curso, y se confía en el registro.
///
/// Coursebox no reporta la completitud por SCORM —el despacho corre en un iframe de un tercero
/// y no llama a la API—, así que el player nunca recibe el «terminó» y la asignación no cierra
/// sola. Se ofrece declararlo a mano. Queda anotado como AUTODECLARACIÓN, no como un resultado
/// medido: la evidencia dice lo que es, y la bitácora registra quién lo declaró y cuándo.
///
/// Un curso sin evaluación cierra con la sola declaración; uno con evaluación pide la nota
/// (P16), y ahí el aprobado lo decide `notaMinima`, como en cualquier cierre. Idempotente: una
/// asignación ya cerrada devuelve ok sin duplicar el registro.
export async function declararCursoTerminado(
  asignacionId: number,
  calificacion?: number | null,
): Promise<Declaracion> {
  const sesion = await getServerSession(authOptions);
  const correo = sesion?.user?.email;
  if (!correo) return { ok: false, mensaje: 'sin sesión' };

  const asignacion = await prisma.asignacion.findUnique({
    where: { id: asignacionId },
    select: {
      id: true,
      estado: true,
      personaId: true,
      persona: { select: { correo: true } },
      contenido: {
        select: {
          exigeEvaluacion: true,
          notaMinima: true,
          versiones: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
          paquetes: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
        },
      },
    },
  });
  if (asignacion === null) return { ok: false, mensaje: 'la asignación no existe' };
  if (asignacion.persona.correo !== correo) return { ok: false, mensaje: 'no es tu asignación' };
  if (asignacion.estado === 'REALIZADA') {
    return { ok: true, mensaje: 'Ya estaba registrada como terminada.' };
  }

  const paqueteId = asignacion.contenido?.paquetes[0]?.id;
  if (paqueteId === undefined) {
    return { ok: false, mensaje: 'esta capacitación no tiene paquete SCORM' };
  }

  const exigeEvaluacion = asignacion.contenido?.exigeEvaluacion ?? false;
  const notaMinima =
    asignacion.contenido?.notaMinima == null ? null : Number(asignacion.contenido.notaMinima);
  const nota = calificacion == null ? null : Number(calificacion);

  const veredicto = veredictoDelIntento(resultadoDeclarado(nota), { exigeEvaluacion, notaMinima });
  if (!veredicto.cierra) {
    // La única razón para que una completitud declarada no cierre es que falte la nota exigida
    // (P16). La pantalla la pide y vuelve a llamar con ella.
    return {
      ok: false,
      requiereNota: true,
      mensaje: 'Este curso exige una nota. Ingresá la que obtuviste para registrar el curso.',
    };
  }

  const cabeceras = await headers();
  await prisma.$transaction(async (tx) => {
    // El intento abierto de la persona, o uno nuevo: la declaración vale aunque el player no
    // haya alcanzado a crear intento (o la persona hiciera el curso sin dejarlo abierto).
    const abierto = await tx.intentoScorm.findFirst({
      where: { asignacionId, personaId: asignacion.personaId, estado: { in: ['EN_CURSO', 'SUSPENDIDO'] } },
      orderBy: { numero: 'desc' },
      select: { id: true },
    });

    let intentoId: number;
    if (abierto !== null) {
      intentoId = abierto.id;
    } else {
      const ultimo = await tx.intentoScorm.findFirst({
        where: { asignacionId },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      const creado = await tx.intentoScorm.create({
        data: {
          asignacionId,
          personaId: asignacion.personaId,
          paqueteId,
          numero: (ultimo?.numero ?? 0) + 1,
          entry: 'ab-initio',
          mode: 'normal',
          cmi: {},
          ip: cabeceras.get('x-forwarded-for') ?? cabeceras.get('x-real-ip'),
          agente: cabeceras.get('user-agent'),
        },
        select: { id: true },
      });
      intentoId = creado.id;
    }

    await tx.intentoScorm.update({
      where: { id: intentoId },
      data: {
        estado: 'COMPLETADO',
        completionStatus: 'completed',
        successStatus: 'unknown',
        scoreScaled: nota === null ? null : nota / 100,
        exit: 'normal',
        terminadoEn: new Date(),
      },
    });

    const registro = await tx.registroRealizado.create({
      data: {
        asignacionId,
        asistio: veredicto.asistio,
        calificacion: veredicto.calificacion,
        aprobado: veredicto.aprobado,
        versionContenidoId: asignacion.contenido?.versiones[0]?.id ?? null,
        // Dice que es autodeclarado, no medido: la evidencia no finge lo que no es.
        nota: `curso · AUTODECLARADO por el colaborador · ${veredicto.motivo}`,
      },
    });
    await tx.intentoScorm.update({ where: { id: intentoId }, data: { registroId: registro.id } });

    await tx.asignacion.update({
      where: { id: asignacionId },
      data: {
        estado: 'REALIZADA',
        fechaCierre: new Date(),
        // No es un cierre administrativo: lo cerró la persona declarando que terminó.
        cerradaPor: asignacion.personaId,
      },
    });

    await registrar(tx, correo, [
      {
        tabla: 'intento_scorm',
        registroId: String(intentoId),
        campo: 'autodeclaracion',
        anterior: null,
        nuevo: `completado (autodeclarado)${nota === null ? '' : ` · nota ${nota}`}`,
        motivo: 'el colaborador declaró haber terminado el curso',
      },
    ]);
  });

  revalidatePath('/mi-sig');
  return { ok: true, mensaje: 'Registramos que terminaste el curso.' };
}
