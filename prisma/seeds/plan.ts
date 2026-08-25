// prisma/seeds/plan.ts
//
// The 25 treatment-plan actions. One row per improvement to a CONTROL, never per risk:
// a single action on a control moves every risk that control mitigates, and modelling
// it per risk would duplicate the same decision hundreds of times.
//
// The "risks it moves" counts are NOT seeded. The workbook's figures were computed over
// the prototype's sample; they are recomputed at read time against the real inventory.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EstadoAccion, PrismaClient, TipoAccion, VerificacionEficacia } from '@prisma/client';
import { NORMALIZAR_CARGO } from './magerit';

const DATA = join(process.cwd(), 'prisma', 'data');

interface AccionSeed {
  cod: string;
  accion: string;
  tipo: string;
  ctl: string;
  origen: string;
  resp: string;
  aprueba: string;
  fecha: string | null;
  estado: string;
  avance: number;
  verif: string;
  obs: string;
}

const TIPO: Record<string, TipoAccion> = {
  'Mitigar': 'MITIGAR',
  'Transferir': 'TRANSFERIR',
  'Evitar': 'EVITAR',
  'Aceptar': 'ACEPTAR',
};

const ESTADO: Record<string, EstadoAccion> = {
  'No iniciada': 'NO_INICIADA',
  'En ejecución': 'EN_EJECUCION',
  'En verificación': 'EN_VERIFICACION',
  'Cerrada': 'CERRADA',
  'Cancelada': 'CANCELADA',
};

const VERIFICACION: Record<string, VerificacionEficacia> = {
  'Pendiente': 'PENDIENTE',
  'Verificada — eficaz': 'VERIFICADA_EFICAZ',
  'Verificada — no eficaz': 'VERIFICADA_NO_EFICAZ',
  'No aplica': 'NO_APLICA',
};

export async function seedPlan(prisma: PrismaClient): Promise<number> {
  const acciones: AccionSeed[] = JSON.parse(
    readFileSync(join(DATA, 'plan-tratamiento.json'), 'utf8'),
  );

  const controlPorCodigo = new Map((await prisma.control.findMany()).map((c) => [c.codigo, c.id]));
  const cargoPorNombre = new Map((await prisma.cargoResponsable.findMany()).map((c) => [c.nombre, c.id]));

  const cargo = async (nombre: string): Promise<number> => {
    const limpio = NORMALIZAR_CARGO[nombre.trim()] ?? nombre.trim();
    const existente = cargoPorNombre.get(limpio);
    if (existente) return existente;
    // The plan references roles the asset inventory never used; they belong in the
    // closed list too rather than being dropped.
    const creado = await prisma.cargoResponsable.create({
      data: { nombre: limpio, orden: cargoPorNombre.size + 1 },
    });
    cargoPorNombre.set(limpio, creado.id);
    return creado.id;
  };

  for (const a of acciones) {
    const tipo = TIPO[a.tipo.trim()];
    if (!tipo) throw new Error(`${a.cod}: tipo de acción desconocido "${a.tipo}"`);
    const estado = ESTADO[a.estado.trim()];
    if (!estado) throw new Error(`${a.cod}: estado desconocido "${a.estado}"`);
    const verificacion = VERIFICACION[a.verif.trim()];
    if (!verificacion) throw new Error(`${a.cod}: verificación desconocida "${a.verif}"`);

    const controlId = a.ctl ? controlPorCodigo.get(a.ctl.trim()) ?? null : null;
    if (tipo === 'MITIGAR' && !controlId) {
      throw new Error(`${a.cod}: una acción de mitigación necesita un control asociado`);
    }

    const datos = {
      accion: a.accion,
      tipo,
      controlId,
      origen: a.origen,
      responsableId: await cargo(a.resp),
      apruebaId: await cargo(a.aprueba),
      fechaObjetivo: a.fecha ? new Date(a.fecha) : null,
      estado,
      avance: a.avance,
      verificacion,
      observacion: a.obs?.trim() ? a.obs.trim() : null,
      // For a non-applicability acceptance the rationale IS the origin text: the
      // workbook keeps one field, so it is not duplicated into a second one.
      justificacionAceptacion: tipo === 'ACEPTAR' ? a.origen : null,
    };

    await prisma.accionPlan.upsert({
      where: { codigo: a.cod },
      update: datos,
      create: { codigo: a.cod, ...datos },
    });
  }

  return acciones.length;
}
