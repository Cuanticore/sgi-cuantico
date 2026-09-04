'use server';

// app/sig/acciones/niveles.ts
//
// Administración de la jerarquía de tres grados.
//
// **E1 se impone acá, no en la pantalla.** Una llave foránea no sabe de grados: la base
// acepta perfectamente que un nivel 2 cuelgue de otro nivel 2, que es exactamente el árbol
// imposible que el Excel produce. La regla vive en `lib/sig/niveles.ts` y la aplica el
// servidor.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import { impedimentosParaDesactivar, validarPadre, type Nivel } from '@/lib/sig/niveles';

async function jerarquia(): Promise<Nivel[]> {
  return prisma.nivelActivo.findMany({
    select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
  });
}

export async function crearNivel(datos: {
  grado: number;
  nombre: string;
  padreId: number | null;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:administrar');
    if (datos.nombre.trim() === '') return { ok: false, mensaje: 'Falta el nombre.' };

    // Los tres valores de grado 1 son cerrados (D8). Crear un cuarto no es una operación
    // que esta pantalla ofrezca: el nivel 1 no separa razones sociales, separa naturalezas
    // de activo, y agregar una cuarta naturaleza es una decisión de la spec, no de la
    // interfaz.
    if (datos.grado === 1) {
      return {
        ok: false,
        mensaje:
          'Los niveles de grado 1 son EMPRESA, PRODUCTOS y PROYECTOS, y son cerrados. Un cuarto sería una decisión de la especificación, no de esta pantalla.',
      };
    }

    const niveles = await jerarquia();
    const v = validarPadre(datos.grado, datos.padreId, niveles);
    if (!v.ok) return { ok: false, mensaje: `No se puede: ${v.motivo}.` };

    // Un hermano con el mismo nombre bajo el mismo padre no es un error de la base —no hay
    // unique— pero sí un árbol que nadie puede leer: dos «Ambientes» bajo MINTRACE no se
    // distinguen en el mapa.
    if (niveles.some((n) => n.padreId === datos.padreId && n.nombre.trim().toLowerCase() === datos.nombre.trim().toLowerCase())) {
      return { ok: false, mensaje: 'Ya hay un nivel con ese nombre en el mismo padre.' };
    }

    await prisma.$transaction(async (tx) => {
      const creado = await tx.nivelActivo.create({
        data: {
          grado: datos.grado,
          nombre: datos.nombre.trim(),
          padreId: datos.padreId,
          orden: niveles.filter((n) => n.padreId === datos.padreId).length + 1,
        },
      });
      await registrarAlta(tx, autor, 'nivel_activo', String(creado.id));
    });

    revalidatePath('/tecnologia/niveles');
    revalidatePath('/tecnologia/mapa');
    return { ok: true, mensaje: `Nivel «${datos.nombre.trim()}» creado.` };
  });
}

/// E1 · **un nivel con hijos o con activos no se desactiva sin resolver qué pasa con ellos.**
/// Los activos quedarían apuntando a una rama que ya no se dibuja, que es la forma
/// silenciosa de perder inventario.
export async function desactivarNivel(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:administrar');
    exigirId(id, 'el nivel');
    if (motivo.trim().length < 5) return { ok: false, mensaje: 'Decí por qué se desactiva.' };

    const [niveles, conteos, nivel] = await Promise.all([
      jerarquia(),
      prisma.activo.groupBy({ by: ['nivelId'], where: { activo: true }, _count: { _all: true } }),
      prisma.nivelActivo.findUnique({ where: { id }, select: { id: true, nombre: true, activo: true } }),
    ]);
    if (!nivel) return { ok: false, mensaje: 'El nivel no existe.' };
    if (!nivel.activo) return { ok: true, mensaje: 'Ya estaba inactivo.' };

    const porNivel = new Map<number, number>();
    for (const c of conteos) if (c.nivelId !== null) porNivel.set(c.nivelId, c._count._all);

    const impedimentos = impedimentosParaDesactivar(id, niveles, porNivel);
    if (impedimentos.length > 0) {
      return { ok: false, mensaje: `No se puede desactivar: ${impedimentos.join('; ')}.` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.nivelActivo.update({ where: { id }, data: { activo: false } });
      await registrar(tx, autor, [
        {
          tabla: 'nivel_activo',
          registroId: String(id),
          campo: 'activo',
          anterior: 'true',
          nuevo: 'false',
          motivo: motivo.trim(),
        },
      ]);
    });

    revalidatePath('/tecnologia/niveles');
    revalidatePath('/tecnologia/mapa');
    return { ok: true, mensaje: `«${nivel.nombre}» quedó inactivo.` };
  });
}

