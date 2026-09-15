'use server';

// app/sgsi/acciones/riesgos.ts
//
// The human decisions taken ON a risk: the treatment, the two exceptions the schema
// allows, and the logical removal of a threat from an asset.
//
// None of these actions computes a figure. `impacto`, `riesgoPotencial`,
// `frecuenciaResidual` and `riesgoResidual` have exactly one writer — `generarRiesgos`
// in lib/sgsi/riesgos.ts — and a second writer is how a report ends up contradicting
// itself. Every action here changes an INPUT of that arithmetic, so it stores the
// decision, logs it in the same transaction, and then asks the generator to recompute.
//
// The SUGGESTED treatment is never stored: it is derived from the residual band at read
// time. Only a deliberate override is persisted, and an override without a written
// justification is not a decision, it is an unexplained number.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarBaja, type Cambio } from '@/lib/sgsi/bitacora';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import { clasificar, tratamientoSugerido } from '@/lib/sgsi/clasificar';
import { entraAlAnalisis, type ValoresDimension } from '@/lib/sgsi/formulas';
import { autorConPermiso, ejecutar, exigirId, idOpcional, type Resultado } from './sesion';

/// D-2 (REQ-SIG-20 §3): the same gate the sheet disables its tabs with, enforced again
/// here because a disabled tab is help, not control — a server action is reachable
/// without the screen. Reads the asset's own valores and the live
/// `Parametro.umbral_valoracion`, exactly as `FichaActivo.tsx` and `generarRiesgos` do, so
/// the three never disagree about which assets are in scope.
async function activoEnAnalisis(activoId: number): Promise<boolean> {
  const [filas, parametro] = await Promise.all([
    prisma.activoValor.findMany({
      where: { activoId },
      select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
    }),
    prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } }),
  ]);
  const umbral = Number(parametro?.valor ?? 4);

  const valores: Partial<ValoresDimension> = {};
  for (const f of filas) {
    if (f.dimension.codigo === 'D' || f.dimension.codigo === 'I' || f.dimension.codigo === 'C') {
      valores[f.dimension.codigo] = f.valor.valor;
    }
  }
  if (valores.D === undefined || valores.I === undefined || valores.C === undefined) return false;
  return entraAlAnalisis(valores as ValoresDimension, umbral);
}

const FUERA_DE_ANALISIS =
  'Este activo no alcanza el umbral de valoración: está fuera del análisis de riesgos y esta escritura se rechaza.';

/// The three dimensions this deployment models. The declared deviation reassigns
/// Autenticidad and Trazabilidad into Integridad, so D, I and C are the whole set — and
/// they are the only ones the risk generator reads.
export type DimensionRiesgo = 'D' | 'I' | 'C';

export interface DecisionTratamiento {
  /// Omit a field to leave it as it is. `null` clears it.
  tratamientoId?: number | null;
  estadoId?: number | null;
  responsableId?: number | null;
  /// Where the justification of an override lives, as the sheet says: "Sobrescrito.
  /// Requiere justificación en observaciones."
  observacion?: string | null;
}

