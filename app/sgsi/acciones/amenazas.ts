'use server';

// app/sgsi/acciones/amenazas.ts
//
// The control↔threat pairing: the `control_amenaza` table.
//
// This is the parameterisation that makes residual risk computable at all. The threat's
// efficacy is aggregated from the current maturity of the controls paired with it, the
// residual frequency derives from that efficacy, and the residual risk derives from the
// frequency — so adding or removing one pair moves every residual risk that threat touches.
// Which is why each of these actions recalculates, in the same call.
//
// RELEVANCE IS OPTIONAL, and null means something precise: aggregate this threat the way
// the workbook's own AVERAGE does — weight 1, no principal, hence a plain mean over its
// controls (MET-SIG-01 v2). Assigning a relevance moves that threat to the weighted mean
// capped by the principal (v3 §7.4). `relevanciaId` was NOT NULL until now, and that is
// exactly why the «+ Agregar control implementado» button was a link to another screen
// instead of an alta: the pair could not be recorded without a decision nobody had made.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

const RUTAS = [
  '/sgsi/controles',
  '/sgsi/amenazas',
  '/sgsi/matrices',
  '/sgsi/inventario',
  '/sgsi',
  '/',
];

function revalidar(): void {
  for (const ruta of RUTAS) revalidatePath(ruta);
}

export interface ControlAsociado {
  codigo: string;
  nombre: string;
  nivel: number | null;
  soa: 'si' | 'parcial' | 'no';
  /// Null while the pair carries no relevance: the pair counts, aggregated as a plain mean.
  relevancia: string | null;
}

export interface ControlesDeAmenaza {
  ok: boolean;
  mensaje: string;
  amenaza: string;
  asociados: ControlAsociado[];
  /// Applicable catalogue controls not yet paired with this threat.
  disponibles: { codigo: string; nombre: string; nivel: number | null }[];
  relevancias: { nombre: string; peso: number; esPrincipal: boolean; criterio: string }[];
}

