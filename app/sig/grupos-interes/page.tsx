// app/sig/grupos-interes/page.tsx
//
// Los grupos de interés, vistos DESDE EL GRUPO.
//
// Hasta acá la pertenencia sólo se editaba desde el popup de una persona, una casilla a la
// vez. Marcar un grupo a quince personas eran quince popups, y ninguna pantalla contestaba
// «quién está en Mintrace» sin recorrer el censo entero. Es la misma información que ya
// estaba; lo que faltaba era poder preguntarla al derecho.
//
// LA PERTENENCIA DE «TODOS» NO SE LISTA IGUAL QUE LA DE LOS DEMÁS, y la pantalla lo dice.
// Es derivado (P10): su membresía se calcula —toda persona activa— y no tiene filas. Pintar
// su lista junto a las otras sugeriría que se puede editar, y no se puede: alguien sale de
// «Todos» inactivándose, no desmarcándose.

import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import GruposInteresClient, { type GrupoFila, type PersonaOpcion } from './GruposInteres.client';

export const dynamic = 'force-dynamic';

export default async function GruposInteresPage() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);
  const administra = puede(rol, 'personas:administrar');

  const [grupos, personas, activas] = await Promise.all([
    prisma.grupoInteres.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
      include: {
        // Sólo las VIGENTES. Una membresía cerrada es historia y no dice quién pertenece hoy;
        // la pregunta que esta pantalla contesta es la de hoy.
        miembros: {
          where: { hasta: null },
          include: { persona: { select: { id: true, nombre: true, correo: true, activa: true } } },
        },
        _count: { select: { obligaciones: true } },
      },
    }),
    prisma.persona.findMany({
      where: { activa: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, correo: true },
    }),
    prisma.persona.count({ where: { activa: true } }),
  ]);

  const filas: GrupoFila[] = grupos.map((g) => ({
    id: g.id,
    codigo: g.codigo,
    nombre: g.nombre,
    descripcion: g.descripcion,
    derivado: g.derivado,
    obligaciones: g._count.obligaciones,
    // Un grupo derivado no tiene filas y su cuenta es el censo activo: decir «0 miembros»
    // sería falso, y es justo el malentendido que P10 previene.
    miembros: g.derivado
      ? []
      : g.miembros.map((m) => ({
          personaId: m.persona.id,
          nombre: m.persona.nombre,
          correo: m.persona.correo,
          // Una persona inactiva con membresía vigente se sigue mostrando, y marcada: es
          // exactamente lo que hay que ver para poder cerrarla.
          activa: m.persona.activa,
          desde: m.desde.toISOString().slice(0, 10),
        })),
    cuentaDerivada: g.derivado ? activas : null,
  }));

  const opciones: PersonaOpcion[] = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    correo: p.correo,
  }));

  return <GruposInteresClient grupos={filas} personas={opciones} administra={administra} />;
}