/// Saves the treatment decision on one risk.
///
/// The suggestion derived from the residual band is NOT stored — it is recomputed here
/// only to tell an override apart from an agreement. When the two differ the change
/// needs a justification in `observacion`; with the residual uncalculated there is no
/// band to back any decision, so any decision is an override. That is the same rule the
/// sheet renders, and the rule is applied here rather than only there because a server
/// action is reachable without the screen.
export async function guardarTratamiento(
  codigoRiesgo: string,
  decision: DecisionTratamiento,
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('riesgo:tratar');

    const [bandas, tratamientos, estados, cargos] = await Promise.all([
      prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
      prisma.tratamientoRiesgo.findMany(),
      prisma.estadoTratamiento.findMany(),
      prisma.cargoResponsable.findMany(),
    ]);

    const riesgo = await prisma.riesgo.findUnique({ where: { codigo: codigoRiesgo } });
    if (!riesgo) return { ok: false, mensaje: `No existe el riesgo ${codigoRiesgo}.` };
    if (!(await activoEnAnalisis(riesgo.activoId))) {
      return { ok: false, mensaje: FUERA_DE_ANALISIS };
    }

    // What the field will hold after the save: an omitted key keeps its stored value.
    const tratamientoFinal =
      decision.tratamientoId !== undefined ? decision.tratamientoId : riesgo.tratamientoId;
    const estadoFinal = decision.estadoId !== undefined ? decision.estadoId : riesgo.estadoId;
    const responsableFinal =
      decision.responsableId !== undefined ? decision.responsableId : riesgo.responsableId;
    const observacionFinal = normalizar(
      decision.observacion !== undefined ? decision.observacion : riesgo.observacion,
    );

    if (tratamientoFinal !== null && !tratamientos.some((t) => t.id === tratamientoFinal)) {
      return { ok: false, mensaje: 'El tratamiento elegido no está en el catálogo.' };
    }
    if (estadoFinal !== null && !estados.some((e) => e.id === estadoFinal)) {
      return { ok: false, mensaje: 'El estado del tratamiento no está en el catálogo.' };
    }
    if (responsableFinal !== null && !cargos.some((c) => c.id === responsableFinal)) {
      return { ok: false, mensaje: 'El responsable no está en la lista de cargos.' };
    }

    // The suggestion, derived — never stored. Crítico and Alto (the first two bands by
    // `orden`) ask for mitigation; the rest for accept-and-monitor. A residual outside
    // every band falls to the last one, as the sheet's own classifier does.
    const nombreBanda =
      riesgo.riesgoResidual === null
        ? null
        : clasificar(
            riesgo.riesgoResidual.toString(),
            bandas.map((b) => ({
              nombre: b.nombre,
              desde: b.desde.toString(),
              hasta: b.hasta.toString(),
            })),
          );
    const posicion = bandas.findIndex((b) => b.nombre === nombreBanda);
    const indiceBanda = posicion < 0 ? bandas.length - 1 : posicion;
    const nombreSugerido = nombreBanda === null ? null : tratamientoSugerido(indiceBanda);
    const idSugerido =
      nombreSugerido === null
        ? null
        : (tratamientos.find((t) => t.nombre === nombreSugerido)?.id ?? null);

    const esSobrescritura = tratamientoFinal !== null && tratamientoFinal !== idSugerido;
    if (esSobrescritura && observacionFinal === null) {
      return {
        ok: false,
        mensaje:
          nombreSugerido === null
            ? 'El nivel residual todavía no está calculado, así que no hay sugerencia que respalde esta decisión: escribí la justificación en observaciones.'
            : `El tratamiento se aparta de «${nombreSugerido}», sugerido por el nivel residual ${nombreBanda}. Sobrescribir requiere justificación en observaciones.`,
      };
    }

    const nombreDe = (
      catalogo: { id: number; nombre: string }[],
      id: number | null,
    ): string | null => (id === null ? null : (catalogo.find((c) => c.id === id)?.nombre ?? null));

    // The reason travels with the entry: for an override the justification IS the
    // reason, so the trail never shows a deviation with an empty `motivo`.
    const razon = normalizar(motivo) ?? (esSobrescritura ? observacionFinal : null);

    const escritos = await prisma.$transaction(async (tx) => {
      const entradas: Cambio[] = [];

      if (decision.tratamientoId !== undefined) {
        entradas.push({
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'tratamiento',
          anterior: nombreDe(tratamientos, riesgo.tratamientoId),
          nuevo: nombreDe(tratamientos, tratamientoFinal),
          motivo: razon,
        });
      }
      if (decision.estadoId !== undefined) {
        entradas.push({
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'estado del tratamiento',
          anterior: nombreDe(estados, riesgo.estadoId),
          nuevo: nombreDe(estados, estadoFinal),
          motivo: razon,
        });
      }
      if (decision.responsableId !== undefined) {
        entradas.push({
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'responsable del tratamiento',
          anterior: nombreDe(cargos, riesgo.responsableId),
          nuevo: nombreDe(cargos, responsableFinal),
          motivo: razon,
        });
      }
      if (decision.observacion !== undefined) {
        entradas.push({
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'observaciones del tratamiento',
          anterior: riesgo.observacion,
          nuevo: observacionFinal,
          motivo: razon,
        });
      }

      const total = await registrar(tx, autor, entradas);

      await tx.riesgo.update({
        where: { id: riesgo.id },
        data: {
          ...(decision.tratamientoId !== undefined ? { tratamientoId: tratamientoFinal } : {}),
          ...(decision.estadoId !== undefined ? { estadoId: estadoFinal } : {}),
          ...(decision.responsableId !== undefined ? { responsableId: responsableFinal } : {}),
          ...(decision.observacion !== undefined ? { observacion: observacionFinal } : {}),
        },
      });

      return total;
    });

    // Registering a treatment takes the risk out of "altos sin tratamiento", a figure
    // the home screen and the matrices both show.
    const diagnostico = await generarRiesgos(prisma);
    revalidarSgsi();

    return {
      ok: true,
      mensaje:
        escritos === 0
          ? 'No había cambios que guardar.'
          : `Se guardó el tratamiento de ${codigoRiesgo}${
              esSobrescritura ? ' (sobrescrito, con justificación)' : ''
            } y se recalcularon ${diagnostico.riesgosGenerados} riesgos.`,
      cambios: escritos,
    };
  });
}

