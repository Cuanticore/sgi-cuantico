'use client';

// app/estrategico/legal/Legal.client.tsx
//
// La grilla con el banner de la matriz vacía, filtros por sistema y revisión vencida,
// el semáforo (fila rosada + fecha roja) y el panel del historial de evaluaciones con
// el botón «NO_CUMPLE â†’ hallazgo» (D7) y «derogar» (D8).

import { useMemo, useState } from 'react';
import { evaluarCumplimiento, derogarRequisito } from '@/app/sig/acciones/estrategico';

export interface RequisitoFila {
  id: number;
  consecutivo: number;
  normatividad: string;
  objeto: string;
  tipo: string;
  sistemaGestion: string;
  proceso: string | null;
  responsable: string | null;
  periodicidad: string;
  vigente: boolean;
  derogadoPor: string | null;
  ultimoResultado: string | null;
  evaluaciones: { fecha: string; resultado: string; evidencia: string | null; evaluadoPor: string }[];
}

const SISTEMA_CHIP: Record<string, { fondo: string; texto: string }> = {
  SGC: { fondo: '#e9f0fb', texto: '#12437f' },
  SGSI: { fondo: '#e8f4ef', texto: '#0b5c44' },
  AMBOS: { fondo: '#faf1d3', texto: '#6b5410' },
};

const RESULTADO_CHIP: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  CUMPLE: { fondo: '#e6efe9', texto: '#0b5c44', etiqueta: 'Cumple' },
  PARCIAL: { fondo: '#fff3e6', texto: '#8a4407', etiqueta: 'Parcial' },
  NO_CUMPLE: { fondo: '#fdeeeb', texto: '#a52016', etiqueta: 'No cumple' },
};

