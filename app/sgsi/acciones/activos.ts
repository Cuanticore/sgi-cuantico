'use server';

// app/sgsi/acciones/activos.ts
//
// A valuation is never just a field: the asset's value is max(v_D, v_I, v_C), and the
// threshold decides whether the asset enters the analysis at all. Raising a dimension can
// therefore bring a whole set of risks into existence, and lowering one can take it out
// of scope. Both are handled by regenerating, never by deleting.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

export interface CambioValoracion {
  codigoActivo: string;
  dimension: 'D' | 'I' | 'C';
  valor: number;
}

export async function guardarValoracion(
  cambios: CambioValoracion[],
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('activo:valorar');
    if (cambios.length === 0) return { ok: true, mensaje: 'No había cambios.', cambios: 0 };

    const [escala, dimensiones] = await Promise.all([
      prisma.escalaValor.findMany(),
      prisma.dimension.findMany(),
    ]);
    const porValor = new Map(escala.map((v) => [v.valor, v]));
    const porCodigo = new Map(dimensiones.map((d) => [d.codigo, d.id]));

    const escritos = await prisma.$transaction(async (tx) => {
      let total = 0;

      for (const c of cambios) {
        const activo = await tx.activo.findFirst({
          where: { codigo: c.codigoActivo },
          include: { valores: { include: { dimension: true, valor: true } } },
        });
        if (!activo) throw new Error(`No existe el activo ${c.codigoActivo}`);

        const dimensionId = porCodigo.get(c.dimension);
        if (dimensionId === undefined) throw new Error(`Dimensión inválida: ${c.dimension}`);

        const nuevo = porValor.get(c.valor);
        if (!nuevo) throw new Error(`Valor fuera de la escala: ${c.valor}`);

        const previo = activo.valores.find((v) => v.dimension.codigo === c.dimension);

        total += await registrar(tx, autor, [
          {
            tabla: 'activo_valor',
            registroId: `${activo.codigo}/${c.dimension}`,
            campo: `valor en ${c.dimension}`,
            anterior: previo?.valor.etiqueta ?? null,
            nuevo: nuevo.etiqueta,
            motivo: motivo ?? null,
          },
        ]);

        await tx.activoValor.upsert({
          where: { activoId_dimensionId: { activoId: activo.id, dimensionId } },
          update: { valorId: nuevo.id },
          create: { activoId: activo.id, dimensionId, valorId: nuevo.id },
        });
      }

      return total;
    });

    // The value moved, so the asset may have crossed the threshold in either direction.
    // Risks that leave the scope are marked obsolete, never deleted, and one that comes
    // back keeps the valuation it had.
    const diagnostico = await generarRiesgos(prisma);

    revalidarSgsi();

    const fuera = diagnostico.riesgosObsoletos
      ? ` ${diagnostico.riesgosObsoletos} riesgos salieron del alcance y quedaron marcados obsoletos, no borrados.`
      : '';

    return {
      ok: true,
      mensaje: `Se guardaron ${escritos} cambios de valoración y se recalcularon ${diagnostico.riesgosGenerados} riesgos.${fuera}`,
      cambios: escritos,
    };
  });
}

export interface DatosGenerales {
  nombre?: string;
  descripcion?: string | null;
  /// The MAGERIT classification. Changing the type changes WHICH THREATS apply, so the
  /// asset's whole risk set is regenerated — and the code stays as it is: it is immutable
  /// and never reused, so an asset that moves from one type to another keeps a code whose
  /// abbreviation no longer matches. REQ-SIG-01 is explicit about that, and the change
  /// goes to the bitácora instead.
  areaId?: number;
  tipoId?: number;
  subtipoId?: number;
  propietarioId?: number | null;
  custodioId?: number | null;
  ubicacionId?: number | null;
  entornoId?: number | null;
  proveedorId?: number | null;
  superiorId?: number | null;
  datosCliente?: 'SI' | 'NO' | 'POR_DEFINIR';
  datosPersonales?: 'SI' | 'NO' | 'POR_DEFINIR';
  expuestoInternet?: 'SI' | 'NO' | 'POR_DEFINIR';
}

