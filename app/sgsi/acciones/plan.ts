'use server';

// app/sgsi/acciones/plan.ts
//
// The treatment plan. One row per improvement to a CONTROL, never per risk: raising a
// control's maturity lowers every risk that control mitigates at once, so modelling the
// decision per risk would duplicate it hundreds of times.
//
// The conditional rules of ISO/IEC 27001:2022 clause 6.1.3 live HERE and not only in the
// popup. A server action is reachable by anyone who can form the request, so a rule
// enforced only by a disabled button is a rule that is not enforced: an acceptance with
// no review date, or a closure with the verification still pending, would be stored the
// first time somebody replays the form.
//
// WHAT IS DELIBERATELY NOT REQUIRED ON CLOSURE
//
// The specification asks for `madurezAlcanzada` when an action closes. Its own seed data
// contradicts it: the seven closed ACEPTAR rows (PT-019 … PT-025) carry
// verificacion = NO_APLICA and no maturity reached, because a non-applicability
// acceptance never moves a control's level. Rejecting the data the organisation actually
// shipped would be the wrong reading of the rule, so closure does not demand it.
//
// Nothing here is ever physically deleted, and every baja carries a mandatory reason.

import { revalidatePath } from 'next/cache';
import type { EstadoAccion, TipoAccion, VerificacionEficacia } from '@prisma/client';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja, type Cambio } from '@/lib/sgsi/bitacora';
import { elegirControlParaPlan, fechaObjetivoPlan, type ControlParaPlan } from '@/lib/sgsi/deuda-planes';
import {
  formatearOrigen,
  narrativaOrigenPlan,
  origenCubreRiesgo,
  parsearOrigen,
} from '@/lib/sgsi/origen-plan';
import { clasificar } from '@/lib/sgsi/clasificar';
import { evaluarBrecha, type EstadoBrecha } from '@/lib/sgsi/exigencia';
import { agruparAmenazasEnPlanes, ordenarAmenazasPorResidual } from '@/lib/sgsi/planes-por-amenaza';
import { autorConPermiso, ejecutar, exigirId, idOpcional, type Resultado } from './sesion';

/// A `Resultado` that can also carry the code of the action involved, so the `+` button
/// on Controles can navigate to the action it found instead of creating a second one.
export interface ResultadoAccion extends Resultado {
  codigo?: string;
}

/// The full edit from the action popup. Every field is optional: an omitted key keeps
/// the stored value, so a partial save never blanks what the form did not show. Dates
/// arrive as `AAAA-MM-DD`, the shape an `<input type="date">` produces.
export interface DatosAccion {
  accion?: string;
  tipo?: TipoAccion;
  controlId?: number | null;
  origen?: string;
  responsableId?: number;
  apruebaId?: number;
  fechaObjetivo?: string | null;
  recursos?: string | null;
  estado?: EstadoAccion;
  avance?: number;
  verificacion?: VerificacionEficacia;
  observacion?: string | null;
  madurezAlcanzadaId?: number | null;
  /// Required when tipo is TRANSFERIR.
  instrumento?: string | null;
  /// Required when tipo is TRANSFERIR: transferring never moves the whole risk.
  riesgoRemanente?: string | null;
  /// Required when tipo is ACEPTAR.
  justificacionAceptacion?: string | null;
  /// Required when tipo is ACEPTAR: an acceptance with no expiry is a decision nobody
  /// ever revisits.
  fechaRevisionAceptacion?: string | null;
}

