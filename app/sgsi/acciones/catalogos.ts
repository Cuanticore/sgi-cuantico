'use server';

// app/sgsi/acciones/catalogos.ts
//
// CRUD of the eight support catalogues of screen 9.
//
// The `parametro` row `borrado_fisico=false` is the rule this module implements: toda baja
// es lógica y la bitácora es inmutable. Nothing here deletes a row. A retired value keeps
// explaining the historical data that points at it — it only stops being offered in the
// dropdowns — and that is why `retirarItem` flips a flag and demands a reason instead of
// issuing a DELETE.
//
// Prisma's delegates are not structurally interchangeable, so the three writes each end in
// a small explicit `switch`. The validation before them is written once: it is the part
// that would rot if it were copied eight times.

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import {
  CATALOGOS,
  PREFIJO_AREA,
  conteoUsos,
  mismoNombre,
  type Catalogo,
} from '@/lib/sgsi/catalogos';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

export type { Catalogo } from '@/lib/sgsi/catalogos';

/// Why CapacidadOperativa refuses an alta and a baja. Spelled out rather than reported as
/// a generic failure: the refusal is a property of the model, not a missing feature.
const CAPACIDAD_FIJA =
  'Las quince capacidades operativas de ISO/IEC 27002:2022 no se dan de alta ni de baja: ' +
  'cada control apunta obligatoriamente a una, así que una baja dejaría controles sin ' +
  'capacidad, y una decimosexta sería un eje del radar sin ningún control detrás. Solo se ' +
  'pueden renombrar.';

/// One snapshot per operation: the duplicate check, the protection flag and the count that
/// ends up in the message all come from the same read, so they cannot disagree with each
/// other.
interface Fila {
  id: number;
  nombre: string;
  nombreCorto: string | null;
  vigente: boolean;
  protegido: boolean;
  usos: number;
}

