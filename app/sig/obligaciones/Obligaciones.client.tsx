'use client';

// app/sig/obligaciones/Obligaciones.client.tsx
//
// La tabla del registro del numeral 8 con los dos controles que el lienzo pide y la
// pantalla no tenía: los chips por tipo con su conteo y el buscador por título o
// procedimiento. La cabecera de `page.tsx` los anunciaba —«chips por tipo, buscador»—
// desde el primer día.
//
// El color del chip de tipo tampoco era decorativo en el lienzo: cada tipo tiene el suyo, y
// con 31 obligaciones activas es lo que deja leer la lista de un barrido en vez de fila por
// fila. La pantalla pintaba los cuatro tipos del mismo azul.

import { useMemo, useState } from 'react';
import { desactivarObligacion } from '@/app/sig/acciones/tareas';

export type TipoObligacion = 'LECTURA' | 'VERIFICACION' | 'CAPACITACION' | 'TAREA';

export interface ObligacionFila {
  id: number;
  codigo: string;
  titulo: string;
  procedimientoOrigen: string | null;
  tipo: TipoObligacion;
  alcance: string;
  periodicidad: string;
  plazoDias: number;
  seguimiento: string;
  /// Calculado al leer, nunca almacenado. `null` cuando la obligación aún no tiene periodo.
  cumplimiento: number | null;
}

/// Los colores del lienzo. Cada tipo el suyo: el color es lo que hace legible la lista.
const TIPO: Record<TipoObligacion, { etiqueta: string; fondo: string; texto: string }> = {
  LECTURA: { etiqueta: 'Lectura', fondo: '#e9f0fb', texto: '#12437f' },
  VERIFICACION: { etiqueta: 'Verificación', fondo: '#fff3e6', texto: '#8a4407' },
  CAPACITACION: { etiqueta: 'Capacitación', fondo: '#e8f4ef', texto: '#0b5c44' },
  TAREA: { etiqueta: 'Tarea', fondo: '#f5f7f6', texto: '#4a544f' },
};

const ORDEN_TIPOS: TipoObligacion[] = ['LECTURA', 'VERIFICACION', 'CAPACITACION', 'TAREA'];