const DIMENSIONES_SESION: readonly DimensionRiesgo[] = ['D', 'I', 'C'];
const BANDA_CRITICA = 'Crítico';

/// El borrador que `FichaActivo.tsx` acumula mientras se edita (REQ-SIG-20 §10, D5): solo
/// las tres cosas que hoy piden su propia justificación por campo. Una clave AUSENTE
/// significa "sin cambio esta sesión"; presente con `null` significa "vuelve a heredar".
export interface BorradorSesionRiesgo {
  /// Solo las dimensiones tocadas. Ausente = sin cambio; `null` = vuelve a heredar la
  /// parametrización de la amenaza; un id = la excepción elegida.
  degradacion?: Partial<Record<DimensionRiesgo, number | null>>;
  /// Ausente = sin cambio; `null` = vuelve a heredar la frecuencia de la amenaza.
  frecuenciaId?: number | null;
  /// Ausente = sin cambio; `null` = quita la excepción de madurez del riesgo (D5, primer
  /// escritor de `Riesgo.madurezId`).
  madurezId?: number | null;
}

export interface ResultadoSesionRiesgo extends Resultado {
  /// Presente solo cuando el guardado deja el residual en banda Crítico (D4, tarea 4.16):
  /// los datos mínimos para que la ficha abra `PopupPlanCritico` prellenado. El guardado ya
  /// tuvo éxito cuando esto se calcula — D17 exige el plan, nunca bloquea el guardado que lo
  /// dispara (spec `critical-risk-treatment-plan`, "Save succeeds, popup opens").
  critico?: { activoCodigo: string; amenazaCodigo: string };
}

