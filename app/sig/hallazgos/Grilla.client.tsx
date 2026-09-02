'use client';

// app/sig/hallazgos/Grilla.client.tsx
//
// KPIs, chips de tipo y toggles; la tabla con el semáforo del plazo y los badges de
// tipo y estado del artboard. Cada fila navega a la ficha.

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface FilaHallazgo {
  id: number;
  codigo: string;
  descripcion: string;
  requisito: string;
  tipo: string;
  /// Ya resuelta en el servidor: «Sin clasificar» mientras nadie la haya clasificado.
  tipoEtiqueta: string;
  clasificado: boolean;
  origen: string;
  origenReferencia: string;
  responsable: string | null;
  area: string | null;
  reincidente: boolean;
  estado: string;
  vencido: boolean;
  dias: number | null;
}

const TIPO_BADGE: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  NC_MAYOR: { fondo: '#fdeeeb', texto: '#a52016', etiqueta: 'NC mayor' },
  NC_MENOR: { fondo: '#fff3e6', texto: '#8a4407', etiqueta: 'NC menor' },
  OBSERVACION: { fondo: '#faf1d3', texto: '#6b5410', etiqueta: 'Observación' },
  OPORTUNIDAD: { fondo: '#e8f4ef', texto: '#0b5c44', etiqueta: 'Oportunidad' },
};

/// Un reporte que nadie clasifico todavia. No es un tipo mas: es la ausencia de tipo.
const SIN_CLASIFICAR = { fondo: '#f5f7f6', texto: '#6b7570', etiqueta: 'Sin clasificar' };

const ESTADO_BADGE: Record<string, { fondo: string; texto: string }> = {
  ABIERTO: { fondo: '#eef2f8', texto: '#12437f' },
  EN_ANALISIS: { fondo: '#e9f0fb', texto: '#12437f' },
  EN_EJECUCION: { fondo: '#fff3e6', texto: '#8a4407' },
  EN_VERIFICACION: { fondo: '#faf1d3', texto: '#6b5410' },
  CERRADO: { fondo: '#e6efe9', texto: '#0b5c44' },
  ANULADO: { fondo: '#f5f7f6', texto: '#4a544f' },
};