/// Pliega caja y acentos. Buscar «capacitacion» tiene que encontrar «Capacitación»: quien
/// escribe en el buscador de una lista de 31 filas no va a poner las tildes.
function plegar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export default function ObligacionesClient({ filas }: { filas: ObligacionFila[] }) {
  const [tipo, setTipo] = useState<TipoObligacion | 'TODOS'>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [desactivando, setDesactivando] = useState<ObligacionFila | null>(null);

  const conteos = useMemo(() => {
    const mapa = new Map<TipoObligacion, number>();
    for (const f of filas) mapa.set(f.tipo, (mapa.get(f.tipo) ?? 0) + 1);
    return mapa;
  }, [filas]);

  const visibles = useMemo(() => {
    const aguja = plegar(busqueda.trim());
    return filas.filter((f) => {
      if (tipo !== 'TODOS' && f.tipo !== tipo) return false;
      if (aguja === '') return true;
      return (
        plegar(f.titulo).includes(aguja) ||
        plegar(f.procedimientoOrigen ?? '').includes(aguja) ||
        plegar(f.codigo).includes(aguja)
      );
    });
  }, [filas, tipo, busqueda]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {(['TODOS', ...ORDEN_TIPOS] as const).map((t) => {
          const activo = tipo === t;
          const conteo = t === 'TODOS' ? filas.length : (conteos.get(t) ?? 0);
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                fontWeight: activo ? 600 : 500,
              }}
            >
              {t === 'TODOS' ? 'Todos' : TIPO[t].etiqueta}
              <span className="font-mono text-10 opacity-75">{conteo}</span>
            </button>
          );
        })}

        <label className="ml-auto flex min-w-[216px] items-center gap-2 rounded-campo border border-border-field bg-surface px-3 py-1.5">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--hf-text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por título o procedimiento"
            aria-label="Buscar por título o procedimiento"
            className="w-full bg-transparent text-12 outline-none"
          />
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Contenido</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Alcance</th>
              <th className="px-4 py-3 font-semibold">Periodicidad</th>
              <th className="px-4 py-3 text-right font-semibold">Plazo</th>
              <th className="px-4 py-3 font-semibold">Seguimiento</th>
              <th className="px-4 py-3 text-right font-semibold">Último periodo</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((o) => (
              <tr key={o.id} className="border-t border-border-default">
                <td className="px-4 py-3 font-mono text-11" style={{ color: 'var(--hf-brand-nav)' }}>
                  {o.codigo}
                </td>
                <td className="px-4 py-3 pr-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-primary">{o.titulo}</span>
                    {o.procedimientoOrigen && (
                      <span className="font-mono text-10_5 text-muted">{o.procedimientoOrigen}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase"
                    style={{ background: TIPO[o.tipo].fondo, color: TIPO[o.tipo].texto }}
                  >
                    {TIPO[o.tipo].etiqueta}
                  </span>
                </td>
                <td className="px-4 py-3 text-secondary-soft">{o.alcance}</td>
                <td className="px-4 py-3 text-secondary-soft">{o.periodicidad}</td>
                <td className="px-4 py-3 text-right font-mono text-11 text-secondary-soft">
                  {o.plazoDias} d
                </td>
                <td className="px-4 py-3 text-secondary-soft">{o.seguimiento}</td>
                <td className="px-4 py-3 text-right">
                  <Cumplimiento porciento={o.cumplimiento} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setDesactivando(o)}
                    className="rounded-campo px-2 py-1 text-11"
                    style={{
                      color: 'var(--hf-danger-text)',
                      border: '1px solid var(--hf-danger-border)',
                    }}
                  >
                    Desactivar
                  </button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr className="border-t border-border-default">
                <td colSpan={9} className="px-4 py-8 text-center text-12 text-muted">
                  {filas.length === 0
                    ? 'Todavía no hay obligaciones activas.'
                    : 'Ninguna obligación coincide con la búsqueda.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3.5 max-w-[84ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        El cumplimiento del último periodo se calcula: asignaciones realizadas a tiempo sobre
        asignaciones del periodo. No se almacena, y por eso nunca puede contradecir a la
        bandeja.
      </p>

      {desactivando && (
        <PanelDesactivar
          obligacion={desactivando}
          onCerrar={() => setDesactivando(null)}
        />
      )}
    </>
  );
}

/// `desactivarObligacion` no tenía llamador, así que una obligación que dejaba de aplicar
/// —un procedimiento derogado, un cargo que ya no existe— seguía generando asignaciones y
/// no había forma de detenerla salvo por la base de datos.
///
/// Desactivar NO borra ni cancela lo ya generado: las asignaciones abiertas siguen
/// abiertas, porque alguien las debe y su registro de realizado sostiene una auditoría. Lo
/// que se detiene es la generación futura, y eso se dice en la pantalla para que nadie use
/// este botón esperando limpiar la bandeja de alguien.
function PanelDesactivar({
  obligacion,
  onCerrar,
}: {
  obligacion: ObligacionFila;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
        <h2 className="text-15 font-bold text-primary">Desactivar {obligacion.codigo}</h2>
        <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          {obligacion.titulo}. Deja de generar asignaciones nuevas.{' '}
          <strong className="font-semibold">Las ya generadas no cambian</strong>: alguien las
          debe, y su registro de realizado sostiene una auditoría.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Motivo (obligatorio)</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            autoFocus
            placeholder="El procedimiento de origen se derogó en la versión 3."
            className="entrada-campo leading-relaxed"
          />
        </label>
        {error && (
          <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-campo px-3 py-1.5 text-12 text-muted">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setOcupado(true);
              setError(null);
              const r = await desactivarObligacion(obligacion.id, motivo);
              setOcupado(false);
              if (r.ok) {
                window.location.reload();
                return;
              }
              setError(r.mensaje);
            }}
            disabled={motivo.trim() === '' || ocupado}
            className="rounded-campo px-3.5 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-danger-text)' }}
          >
            {ocupado ? 'Desactivando…' : 'Desactivar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Cumplimiento({ porciento }: { porciento: number | null }) {
  if (porciento === null) return <span className="font-mono text-11 text-muted">—</span>;
  const color = porciento >= 90 ? '#0b5c44' : porciento >= 70 ? '#8a4407' : '#a52016';
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="h-[5px] w-[46px] overflow-hidden rounded-full"
        style={{ background: 'var(--hf-hairline-strong)' }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${porciento}%`, background: color }}
        />
      </span>
      <span
        className="min-w-[34px] text-right font-mono text-11 font-medium tabular-nums"
        style={{ color }}
      >
        {porciento} %
      </span>
    </span>
  );
}
