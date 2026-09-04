'use client';

// app/tecnologia/grafo/Grafo.client.tsx
//
// El grafo en SVG. Se dibuja a mano y no con una librería porque lo único que hace falta es
// colocar cajas en columnas y curvar líneas entre ellas: traer un motor de grafos para eso
// agregaría cientos de kilobytes y un acomodo automático que reordena los nodos en cada
// render — y un mapa que se mueve solo no se puede señalar con el dedo en una reunión.
//
// **Las columnas no son niveles.** Son la distancia a la dependencia más profunda, y por
// eso la flecha siempre va hacia la derecha.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  columnasDelGrafo,
  ETIQUETA_TIPO_DEPENDENCIA,
  vecinosDirectos,
  type Arista,
} from '@/lib/sig/dependencias';

const ANCHO_CAJA = 124;
const ALTO_CAJA = 40;
const SEP_X = 176;
const SEP_Y = 56;
const MARGEN = 16;

type Modo = 'dep' | 'jer' | 'todo';

function colorCriticidad(v: number | null): string {
  if (v === null) return '#b6bdb9';
  if (v >= 5) return '#a52016';
  if (v === 4) return '#b8791a';
  if (v === 3) return '#0f7a5a';
  return '#6b7570';
}

function etiquetaCriticidad(v: number | null): string {
  if (v === null) return 'sin valorar';
  if (v >= 5) return 'muy alto';
  if (v === 4) return 'alto';
  if (v === 3) return 'medio';
  return 'bajo';
}

export interface NodoGrafo {
  id: number;
  codigo: string | null;
  nombre: string;
  columna: number;
  criticidad: number | null;
}