/// Saves the action popup. Validation runs over the MERGED row — stored values plus the
/// patch — so a partial edit is checked against what the action will actually be, not
/// against the fragment that arrived.
export async function guardarAccion(
  codigo: string,
  datos: DatosAccion,
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    idOpcional(datos.controlId, 'el control');
    idOpcional(datos.responsableId, 'el responsable');
    idOpcional(datos.apruebaId, 'quien aprueba');
    idOpcional(datos.madurezAlcanzadaId, 'la madurez alcanzada');

    const accion = await prisma.accionPlan.findUnique({
      where: { codigo },
      include: {
        control: true,
        responsable: true,
        aprueba: true,
        madurezAlcanzada: true,
      },
    });
    if (!accion) return { ok: false, mensaje: `No existe la acción ${codigo}.` };

    const errores: string[] = [];

    const fechaObjetivo = comoFecha(datos.fechaObjetivo, 'La fecha objetivo', errores);
    const fechaRevision = comoFecha(
      datos.fechaRevisionAceptacion,
      'La fecha de revisión de la aceptación',
      errores,
    );

    // The row as it will stand after the save.
    const final = {
      accion: datos.accion !== undefined ? (normalizar(datos.accion) ?? '') : accion.accion,
      tipo: datos.tipo ?? accion.tipo,
      controlId: datos.controlId !== undefined ? datos.controlId : accion.controlId,
      origen: datos.origen !== undefined ? (normalizar(datos.origen) ?? '') : accion.origen,
      responsableId: datos.responsableId ?? accion.responsableId,
      apruebaId: datos.apruebaId ?? accion.apruebaId,
      fechaObjetivo: fechaObjetivo !== undefined ? fechaObjetivo : accion.fechaObjetivo,
      recursos:
        datos.recursos !== undefined ? normalizar(datos.recursos) : accion.recursos,
      estado: datos.estado ?? accion.estado,
      avance: datos.avance ?? accion.avance,
      verificacion: datos.verificacion ?? accion.verificacion,
      observacion:
        datos.observacion !== undefined ? normalizar(datos.observacion) : accion.observacion,
      madurezAlcanzadaId:
        datos.madurezAlcanzadaId !== undefined
          ? datos.madurezAlcanzadaId
          : accion.madurezAlcanzadaId,
      instrumento:
        datos.instrumento !== undefined ? normalizar(datos.instrumento) : accion.instrumento,
      riesgoRemanente:
        datos.riesgoRemanente !== undefined
          ? normalizar(datos.riesgoRemanente)
          : accion.riesgoRemanente,
      justificacionAceptacion:
        datos.justificacionAceptacion !== undefined
          ? normalizar(datos.justificacionAceptacion)
          : accion.justificacionAceptacion,
      fechaRevisionAceptacion:
        fechaRevision !== undefined ? fechaRevision : accion.fechaRevisionAceptacion,
    };

    if (final.accion === '') errores.push('La acción necesita una descripción.');
    if (final.origen === '') {
      errores.push('El origen necesita texto: es la justificación 6.1.3 de por qué existe la acción.');
    }
    if (!Number.isInteger(final.avance) || final.avance < 0 || final.avance > 100) {
      errores.push('El avance va de 0 a 100.');
    }

    // ISO/IEC 27001:2022 6.1.3 — the conditional blocks. Each type of decision carries
    // its own evidence, and the type without its evidence is not a decision.
    if (final.tipo === 'MITIGAR' && final.controlId === null) {
      errores.push('Una acción de mitigación necesita el control que mejora.');
    }
    if (final.tipo === 'ACEPTAR') {
      if (final.justificacionAceptacion === null) {
        errores.push('Aceptar un riesgo necesita la justificación de la aceptación.');
      }
      if (final.fechaRevisionAceptacion === null) {
        errores.push(
          'Aceptar un riesgo necesita fecha de revisión: una aceptación sin vencimiento es una que nadie vuelve a mirar.',
        );
      }
    }
    if (final.tipo === 'TRANSFERIR') {
      if (final.instrumento === null) {
        errores.push('Transferir necesita el instrumento (póliza, contrato o cláusula).');
      }
      if (final.riesgoRemanente === null) {
        errores.push('Transferir necesita el riesgo remanente: transferir nunca mueve el riesgo completo.');
      }
    }
    if (final.estado === 'CERRADA' && final.verificacion === 'PENDIENTE') {
      errores.push(
        'No se puede cerrar con la verificación de eficacia pendiente: registrá el resultado de la verificación, o «No aplica» si no corresponde.',
      );
    }

    // Foreign keys are checked here so a bad id becomes a message and not a constraint
    // violation the user cannot read.
    // Each one resolves to the row the field will POINT AT after the save. A cleared
    // field resolves to null rather than reusing what was there, so the trail records
    // the clearing instead of skipping it as a no-op.
    const [control, responsable, aprueba, madurez] = await Promise.all([
      final.controlId === null
        ? Promise.resolve(null)
        : final.controlId === accion.controlId
          ? Promise.resolve(accion.control)
          : prisma.control.findUnique({ where: { id: final.controlId } }),
      final.responsableId === accion.responsableId
        ? Promise.resolve(accion.responsable)
        : prisma.cargoResponsable.findUnique({ where: { id: final.responsableId } }),
      final.apruebaId === accion.apruebaId
        ? Promise.resolve(accion.aprueba)
        : prisma.cargoResponsable.findUnique({ where: { id: final.apruebaId } }),
      final.madurezAlcanzadaId === null
        ? Promise.resolve(null)
        : final.madurezAlcanzadaId === accion.madurezAlcanzadaId
          ? Promise.resolve(accion.madurezAlcanzada)
          : prisma.escalaMadurez.findUnique({ where: { id: final.madurezAlcanzadaId } }),
    ]);

    if (final.controlId !== null && !control) errores.push('El control asociado no existe.');
    if (!responsable) errores.push('El responsable no está en la lista de cargos.');
    if (!aprueba) errores.push('Quien aprueba no está en la lista de cargos.');
    if (final.madurezAlcanzadaId !== null && !madurez) {
      errores.push('El nivel de madurez alcanzado no está en la escala.');
    }

    if (errores.length > 0) return { ok: false, mensaje: errores.join(' ') };

    const razon = normalizar(motivo);

    const escritos = await prisma.$transaction(async (tx) => {
      const entradas: Cambio[] = [];
      const anotar = (campo: string, anterior: unknown, nuevo: unknown): void => {
        entradas.push({ tabla: 'accion_plan', registroId: codigo, campo, anterior, nuevo, motivo: razon });
      };

      if (datos.accion !== undefined) anotar('acción', accion.accion, final.accion);
      if (datos.tipo !== undefined) anotar('tipo', accion.tipo, final.tipo);
      if (datos.controlId !== undefined) {
        anotar('control asociado', accion.control?.codigo ?? null, control?.codigo ?? null);
      }
      if (datos.origen !== undefined) anotar('origen', accion.origen, final.origen);
      if (datos.responsableId !== undefined) {
        anotar('responsable', accion.responsable.nombre, responsable?.nombre ?? null);
      }
      if (datos.apruebaId !== undefined) {
        anotar('aprueba', accion.aprueba.nombre, aprueba?.nombre ?? null);
      }
      if (fechaObjetivo !== undefined) {
        anotar('fecha objetivo', comoTexto(accion.fechaObjetivo), comoTexto(final.fechaObjetivo));
      }
      if (datos.recursos !== undefined) anotar('recursos', accion.recursos, final.recursos);
      if (datos.estado !== undefined) anotar('estado', accion.estado, final.estado);
      if (datos.avance !== undefined) anotar('avance', accion.avance, final.avance);
      if (datos.verificacion !== undefined) {
        anotar('verificación de eficacia', accion.verificacion, final.verificacion);
      }
      if (datos.observacion !== undefined) {
        anotar('observaciones', accion.observacion, final.observacion);
      }
      if (datos.madurezAlcanzadaId !== undefined) {
        anotar(
          'madurez alcanzada',
          accion.madurezAlcanzada ? `L${accion.madurezAlcanzada.nivel}` : null,
          madurez ? `L${madurez.nivel}` : null,
        );
      }
      if (datos.instrumento !== undefined) {
        anotar('instrumento de transferencia', accion.instrumento, final.instrumento);
      }
      if (datos.riesgoRemanente !== undefined) {
        anotar('riesgo remanente', accion.riesgoRemanente, final.riesgoRemanente);
      }
      if (datos.justificacionAceptacion !== undefined) {
        anotar(
          'justificación de la aceptación',
          accion.justificacionAceptacion,
          final.justificacionAceptacion,
        );
      }
      if (fechaRevision !== undefined) {
        anotar(
          'fecha de revisión de la aceptación',
          comoTexto(accion.fechaRevisionAceptacion),
          comoTexto(final.fechaRevisionAceptacion),
        );
      }

      const total = await registrar(tx, autor, entradas);

      await tx.accionPlan.update({
        where: { id: accion.id },
        data: {
          ...(datos.accion !== undefined ? { accion: final.accion } : {}),
          ...(datos.tipo !== undefined ? { tipo: final.tipo } : {}),
          ...(datos.controlId !== undefined ? { controlId: final.controlId } : {}),
          ...(datos.origen !== undefined ? { origen: final.origen } : {}),
          ...(datos.responsableId !== undefined ? { responsableId: final.responsableId } : {}),
          ...(datos.apruebaId !== undefined ? { apruebaId: final.apruebaId } : {}),
          ...(fechaObjetivo !== undefined ? { fechaObjetivo } : {}),
          ...(datos.recursos !== undefined ? { recursos: final.recursos } : {}),
          ...(datos.estado !== undefined ? { estado: final.estado } : {}),
          ...(datos.avance !== undefined ? { avance: final.avance } : {}),
          ...(datos.verificacion !== undefined ? { verificacion: final.verificacion } : {}),
          ...(datos.observacion !== undefined ? { observacion: final.observacion } : {}),
          ...(datos.madurezAlcanzadaId !== undefined
            ? { madurezAlcanzadaId: final.madurezAlcanzadaId }
            : {}),
          ...(datos.instrumento !== undefined ? { instrumento: final.instrumento } : {}),
          ...(datos.riesgoRemanente !== undefined
            ? { riesgoRemanente: final.riesgoRemanente }
            : {}),
          ...(datos.justificacionAceptacion !== undefined
            ? { justificacionAceptacion: final.justificacionAceptacion }
            : {}),
          ...(fechaRevision !== undefined ? { fechaRevisionAceptacion: fechaRevision } : {}),
          // A closed action carries the date it closed; reopening it clears the date
          // rather than leaving a closure that never happened on the record.
          ...(datos.estado !== undefined && final.estado !== accion.estado
            ? { fechaCierre: final.estado === 'CERRADA' ? hoy() : null }
            : {}),
        },
      });

      return total;
    });

    revalidarPlan();

    return {
      ok: true,
      mensaje:
        escritos === 0
          ? 'No había cambios que guardar.'
          : `Se guardaron ${escritos} campos de ${codigo}.`,
      cambios: escritos,
    };
  });
}

