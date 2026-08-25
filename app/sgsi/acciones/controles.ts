'use server';

// app/sgsi/acciones/controles.ts
//
// Persisting a control's maturity is not a local edit: efficacy derives from it, the
// residual frequency derives from efficacy, and every risk that control mitigates moves
// with it. So the save and the recalculation are one transaction — a maturity that is
// stored while the risks still hold the old figure is the "cifras contradictorias"
// failure, arriving by a different door.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

export interface CambioMadurez {
  codigoControl: string;
  nivel: number;
}

export type TipoEvidencia = 'ENLACE' | 'ARCHIVO' | 'NOTA';

/// Batch entry: each line, or each `;`-separated fragment, becomes one evidence entry.
/// The prototype also splits on `|`, so that separator is honoured too.
export async function agregarEvidencias(
  codigoControl: string,
  tipo: TipoEvidencia,
  texto: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const entradas = texto
      .split(/[\n;|]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (entradas.length === 0) {
      return { ok: false, mensaje: 'Escribí al menos una evidencia.' };
    }

    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: { evidencias: true },
    });
    if (!control) return { ok: false, mensaje: `No existe el control ${codigoControl}.` };

    await prisma.$transaction(async (tx) => {
      let orden = control.evidencias.length;
      for (const t of entradas) {
        await tx.evidencia.create({
          data: { controlId: control.id, tipo, texto: t, esBase: false, orden: orden++, creadaPor: autor },
        });
      }
      await registrar(
        tx,
        autor,
        entradas.map((t) => ({
          tabla: 'evidencia',
          registroId: control.codigo,
          campo: `evidencia (${tipo.toLowerCase()})`,
          anterior: null,
          nuevo: t,
        })),
      );
    });

    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi');
    return {
      ok: true,
      mensaje: `Se agregaron ${entradas.length} ${entradas.length === 1 ? 'evidencia' : 'evidencias'} a ${codigoControl}.`,
      cambios: entradas.length,
    };
  });
}

/// The base evidence — the text that justified the rating, or the non-applicability
/// justification for a control that does not apply — cannot be removed. It is the record
/// the Committee approved, not an attachment.
export async function quitarEvidencia(id: number, motivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    if (!motivo.trim()) {
      return { ok: false, mensaje: 'Quitar una evidencia necesita un motivo: queda en la bitácora.' };
    }

    const evidencia = await prisma.evidencia.findUnique({
      where: { id },
      include: { control: true },
    });
    if (!evidencia) return { ok: false, mensaje: 'Esa evidencia ya no existe.' };
    if (evidencia.esBase) {
      return {
        ok: false,
        mensaje:
          'La evidencia base de la evaluación no se puede quitar: es la que sustenta el nivel ante un auditor.',
      };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'evidencia',
          registroId: evidencia.control.codigo,
          campo: 'evidencia retirada',
          anterior: evidencia.texto,
          nuevo: null,
          motivo,
        },
      ]);
      await tx.evidencia.delete({ where: { id } });
    });

    revalidatePath('/sgsi/controles');
    return { ok: true, mensaje: 'Se retiró la evidencia.', cambios: 1 };
  });
}

