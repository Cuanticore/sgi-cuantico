// prisma/seeds/magerit.ts
//
// Areas, closed catalogues and the MAGERIT taxonomy: 10 types, 137 subtypes, 57 threats
// with their per-type applicability and per-dimension degradation.
//
// Areas come from REQ-SIG-01, not from the workbook: the workbook's process column has
// a typo ("Gestió de Proyectos") and its dropdown only offers five of the ten areas the
// requirement defines.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

const DATA = join(process.cwd(), 'prisma', 'data');

const leer = <T>(archivo: string): T =>
  JSON.parse(readFileSync(join(DATA, archivo), 'utf8')) as T;

interface AreaSeed { prefijo: string; nombre: string; orden: number }
interface TipoSeed { codigo: string; nombre: string; abreviatura: string; orden: number }
interface SubtipoSeed { tipoCodigo: string; codigo: string; nombre: string }
interface AmenazaSeed {
  codigo: string;
  nombre: string;
  grupo: string;
  frecuencia: string;
  notaAplicacion: string | null;
  tipos: string[];
  tiposNoAplica: string[];
  degradacion: Record<'D' | 'I' | 'C', string>;
}
interface ListasSeed {
  cargosResponsables: string[];
  proveedores: string[];
  ubicaciones: string[];
  entornos: string[];
}

/// The workbook writes a role without its accent in the asset rows and with it in the
/// catalogue. Left alone they become two roles, which is how a closed list stops being
/// closed.
export const NORMALIZAR_CARGO: Record<string, string> = {
  'Lider del SIG': 'Líder del SIG',
};

/// Assets use "N.A." where the column's own validation offers "No aplica". "Física" is the
/// same place the client's own list now calls "Físico": one row, not two.
export const NORMALIZAR_UBICACION: Record<string, string> = {
  'N.A.': 'No aplica',
  Física: 'Físico',
};

/// Retired on 2026-08-25, when the client's «Listas SGSI» replaced the three generic
/// locations with specific ones.
///
/// They are retired, NOT deleted and NOT remapped. 205 assets point at "Nube", and which
/// cloud each of those actually is appears in no source we have — spreading them across
/// AWS / Microsoft 365 / otro proveedor would be inventing infrastructure. A retired row
/// keeps the historical answer readable and stops being offered in the dropdowns, and the
/// catalogue editor on screen 9 is where they get reassigned one by one.
const UBICACIONES_RETIRADAS = new Set(['Nube', 'Local', 'Física']);