/// Reads one threat's pairing plus what is still available to add.
export async function controlesDeAmenaza(codigoAmenaza: string): Promise<ControlesDeAmenaza> {
  const vacio = { amenaza: codigoAmenaza, asociados: [], disponibles: [], relevancias: [] };
  try {
    // Reading the pairing is not changing it: `sgsi:ver` opens the popup, and the buttons
    // inside still go through actions that demand `parametrizacion:escribir`.
    await autorConPermiso('sgsi:ver');

    const amenaza = await prisma.amenaza.findUnique({ where: { codigo: codigoAmenaza } });
    if (!amenaza) {
      return { ok: false, mensaje: `No existe la amenaza ${codigoAmenaza}.`, ...vacio };
    }

    const [pares, controles, relevancias] = await Promise.all([
      prisma.controlAmenaza.findMany({
        where: { amenazaId: amenaza.id },
        include: { relevancia: true, control: { include: { actual: true } } },
      }),
      // Only applicable controls are offered. A control marked "no aplica" has no maturity
      // by constraint, so pairing it would enter the threat's mean as a zero and drag the
      // efficacy down for a reason that is not real. PARCIAL counts as applicable.
      prisma.control.findMany({
        where: { soa: { not: 'NO' } },
        include: { actual: true },
        orderBy: { codigo: 'asc' },
      }),
      prisma.relevanciaControl.findMany({ orderBy: { orden: 'asc' } }),
    ]);

    const yaEstan = new Set(pares.map((p) => p.control.codigo));

    return {
      ok: true,
      mensaje: '',
      amenaza: amenaza.codigo,
      asociados: pares
        .map((p) => ({
          codigo: p.control.codigo,
          nombre: p.control.nombre,
          nivel: p.control.actual?.nivel ?? null,
          soa: (p.control.soa === 'PARCIAL' ? 'parcial' : p.control.soa === 'NO' ? 'no' : 'si') as ControlAsociado['soa'],
          relevancia: p.relevancia?.nombre ?? null,
        }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      disponibles: controles
        .filter((c) => !yaEstan.has(c.codigo))
        .map((c) => ({ codigo: c.codigo, nombre: c.nombre, nivel: c.actual?.nivel ?? null })),
      relevancias: relevancias.map((r) => ({
        nombre: r.nombre,
        peso: r.peso,
        esPrincipal: r.esPrincipal,
        criterio: r.criterio,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No pude leer los controles.',
      ...vacio,
    };
  }
}

/// Pairs a control with a threat. Relevance optional — see the module header.
export async function asociarControl(
  codigoAmenaza: string,
  codigoControl: string,
  relevancia?: string | null,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');

    const [amenaza, control] = await Promise.all([
      prisma.amenaza.findUnique({ where: { codigo: codigoAmenaza } }),
      prisma.control.findUnique({ where: { codigo: codigoControl } }),
    ]);
    if (!amenaza) throw new Error(`No existe la amenaza ${codigoAmenaza}.`);
    if (!control) throw new Error(`No existe el control ${codigoControl}.`);

    if (control.soa === 'NO') {
      return {
        ok: false,
        mensaje: `${control.codigo} está marcado como «no aplica», así que no tiene madurez y no puede mitigar nada. Cambiá su declaración de aplicabilidad antes de asociarlo.`,
      };
    }

    const previo = await prisma.controlAmenaza.findUnique({
      where: { amenazaId_controlId: { amenazaId: amenaza.id, controlId: control.id } },
    });
    if (previo) {
      return { ok: false, mensaje: `${control.codigo} ya está asociado a ${amenaza.codigo}.` };
    }

    let relevanciaId: number | null = null;
    let nombreRelevancia: string | null = null;
    if (relevancia) {
      const fila = await prisma.relevanciaControl.findUnique({ where: { nombre: relevancia } });
      if (!fila) throw new Error(`Relevancia desconocida: «${relevancia}».`);
      // Exactly one Principal per threat, per MET-SIG-01 §7.4. Two of them make the δ cap
      // ambiguous — it would be capped by whichever row the query happened to return first.
      if (fila.esPrincipal) {
        const yaHay = await prisma.controlAmenaza.count({
          where: { amenazaId: amenaza.id, relevancia: { esPrincipal: true } },
        });
        if (yaHay > 0) {
          return {
            ok: false,
            mensaje: `${amenaza.codigo} ya tiene un control Principal, y cada amenaza tiene exactamente uno. Pasá el actual a Complementario antes de nombrar otro.`,
          };
        }
      }
      relevanciaId = fila.id;
      nombreRelevancia = fila.nombre;
    }

    await prisma.$transaction(async (tx) => {
      await tx.controlAmenaza.create({
        data: { amenazaId: amenaza.id, controlId: control.id, relevanciaId },
      });
      await registrar(tx, autor, [
        {
          tabla: 'control_amenaza',
          registroId: `${amenaza.codigo}|${control.codigo}`,
          campo: 'asociación',
          anterior: null,
          nuevo: nombreRelevancia ?? 'sin relevancia asignada',
        },
      ]);
    });

    const d = await generarRiesgos(prisma);
    revalidar();

    return {
      ok: true,
      mensaje:
        `${control.codigo} quedó asociado a ${amenaza.codigo}` +
        (nombreRelevancia
          ? ` como ${nombreRelevancia}. `
          : ' sin relevancia: esa amenaza agrega con la media plana de sus controles. ') +
        `Se recalcularon ${d.riesgosGenerados} riesgos.`,
      cambios: 1,
    };
  });
}

/// Changes the relevance of an existing pair, in either direction — including back to null.
export async function cambiarRelevancia(
  codigoAmenaza: string,
  codigoControl: string,
  relevancia: string | null,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');

    const [amenaza, control] = await Promise.all([
      prisma.amenaza.findUnique({ where: { codigo: codigoAmenaza } }),
      prisma.control.findUnique({ where: { codigo: codigoControl } }),
    ]);
    if (!amenaza || !control) throw new Error('La amenaza o el control ya no existen.');

    const par = await prisma.controlAmenaza.findUnique({
      where: { amenazaId_controlId: { amenazaId: amenaza.id, controlId: control.id } },
      include: { relevancia: true },
    });
    if (!par) return { ok: false, mensaje: 'Esa asociación no existe.' };

    let relevanciaId: number | null = null;
    if (relevancia) {
      const fila = await prisma.relevanciaControl.findUnique({ where: { nombre: relevancia } });
      if (!fila) throw new Error(`Relevancia desconocida: «${relevancia}».`);
      if (fila.esPrincipal) {
        const otro = await prisma.controlAmenaza.count({
          where: {
            amenazaId: amenaza.id,
            controlId: { not: control.id },
            relevancia: { esPrincipal: true },
          },
        });
        if (otro > 0) {
          return {
            ok: false,
            mensaje: `${amenaza.codigo} ya tiene otro control Principal. Cada amenaza tiene exactamente uno.`,
          };
        }
      }
      relevanciaId = fila.id;
    }

    const anterior = par.relevancia?.nombre ?? null;
    if (anterior === relevancia) return { ok: true, mensaje: 'La relevancia no cambió.', cambios: 0 };

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'control_amenaza',
          registroId: `${amenaza.codigo}|${control.codigo}`,
          campo: 'relevancia',
          anterior: anterior ?? 'sin asignar',
          nuevo: relevancia ?? 'sin asignar',
        },
      ]);
      await tx.controlAmenaza.update({
        where: { amenazaId_controlId: { amenazaId: amenaza.id, controlId: control.id } },
        data: { relevanciaId },
      });
    });

    const d = await generarRiesgos(prisma);
    revalidar();

    return {
      ok: true,
      mensaje:
        relevancia === null
          ? `${control.codigo} volvió a «sin asignar»: ${amenaza.codigo} agrega con la media plana. Se recalcularon ${d.riesgosGenerados} riesgos.`
          : `${control.codigo} quedó como ${relevancia} en ${amenaza.codigo}. Se recalcularon ${d.riesgosGenerados} riesgos.`,
      cambios: 1,
    };
  });
}

