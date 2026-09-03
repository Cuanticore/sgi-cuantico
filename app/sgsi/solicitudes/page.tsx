// app/sgsi/solicitudes/page.tsx
//
// Solicitudes con aprobación. Cuatro tipos, un solo flujo.
//
// **Ningún estado se almacena.** Ni el de la solicitud ni el de sus pasos: salen de qué
// marcas de fecha están puestas. Una columna «estado» quedaría vieja el día que alguien
// autorice sin pasar por acá, y este módulo existe justamente para que eso deje rastro.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { estadoDeSolicitud, puedeAutorizar } from '@/lib/sig/accesos';
import SolicitudesClient from './Solicitudes.client';

export const dynamic = 'force-dynamic';

const momento = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 16).replace('T', ' '));

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; tipo?: string }>;
}) {
  const { s, tipo } = await searchParams;
  const session = await getServerSession(authOptions);
  const correo = session?.user?.email ?? '';

  const [solicitudes, yo, personas, perfiles] = await Promise.all([
    prisma.solicitud.findMany({
      orderBy: { creadaEn: 'desc' },
      include: {
        solicitante: { select: { id: true, nombre: true } },
        autorizadoPor: { select: { nombre: true } },
        ejecutadoPor: { select: { nombre: true } },
        accesos: { select: { id: true } },
      },
    }),
    correo === '' ? null : prisma.persona.findUnique({ where: { correo }, select: { id: true } }),
    prisma.persona.findMany({ where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.perfilAcceso.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, sistema: true },
      orderBy: [{ sistema: 'asc' }, { nombre: 'asc' }],
    }),
  ]);

  const elegida = solicitudes.find((x) => x.codigo === s) ?? solicitudes[0] ?? null;

  return (
    <SolicitudesClient
      tipoFiltro={tipo ?? 'todas'}
      elegidoCodigo={elegida?.codigo ?? null}
      lista={solicitudes.map((x) => ({
        codigo: x.codigo,
        tipo: x.tipo,
        titulo: x.titulo,
        solicitante: x.solicitante.nombre,
        creadaEn: x.creadaEn.toISOString().slice(0, 10),
        esEmergencia: x.esEmergencia,
        estado: estadoDeSolicitud({
          rechazada: x.rechazada,
          fechaAutorizacion: x.fechaAutorizacion,
          fechaEjecucion: x.fechaEjecucion,
        }),
      }))}
      ficha={
        elegida === null
          ? null
          : {
              codigo: elegida.codigo,
              tipo: elegida.tipo,
              titulo: elegida.titulo,
              detalle: elegida.detalle,
              justificacion: elegida.justificacion,
              esEmergencia: elegida.esEmergencia,
              vigenciaDesde: elegida.vigenciaDesde?.toISOString().slice(0, 10) ?? null,
              vigenciaHasta: elegida.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
              estado: estadoDeSolicitud({
                rechazada: elegida.rechazada,
                fechaAutorizacion: elegida.fechaAutorizacion,
                fechaEjecucion: elegida.fechaEjecucion,
              }),
              pide: { persona: elegida.solicitante.nombre, momento: momento(elegida.creadaEn), nota: null },
              autoriza: {
                persona: elegida.autorizadoPor?.nombre ?? null,
                momento: momento(elegida.fechaAutorizacion),
                nota: elegida.notaAutorizacion,
              },
              ejecuta: {
                persona: elegida.ejecutadoPor?.nombre ?? null,
                momento: momento(elegida.fechaEjecucion),
                nota: elegida.notaEjecucion,
              },
              accesosCreados: elegida.accesos.length,
              // El veredicto de O11 se calcula en el servidor y viaja resuelto: la pantalla
              // muestra el motivo, no lo decide. Sin sesión reconocida no se ofrece
              // autorizar — que es distinto de ofrecerlo y que falle al apretar.
              vetoAutorizar:
                yo === null
                  ? 'tu cuenta no está registrada como persona del SIG'
                  : (() => {
                      const v = puedeAutorizar(
                        {
                          solicitanteId: elegida.solicitanteId,
                          esEmergencia: elegida.esEmergencia,
                          rechazada: elegida.rechazada,
                          fechaAutorizacion: elegida.fechaAutorizacion,
                        },
                        yo.id,
                      );
                      return v.puede ? null : v.motivo;
                    })(),
            }
      }
      personas={personas}
      perfiles={perfiles.map((p) => ({ id: p.id, etiqueta: `${p.nombre} · ${p.sistema}` }))}
    />
  );
}