/// D5 (REQ-SIG-20 §10, tarea 4.14) · el guardado de fin de sesión de UN riesgo: degradación
/// (D/I/C), frecuencia y madurez del riesgo se consolidan acá bajo UNA sola nota
/// obligatoria — la única excepción deliberada a D17 en este cambio (spec
/// `end-of-session-notes`, "Note-less save fails"). Reemplaza, para estos tres campos, el
/// camino de `excepcionDegradacion`/`excepcionFrecuencia` (que siguen existiendo, cada una
/// con su propia justificación por campo, para quien las llame directamente) por un único
/// guardado con una única narrativa.
///
/// LA NOTA SE VALIDA ANTES DE TOCAR PRISMA. No es una optimización: es lo que hace cierto
/// que un guardado sin nota escribe CERO filas — ni de datos ni de `Bitacora` — porque la
/// función nunca llega a abrir una consulta.
///
/// Un cambio real de N campos produce EXACTAMENTE N filas de `Bitacora`, todas con la misma
/// nota como `motivo`, en UNA sola `$transaction` (invariante 7). La nota también queda en
/// `Riesgo.justificacion` cuando algo cambió — nunca cuando no cambió nada.
///
/// Después de escribir, `generarRiesgos` recalcula (D4: recompute + snapshot de
/// `RiesgoCalculo`, tarea 1.8) y la respuesta dice si el residual quedó en banda Crítico.
export async function guardarSesionRiesgo(
  codigoRiesgo: string,
  borrador: BorradorSesionRiesgo,
  nota: string,
): Promise<ResultadoSesionRiesgo> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('riesgo:tratar');

    // El único bloqueo deliberado de D17 en este cambio: sin nota no se escribe nada, y se
    // rechaza ANTES de la primera consulta — cero lecturas de más, cero escrituras.
    const razon = normalizar(nota);
    if (razon === null) {
      return {
        ok: false,
        mensaje:
          'Las notas son obligatorias para guardar: sin ellas la excepción no se puede almacenar y no se escribe ningún cambio.',
      };
    }

    const riesgo = await prisma.riesgo.findUnique({
      where: { codigo: codigoRiesgo },
      include: {
        activo: { select: { codigo: true } },
        amenaza: {
          include: {
            frecuencia: true,
            degradacion: { include: { dimension: true, degradacion: true } },
          },
        },
        degradacion: { include: { dimension: true, degradacion: true } },
        frecuencia: true,
        madurez: true,
      },
    });
    if (!riesgo) return { ok: false, mensaje: `No existe el riesgo ${codigoRiesgo}.` };
    if (!(await activoEnAnalisis(riesgo.activoId))) {
      return { ok: false, mensaje: FUERA_DE_ANALISIS };
    }

    const dimensiones = borrador.degradacion
      ? await prisma.dimension.findMany({
          where: { codigo: { in: DIMENSIONES_SESION as string[] } },
        })
      : [];
    const dimPorCodigo = new Map(dimensiones.map((d) => [d.codigo, d]));
    const baseDegPorDim = new Map(riesgo.amenaza.degradacion.map((b) => [b.dimension.codigo, b]));
    const ovDegPorDim = new Map(riesgo.degradacion.map((o) => [o.dimension.codigo, o]));

    const entradas: Cambio[] = [];
    const escriturasDegradacion: { dimensionId: number; degradacionId: number | null }[] = [];

    for (const d of DIMENSIONES_SESION) {
      if (!borrador.degradacion || !(d in borrador.degradacion)) continue;
      const destino = borrador.degradacion[d] ?? null;
      const dim = dimPorCodigo.get(d);
      if (!dim) return { ok: false, mensaje: `Dimensión desconocida: ${d}.` };

      let nombreDestino: string | null = null;
      if (destino !== null) {
        const escala = await prisma.escalaDegradacion.findUnique({ where: { id: destino } });
        if (!escala) {
          return { ok: false, mensaje: `La degradación elegida para ${d} no está en la escala.` };
        }
        nombreDestino = escala.nombre;
      }

      const base = baseDegPorDim.get(d);
      const heredada = `hereda ${base?.degradacion.nombre ?? 'No aplica'} de ${riesgo.amenaza.codigo}`;
      const previa = ovDegPorDim.get(d);
      const anteriorTexto = previa?.degradacion.nombre ?? heredada;
      const nuevoTexto = nombreDestino ?? heredada;
      if (anteriorTexto === nuevoTexto) continue;

      entradas.push({
        tabla: 'riesgo_degradacion',
        registroId: `${riesgo.codigo}/${d}`,
        campo: `degradación en ${d} (excepción)`,
        anterior: anteriorTexto,
        nuevo: nuevoTexto,
        motivo: razon,
      });
      escriturasDegradacion.push({ dimensionId: dim.id, degradacionId: destino });
    }

    let frecuenciaDestino: number | null | undefined;
    if (borrador.frecuenciaId !== undefined) {
      const destino = borrador.frecuenciaId;
      let nombreDestino: string | null = null;
      if (destino !== null) {
        const escala = await prisma.escalaFrecuencia.findUnique({ where: { id: destino } });
        if (!escala) return { ok: false, mensaje: 'La frecuencia elegida no está en la escala.' };
        nombreDestino = escala.nombre;
      }
      const heredada = `hereda ${riesgo.amenaza.frecuencia.nombre}`;
      const anteriorTexto = riesgo.frecuencia?.nombre ?? heredada;
      const nuevoTexto = nombreDestino ?? heredada;
      if (anteriorTexto !== nuevoTexto) {
        entradas.push({
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'frecuencia (excepción)',
          anterior: anteriorTexto,
          nuevo: nuevoTexto,
          motivo: razon,
        });
        frecuenciaDestino = destino;
      }
    }

    let madurezDestino: number | null | undefined;
    if (borrador.madurezId !== undefined) {
      const destino = borrador.madurezId;
      let nombreDestino: string | null = null;
      if (destino !== null) {
        const escala = await prisma.escalaMadurez.findUnique({ where: { id: destino } });
        if (!escala) return { ok: false, mensaje: 'La madurez elegida no está en la escala.' };
        nombreDestino = `L${escala.nivel}`;
      }
      const anteriorTexto = riesgo.madurez ? `L${riesgo.madurez.nivel}` : 'hereda de los controles';
      const nuevoTexto = nombreDestino ?? 'hereda de los controles';
      if (anteriorTexto !== nuevoTexto) {
        entradas.push({
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'madurez del riesgo (excepción)',
          anterior: anteriorTexto,
          nuevo: nuevoTexto,
          motivo: razon,
        });
        madurezDestino = destino;
      }
    }

    const escritos = await prisma.$transaction(async (tx) => {
      const total = await registrar(tx, autor, entradas);
      if (total === 0) return total;

      for (const e of escriturasDegradacion) {
        if (e.degradacionId === null) {
          await tx.riesgoDegradacion.deleteMany({
            where: { riesgoId: riesgo.id, dimensionId: e.dimensionId },
          });
        } else {
          await tx.riesgoDegradacion.upsert({
            where: { riesgoId_dimensionId: { riesgoId: riesgo.id, dimensionId: e.dimensionId } },
            update: { degradacionId: e.degradacionId, justificacion: razon },
            create: {
              riesgoId: riesgo.id,
              dimensionId: e.dimensionId,
              degradacionId: e.degradacionId,
              justificacion: razon,
            },
          });
        }
      }

      await tx.riesgo.update({
        where: { id: riesgo.id },
        data: {
          ...(frecuenciaDestino !== undefined ? { frecuenciaId: frecuenciaDestino } : {}),
          ...(madurezDestino !== undefined ? { madurezId: madurezDestino } : {}),
          justificacion: razon,
        },
      });

      return total;
    });

    if (escritos === 0) {
      return { ok: true, mensaje: 'No había cambios que guardar.', cambios: 0 };
    }

    await generarRiesgos(prisma);
    revalidarSgsi();

    // D17: el guardado SIEMPRE tuvo éxito arriba. Esto solo decide si la ficha abre el
    // popup prellenado — nunca decide si el cambio se guardó.
    let critico: { activoCodigo: string; amenazaCodigo: string } | undefined;
    const actualizado = await prisma.riesgo.findUnique({
      where: { id: riesgo.id },
      select: { riesgoResidual: true },
    });
    if (actualizado?.riesgoResidual != null && riesgo.activo.codigo) {
      const bandas = await prisma.umbralRiesgo.findMany();
      const banda = clasificar(
        actualizado.riesgoResidual.toString(),
        bandas.map((b) => ({ nombre: b.nombre, desde: b.desde.toString(), hasta: b.hasta.toString() })),
      );
      if (banda === BANDA_CRITICA) {
        critico = { activoCodigo: riesgo.activo.codigo, amenazaCodigo: riesgo.amenaza.codigo };
      }
    }

    return {
      ok: true,
      mensaje: `Se guardaron ${escritos} campos de ${codigoRiesgo}, con la nota registrada.`,
      cambios: escritos,
      critico,
    };
  });
}