/// The `+` button on Controles y madurez.
///
/// One action per control: a second one on the same control would split the same
/// decision in two and double the maturity gap it reports. So when an action already
/// exists this returns its code and the screen navigates to it, exactly as the prototype
/// does, instead of creating a duplicate.
export async function crearAccionDesdeControl(codigoControl: string): Promise<ResultadoAccion> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: { actual: true, objetivo: true, responsable: true },
    });
    if (!control) return { ok: false, mensaje: `No existe el control ${codigoControl}.` };
    if (control.soa === 'NO') {
      return {
        ok: false,
        mensaje: `El control ${codigoControl} no aplica, así que no lleva acción de mejora.`,
      };
    }

    const existente = await prisma.accionPlan.findFirst({
      where: { controlId: control.id, activa: true },
      orderBy: { codigo: 'asc' },
    });
    if (existente) {
      return {
        ok: true,
        mensaje: `${codigoControl} ya está en el plan como ${existente.codigo}.`,
        codigo: existente.codigo,
        cambios: 0,
      };
    }

    // The plan's roles are a closed list; this action does not extend it. "Por asignar"
    // is the placeholder the catalogue already ships for exactly this case.
    const [porAsignar, lider] = await Promise.all([
      prisma.cargoResponsable.findUnique({ where: { nombre: 'Por asignar' } }),
      prisma.cargoResponsable.findUnique({ where: { nombre: 'Líder del SIG' } }),
    ]);
    const responsableId = control.responsableId ?? porAsignar?.id ?? lider?.id ?? null;
    const apruebaId = lider?.id ?? porAsignar?.id ?? null;
    if (responsableId === null || apruebaId === null) {
      return {
        ok: false,
        mensaje:
          'Faltan los cargos «Por asignar» y «Líder del SIG» en el catálogo de responsables: la acción no puede quedar sin responsable ni sin quien la apruebe.',
      };
    }

    const actual = control.actual?.nivel ?? null;
    const objetivo = control.objetivo?.nivel ?? null;
    const destino = objetivo ?? (actual === null ? 1 : Math.min(actual + 1, 5));

    const creado = await prisma.$transaction(async (tx) => {
      // The code is generated inside the transaction and never reused: PT numbers keep
      // counting past the actions that were given de baja.
      const codigos = await tx.accionPlan.findMany({ select: { codigo: true } });
      const ultimo = codigos.reduce((mayor, a) => {
        const n = /^PT-(\d+)$/.exec(a.codigo);
        return n ? Math.max(mayor, Number(n[1])) : mayor;
      }, 0);
      const codigo = `PT-${String(ultimo + 1).padStart(3, '0')}`;

      await tx.accionPlan.create({
        data: {
          codigo,
          accion: `Elevar ${control.nombre} de ${nivel(actual)} a L${destino}`,
          tipo: 'MITIGAR',
          controlId: control.id,
          // The rationale is written here rather than left to the user: an action added
          // from Controles exists because of a gap, and the gap is what 6.1.3 asks for.
          origen: `Agregada desde Controles y madurez. El control está en ${nivel(actual)} con objetivo ${nivel(objetivo)}.`,
          responsableId,
          apruebaId,
          fechaObjetivo: control.fechaObjetivo,
          madurezObjetivoId: control.objetivoId,
          estado: 'NO_INICIADA',
          avance: 0,
          verificacion: 'PENDIENTE',
        },
      });

      await registrarAlta(tx, autor, 'accion_plan', codigo);
      await registrar(tx, autor, [
        {
          tabla: 'accion_plan',
          registroId: codigo,
          campo: 'control asociado',
          anterior: null,
          nuevo: control.codigo,
          motivo: `Agregada desde Controles y madurez: ${nivel(actual)} con objetivo ${nivel(objetivo)}.`,
        },
      ]);

      return codigo;
    });

    revalidarPlan();

    return {
      ok: true,
      mensaje: `Se creó ${creado} para ${codigoControl}. Falta asignar responsable y fecha.`,
      codigo: creado,
      cambios: 1,
    };
  });
}

// ============================================================================
// REQ-SIG-20 §7.2 (D-4, D4) · el popup de residual crítico (tarea 4.12)
//
// El plan que nace acá sigue siendo sobre el CONTROL — no se crea ninguna tabla ni lista
// paralela por activo o por riesgo (tarea 4.19). `origen` guarda de qué activo y qué
// amenaza nació, con el prefijo verificable de `lib/sgsi/origen-plan.ts`, para que
// `lib/sgsi/deuda-planes.ts` pueda decidir después si un riesgo ya tiene plan.
// ============================================================================

export interface PrefillPlanCritico {
  riesgoCodigo: string;
  activoCodigo: string;
  activoNombre: string;
  amenazaCodigo: string;
  amenazaNombre: string;
  /// El principal de la amenaza crítica, o el de menor madurez sin relevancia asignada
  /// (Open Item 6). `null` cuando la amenaza no tiene ningún control mapeado.
  control: { id: number; codigo: string; nombre: string; madurezActual: number | null } | null;
  /// El objetivo del control, o `min(actual + 1, 5)` cuando no tiene uno propio — el mismo
  /// criterio que `crearAccionDesdeControl` usa. `null` sin control elegido.
  madurezObjetivoSugerida: number | null;
  /// El propietario del activo, editable en el popup.
  responsable: { id: number; nombre: string } | null;
  /// De `CriterioAceptacion.aprueba` (texto libre) resuelto contra el catálogo de cargos,
  /// con «Líder del SIG» como respaldo. `null` cuando ninguno de los dos existe en el
  /// catálogo: el popup pide elegirlo a mano en vez de guardar uno inventado.
  apruebaSugerido: { id: number; nombre: string } | null;
  /// Hoy + `CriterioAceptacion.plazoEjecucion` de la banda Crítico. `null` cuando el plazo
  /// es irreconocible (ver `lib/sgsi/deuda-planes.ts`, `parsearPlazo`) — el campo queda
  /// vacío para completar a mano en vez de una fecha inventada.
  fechaObjetivo: string | null;
  /// Los catálogos que el popup necesita para los selects editables: Responsable, Aprueba
  /// y el objetivo de madurez.
  cargos: { id: number; nombre: string }[];
  escalaMadurez: { id: number; nivel: number; nombre: string }[];
}

export interface ResultadoPrefillPlanCritico {
  ok: boolean;
  mensaje: string;
  datos: PrefillPlanCritico | null;
}

