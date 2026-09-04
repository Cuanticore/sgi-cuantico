'use client';

// app/tecnologia/dependencias/Dependencias.client.tsx
//
// El esquema de dos listas: activos de información a la izquierda, relacionados a la
// derecha, con selección múltiple.
//
// **La pantalla ayuda; el servidor decide.** Acá se avisa antes de enviar que una arista
// cerraría un ciclo, pero eso NO reemplaza la validación del servidor: una regla que sólo
// vive en el cliente se salta con una petición, y ésta protege al recorrido del mapa de no
// terminar nunca.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { agregarDependencias, quitarDependencia } from '@/app/sig/acciones/dependencias';
import {
  cerrariaCiclo,
  ETIQUETA_TIPO_DEPENDENCIA,
  type Arista,
  type TipoDependencia,
} from '@/lib/sig/dependencias';

const TIPOS: TipoDependencia[] = ['USA', 'SE_ALOJA_EN', 'AUTENTICA_CON', 'ALMACENA_EN'];

// El rojo está deliberadamente fuera de esta paleta: en el resto de la aplicación significa
// «crítico», y acá sólo significaría «autenticación». Dos significados para un color en la
// misma pantalla es peor que un color de más.
const COLOR_TIPO: Record<TipoDependencia, { fondo: string; texto: string }> = {
  USA: { fondo: 'var(--hf-brand-100)', texto: 'var(--hf-brand-nav)' },
  SE_ALOJA_EN: { fondo: '#fff3e6', texto: '#8a4407' },
  AUTENTICA_CON: { fondo: '#efeafb', texto: '#5b3fa0' },
  ALMACENA_EN: { fondo: '#e8f4ef', texto: '#0b5c44' },
};

/// La criticidad numérica se pinta con el vocabulario del resto del sistema. **`null` no es
/// «bajo»**: es que nadie lo valoró, y ese es el dato que hace interesante a la asimetría.
function pintarCriticidad(v: number | null): { texto: string; color: string } {
  if (v === null) return { texto: 'sin valorar', color: 'var(--hf-text-faint)' };
  if (v >= 5) return { texto: 'muy alto', color: '#a52016' };
  if (v === 4) return { texto: 'alto', color: '#b8791a' };
  if (v === 3) return { texto: 'medio', color: '#0f7a5a' };
  return { texto: 'bajo', color: 'var(--hf-text-muted)' };
}

export interface ActivoCandidato {
  id: number;
  codigo: string | null;
  nombre: string;
  nivel3: string | null;
  criticidad: number | null;
}

export interface Relacionado {
  id: number;
  activoId: number;
  codigo: string | null;
  nombre: string;
  tipo: TipoDependencia;
  criticidad: number | null;
}