/// A frequency off the threat's parameterisation, for this risk only.
///
/// The frequency is an attribute of the THREAT: one judgement per threat is what keeps
/// the same amenaza from having two different AROs on two assets for no written reason.
/// So a row here is an EXCEPTION and the justification is mandatory — including when it
/// is cleared, because going back to the inherited value is a change an auditor will
/// also ask about.
///
/// `frecuenciaId = null` clears the exception and the risk inherits again.
export async function excepcionFrecuencia(
  codigoRiesgo: string,
  frecuenciaId: number | null,
  justificacion: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('riesgo:tratar');
    exigirId(frecuenciaId, 'la frecuencia');

    const razon = normalizar(justificacion);
    if (razon === null) {
      return {
        ok: false,
        mensaje:
          'La excepción de frecuencia necesita una justificación escrita: se aparta de la parametrización de la amenaza y queda en la bitácora.',
      };
    }

    const riesgo = await prisma.riesgo.findUnique({
      where: { codigo: codigoRiesgo },
      include: { frecuencia: true, amenaza: { include: { frecuencia: true } } },
    });
    if (!riesgo) return { ok: false, mensaje: `No existe el riesgo ${codigoRiesgo}.` };
    if (!(await activoEnAnalisis(riesgo.activoId))) {
      return { ok: false, mensaje: FUERA_DE_ANALISIS };
    }

    let destino = frecuenciaId;
    let nombreDestino: string | null = null;
    if (destino !== null) {
      const escala = await prisma.escalaFrecuencia.findUnique({ where: { id: destino } });
      if (!escala) return { ok: false, mensaje: 'La frecuencia elegida no está en la escala.' };
      // Choosing exactly the threat's own frequency is not an exception, it is
      // inheritance. Storing it would leave a permanent orange mark on a row that
      // agrees with the parameterisation.
      if (destino === riesgo.amenaza.frecuenciaId) destino = null;
      else nombreDestino = escala.nombre;
    }

    const escritos = await prisma.$transaction(async (tx) => {
      const total = await registrar(tx, autor, [
        {
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'frecuencia (excepción)',
          anterior: riesgo.frecuencia?.nombre ?? `hereda ${riesgo.amenaza.frecuencia.nombre}`,
          nuevo: nombreDestino ?? `hereda ${riesgo.amenaza.frecuencia.nombre}`,
          motivo: razon,
        },
      ]);

      await tx.riesgo.update({
        where: { id: riesgo.id },
        // The justification belongs to the exception: with no exception there is
        // nothing to justify, and the reason for clearing it stays in the bitácora.
        data: { frecuenciaId: destino, justificacion: destino === null ? null : razon },
      });

      return total;
    });

    // The generator honours `riesgo.frecuenciaId` as the ARO, so the potential and the
    // residual both move with this.
    const diagnostico = await generarRiesgos(prisma);
    revalidarSgsi();

    return {
      ok: true,
      mensaje:
        destino === null
          ? `${codigoRiesgo} vuelve a heredar la frecuencia de ${riesgo.amenaza.codigo} y se recalcularon ${diagnostico.riesgosGenerados} riesgos.`
          : `Se guardó la excepción de frecuencia de ${codigoRiesgo} y se recalcularon ${diagnostico.riesgosGenerados} riesgos.`,
      cambios: escritos,
    };
  });
}

