// app/sig/tablero-auditoria/page.tsx
//
// El tablero de auditoría: programa cumplido, cobertura de la norma (con los
// numerales nunca auditados señalados), notas por tipo y entrega del informe contra
// el plazo. Todo calculado al leer.

import { prisma } from '@/lib/db';
import { vencidoEntrega } from '@/lib/sig/auditorias';

export const dynamic = 'force-dynamic';

export default async function TableroAuditoriaPage() {
  const [programas, auditorias, normas, hallazgos] = await Promise.all([
    prisma.programaAuditoria.findMany({
      include: { programadas: { include: { auditorias: true } } },
    }),
    prisma.auditoria.findMany({
      include: { celdas: { include: { notas: true } }, programada: true },
    }),
    prisma.normaAuditable.findMany({
      include: { requisitos: { include: { _count: { select: { celdas: true } } } } },
    }),
    prisma.hallazgo.count({ where: { origen: 'AUDITORIA_INTERNA', fechaCierre: null } }),
  ]);

  const programa = programas[0] ?? null;
  const programadas = programa?.programadas ?? [];
  const ejecutadas = programadas.filter((p) => p.auditorias.some((a) => a.cerradaEn || a.emitidoEn)).length;
  const cumplimiento = programadas.length === 0 ? null : Math.round((ejecutadas / programadas.length) * 100);

  const notas = auditorias.flatMap((a) => a.celdas.flatMap((c) => c.notas));
  const porTipo = {
    OK: notas.filter((n) => n.tipo === 'OK').length,
    NC: notas.filter((n) => n.tipo === 'NC').length,
    OM: notas.filter((n) => n.tipo === 'OM').length,
    RM: notas.filter((n) => n.tipo === 'RM').length,
    FORTALEZA: notas.filter((n) => n.tipo === 'FORTALEZA').length,
  };

  const hoy = new Date();
  const vencidas = auditorias.filter((a) => {
    if (!a.fechaFin || a.emitidoEn) return false;
    const plazo = a.programada?.plazoInformeDias ?? 4;
    return vencidoEntrega(a.fechaFin, plazo, hoy);
  });

  const sinAuditar = normas.flatMap((n) =>
    n.requisitos.filter((r) => r.auditable && r._count.celdas === 0).map((r) => r.numeral),
  );

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <h1 className="titulo-pagina">Tablero de auditoría</h1>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={cumplimiento ?? 0} etiqueta={`programa cumplido ${ejecutadas}/${programadas.length}`} color="#0b5c44" sufijo="%" />
        <Cifra cifra={sinAuditar.length} etiqueta="numerales sin auditar" color="#a52016" />
        <Cifra cifra={porTipo.NC} etiqueta="no conformidades del año" color="#a52016" />
        <Cifra cifra={hallazgos} etiqueta="NC de años anteriores abiertas" color="#8a4407" />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-5">
        <div className="rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-12_5 font-semibold text-primary">Cobertura de la norma</h2>
          {sinAuditar.length > 0 ? (
            <p className="mt-2 rounded-campo px-3 py-2 text-11_5" style={{ background: '#fdeeeb', color: '#a52016' }}>
              Faltan: {sinAuditar.join(', ')} — conviene incluirlos en el programa del año
              próximo antes de que lo pregunte el auditor externo.
            </p>
          ) : (
            <p className="mt-2 text-12_5 text-muted">Todos los numerales auditables fueron auditados.</p>
          )}
        </div>

        <div className="rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-12_5 font-semibold text-primary">Notas por tipo</h2>
          <div className="mt-2 flex flex-col gap-1.5">
            {Object.entries(porTipo).map(([tipo, n]) => (
              <div key={tipo} className="flex items-center gap-3">
                <span className="w-20 font-mono text-11 text-muted">{tipo}</span>
                <span className="h-[6px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--hf-hairline-strong)' }}>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (n / Math.max(notas.length, 1)) * 100)}%`,
                      background: tipo === 'NC' ? '#a52016' : tipo === 'OM' ? '#b8791a' : tipo === 'OK' ? '#0f7a5a' : '#8a4407',
                    }}
                  />
                </span>
                <span className="w-6 text-right font-mono text-11 text-primary">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-12_5 font-semibold text-primary">Entrega del informe</h2>
          {vencidas.length > 0 ? (
            <p className="mt-2 rounded-campo px-3 py-2 text-11_5" style={{ background: '#fdeeeb', color: '#a52016' }}>
              {vencidas.length} auditoría(s) con el informe vencido contra el plazo del programa (C7).
            </p>
          ) : (
            <p className="mt-2 text-12_5 text-muted">Sin entregas vencidas.</p>
          )}
        </div>

        <div className="rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-12_5 font-semibold text-primary">Hallazgos por origen</h2>
          <p className="mt-2 text-12_5 text-muted">
            {hallazgos} hallazgo(s) de auditoría interna abiertos en Mejora, con origen tipado
            a la auditoría, el proceso y el numeral.
          </p>
        </div>
      </section>
    </main>
  );
}

function Cifra({ cifra, etiqueta, color, sufijo }: { cifra: number; etiqueta: string; color: string; sufijo?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
        {sufijo ?? ''}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}