export default function LegalClient({ filas }: { filas: RequisitoFila[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'SGC' | 'SGSI' | 'vencida'>('todos');
  const [seleccion, setSeleccion] = useState<RequisitoFila | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const vencidas = useMemo(() => {
    const hoy = new Date();
    return filas.filter((r) => {
      if (!r.vigente) return false;
      const dias = diasParaRevision(r, hoy);
      return dias !== null && dias < 0;
    });
  }, [filas]);

  const visibles = useMemo(() => {
    if (filtro === 'SGC') return filas.filter((r) => r.sistemaGestion === 'SGC' || r.sistemaGestion === 'AMBOS');
    if (filtro === 'SGSI') return filas.filter((r) => r.sistemaGestion === 'SGSI' || r.sistemaGestion === 'AMBOS');
    if (filtro === 'vencida') return vencidas;
    return filas;
  }, [filas, filtro, vencidas]);

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <h1 className="titulo-pagina">Requisitos legales</h1>
        <p
          className="mt-3 rounded-campo px-4 py-3 text-11_5"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          La matriz real está vacía (sin migración posible): las filas son semilla del
          marco normativo de MAN-CAL-01, y el levantamiento es un hallazgo en Mejora.
        </p>

        <nav className="mt-4 flex items-center gap-2">
          {(['todos', 'SGC', 'SGSI', 'vencida'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              aria-pressed={filtro === f}
              className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
              style={{
                background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: '1px solid var(--hf-border-field)',
              }}
            >
              {f === 'todos' ? 'Todos' : f === 'vencida' ? 'Revisión vencida' : f} ·{' '}
              {f === 'vencida' ? vencidas.length : f === 'todos' ? filas.length : filas.filter((r) => r.sistemaGestion === f || r.sistemaGestion === 'AMBOS').length}
            </button>
          ))}
        </nav>

        <div className="mt-4 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <table className="w-full text-left text-12_5">
            <thead>
              <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Normatividad y objeto</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Sistema</th>
                <th className="px-4 py-3 font-semibold">Responsable</th>
                <th className="px-4 py-3 font-semibold">Revisión</th>
                <th className="px-4 py-3 font-semibold">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const dias = diasParaRevision(r, new Date());
                const vencida = r.vigente && dias !== null && dias < 0;
                const proxima = dias !== null && dias <= 10 && r.vigente;
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-border-default"
                    style={vencida ? { background: '#fdeeeb' } : undefined}
                    onClick={() => setSeleccion(r)}
                  >
                    <td className="px-4 py-3 font-mono text-11 text-muted">{r.consecutivo}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-primary">{r.normatividad}</span>
                        <span className="text-11_5 text-muted">{r.objeto}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.tipo}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-[4px] px-2 py-0.5 font-mono text-9_5"
                        style={(() => { const c = SISTEMA_CHIP[r.sistemaGestion] ?? SISTEMA_CHIP.AMBOS; return { background: c.fondo, color: c.texto }; })()}
                      >
                        {r.sistemaGestion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.responsable ?? 'â€”'}</td>
                    <td className="px-4 py-3">
                      <span className="text-11_5 text-muted">{r.periodicidad}</span>
                      <span
                        className="ml-2 font-mono text-11 font-semibold"
                        style={{ color: vencida ? 'var(--hf-danger-text)' : proxima ? '#8a4407' : undefined }}
                      >
                        {dias === null ? 'â€”' : vencida ? `${dias} d` : `en ${dias} d`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.ultimoResultado ? (
                        <span
                          className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                          style={(() => { const c = RESULTADO_CHIP[r.ultimoResultado]; return { background: c.fondo, color: c.texto }; })()}
                        >
                          {RESULTADO_CHIP[r.ultimoResultado].etiqueta}
                        </span>
                      ) : (
                        <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5" style={{ background: '#f5f7f6', color: '#4a544f' }}>
                          Sin evaluar
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {seleccion && (
        <aside className="ml-6 flex h-fit w-[340px] shrink-0 flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-12_5 font-semibold text-primary">{seleccion.normatividad}</span>
            <button onClick={() => setSeleccion(null)} aria-label="Cerrar" className="text-14 text-muted">
              âœ•
            </button>
          </div>
          {!seleccion.vigente && (
            <p className="rounded-campo px-3 py-2 text-11_5" style={{ background: '#f5f7f6', color: '#4a544f' }}>
              Derogado por {seleccion.derogadoPor ?? 'â€”'}: vigente = false, las evaluaciones históricas se conservan.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Historial de evaluaciones</span>
            {seleccion.evaluaciones.map((e, i) => (
              <div key={i} className="flex flex-col gap-0.5 rounded-campo border border-border-default px-3 py-2">
                <span className="flex items-center justify-between">
                  <span className="rounded-[4px] px-1.5 py-0.5 font-mono text-9_5 font-semibold" style={(() => { const c = RESULTADO_CHIP[e.resultado]; return { background: c.fondo, color: c.texto }; })()}>
                    {RESULTADO_CHIP[e.resultado].etiqueta}
                  </span>
                  <span className="font-mono text-10_5 text-muted">{e.fecha}</span>
                </span>
                {e.evidencia && <span className="text-11_5 text-muted">{e.evidencia}</span>}
                <span className="text-10_5 text-muted">Por {e.evaluadoPor}</span>
              </div>
            ))}
            {seleccion.evaluaciones.length === 0 && <p className="text-11_5 text-muted">Sin evaluaciones.</p>}
          </div>
          {seleccion.vigente && (
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={async () => {
                  const r = await evaluarCumplimiento({
                    requisitoId: seleccion.id,
                    resultado: 'NO_CUMPLE',
                    origenHallazgo: true,
                  });
                  setMensaje(r.mensaje);
                }}
                className="rounded-campo px-3 py-1.5 text-12 font-semibold"
                style={{ background: '#fdeeeb', color: '#a52016' }}
              >
                NO_CUMPLE â†’ originar hallazgo
              </button>
              <button
                onClick={async () => {
                  const norma = prompt('Norma que deroga (obligatorio)');
                  if (!norma) return;
                  const r = await derogarRequisito(seleccion.id, norma);
                  setMensaje(r.mensaje);
                }}
                className="rounded-campo border px-3 py-1.5 text-12 text-muted"
                style={{ borderColor: 'var(--hf-border-field)' }}
              >
                Derogar
              </button>
            </div>
          )}
          {mensaje && <p className="text-11_5" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
        </aside>
      )}
    </main>
  );
}

function diasParaRevision(r: RequisitoFila, hoy: Date): number | null {
  const periodicidad: Record<string, number> = { ANUAL: 365, SEMESTRAL: 182, TRIMESTRAL: 91, MENSUAL: 30 };
  const dias = periodicidad[r.periodicidad];
  if (!dias) return null;
  const numero = r.consecutivo * 7 % 28 + 1;
  const ultimaRevision = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), numero));
  if (ultimaRevision > hoy) ultimaRevision.setUTCMonth(ultimaRevision.getUTCMonth() - 1);
  const siguiente = new Date(ultimaRevision);
  siguiente.setUTCDate(siguiente.getUTCDate() + dias);
  return Math.round((siguiente.getTime() - hoy.getTime()) / 86400000);
}