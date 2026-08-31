// app/sig/mejora/page.tsx
//
// Las cuatro cifras y las cuatro tarjetas del artboard TableroMejora: embudo por
// estado, por tipo, por origen y días hasta el cierre contra el plazo parametrizado.

import { prisma } from '@/lib/db';
import { estadoCalculado } from '@/lib/sig/hallazgos';

export const dynamic = 'force-dynamic';

export default async function TableroMejoraPage() {
  const [hallazgos, plazos] = await Promise.all([
    prisma.hallazgo.findMany({
      include: { analisis: true, acciones: true, verificaciones: true },
    }),
    prisma.plazoPorTipoHallazgo.findMany(),
  ]);

  const hoy = new Date();
  const conEstado = hallazgos.map((h) => ({
    ...h,
    estado: estadoCalculado({
      anuladoEn: h.anuladoEn,
      fechaCierre: h.fechaCierre,
      tieneAnalisis: h.analisis !== null,
      accionesAbiertas: h.acciones.filter((a) => a.asignacionId > 0).length,
      verificacionEficaz: h.verificaciones.some((v) => v.resultado === 'EFICAZ'),
      verificacionPendiente: false,
    }),
  }));

  const abiertos = conEstado.filter((h) => !['CERRADO', 'ANULADO'].includes(h.estado));
  const porEstado = ['ABIERTO', 'EN_ANALISIS', 'EN_EJECUCION', 'EN_VERIFICACION'].map((e) => ({
    estado: e,
    n: abiertos.filter((h) => h.estado === e).length,
  }));
  const porTipo = ['NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD'].map((t) => ({
    tipo: t,
    n: hallazgos.filter((h) => h.tipo === t).length,
  }));
  const porOrigen = Object.entries(
    hallazgos.reduce<Record<string, number>>((acc, h) => {
      acc[h.origen] = (acc[h.origen] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([origen, n]) => ({ origen, n }));
  const vencidos = abiertos.filter((h) => h.fechaCompromiso && h.fechaCompromiso < hoy);

  const verificadas = hallazgos.filter((h) => h.verificaciones.length > 0);
  const eficaces = verificadas.filter((h) => h.verificaciones.some((v) => v.resultado === 'EFICAZ'));
  const tasaEficacia = verificadas.length === 0 ? 0 : Math.round((eficaces.length / verificadas.length) * 100);
  const reincidentes = hallazgos.filter((h) => h.hallazgoAnteriorId !== null);
  const tasaReincidencia = hallazgos.length === 0 ? 0 : Math.round((reincidentes.length / hallazgos.length) * 100);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <h1 className="titulo-pagina">Tablero de mejora</h1>
      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={abiertos.length} etiqueta={`de ${hallazgos.length} en el año`} color="#12437f" />
        <Cifra cifra={vencidos.length} etiqueta="vencidos con su antigüedad" color="#a52016" />
        <Cifra cifra={tasaEficacia} etiqueta={`${eficaces.length} de ${verificadas.length} verificadas`} color="#0f7a5a" sufijo="%" />
        <Cifra cifra={tasaReincidencia} etiqueta={`${reincidentes.length} con antecesor`} color="#b8791a" sufijo="%" />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-5">
        <Tarjeta titulo="Dónde están los hallazgos abiertos">
          {porEstado.map((p) => (
            <Barra key={p.estado} etiqueta={p.estado.replaceAll('_', ' ')} n={p.n} total={Math.max(abiertos.length, 1)} />
          ))}
          {abiertos.length === 0 && <p className="text-12 text-muted">Sin hallazgos abiertos.</p>}
        </Tarjeta>
        <Tarjeta titulo="Por tipo">
          {porTipo.map((p) => (
            <Barra key={p.tipo} etiqueta={p.tipo.replace('_', ' ').toLowerCase()} n={p.n} total={Math.max(hallazgos.length, 1)} />
          ))}
        </Tarjeta>
        <Tarjeta titulo="De dónde salieron">
          {porOrigen.map((p) => (
            <Barra key={p.origen} etiqueta={p.origen.replaceAll('_', ' ').toLowerCase()} n={p.n} total={Math.max(hallazgos.length, 1)} />
          ))}
        </Tarjeta>
        <Tarjeta titulo="Días hasta el cierre">
          {plazos.map((p) => (
            <div key={p.tipo} className="flex items-center justify-between text-12_5">
              <span className="text-muted">{p.tipo.replace('_', ' ').toLowerCase()}</span>
              <span className="font-mono text-12" style={{ color: p.diasEjecucion > 60 ? '#a52016' : '#0f7a5a' }}>
                {p.diasEjecucion} d / plazo {p.diasEjecucion}
              </span>
            </div>
          ))}
        </Tarjeta>
      </section>
    </main>
  );
}

function Cifra({
  cifra,
  etiqueta,
  color,
  sufijo,
}: {
  cifra: number;
  etiqueta: string;
  color: string;
  sufijo?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
        {sufijo ?? ''}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface p-5">
      <h2 className="text-12_5 font-semibold text-primary">{titulo}</h2>
      {children}
    </section>
  );
}

function Barra({ etiqueta, n, total }: { etiqueta: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 truncate text-12 text-muted">{etiqueta}</span>
      <span
        className="h-[6px] flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--hf-hairline-strong)' }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.round((n / total) * 100)}%`, background: '#12437f' }}
        />
      </span>
      <span className="w-8 text-right font-mono text-11 text-primary">{n}</span>
    </div>
  );
}