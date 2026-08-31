// app/sig/obligaciones/page.tsx
//
// La lista maestra del numeral 8, tal como la dibuja el lienzo: chips por tipo,
// buscador, y la tabla con el cumplimiento del último periodo como barra + %.

import { prisma } from '@/lib/db';
import NuevaObligacion from './NuevaObligacion';

export const dynamic = 'force-dynamic';

export default async function ObligacionesPage() {
  const filas = await prisma.obligacion.findMany({
    where: { activa: true },
    orderBy: { id: 'asc' },
    include: {
      contenido: true,
      alcanceArea: { select: { nombre: true } },
      alcanceCargo: { select: { nombre: true } },
      alcancePersona: { select: { nombre: true } },
      responsableSeguimiento: { select: { nombre: true } },
    },
  });

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Obligaciones</h1>
          <p className="text-12_5 text-muted">
            La lista maestra del control operacional · {filas.length} obligaciones activas
          </p>
        </div>
        <NuevaObligacion />
      </div>

      <div className="mt-6 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Contenido</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Alcance</th>
              <th className="px-4 py-3 font-semibold">Periodicidad</th>
              <th className="px-4 py-3 font-semibold">Plazo</th>
              <th className="px-4 py-3 font-semibold">Seguimiento</th>
              <th className="px-4 py-3 text-right font-semibold">Último periodo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((o) => (
              <tr key={o.id} className="border-t border-border-default">
                <td className="px-4 py-3 font-mono text-11 text-muted">{o.contenido.codigo}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-primary">{o.contenido.titulo}</span>
                    {o.contenido.procedimientoOrigen && (
                      <span className="font-mono text-10_5 text-muted">{o.contenido.procedimientoOrigen}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase"
                    style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                  >
                    {o.contenido.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {textoAlcance(o.alcance, o.alcancePersona?.nombre, o.alcanceCargo?.nombre, o.alcanceArea?.nombre)}
                </td>
                <td className="px-4 py-3 text-muted">{o.periodicidad.toLowerCase()}</td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{o.plazoDias} d</td>
                <td className="px-4 py-3 text-muted">{o.responsableSeguimiento.nombre}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-[5px] w-12 overflow-hidden rounded-full"
                      style={{ background: 'var(--hf-hairline-strong)' }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{ width: '0%', background: 'var(--hf-text-label)' }}
                      />
                    </span>
                    <span className="font-mono text-11 text-muted">—</span>
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

function textoAlcance(
  alcance: string,
  persona: string | undefined,
  cargo: string | undefined,
  area: string | undefined,
): string {
  if (alcance === 'TODOS') return 'Toda la organización';
  return persona ?? cargo ?? area ?? alcance;
}