export async function seedMagerit(prisma: PrismaClient): Promise<void> {
  const areas = leer<AreaSeed[]>('areas.json');
  const tipos = leer<TipoSeed[]>('tipos-magerit.json');
  const subtipos = leer<SubtipoSeed[]>('subtipos-magerit.json');
  const amenazas = leer<AmenazaSeed[]>('amenazas.json');
  const listas = leer<ListasSeed>('listas.json');
  const activos = leer<{ custodio: string | null; ubicacion: string | null; entorno: string | null; proveedor: string | null }[]>('activos.json');

  for (const a of areas) {
    await prisma.area.upsert({
      where: { prefijo: a.prefijo },
      update: { nombre: a.nombre, orden: a.orden },
      create: { prefijo: a.prefijo, nombre: a.nombre, orden: a.orden },
    });
  }

  // Roles: the catalogue, plus every value the assets actually use. The workbook's
  // custodian column holds process names and person names alongside real roles, and
  // dropping them would lose the only custodian record that exists.
  const delCatalogo = new Set(listas.cargosResponsables ?? []);
  const deLosActivos = new Set(
    activos
      .map((a) => a.custodio?.trim())
      .filter((v): v is string => Boolean(v))
      .map((v) => NORMALIZAR_CARGO[v] ?? v),
  );
  const cargos = [...new Set([...delCatalogo, ...deLosActivos])].sort();
  for (const [i, nombre] of cargos.entries()) {
    await prisma.cargoResponsable.upsert({
      where: { nombre },
      update: {},
      create: { nombre, orden: i + 1 },
    });
  }

  await seedCatalogo(prisma, 'proveedor', listas.proveedores, activos.map((a) => a.proveedor));
  await seedCatalogo(
    prisma,
    'ubicacion',
    listas.ubicaciones,
    activos.map((a) => (a.ubicacion ? NORMALIZAR_UBICACION[a.ubicacion] ?? a.ubicacion : null)),
  );
  await seedCatalogo(prisma, 'entorno', listas.entornos, activos.map((a) => a.entorno));

  for (const t of tipos) {
    await prisma.tipoMagerit.upsert({
      where: { codigo: t.codigo },
      update: { nombre: t.nombre, abreviatura: t.abreviatura, orden: t.orden },
      create: t,
    });
  }

  const tipoPorCodigo = new Map(
    (await prisma.tipoMagerit.findMany()).map((t) => [t.codigo, t.id]),
  );

  for (const s of subtipos) {
    const tipoId = tipoPorCodigo.get(s.tipoCodigo);
    if (!tipoId) throw new Error(`Subtipo ${s.codigo}: tipo desconocido ${s.tipoCodigo}`);
    await prisma.subtipoMagerit.upsert({
      where: { tipoId_codigo: { tipoId, codigo: s.codigo } },
      update: { nombre: s.nombre },
      create: { tipoId, codigo: s.codigo, nombre: s.nombre },
    });
  }

  const frecuenciaPorNombre = new Map(
    (await prisma.escalaFrecuencia.findMany()).map((f) => [f.nombre, f.id]),
  );
  const degradacionPorNombre = new Map(
    (await prisma.escalaDegradacion.findMany()).map((d) => [d.nombre, d.id]),
  );
  const dimensionPorCodigo = new Map(
    (await prisma.dimension.findMany()).map((d) => [d.codigo, d.id]),
  );

  /// The declared deviation: four threats the standard aims at Autenticidad or
  /// Trazabilidad are reassigned to Integridad so their risk does not vanish.
  const REASIGNADAS: Record<string, string> = {
    'E.3': 'T',
    'A.3': 'T',
    'A.5': 'A',
    'A.13': 'A',
  };

  for (const a of amenazas) {
    const frecuenciaId = frecuenciaPorNombre.get(a.frecuencia);
    if (!frecuenciaId) throw new Error(`Amenaza ${a.codigo}: frecuencia desconocida "${a.frecuencia}"`);

    await prisma.amenaza.upsert({
      where: { codigo: a.codigo },
      update: { nombre: a.nombre, grupo: a.grupo, frecuenciaId, notaAplicacion: a.notaAplicacion },
      create: {
        codigo: a.codigo,
        nombre: a.nombre,
        grupo: a.grupo,
        frecuenciaId,
        notaAplicacion: a.notaAplicacion,
      },
    });
    const amenaza = await prisma.amenaza.findUniqueOrThrow({ where: { codigo: a.codigo } });

    // Applicability is RECORDED for all ten types, not inferred from absence: the
    // workbook says Sí or — on every cell, and "explicitly not applicable" is a
    // different fact from "nobody said".
    for (const [codigoTipo, aplica] of [
      ...a.tipos.map((t) => [t, true] as const),
      ...a.tiposNoAplica.map((t) => [t, false] as const),
    ]) {
      const tipoId = tipoPorCodigo.get(codigoTipo);
      if (!tipoId) throw new Error(`Amenaza ${a.codigo}: tipo desconocido ${codigoTipo}`);
      await prisma.amenazaTipo.upsert({
        where: { amenazaId_tipoId: { amenazaId: amenaza.id, tipoId } },
        update: { aplica },
        create: { amenazaId: amenaza.id, tipoId, aplica },
      });
    }

    for (const codigoDim of ['D', 'I', 'C'] as const) {
      const dimensionId = dimensionPorCodigo.get(codigoDim)!;
      const nombre = a.degradacion[codigoDim];
      const degradacionId = degradacionPorNombre.get(nombre);
      if (!degradacionId) {
        throw new Error(`Amenaza ${a.codigo}: degradación desconocida "${nombre}"`);
      }
      const reasignadaDesde = codigoDim === 'I' ? REASIGNADAS[a.codigo] ?? null : null;
      await prisma.amenazaDegradacion.upsert({
        where: { amenazaId_dimensionId: { amenazaId: amenaza.id, dimensionId } },
        update: { degradacionId, reasignadaDesde },
        create: { amenazaId: amenaza.id, dimensionId, degradacionId, reasignadaDesde },
      });
    }
  }
}

/// Seeds one of the three editable catalogues from its list plus whatever the assets
/// actually reference. "No aplica" is protected: it cannot be deleted.
async function seedCatalogo(
  prisma: PrismaClient,
  tabla: 'proveedor' | 'ubicacion' | 'entorno',
  delCatalogo: string[] | undefined,
  deLosActivos: (string | null)[],
): Promise<void> {
  const valores = [
    ...new Set([
      ...(delCatalogo ?? []),
      ...deLosActivos.filter((v): v is string => Boolean(v && v.trim())),
      // The retired names have to stay in the union even though no asset and no catalogue
      // mentions them any more. Dropping them out would leave the previous seed's rows
      // untouched and still active — the row would keep being offered precisely because
      // the catalogue stopped listing it.
      ...(tabla === 'ubicacion' ? UBICACIONES_RETIRADAS : []),
    ]),
  ].sort();

  for (const nombre of valores) {
    // `activo` is set explicitly rather than left to the default, so a reseed both retires
    // what the catalogue dropped and brings back anything that returns to it. Leaving it
    // out would make the flag depend on whether the row already existed.
    const datos = {
      nombre,
      protegido: nombre === 'No aplica',
      activo: !(tabla === 'ubicacion' && UBICACIONES_RETIRADAS.has(nombre)),
    };
    // The three catalogues share a shape but not a Prisma type, so they are dispatched
    // rather than parameterised.
    if (tabla === 'proveedor') {
      await prisma.proveedor.upsert({ where: { nombre }, update: datos, create: datos });
    } else if (tabla === 'ubicacion') {
      await prisma.ubicacion.upsert({ where: { nombre }, update: datos, create: datos });
    } else {
      await prisma.entorno.upsert({ where: { nombre }, update: datos, create: datos });
    }
  }
}