export default function DependenciasClient({
  baseId,
  activos,
  relacionados,
  grafo,
}: {
  baseId: number | null;
  activos: ActivoCandidato[];
  relacionados: Relacionado[];
  grafo: Arista[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDependencia>('USA');
  const [marcados, setMarcados] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const base = activos.find((a) => a.id === baseId) ?? null;

  const niveles = useMemo(
    () => [...new Set(activos.map((a) => a.nivel3).filter((n): n is string => n !== null))].sort(),
    [activos],
  );

  const disponibles = useMemo(() => {
    // El `Set` se construye DENTRO del memo: afuera se recrea en cada render y el memo
    // dejaría de memorizar nada, recalculando el filtro sobre los 247 activos a cada tecla.
    const yaRelacionados = new Set(relacionados.map((r) => r.activoId));
    const q = busqueda.trim().toLowerCase();
    return activos.filter((a) => {
      if (a.id === baseId) return false;
      if (yaRelacionados.has(a.id)) return false;
      if (filtroNivel !== 'todos' && a.nivel3 !== filtroNivel) return false;
      if (q === '') return true;
      return (
        a.nombre.toLowerCase().includes(q) ||
        (a.codigo ?? '').toLowerCase().includes(q) ||
        (a.nivel3 ?? '').toLowerCase().includes(q)
      );
    });
  }, [activos, baseId, busqueda, filtroNivel, relacionados]);

  // El aviso adelantado: qué marcados cerrarían un ciclo. Se calcula con la MISMA función
  // que usa el servidor, así que no puede decir una cosa y el servidor otra.
  const conCiclo = useMemo(() => {
    if (baseId === null) return new Set<number>();
    return new Set(marcados.filter((id) => cerrariaCiclo(baseId, id, grafo)));
  }, [baseId, marcados, grafo]);

  const buenos = marcados.filter((id) => !conCiclo.has(id));

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[100ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Dependencias entre activos</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            De muchos a muchos y dirigida. Es distinta de la jerarquía:{' '}
            <strong className="font-semibold text-secondary">«está dentro de» no es «depende de»</strong>.
            Esta pantalla <strong className="font-semibold text-secondary">declara</strong> la
            dependencia; para leerla en las dos direcciones y en cadena está{' '}
            <a href="/tecnologia/impacto" className="font-medium text-accent hover:underline">
              «Impacto»
            </a>
            .
          </p>
        </div>
        <label className="ml-auto flex flex-none flex-col gap-1.5">
          <span className="etiqueta-campo">Activo base</span>
          <select
            value={baseId ?? ''}
            onChange={(e) => router.push(`/tecnologia/dependencias?base=${e.target.value}`)}
            className="entrada-campo min-w-[330px]"
          >
            {activos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo ?? `#${a.id}`} · {a.nombre}
              </option>
            ))}
          </select>
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

      {base === null ? (
        <p className="mt-6 text-12_5 text-muted [text-wrap:pretty]">
          No hay activos vigentes en el inventario.
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-stretch gap-3.5 lg:flex-row">
          {/* Izquierda · candidatos */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <div className="flex flex-col gap-2.5 border-b border-hairline px-4 py-3.5">
              <span className="flex items-center gap-2.5">
                <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
                  Activos de información
                </span>
                <span className="ml-auto font-mono text-9_5 text-faint">
                  {disponibles.length} disponibles
                </span>
              </span>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="entrada-campo"
                placeholder="Buscar por nombre, código o nivel 3"
              />
              <div className="flex flex-wrap gap-1.5">
                {['todos', ...niveles].map((n) => {
                  const activo = filtroNivel === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setFiltroNivel(n)}
                      aria-pressed={activo}
                      className="rounded-chip px-2.5 py-1 text-11"
                      style={{
                        background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                        border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                        color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                        fontWeight: activo ? 600 : 500,
                      }}
                    >
                      {n === 'todos' ? 'Todos' : n}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="max-h-[520px] min-h-0 flex-1 overflow-y-auto p-2">
              {disponibles.map((a) => {
                const marcado = marcados.includes(a.id);
                const c = pintarCriticidad(a.criticidad);
                const rompe = conCiclo.has(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() =>
                      setMarcados((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))
                    }
                    aria-pressed={marcado}
                    className="mb-1 flex w-full items-center gap-2.5 rounded-campo px-3 py-2 text-left"
                    style={{
                      background: rompe ? '#fdeeeb' : marcado ? 'var(--hf-brand-100)' : 'transparent',
                      border: `1px solid ${rompe ? '#f2cdc6' : marcado ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                    }}
                  >
                    <span
                      className="flex h-4 w-4 flex-none items-center justify-center rounded-[4px] text-9 font-bold text-white"
                      style={{
                        background: marcado ? 'var(--hf-brand-nav)' : 'transparent',
                        border: `1.5px solid ${marcado ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                      }}
                    >
                      {marcado ? '✓' : ''}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-12 text-primary">{a.nombre}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-9 text-muted">{a.codigo ?? `#${a.id}`}</span>
                        <span className="h-1 w-1 flex-none rounded-full" style={{ background: c.color }} />
                        <span className="font-mono text-9" style={{ color: c.color }}>
                          {c.texto}
                        </span>
                      </span>
                    </span>
                    {rompe && (
                      <span className="flex-none font-mono text-8_5 font-semibold uppercase" style={{ color: '#a52016' }}>
                        ciclo
                      </span>
                    )}
                  </button>
                );
              })}
              {disponibles.length === 0 && (
                <p className="px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
                  Ninguno disponible con este filtro.
                </p>
              )}
            </div>
          </section>

          {/* Centro · tipo y acción */}
          <div className="flex flex-none flex-col items-center justify-center gap-3 lg:w-[148px]">
            <div className="flex w-full flex-col gap-1.5">
              <span className="etiqueta-campo text-center">Tipo de relación</span>
              {TIPOS.map((t) => {
                const activo = tipo === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    aria-pressed={activo}
                    className="w-full rounded-campo px-2.5 py-1.5 text-11"
                    style={{
                      background: activo ? 'var(--hf-brand-nav)' : 'var(--hf-bg-surface)',
                      border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                      color: activo ? '#ffffff' : 'var(--hf-text-secondary-soft)',
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    {ETIQUETA_TIPO_DEPENDENCIA[t]}
                  </button>
                );
              })}
            </div>
            <button
              disabled={buenos.length === 0 || enviando}
              onClick={async () => {
                setEnviando(true);
                const r = await agregarDependencias(base.id, buenos, tipo);
                setEnviando(false);
                setAviso({
                  ok: r.ok,
                  texto:
                    r.rechazados.length === 0
                      ? r.mensaje
                      : `${r.mensaje} ${r.rechazados.map((x) => x.motivo).join(' · ')}`,
                });
                if (r.agregadas > 0) {
                  setMarcados([]);
                  setTimeout(() => window.location.reload(), 1400);
                }
              }}
              className="w-full rounded-campo px-3 py-2 text-12 font-semibold text-white disabled:opacity-45"
              style={{ background: 'var(--hf-brand-nav)' }}
            >
              {enviando ? 'Guardando…' : 'Agregar →'}
            </button>
            <span className="text-center font-mono text-9 leading-relaxed text-faint">
              {marcados.length === 0
                ? 'Marca uno o varios'
                : conCiclo.size === 0
                  ? `${marcados.length} seleccionado${marcados.length > 1 ? 's' : ''}`
                  : `${buenos.length} de ${marcados.length}; ${conCiclo.size} cerraría(n) un ciclo`}
            </span>
          </div>

          {/* Derecha · ya declaradas */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3.5">
              <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]" style={{ color: '#0b5c44' }}>
                {base.nombre} depende de
              </span>
              <span className="ml-auto font-mono text-9_5 text-faint">{relacionados.length}</span>
            </div>
            <div className="max-h-[520px] min-h-0 flex-1 overflow-y-auto p-2">
              {relacionados.map((d) => {
                const c = pintarCriticidad(d.criticidad);
                const t = COLOR_TIPO[d.tipo];
                return (
                  <div
                    key={d.id}
                    className="mb-1.5 flex items-center gap-2.5 rounded-campo px-3 py-2.5"
                    style={{ background: '#f7fbf9', border: '1px solid #c9e3d8' }}
                  >
                    <span
                      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-7_5 font-semibold uppercase tracking-[0.05em]"
                      style={{ background: t.fondo, color: t.texto }}
                    >
                      {ETIQUETA_TIPO_DEPENDENCIA[d.tipo]}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-12 text-primary">{d.nombre}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-9 text-muted">{d.codigo ?? `#${d.activoId}`}</span>
                        <span className="h-1 w-1 flex-none rounded-full" style={{ background: c.color }} />
                        <span className="font-mono text-9" style={{ color: c.color }}>
                          {c.texto}
                        </span>
                      </span>
                    </span>
                    <button
                      onClick={async () => {
                        const r = await quitarDependencia(d.id);
                        setAviso({ ok: r.ok, texto: r.mensaje });
                        if (r.ok) setTimeout(() => window.location.reload(), 900);
                      }}
                      aria-label={`Quitar ${d.nombre}`}
                      className="flex-none rounded-[5px] border bg-surface px-2 py-1 text-11 text-muted"
                      style={{ borderColor: '#c9e3d8' }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {relacionados.length === 0 && (
                <p className="px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
                  Todavía no se declaró ninguna dependencia para este activo.
                </p>
              )}
            </div>
            <p
              className="border-t border-hairline px-4 py-3 text-10_5 leading-relaxed [text-wrap:pretty]"
              style={{ background: 'var(--hf-bg-subtle)', color: 'var(--hf-brand-nav)' }}
            >
              No se admiten ciclos <strong className="font-semibold">de ninguna longitud</strong>: ni
              A→B→A, ni A→B→C→A. El servidor recorre la cadena completa antes de aceptar, no sólo
              la reciprocidad directa. Un ciclo rompe el drill-down del mapa y el cálculo de
              impacto.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