/// Aplica la plantilla mínima a un nivel 1 de clase PRODUCTOS o PROYECTOS: **crea los nodos
/// de nivel 2 y 3 que la configuración espera**, y no crea activos.
///
/// E8 · lo que crea son los CONTENEDORES, no el contenido. Los activos esperados quedan
/// como faltantes a la vista — la plantilla señala, no rellena. Crear activos vacíos para
/// que la lista se vea completa sería inventar inventario.
export async function aplicarPlantilla(nivel1Id: number, nombreNivel2: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:administrar');
    exigirId(nivel1Id, 'el nivel raíz');
    if (nombreNivel2.trim() === '') return { ok: false, mensaje: 'Falta el nombre del producto o proyecto.' };

    const raiz = await prisma.nivelActivo.findUnique({
      where: { id: nivel1Id },
      select: { id: true, grado: true, clase: true, nombre: true },
    });
    if (!raiz) return { ok: false, mensaje: 'El nivel raíz no existe.' };
    if (raiz.grado !== 1 || raiz.clase === null) {
      return { ok: false, mensaje: 'La plantilla se aplica sobre un nivel de grado 1.' };
    }

    const plantilla = await prisma.plantillaNivel.findMany({
      where: { claseNivel: raiz.clase },
      orderBy: { orden: 'asc' },
    });
    if (plantilla.length === 0) {
      return { ok: false, mensaje: `No hay plantilla definida para la clase ${raiz.clase}.` };
    }

    const nombres = [...new Set(plantilla.map((p) => p.nombreNivel3))];
    let creado2 = 0;

    await prisma.$transaction(async (tx) => {
      const nivel2 = await tx.nivelActivo.create({
        data: { grado: 2, nombre: nombreNivel2.trim(), padreId: raiz.id, orden: 1 },
      });
      await registrarAlta(tx, autor, 'nivel_activo', String(nivel2.id));
      creado2 = nivel2.id;
      let orden = 1;
      for (const nombre of nombres) {
        const n3 = await tx.nivelActivo.create({
          data: { grado: 3, nombre, padreId: nivel2.id, orden },
        });
        await registrarAlta(tx, autor, 'nivel_activo', String(n3.id));
        orden += 1;
      }
      await registrar(tx, autor, [
        {
          tabla: 'nivel_activo',
          registroId: String(nivel2.id),
          campo: 'plantilla aplicada',
          anterior: null,
          nuevo: nombres.join(', '),
          motivo: `configuración mínima de ${raiz.clase}`,
        },
      ]);
    });

    revalidatePath('/tecnologia/niveles');
    revalidatePath('/tecnologia/mapa');
    return {
      ok: creado2 > 0,
      mensaje: `«${nombreNivel2.trim()}» creado con sus ${nombres.length} nodos. Los activos esperados quedan como faltantes: la plantilla señala, no rellena.`,
    };
  });
}

/// Asigna el nivel 3 de un activo. **Sólo un nivel 3**: E2, los grados 1 y 2 se derivan.
export async function asignarNivelAActivo(activoId: number, nivelId: number | null): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(activoId, 'el activo');

    if (nivelId !== null) {
      const nivel = await prisma.nivelActivo.findUnique({
        where: { id: nivelId },
        select: { grado: true, activo: true, nombre: true },
      });
      if (!nivel) return { ok: false, mensaje: 'El nivel no existe.' };
      if (nivel.grado !== 3) {
        return {
          ok: false,
          mensaje: 'El activo apunta al nivel 3, el más específico. Los grados 1 y 2 se derivan.',
        };
      }
      if (!nivel.activo) return { ok: false, mensaje: 'Ese nivel está inactivo.' };
    }

    const activo = await prisma.activo.findUnique({
      where: { id: activoId },
      select: { codigo: true, nombre: true, nivelId: true },
    });
    if (!activo) return { ok: false, mensaje: 'El activo no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.activo.update({ where: { id: activoId }, data: { nivelId } });
      await registrar(tx, autor, [
        {
          tabla: 'activo',
          registroId: activo.codigo ?? String(activoId),
          campo: 'nivel',
          anterior: activo.nivelId === null ? null : String(activo.nivelId),
          nuevo: nivelId === null ? null : String(nivelId),
          motivo: 'clasificación en la jerarquía del inventario',
        },
      ]);
    });

    revalidatePath('/tecnologia/niveles');
    revalidatePath('/tecnologia/mapa');
    revalidatePath('/sgsi/inventario');
    return { ok: true, mensaje: nivelId === null ? 'Activo sin clasificar.' : 'Activo clasificado.' };
  });
}

/// D14 · crear el agrupador. **Un producto encabeza un nivel 1 de clase PRODUCTOS o
/// PROYECTOS, y sólo uno.** La unique del esquema lo impone; acá se explica.
///
/// No recibe fase ni versión: no son del producto, son del sistema, y viven en REQ-SIG-08.
export async function crearProducto(datos: {
  nivelId: number;
  nombre: string;
  descripcion?: string;
  responsableId: number;
  clienteRef?: string;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(datos.nivelId, 'el nivel raíz');
    exigirId(datos.responsableId, 'el responsable');
    if (datos.nombre.trim() === '') return { ok: false, mensaje: 'Falta el nombre.' };

    const nivel = await prisma.nivelActivo.findUnique({
      where: { id: datos.nivelId },
      select: { grado: true, clase: true, activo: true, nombre: true },
    });
    if (!nivel) return { ok: false, mensaje: 'El nivel no existe.' };
    if (nivel.grado !== 1 || (nivel.clase !== 'PRODUCTOS' && nivel.clase !== 'PROYECTOS')) {
      return {
        ok: false,
        mensaje: 'Un producto encabeza un nivel de grado 1 de clase PRODUCTOS o PROYECTOS.',
      };
    }
    if (!nivel.activo) return { ok: false, mensaje: 'Ese nivel está inactivo.' };

    const ocupado = await prisma.producto.findUnique({
      where: { nivelId: datos.nivelId },
      select: { nombre: true },
    });
    if (ocupado) {
      return { ok: false, mensaje: `Ese nivel ya lo encabeza «${ocupado.nombre}».` };
    }

    await prisma.$transaction(async (tx) => {
      const creado = await tx.producto.create({
        data: {
          nivelId: datos.nivelId,
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion?.trim() || null,
          responsableId: datos.responsableId,
          clienteRef: datos.clienteRef?.trim() || null,
        },
      });
      await registrarAlta(tx, autor, 'producto', String(creado.id));
    });

    revalidatePath('/tecnologia/productos');
    return { ok: true, mensaje: `«${datos.nombre.trim()}» creado.` };
  });
}