/// A degradation off the threat's parameterisation, for one dimension of one risk.
///
/// MET-SIG-01 section 7.4 says the LIMITING effect belongs to the THREAT: a control that
/// caps the damage is reflected by lowering `amenaza_degradacion`, so that there is one
/// judgement per row and not two. This table is therefore the exception, never the
/// normal path, and that is exactly why `riesgo_degradacion.justificacion` is NOT NULL —
/// the column cannot hold a deviation nobody explained.
///
/// One consequence worth knowing before wiring the screen: `degradacionId = null`
/// REMOVES the override row. The model carries no obsolete flag — its primary key is
/// riesgo+dimensión — so inheriting again means the row goes; the reason survives in the
/// bitácora, which is the record that matters.
///
/// `generarRiesgos` merges these overrides over the threat's baseline, so the figures do
/// move. That was not true when this action was first written and it is worth stating:
/// an exception that is stored, logged and then ignored by the arithmetic is worse than
/// one that is refused.
export async function excepcionDegradacion(
  codigoRiesgo: string,
  dimension: DimensionRiesgo,
  degradacionId: number | null,
  justificacion: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('riesgo:tratar');
    exigirId(degradacionId, 'la degradación');

    const razon = normalizar(justificacion);
    if (razon === null) {
      return {
        ok: false,
        mensaje:
          'La excepción de degradación necesita una justificación escrita: se aparta de la parametrización de la amenaza y la columna no admite vacío.',
      };
    }

    const riesgo = await prisma.riesgo.findUnique({
      where: { codigo: codigoRiesgo },
      include: { amenaza: true },
    });
    if (!riesgo) return { ok: false, mensaje: `No existe el riesgo ${codigoRiesgo}.` };
    if (!(await activoEnAnalisis(riesgo.activoId))) {
      return { ok: false, mensaje: FUERA_DE_ANALISIS };
    }

    const dim = await prisma.dimension.findUnique({ where: { codigo: dimension } });
    if (!dim) return { ok: false, mensaje: `Dimensión desconocida: ${dimension}.` };

    const nueva =
      degradacionId === null
        ? null
        : await prisma.escalaDegradacion.findUnique({ where: { id: degradacionId } });
    if (degradacionId !== null && !nueva) {
      return { ok: false, mensaje: 'La degradación elegida no está en la escala.' };
    }

    const [previa, base] = await Promise.all([
      prisma.riesgoDegradacion.findUnique({
        where: { riesgoId_dimensionId: { riesgoId: riesgo.id, dimensionId: dim.id } },
        include: { degradacion: true },
      }),
      prisma.amenazaDegradacion.findUnique({
        where: { amenazaId_dimensionId: { amenazaId: riesgo.amenazaId, dimensionId: dim.id } },
        include: { degradacion: true },
      }),
    ]);

    const heredada = `hereda ${base?.degradacion.nombre ?? 'No aplica'} de ${riesgo.amenaza.codigo}`;

    const escritos = await prisma.$transaction(async (tx) => {
      const total = await registrar(tx, autor, [
        {
          tabla: 'riesgo_degradacion',
          registroId: `${riesgo.codigo}/${dimension}`,
          campo: `degradación en ${dimension} (excepción)`,
          anterior: previa?.degradacion.nombre ?? heredada,
          nuevo: nueva?.nombre ?? heredada,
          motivo: razon,
        },
      ]);

      if (nueva === null) {
        if (previa) {
          await tx.riesgoDegradacion.delete({
            where: { riesgoId_dimensionId: { riesgoId: riesgo.id, dimensionId: dim.id } },
          });
        }
      } else {
        await tx.riesgoDegradacion.upsert({
          where: { riesgoId_dimensionId: { riesgoId: riesgo.id, dimensionId: dim.id } },
          update: { degradacionId: nueva.id, justificacion: razon },
          create: {
            riesgoId: riesgo.id,
            dimensionId: dim.id,
            degradacionId: nueva.id,
            justificacion: razon,
          },
        });
      }

      return total;
    });

    const diagnostico = await generarRiesgos(prisma);
    revalidarSgsi();

    return {
      ok: true,
      mensaje:
        nueva === null
          ? `${codigoRiesgo} vuelve a heredar la degradación en ${dimension} y se recalcularon ${diagnostico.riesgosGenerados} riesgos.`
          : `Se guardó la excepción de degradación en ${dimension} de ${codigoRiesgo} y se recalcularon ${diagnostico.riesgosGenerados} riesgos.`,
      cambios: escritos,
    };
  });
}