/// Saves the sheet's general data. The code is never among the editable fields: it is
/// immutable and non-reusable, and changing the asset's area or type does NOT change it —
/// that change goes to the log instead.
export async function guardarDatosGenerales(
  codigoActivo: string,
  datos: DatosGenerales,
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('activo:valorar');

    const escritos = await prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findFirst({ where: { codigo: codigoActivo } });
      if (!activo) throw new Error(`No existe el activo ${codigoActivo}`);

      // A subtype belongs to exactly one type, so the pair has to be checked together:
      // saving them separately is how an asset ends up classified as something the
      // taxonomy does not contain.
      const tipoFinal = datos.tipoId ?? activo.tipoId;
      const subtipoFinal = datos.subtipoId ?? activo.subtipoId;
      if (datos.tipoId !== undefined || datos.subtipoId !== undefined) {
        const subtipo = await tx.subtipoMagerit.findUnique({ where: { id: subtipoFinal } });
        if (!subtipo || subtipo.tipoId !== tipoFinal) {
          throw new Error('El subtipo elegido no pertenece al tipo MAGERIT seleccionado.');
        }
      }

      const campos: (keyof DatosGenerales)[] = [
        'nombre',
        'descripcion',
        'areaId',
        'tipoId',
        'subtipoId',
        'propietarioId',
        'custodioId',
        'ubicacionId',
        'entornoId',
        'proveedorId',
        'superiorId',
        'datosCliente',
        'datosPersonales',
        'expuestoInternet',
      ];

      const total = await registrar(
        tx,
        autor,
        campos
          .filter((campo) => datos[campo] !== undefined)
          .map((campo) => ({
            tabla: 'activo',
            registroId: activo.codigo ?? String(activo.id),
            campo,
            anterior: activo[campo as keyof typeof activo],
            nuevo: datos[campo],
            motivo: motivo ?? null,
          })),
      );

      await tx.activo.update({ where: { id: activo.id }, data: datos });
      return { total, cambioClasificacion: datos.tipoId !== undefined && datos.tipoId !== activo.tipoId };
    });

    // Only the type decides which threats apply, so only a type change needs the risk
    // set rebuilt. Regenerating on every name edit would be 2256 rows of pointless work.
    let nota = '';
    if (escritos.cambioClasificacion) {
      const d = await generarRiesgos(prisma);
      nota =
        ` El tipo cambió, así que se regeneró el conjunto de riesgos: ${d.riesgosGenerados} vigentes` +
        (d.riesgosObsoletos ? ` y ${d.riesgosObsoletos} fuera del alcance, marcados obsoletos.` : '.') +
        ' El código del activo no cambia: es inmutable, y el cambio queda en la bitácora.';
    }

    revalidarSgsi();
    return {
      ok: true,
      mensaje:
        escritos.total === 0
          ? 'No había cambios que guardar.'
          : `Se guardaron ${escritos.total} campos.${nota}`,
      cambios: escritos.total,
    };
  });
}

export interface ActivoNuevo {
  nombre: string;
  descripcion?: string | null;
  areaId: number;
  tipoId: number;
  subtipoId: number;
  custodioId: number;
  propietarioId?: number | null;
  ubicacionId?: number | null;
  entornoId?: number | null;
  proveedorId?: number | null;
  superiorId?: number | null;
  datosCliente?: 'SI' | 'NO' | 'POR_DEFINIR';
  datosPersonales?: 'SI' | 'NO' | 'POR_DEFINIR';
  expuestoInternet?: 'SI' | 'NO' | 'POR_DEFINIR';
  /// Value per dimension, on the 0–5 scale. An asset created without a valuation has no
  /// value, so it cannot reach the threshold and generates no risks — which is a valid
  /// state, not an error.
  valores?: { D: number; I: number; C: number };
}

