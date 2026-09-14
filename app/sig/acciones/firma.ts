'use server';

// app/sig/acciones/firma.ts
//
// Firmar y aceptar. **F7 · todo en una transacción**: acta, artefacto, registro de
// realizado, cierre de la asignación y bitácora. Un acta sin su registro, o un registro sin
// su acta, es peor que no tener ninguno de los dos — el primero afirma que alguien firmó
// una tarea que sigue abierta, y el segundo cierra una tarea sin la evidencia que la
// sostiene.
//
// **REQ-SIG-19 · P15 · las cinco escrituras viven en un solo lugar**, y ese lugar es
// `lib/sig/asentar-firma.ts`. Hay dos vías para llegar
// a firmar —la sesión corporativa de siempre y el enlace público al correo personal— y las dos
// asientan exactamente lo mismo. Una segunda copia de este bloque se desincroniza en el primer
// cambio, y el defecto aparecería en las actas de una sola de las dos vías: el peor lugar donde
// puede aparecer, porque nadie compara actas entre vías hasta que un auditor lo hace.
//
// Lo que cambia entre las dos vías **no** son las escrituras: es **quién autoriza**. Por eso
// `asentarFirma` recibe al autor y al medio en vez de deducirlos, y la puerta de la sesión
// —`persona.correo !== sesion`— se queda arriba, en `firmarYAceptar`. Si bajara, la vía por
// enlace tendría que fingir un correo de sesión que nunca existió.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { autorActual, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import { validarFirma } from '@/lib/sig/firma';
import { asentarFirma, publicarLuego, type DatosFirma } from '@/lib/sig/asentar-firma';

/// Se re-exporta el tipo para que quien lo importaba siga importándolo de acá: el bloque
/// compartido bajó a `lib/sig/asentar-firma.ts`, pero esta acción sigue siendo la misma puerta y
/// su firma no cambió.
export type { DatosFirma };

export interface ResultadoFirma extends Resultado {
  codigoActa: string | null;
}

export async function firmarYAceptar(
  asignacionId: number,
  datos: DatosFirma,
): Promise<ResultadoFirma> {
  return ejecutar<ResultadoFirma>(async () => {
    const sesion = await autorActual();
    exigirId(asignacionId, 'la asignación');

    const asignacion = await prisma.asignacion.findUnique({
      where: { id: asignacionId },
      include: {
        persona: {
          include: {
            area: { select: { nombre: true } },
            cargo: { select: { nombre: true } },
            tipoContrato: { select: { nombre: true } },
          },
        },
        contenido: true,
        obligacion: { include: { contenido: true } },
        registros: { select: { id: true } },
      },
    });
    if (!asignacion) {
      return { ok: false, mensaje: 'La asignación no existe.', codigoActa: null };
    }

    // **Firma cada persona, y nadie por ella** (§6 de la spec). No hay cierre
    // administrativo de una firma: un acta firmada por otro no es una firma, es una
    // falsificación con permisos.
    //
    // **Esta puerta es de la sesión y se queda acá** (P15): la vía por enlace no la relaja, la
    // REEMPLAZA por el token de un solo uso más el documento de identidad verificado. Bajarla a
    // `asentarFirma` obligaría a esa vía a inventar un correo de sesión para pasarla.
    if (asignacion.persona.correo !== sesion) {
      return {
        ok: false,
        mensaje: 'Sólo la persona asignada puede firmar. No hay firma por delegación.',
        codigoActa: null,
      };
    }
    if (asignacion.registros.length > 0) {
      return { ok: false, mensaje: 'Esta asignación ya se cerró.', codigoActa: null };
    }

    const contenido = asignacion.contenido ?? asignacion.obligacion?.contenido;
    if (!contenido) {
      return { ok: false, mensaje: 'La asignación no tiene contenido.', codigoActa: null };
    }
    if (!contenido.exigeFirma) {
      return {
        ok: false,
        mensaje: 'Este contenido no exige firma; se cierra por la vía normal.',
        codigoActa: null,
      };
    }

    const errores = validarFirma({
      abrioElDocumento: datos.abrioElDocumento,
      acepto: datos.acepto,
      nombreFirmante: datos.nombreFirmante,
      documentoFirmante: datos.documentoFirmante,
      declaracion: contenido.declaracion,
    });
    if (errores.length > 0) {
      return { ok: false, mensaje: errores.join('. '), codigoActa: null };
    }

    // La versión vigente, con su texto. Es lo que la persona tenía delante, y de ahí sale
    // la huella del documento (F3): sin ella, «acepté la versión 2» no prueba nada.
    const version = await prisma.versionContenido.findUnique({
      where: {
        contenidoId_version: { contenidoId: contenido.id, version: contenido.version },
      },
    });
    if (!version) {
      // No se firma contra un documento cuyo texto no existe. Es el defecto que D6 cerró y
      // acá se rechaza en vez de generar un acta que no se puede verificar.
      return {
        ok: false,
        mensaje:
          'El contenido no tiene guardada su versión vigente, así que no hay texto contra el ' +
          'cual verificar la firma.',
        codigoActa: null,
      };
    }

    const cabeceras = await headers();

    const asentada = await prisma.$transaction((tx) =>
      asentarFirma(tx, {
        asignacion,
        contenido,
        version,
        datos,
        // Con sesión el autor ES el correo corporativo autenticado: la puerta de arriba acaba de
        // comprobar que coincide con el de la persona asignada.
        autor: sesion,
        medio: 'SESION_CORPORATIVA',
        ip: cabeceras.get('x-forwarded-for') ?? cabeceras.get('x-real-ip'),
        agente: cabeceras.get('user-agent'),
      }),
    );

    publicarLuego(asentada.evidenciaId);

    revalidatePath('/mi-sig');
    revalidatePath('/mi-sig/historial');
    return {
      ok: true,
      mensaje: `Acta ${asentada.codigo} generada. Queda en tu historial con su huella.`,
      codigoActa: asentada.codigo,
    };
  });
}
