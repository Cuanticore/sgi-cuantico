// prisma/seeds/activos.ts
//
// The 234 assets of the inventory with their per-dimension valuation.
//
// The asset's own value and level are NOT seeded: the workbook computes them with a
// formula (max of the three dimensions) and so does this application. Columns T and U
// have no counterpart here on purpose.
//
// Each asset receives a generated AAA-TTT-NNNN code and keeps the identifier it carried
// in the workbook, so traceability with already issued documents is not lost.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient, Ternario } from '@prisma/client';
import { NORMALIZAR_CARGO, NORMALIZAR_UBICACION } from './magerit';

const DATA = join(process.cwd(), 'prisma', 'data');

interface ActivoSeed {
  codigoHeredado: string;
  nombre: string;
  descripcion: string | null;
  tipo: string; // "[D] Datos / Información"
  subtipo: string; // "[backup] Copias de respaldo"
  area: string;
  custodio: string | null;
  propietario: string | null;
  ubicacion: string | null;
  entorno: string | null;
  datosCliente: string;
  datosPersonales: string;
  expuestoInternet: string;
  proveedor: string | null;
  superior: string | null;
  valorD: string;
  valorI: string;
  valorC: string;
}

/// The workbook writes "[D] Datos / Información"; the catalogue is keyed by "[D]".
function codigoEntreCorchetes(etiqueta: string): string {
  const m = /^(\[[^\]]+\])/.exec(etiqueta.trim());
  if (!m) throw new Error(`No pude leer el código de "${etiqueta}"`);
  return m[1];
}

function aTernario(valor: string): Ternario {
  switch (valor.trim()) {
    case 'Sí':
      return 'SI';
    case 'No':
      return 'NO';
    default:
      return 'POR_DEFINIR';
  }
}

export async function seedActivos(
  prisma: PrismaClient,
): Promise<{ sembrados: number; sinCodigo: number }> {
  const activos: ActivoSeed[] = JSON.parse(
    readFileSync(join(DATA, 'activos.json'), 'utf8'),
  );

  const areaPorNombre = new Map((await prisma.area.findMany()).map((a) => [a.nombre, a]));
  const tipoPorCodigo = new Map((await prisma.tipoMagerit.findMany()).map((t) => [t.codigo, t]));
  const subtipos = await prisma.subtipoMagerit.findMany();
  const cargoPorNombre = new Map((await prisma.cargoResponsable.findMany()).map((c) => [c.nombre, c.id]));
  const ubicacionPorNombre = new Map((await prisma.ubicacion.findMany()).map((u) => [u.nombre, u.id]));
  const entornoPorNombre = new Map((await prisma.entorno.findMany()).map((e) => [e.nombre, e.id]));
  const proveedorPorNombre = new Map((await prisma.proveedor.findMany()).map((p) => [p.nombre, p.id]));
  const valorPorEtiqueta = new Map((await prisma.escalaValor.findMany()).map((v) => [v.etiqueta, v.id]));
  const dimensionPorCodigo = new Map((await prisma.dimension.findMany()).map((d) => [d.codigo, d.id]));

  let sembrados = 0;
  let sinCodigo = 0;

  for (const a of activos) {
    const area = areaPorNombre.get(a.area);
    if (!area) throw new Error(`${a.codigoHeredado}: área desconocida "${a.area}"`);

    const tipo = tipoPorCodigo.get(codigoEntreCorchetes(a.tipo));
    if (!tipo) throw new Error(`${a.codigoHeredado}: tipo desconocido "${a.tipo}"`);

    const codigoSubtipo = codigoEntreCorchetes(a.subtipo);
    const subtipo = subtipos.find((s) => s.tipoId === tipo.id && s.codigo === codigoSubtipo);
    if (!subtipo) throw new Error(`${a.codigoHeredado}: subtipo desconocido "${a.subtipo}"`);

    const custodio = a.custodio?.trim();
    const custodioId = custodio
      ? cargoPorNombre.get(NORMALIZAR_CARGO[custodio] ?? custodio) ?? null
      : null;

    const ubicacion = a.ubicacion?.trim();
    const ubicacionId = ubicacion
      ? ubicacionPorNombre.get(NORMALIZAR_UBICACION[ubicacion] ?? ubicacion) ?? null
      : null;

    const existente = await prisma.activo.findFirst({
      where: { codigoHeredado: a.codigoHeredado },
    });

    const entornoId = a.entorno ? entornoPorNombre.get(a.entorno) ?? null : null;
    const proveedorId = a.proveedor ? proveedorPorNombre.get(a.proveedor) ?? null : null;

    const conectar = (id: number | null) => (id === null ? undefined : { connect: { id } });

    const datos = {
      codigoHeredado: a.codigoHeredado,
      nombre: a.nombre,
      descripcion: a.descripcion,
      area: { connect: { id: area.id } },
      tipo: { connect: { id: tipo.id } },
      subtipo: { connect: { id: subtipo.id } },
      // The workbook's "Propietario del activo" column is empty for every asset.
      custodio: conectar(custodioId),
      ubicacion: conectar(ubicacionId),
      entorno: conectar(entornoId),
      proveedor: conectar(proveedorId),
      datosCliente: aTernario(a.datosCliente),
      datosPersonales: aTernario(a.datosPersonales),
      expuestoInternet: aTernario(a.expuestoInternet),
    };

    const activo = existente
      ? await prisma.activo.update({ where: { id: existente.id }, data: datos })
      : await prisma.activo.create({
          data: { ...datos, codigo: await siguienteCodigo(prisma, area.id, area.prefijo, tipo.id, tipo.abreviatura) },
        });

    if (!activo.codigo) sinCodigo++;

    for (const [codigoDim, etiqueta] of [
      ['D', a.valorD],
      ['I', a.valorI],
      ['C', a.valorC],
    ] as const) {
      const dimensionId = dimensionPorCodigo.get(codigoDim)!;
      const valorId = valorPorEtiqueta.get(etiqueta.trim());
      if (!valorId) throw new Error(`${a.codigoHeredado}: valor desconocido "${etiqueta}"`);
      await prisma.activoValor.upsert({
        where: { activoId_dimensionId: { activoId: activo.id, dimensionId } },
        update: { valorId },
        create: { activoId: activo.id, dimensionId, valorId },
      });
    }

    sembrados++;
  }

  return { sembrados, sinCodigo };
}

/// The consecutive runs independently per (area, type). It is taken from a counter and
/// never from MAX()+1: codes are immutable and never reused, and deletes are logical, so
/// a maximum over live rows would hand out a retired number.
async function siguienteCodigo(
  prisma: PrismaClient,
  areaId: number,
  prefijo: string,
  tipoId: number,
  abreviatura: string,
): Promise<string> {
  const contador = await prisma.contadorCodigo.upsert({
    where: { areaId_tipoId: { areaId, tipoId } },
    update: { ultimoValor: { increment: 1 } },
    create: { areaId, tipoId, ultimoValor: 1 },
  });

  if (contador.ultimoValor > 9999) {
    throw new Error(`Espacio de numeración agotado para ${prefijo}-${abreviatura}`);
  }

  return `${prefijo}-${abreviatura}-${String(contador.ultimoValor).padStart(4, '0')}`;
}