export default function GrafoClient({
  nodos,
  dependencias,
  contencion,
  totalActivos,
}: {
  nodos: NodoGrafo[];
  dependencias: Arista[];
  contencion: { hijoId: number; padreId: number }[];
  totalActivos: number;
}) {
  const [modo, setModo] = useState<Modo>('dep');
  const [sel, setSel] = useState<number | null>(nodos[0]?.id ?? null);

  // En modo «jerarquía» las columnas se recalculan sobre la contención: si se dejaran las
  // de dependencia, las flechas punteadas irían para atrás y el dibujo dejaría de
  // sostener su propia regla.
  const columnas = useMemo(() => {
    if (modo === 'dep') return new Map(nodos.map((n) => [n.id, n.columna]));
    const comoAristas: Arista[] = contencion.map((c) => ({
      activoId: c.padreId,
      dependeDeId: c.hijoId,
      tipo: 'USA',
    }));
    const base = modo === 'jer' ? comoAristas : [...dependencias, ...comoAristas];
    return columnasDelGrafo(
      nodos.map((n) => n.id),
      base,
    );
  }, [modo, nodos, dependencias, contencion]);

  // La posición de cada caja: columna en X, orden dentro de la columna en Y.
  const posicion = useMemo(() => {
    const porColumna = new Map<number, number[]>();
    for (const n of nodos) {
      const c = columnas.get(n.id) ?? 0;
      const previos = porColumna.get(c);
      if (previos === undefined) porColumna.set(c, [n.id]);
      else previos.push(n.id);
    }
    const m = new Map<number, { x: number; y: number }>();
    for (const [c, ids] of porColumna) {
      ids.forEach((id, i) => {
        m.set(id, { x: MARGEN + c * SEP_X, y: MARGEN + i * SEP_Y });
      });
    }
    return m;
  }, [nodos, columnas]);

  const ancho = useMemo(
    () => Math.max(...[...posicion.values()].map((p) => p.x + ANCHO_CAJA), 400) + MARGEN,
    [posicion],
  );
  const alto = useMemo(
    () => Math.max(...[...posicion.values()].map((p) => p.y + ALTO_CAJA), 200) + MARGEN,
    [posicion],
  );
  const maxColumna = useMemo(() => Math.max(0, ...[...columnas.values()]), [columnas]);

  const lineas = useMemo(() => {
    const dep = modo === 'jer' ? [] : dependencias.map((d) => ({ de: d.activoId, a: d.dependeDeId, jer: false }));
    const jer = modo === 'dep' ? [] : contencion.map((c) => ({ de: c.padreId, a: c.hijoId, jer: true }));
    return [...dep, ...jer].filter((l) => posicion.has(l.de) && posicion.has(l.a));
  }, [modo, dependencias, contencion, posicion]);

  const elegido = nodos.find((n) => n.id === sel) ?? null;
  const porId = useMemo(() => new Map(nodos.map((n) => [n.id, n])), [nodos]);
  const vecinos = elegido === null ? [] : vecinosDirectos(elegido.id, dependencias);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[106ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Mapa tecnológico · grafo</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            El mismo inventario del{' '}
            <Link href="/tecnologia/mapa" className="font-medium text-accent hover:underline">
              árbol
            </Link>
            , visto como lo que es.{' '}
            <strong className="font-semibold text-secondary">
              Las columnas no son niveles: son distancia a la dependencia más profunda
            </strong>
            , y por eso la flecha siempre va hacia la derecha.
          </p>
        </div>
        <div className="ml-auto flex flex-none flex-col items-end gap-1.5">
          <span className="etiqueta-campo">Ver</span>
          <div className="flex gap-1.5">
            {(
              [
                ['dep', 'Dependencias'],
                ['jer', 'Jerarquía'],
                ['todo', 'Ambas'],
              ] as const
            ).map(([id, etiqueta]) => {
              const activo = modo === id;
              return (
                <button
                  key={id}
                  onClick={() => setModo(id)}
                  aria-pressed={activo}
                  className="rounded-campo px-3 py-1.5 text-11_5"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {etiqueta}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {nodos.length === 0 ? (
        <p className="mt-6 max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
          Ningún activo participa todavía de una dependencia ni de la jerarquía de contención,
          así que no hay grafo que dibujar. Se declaran en{' '}
          <Link href="/tecnologia/dependencias" className="font-medium text-accent underline">
            Dependencias
          </Link>
          .
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3.5 xl:flex-row">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <div className="flex items-center gap-3 border-b border-hairline bg-subtle px-4 py-2.5">
              {/* Los rótulos de columna se numeran en vez de nombrarse. El lienzo los llama
                  «Aplicación final · Producto · Servicios y datos · Plataforma ·
                  Infraestructura · Externos», pero esos nombres SUPONEN una forma del
                  grafo: con otras dependencias la columna 3 no es «Plataforma», y un
                  rótulo que miente es peor que uno neutro. */}
              {Array.from({ length: maxColumna + 1 }, (_, i) => (
                <span key={i} className="flex-1 text-center">
                  <span className="etiqueta-campo">
                    {i === 0 ? 'Nada depende de ellos' : `A ${i} de distancia`}
                  </span>
                </span>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-1">
              <svg
                viewBox={`0 0 ${ancho} ${alto}`}
                width={ancho}
                height={alto}
                role="img"
                aria-label={`Grafo de ${nodos.length} activos y ${lineas.length} relaciones.`}
                style={{ maxWidth: 'none' }}
              >
                <defs>
                  <marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#b6bdb9" />
                  </marker>
                  <marker id="flAct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#12437f" />
                  </marker>
                </defs>

                {lineas.map((l, k) => {
                  const a = posicion.get(l.de)!;
                  const b = posicion.get(l.a)!;
                  const x1 = a.x + ANCHO_CAJA;
                  const y1 = a.y + ALTO_CAJA / 2;
                  const x2 = b.x;
                  const y2 = b.y + ALTO_CAJA / 2;
                  const activa = sel === l.de || sel === l.a;
                  const mitad = (x1 + x2) / 2;
                  return (
                    <path
                      key={`${l.de}-${l.a}-${k}`}
                      d={`M ${x1} ${y1} C ${mitad} ${y1} ${mitad} ${y2} ${x2} ${y2}`}
                      fill="none"
                      stroke={activa ? '#12437f' : '#dbe0dd'}
                      strokeWidth={activa ? 1.9 : 1.2}
                      strokeDasharray={l.jer ? '4 4' : undefined}
                      markerEnd={activa ? 'url(#flAct)' : 'url(#fl)'}
                      opacity={sel === null || activa ? 1 : 0.45}
                    />
                  );
                })}

                {nodos.map((n) => {
                  const p = posicion.get(n.id);
                  if (p === undefined) return null;
                  const activo = sel === n.id;
                  return (
                    <g
                      key={n.id}
                      onClick={() => setSel(n.id)}
                      style={{ cursor: 'pointer' }}
                      opacity={sel === null || activo || vecinos.some((v) => v.activoId === n.id) ? 1 : 0.55}
                    >
                      <rect
                        x={p.x}
                        y={p.y}
                        width={ANCHO_CAJA}
                        height={ALTO_CAJA}
                        rx={7}
                        fill={activo ? '#e9f0fb' : '#ffffff'}
                        stroke={activo ? '#12437f' : '#e2e6e3'}
                        strokeWidth={activo ? 1.8 : 1}
                      />
                      <circle cx={p.x + ANCHO_CAJA - 10} cy={p.y + 10} r={3.5} fill={colorCriticidad(n.criticidad)} />
                      <text x={p.x + 9} y={p.y + 15} fontFamily="ui-monospace, monospace" fontSize={7.5} fill="#8a938e">
                        {n.codigo ?? `#${n.id}`}
                      </text>
                      <text
                        x={p.x + 9}
                        y={p.y + 29}
                        fontSize={10.5}
                        fontWeight={activo ? 600 : 400}
                        fill="#1a211e"
                      >
                        {n.nombre.length > 20 ? `${n.nombre.slice(0, 19)}…` : n.nombre}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-hairline bg-subtle px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5">
                <svg width="26" height="8">
                  <line x1="0" y1="4" x2="26" y2="4" stroke="#b6bdb9" strokeWidth="1.6" />
                </svg>
                <span className="font-mono text-9 text-muted">depende de</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="26" height="8">
                  <line x1="0" y1="4" x2="26" y2="4" stroke="#c3cac6" strokeWidth="1.6" strokeDasharray="3 3" />
                </svg>
                <span className="font-mono text-9 text-muted">está dentro de</span>
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-3">
                {[5, 4, 3, 1, null].map((v) => (
                  <span key={String(v)} className="inline-flex items-center gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: colorCriticidad(v) }} />
                    <span className="font-mono text-9 text-muted">{etiquetaCriticidad(v)}</span>
                  </span>
                ))}
              </span>
            </div>
          </section>

          <aside className="flex w-full flex-none flex-col gap-3 xl:w-[358px]">
            {elegido !== null && (
              <>
                <section
                  className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-3.5"
                  style={{ border: '1px solid var(--hf-brand-200, #d3dceb)' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-10 font-semibold text-accent">
                      {elegido.codigo ?? `#${elegido.id}`}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: colorCriticidad(elegido.criticidad) }}
                      />
                      <span className="font-mono text-9" style={{ color: colorCriticidad(elegido.criticidad) }}>
                        {etiquetaCriticidad(elegido.criticidad)}
                      </span>
                    </span>
                  </span>
                  <span className="text-14 font-semibold leading-snug text-primary">{elegido.nombre}</span>
                  <span className="h-px bg-hairline" />
                  <div className="flex gap-2.5">
                    <Cifra
                      valor={vecinos.filter((v) => v.sentido === 'depende de').length}
                      etiqueta="Depende de"
                      color="#8a4407"
                    />
                    <Cifra
                      valor={vecinos.filter((v) => v.sentido === 'depende de él').length}
                      etiqueta="Dependen de él"
                      color="var(--hf-brand-nav)"
                    />
                    <Cifra
                      valor={columnas.get(elegido.id) ?? 0}
                      etiqueta="Columna"
                      color="var(--hf-text-muted)"
                    />
                  </div>
                </section>

                <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
                  <Rotulo texto="Vecinos directos" derecha={String(vecinos.length)} />
                  {vecinos.map((v, k) => (
                    <span
                      key={`${v.activoId}-${k}`}
                      className="flex items-center gap-2 rounded-campo border border-border-field bg-subtle px-2.5 py-1.5"
                    >
                      <span
                        className="flex-none font-mono text-8_5 uppercase"
                        style={{ color: v.sentido === 'depende de' ? '#8a4407' : 'var(--hf-brand-nav)' }}
                      >
                        {v.sentido}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-11_5 text-primary">
                        {porId.get(v.activoId)?.nombre ?? `#${v.activoId}`}
                      </span>
                      <span className="flex-none font-mono text-8_5 text-faint">
                        {ETIQUETA_TIPO_DEPENDENCIA[v.tipo]}
                      </span>
                    </span>
                  ))}
                  {vecinos.length === 0 && (
                    <span className="text-11_5 text-muted [text-wrap:pretty]">
                      Sin dependencias declaradas. Está en el grafo por su jerarquía de
                      contención.
                    </span>
                  )}
                </section>
              </>
            )}

            {/* Por qué existe esta pantalla habiendo un árbol. Va en la pantalla y no en un
                comentario del código porque quien pregunta «¿para qué dos mapas?» está
                mirándola, no leyéndolo. */}
            <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
              <Rotulo texto="Por qué grafo y no árbol" />
              <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                El árbol dibuja bien la <strong className="font-semibold">contención</strong> —qué
                está dentro de qué— pero obliga a que cada cosa tenga un solo padre. La
                dependencia no es así: una base de datos la usan tres aplicaciones a la vez.
              </span>
              <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                En el árbol, esas tres relaciones se dibujan como tres nodos repetidos, y
                entonces «cuántos dependen de esa base» hay que contarlo a mano. Acá se ve.
              </span>
              <span
                className="rounded-campo px-3 py-2.5 text-10_5 leading-relaxed [text-wrap:pretty]"
                style={{ background: '#fffaf3', border: '1px solid #f2b473', color: '#8a4407' }}
              >
                Las dos vistas conviven y muestran{' '}
                <strong className="font-semibold">relaciones distintas del mismo inventario</strong>. El
                árbol responde «qué compone a este producto»; el grafo responde «qué se cae si
                cae esto».
              </span>
            </section>

            <p className="rounded-tarjeta border border-border-field bg-surface px-3.5 py-3 text-10_5 leading-relaxed text-secondary [text-wrap:pretty]">
              Se dibujan {nodos.length} de {totalActivos} activos: los que participan de alguna
              dependencia o de la jerarquía de contención. Los demás no tienen relación que
              mostrar, y llenar la primera columna con cajas sueltas taparía las cadenas que sí
              hay.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}

function Cifra({ valor, etiqueta, color }: { valor: number; etiqueta: string; color: string }) {
  return (
    <span className="flex flex-1 flex-col gap-0.5">
      <span className="font-mono text-17 font-semibold tabular-nums" style={{ color }}>
        {valor}
      </span>
      <span className="etiqueta-campo leading-snug">{etiqueta}</span>
    </span>
  );
}

function Rotulo({ texto, derecha }: { texto: string; derecha?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha !== undefined && <span className="flex-none font-mono text-9 text-faint">{derecha}</span>}
    </span>
  );
}
