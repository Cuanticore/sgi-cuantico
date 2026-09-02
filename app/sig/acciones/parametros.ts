'use server';

// app/sig/acciones/parametros.ts
//
// Guardar las tablas del método (MAN-CAL-01). El lienzo de Parámetros las pide editables
// con «Guardar», «+ Agregar nivel» y «Historial de esta tabla», y no había ninguna acción
// para escribirlas: las seis tablas eran de sólo lectura y el único camino era la base.
//
// D4 es lo que hace esto posible sin migraciones ni recálculos: los registros guardan la
// REFERENCIA al nivel, no el número. Cambiar «Fuerte» de 0,8 a 0,9 recalcula los 66
// riesgos al leer, sin tocar una fila de `riesgo_organizacional`.
//
// Y es también lo que lo hace peligroso: una tabla mal guardada no rompe ninguna pantalla.
// Deja riesgos clasificados en la banda equivocada, y eso se descubre en una auditoría. Por
// eso la validación vive en `lib/sig/parametros.ts`, es pura, y corre ANTES de escribir.

import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import {
  validarEficacias,
  validarEscala,
  validarMotivo,
  validarNiveles,
  type FilaEficacia,
  type FilaEscala,
  type FilaNivel,
} from '@/lib/sig/parametros';

export interface ResultadoParametros extends Resultado {
  /// Avisos que no impidieron guardar pero que hay que leer.
  avisos: string[];
}

const SIN_AVISOS = { avisos: [] as string[] };

// ── Niveles de riesgo y su tratamiento ──

export async function guardarNiveles(
  filas: FilaNivel[],
  motivo: string,
): Promise<ResultadoParametros> {
  return ejecutar<ResultadoParametros>(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');
    const problema = validarMotivo(motivo);
    if (problema) return { ok: false, mensaje: problema, ...SIN_AVISOS };

    // El máximo posible sale de las escalas vigentes, no de un 25 escrito a mano: el
    // método puede parametrizar escalas de otro tamaño y la validación no debe quedar
    // vieja el día que eso pase.
    const [maxP, maxI] = await Promise.all([
      prisma.escalaProbabilidad.aggregate({ _max: { valor: true } }),
      prisma.escalaImpactoRiesgo.aggregate({ _max: { valor: true } }),
    ]);
    const maximoPosible = (maxP._max.valor ?? 5) * (maxI._max.valor ?? 5);

    const v = validarNiveles(filas, maximoPosible);
    if (v.errores.length > 0) {
      return { ok: false, mensaje: v.errores.join('. '), avisos: v.avisos };
    }

    const previas = await prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } });
    const porId = new Map(previas.map((p) => [p.id, p]));
    const enviados = new Set(filas.map((f) => f.id).filter((x): x is number => x !== undefined));

    let creados = 0;
    let borrados = 0;
    await prisma.$transaction(async (tx) => {
      // Se borra ANTES de escribir por la unique de `minimo`: reasignar el 9 a otra fila
      // choca con la que todavía lo tiene. Mismo problema que el orden de los ítems de una
      // lista de verificación, y misma solución — liberar primero.
      for (const p of previas) {
        if (enviados.has(p.id)) continue;
        await tx.nivelRiesgo.delete({ where: { id: p.id } });
        await registrarBaja(tx, autor, 'nivel_riesgo', String(p.id), motivo);
        borrados++;
      }
      // Los mínimos se liberan en negativo para que un reordenamiento no choque consigo
      // mismo a mitad de camino.
      for (const f of filas) {
        if (f.id === undefined) continue;
        await tx.nivelRiesgo.update({ where: { id: f.id }, data: { minimo: -f.minimo } });
      }
      for (const f of filas) {
        const datos = {
          minimo: f.minimo,
          maximo: f.maximo,
          etiqueta: f.etiqueta.trim(),
          color: f.color,
          accionRiesgo: f.accionRiesgo.trim(),
          accionOportunidad: f.accionOportunidad.trim(),
        };
        if (f.id === undefined) {
          const creado = await tx.nivelRiesgo.create({ data: datos });
          await registrarAlta(tx, autor, 'nivel_riesgo', String(creado.id));
          creados++;
          continue;
        }
        const previa = porId.get(f.id);
        await tx.nivelRiesgo.update({ where: { id: f.id }, data: datos });
        if (!previa) continue;
        await registrar(
          tx,
          autor,
          (
            [
              ['minimo', previa.minimo, datos.minimo],
              ['maximo', previa.maximo, datos.maximo],
              ['etiqueta', previa.etiqueta, datos.etiqueta],
              ['color', previa.color, datos.color],
              ['accionRiesgo', previa.accionRiesgo, datos.accionRiesgo],
              ['accionOportunidad', previa.accionOportunidad, datos.accionOportunidad],
            ] as const
          ).map(([campo, anterior, nuevo]) => ({
            tabla: 'nivel_riesgo',
            registroId: String(f.id),
            campo,
            anterior,
            nuevo,
            motivo,
          })),
        );
      }
    });

    return {
      ok: true,
      mensaje:
        `Niveles guardados: ${filas.length} banda(s)` +
        (creados > 0 ? `, ${creados} nueva(s)` : '') +
        (borrados > 0 ? `, ${borrados} retirada(s)` : '') +
        '. Los 66 registros se reclasifican al leer, sin tocar un solo dato.',
      avisos: v.avisos,
    };
  });
}

