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
import { registrar, registrarAlta, registrarBaja, type Cambio } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, idOpcional, type Resultado } from '@/app/sgsi/acciones/sesion';
import {
  codigoExcepcion,
  puedeCerrarHojaDeVida,
  validarActualizacionSistema,
  validarExcepcion,
  validarPuerta,
  type DatosActualizacionSistema,
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

/// D7/D8-adjacent: la hoja de vida cita evidencia ya cargada, no sube archivos nuevos acá
/// (eso es la Fase 5, por `multipart`). Lo que hay que impedir es el préstamo entre
/// expedientes: la MISMA fila de `Evidencia` citada por la puerta o la prueba de OTRO
/// sistema. `Evidencia` todavía no tiene columna de sistema propia —eso lo decide la
/// Fase 5 cuando amplíe el `CHECK` de dueño único—, así que el único rastro verificable
/// hoy de «a qué sistema ya quedó enlazada» es buscarla en las dos tablas de la hoja de
/// vida que ya la referencian.
///
/// Devuelve el código del sistema dueño cuando hay choque, o `null` si la evidencia es
/// libre para citarse.
async function sistemaQueYaCitaLaEvidencia(
  evidenciaId: number,
  sistemaId: number,
): Promise<string | null> {
  const [otraPuerta, otraPrueba] = await Promise.all([
    prisma.puertaSistema.findFirst({
      where: { evidenciaId, sistemaId: { not: sistemaId } },
      include: { sistema: { select: { codigo: true } } },
    }),
    prisma.pruebaSeguridad.findFirst({
      where: { evidenciaId, sistemaId: { not: sistemaId } },
      include: { sistema: { select: { codigo: true } } },
    }),
  ]);
  return (otraPuerta ?? otraPrueba)?.sistema.codigo ?? null;
}

/// Registrar el resultado de una puerta. **G3 · `NO_SUPERADA` se acepta sin protestar**:
/// registrar P4 como no superada no impide registrar P5. La aplicación señala y sigue.
///
/// `evidenciaId` deja de ser columna muerta: existe en el schema desde la migración de
/// septiembre (`20260904090000_gestion_tecnologica`) y hasta acá ningún código la escribía.
export async function registrarPuerta(
  sistemaId: number,
  puerta: Puerta,
  datos: {
    resultado: ResultadoPuerta;
    verificadoPorId?: number;
    autorizaId?: number;
    excepcionId?: number;
    evidenciaId?: number;
    observacion?: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(sistemaId, 'el sistema');
    const evidenciaId = idOpcional(datos.evidenciaId, 'la evidencia');

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

    if (evidenciaId !== undefined) {
      const evidencia = await prisma.evidencia.findUnique({ where: { id: evidenciaId } });
      if (!evidencia) return { ok: false, mensaje: 'La evidencia citada no existe.' };

      const otroSistema = await sistemaQueYaCitaLaEvidencia(evidenciaId, sistemaId);
      if (otroSistema !== null) {
        return {
          ok: false,
          mensaje: `La evidencia ya está citada por ${otroSistema}: un soporte prestado entre expedientes invalida los dos.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.puertaSistema.update({
        where: { id: fila.id },
        data: {
          resultado: datos.resultado,
          fecha: new Date(),
          verificadoPorId: datos.verificadoPorId ?? null,
          autorizaId: datos.autorizaId ?? null,
          excepcionId: datos.excepcionId ?? null,
          evidenciaId: evidenciaId ?? null,
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

/// La primera acción de actualización de la hoja de vida (D1/D2 de la propuesta). Hasta
/// acá sólo existía `crearSistema`: criticidad, clasificación, RTO, RPO y rol de
/// tratamiento quedaban huérfanos apenas se creaba el sistema porque no había forma de
/// cerrarlos desde ninguna pantalla.
///
/// Sólo guarda los campos presentes en `datos` — `undefined` es «no tocar», igual que
/// `guardarDatosGenerales` en activos. `null` SÍ es un valor: borra el dato.
export async function actualizarSistema(
  sistemaId: number,
  datos: DatosActualizacionSistema,
  motivo?: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(sistemaId, 'el sistema');

    const escala = await prisma.escalaValor.findMany({ select: { valor: true } });
    const errores = validarActualizacionSistema(
      datos,
      escala.map((e) => e.valor),
    );
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const sistema = await prisma.sistema.findUnique({ where: { id: sistemaId } });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    const campos = [
      'criticidad',
      'clasificacionId',
      'rtoObjetivo',
      'rpoObjetivo',
      'rolTratamiento',
    ] as const;
    const aGuardar = Object.fromEntries(
      campos.filter((c) => datos[c] !== undefined).map((c) => [c, datos[c]]),
    );

    const total = await prisma.$transaction(async (tx) => {
      if (Object.keys(aGuardar).length === 0) return 0;

      const cambios: Cambio[] = campos
        .filter((c) => datos[c] !== undefined)
        .map((c) => ({
          tabla: 'sistema',
          registroId: sistema.codigo,
          campo: c,
          anterior: sistema[c],
          nuevo: datos[c],
          motivo: motivo?.trim() || null,
        }));

      await tx.sistema.update({ where: { id: sistemaId }, data: aGuardar });
      return registrar(tx, autor, cambios);
    });

    revalidatePath('/tecnologia/sistemas');
    return {
      ok: true,
      mensaje: total === 0 ? 'No había cambios que guardar.' : `Se guardaron ${total} campo(s) de la hoja de vida.`,
      cambios: total,
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
///
/// **`codigo` es obligatorio desde D6**: sin clave natural no hay `PUT` idempotente de la
/// API de servicio, y aceptar un alta sin código dejaría al cliente adivinando cuál
/// colección se puede reintentar y cuál no.
export async function registrarTratamiento(datos: {
  sistemaId: number;
  codigo: string;
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

    if (datos.codigo.trim() === '') return { ok: false, mensaje: 'Falta el código del tratamiento.' };
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

    const codigo = datos.codigo.trim();
    const existente = await prisma.tratamientoDatosPersonales.findUnique({
      where: { sistemaId_codigo: { sistemaId: datos.sistemaId, codigo } },
    });
    if (existente) {
      return { ok: false, mensaje: `Ya existe un tratamiento ${codigo} en ${sistema.codigo}.` };
    }

    await prisma.$transaction(async (tx) => {
      const creado = await tx.tratamientoDatosPersonales.create({
        data: {
          sistemaId: datos.sistemaId,
          codigo,
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
          registroId: `${sistema.codigo} · ${codigo}`,
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

// ─── Requisitos de seguridad ────────────────────────────────────────────────────────────
//
// Hasta esta propuesta, `RequisitoSeguridad` no tenía NINGÚN camino de carga: ni pantalla,
// ni semilla, ni script. Era una tabla que el schema declaraba y que nadie podía llenar.

/// Alta de un requisito de seguridad. `codigo` es único por sistema
/// (`@@unique([sistemaId, codigo])`), así que se verifica antes de crear en vez de dejar
/// que el error crudo de Postgres llegue a la pantalla.
export async function crearRequisito(datos: {
  sistemaId: number;
  codigo: string;
  categoria: string;
  texto: string;
  origen?: string;
  prioridad?: string;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(datos.sistemaId, 'el sistema');

    const codigo = datos.codigo.trim();
    if (codigo === '') return { ok: false, mensaje: 'Falta el código del requisito.' };
    if (datos.categoria.trim() === '') return { ok: false, mensaje: 'Falta la categoría del requisito.' };
    if (datos.texto.trim() === '') return { ok: false, mensaje: 'Falta el texto del requisito.' };

    const sistema = await prisma.sistema.findUnique({
      where: { id: datos.sistemaId },
      select: { codigo: true },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    const existente = await prisma.requisitoSeguridad.findUnique({
      where: { sistemaId_codigo: { sistemaId: datos.sistemaId, codigo } },
    });
    if (existente) {
      return { ok: false, mensaje: `Ya existe un requisito ${codigo} en ${sistema.codigo}.` };
    }

    await prisma.$transaction(async (tx) => {
      const creado = await tx.requisitoSeguridad.create({
        data: {
          sistemaId: datos.sistemaId,
          codigo,
          categoria: datos.categoria.trim(),
          texto: datos.texto.trim(),
          origen: datos.origen?.trim() || null,
          prioridad: datos.prioridad?.trim() || null,
        },
      });
      await registrarAlta(tx, autor, 'requisito_seguridad', `${sistema.codigo} · ${codigo}`);
      await registrar(tx, autor, [
        {
          tabla: 'requisito_seguridad',
          registroId: `${sistema.codigo} · ${codigo}`,
          campo: 'alta',
          anterior: null,
          nuevo: datos.categoria.trim(),
        },
      ]);
      return creado;
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `Requisito ${codigo} registrado.` };
  });
}

/// Editar un requisito ya existente. Sólo guarda los campos presentes, igual criterio que
/// `actualizarSistema`.
export async function editarRequisito(
  sistemaId: number,
  codigo: string,
  datos: {
    categoria?: string;
    texto?: string;
    origen?: string;
    prioridad?: string;
    estado?: string;
    observacion?: string;
  },
  motivo?: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(sistemaId, 'el sistema');

    const fila = await prisma.requisitoSeguridad.findUnique({
      where: { sistemaId_codigo: { sistemaId, codigo } },
      include: { sistema: { select: { codigo: true } } },
    });
    if (!fila) return { ok: false, mensaje: `El requisito ${codigo} no existe en ese sistema.` };

    const campos = ['categoria', 'texto', 'origen', 'prioridad', 'estado', 'observacion'] as const;
    const aGuardar = Object.fromEntries(
      campos.filter((c) => datos[c] !== undefined).map((c) => [c, datos[c]?.trim() || null]),
    );

    const total = await prisma.$transaction(async (tx) => {
      if (Object.keys(aGuardar).length === 0) return 0;
      const cambios: Cambio[] = campos
        .filter((c) => datos[c] !== undefined)
        .map((c) => ({
          tabla: 'requisito_seguridad',
          registroId: `${fila.sistema.codigo} · ${codigo}`,
          campo: c,
          anterior: fila[c],
          nuevo: datos[c],
          motivo: motivo?.trim() || null,
        }));
      await tx.requisitoSeguridad.update({ where: { id: fila.id }, data: aGuardar });
      return registrar(tx, autor, cambios);
    });

    revalidatePath('/tecnologia/sistemas');
    return {
      ok: true,
      mensaje: total === 0 ? 'No había cambios que guardar.' : `Se guardaron ${total} campo(s) del requisito.`,
      cambios: total,
    };
  });
}

/// Baja lógica. `RequisitoSeguridad` no tiene columna `activo` (a diferencia de `Activo`):
/// la baja se expresa en el propio `estado`, que ya es una columna de texto libre con
/// `PROPUESTO` como valor de carga. Nunca se borra físicamente.
export async function darDeBajaRequisito(
  sistemaId: number,
  codigo: string,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(sistemaId, 'el sistema');
    if (motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Decí por qué se da de baja: una baja sin motivo no explica nada.' };
    }

    const fila = await prisma.requisitoSeguridad.findUnique({
      where: { sistemaId_codigo: { sistemaId, codigo } },
      include: { sistema: { select: { codigo: true } } },
    });
    if (!fila) return { ok: false, mensaje: `El requisito ${codigo} no existe en ese sistema.` };

    await prisma.$transaction(async (tx) => {
      await tx.requisitoSeguridad.update({ where: { id: fila.id }, data: { estado: 'RETIRADO' } });
      await registrarBaja(tx, autor, 'requisito_seguridad', `${fila.sistema.codigo} · ${codigo}`, motivo.trim());
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `Requisito ${codigo} dado de baja.` };
  });
}

// ─── Pruebas de seguridad ───────────────────────────────────────────────────────────────
//
// G6 · los cuatro conteos por severidad se CAPTURAN acá. El veredicto de si bloquea se
// CALCULA en lectura con `veredictoDePrueba`, contra el parámetro vigente y la excepción
// abierta — guardarlo quedaría viejo el día que la organización endurezca el umbral.

export async function crearPrueba(datos: {
  sistemaId: number;
  codigo: string;
  tipo: string;
  versionProbada?: string;
  fecha: Date;
  ejecutorId?: number;
  ejecutorExterno?: string;
  criticos?: number;
  altos?: number;
  medios?: number;
  bajos?: number;
  evidenciaId?: number;
  observacion?: string;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(datos.sistemaId, 'el sistema');
    const evidenciaId = idOpcional(datos.evidenciaId, 'la evidencia');

    const codigo = datos.codigo.trim();
    if (codigo === '') return { ok: false, mensaje: 'Falta el código de la prueba.' };
    if (datos.tipo.trim() === '') return { ok: false, mensaje: 'Falta el tipo de prueba.' };

    const conteos = {
      criticos: datos.criticos ?? 0,
      altos: datos.altos ?? 0,
      medios: datos.medios ?? 0,
      bajos: datos.bajos ?? 0,
    };
    for (const [nombre, valor] of Object.entries(conteos)) {
      if (valor < 0) {
        return { ok: false, mensaje: `El conteo de ${nombre} no puede ser negativo.` };
      }
    }

    const sistema = await prisma.sistema.findUnique({
      where: { id: datos.sistemaId },
      select: { codigo: true },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    const existente = await prisma.pruebaSeguridad.findFirst({
      where: { sistemaId: datos.sistemaId, codigo },
    });
    if (existente) return { ok: false, mensaje: `Ya existe una prueba ${codigo} en ${sistema.codigo}.` };

    if (evidenciaId !== undefined) {
      const evidencia = await prisma.evidencia.findUnique({ where: { id: evidenciaId } });
      if (!evidencia) return { ok: false, mensaje: 'La evidencia citada no existe.' };
      const otroSistema = await sistemaQueYaCitaLaEvidencia(evidenciaId, datos.sistemaId);
      if (otroSistema !== null) {
        return {
          ok: false,
          mensaje: `La evidencia ya está citada por ${otroSistema}: un soporte prestado entre expedientes invalida los dos.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      const creada = await tx.pruebaSeguridad.create({
        data: {
          sistemaId: datos.sistemaId,
          codigo,
          tipo: datos.tipo.trim(),
          versionProbada: datos.versionProbada?.trim() || null,
          fecha: datos.fecha,
          ejecutorId: datos.ejecutorId ?? null,
          ejecutorExterno: datos.ejecutorExterno?.trim() || null,
          criticos: conteos.criticos,
          altos: conteos.altos,
          medios: conteos.medios,
          bajos: conteos.bajos,
          evidenciaId: evidenciaId ?? null,
          observacion: datos.observacion?.trim() || null,
        },
      });
      await registrarAlta(tx, autor, 'prueba_seguridad', `${sistema.codigo} · ${codigo}`);
      await registrar(tx, autor, [
        {
          tabla: 'prueba_seguridad',
          registroId: `${sistema.codigo} · ${codigo}`,
          campo: 'alta',
          anterior: null,
          nuevo: `${conteos.criticos}c/${conteos.altos}a/${conteos.medios}m/${conteos.bajos}b`,
        },
      ]);
      return creada;
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `Prueba ${codigo} registrada.` };
  });
}

// ─── Liberaciones ───────────────────────────────────────────────────────────────────────
//
// **Ojo con el nombre.** `Liberacion` es QUÉ se liberó; DÓNDE corre es `Despliegue`
// (REQ-SIG-06), que ya tiene su propia acción en `app/sig/acciones/despliegues.ts`.

export async function crearLiberacion(datos: {
  sistemaId: number;
  version: string;
  fecha: Date;
  tipo: string;
  solicitudId?: number;
  autorizaId?: number;
  ejecutaId?: number;
  planReversion?: boolean;
  resultado?: string;
  observacion?: string;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(datos.sistemaId, 'el sistema');

    const version = datos.version.trim();
    if (version === '') return { ok: false, mensaje: 'Falta la versión liberada.' };
    if (datos.tipo.trim() === '') return { ok: false, mensaje: 'Falta el tipo de liberación.' };

    const sistema = await prisma.sistema.findUnique({
      where: { id: datos.sistemaId },
      select: { codigo: true },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    const existente = await prisma.liberacion.findUnique({
      where: { sistemaId_version: { sistemaId: datos.sistemaId, version } },
    });
    if (existente) {
      return { ok: false, mensaje: `Ya existe una liberación ${version} en ${sistema.codigo}.` };
    }

    await prisma.$transaction(async (tx) => {
      const creada = await tx.liberacion.create({
        data: {
          sistemaId: datos.sistemaId,
          version,
          fecha: datos.fecha,
          tipo: datos.tipo.trim(),
          solicitudId: datos.solicitudId ?? null,
          autorizaId: datos.autorizaId ?? null,
          ejecutaId: datos.ejecutaId ?? null,
          planReversion: datos.planReversion ?? false,
          resultado: datos.resultado?.trim() || null,
          observacion: datos.observacion?.trim() || null,
        },
      });
      await registrarAlta(tx, autor, 'liberacion', `${sistema.codigo} · ${version}`);
      await registrar(tx, autor, [
        {
          tabla: 'liberacion',
          registroId: `${sistema.codigo} · ${version}`,
          campo: 'alta',
          anterior: null,
          nuevo: datos.tipo.trim(),
        },
      ]);
      return creada;
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `Liberación ${version} registrada.` };
  });
}

// ─── Componentes de terceros (SBOM) ─────────────────────────────────────────────────────
//
// El item 23 de PTR-TEC-03 exige revisar la licencia por compatibilidad; la parte de
// «proveedor» ya la resolvió D4.

export async function crearComponente(datos: {
  sistemaId: number;
  codigo: string;
  nombre: string;
  organizacionId?: number;
  tipo?: string;
  funcion?: string;
  criticidad?: string;
  licencia?: string;
  version?: string;
  ultimaEvaluacion?: Date;
  vulnerabilidadesConocidas?: string;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(datos.sistemaId, 'el sistema');

    const codigo = datos.codigo.trim();
    if (codigo === '') return { ok: false, mensaje: 'Falta el código del componente.' };
    if (datos.nombre.trim() === '') return { ok: false, mensaje: 'Falta el nombre del componente.' };

    const sistema = await prisma.sistema.findUnique({
      where: { id: datos.sistemaId },
      select: { codigo: true },
    });
    if (!sistema) return { ok: false, mensaje: 'El sistema no existe.' };

    const existente = await prisma.componenteTercero.findUnique({
      where: { sistemaId_codigo: { sistemaId: datos.sistemaId, codigo } },
    });
    if (existente) {
      return { ok: false, mensaje: `Ya existe un componente ${codigo} en ${sistema.codigo}.` };
    }

    await prisma.$transaction(async (tx) => {
      const creado = await tx.componenteTercero.create({
        data: {
          sistemaId: datos.sistemaId,
          codigo,
          nombre: datos.nombre.trim(),
          organizacionId: datos.organizacionId ?? null,
          tipo: datos.tipo?.trim() || null,
          funcion: datos.funcion?.trim() || null,
          criticidad: datos.criticidad?.trim() || null,
          licencia: datos.licencia?.trim() || null,
          version: datos.version?.trim() || null,
          ultimaEvaluacion: datos.ultimaEvaluacion ?? null,
          vulnerabilidadesConocidas: datos.vulnerabilidadesConocidas?.trim() || null,
        },
      });
      await registrarAlta(tx, autor, 'componente_tercero', `${sistema.codigo} · ${codigo}`);
      await registrar(tx, autor, [
        {
          tabla: 'componente_tercero',
          registroId: `${sistema.codigo} · ${codigo}`,
          campo: 'alta',
          anterior: null,
          nuevo: datos.nombre.trim(),
        },
      ]);
      return creado;
    });

    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: `Componente ${codigo} registrado.` };
  });
}