/// Lee lo que el popup necesita para prellenarse. De solo lectura: no escribe nada, ni
/// siquiera cuando no encuentra el riesgo — ese caso lo dice `ok: false` y el popup lo
/// muestra en vez de intentar prellenar con huecos.
export async function datosPrefillPlanCritico(
  activoCodigo: string,
  amenazaCodigo: string,
): Promise<ResultadoPrefillPlanCritico> {
  const vacio = { datos: null };
  try {
    await autorConPermiso('sgsi:ver');

    const riesgo = await prisma.riesgo.findFirst({
      where: { activo: { codigo: activoCodigo }, amenaza: { codigo: amenazaCodigo } },
      include: {
        activo: { include: { propietario: true } },
        amenaza: {
          include: {
            controles: {
              include: { control: { include: { actual: true, objetivo: true } }, relevancia: true },
            },
          },
        },
      },
    });
    if (!riesgo) {
      return {
        ok: false,
        mensaje: `No existe el riesgo ${activoCodigo} × ${amenazaCodigo}.`,
        ...vacio,
      };
    }

    const controlesAplicables = riesgo.amenaza.controles.filter((c) => c.control.soa !== 'NO');
    const paraPlan: ControlParaPlan[] = controlesAplicables.map((c) => ({
      codigo: c.control.codigo,
      nivel: c.control.actual?.nivel ?? null,
      esPrincipal: c.relevancia?.esPrincipal ?? false,
    }));
    const elegido = elegirControlParaPlan(paraPlan);
    const filaControl = elegido
      ? controlesAplicables.find((c) => c.control.codigo === elegido.codigo)
      : undefined;

    // REQ-SIG-24 §3 · un escalón por encima del actual, sin pasarse del tope SELECCIONABLE.
    // El tope es 90 y no 100: la eficacia 1.0 daría residual cero, y sugerir como objetivo
    // de un plan el único valor que borra el riesgo del registro sería el peor default
    // posible. Sin nivel actual se sugiere el primer escalón por encima de «no existe».
    const madurezObjetivoSugerida = filaControl
      ? (filaControl.control.objetivo?.nivel ??
        (filaControl.control.actual === null
          ? 10
          : Math.min(filaControl.control.actual.nivel + 10, 90)))
      : null;

    const [criterioCritico, cargos, escalaMadurez] = await Promise.all([
      prisma.criterioAceptacion.findFirst({ where: { umbralRiesgo: { nombre: 'Crítico' } } }),
      prisma.cargoResponsable.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' } }),
    ]);

    // «Comité del SIG», «Líder del SIG y Comité»… `CriterioAceptacion.aprueba` es texto
    // libre y no siempre coincide con un cargo del catálogo — coincidencia exacta primero,
    // «Líder del SIG» como respaldo, `null` si ninguno de los dos existe.
    const apruebaSugerido =
      cargos.find((c) => c.nombre === criterioCritico?.aprueba) ??
      cargos.find((c) => c.nombre === 'Líder del SIG') ??
      null;

    const fechaObjetivo = criterioCritico
      ? fechaObjetivoPlan(new Date(), criterioCritico.plazoEjecucion)
      : null;

    return {
      ok: true,
      mensaje: 'Prellenado listo.',
      datos: {
        riesgoCodigo: riesgo.codigo,
        activoCodigo,
        activoNombre: riesgo.activo.nombre,
        amenazaCodigo,
        amenazaNombre: riesgo.amenaza.nombre,
        control: filaControl
          ? {
              id: filaControl.control.id,
              codigo: filaControl.control.codigo,
              nombre: filaControl.control.nombre,
              madurezActual: filaControl.control.actual?.nivel ?? null,
            }
          : null,
        madurezObjetivoSugerida,
        responsable: riesgo.activo.propietario
          ? { id: riesgo.activo.propietario.id, nombre: riesgo.activo.propietario.nombre }
          : null,
        apruebaSugerido: apruebaSugerido ? { id: apruebaSugerido.id, nombre: apruebaSugerido.nombre } : null,
        fechaObjetivo: fechaObjetivo ? fechaObjetivo.toISOString().slice(0, 10) : null,
        cargos: cargos.map((c) => ({ id: c.id, nombre: c.nombre })),
        escalaMadurez: escalaMadurez.map((m) => ({ id: m.id, nivel: m.nivel, nombre: m.nombre })),
      },
    };
  } catch (error) {
    console.error('[sgsi] no se pudo prellenar el plan crítico', error);
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No se pudo leer el prellenado.',
      ...vacio,
    };
  }
}

/// Lo que el popup envía al registrar. `controlId` puede ser `null` —salvo cuando
/// `tipo === 'MITIGAR'`, que lo exige igual que `guardarAccion`.
export interface DatosPlanCritico {
  activoCodigo: string;
  amenazaCodigo: string;
  controlId: number | null;
  tipo: TipoAccion;
  responsableId: number;
  apruebaId: number;
  madurezObjetivoId?: number | null;
  fechaObjetivo?: string | null;
  justificacionAceptacion?: string | null;
  fechaRevisionAceptacion?: string | null;
  instrumento?: string | null;
  riesgoRemanente?: string | null;
}

