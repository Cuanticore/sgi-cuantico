'use client';

// app/sig/programa/Programa.client.tsx
//
// La grilla 12 meses con casillas de 20×20 (✓ verde ejecutada, ✗ azul programada,
// ! roja vencida), badges de estado y el pie del plazo que se calcula (C7).

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ProgramaClient({
  anio,
  alcance,
  objetivo,
  criterios,
  metodos,
  filas,
}: {
  anio: number | null;
  alcance: string | null;
  objetivo: string | null;
  criterios: string | null;
  metodos: string | null;
  filas: {
    id: number;
    proceso: string;
    meses: number[];
    ejecutadas: number;
    total: number;
    tipo: string;
    responsable: string;
    plazo: number;
    vencida: boolean;
  }[];
}) {
  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Programa de auditoría</h1>
          <p className="text-12_5 text-muted">
            {anio ? `Programa ${anio}` : 'Sin programa'} · {alcance ?? ''}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
        >
          Exportar
        </button>
      </div>

      {objetivo && (
        <p className="mt-3 max-w-[900px] text-11_5 text-muted">
          {objetivo} · Criterios: {criterios} · Métodos: {metodos}
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Proceso a auditar</th>
              {MESES.map((m) => (
                <th key={m} className="px-2 py-3 text-center font-semibold">{m}</th>
              ))}
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Responsable</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-border-default">
                <td className="px-4 py-3 font-medium text-primary">{f.proceso}</td>
                {MESES.map((_, i) => {
                  const mes = i + 1;
                  const programada = f.meses.includes(mes);
                  const ejecutada = programada && f.total > 0 && f.ejecutadas > 0;
                  const vencida = f.vencida && programada;
                  return (
                    <td key={i} className="px-2 py-3 text-center">
                      {programada ? (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-10 font-bold text-white"
                          style={{ background: vencida ? '#a52016' : ejecutada ? '#0f7a5a' : '#12437f' }}
                          title={vencida ? 'Vencida sin ejecutar' : ejecutada ? 'Ejecutada' : 'Programada'}
                        >
                          {vencida ? '!' : ejecutada ? '✓' : '✗'}
                        </span>
                      ) : (
                        <span className="text-muted">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-muted">{f.tipo.toLowerCase()}</td>
                <td className="px-4 py-3 text-muted">{f.responsable}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                    style={
                      f.vencida
                        ? { background: '#fdeeeb', color: '#a52016' }
                        : f.total > 0 && f.ejecutadas === f.total
                          ? { background: '#e6efe9', color: '#0b5c44' }
                          : { background: '#eef2f8', color: '#12437f' }
                    }
                  >
                    {f.vencida ? 'Vencida' : f.total > 0 && f.ejecutadas === f.total ? 'Ejecutada' : 'Programada'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-11_5 text-muted">
        Tiempo máximo de entrega del informe: {filas[0]?.plazo ?? 4} días calendario, y el
        vencimiento se calcula (C7). La elaboración en el primer bimestre es obligación del
        motor de tareas (C1).
      </p>
    </main>
  );
}