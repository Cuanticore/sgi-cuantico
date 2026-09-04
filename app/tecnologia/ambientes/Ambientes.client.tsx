'use client';

// app/tecnologia/ambientes/Ambientes.client.tsx
//
// La tabla de despliegues, con el resultado de la última importación arriba.
//
// **Los pendientes de asociar se cuentan y se filtran, no se esconden.** Son el trabajo que
// esta pantalla existe para hacer visible: un despliegue sin activo padre es un servicio
// que nadie reclama, y el levantamiento encontró dos sirviendo el mismo dominio que
// producción desde otro servidor.
//
// La confianza viaja al lado de cada fila. Un dato inferido y uno confirmado no valen
// igual, y un inventario técnico que no distingue los dos no se puede volver a verificar.

import { useMemo, useState } from 'react';
import { asociarDespliegue, importarDespliegues } from '@/app/sig/acciones/despliegues';
import { ETIQUETA_CONFIANZA, type ConfianzaDato, type ResumenDespliegues } from '@/lib/sig/despliegues';

const COLOR_CONFIANZA: Record<ConfianzaDato, string> = {
  ALTA: '#0b5c44',
  MEDIA: '#b8791a',
  BAJA: '#a52016',
};

/// El ambiente se pinta por lo que ARRIESGA, no por orden alfabético: producción en rojo,
/// preproducción en ámbar, el resto en azul. Un despliegue de producción y uno experimental
/// no merecen el mismo peso visual en una tabla de cien filas.
function colorAmbiente(a: string): { fondo: string; texto: string } {
  const n = a.toLowerCase();
  if (n.startsWith('prod')) return { fondo: '#fdeeeb', texto: '#a52016' };
  if (n.startsWith('stag') || n.startsWith('prepro')) return { fondo: '#fff3e6', texto: '#8a4407' };
  if (n.startsWith('legacy') || n.startsWith('aband'))
    return { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' };
  return { fondo: 'var(--hf-brand-100)', texto: 'var(--hf-brand-nav)' };
}

function colorEstado(e: string): { fondo: string; texto: string } {
  const n = e.toLowerCase();
  if (n.includes('run') || n.includes('activ')) return { fondo: '#e6efe9', texto: '#0b5c44' };
  if (n.includes('legacy') || n.includes('aband')) return { fondo: '#fdeeeb', texto: '#a52016' };
  if (n.includes('deten') || n.includes('stop')) return { fondo: '#fdeeeb', texto: '#a52016' };
  return { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' };
}

export interface FilaDespliegue {
  id: number;
  padre: { codigo: string | null; nombre: string } | null;
  componente: string;
  ambiente: string;
  servidor: string | null;
  ip: string | null;
  url: string | null;
  tagRama: string | null;
  estado: string;
  confianza: ConfianzaDato;
  evidencia: string | null;
}

type Filtro = 'todos' | 'pendientes' | 'produccion' | 'legacy' | 'confianza';

export default function AmbientesClient({
  resumen,
  asociados,
  filas,
  activos,
}: {
  resumen: ResumenDespliegues;
  asociados: number;
  filas: FilaDespliegue[];
  activos: { id: number; etiqueta: string }[];
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [asociando, setAsociando] = useState<number | null>(null);

  const cuenta = useMemo(
    () => ({
      todos: filas.length,
      pendientes: filas.filter((f) => f.padre === null).length,
      produccion: filas.filter((f) => f.ambiente.toLowerCase().startsWith('prod')).length,
      legacy: filas.filter((f) => /legacy|aband/i.test(`${f.ambiente} ${f.estado}`)).length,
      confianza: filas.filter((f) => f.confianza !== 'ALTA').length,
    }),
    [filas],
  );

  const visibles = useMemo(() => {
    switch (filtro) {
      case 'pendientes':
        return filas.filter((f) => f.padre === null);
      case 'produccion':
        return filas.filter((f) => f.ambiente.toLowerCase().startsWith('prod'));
      case 'legacy':
        return filas.filter((f) => /legacy|aband/i.test(`${f.ambiente} ${f.estado}`));
      case 'confianza':
        return filas.filter((f) => f.confianza !== 'ALTA');
      default:
        return filas;
    }
  }, [filas, filtro]);

  async function importar(archivo: File) {
    setImportando(true);
    setAviso(null);
    const texto = await archivo.text();
    const r = await importarDespliegues(texto);
    setImportando(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => window.location.reload(), 2200);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[100ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Ambientes y despliegues</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Dónde vive cada componente.{' '}
            <strong className="font-semibold text-secondary">Un despliegue no es un activo</strong>:
            cuelga del activo y no genera riesgos propios.
          </p>
        </div>
        <label
          className="ml-auto flex flex-none cursor-pointer items-center gap-2 rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)', opacity: importando ? 0.6 : 1 }}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={importando}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f !== undefined) void importar(f);
            }}
          />
          {importando ? 'Importando…' : 'Importar exportación'}
        </label>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      <section className="mt-4 flex flex-wrap items-center gap-4 rounded-tarjeta border border-border-field bg-surface px-4 py-3">
        {[
          { valor: resumen.total, etiqueta: 'despliegues registrados', color: 'var(--hf-brand-nav)' },
          { valor: asociados, etiqueta: 'asociados a su activo', color: '#0b5c44' },
          { valor: resumen.pendientesDeAsociar, etiqueta: 'pendientes de asociar', color: '#a52016' },
          { valor: cuenta.confianza, etiqueta: 'con confianza media o baja', color: '#b8791a' },
        ].map((c, i) => (
          <span key={c.etiqueta} className="flex items-center gap-4">
            {i > 0 && <span className="h-[18px] w-px bg-hairline" />}
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-18 font-semibold tabular-nums" style={{ color: c.color }}>
                {c.valor}
              </span>
              <span className="text-11_5 text-secondary">{c.etiqueta}</span>
            </span>
          </span>
        ))}
        <span className="ml-auto text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          Idempotente por repo, ambiente y servidor: reimportar actualiza, nunca duplica.
        </span>
      </section>

      <nav className="mt-4 flex flex-wrap items-center gap-2">
        {(
          [
            ['todos', 'Todos'],
            ['pendientes', 'Sin activo padre'],
            ['produccion', 'Producción'],
            ['legacy', 'Legacy'],
            ['confianza', 'Confianza no alta'],
          ] as const
        ).map(([id, etiqueta]) => {
          const activo = filtro === id;
          return (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {etiqueta}
              <span className="font-mono text-10 opacity-75">{cuenta[id]}</span>
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-3">
          {[
            { etiqueta: 'Producción', color: '#a52016' },
            { etiqueta: 'Preproducción', color: '#b8791a' },
            { etiqueta: 'Desarrollo', color: 'var(--hf-brand-nav)' },
          ].map((l) => (
            <span key={l.etiqueta} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: l.color }} />
              <span className="text-11 text-secondary">{l.etiqueta}</span>
            </span>
          ))}
        </span>
      </nav>

      <div className="mt-4 overflow-x-auto rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full min-w-[1180px] text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-2.5 font-semibold">Activo padre</th>
              <th className="px-4 py-2.5 font-semibold">Componente</th>
              <th className="px-4 py-2.5 font-semibold">Ambiente</th>
              <th className="px-4 py-2.5 font-semibold">Servidor · IP</th>
              <th className="px-4 py-2.5 font-semibold">URL</th>
              <th className="px-4 py-2.5 font-semibold">Rama · tag</th>
              <th className="px-4 py-2.5 font-semibold">Estado</th>
              <th className="px-4 py-2.5 font-semibold">Confianza</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((d) => {
              const amb = colorAmbiente(d.ambiente);
              const est = colorEstado(d.estado);
              const sinPadre = d.padre === null;
              return (
                <tr
                  key={d.id}
                  className="border-t border-border-default align-top"
                  style={sinPadre ? { background: '#fdeeeb' } : undefined}
                >
                  <td className="px-4 py-2.5">
                    {d.padre !== null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-12 font-medium text-primary">{d.padre.nombre}</span>
                        <span className="font-mono text-9 text-accent">{d.padre.codigo ?? '—'}</span>
                      </div>
                    ) : asociando === d.id ? (
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={async (e) => {
                          if (e.target.value === '') return;
                          const r = await asociarDespliegue(d.id, Number(e.target.value));
                          setAsociando(null);
                          setAviso({ ok: r.ok, texto: r.mensaje });
                          if (r.ok) setTimeout(() => window.location.reload(), 900);
                        }}
                        className="entrada-campo max-w-[220px] py-1 text-11"
                      >
                        <option value="">Elegir activo…</option>
                        {activos.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.etiqueta}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setAsociando(d.id)}
                        className="rounded-campo border border-dashed bg-surface px-2.5 py-1 text-11 font-semibold"
                        style={{ color: '#a52016', borderColor: '#f2cdc6' }}
                      >
                        + Asociar activo
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-12 text-secondary">{d.componente}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-block rounded-[4px] px-2 py-0.5 font-mono text-8 font-semibold uppercase tracking-[0.06em]"
                      style={{ background: amb.fondo, color: amb.texto }}
                    >
                      {d.ambiente}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-11_5 text-secondary">{d.servidor ?? '—'}</span>
                      <span className="font-mono text-9_5 text-muted">{d.ip ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-10_5 text-accent">{d.url ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-10_5 text-secondary">{d.tagRama ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-block rounded-[4px] px-2 py-0.5 font-mono text-8 font-semibold uppercase tracking-[0.06em]"
                      style={{ background: est.fondo, color: est.texto }}
                    >
                      {d.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {/* La confianza lleva su palabra, no sólo su color: quien no distingue
                        el ámbar del verde tiene que poder leer lo mismo. */}
                    <span
                      className="font-mono text-10_5 font-semibold"
                      style={{ color: COLOR_CONFIANZA[d.confianza] }}
                      title={d.evidencia ?? 'sin evidencia registrada'}
                    >
                      {ETIQUETA_CONFIANZA[d.confianza]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="px-4 py-8 text-center text-12 text-muted [text-wrap:pretty]">
            {filas.length === 0
              ? 'Todavía no se importó ninguna exportación de ambientes. El archivo es un CSV con al menos las columnas nombre, ambiente y estado.'
              : 'Ninguno con este filtro.'}
          </p>
        )}
      </div>

      {cuenta.legacy > 0 && (
        <p
          className="mt-3 rounded-tarjeta px-4 py-3 text-12 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fdeeeb', border: '1px solid #f2cdc6', color: '#a52016' }}
        >
          <strong className="font-semibold">
            Lo que el levantamiento ya encontró y esta pantalla no debe esconder:
          </strong>{' '}
          {cuenta.legacy} servicio(s) marcados legacy o abandonados. Son hallazgos, y desde acá se
          levantan como tales en{' '}
          <a href="/mi-sig/reportar?origen=SGSI" className="font-semibold underline">
            Mejora
          </a>
          . El inventario refleja lo que hay, no lo que debería haber.
        </p>
      )}
    </main>
  );
}
