'use server';

// app/sig/acciones/desarrollo.ts
//
// Sistemas, puertas y excepciones.
//
// **Nada de acá bloquea el avance** (D17, G3). La única operación que sí se impide es
// cerrar la hoja de vida sin P6, y no contradice a D17: cerrar no es avanzar, es declarar
// que el sistema salió — y declararlo sin haber verificado la salida es afirmar algo que
// nadie comprobó.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import {
  codigoExcepcion,
  puedeCerrarHojaDeVida,
  validarExcepcion,
  validarPuerta,
  type Puerta,
  type ResultadoPuerta,
} from '@/lib/sig/desarrollo';

/// El código del sistema. **G1 · es inmutable y sobrevive al renombre**, y por eso se genera
/// una vez acá y nunca se recalcula desde el nombre.
function codigoSistema(consecutivo: number): string {
  return `SIS-${String(consecutivo).padStart(3, '0')}`;
}

export async function crearSistema(datos: {
  nombre: string;
  descripcion?: string;
  tipo: string;
  productoId?: number;
  clienteRef?: string;
  contratado?: boolean;
  propietarioId?: number;
  responsableTecnicoId?: number;
  activoId?: number;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    if (datos.nombre.trim() === '') return { ok: false, mensaje: 'Falta el nombre.' };
    if (datos.tipo.trim() === '') return { ok: false, mensaje: 'Falta el tipo.' };

    let codigo = '';
    await prisma.$transaction(async (tx) => {
      const ultimo = await tx.sistema.findFirst({
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      codigo = codigoSistema(ultimo === null ? 1 : Number(ultimo.codigo.slice(-3)) + 1);

      const creado = await tx.sistema.create({
        data: {
          codigo,
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion?.trim() || null,
          tipo: datos.tipo.trim(),
          productoId: datos.productoId ?? null,
          clienteRef: datos.clienteRef?.trim() || null,
          contratado: datos.contratado ?? false,
          propietarioId: datos.propietarioId ?? null,
          responsableTecnicoId: datos.responsableTecnicoId ?? null,
          activoId: datos.activoId ?? null,
          abiertaEn: new Date(),
        },
      });
      // Las seis puertas nacen PENDIENTES con el sistema. Crearlas al registrarlas dejaría
      // la ficha sin poder decir «faltan cuatro»: una puerta que no existe y una pendiente
      // se ven igual, y no lo son.
      for (const puerta of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const) {
        await tx.puertaSistema.create({ data: { sistemaId: creado.id, puerta } });
      }
      await registrarAlta(tx, autor, 'sistema', String(creado.id));
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `${codigo} creado con sus seis puertas pendientes.` };
  });
}

/// Registrar el resultado de una puerta. **G3 · `NO_SUPERADA` se acepta sin protestar**:
/// registrar P4 como no superada no impide registrar P5. La aplicación señala y sigue.
export async function registrarPuerta(
  sistemaId: number,
  puerta: Puerta,
  datos: {
    resultado: ResultadoPuerta;
    verificadoPorId?: number;
    autorizaId?: number;
    excepcionId?: number;
    observacion?: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(sistemaId, 'el sistema');

    const errores = validarPuerta({
      resultado: datos.resultado,
      verificadoPorId: datos.verificadoPorId ?? null,
      autorizaId: datos.autorizaId ?? null,
      excepcionId: datos.excepcionId ?? null,
    });
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const fila = await prisma.puertaSistema.findUnique({
      where: { sistemaId_puerta: { sistemaId, puerta } },
      include: { sistema: { select: { codigo: true } } },
    });
    if (!fila) return { ok: false, mensaje: 'La puerta no existe para ese sistema.' };

    await prisma.$transaction(async (tx) => {
      await tx.puertaSistema.update({
        where: { id: fila.id },
        data: {
          resultado: datos.resultado,
          fecha: new Date(),
          verificadoPorId: datos.verificadoPorId ?? null,
          autorizaId: datos.autorizaId ?? null,
          excepcionId: datos.excepcionId ?? null,
          observacion: datos.observacion?.trim() || null,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'puerta_sistema',
          registroId: `${fila.sistema.codigo} · ${puerta}`,
          campo: 'resultado',
          anterior: fila.resultado,
          nuevo: datos.resultado,
          motivo: datos.observacion?.trim() || 'registro de puerta de control',
        },
      ]);
    });

    revalidatePath('/tecnologia/sistemas');
    return {
      ok: true,
      mensaje:
        datos.resultado === 'NO_SUPERADA'
          ? `${puerta} registrada como no superada. Queda señalado y el avance no se impide (D17).`
          : `${puerta} registrada.`,
    };
  });
}

/// G4 · **sin fecha de cierre no se guarda.** Es la regla entera de esta entidad.
export async function crearExcepcion(datos: {
  sistemaId: number;
  puerta?: Puerta;
  justificacion: string;
  evaluacionRiesgo: string;
  fechaAprobacion: Date;
  fechaCierre: Date;
  aprobadaPorId?: number;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(datos.sistemaId, 'el sistema');

    const errores = validarExcepcion({
      justificacion: datos.justificacion,
      evaluacionRiesgo: datos.evaluacionRiesgo,
      fechaAprobacion: datos.fechaAprobacion,
      fechaCierre: datos.fechaCierre,
    });
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const sistema = await prisma.sistema.findUnique({
      where: { id: datos.sistemaId },
      select: { codigo: true },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    const anio = new Date().getUTCFullYear();
    let codigo = '';
    await prisma.$transaction(async (tx) => {
      const ultima = await tx.excepcionSeguridad.findFirst({
        where: { codigo: { startsWith: `EXC-${anio}-` } },
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      codigo = codigoExcepcion(anio, ultima === null ? 1 : Number(ultima.codigo.slice(-3)) + 1);
      const creada = await tx.excepcionSeguridad.create({
        data: {
          codigo,
          sistemaId: datos.sistemaId,
          puerta: datos.puerta ?? null,
          justificacion: datos.justificacion.trim(),
          evaluacionRiesgo: datos.evaluacionRiesgo.trim(),
          fechaAprobacion: datos.fechaAprobacion,
          fechaCierre: datos.fechaCierre,
          aprobadaPorId: datos.aprobadaPorId ?? null,
        },
      });
      await registrarAlta(tx, autor, 'excepcion_seguridad', String(creada.id));
      await registrar(tx, autor, [
        {
          tabla: 'excepcion_seguridad',
          registroId: codigo,
          campo: 'apertura',
          anterior: null,
          nuevo: `${sistema.codigo} · cierra ${datos.fechaCierre.toISOString().slice(0, 10)}`,
          motivo: datos.justificacion.trim(),
        },
      ]);
    });

    revalidatePath('/tecnologia/excepciones');
    return { ok: true, mensaje: `${codigo} abierta, con cierre comprometido.` };
  });
}

/// Cerrar la excepción. **Se puede cerrar tarde**: el hecho es que ya no está abierta, y
/// que se cerró fuera de plazo se ve comparando las dos fechas. Impedir el cierre tardío
/// dejaría la excepción abierta para siempre, que es exactamente lo contrario de lo que se
/// busca.
export async function cerrarExcepcion(codigo: string, nota: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    if (nota.trim().length < 10) {
      return { ok: false, mensaje: 'Decí cómo se resolvió: una excepción cerrada sin nota no explica nada.' };
    }
    const ex = await prisma.excepcionSeguridad.findUnique({ where: { codigo } });
    if (!ex) return { ok: false, mensaje: 'La excepción no existe.' };
    if (ex.cerradaEn !== null) return { ok: false, mensaje: 'Ya está cerrada.' };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.excepcionSeguridad.update({
        where: { id: ex.id },
        data: { cerradaEn: new Date(), cerradaPorId: persona?.id ?? null, notaCierre: nota.trim() },
      });
      await registrar(tx, autor, [
        {
          tabla: 'excepcion_seguridad',
          registroId: codigo,
          campo: 'cierre',
          anterior: null,
          nuevo: new Date().toISOString().slice(0, 10),
          motivo: nota.trim(),
        },
      ]);
    });

    revalidatePath('/tecnologia/excepciones');
    return { ok: true, mensaje: `${codigo} cerrada.` };
  });
}