/// Sets the TARGET maturity of one control.
///
/// The target is the Committee's commitment, not an assessment: it is what «brecha» and
/// «cumple objetivo» are measured against on the Controles screen, and the workbook carries
/// it as column I of «4. Controles y Madurez». It is deliberately a separate action from
/// `guardarMadurez` — raising a target is a decision, lowering it to meet the current level
/// is how a gap disappears without anything improving, and the two must be distinguishable
/// in the bitácora.
///
/// It does NOT recalculate risks: residual risk derives from the CURRENT level, never from
/// the target. Recalculating here would suggest a commitment changes exposure.
export async function guardarMadurezObjetivo(
  codigoControl: string,
  nivel: number | null,
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');

    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: { objetivo: true },
    });
    if (!control) throw new Error(`No existe el control ${codigoControl}`);
    if (!control.aplica) {
      return {
        ok: false,
        mensaje: `El control ${codigoControl} no aplica, así que no lleva objetivo de madurez.`,
      };
    }

    let objetivoId: number | null = null;
    if (nivel !== null) {
      const fila = await prisma.escalaMadurez.findUnique({ where: { nivel } });
      if (!fila) throw new Error(`Nivel de madurez inválido: ${nivel}`);
      objetivoId = fila.id;
    }

    const anterior = control.objetivo ? `L${control.objetivo.nivel}` : null;
    const nuevo = nivel === null ? null : `L${nivel}`;
    if (anterior === nuevo) return { ok: true, mensaje: 'El objetivo no cambió.', cambios: 0 };

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'control',
          registroId: control.codigo,
          campo: 'madurez objetivo',
          anterior,
          nuevo,
          motivo: motivo ?? null,
        },
      ]);
      await tx.control.update({ where: { id: control.id }, data: { objetivoId } });
    });

    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi/planes');
    revalidatePath('/sgsi');

    return {
      ok: true,
      mensaje:
        nuevo === null
          ? `Se quitó el objetivo de ${control.codigo}. Sin objetivo no hay brecha que medir.`
          : `Objetivo de ${control.codigo}: ${nuevo}. La brecha y «cumple objetivo» se recalculan contra este nivel; el riesgo residual no cambia, porque deriva de la madurez actual.`,
      cambios: 1,
    };
  });
}

/// Saves one or many maturity levels and recalculates the risks they affect.
export async function guardarMadurez(
  cambios: CambioMadurez[],
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    if (cambios.length === 0) return { ok: true, mensaje: 'No había cambios.', cambios: 0 };

    const niveles = await prisma.escalaMadurez.findMany();
    const porNivel = new Map(niveles.map((n) => [n.nivel, n.id]));

    const escritos = await prisma.$transaction(async (tx) => {
      let total = 0;

      for (const c of cambios) {
        const control = await tx.control.findUnique({
          where: { codigo: c.codigoControl },
          include: { actual: true },
        });
        if (!control) throw new Error(`No existe el control ${c.codigoControl}`);

        // A control that does not apply has no level at all: its maturity is null by
        // constraint, and letting a zero in is what pollutes every average.
        if (!control.aplica) {
          throw new Error(
            `El control ${c.codigoControl} no aplica, así que no lleva nivel de madurez.`,
          );
        }

        const actualId = porNivel.get(c.nivel);
        if (actualId === undefined) throw new Error(`Nivel de madurez inválido: ${c.nivel}`);

        total += await registrar(tx, autor, [
          {
            tabla: 'control',
            registroId: control.codigo,
            campo: 'madurez actual',
            anterior: control.actual ? `L${control.actual.nivel}` : null,
            nuevo: `L${c.nivel}`,
            motivo: motivo ?? null,
          },
        ]);

        await tx.control.update({ where: { id: control.id }, data: { actualId } });
      }

      return total;
    });

    // Efficacy changed, so the residual side of every affected risk is stale. The
    // generator is the single writer of those columns.
    const diagnostico = await generarRiesgos(prisma);

    revalidatePath('/sgsi');
    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi/matrices');
    revalidatePath('/sgsi/planes');
    revalidatePath('/sgsi/inventario');
    revalidatePath('/');

    const nota =
      diagnostico.residualSinCalcular > 0
        ? ` El residual sigue sin calcular en ${diagnostico.residualSinCalcular} riesgos: falta asignar la relevancia de los pares control-amenaza.`
        : '';

    return {
      ok: true,
      mensaje: escritos === 0
        ? 'No había cambios que guardar.'
        : `Se guardaron ${escritos} cambios de madurez y se recalcularon ${diagnostico.riesgosGenerados} riesgos.${nota}`,
      cambios: escritos,
    };
  });
}
