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
    select: { id: true, tipo: true, codigo: true, claseCurso: true },
  });
  if (contenido === null) return { ok: false, mensaje: 'el contenido no existe' };

  // REQ-SIG-26 · LA COMPUERTA NO DESAPARECE, CAMBIA DE CRITERIO.
  //
  // Decía «sólo una CAPACITACION puede tener paquete SCORM. P1: un curso no es un tipo
  // nuevo de contenido, es una capacitación con paquete». **REQ-SIG-24 revirtió P1**:
  // `CURSO_VIRTUAL` es un tipo propio. La compuerta estaba escrita contra un diseño que ya
  // no rige, y por eso el tipo nuevo no podía publicarse por ninguna vía.
  //
  // Lo que sigue prohibido es lo mismo de antes: una LECTURA, una TAREA o una VERIFICACION
  // no tienen dónde ejecutar un curso, y aceptarles un zip guardaría un paquete que nadie
  // podría abrir nunca.
  if (contenido.tipo !== 'CAPACITACION' && contenido.tipo !== 'CURSO_VIRTUAL') {
    return {
      ok: false,
      mensaje:
        'este contenido no puede tener paquete SCORM: sólo un Curso Virtual de clase ' +
        'paquete, o una capacitación de las que ya existían con curso cargado.',
    };
  }

  // La clase la declara quien publica (D-1), y decirlo importa: un curso de enlace externo
  // se recorre en la plataforma del proveedor y su cierre es una declaración de la persona.
  // Aceptarle un zip dejaría el contenido con las dos cosas y nadie sabría cuál rige.
  if (contenido.tipo === 'CURSO_VIRTUAL' && contenido.claseCurso === 'ENLACE') {
    return {
      ok: false,
      mensaje:
        'este curso está declarado como enlace externo: se abre en la plataforma del ' +
        'proveedor y no lleva paquete. Cambiá la clase a «Paquete SCORM» en la ficha antes ' +
        'de subir uno.',
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