/// Removes a pair. The reason is mandatory, and the last control of a threat is refused.
export async function desasociarControl(
  codigoAmenaza: string,
  codigoControl: string,
  motivo: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');
    if (!motivo.trim()) {
      return {
        ok: false,
        mensaje:
          'La baja de la asociación necesita un motivo: baja la eficacia de la amenaza y sube su riesgo residual, y eso tiene que quedar explicado.',
      };
    }

    const [amenaza, control] = await Promise.all([
      prisma.amenaza.findUnique({ where: { codigo: codigoAmenaza } }),
      prisma.control.findUnique({ where: { codigo: codigoControl } }),
    ]);
    if (!amenaza || !control) throw new Error('La amenaza o el control ya no existen.');

    const par = await prisma.controlAmenaza.findUnique({
      where: { amenazaId_controlId: { amenazaId: amenaza.id, controlId: control.id } },
      include: { relevancia: true },
    });
    if (!par) return { ok: false, mensaje: 'Esa asociación ya no existe.' };

    // The LAST control of a threat is a different decision, not a smaller one: with no
    // controls the threat's efficacy is UNKNOWN, not zero, and every residual risk it
    // touches goes back to «sin calcular». Refused rather than done quietly.
    const restantes = await prisma.controlAmenaza.count({ where: { amenazaId: amenaza.id } });
    if (restantes <= 1) {
      return {
        ok: false,
        mensaje: `${control.codigo} es el último control de ${amenaza.codigo}. Si lo quitás, la eficacia de esa amenaza queda desconocida y sus riesgos residuales vuelven a «sin calcular» — desconocido no es cero. Asociá otro control antes de quitar este.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'control_amenaza',
          registroId: `${amenaza.codigo}|${control.codigo}`,
          campo: 'asociación',
          anterior: par.relevancia?.nombre ?? 'sin relevancia asignada',
          nuevo: null,
          motivo: motivo.trim(),
        },
      ]);
      await tx.controlAmenaza.delete({
        where: { amenazaId_controlId: { amenazaId: amenaza.id, controlId: control.id } },
      });
    });

    const d = await generarRiesgos(prisma);
    revalidar();

    return {
      ok: true,
      mensaje: `Se quitó ${control.codigo} de ${amenaza.codigo}. Quedan ${restantes - 1} controles y se recalcularon ${d.riesgosGenerados} riesgos.`,
      cambios: 1,
    };
  });
}
