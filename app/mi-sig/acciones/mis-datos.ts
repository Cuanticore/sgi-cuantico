'use server';

// app/mi-sig/acciones/mis-datos.ts
//
// Los datos que la propia persona mantiene sobre sí misma.
//
// ── LA PERSONA EDITA LOS SUYOS, Y SÓLO LOS SUYOS ────────────────────────────────────────
//
// No hay parámetro `personaId` en ninguna de estas acciones, y es deliberado: la persona
// sale de la SESIÓN. Un `personaId` que llegara del cliente sería una forma de editar los
// datos de otro escribiendo un número distinto, y ningún permiso lo impediría porque acá el
// permiso no es «administrar personas» — es «ser esa persona».
//
// ── LO QUE MANDA EL DIRECTORIO NO SE EDITA ACÁ ──────────────────────────────────────────
//
// Nombre, correo y existencia los manda el Directorio Activo: la aplicación los sincroniza y
// sobreescribirlos desde Mi SIG duraría hasta la próxima corrida. Área y cargo los manda el
// SIG y los edita quien administra personas, no la persona. Lo que queda —contacto, salud,
// familia— es lo único que la persona conoce mejor que el sistema.

import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';

export interface Resultado {
  ok: boolean;
  mensaje: string;
}

export interface MisDatos {
  telefono: string;
  correoPersonal: string;
  direccion: string;
  ciudad: string;
  /// `AAAA-MM-DD`, o cadena vacía.
  fechaNacimiento: string;
  eps: string;
  arl: string;
}

export interface HijoDeclarado {
  /// `null` cuando es nuevo.
  id: number | null;
  nombre: string;
  fechaNacimiento: string;
  genero: 'FEMENINO' | 'MASCULINO' | 'NO_DECLARA';
}

/// La persona de la sesión, o `null` si la cuenta no está en el censo.
async function yo(): Promise<{ id: number; correo: string } | null> {
  const session = await getServerSession(authOptions);
  const correo = session?.user?.email?.toLowerCase();
  if (!correo) return null;
  return prisma.persona.findUnique({ where: { correo }, select: { id: true, correo: true } });
}

const soloFecha = (v: string): Date | null =>
  v.trim() === '' ? null : new Date(`${v.trim()}T00:00:00.000Z`);

const limpio = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export async function guardarMisDatos(datos: MisDatos): Promise<Resultado> {
  const persona = await yo();
  if (persona === null) {
    return { ok: false, mensaje: 'Tu cuenta no está en el censo, así que no hay ficha que editar.' };
  }

  const antes = await prisma.persona.findUnique({
    where: { id: persona.id },
    select: {
      telefono: true,
      correoPersonal: true,
      direccion: true,
      ciudad: true,
      fechaNacimiento: true,
      eps: true,
      arl: true,
    },
  });
  if (antes === null) return { ok: false, mensaje: 'No se encontró tu ficha.' };

  const despues = {
    telefono: limpio(datos.telefono),
    correoPersonal: limpio(datos.correoPersonal),
    direccion: limpio(datos.direccion),
    ciudad: limpio(datos.ciudad),
    fechaNacimiento: soloFecha(datos.fechaNacimiento),
    eps: limpio(datos.eps),
    arl: limpio(datos.arl),
  };

  await prisma.$transaction(async (tx) => {
    await tx.persona.update({ where: { id: persona.id }, data: despues });
    // La bitácora la firma la propia persona: acá el autor y el sujeto son el mismo, y eso
    // es exactamente lo que hay que poder demostrar — que el dato lo puso quien lo conoce.
    await registrar(
      tx,
      persona.correo,
      (Object.keys(despues) as (keyof typeof despues)[]).map((campo) => ({
        tabla: 'persona',
        registroId: persona.correo,
        campo,
        anterior: antes[campo],
        nuevo: despues[campo],
      })),
    );
  });

  revalidatePath('/mi-sig/mis-datos');
  return { ok: true, mensaje: 'Tus datos quedaron guardados.' };
}

/// Reemplaza la lista de hijos por la que llega.
///
/// LLEGA LA LISTA ENTERA, como las casillas de los grupos: es un conjunto que se edita como
/// conjunto, y mandarlo completo permite que el servidor decida qué cambió. Acá el borrado sí
/// es FÍSICO —a diferencia de una membresía de grupo— porque esta tabla no tiene columna de
/// baja y porque «quién era hijo de alguien en marzo» no es una pregunta de auditoría: es un
/// dato personal de un tercero que, si se corrige, se corrige.
export async function guardarMisHijos(hijos: HijoDeclarado[]): Promise<Resultado> {
  const persona = await yo();
  if (persona === null) {
    return { ok: false, mensaje: 'Tu cuenta no está en el censo, así que no hay ficha que editar.' };
  }

  for (const h of hijos) {
    if (h.nombre.trim() === '') return { ok: false, mensaje: 'Cada hijo necesita un nombre.' };
    if (soloFecha(h.fechaNacimiento) === null) {
      return { ok: false, mensaje: `Falta la fecha de nacimiento de «${h.nombre.trim()}».` };
    }
  }

  const vigentes = await prisma.hijoColaborador.findMany({
    where: { personaId: persona.id },
    select: { id: true },
  });
  const quedan = new Set(hijos.map((h) => h.id).filter((id): id is number => id !== null));

  await prisma.$transaction(async (tx) => {
    const aBorrar = vigentes.filter((v) => !quedan.has(v.id)).map((v) => v.id);
    if (aBorrar.length > 0) {
      await tx.hijoColaborador.deleteMany({ where: { id: { in: aBorrar }, personaId: persona.id } });
    }
    for (const h of hijos) {
      const datos = {
        nombre: h.nombre.trim(),
        fechaNacimiento: soloFecha(h.fechaNacimiento) as Date,
        genero: h.genero,
      };
      if (h.id === null) {
        await tx.hijoColaborador.create({ data: { personaId: persona.id, ...datos } });
      } else {
        // `personaId` en el `where` no es redundante: sin él, un id ajeno en el cuerpo de la
        // petición editaría el hijo de otra persona.
        await tx.hijoColaborador.updateMany({
          where: { id: h.id, personaId: persona.id },
          data: datos,
        });
      }
    }
    await registrar(tx, persona.correo, [
      {
        tabla: 'hijo_colaborador',
        registroId: persona.correo,
        campo: 'hijos declarados',
        anterior: vigentes.length,
        nuevo: hijos.length,
      },
    ]);
  });

  revalidatePath('/mi-sig/mis-datos');
  return { ok: true, mensaje: 'Tu familia quedó actualizada.' };
}