// ── Escalas de probabilidad e impacto ──

export type TablaEscala = 'probabilidad' | 'impactoRiesgo' | 'impactoOportunidad';

const TABLA_DE: Record<TablaEscala, { modelo: string; etiqueta: string }> = {
  probabilidad: { modelo: 'escala_probabilidad', etiqueta: 'probabilidad' },
  impactoRiesgo: { modelo: 'escala_impacto_riesgo', etiqueta: 'impacto de riesgo' },
  impactoOportunidad: { modelo: 'escala_impacto_oportunidad', etiqueta: 'impacto de oportunidad' },
};

/// Sólo la ETIQUETA de una escala se edita acá, no su valor.
///
/// El valor es el eje del mapa de calor y la variable de la multiplicación: cambiarlo
/// reordena la malla y recalcula todo. Eso no es un renombre, es rehacer el método, y va
/// con la restauración del MAN-CAL-01 o con una migración — no con un campo de texto que
/// alguien puede pisar sin darse cuenta.
export async function guardarEtiquetasDeEscala(
  tabla: TablaEscala,
  filas: FilaEscala[],
  motivo: string,
): Promise<ResultadoParametros> {
  return ejecutar<ResultadoParametros>(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');
    const problema = validarMotivo(motivo);
    if (problema) return { ok: false, mensaje: problema, ...SIN_AVISOS };

    const v = validarEscala(filas);
    if (v.errores.length > 0) {
      return { ok: false, mensaje: v.errores.join('. '), avisos: v.avisos };
    }

    const meta = TABLA_DE[tabla];
    let cambiados = 0;
    await prisma.$transaction(async (tx) => {
      for (const f of filas) {
        if (f.id === undefined) continue;
        const etiqueta = f.etiqueta.trim();
        const previa =
          tabla === 'probabilidad'
            ? await tx.escalaProbabilidad.findUnique({ where: { id: f.id } })
            : tabla === 'impactoRiesgo'
              ? await tx.escalaImpactoRiesgo.findUnique({ where: { id: f.id } })
              : await tx.escalaImpactoOportunidad.findUnique({ where: { id: f.id } });
        if (!previa || previa.etiqueta === etiqueta) continue;

        if (tabla === 'probabilidad') {
          await tx.escalaProbabilidad.update({ where: { id: f.id }, data: { etiqueta } });
        } else if (tabla === 'impactoRiesgo') {
          await tx.escalaImpactoRiesgo.update({ where: { id: f.id }, data: { etiqueta } });
        } else {
          await tx.escalaImpactoOportunidad.update({ where: { id: f.id }, data: { etiqueta } });
        }
        await registrar(tx, autor, [
          {
            tabla: meta.modelo,
            registroId: String(f.id),
            campo: 'etiqueta',
            anterior: previa.etiqueta,
            nuevo: etiqueta,
            motivo,
          },
        ]);
        cambiados++;
      }
    });

    return {
      ok: true,
      mensaje:
        cambiados === 0
          ? 'No cambió ninguna etiqueta.'
          : `${cambiados} etiqueta(s) de ${meta.etiqueta} actualizada(s).`,
      avisos: v.avisos,
    };
  });
}

// ── Mediciones de eficacia del control ──

export async function guardarEficacias(
  filas: FilaEficacia[],
  motivo: string,
): Promise<ResultadoParametros> {
  return ejecutar<ResultadoParametros>(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');
    const problema = validarMotivo(motivo);
    if (problema) return { ok: false, mensaje: problema, ...SIN_AVISOS };

    const v = validarEficacias(filas);
    if (v.errores.length > 0) {
      return { ok: false, mensaje: v.errores.join('. '), avisos: v.avisos };
    }

    let cambiados = 0;
    await prisma.$transaction(async (tx) => {
      for (const f of filas) {
        if (f.id === undefined) continue;
        const previa = await tx.eficaciaControl.findUnique({ where: { id: f.id } });
        if (!previa) continue;
        const nombre = f.nombre.trim();
        const antes = Number(previa.valor);
        if (previa.nombre === nombre && antes === f.valor) continue;

        await tx.eficaciaControl.update({
          where: { id: f.id },
          data: { nombre, valor: f.valor },
        });
        await registrar(tx, autor, [
          {
            tabla: 'eficacia_control',
            registroId: String(f.id),
            campo: 'nombre',
            anterior: previa.nombre,
            nuevo: nombre,
            motivo,
          },
          {
            tabla: 'eficacia_control',
            registroId: String(f.id),
            campo: 'valor',
            anterior: antes,
            nuevo: f.valor,
            motivo,
          },
        ]);
        cambiados++;
      }
    });

    return {
      ok: true,
      mensaje:
        cambiados === 0
          ? 'No cambió ninguna medición.'
          : `${cambiados} medición(es) actualizada(s). El residual de cada riesgo se recalcula al leer.`,
      avisos: v.avisos,
    };
  });
}
