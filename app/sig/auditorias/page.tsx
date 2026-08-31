// app/sig/auditorias/page.tsx
//
// El listado de auditorías del año, con su estado calculado y el enlace a la ficha.

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { estadoAuditoria } from '@/lib/sig/auditorias';

export const dynamic = 'force-dynamic';

export default async function AuditoriasPage() {
  const auditorias = await prisma.auditoria.findMany({
    orderBy: { fechaInicio: 'desc' },
    include: {
      auditorLider: { select: { nombre: true } },
      celdas: { include: { notas: true } },
      informes: true,
    },
  });

  const filas = auditorias.map((a) => {
    const notas = a.celdas.flatMap((c) => c.notas).length;
    const estado = estadoAuditoria({
      emitidoEn: a.emitidoEn,
      cerradaEn: a.cerradaEn,
      notas,
      preliminar: a.informes.some((i) => i.version === 'PRELIMINAR'),
    });
    return {
      id: a.id,
      objeto: a.objeto,
      tipo: a.tipo,
      fechaInicio: a.fechaInicio.toISOString().slice(0, 10),
      lider: a.auditorLider.nombre,
      notas,
      estado,
    };
  });

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <h1 className="titulo-pagina">Auditorías</h1>
      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Auditoría</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Inicio</th>
              <th className="px-4 py-3 font-semibold">Líder</th>
              <th className="px-4 py-3 text-right font-semibold">Notas</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-border-default">
                <td className="px-4 py-3">
                  <Link
                    href={`/sig/auditorias/${f.id}`}
                    className="font-medium text-primary"
                    style={{ color: 'var(--hf-brand-nav)' }}
                  >
                    {f.objeto}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{f.tipo.toLowerCase()}</td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{f.fechaInicio}</td>
                <td className="px-4 py-3 text-muted">{f.lider}</td>
                <td className="px-4 py-3 text-right font-mono text-11">{f.notas}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
                    style={
                      f.estado === 'EMITIDA'
                        ? { background: '#e6efe9', color: '#0b5c44' }
                        : f.estado === 'INFORME_PRELIMINAR'
                          ? { background: '#faf1d3', color: '#6b5410' }
                          : { background: '#eef2f8', color: '#12437f' }
                    }
                  >
                    {f.estado.replaceAll('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}