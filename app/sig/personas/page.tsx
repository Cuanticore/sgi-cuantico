// app/sig/personas/page.tsx
//
// El censo con su rol derivado de los grupos (la aplicación no guarda roles), el estado,
// la última sincronización y el botón de sincronizar (A1) solo para quien administra.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDeLaPersona, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { explicarFallo, oidsDelGrupoSig } from '@/lib/sgsi/directorio';
import { esVencida } from '@/lib/sig/cierre';
import { CAMPOS_DE_SINCRONIZACION, resumirCorrida } from '@/lib/sig/personas';
import PersonasClient, { type AsignacionAbierta, type Corrida } from './Personas.client';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);
  const administra = puede(rol, 'personas:administrar');

  const [personas, pendientes, miembrosDelGrupo, ultimaFilaDeCorrida] = await Promise.all([
    prisma.persona.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        area: { select: { nombre: true } },
        cargo: { select: { nombre: true } },
      },
    }),
    prisma.asignacion.findMany({
      where: { estado: 'PENDIENTE' },
      select: {
        id: true,
        personaId: true,
        titulo: true,
        fechaLimite: true,
        contenido: { select: { codigo: true, titulo: true } },
        obligacion: { select: { contenido: { select: { codigo: true, titulo: true } } } },
      },
      orderBy: { fechaLimite: 'asc' },
    }),
    // El rol no está en la base y no va a estar: lo dan los grupos del Directorio. Se
    // pregunta al leer, junto con el censo, y cuando no se puede, viene la causa.
    oidsDelGrupoSig(),
    // La franja del lienzo resume la última corrida, y ese resumen sólo existía dentro del
    // mensaje que devolvía `sincronizarDirectorio`: se perdía al recargar, así que entrar en
    // frío a la pantalla no dejaba rastro de qué había hecho la última sincronización.
    //
    // Se DERIVA de la bitácora en vez de guardarse. `app/sig/acciones/personas.ts` es el
    // único escritor de filas con `tabla: 'persona'`, así que el rastro no tiene ruido de
    // otros orígenes, y toda la corrida va en una sola transacción: `ocurrido_en` sale del
    // `CURRENT_TIMESTAMP` de Postgres, que dentro de una transacción es el instante en que
    // empezó, y por eso las filas de una misma corrida comparten el valor exacto. Guardar
    // aparte un resumen que la bitácora ya contiene sería guardar lo derivable.
    // **P28 (REQ-SIG-15) · acotado por campo, y no es opcional.**
    //
    // El comentario de arriba decía que `app/sig/acciones/personas.ts` es el único escritor de
    // filas con `tabla: 'persona'`. **Ya no lo es**: `personas-edicion.ts` escribe una fila
    // por campo cada vez que alguien guarda la pertenencia de una persona desde el popup.
    //
    // Sin este filtro, una edición manual de tres campos se vuelve «la última corrida» —con
    // su fecha y las cuatro cifras en cero, porque `resumirCorrida` no sabe contar 'área' ni
    // 'teléfono'— y la franja anuncia una sincronización que nunca ocurrió. Se filtra por los
    // campos que el resumen SÍ cuenta, que es la lista que vive junto a él.
    prisma.bitacora.findFirst({
      where: { tabla: 'persona', campo: { in: [...CAMPOS_DE_SINCRONIZACION] } },
      orderBy: { ocurridoEn: 'desc' },
      select: { ocurridoEn: true },
    }),
  ]);

  // Una corrida que no cambió nada no escribe bitácora, así que lo que se puede reconstruir
  // es la última corrida CON CAMBIOS. La franja lo dice con esas palabras y con su fecha, en
  // vez de presentarla como «la última» a secas.
  const corrida: Corrida | null = ultimaFilaDeCorrida
    ? {
        cuando: ultimaFilaDeCorrida.ocurridoEn.toISOString(),
        ...resumirCorrida(
          // El mismo filtro acá: una edición del popup puede caer en el mismo instante que
          // una corrida —dos transacciones concurrentes comparten `CURRENT_TIMESTAMP` sólo
          // por casualidad, pero la casualidad ocurre— y sus filas inflarían el resumen.
          await prisma.bitacora.findMany({
            where: {
              tabla: 'persona',
              ocurridoEn: ultimaFilaDeCorrida.ocurridoEn,
              campo: { in: [...CAMPOS_DE_SINCRONIZACION] },
            },
            select: { campo: true, valorNuevo: true },
          }),
        ),
      }
    : null;

  const hoy = new Date();
  // La columna cuenta PENDIENTES ABIERTOS, no solo los vencidos.
  //
  // Contar únicamente vencidos dejaba en cero a quien acaba de salir del Directorio con seis
  // tareas todavía en plazo, y ese cero es la única señal de que hay carga que reasignar: la
  // pantalla decía que no había nada que mover justo cuando más había. Las vencidas siguen
  // contándose aparte, porque son las que urgen.
  const abiertasDe = new Map<number, AsignacionAbierta[]>();
  for (const p of pendientes) {
    const contenido = p.contenido ?? p.obligacion?.contenido ?? null;
    const lista = abiertasDe.get(p.personaId) ?? [];
    lista.push({
      id: p.id,
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? p.titulo ?? 'Puntual',
      fechaLimite: p.fechaLimite.toISOString(),
      vencida: esVencida('PENDIENTE', p.fechaLimite, hoy),
    });
    abiertasDe.set(p.personaId, lista);
  }

  const filas = personas.map((p) => {
    const abiertas = abiertasDe.get(p.id) ?? [];
    return {
      id: p.id,
      nombre: p.nombre,
      correo: p.correo,
      area: p.area?.nombre ?? null,
      cargo: p.cargo?.nombre ?? null,
      activa: p.activa,
      sincronizadaEn: p.sincronizadaEn?.toISOString() ?? null,
      pendientes: abiertas.length,
      vencidas: abiertas.filter((a) => a.vencida).length,
      // El panel las lista una por una: reasignar «3 pendientes» sin decir cuáles obliga a
      // salir de la pantalla para saber qué se está moviendo.
      abiertas,
      rol: rolDeLaPersona(p.oid, miembrosDelGrupo.ok ? miembrosDelGrupo.datos : null),
    };
  });

  return (
    <PersonasClient
      filas={filas}
      corrida={corrida}
      administra={administra}
      rolesConsultables={miembrosDelGrupo.ok}
      motivoSinRoles={miembrosDelGrupo.ok ? null : explicarFallo(miembrosDelGrupo.fallo)}
    />
  );
}