/// Registra el plan que dispara el popup de residual crítico. El guardado que lo abrió
/// (`guardarSesionRiesgo`, tarea 4.14) YA tuvo éxito antes de que esta función corra —D17:
/// esto solo registra el plan, nunca condiciona si el residual se guardó.
///
/// LA DEDUPE ES LA MISMA QUE `crearAccionDesdeControl`: un control con un plan activo no
/// recibe un segundo. El popup entonces navega al que ya existe en vez de crear uno
/// paralelo — es lo que la tarea 4.19 verifica estructuralmente.
export async function registrarPlanCritico(
  datos: DatosPlanCritico,
  motivo?: string,
): Promise<ResultadoAccion> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    idOpcional(datos.controlId, 'el control');
    exigirId(datos.responsableId, 'el responsable');
    exigirId(datos.apruebaId, 'quien aprueba');

    const riesgo = await prisma.riesgo.findFirst({
      where: {
        activo: { codigo: datos.activoCodigo },
        amenaza: { codigo: datos.amenazaCodigo },
      },
      include: { activo: true, amenaza: true },
    });
    if (!riesgo) {
      return {
        ok: false,
        mensaje: `No existe el riesgo ${datos.activoCodigo} × ${datos.amenazaCodigo}.`,
      };
    }

    // Las mismas reglas condicionales de ISO/IEC 27001:2022 6.1.3 que `guardarAccion`
    // exige — repetidas acá porque este camino de creación no pasa por esa función.
    const errores: string[] = [];
    if (datos.tipo === 'MITIGAR' && datos.controlId === null) {
      errores.push('Una acción de mitigación necesita el control que mejora.');
    }
    if (datos.tipo === 'ACEPTAR') {
      if (!datos.justificacionAceptacion) {
        errores.push('Aceptar un riesgo necesita la justificación de la aceptación.');
      }
      if (!datos.fechaRevisionAceptacion) {
        errores.push(
          'Aceptar un riesgo necesita fecha de revisión: una aceptación sin vencimiento es una que nadie vuelve a mirar.',
        );
      }
    }
    if (datos.tipo === 'TRANSFERIR') {
      if (!datos.instrumento) {
        errores.push('Transferir necesita el instrumento (póliza, contrato o cláusula).');
      }
      if (!datos.riesgoRemanente) {
        errores.push('Transferir necesita el riesgo remanente: transferir nunca mueve el riesgo completo.');
      }
    }
    if (errores.length > 0) return { ok: false, mensaje: errores.join(' ') };

    // UN PLAN POR RIESGO. La deduplicación de abajo es por CONTROL, y no alcanza: dos
    // controles distintos de la misma amenaza aceptarían dos planes para el mismo riesgo, y
    // entonces «el plan de este riesgo» dejaría de ser una cosa que se pueda señalar — ni
    // la ficha ni la deuda de planes sabrían a cuál se refieren. Se devuelve el que ya
    // existe, con el mismo `ok: true` que la deduplicación por control: encontrarlo no es un
    // error, es la respuesta.
    const activas = await prisma.accionPlan.findMany({
      where: { activa: true },
      select: { codigo: true, origen: true },
      orderBy: { codigo: 'asc' },
    });
    const cubre = activas.find((a) => {
      const o = parsearOrigen(a.origen);
      return o !== null && origenCubreRiesgo(o, datos);
    });
    if (cubre) {
      return {
        ok: true,
        mensaje: `${datos.activoCodigo} × ${datos.amenazaCodigo} ya tiene un plan: ${cubre.codigo}. No se crea un segundo.`,
        codigo: cubre.codigo,
        cambios: 0,
      };
    }

    if (datos.controlId !== null) {
      const existente = await prisma.accionPlan.findFirst({
        where: { controlId: datos.controlId, activa: true },
        orderBy: { codigo: 'asc' },
      });
      if (existente) {
        return {
          ok: true,
          mensaje: `Ya existe un plan sobre este control: ${existente.codigo}. No se crea uno paralelo.`,
          codigo: existente.codigo,
          cambios: 0,
        };
      }
    }

    // La narrativa dice la banda REAL. Decía «Residual crítico» fijo, porque el plan sólo se
    // podía crear desde esa banda; ahora que se puede crear desde cualquiera, esa frase sería
    // una afirmación falsa en el campo que ISO/IEC 27001 6.1.3 pide para justificar la acción
    // y que un auditor lee tal cual.
    const umbrales = await prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } });
    const banda =
      riesgo.riesgoResidual === null
        ? null
        : clasificar(riesgo.riesgoResidual.toString(), umbrales);
    const origen = formatearOrigen(
      riesgo.codigo,
      datos.activoCodigo,
      datos.amenazaCodigo,
      narrativaOrigenPlan(banda, riesgo.activo.codigo ?? datos.activoCodigo, riesgo.amenaza.nombre),
    );

    const codigo = await prisma.$transaction(async (tx) => {
      // La misma generación de código que `crearAccionDesdeControl`: nunca se reutiliza un
      // PT dado de baja.
      const codigos = await tx.accionPlan.findMany({ select: { codigo: true } });
      const ultimo = codigos.reduce((mayor, a) => {
        const n = /^PT-(\d+)$/.exec(a.codigo);
        return n ? Math.max(mayor, Number(n[1])) : mayor;
      }, 0);
      const nuevoCodigo = `PT-${String(ultimo + 1).padStart(3, '0')}`;

      await tx.accionPlan.create({
        data: {
          codigo: nuevoCodigo,
          accion: `Plan de tratamiento — residual crítico de ${riesgo.activo.codigo} (${riesgo.amenaza.nombre})`,
          tipo: datos.tipo,
          controlId: datos.controlId,
          origen,
          responsableId: datos.responsableId,
          apruebaId: datos.apruebaId,
          fechaObjetivo: datos.fechaObjetivo ? new Date(`${datos.fechaObjetivo}T00:00:00.000Z`) : null,
          madurezObjetivoId: datos.madurezObjetivoId ?? null,
          estado: 'NO_INICIADA',
          avance: 0,
          verificacion: 'PENDIENTE',
          instrumento: datos.instrumento ?? null,
          riesgoRemanente: datos.riesgoRemanente ?? null,
          justificacionAceptacion: datos.justificacionAceptacion ?? null,
          fechaRevisionAceptacion: datos.fechaRevisionAceptacion
            ? new Date(`${datos.fechaRevisionAceptacion}T00:00:00.000Z`)
            : null,
        },
      });

      await registrarAlta(tx, autor, 'accion_plan', nuevoCodigo);
      await registrar(tx, autor, [
        {
          tabla: 'accion_plan',
          registroId: nuevoCodigo,
          campo: 'origen',
          anterior: null,
          nuevo: origen,
          motivo:
            normalizar(motivo) ??
            'Registrado desde el popup de residual crítico (REQ-SIG-20 §7).',
        },
      ]);

      return nuevoCodigo;
    });

    revalidarPlan();

    return {
      ok: true,
      mensaje: `Se registró el plan ${codigo} para el residual crítico de ${datos.activoCodigo}.`,
      codigo,
      cambios: 1,
    };
  });
}

/// The state select on the row. The progress follows the state — No iniciada 0 %,
/// En ejecución 50 %, Cerrada 100 % — because two independently edited numbers saying
/// the same thing is how a plan starts reporting a progress nobody recognises.
///
/// En verificación and Cancelada leave the progress alone: neither says anything about
/// how much of the work is done.
export async function cambiarEstadoAccion(
  codigo: string,
  estado: EstadoAccion,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const accion = await prisma.accionPlan.findUnique({ where: { codigo } });
    if (!accion) return { ok: false, mensaje: `No existe la acción ${codigo}.` };
    if (!accion.activa) {
      return {
        ok: false,
        mensaje: `${codigo} está dada de baja: restauralá antes de cambiarle el estado.`,
      };
    }

    if (estado === 'CERRADA' && accion.verificacion === 'PENDIENTE') {
      return {
        ok: false,
        mensaje:
          'No se puede cerrar con la verificación de eficacia pendiente: registrá el resultado de la verificación, o «No aplica» si no corresponde.',
      };
    }

    const AVANCE: Partial<Record<EstadoAccion, number>> = {
      NO_INICIADA: 0,
      EN_EJECUCION: 50,
      CERRADA: 100,
    };
    const avance = AVANCE[estado] ?? accion.avance;

    const escritos = await prisma.$transaction(async (tx) => {
      const total = await registrar(tx, autor, [
        {
          tabla: 'accion_plan',
          registroId: codigo,
          campo: 'estado',
          anterior: accion.estado,
          nuevo: estado,
          motivo: null,
        },
        {
          tabla: 'accion_plan',
          registroId: codigo,
          campo: 'avance',
          anterior: accion.avance,
          nuevo: avance,
          motivo: 'Se deriva del estado',
        },
      ]);

      await tx.accionPlan.update({
        where: { id: accion.id },
        data: {
          estado,
          avance,
          ...(estado === accion.estado
            ? {}
            : { fechaCierre: estado === 'CERRADA' ? hoy() : null }),
        },
      });

      return total;
    });

    revalidarPlan();

    return {
      ok: true,
      mensaje:
        escritos === 0
          ? 'No había cambios que guardar.'
          : `${codigo} quedó en ${estado} con avance ${avance} %.`,
      cambios: escritos,
    };
  });
}