/// Prorrogar la fecha de cierre. **Exige motivo y queda en bitácora con las dos fechas**:
/// una prórroga silenciosa convierte la excepción en la exención permanente que la fecha de
/// cierre existe para impedir, sólo que a plazos.
export async function prorrogarExcepcion(
  codigo: string,
  nuevaFecha: Date,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    if (motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Una prórroga sin motivo es una exención a plazos.' };
    }
    const ex = await prisma.excepcionSeguridad.findUnique({ where: { codigo } });
    if (!ex) return { ok: false, mensaje: 'La excepción no existe.' };
    if (ex.cerradaEn !== null) return { ok: false, mensaje: 'Está cerrada: no se prorroga.' };
    if (nuevaFecha <= ex.fechaCierre) {
      return { ok: false, mensaje: 'La nueva fecha tiene que ser posterior a la actual.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.excepcionSeguridad.update({ where: { id: ex.id }, data: { fechaCierre: nuevaFecha } });
      await registrar(tx, autor, [
        {
          tabla: 'excepcion_seguridad',
          registroId: codigo,
          campo: 'fecha de cierre',
          anterior: ex.fechaCierre.toISOString().slice(0, 10),
          nuevo: nuevaFecha.toISOString().slice(0, 10),
          motivo: motivo.trim(),
        },
      ]);
    });

    revalidatePath('/tecnologia/excepciones');
    return { ok: true, mensaje: `${codigo} prorrogada, con las dos fechas en bitácora.` };
  });
}