/// Takes a threat out of the analysis for one asset. Logical only: the row keeps its
/// code, its valuation and its history, and the reason is mandatory.
///
/// `excluidoManual` is what makes the removal stick. The parameterisation still covers
/// the pair, so without that flag the generator would read the row as one that came back
/// into scope and clear `obsoleto` on its next run — which any later save of a maturity
/// or a valuation would trigger.
export async function quitarAmenazaDelActivo(
  codigoRiesgo: string,
  motivo: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('riesgo:tratar');

    const razon = normalizar(motivo);
    if (razon === null) {
      return {
        ok: false,
        mensaje: 'Quitar una amenaza necesita un motivo: queda en la bitácora, no se borra nada.',
      };
    }

    const riesgo = await prisma.riesgo.findUnique({ where: { codigo: codigoRiesgo } });
    if (!riesgo) return { ok: false, mensaje: `No existe el riesgo ${codigoRiesgo}.` };
    if (riesgo.obsoleto) {
      return { ok: true, mensaje: `${codigoRiesgo} ya estaba fuera del análisis.`, cambios: 0 };
    }

    await prisma.$transaction(async (tx) => {
      await registrarBaja(tx, autor, 'riesgo', riesgo.codigo, razon);
      await tx.riesgo.update({
        where: { id: riesgo.id },
        data: { obsoleto: true, obsoletoEn: new Date(), excluidoManual: true },
      });
    });

    await generarRiesgos(prisma);

    revalidarSgsi();

    return {
      ok: true,
      mensaje: `${codigoRiesgo} salió del análisis. No se borró: queda con su historia y se puede deshacer.`,
      cambios: 1,
    };
  });
}