/// A logical delete: the action leaves the grid and the KPIs, the reason is mandatory,
/// and the row and its code stay in the database for the undo band and for the auditor.
export async function darDeBajaAccion(codigo: string, motivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const razon = normalizar(motivo);
    if (razon === null) {
      return { ok: false, mensaje: 'La baja necesita un motivo: queda en la bitácora.' };
    }

    const accion = await prisma.accionPlan.findUnique({ where: { codigo } });
    if (!accion) return { ok: false, mensaje: `No existe la acción ${codigo}.` };
    if (!accion.activa) {
      return { ok: true, mensaje: `${codigo} ya estaba dada de baja.`, cambios: 0 };
    }

    await prisma.$transaction(async (tx) => {
      await registrarBaja(tx, autor, 'accion_plan', codigo, razon);
      await tx.accionPlan.update({
        where: { id: accion.id },
        data: { activa: false, bajaEn: new Date() },
      });
    });

    revalidarPlan();

    return { ok: true, mensaje: `${codigo} salió del plan. Se puede deshacer.`, cambios: 1 };
  });
}

export async function restaurarAccion(codigo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const accion = await prisma.accionPlan.findUnique({ where: { codigo } });
    if (!accion) return { ok: false, mensaje: `No existe la acción ${codigo}.` };
    if (accion.activa) {
      return { ok: true, mensaje: `${codigo} ya estaba en el plan.`, cambios: 0 };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'accion_plan',
          registroId: codigo,
          campo: 'baja lógica',
          anterior: 'dado de baja',
          nuevo: 'vigente',
          motivo: 'Se deshizo la baja',
        },
      ]);
      await tx.accionPlan.update({
        where: { id: accion.id },
        data: { activa: true, bajaEn: null },
      });
    });

    revalidarPlan();

    return { ok: true, mensaje: `${codigo} volvió al plan.`, cambios: 1 };
  });
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/// `undefined` means the caller did not touch the field. A blank string clears it, so an
/// emptied date input does not store today's date by accident. An impossible date such
/// as 2026-02-31 is rejected rather than rolled forward into March.
function comoFecha(
  valor: string | null | undefined,
  etiqueta: string,
  errores: string[],
): Date | null | undefined {
  if (valor === undefined) return undefined;
  const texto = valor?.trim() ?? '';
  if (texto === '') return null;
  if (!FECHA.test(texto)) {
    errores.push(`${etiqueta} debe venir como AAAA-MM-DD.`);
    return undefined;
  }
  const fecha = new Date(`${texto}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
    errores.push(`${etiqueta} no es una fecha real: ${texto}.`);
    return undefined;
  }
  return fecha;
}

function comoTexto(fecha: Date | null): string | null {
  return fecha === null ? null : fecha.toISOString().slice(0, 10);
}

function hoy(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function nivel(valor: number | null): string {
  return valor === null ? 'L—' : `L${valor}`;
}

/// Blank is not a value: an empty string and a whitespace-only string both mean "no
/// text", and storing one is how a required field ends up technically full and actually
/// empty.
function normalizar(valor: string | null | undefined): string | null {
  const texto = valor?.trim() ?? '';
  return texto === '' ? null : texto;
}

function revalidarPlan(): void {
  for (const ruta of ['/', '/sgsi', '/sgsi/planes', '/sgsi/controles', '/sgsi/verificacion']) {
    revalidatePath(ruta);
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PLANES DESDE LA GRILLA DE ANÁLISIS DE RIESGOS
// ═════════════════════════════════════════════════════════════════════════════════════════
//
// El plan nace donde se ve la brecha. Registrarlo desde la ficha del activo, amenaza por
// amenaza, obliga a entrar al activo, abrir la pestaña, encontrar la fila y repetirlo por
// cada amenaza: el trabajo se ve en la lista de análisis y se hace en otra pantalla.
//
// Acá se elige un activo y se marcan sus amenazas —una, varias o todas—, y salen los planes
// que hagan falta. Cuántos hagan falta lo decide `lib/sgsi/planes-por-amenaza.ts`, que agrupa
// por control principal: doce amenazas cuyos principales son tres controles son TRES planes.

export interface AmenazaDelActivo {
  amenazaCodigo: string;
  amenazaNombre: string;
  principalCodigo: string | null;
  principalNombre: string | null;
  /// Nivel actual del principal, en puntos. `null` = designado pero sin evaluar.
  principalNivel: number | null;
  /// Puntos de brecha, cuando hay una de NIVEL. `null` en todos los demás casos.
  brecha: number | null;
  /// El estado completo, para que la pantalla explique por qué no hay brecha en vez de
  /// dejar una celda vacía que se lee como «no falta nada».
  estadoBrecha: EstadoBrecha['tipo'];
  /// El plan activo que ya la cubre, por origen o por control principal.
  planExistente: string | null;
  /// El riesgo residual en puntos. Es lo que ORDENA la lista; la banda es su lectura.
  residual: number | null;
  bandaResidual: string | null;
}

export interface PrefillPlanesActivo {
  activoCodigo: string;
  activoNombre: string;
  amenazas: AmenazaDelActivo[];
  responsable: { id: number; nombre: string } | null;
  apruebaSugerido: { id: number; nombre: string } | null;
  fechaObjetivo: string | null;
  cargos: { id: number; nombre: string }[];
  escalaMadurez: { id: number; nivel: number; nombre: string }[];
}

/// Lee todo lo que el popup de la grilla necesita para UN activo. De sólo lectura.
///
/// La brecha se evalúa con `evaluarBrecha` —la misma función que pinta la columna «Plan» de
/// esa grilla—, no con una regla propia: si la pantalla dice que un activo requiere plan y el
/// popup que lo abre dijera otra cosa, ninguna de las dos sería creíble.
export async function datosPrefillPlanesActivo(
  activoCodigo: string,
): Promise<{ ok: boolean; mensaje: string; datos: PrefillPlanesActivo | null }> {
  try {
    await autorConPermiso('sgsi:ver');

    const activo = await prisma.activo.findFirst({
      where: { codigo: activoCodigo },
      include: {
        propietario: true,
        criticidad: { select: { codigo: true } },
        valores: { select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } } },
        riesgos: {
          where: { obsoleto: false },
          select: {
            riesgoResidual: true,
            amenaza: {
              select: {
                codigo: true,
                nombre: true,
                degradacion: {
                  select: {
                    dimension: { select: { codigo: true } },
                    degradacion: { select: { factor: true } },
                  },
                },
                controles: {
                  where: { relevancia: { esPrincipal: true } },
                  select: {
                    control: {
                      select: { codigo: true, nombre: true, actual: { select: { nivel: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!activo) {
      return { ok: false, mensaje: `No existe el activo ${activoCodigo}.`, datos: null };
    }

    const [planes, umbrales, criterio, cargos, escalaMadurez] = await Promise.all([
      prisma.accionPlan.findMany({
        where: { activa: true },
        select: { codigo: true, origen: true, control: { select: { codigo: true } } },
        orderBy: { codigo: 'asc' },
      }),
      prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
      prisma.criterioAceptacion.findFirst({ where: { umbralRiesgo: { nombre: 'Crítico' } } }),
      prisma.cargoResponsable.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' } }),
    ]);

    const porDimension = new Map(activo.valores.map((v) => [v.dimension.codigo, v.valor.valor]));
    const valores = {
      D: porDimension.get('D') ?? 0,
      I: porDimension.get('I') ?? 0,
      C: porDimension.get('C') ?? 0,
    };

    const amenazas: AmenazaDelActivo[] = activo.riesgos.map((r) => {
      const porDim = new Map(
        r.amenaza.degradacion.map((d) => [d.dimension.codigo, Number(d.degradacion.factor)]),
      );
      const principal = r.amenaza.controles[0]?.control;
      const estado = evaluarBrecha({
        criticidad: activo.criticidad?.codigo ?? null,
        valores,
        degradacion: { D: porDim.get('D') ?? 0, I: porDim.get('I') ?? 0, C: porDim.get('C') ?? 0 },
        nivelPrincipal: principal === undefined ? undefined : (principal.actual?.nivel ?? null),
        codigoPrincipal: principal?.codigo,
      });

      // Las dos vías de cobertura, las mismas que `construirResolverDeuda`: el prefijo del
      // origen y el control principal. Preguntarlo acá con una regla propia sería el segundo
      // criterio que después discrepa del tablero.
      const cubre = planes.find((p) => {
        const o = parsearOrigen(p.origen);
        if (o !== null && origenCubreRiesgo(o, { activoCodigo, amenazaCodigo: r.amenaza.codigo })) {
          return true;
        }
        return principal !== undefined && p.control?.codigo === principal.codigo;
      });

      return {
        amenazaCodigo: r.amenaza.codigo,
        amenazaNombre: r.amenaza.nombre,
        principalCodigo: principal?.codigo ?? null,
        principalNombre: principal?.nombre ?? null,
        principalNivel: principal?.actual?.nivel ?? null,
        brecha: estado.tipo === 'brecha' ? estado.brecha : null,
        estadoBrecha: estado.tipo,
        planExistente: cubre?.codigo ?? null,
        residual: r.riesgoResidual === null ? null : Number(r.riesgoResidual),
        bandaResidual:
          r.riesgoResidual === null ? null : clasificar(r.riesgoResidual.toString(), umbrales),
      };
    });

    // Por residual descendente, no por brecha: lo que se decide tratar primero es el riesgo que
    // queda, no lo que le falta al control. La regla está aparte y probada.
    const ordenadas = ordenarAmenazasPorResidual(amenazas);

    const apruebaSugerido =
      cargos.find((c) => c.nombre === criterio?.aprueba) ??
      cargos.find((c) => c.nombre === 'Líder del SIG') ??
      null;
    const fecha = criterio ? fechaObjetivoPlan(new Date(), criterio.plazoEjecucion) : null;

    return {
      ok: true,
      mensaje: 'Prellenado listo.',
      datos: {
        activoCodigo,
        activoNombre: activo.nombre,
        amenazas: ordenadas,
        responsable: activo.propietario
          ? { id: activo.propietario.id, nombre: activo.propietario.nombre }
          : null,
        apruebaSugerido: apruebaSugerido
          ? { id: apruebaSugerido.id, nombre: apruebaSugerido.nombre }
          : null,
        fechaObjetivo: fecha ? fecha.toISOString().slice(0, 10) : null,
        cargos: cargos.map((c) => ({ id: c.id, nombre: c.nombre })),
        escalaMadurez: escalaMadurez.map((m) => ({ id: m.id, nivel: m.nivel, nombre: m.nombre })),
      },
    };
  } catch (error) {
    console.error('[sgsi] no se pudo prellenar los planes del activo', error);
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No se pudo leer el prellenado.',
      datos: null,
    };
  }
}

export interface DatosPlanesActivo {
  activoCodigo: string;
  /// Las amenazas marcadas en el popup. Una, varias o todas.
  amenazaCodigos: string[];
  tipo: TipoAccion;
  responsableId: number;
  apruebaId: number;
  fechaObjetivo?: string | null;
  justificacionAceptacion?: string | null;
  fechaRevisionAceptacion?: string | null;
  instrumento?: string | null;
  riesgoRemanente?: string | null;
  motivo?: string | null;
}

export interface ResultadoPlanesActivo extends Resultado {
  /// Los planes creados, en el orden en que se crearon.
  creados: { codigo: string; controlCodigo: string; amenazas: string[] }[];
  /// Las amenazas que no produjeron plan, con el motivo en palabras.
  omitidas: { amenazaCodigo: string; motivo: string }[];
}

/// Registra los planes de las amenazas marcadas, en UNA transacción.
///
/// TODO O NADA, igual que la importación de planes. Un lote a medias deja a quien lo pidió
/// sin saber cuáles de las doce amenazas que marcó quedaron cubiertas, y la única forma de
/// averiguarlo sería revisarlas de a una — que es exactamente el trabajo que este popup
/// existe para evitar.
///
/// EL ORIGEN NOMBRA LA PEOR AMENAZA DEL GRUPO, no las tres ni las doce. El prefijo
/// verificable tiene lugar para un par (activo, amenaza) y ensancharlo cambiaría un formato
/// que ya está escrito en la base. No se pierde nada: desde que la cobertura también se
/// resuelve por control principal (`construirResolverDeuda`), el plan cubre todas las
/// amenazas de su control sin enumerarlas en un campo de texto. La narrativa sí las cuenta,
/// porque es lo que un auditor lee.
export async function registrarPlanesActivo(
  datos: DatosPlanesActivo,
): Promise<ResultadoPlanesActivo> {
  const vacio = { creados: [], omitidas: [] };
  try {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(datos.responsableId, 'el responsable');
    exigirId(datos.apruebaId, 'quien aprueba');

    if (datos.amenazaCodigos.length === 0) {
      return { ok: false, mensaje: 'No hay ninguna amenaza marcada.', ...vacio };
    }

    // Las mismas reglas condicionales de 6.1.3 que `guardarAccion` y `registrarPlanCritico`.
    // Se comprueban ANTES de abrir la transacción: rechazar en la fila siete de doce sería
    // hacer trabajo para deshacerlo.
    const errores: string[] = [];
    if (datos.tipo === 'ACEPTAR') {
      if (!datos.justificacionAceptacion) {
        errores.push('Aceptar un riesgo necesita la justificación de la aceptación.');
      }
      if (!datos.fechaRevisionAceptacion) {
        errores.push(
          'Aceptar un riesgo necesita fecha de revisión: una aceptación sin vencimiento es una que nadie vuelve a mirar.',
        );
      }
    }
    if (datos.tipo === 'TRANSFERIR') {
      if (!datos.instrumento) {
        errores.push('Transferir necesita el instrumento (póliza, contrato o cláusula).');
      }
      if (!datos.riesgoRemanente) {
        errores.push(
          'Transferir necesita el riesgo remanente: transferir nunca mueve el riesgo completo.',
        );
      }
    }
    if (errores.length > 0) return { ok: false, mensaje: errores.join(' '), ...vacio };

    const prefill = await datosPrefillPlanesActivo(datos.activoCodigo);
    if (!prefill.ok || prefill.datos === null) {
      return { ok: false, mensaje: prefill.mensaje, ...vacio };
    }

    const marcadas = new Set(datos.amenazaCodigos);
    const { grupos, excluidas } = agruparAmenazasEnPlanes(
      prefill.datos.amenazas
        .filter((a) => marcadas.has(a.amenazaCodigo))
        .map((a) => ({
          amenazaCodigo: a.amenazaCodigo,
          amenazaNombre: a.amenazaNombre,
          principalCodigo: a.principalCodigo,
          principalNombre: a.principalNombre,
          brecha: a.brecha,
          planExistente: a.planExistente,
        })),
    );

    const omitidas = excluidas.map((e) => ({
      amenazaCodigo: e.amenaza.amenazaCodigo,
      motivo:
        e.motivo === 'ya-cubierta'
          ? `Ya la cubre el plan ${e.amenaza.planExistente}.`
          : 'La amenaza no tiene control principal designado; no se registra un plan sobre un control que nadie declaró.',
    }));

    if (grupos.length === 0) {
      return {
        ok: true,
        mensaje:
          'No hay nada que registrar: todas las amenazas marcadas ya están cubiertas o no tienen control principal.',
        creados: [],
        omitidas,
        cambios: 0,
      };
    }

    const controles = await prisma.control.findMany({
      where: { codigo: { in: grupos.map((g) => g.principalCodigo) } },
      select: {
        id: true,
        codigo: true,
        actual: { select: { nivel: true } },
        objetivo: { select: { id: true } },
      },
    });
    const controlPorCodigo = new Map(controles.map((c) => [c.codigo, c]));
    const escalaPorNivel = new Map(prefill.datos.escalaMadurez.map((m) => [m.nivel, m.id]));

    const creados = await prisma.$transaction(async (tx) => {
      const codigos = await tx.accionPlan.findMany({ select: { codigo: true } });
      let ultimo = codigos.reduce((mayor, a) => {
        const n = /^PT-(\d+)$/.exec(a.codigo);
        return n ? Math.max(mayor, Number(n[1])) : mayor;
      }, 0);

      const hechos: ResultadoPlanesActivo['creados'] = [];

      for (const g of grupos) {
        const control = controlPorCodigo.get(g.principalCodigo);
        if (control === undefined) throw new Error(`No existe el control ${g.principalCodigo}.`);

        const peor = g.amenazas[0];
        const riesgo = await tx.riesgo.findFirst({
          where: {
            activo: { codigo: datos.activoCodigo },
            amenaza: { codigo: peor.amenazaCodigo },
          },
          select: { codigo: true },
        });
        if (riesgo === null) {
          throw new Error(`No existe el riesgo ${datos.activoCodigo} x ${peor.amenazaCodigo}.`);
        }

        const narrativa =
          g.amenazas.length === 1
            ? `Brecha de ${g.principalCodigo} sobre ${datos.activoCodigo} — ${peor.amenazaNombre}.`
            : `Brecha de ${g.principalCodigo} sobre ${datos.activoCodigo} — ${g.amenazas.length} amenazas, la mayor ${peor.amenazaNombre}.`;
        const origen = formatearOrigen(
          riesgo.codigo,
          datos.activoCodigo,
          peor.amenazaCodigo,
          narrativa,
        );

        // Un escalón por encima del actual, sin pasar de 90 — el mismo criterio que el
        // prellenado del plan puntual. El objetivo propio del control manda si lo tiene.
        const nivelActual = control.actual?.nivel ?? null;
        const madurezObjetivoId =
          control.objetivo?.id ??
          escalaPorNivel.get(nivelActual === null ? 10 : Math.min(nivelActual + 10, 90)) ??
          null;

        ultimo += 1;
        const nuevoCodigo = `PT-${String(ultimo).padStart(3, '0')}`;

        await tx.accionPlan.create({
          data: {
            codigo: nuevoCodigo,
            accion: `Elevar ${g.principalCodigo} para cerrar la brecha de ${datos.activoCodigo}`,
            tipo: datos.tipo,
            controlId: datos.tipo === 'MITIGAR' ? control.id : null,
            origen,
            responsableId: datos.responsableId,
            apruebaId: datos.apruebaId,
            fechaObjetivo: datos.fechaObjetivo
              ? new Date(`${datos.fechaObjetivo}T00:00:00.000Z`)
              : null,
            madurezObjetivoId: datos.tipo === 'MITIGAR' ? madurezObjetivoId : null,
            estado: 'NO_INICIADA',
            avance: 0,
            verificacion: 'PENDIENTE',
            instrumento: datos.instrumento ?? null,
            riesgoRemanente: datos.riesgoRemanente ?? null,
            justificacionAceptacion: datos.justificacionAceptacion ?? null,
            fechaRevisionAceptacion: datos.fechaRevisionAceptacion
              ? new Date(`${datos.fechaRevisionAceptacion}T00:00:00.000Z`)
              : null,
          },
        });

        await registrarAlta(tx, autor, 'accion_plan', nuevoCodigo);
        await registrar(tx, autor, [
          {
            tabla: 'accion_plan',
            registroId: nuevoCodigo,
            campo: 'origen',
            anterior: null,
            nuevo: origen,
            motivo:
              normalizar(datos.motivo) ??
              `Registrado desde Análisis de riesgos para ${datos.activoCodigo}.`,
          },
        ]);

        hechos.push({
          codigo: nuevoCodigo,
          controlCodigo: g.principalCodigo,
          amenazas: g.amenazas.map((a) => a.amenazaCodigo),
        });
      }

      return hechos;
    });

    revalidarPlan();
    revalidatePath('/sgsi/valoracion-riesgos');
    revalidatePath('/sgsi/inventario');

    return {
      ok: true,
      mensaje: `Se ${creados.length === 1 ? 'registró' : 'registraron'} ${creados.length} ${
        creados.length === 1 ? 'plan' : 'planes'
      } para ${datos.activoCodigo}.`,
      creados,
      omitidas,
      cambios: creados.length,
    };
  } catch (error) {
    console.error('[sgsi] no se pudieron registrar los planes del activo', error);
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No se pudieron registrar los planes.',
      ...vacio,
    };
  }
}
