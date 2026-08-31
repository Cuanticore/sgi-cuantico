'use client';

// app/sig/calendario/Calendario.client.tsx
//
// Mes y semana con el navegador, chips de área, leyenda de estados y el día
// seleccionado con su lista. Los colores de estado salen de globals.css.

import { useMemo, useState } from 'react';

export interface MarcaCalendario {
  id: number;
  fecha: string;
  estado: 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';
  persona: string;
  titulo: string;
  codigo: string;
  periodo: string;
}

const COLOR_ESTADO: Record<string, string> = {
  VENCIDA: '#a52016',
  POR_VENCER: '#c25a1e',
  PENDIENTE: '#12437f',
  REALIZADA: '#0f7a5a',
};

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export default function CalendarioClient({ marcas }: { marcas: MarcaCalendario[] }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth());
  const [vista, setVista] = useState<'mes' | 'semana'>('mes');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const m = new Map<string, MarcaCalendario[]>();
    for (const marca of marcas) {
      const lista = m.get(marca.fecha) ?? [];
      lista.push(marca);
      m.set(marca.fecha, lista);
    }
    return m;
  }, [marcas]);

  const celdas = useMemo(() => {
    const primero = new Date(Date.UTC(anio, mes, 1));
    const offset = (primero.getUTCDay() + 6) % 7;
    const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const celdas: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= dias; d++) {
      celdas.push(`${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return celdas;
  }, [anio, mes]);

  const navegar = (delta: number) => {
    const siguiente = new Date(Date.UTC(anio, mes + delta, 1));
    setAnio(siguiente.getUTCFullYear());
    setMes(siguiente.getUTCMonth());
    setSeleccionado(null);
  };

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="titulo-pagina">Calendario</h1>
          <p className="text-12_5 text-muted">Asignaciones en su fecha límite</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-campo border border-border-field">
            {(['mes', 'semana'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className="px-3 py-1.5 text-12 font-medium capitalize"
                style={{
                  background: vista === v ? 'var(--hf-brand-100)' : 'transparent',
                  color: vista === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => navegar(-1)}
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-muted"
          >
            ‹
          </button>
          <span className="w-32 text-center text-13 font-semibold text-primary">
            {nombreMes(mes)} de {anio}
          </span>
          <button
            onClick={() => navegar(1)}
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-muted"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-11_5 text-muted">
        {Object.entries(COLOR_ESTADO).map(([estado, color]) => (
          <span key={estado} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {estado}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-7 gap-px overflow-hidden rounded-tarjeta border border-border-field bg-border-default">
        {DIAS.map((d) => (
          <div
            key={d}
            className="bg-surface px-3 py-2 text-11 font-semibold uppercase tracking-wide"
            style={{ color: 'var(--hf-text-label)' }}
          >
            {d}
          </div>
        ))}
        {celdas.map((fecha, i) =>
          fecha === null ? (
            <div key={`v-${i}`} className="min-h-[92px] bg-surface" />
          ) : (
            <button
              key={fecha}
              onClick={() => setSeleccionado(seleccionado === fecha ? null : fecha)}
              className="flex min-h-[92px] flex-col items-stretch gap-1 p-2 text-left transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              style={{
                background: seleccionado === fecha ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              }}
            >
              <span className="font-mono text-10_5 text-muted">{Number(fecha.slice(8))}</span>
              {(porDia.get(fecha) ?? []).slice(0, 2).map((m) => (
                <span
                  key={m.id}
                  className="flex-none rounded-[3px] px-1.5 py-0.5 text-9_5 font-medium"
                  style={{ background: colorEstado(m), color: '#ffffff' }}
                >
                  {m.codigo}
                </span>
              ))}
              {(porDia.get(fecha) ?? []).length > 2 && (
                <span className="text-9_5 text-muted">
                  +{(porDia.get(fecha) ?? []).length - 2}
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {seleccionado && (
        <aside className="mt-5 flex max-w-[420px] flex-col gap-2 rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-14 font-semibold text-primary">{seleccionado}</h2>
          {(porDia.get(seleccionado) ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 border-t border-border-default pt-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-12_5 font-medium text-primary">{m.titulo}</span>
                <span className="font-mono text-10_5 text-muted">
                  {m.codigo} · {m.periodo} · {m.persona}
                </span>
              </div>
              <span className="flex-none text-11 font-semibold" style={{ color: colorEstado(m) }}>
                {m.estado}
              </span>
            </div>
          ))}
          {(porDia.get(seleccionado) ?? []).length === 0 && (
            <p className="text-12 text-muted">Sin asignaciones este día.</p>
          )}
        </aside>
      )}
    </main>
  );
}

function colorEstado(m: MarcaCalendario): string {
  const hoy = new Date().toISOString().slice(0, 10);
  if (m.estado === 'PENDIENTE') return m.fecha < hoy ? COLOR_ESTADO.VENCIDA : COLOR_ESTADO.PENDIENTE;
  return COLOR_ESTADO.REALIZADA;
}

function nombreMes(mes: number): string {
  return [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ][mes];
}