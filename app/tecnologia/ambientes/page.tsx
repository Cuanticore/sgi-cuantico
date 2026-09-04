// app/tecnologia/ambientes/page.tsx
//
// **Un despliegue no es un activo**: cuelga del activo y no genera riesgos propios. Esta
// pantalla existe para que la información que hoy no se ve —IP, puertos, ramas, servicios
// olvidados— tenga dónde vivir sin inflar el inventario ni el registro de riesgos.

import { prisma } from '@/lib/db';
import { resumirDespliegues } from '@/lib/sig/despliegues';
import AmbientesClient from './Ambientes.client';

export const dynamic = 'force-dynamic';

export default async function AmbientesPage() {
  const [despliegues, activos] = await Promise.all([
    prisma.despliegue.findMany({
      where: { activoRegistro: true },
      include: { activo: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: [{ ambiente: 'asc' }, { nombre: 'asc' }],
    }),
    prisma.activo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: 'asc' },
    }),
  ]);

  const resumen = resumirDespliegues(
    despliegues.map((d) => ({
      activoId: d.activoId,
      ambiente: d.ambiente,
      estado: d.estado,
      confianza: d.confianza,
    })),
  );

  return (
    <AmbientesClient
      resumen={resumen}
      // La cuenta de asociados se deriva del total menos los pendientes: guardarla como
      // campo propio sería guardar lo derivable, y quedaría vieja en cuanto alguien asocie
      // uno a mano.
      asociados={resumen.total - resumen.pendientesDeAsociar}
      filas={despliegues.map((d) => ({
        id: d.id,
        padre: d.activo === null ? null : { codigo: d.activo.codigo, nombre: d.activo.nombre },
        componente: d.componente ?? d.nombre,
        ambiente: d.ambiente,
        servidor: d.servidor,
        ip: d.ip,
        url: d.url,
        tagRama: d.tagRama,
        estado: d.estado,
        confianza: d.confianza,
        evidencia: d.evidencia,
      }))}
      activos={activos.map((a) => ({ id: a.id, etiqueta: `${a.codigo ?? `#${a.id}`} · ${a.nombre}` }))}
    />
  );
}