/// The undo band on the sheet. Brings the risk back and recomputes its figures, which
/// may have moved while it was out.
export async function restaurarAmenaza(codigoRiesgo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('riesgo:tratar');

    const riesgo = await prisma.riesgo.findUnique({ where: { codigo: codigoRiesgo } });
    if (!riesgo) return { ok: false, mensaje: `No existe el riesgo ${codigoRiesgo}.` };
    if (!riesgo.obsoleto) {
      return { ok: true, mensaje: `${codigoRiesgo} ya estaba en el análisis.`, cambios: 0 };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'riesgo',
          registroId: riesgo.codigo,
          campo: 'baja lógica',
          anterior: 'dado de baja',
          nuevo: 'vigente',
          motivo: 'Se deshizo la baja',
        },
      ]);
      // Clearing `excluidoManual` too is what lets the generator take the pair back and
      // recompute it; leaving the flag would keep skipping the row forever.
      await tx.riesgo.update({
        where: { id: riesgo.id },
        data: { obsoleto: false, obsoletoEn: null, excluidoManual: false },
      });
    });

    const diagnostico = await generarRiesgos(prisma);
    revalidarSgsi();

    return {
      ok: true,
      mensaje: `${codigoRiesgo} volvió al análisis y se recalcularon ${diagnostico.riesgosGenerados} riesgos.`,
      cambios: 1,
    };
  });
}

/// Blank is not a value: an empty string and a whitespace-only string both mean "no
/// text", and storing one of them is how a NOT NULL justification ends up meaningless.
function normalizar(valor: string | null | undefined): string | null {
  const texto = valor?.trim() ?? '';
  return texto === '' ? null : texto;
}

function revalidarSgsi(): void {
  for (const ruta of [
    '/',
    '/sgsi',
    '/sgsi/inventario',
    '/sgsi/matrices',
    '/sgsi/controles',
    '/sgsi/planes',
  ]) {
    revalidatePath(ruta);
  }
}
