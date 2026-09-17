// app/sgsi/sentinel/page.tsx
//
// Incidentes de Microsoft Sentinel: la vista de consulta del espejo de solo lectura.
//
// Mismo patrón que `app/sgsi/eventos/page.tsx`: server component que resuelve los datos,
// componente cliente para la interacción. La lectura la gatea el middleware de `/sgsi`,
// igual que el resto de la sección; sólo la escritura (Promover) necesita `sgsi:escribir`,
// y esa compuerta se calcula acá para decidir si el botón se dibuja.

import { prisma } from '@/lib/db';
import { rolActual } from '@/app/sgsi/acciones/sesion';
import { puede } from '@/lib/sgsi/permisos';
import SentinelClient from './Sentinel.client';

export const dynamic = 'force-dynamic';

export default async function SentinelPage() {
  const [incidentes, lugares, rol] = await Promise.all([
    prisma.incidenteSentinel.findMany({ orderBy: { creadoEnSentinel: 'desc' } }),
    prisma.lugarEvento.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    rolActual(),
  ]);

  // El vínculo con el evento promovido vive en `EventoSeguridad`, no en el espejo (D2): dos
  // columnas para el mismo hecho serían dos verdades.
  const promovidos = await prisma.eventoSeguridad.findMany({
    where: { origenSistema: 'SENTINEL' },
    select: { origenIdExterno: true, codigo: true },
  });
  const codigoPorClave = new Map(
    promovidos
      .filter((p) => p.origenIdExterno !== null)
      .map((p) => [p.origenIdExterno as string, p.codigo]),
  );

  const filas = incidentes.map((i) => ({
    numeroIncidente: i.numeroIncidente,
    titulo: i.titulo,
    estadoSentinel: i.estadoSentinel,
    severidadSentinel: i.severidadSentinel,
    creadoEnSentinel: i.creadoEnSentinel.toISOString().slice(0, 10),
    sincronizadoEn: i.sincronizadoEn.toISOString().slice(0, 16).replace('T', ' '),
    url: i.url,
    promovidoComo: codigoPorClave.get(i.numeroIncidente) ?? null,
  }));

  return (
    <SentinelClient
      filas={filas}
      lugares={lugares.map((l) => ({ id: l.id, nombre: l.nombre }))}
      puedePromover={puede(rol, 'sgsi:escribir')}
    />
  );
}