export default function GrillaClient({
  filas,
  kpis,
}: {
  filas: FilaHallazgo[];
  kpis: {
    abiertos: number;
    totalAnio: number;
    vencidos: number;
    masViejoDias: number;
    tasaEficacia: number | null;
    eficaciaDetalle: string;
    reincidencia: number;
    reincidenciaDetalle: string;
  };
}) {
  const [tipo, setTipo] = useState<'todos' | string>('todos');
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [soloReincidentes, setSoloReincidentes] = useState(false);

  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        // «Sin clasificar» filtra por la ausencia de clasificación, no por el tipo que la
        // columna guarda: es el montón que el líder del SIG tiene que atender primero.
        if (tipo === 'SIN_CLASIFICAR') return !f.clasificado;
        if (tipo !== 'todos' && (f.tipo !== tipo || !f.clasificado)) return false;
        if (soloVencidos && !f.vencido) return false;
        if (soloReincidentes && !f.reincidente) return false;
        return true;
      }),
    [filas, tipo, soloVencidos, soloReincidentes],
  );

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) {
      // Un hallazgo sin clasificar NO cuenta en su tipo guardado: contarlo ahí infla el
      // chip de un tipo que nadie eligió.
      m.set(f.clasificado ? f.tipo : 'SIN_CLASIFICAR', (m.get(f.clasificado ? f.tipo : 'SIN_CLASIFICAR') ?? 0) + 1);
    }
    return m;
  }, [filas]);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Hallazgos</h1>
          <p className="text-12_5 text-muted">
            El código no lleva el tipo: reclasificar no rompe la trazabilidad.
          </p>
        </div>
        <Link
          href="/mi-sig/reportar"
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          Reportar hallazgo
        </Link>
      </div>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Kpi cifra={kpis.abiertos} etiqueta={`de ${kpis.totalAnio} en el año`} color="#12437f" />
        <Kpi cifra={kpis.vencidos} etiqueta={`el más viejo, ${kpis.masViejoDias} días`} color="#a52016" />
        <Kpi cifra={kpis.tasaEficacia ?? '—'} etiqueta={kpis.eficaciaDetalle} color="#0b5c44" sufijo="%" />
        <Kpi cifra={kpis.reincidencia} etiqueta={kpis.reincidenciaDetalle} color="#c25a1e" sufijo="%" />
      </section>

      <nav className="mt-5 flex items-center gap-2">
        {['todos', 'SIN_CLASIFICAR', 'NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD'].map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className="rounded-chip px-3.5 py-1.5 text-12"
            style={{
              background: tipo === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: tipo === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: tipo === t ? 600 : 500,
            }}
          >
            {t === 'todos'
              ? 'Todos'
              : t === 'SIN_CLASIFICAR'
                ? SIN_CLASIFICAR.etiqueta
                : (TIPO_BADGE[t]?.etiqueta ?? t)}{' '}
            ·{' '}
            {t === 'todos' ? filas.length : (conteos.get(t) ?? 0)}
          </button>
        ))}
        <span className="mx-2 h-4 w-px" style={{ background: 'var(--hf-hairline-strong)' }} />
        <Toggle activo={soloVencidos} onClick={() => setSoloVencidos((v) => !v)} etiqueta="Solo vencidos" />
        <Toggle activo={soloReincidentes} onClick={() => setSoloReincidentes((v) => !v)} etiqueta="Solo reincidentes" />
      </nav>

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="w-[112px] px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Descripción</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Origen</th>
              <th className="px-4 py-3 font-semibold">Responsable</th>
              <th className="px-4 py-3 text-right font-semibold">Plazo</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              // Sin clasificar lleva su propio color: gris, no el del tipo que la columna
              // guarda por obligación del esquema. Pintarlo con el color de un tipo real
              // es afirmar una clasificación que nadie hizo.
              const badgeTipo = f.clasificado
                ? (TIPO_BADGE[f.tipo] ?? TIPO_BADGE.OPORTUNIDAD)
                : SIN_CLASIFICAR;
              const badgeEstado = ESTADO_BADGE[f.estado] ?? ESTADO_BADGE.ABIERTO;
              return (
                <tr
                  key={f.id}
                  className="border-t border-border-default"
                  style={f.vencido ? { background: '#fdeeeb' } : undefined}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/sig/hallazgos/${f.codigo}`}
                      className="font-mono text-11 font-medium"
                      style={{ color: 'var(--hf-brand-nav)' }}
                    >
                      {f.codigo}
                    </Link>
                    {f.reincidente && (
                      <span
                        className="ml-1.5 rounded-[3px] px-1 font-mono text-9 font-semibold"
                        style={{ background: '#fdeeeb', color: '#a52016' }}
                      >
                        R
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-primary">{f.descripcion}</span>
                      {f.requisito.trim() === '' ? (
                        <span
                          className="font-mono text-10_5"
                          title="El numeral lo define el líder del SIG al clasificar: no se le pide a quien reporta."
                          style={{ color: 'var(--hf-text-label)' }}
                        >
                          numeral por definir
                        </span>
                      ) : (
                        <span className="font-mono text-10_5 text-muted">{f.requisito}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                      style={{ background: badgeTipo.fondo, color: badgeTipo.texto }}
                    >
                      {f.tipoEtiqueta}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {f.origen.replaceAll('_', ' ').toLowerCase()} · {f.origenReferencia}
                  </td>
                  <td className="px-4 py-3 text-muted">{f.responsable ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {['CERRADO', 'ANULADO'].includes(f.estado) ? (
                      <span className="font-mono text-11" style={{ color: '#0b5c44' }}>
                        Cerrado
                      </span>
                    ) : f.vencido ? (
                      <span className="font-mono text-11 font-semibold" style={{ color: '#a52016' }}>
                        Vencido {Math.abs(f.dias ?? 0)} d
                      </span>
                    ) : f.dias !== null && f.dias <= 7 ? (
                      <span className="font-mono text-11 font-semibold" style={{ color: '#8a4407' }}>
                        {f.dias} d
                      </span>
                    ) : (
                      <span className="font-mono text-11" style={{ color: '#4a544f' }}>
                        {f.dias ?? '—'} d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
                      style={{ background: badgeEstado.fondo, color: badgeEstado.texto }}
                    >
                      {f.estado.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Kpi({
  cifra,
  etiqueta,
  color,
  sufijo,
}: {
  cifra: number | string;
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

function Toggle({
  activo,
  onClick,
  etiqueta,
}: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className="rounded-chip px-3.5 py-1.5 text-12 font-medium"
      style={
        activo
          ? { background: '#fdeeeb', border: '1px solid #f2cdc6', color: '#a52016' }
          : {
              background: 'var(--hf-bg-surface)',
              border: '1px solid var(--hf-border-field)',
              color: 'var(--hf-text-secondary-soft)',
            }
      }
    >
      {etiqueta}
    </button>
  );
}