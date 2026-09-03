// app/sgsi/accesos/page.tsx
//
// Accesos y perfiles. **O12 · un acceso es una relación con vigencia, nunca una casilla.**
//
// Toda la pantalla existe para sostener una pregunta que la matriz del consultor no puede
// responder: quién tenía qué acceso en una fecha pasada. Por eso la fecha de consulta es
// el primer control y no un filtro escondido.
//
// La fecha viaja por `searchParams` y no por estado del cliente a propósito: la respuesta
// a «quién tenía acceso al CRM el 31 de diciembre» es una URL que se puede pegar en un
// informe de auditoría.

import { prisma } from '@/lib/db';
import { accesosALaFecha, cierresDeTrimestre, type AccesoConVigencia } from '@/lib/sig/accesos';
import AccesosClient from './Accesos.client';

export const dynamic = 'force-dynamic';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function AccesosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: pedida } = await searchParams;
  const hoy = new Date();
  // Una fecha ilegible en la URL vuelve a hoy en silencio: es un parámetro de navegación,
  // no un dato que alguien esté guardando.
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? new Date(`${pedida}T00:00:00.000Z`) : hoy;

  const filas = await prisma.accesoPersona.findMany({
    include: {
      persona: { select: { nombre: true } },
      perfil: { select: { nombre: true, sistema: true } },
      solicitud: { select: { codigo: true } },
    },
    orderBy: [{ personaId: 'asc' }, { desde: 'asc' }],
  });

  const conVigencia: AccesoConVigencia[] = filas.map((f) => ({
    id: f.id,
    personaId: f.personaId,
    perfilId: f.perfilId,
    desde: f.desde,
    hasta: f.hasta,
    solicitudId: f.solicitudId,
  }));

  // El corte se hace con la misma función pura que prueban los tests; la pantalla no
  // vuelve a escribir la regla de vigencia.
  const vigentesIds = new Set(accesosALaFecha(conVigencia, fecha).map((a) => a.id));
  const vigentes = filas.filter((f) => vigentesIds.has(f.id));

  return (
    <AccesosClient
      fecha={iso(fecha)}
      hoy={iso(hoy)}
      cierres={cierresDeTrimestre(hoy).map(iso)}
      totalRelaciones={filas.length}
      accesos={vigentes.map((f) => ({
        id: f.id,
        persona: f.persona.nombre,
        perfil: f.perfil.nombre,
        sistema: f.perfil.sistema,
        desde: iso(f.desde),
        hasta: f.hasta === null ? null : iso(f.hasta),
        sustento: f.solicitud?.codigo ?? null,
      }))}
    />
  );
}
