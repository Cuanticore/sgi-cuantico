'use client';

// app/mi-sig/historial/Historial.client.tsx
//
// Vista previa del histórico con filtros por año y tipo, botones Excel (ruta de
// exportación real) y PDF (vista imprimible — decisión 6 del plan).

import { useMemo, useState } from 'react';

export interface HistorialFila {
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaHora: Date;
  texto: string;
  nota: string | null;
  aTiempo: boolean;
  extemporanea: boolean;
  administrativo: boolean;
  cerradaPor: string | null;
  motivo: string | null;
  periodo: string;
  versionLeida: string | null;
}

const ETIQUETA_TIPO: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};

export default function HistorialClient({
  persona,
  resumen,
  filas,
}: {
  persona: { nombre: string; correo: string; area: string | null; cargo: string | null };
  resumen: { registros: number; aTiempo: number; cierresAdministrativos: number };
  filas: HistorialFila[];
}) {
  const [anio, setAnio] = useState<string>('todo');

  // Los años salen de los registros, no de una lista escrita a mano. Estaban cableados
  // como `'2026' | '2025'`: en 2027 el historial de 2027 no se podía filtrar, y el chip de
  // 2025 seguía ahí para una persona que entró después.
  const anios = useMemo(
    () => [...new Set(filas.map((f) => String(f.fechaHora.getUTCFullYear())))].sort().reverse(),
    [filas],
  );
  const [tipo, setTipo] = useState<'todos' | string>('todos');

  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        if (anio !== 'todo' && !f.fechaHora.toISOString().startsWith(anio)) return false;
        if (tipo !== 'todos' && f.tipo !== tipo) return false;
        return true;
      }),
    [filas, anio, tipo],
  );

  const porMes = useMemo(() => {
    const m = new Map<string, HistorialFila[]>();
    for (const f of visibles) {
      const clave = f.fechaHora.toISOString().slice(0, 7);
      const lista = m.get(clave) ?? [];
      lista.push(f);
      m.set(clave, lista);
    }
    return [...m.entries()];
  }, [visibles]);

  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-8 pb-16 pt-8 print:max-w-none print:px-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-23 font-bold text-primary">Mi historial del SIG</h1>
          <p className="text-12_5 text-muted">
            {persona.nombre} · {persona.correo} ·{' '}
            {[persona.area, persona.cargo].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            href="/api/sig/historial"
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            Excel
          </a>
          <button
            onClick={() => window.print()}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
          >
            Exportar en PDF
          </button>
        </div>
      </div>

      <section className="mt-5 grid grid-cols-3 gap-4">
        <ResumenCifra cifra={resumen.registros} etiqueta="Registros" />
        <ResumenCifra cifra={resumen.aTiempo} etiqueta="A tiempo" color="#0b5c44" />
        <ResumenCifra cifra={resumen.cierresAdministrativos} etiqueta="Cierres admin." color="#6b5410" />
      </section>

      <nav className="mt-5 flex items-center gap-2 print:hidden">
        {['todo', ...anios].map((a) => (
          <button
            key={a}
            onClick={() => setAnio(a)}
            aria-pressed={anio === a}
            className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
            style={{
              background: anio === a ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: anio === a ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
            }}
          >
            {a === 'todo' ? 'Todo' : a}
          </button>
        ))}
        <span className="mx-2 h-4 w-px" style={{ background: 'var(--hf-hairline-strong)' }} />
        {(['todos', 'LECTURA', 'VERIFICACION', 'CAPACITACION', 'TAREA'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className="rounded-chip px-3.5 py-1.5 text-12"
            style={{
              background: tipo === t ? 'var(--hf-warn-100)' : 'var(--hf-bg-surface)',
              color: tipo === t ? 'var(--hf-warn-text)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
            }}
          >
            {t === 'todos' ? 'Todos' : ETIQUETA_TIPO[t]}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex flex-col gap-6">
        {porMes.map(([mes, lista]) => (
          <section key={mes}>
            <h2 className="flex items-baseline gap-2 text-13 font-semibold text-primary">
              {nombreMes(mes)}
              <span className="font-mono text-10_5 text-muted">{lista.length} registro(s)</span>
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              {lista.map((f) => (
                <article
                  key={f.id}
                  className="flex items-start gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3"
                  style={f.administrativo ? { background: '#fdfaf0', borderColor: '#e0b93c' } : undefined}
                >
                  <span
                    className="flex h-[26px] w-[52px] flex-none items-center justify-center rounded-[4px] font-mono text-8_5 font-semibold uppercase"
                    style={chipTipo(f.tipo)}
                  >
                    {ETIQUETA_TIPO[f.tipo] ?? f.tipo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-12_5 font-medium text-primary">{f.titulo}</h3>
                      <span className="flex-none font-mono text-10 text-muted">{f.codigo}</span>
                    </div>
                    <p className="text-11_5 text-muted">{f.texto}</p>
                    {f.administrativo && (
                      <p className="mt-1 text-11_5" style={{ color: '#6b5410' }}>
                        Cerrada por {f.cerradaPor} en tu nombre. Motivo: {f.motivo}.
                      </p>
                    )}
                  </div>
                  <span
                    className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                    style={chipEstado(f)}
                  >
                    {f.administrativo
                      ? 'Cierre administrativo'
                      : f.extemporanea
                        ? 'Extemporánea'
                        : 'A tiempo'}
                  </span>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-11_5 text-muted">
        El registro es inmutable: corregir uno es reabrir la asignación, y la reapertura
        queda en la bitácora. Un cierre administrativo aparece marcado con quién lo hizo —
        es lo que distingue «lo hice» de «me lo marcaron».
      </p>
    </main>
  );
}

function ResumenCifra({
  cifra,
  etiqueta,
  color = '#12437f',
}: {
  cifra: number;
  etiqueta: string;
  color?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <span className="font-mono text-26 font-semibold tabular-nums" style={{ color }}>
        {cifra}
      </span>
      <span className="text-12_5 text-muted">{etiqueta}</span>
    </div>
  );
}

function chipTipo(tipo: string): { background: string; color: string } {
  return (
    {
      LECTURA: { background: '#e9f0fb', color: '#12437f' },
      VERIFICACION: { background: '#fff3e6', color: '#8a4407' },
      CAPACITACION: { background: '#e8f4ef', color: '#0b5c44' },
      TAREA: { background: '#f5f7f6', color: '#4a544f' },
    }[tipo] ?? { background: '#f5f7f6', color: '#4a544f' }
  );
}

function chipEstado(f: HistorialFila): { background: string; color: string } {
  if (f.administrativo) return { background: '#faf1d3', color: '#6b5410' };
  if (f.extemporanea) return { background: '#fff3e6', color: '#8a4407' };
  return { background: '#e6efe9', color: '#0b5c44' };
}

function nombreMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number);
  const nombres = [
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
  ];
  return `${nombres[mes - 1]} de ${anio}`;
}