async function leer(catalogo: Catalogo): Promise<Fila[]> {
  switch (catalogo) {
    case 'area': {
      const filas = await prisma.area.findMany({
        include: { _count: { select: { activos: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activa,
        protegido: false,
        usos: f._count.activos,
      }));
    }
    case 'cargoPropietario':
    case 'cargoCustodio':
    case 'cargo': {
      const bandera = CATALOGOS[catalogo].banderaCargo;
      const filas = await prisma.cargoResponsable.findMany({
        // The filtered views list only the positions IN their list. A row missing from one
        // view is still a live position: it just does not answer for that role.
        where: bandera ? { [bandera]: true } : undefined,
        include: {
          _count: {
            select: {
              activosPropietario: true,
              activosCustodio: true,
              controles: true,
              riesgos: true,
              accionesResponsable: true,
              accionesAprueba: true,
              areasLideradas: true,
            },
          },
        },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activo,
        protegido: false,
        usos:
          f._count.activosPropietario +
          f._count.activosCustodio +
          f._count.controles +
          f._count.riesgos +
          f._count.accionesResponsable +
          f._count.accionesAprueba +
          f._count.areasLideradas,
      }));
    }
    case 'proveedor': {
      const filas = await prisma.proveedor.findMany({
        include: { _count: { select: { activos: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activo,
        protegido: f.protegido,
        usos: f._count.activos,
      }));
    }
    case 'ubicacion': {
      const filas = await prisma.ubicacion.findMany({
        include: { _count: { select: { activos: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activo,
        protegido: f.protegido,
        usos: f._count.activos,
      }));
    }
    case 'entorno': {
      const filas = await prisma.entorno.findMany({
        include: { _count: { select: { activos: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activo,
        protegido: f.protegido,
        usos: f._count.activos,
      }));
    }
    case 'tratamiento': {
      const filas = await prisma.tratamientoRiesgo.findMany({
        include: { _count: { select: { riesgos: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activo,
        protegido: false,
        usos: f._count.riesgos,
      }));
    }
    case 'estadoTratamiento': {
      const filas = await prisma.estadoTratamiento.findMany({
        include: { _count: { select: { riesgos: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: null,
        vigente: f.activo,
        protegido: false,
        usos: f._count.riesgos,
      }));
    }
    case 'capacidad': {
      const filas = await prisma.capacidadOperativa.findMany({
        include: { _count: { select: { controles: true } } },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: f.nombreCorto,
        // There is no vigency column: the capability either exists or it does not.
        vigente: true,
        protegido: false,
        usos: f._count.controles,
      }));
    }
  }
}

/// The new row goes last. Computed inside the transaction so two simultaneous altas cannot
/// both read the same maximum.
async function siguienteOrden(tx: Prisma.TransactionClient, catalogo: Catalogo): Promise<number> {
  switch (catalogo) {
    case 'area': {
      const r = await tx.area.aggregate({ _max: { orden: true } });
      return (r._max.orden ?? 0) + 1;
    }
    case 'cargoPropietario':
    case 'cargoCustodio':
    case 'cargo': {
      const r = await tx.cargoResponsable.aggregate({ _max: { orden: true } });
      return (r._max.orden ?? 0) + 1;
    }
    case 'tratamiento': {
      const r = await tx.tratamientoRiesgo.aggregate({ _max: { orden: true } });
      return (r._max.orden ?? 0) + 1;
    }
    case 'estadoTratamiento': {
      const r = await tx.estadoTratamiento.aggregate({ _max: { orden: true } });
      return (r._max.orden ?? 0) + 1;
    }
    default:
      return 0;
  }
}

async function insertar(
  tx: Prisma.TransactionClient,
  catalogo: Catalogo,
  datos: { nombre: string; prefijo?: string; orden: number },
): Promise<number> {
  switch (catalogo) {
    case 'area': {
      if (!datos.prefijo) throw new Error('El área necesita un prefijo de codificación.');
      const f = await tx.area.create({
        data: { nombre: datos.nombre, prefijo: datos.prefijo, orden: datos.orden },
      });
      return f.id;
    }
    case 'cargoPropietario':
    case 'cargoCustodio':
    case 'cargo': {
      const bandera = CATALOGOS[catalogo].banderaCargo;
      // A position added from the PROPIETARIO list joins that list and NOT the other one.
      // Adding it to both would be exactly the behaviour the client asked to stop.
      const f = await tx.cargoResponsable.create({
        data: {
          nombre: datos.nombre,
          orden: datos.orden,
          esPropietario: bandera === undefined || bandera === 'esPropietario',
          esCustodio: bandera === undefined || bandera === 'esCustodio',
        },
      });
      return f.id;
    }
    case 'proveedor': {
      const f = await tx.proveedor.create({ data: { nombre: datos.nombre } });
      return f.id;
    }
    case 'ubicacion': {
      const f = await tx.ubicacion.create({ data: { nombre: datos.nombre } });
      return f.id;
    }
    case 'entorno': {
      const f = await tx.entorno.create({ data: { nombre: datos.nombre } });
      return f.id;
    }
    case 'tratamiento': {
      const f = await tx.tratamientoRiesgo.create({
        data: { nombre: datos.nombre, orden: datos.orden },
      });
      return f.id;
    }
    case 'estadoTratamiento': {
      const f = await tx.estadoTratamiento.create({
        data: { nombre: datos.nombre, orden: datos.orden },
      });
      return f.id;
    }
    case 'capacidad':
      throw new Error(CAPACIDAD_FIJA);
  }
}

/// `prefijo` is absent on purpose: renaming an area never touches it. The name is not the
/// foreign key; the prefix is inside every code already emitted.
async function escribirNombre(
  tx: Prisma.TransactionClient,
  catalogo: Catalogo,
  id: number,
  datos: { nombre: string; nombreCorto?: string },
): Promise<void> {
  switch (catalogo) {
    case 'area':
      await tx.area.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'cargoPropietario':
    case 'cargoCustodio':
    case 'cargo':
      // Renaming a position renames it everywhere. It is ONE position with two views, so a
      // rename that applied to only one view would be the two-truths defect the flags exist
      // to avoid.
      await tx.cargoResponsable.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'proveedor':
      await tx.proveedor.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'ubicacion':
      await tx.ubicacion.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'entorno':
      await tx.entorno.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'tratamiento':
      await tx.tratamientoRiesgo.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'estadoTratamiento':
      await tx.estadoTratamiento.update({ where: { id }, data: { nombre: datos.nombre } });
      return;
    case 'capacidad':
      await tx.capacidadOperativa.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          ...(datos.nombreCorto ? { nombreCorto: datos.nombreCorto } : {}),
        },
      });
      return;
  }
}

async function escribirVigencia(
  tx: Prisma.TransactionClient,
  catalogo: Catalogo,
  id: number,
  vigente: boolean,
): Promise<void> {
  switch (catalogo) {
    case 'area':
      await tx.area.update({ where: { id }, data: { activa: vigente } });
      return;
    case 'cargoPropietario':
    case 'cargoCustodio':
    case 'cargo': {
      const bandera = CATALOGOS[catalogo].banderaCargo;
      // On a filtered view this is "take it out of THIS list", not a logical delete: the
      // position stays live, keeps its other flag, and keeps answering for the assets,
      // controls, risks and plan actions that point at it.
      await tx.cargoResponsable.update({
        where: { id },
        data: bandera ? { [bandera]: vigente } : { activo: vigente },
      });
      return;
    }
    case 'proveedor':
      await tx.proveedor.update({ where: { id }, data: { activo: vigente } });
      return;
    case 'ubicacion':
      await tx.ubicacion.update({ where: { id }, data: { activo: vigente } });
      return;
    case 'entorno':
      await tx.entorno.update({ where: { id }, data: { activo: vigente } });
      return;
    case 'tratamiento':
      await tx.tratamientoRiesgo.update({ where: { id }, data: { activo: vigente } });
      return;
    case 'estadoTratamiento':
      await tx.estadoTratamiento.update({ where: { id }, data: { activo: vigente } });
      return;
    case 'capacidad':
      throw new Error(CAPACIDAD_FIJA);
  }
}

/// The catalogues feed the dropdowns of the asset sheet and the counters of the home page,
/// so a change here invalidates more than its own screen.
function revalidarCatalogos(): void {
  for (const ruta of ['/sgsi/parametros', '/sgsi/inventario', '/sgsi', '/']) {
    revalidatePath(ruta);
  }
}

/// A name already taken is rejected, and a name taken by a RETIRED row is rejected
/// differently: creating a second one is how the duplicate the catalogue exists to prevent
/// gets in through the back door.
function choqueDeNombre(filas: Fila[], nombre: string, exceptoId?: number): Resultado | null {
  const previa = filas.find((f) => f.id !== exceptoId && mismoNombre(f.nombre, nombre));
  if (!previa) return null;

  if (previa.vigente) {
    return {
      ok: false,
      mensaje: `Ya existe «${previa.nombre}» en el catálogo. Dos filas con el mismo nombre reparten los registros entre ellas y ninguna dice la verdad.`,
    };
  }
  return {
    ok: false,
    mensaje: `«${previa.nombre}» ya existe, retirado. Reactivalo en lugar de crear un duplicado: la fila sigue explicando los registros históricos que la referencian.`,
  };
}

/// Reads one catalogue with its usage counts, for the popup that administers it from the
/// asset sheet.
///
/// It reads from the server on open rather than receiving the sheet's own option lists,
/// because those lists carry no usage count. Passing zeros would be worse than passing
/// nothing: the row would read "ningún registro lo referencia", which is exactly the
/// sentence that invites retiring a value 57 assets depend on.
export async function listarCatalogo(catalogo: Catalogo): Promise<{
  ok: boolean;
  mensaje: string;
  items: { id: number; nombre: string; nombreCorto: string | null; activo: boolean; protegido: boolean; usos: number }[];
}> {
  try {
    // Reading a catalogue is not writing one, so `sgsi:ver` is enough to open the popup.
    // The buttons inside it still go through the write actions, which demand more.
    await autorConPermiso('sgsi:ver');
    const filas = await leer(catalogo);
    return {
      ok: true,
      mensaje: '',
      items: filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        nombreCorto: f.nombreCorto,
        activo: f.vigente,
        protegido: f.protegido,
        usos: f.usos,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No pude leer el catálogo.',
      items: [],
    };
  }
}

export async function crearItem(
  catalogo: Catalogo,
  datos: { nombre: string; prefijo?: string; nombreCorto?: string },
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const regla = CATALOGOS[catalogo];

    if (!regla.permiteAlta) return { ok: false, mensaje: CAPACIDAD_FIJA };

    const nombre = datos.nombre.trim();
    if (!nombre) return { ok: false, mensaje: `Escribí el nombre: ${regla.etiqueta} lo necesita.` };

    let prefijo: string | undefined;
    if (regla.pidePrefijo) {
      prefijo = (datos.prefijo ?? '').trim().toUpperCase();
      if (!PREFIJO_AREA.test(prefijo)) {
        return {
          ok: false,
          mensaje:
            'El prefijo son exactamente tres letras, por ejemplo TEC. Queda dentro del código de cada activo del área (AAA-TTT-NNNN) y el código es inmutable, así que no se puede corregir después.',
        };
      }
      const ocupado = await prisma.area.findUnique({ where: { prefijo } });
      if (ocupado) {
        return {
          ok: false,
          mensaje: `El prefijo ${prefijo} ya es de «${ocupado.nombre}». Los prefijos no se comparten: son lo que hace único al código del activo.`,
        };
      }
    }

    const filas = await leer(catalogo);
    const choque = choqueDeNombre(filas, nombre);
    if (choque) return choque;

    const id = await prisma.$transaction(async (tx) => {
      const orden = regla.tieneOrden ? await siguienteOrden(tx, catalogo) : 0;
      const creado = await insertar(tx, catalogo, { nombre, prefijo, orden });
      await registrarAlta(tx, autor, regla.tabla, String(creado));
      return creado;
    });

    revalidarCatalogos();

    const nota = prefijo
      ? ` Su prefijo de codificación es ${prefijo} y ya no se puede cambiar: va dentro del código de cada activo del área.`
      : '';

    return {
      ok: true,
      mensaje: `Se creó «${nombre}» (registro ${id}) y ya se ofrece en los desplegables.${nota}`,
      cambios: 1,
    };
  });
}

/// Renaming propagates to everything that references the row, because the name is not the
/// foreign key. `Area.prefijo` is the exception and is never touched here.
export async function renombrarItem(
  catalogo: Catalogo,
  id: number,
  datos: { nombre: string; nombreCorto?: string },
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const regla = CATALOGOS[catalogo];

    const nombre = datos.nombre.trim();
    if (!nombre) {
      return {
        ok: false,
        mensaje: 'El nombre no puede quedar vacío: es lo que se lee en los desplegables y en los informes.',
      };
    }

    const filas = await leer(catalogo);
    const actual = filas.find((f) => f.id === id);
    if (!actual) return { ok: false, mensaje: 'Esa fila del catálogo ya no existe.' };

    const choque = choqueDeNombre(filas, nombre, id);
    if (choque) return choque;

    const nombreCorto = regla.usaNombreCorto ? (datos.nombreCorto ?? '').trim() : '';
    const cambiaNombre = actual.nombre !== nombre;
    const cambiaCorto = nombreCorto.length > 0 && actual.nombreCorto !== nombreCorto;
    if (!cambiaNombre && !cambiaCorto) {
      return { ok: true, mensaje: 'No había cambios que guardar.', cambios: 0 };
    }

    const escritos = await prisma.$transaction(async (tx) => {
      const total = await registrar(tx, autor, [
        {
          tabla: regla.tabla,
          registroId: String(id),
          campo: 'nombre',
          anterior: actual.nombre,
          nuevo: nombre,
        },
        ...(cambiaCorto
          ? [
              {
                tabla: regla.tabla,
                registroId: String(id),
                campo: 'nombre_corto',
                anterior: actual.nombreCorto,
                nuevo: nombreCorto,
              },
            ]
          : []),
      ]);
      await escribirNombre(tx, catalogo, id, {
        nombre,
        nombreCorto: cambiaCorto ? nombreCorto : undefined,
      });
      return total;
    });

    revalidarCatalogos();

    const propagacion =
      actual.usos > 0
        ? ` ${conteoUsos(actual.usos, regla.sustantivoUso)} que lo referencian ven el nombre nuevo.`
        : ' Todavía no lo referencia ningún registro.';
    const inmutable =
      catalogo === 'area'
        ? ' El prefijo de codificación no cambia: está dentro del código de cada activo y el código es inmutable.'
        : '';

    return {
      ok: true,
      mensaje: `Se renombró «${actual.nombre}» a «${nombre}».${propagacion}${inmutable}`,
      cambios: escritos,
    };
  });
}

/// A logical delete: the row stays, the foreign keys hold, and the value stops being
/// offered in the dropdowns. A retired value still has to explain the historical data that
/// points at it.
export async function retirarItem(
  catalogo: Catalogo,
  id: number,
  motivo: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const regla = CATALOGOS[catalogo];

    if (!regla.permiteBaja) return { ok: false, mensaje: CAPACIDAD_FIJA };

    if (!motivo.trim()) {
      return {
        ok: false,
        mensaje:
          'La baja necesita un motivo: queda en la bitácora, y «por qué desapareció este valor» es la pregunta que un auditor siempre hace.',
      };
    }

    const filas = await leer(catalogo);
    const actual = filas.find((f) => f.id === id);
    if (!actual) return { ok: false, mensaje: 'Esa fila del catálogo ya no existe.' };
    if (!actual.vigente) {
      return { ok: false, mensaje: `«${actual.nombre}» ya estaba retirado.` };
    }
    if (actual.protegido) {
      return {
        ok: false,
        mensaje: `«${actual.nombre}» es un valor protegido del catálogo y no se retira: es el que responde cuando el dato no aplica, así que siempre tiene que estar disponible.`,
      };
    }

    // A retired area would still be mandatory for its assets: the counter per (area, type)
    // and the prefix remain in use, and the sheet needs the area to render at all. So this
    // is a refusal, not a soft delete.
    if (catalogo === 'area') {
      const vigentes = await prisma.activo.count({ where: { areaId: id, activo: true } });
      if (vigentes > 0) {
        return {
          ok: false,
          mensaje: `«${actual.nombre}» todavía responde por ${conteoUsos(vigentes, 'activo')} vigentes. Su prefijo y su consecutivo siguen en uso y los activos necesitan su área para mostrarse: reasigná o dá de baja esos activos antes de retirar el proceso.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await registrarBaja(tx, autor, regla.tabla, String(id), motivo.trim());
      await escribirVigencia(tx, catalogo, id, false);
    });

    revalidarCatalogos();

    const conserva =
      actual.usos > 0
        ? ` ${conteoUsos(actual.usos, regla.sustantivoUso)} que lo referencian lo conservan;`
        : ' Ningún registro lo referencia y';

    return {
      ok: true,
      mensaje: `Se retiró «${actual.nombre}».${conserva} deja de ofrecerse en los desplegables. La fila no se borra: la baja es lógica y queda en la bitácora.`,
      cambios: 1,
    };
  });
}

export async function reactivarItem(catalogo: Catalogo, id: number): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const regla = CATALOGOS[catalogo];

    if (!regla.permiteBaja) return { ok: false, mensaje: CAPACIDAD_FIJA };

    const filas = await leer(catalogo);
    const actual = filas.find((f) => f.id === id);
    if (!actual) return { ok: false, mensaje: 'Esa fila del catálogo ya no existe.' };
    if (actual.vigente) {
      return { ok: false, mensaje: `«${actual.nombre}» ya estaba vigente.` };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: regla.tabla,
          registroId: String(id),
          campo: 'baja lógica',
          anterior: 'dado de baja',
          nuevo: 'vigente',
          motivo: 'Se deshizo la baja',
        },
      ]);
      await escribirVigencia(tx, catalogo, id, true);
    });

    revalidarCatalogos();

    return {
      ok: true,
      mensaje: `«${actual.nombre}» volvió al catálogo y se ofrece otra vez en los desplegables.`,
      cambios: 1,
    };
  });
}