/// Creates an asset and hands it its code.
///
/// The code comes from a counter per (area, type), incremented atomically and never from
/// MAX()+1: codes are immutable and non-reusable while deletes are logical, so a maximum
/// over live rows would hand out a number a retired asset still holds.
export async function crearActivo(
  datos: ActivoNuevo,
): Promise<Resultado & { codigo?: string }> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    if (!datos.nombre.trim()) {
      return { ok: false, mensaje: 'El activo necesita un nombre.' };
    }

    const [area, tipo, subtipo] = await Promise.all([
      prisma.area.findUnique({ where: { id: datos.areaId } }),
      prisma.tipoMagerit.findUnique({ where: { id: datos.tipoId } }),
      prisma.subtipoMagerit.findUnique({ where: { id: datos.subtipoId } }),
    ]);

    if (!area) return { ok: false, mensaje: 'El proceso o área no existe.' };
    if (!tipo) return { ok: false, mensaje: 'El tipo MAGERIT no existe.' };
    if (!subtipo || subtipo.tipoId !== tipo.id) {
      return { ok: false, mensaje: 'El subtipo no pertenece al tipo MAGERIT elegido.' };
    }
    // Two of the ten areas have no prefix ratified yet, and the code cannot be built
    // without one. Better to refuse than to mint a code that has to be corrected later,
    // because it never can be.
    if (!area.prefijo?.trim()) {
      return {
        ok: false,
        mensaje: `El área ${area.nombre} todavía no tiene prefijo de codificación asignado, así que no se puede emitir un código de activo.`,
      };
    }

    const escala = datos.valores
      ? await prisma.escalaValor.findMany({
          where: { valor: { in: [datos.valores.D, datos.valores.I, datos.valores.C] } },
        })
      : [];
    const dimensiones = await prisma.dimension.findMany();

    const creado = await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorCodigo.upsert({
        where: { areaId_tipoId: { areaId: area.id, tipoId: tipo.id } },
        update: { ultimoValor: { increment: 1 } },
        create: { areaId: area.id, tipoId: tipo.id, ultimoValor: 1 },
      });
      if (contador.ultimoValor > 9999) {
        throw new Error(
          `Se agotó el espacio de numeración para ${area.prefijo}-${tipo.abreviatura}.`,
        );
      }

      const codigo = `${area.prefijo}-${tipo.abreviatura}-${String(contador.ultimoValor).padStart(4, '0')}`;

      const activo = await tx.activo.create({
        data: {
          codigo,
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion ?? null,
          areaId: area.id,
          tipoId: tipo.id,
          subtipoId: subtipo.id,
          custodioId: datos.custodioId,
          propietarioId: datos.propietarioId ?? null,
          ubicacionId: datos.ubicacionId ?? null,
          entornoId: datos.entornoId ?? null,
          proveedorId: datos.proveedorId ?? null,
          superiorId: datos.superiorId ?? null,
          datosCliente: datos.datosCliente ?? 'POR_DEFINIR',
          datosPersonales: datos.datosPersonales ?? 'POR_DEFINIR',
          expuestoInternet: datos.expuestoInternet ?? 'POR_DEFINIR',
        },
      });

      if (datos.valores) {
        for (const codigoDim of ['D', 'I', 'C'] as const) {
          const dimension = dimensiones.find((d) => d.codigo === codigoDim);
          const valor = escala.find((v) => v.valor === datos.valores![codigoDim]);
          if (!dimension || !valor) throw new Error('La valoración inicial es inválida.');
          await tx.activoValor.create({
            data: { activoId: activo.id, dimensionId: dimension.id, valorId: valor.id },
          });
        }
      }

      await registrarAlta(tx, autor, 'activo', codigo);
      return codigo;
    });

    // A valuation that reaches the threshold brings the asset's risks into existence.
    const d = await generarRiesgos(prisma);
    revalidarSgsi();

    const conRiesgos = datos.valores
      ? ` Se generaron sus riesgos: ${d.riesgosGenerados} vigentes en total.`
      : ' Sin valoración todavía no alcanza el umbral, así que no tiene riesgos.';

    return {
      ok: true,
      mensaje: `Se creó el activo ${creado}. El código es inmutable y no se reutiliza.${conRiesgos}`,
      cambios: 1,
      codigo: creado,
    };
  });
}

/// A logical delete: the asset leaves the inventory, the matrices and the KPIs, and the
/// reason is mandatory. Nothing is removed from the database, and the code it held is
/// never reused.
export async function darDeBajaActivo(
  codigoActivo: string,
  motivo: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    if (!motivo.trim()) {
      return { ok: false, mensaje: 'La baja necesita un motivo: queda en la bitácora.' };
    }

    await prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findFirst({ where: { codigo: codigoActivo } });
      if (!activo) throw new Error(`No existe el activo ${codigoActivo}`);

      await registrarBaja(tx, autor, 'activo', activo.codigo ?? String(activo.id), motivo);
      await tx.activo.update({
        where: { id: activo.id },
        data: { activo: false, bajaEn: new Date() },
      });
    });

    await generarRiesgos(prisma);
    revalidarSgsi();

    return { ok: true, mensaje: `El activo ${codigoActivo} quedó dado de baja.`, cambios: 1 };
  });
}

export async function reactivarActivo(codigoActivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    await prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findFirst({ where: { codigo: codigoActivo } });
      if (!activo) throw new Error(`No existe el activo ${codigoActivo}`);

      await registrar(tx, autor, [
        {
          tabla: 'activo',
          registroId: activo.codigo ?? String(activo.id),
          campo: 'baja lógica',
          anterior: 'dado de baja',
          nuevo: 'vigente',
          motivo: 'Se deshizo la baja',
        },
      ]);
      await tx.activo.update({
        where: { id: activo.id },
        data: { activo: true, bajaEn: null },
      });
    });

    // Reactivation brings the asset's risks back with the valuation they had.
    await generarRiesgos(prisma);
    revalidarSgsi();

    return { ok: true, mensaje: `El activo ${codigoActivo} volvió al inventario.`, cambios: 1 };
  });
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