/// G11 · cerrar la hoja de vida. **La única operación que este módulo sí impide.**
export async function cerrarHojaDeVida(sistemaId: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(sistemaId, 'el sistema');
    if (motivo.trim().length < 10) return { ok: false, mensaje: 'Decí por qué se cierra.' };

    const sistema = await prisma.sistema.findUnique({
      where: { id: sistemaId },
      include: { puertas: { select: { puerta: true, resultado: true } } },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };
    if (sistema.cerradaEn !== null) return { ok: false, mensaje: 'Ya está cerrada.' };

    const v = puedeCerrarHojaDeVida(sistema.puertas);
    if (!v.puede) return { ok: false, mensaje: v.motivo };

    await prisma.$transaction(async (tx) => {
      await tx.sistema.update({ where: { id: sistemaId }, data: { cerradaEn: new Date(), faseActual: 'F7' } });
      await registrar(tx, autor, [
        {
          tabla: 'sistema',
          registroId: sistema.codigo,
          campo: 'hoja de vida',
          anterior: 'abierta',
          nuevo: 'cerrada',
          motivo: motivo.trim(),
        },
      ]);
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `Hoja de vida de ${sistema.codigo} cerrada.` };
  });
}

/// El registro de tratamiento de datos personales. **Ley 1581**, el bloque con más
/// exposición legal del paquete.
///
/// Vive en el SISTEMA y no en el activo porque un mismo dato se trata distinto según qué
/// sistema lo use: la cédula en el portal del cliente y la cédula en nómina tienen
/// finalidad, base y retención diferentes.
export async function registrarTratamiento(datos: {
  sistemaId: number;
  categoria: string;
  sensibles: boolean;
  finalidad: string;
  baseLegitimacion: string;
  titulares?: string;
  volumen?: string;
  ubicacionAlmacenamiento?: string;
  transferenciaInternacional: boolean;
  paisDestino?: string;
  garantiaAplicada?: string;
  retencion?: string;
  responsableId?: number;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(datos.sistemaId, 'el sistema');

    if (datos.categoria.trim() === '') return { ok: false, mensaje: 'Falta la categoría de datos.' };
    if (datos.finalidad.trim().length < 10) {
      return { ok: false, mensaje: 'La finalidad es obligatoria: es lo primero que pide un requerimiento.' };
    }
    if (datos.baseLegitimacion.trim() === '') {
      return { ok: false, mensaje: 'Falta la base de legitimación: sin ella el tratamiento no tiene sustento legal.' };
    }
    // **Declarar la transferencia y callar el destino es peor que no declararla.** Es el
    // caso que la Ley 1581 mira con más atención, y por eso los dos campos se exigen juntos
    // al momento de marcar la casilla.
    if (datos.transferenciaInternacional) {
      if ((datos.paisDestino ?? '').trim() === '') {
        return { ok: false, mensaje: 'Con transferencia internacional el país de destino es obligatorio.' };
      }
      if ((datos.garantiaAplicada ?? '').trim() === '') {
        return {
          ok: false,
          mensaje: 'Con transferencia internacional hay que decir con qué garantía se hace.',
        };
      }
    }

    const sistema = await prisma.sistema.findUnique({
      where: { id: datos.sistemaId },
      select: { codigo: true, trataDatosPersonales: true },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    await prisma.$transaction(async (tx) => {
      const creado = await tx.tratamientoDatosPersonales.create({
        data: {
          sistemaId: datos.sistemaId,
          categoria: datos.categoria.trim(),
          sensibles: datos.sensibles,
          finalidad: datos.finalidad.trim(),
          baseLegitimacion: datos.baseLegitimacion.trim(),
          titulares: datos.titulares?.trim() || null,
          volumen: datos.volumen?.trim() || null,
          ubicacionAlmacenamiento: datos.ubicacionAlmacenamiento?.trim() || null,
          transferenciaInternacional: datos.transferenciaInternacional,
          paisDestino: datos.paisDestino?.trim() || null,
          garantiaAplicada: datos.garantiaAplicada?.trim() || null,
          retencion: datos.retencion?.trim() || null,
          responsableId: datos.responsableId ?? null,
        },
      });
      // Registrar un tratamiento IMPLICA que el sistema trata datos personales. Dejar la
      // bandera en false con un registro colgando haría que el sistema no apareciera en la
      // lista de los que hay que revisar — y el registro sería invisible justo donde
      // importa.
      if (!sistema.trataDatosPersonales) {
        await tx.sistema.update({
          where: { id: datos.sistemaId },
          data: { trataDatosPersonales: true },
        });
      }
      await registrarAlta(tx, autor, 'tratamiento_datos_personales', String(creado.id));
      await registrar(tx, autor, [
        {
          tabla: 'tratamiento_datos_personales',
          registroId: `${sistema.codigo} · ${datos.categoria.trim()}`,
          campo: 'alta',
          anterior: null,
          nuevo: datos.transferenciaInternacional
            ? `transferencia a ${datos.paisDestino}`
            : 'sin transferencia internacional',
          motivo: datos.finalidad.trim(),
        },
      ]);
    });

    revalidatePath('/tecnologia/datos-personales');
    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: 'Tratamiento registrado.' };
  });
}
