'use client';

// app/tecnologia/mapa/Mapa.client.tsx
//
// El árbol a la izquierda, el panel del nodo a la derecha.
//
// **La expansión vive en el cliente y el árbol llega completo.** Es lo que hace que abrir
// una rama sea instantáneo: pedir los hijos al abrir convertiría cada clic en una ida al
// servidor, y el árbol se recorre abriendo y cerrando decenas de veces por sesión.
//
// **Lo que no encaja se cuenta arriba, no se esconde.** Los activos sin nivel y los
// despliegues sin activo padre no tienen dónde colgarse; omitirlos haría que el mapa se
// viera completo justamente porque le falta información.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { nodosVisibles, tieneHijos, type ClaseNodo, type NodoArbol } from '@/lib/sig/niveles';
import { ETIQUETA_TIPO_DEPENDENCIA, type TipoDependencia } from '@/lib/sig/dependencias';
import { ETIQUETA_CONFIANZA, type ConfianzaDato } from '@/lib/sig/despliegues';

const ICONO: Record<ClaseNodo, { c: string; bg: string; fg: string; nombre: string }> = {
  NIVEL_1: { c: '▣', bg: '#0c2461', fg: '#ffffff', nombre: 'Nivel 1' },
  NIVEL_2: { c: '◆', bg: 'var(--hf-brand-100)', fg: 'var(--hf-brand-nav)', nombre: 'Nivel 2' },
  NIVEL_3: { c: '▤', bg: '#eef2f8', fg: 'var(--hf-brand-nav)', nombre: 'Nivel 3' },
  ACTIVO: { c: '▶', bg: '#e8f4ef', fg: '#0b5c44', nombre: 'Activo' },
  DESPLIEGUE: { c: '⬒', bg: '#fff3e6', fg: '#8a4407', nombre: 'Despliegue' },
};

export interface DetalleActivo {
  ruta: string;
  campos: { etiqueta: string; valor: string; alerta?: boolean }[];
  dependencias: { tipo: string; nombre: string }[];
}

export interface DetalleDespliegue {
  campos: { etiqueta: string; valor: string }[];
  evidencia: string | null;
  confianza: ConfianzaDato;
}

export default function MapaClient({
  arbol,
  detalleActivo,
  detalleDespliegue,
  sinClasificar,
  desplieguesHuerfanos,
}: {
  arbol: NodoArbol[];
  detalleActivo: Record<string, DetalleActivo>;
  detalleDespliegue: Record<string, DetalleDespliegue>;
  sinClasificar: number;
  desplieguesHuerfanos: number;
}) {
  // Arranca con los niveles 1 y 2 abiertos: todo cerrado muestra tres filas y no dice nada;
  // todo abierto sobre 247 activos es una lista que nadie recorre.
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () => new Set(arbol.filter((n) => n.clase === 'NIVEL_1' || n.clase === 'NIVEL_2').map((n) => n.id)),
  );
  const [sel, setSel] = useState<string | null>(arbol[0]?.id ?? null);

  const visibles = useMemo(() => nodosVisibles(arbol, abiertos), [arbol, abiertos]);
  const conHijos = useMemo(() => new Set(arbol.filter((n) => tieneHijos(arbol, n.id)).map((n) => n.id)), [arbol]);
  const nodo = arbol.find((n) => n.id === sel) ?? null;
  const todoAbierto = abiertos.size >= conHijos.size;

  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[96ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Mapa tecnológico</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            De la empresa al contenedor. Cada nodo abre el siguiente, y el activo se edita sin
            salir del árbol.
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <button
            onClick={() => setAbiertos(todoAbierto ? new Set() : new Set(conHijos))}
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12 text-secondary"
          >
            {todoAbierto ? 'Colapsar' : 'Expandir todo'}
          </button>
          <button
            onClick={() => exportarCsv(arbol)}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            Exportar
          </button>
        </div>
      </div>

      {(sinClasificar > 0 || desplieguesHuerfanos > 0) && (
        <p
          className="mt-4 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }}
        >
          {/* Lo que el árbol NO puede dibujar. Sin este renglón el mapa se vería completo
              justamente porque le falta información. */}
          <strong className="font-semibold">Fuera del árbol:</strong>{' '}
          {sinClasificar > 0 && (
            <>
              {sinClasificar} activo(s) sin nivel —{' '}
              <Link href="/tecnologia/niveles" className="font-semibold underline">
                clasificarlos
              </Link>
            </>
          )}
          {sinClasificar > 0 && desplieguesHuerfanos > 0 && ' · '}
          {desplieguesHuerfanos > 0 && (
            <>
              {desplieguesHuerfanos} despliegue(s) sin activo padre —{' '}
              <Link href="/tecnologia/ambientes" className="font-semibold underline">
                asociarlos
              </Link>
            </>
          )}
          . No cuelgan de ninguna rama, así que no aparecen abajo.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
            {/* El lienzo rotula esto «Árbol de dependencias», y NO lo es: lo que se dibuja
                acá es CONTENCIÓN —nivel 1 › 2 › 3 › activo › despliegue—, no dependencia.
                Es exactamente la confusión que la spec advierte en §3.3: «está dentro de»
                no es «depende de». Las dependencias son un grafo y viven en su pantalla.
                Se rotula «Árbol del inventario» a propósito. */}
            <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
              Árbol del inventario
            </span>
            <span className="font-mono text-9_5 text-faint">
              {visibles.length} nodos visibles de {arbol.length}
            </span>
            <span className="ml-auto flex flex-wrap gap-3">
              {(Object.keys(ICONO) as ClaseNodo[]).map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5">
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-[4px] text-9"
                    style={{ background: ICONO[c].bg, color: ICONO[c].fg }}
                  >
                    {ICONO[c].c}
                  </span>
                  <span className="text-10_5 text-secondary">{ICONO[c].nombre}</span>
                </span>
              ))}
            </span>
          </div>

          <div className="max-h-[600px] min-h-0 flex-1 overflow-auto p-2.5">
            {visibles.map((n) => {
              const i = ICONO[n.clase];
              const expandible = conHijos.has(n.id);
              const abierto = abiertos.has(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setSel(n.id);
                    if (expandible) alternar(n.id);
                  }}
                  aria-expanded={expandible ? abierto : undefined}
                  className="mb-0.5 flex w-full items-center gap-2 rounded-campo px-2 py-1.5 text-left"
                  style={{
                    background: sel === n.id ? 'var(--hf-brand-100)' : 'transparent',
                    border: `1px solid ${sel === n.id ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                  }}
                >
                  <span style={{ width: n.profundidad * 18 }} className="flex-none" />
                  {/* La flecha sólo en los que tienen hijos: dibujarla en una hoja invita a
                      un clic que no hace nada. */}
                  <span className="w-3.5 flex-none text-center text-9 text-faint">
                    {expandible ? (abierto ? '▾' : '▸') : ''}
                  </span>
                  <span
                    className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[5px] text-11"
                    style={{ background: i.bg, color: i.fg }}
                  >
                    {i.c}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span
                      className="truncate"
                      style={{
                        fontSize: n.profundidad === 0 ? 13.5 : 12,
                        fontWeight: n.profundidad <= 1 ? 600 : 400,
                        color: n.clase === 'DESPLIEGUE' ? 'var(--hf-text-secondary-soft)' : 'var(--hf-text-primary)',
                      }}
                    >
                      {n.nombre}
                    </span>
                    {n.codigo !== null && (
                      <span className="flex-none font-mono text-9_5 text-faint">{n.codigo}</span>
                    )}
                    {n.meta !== null && (
                      <span className="flex-none font-mono text-9_5 text-faint">{n.meta}</span>
                    )}
                  </span>
                  {n.marca !== null && (
                    <span
                      className="flex-none rounded-[4px] px-1.5 py-0.5 font-mono text-7_5 font-semibold uppercase tracking-[0.06em]"
                      style={
                        n.marca === 'vacío'
                          ? { background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }
                          : { background: '#fdeeeb', color: '#a52016' }
                      }
                    >
                      {n.marca}
                    </span>
                  )}
                </button>
              );
            })}
            {arbol.length === 0 && (
              <p className="px-3 py-10 text-center text-12 text-muted [text-wrap:pretty]">
                La jerarquía todavía no tiene ramas.{' '}
                <Link href="/tecnologia/niveles" className="font-medium text-accent underline">
                  Crear los niveles
                </Link>{' '}
                es el primer paso: sin ellos no hay de dónde colgar los activos.
              </p>
            )}
          </div>
        </section>

        <aside className="flex w-full flex-none flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface xl:w-[386px]">
          {nodo === null ? (
            <p className="px-4 py-10 text-center text-12 text-muted">Elegí un nodo del árbol.</p>
          ) : (
            <Panel
              nodo={nodo}
              activo={detalleActivo[nodo.id]}
              despliegue={detalleDespliegue[nodo.id]}
            />
          )}
        </aside>
      </div>
    </main>
  );
}

function Panel({
  nodo,
  activo,
  despliegue,
}: {
  nodo: NodoArbol;
  activo: DetalleActivo | undefined;
  despliegue: DetalleDespliegue | undefined;
}) {
  const i = ICONO[nodo.clase];
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3.5">
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[6px] text-12"
            style={{ background: i.bg, color: i.fg }}
          >
            {i.c}
          </span>
          <span className="etiqueta-campo">{i.nombre}</span>
          {nodo.codigo !== null && (
            <span className="ml-auto font-mono text-10_5 font-semibold text-accent">{nodo.codigo}</span>
          )}
        </span>
        <span className="text-15 font-semibold leading-snug text-primary">{nodo.nombre}</span>
        {activo !== undefined && (
          <span className="text-11_5 leading-relaxed text-muted">{activo.ruta}</span>
        )}
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-3.5">
        {activo !== undefined && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {activo.campos.map((c) => (
                <span
                  key={c.etiqueta}
                  className="flex flex-col gap-1 rounded-campo border border-border-field bg-subtle px-3 py-2"
                >
                  <span className="etiqueta-campo">{c.etiqueta}</span>
                  <span
                    className="text-12"
                    style={
                      c.alerta === true
                        ? { color: '#a52016', fontWeight: 600 }
                        : { color: 'var(--hf-text-primary)' }
                    }
                  >
                    {c.valor}
                  </span>
                </span>
              ))}
            </div>
            {/* «Editar el activo aquí» del lienzo: no se edita en línea porque el
                inventario del SGSI ya tiene la pantalla completa con su bitácora. Se lleva
                allá en vez de abrir un segundo editor del mismo registro. */}
            <Link
              href="/sgsi/inventario"
              className="self-start rounded-campo px-3.5 py-2 text-12 font-semibold text-white"
              style={{ background: 'var(--hf-brand-nav)' }}
            >
              Editar el activo en el inventario
            </Link>

            {activo.dependencias.length > 0 && (
              <div className="flex flex-col gap-2">
                <Rotulo texto="Depende de" derecha={`${activo.dependencias.length}`} />
                {activo.dependencias.map((d, k) => (
                  <span
                    key={`${d.nombre}-${k}`}
                    className="flex items-center gap-2.5 rounded-campo border border-border-field bg-subtle px-3 py-2"
                  >
                    <span
                      className="flex-none rounded-[3px] px-1.5 py-0.5 font-mono text-7_5 uppercase tracking-[0.05em]"
                      style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                    >
                      {ETIQUETA_TIPO_DEPENDENCIA[d.tipo as TipoDependencia] ?? d.tipo}
                    </span>
                    <span className="truncate text-11_5 text-primary">{d.nombre}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {despliegue !== undefined && (
          <div className="flex flex-col gap-2">
            <Rotulo texto="Despliegue" derecha={ETIQUETA_CONFIANZA[despliegue.confianza]} />
            {despliegue.campos.map((c) => (
              <span key={c.etiqueta} className="flex items-baseline gap-2.5">
                <span className="etiqueta-campo w-[88px] flex-none">{c.etiqueta}</span>
                <span className="min-w-0 flex-1 break-all font-mono text-11 text-secondary">{c.valor}</span>
              </span>
            ))}
            <div className="mt-1 flex items-start gap-2.5 rounded-campo border border-border-field bg-subtle px-3 py-2.5">
              <span className="etiqueta-campo w-[60px] flex-none pt-0.5">Evidencia</span>
              <span className="flex-1 text-11 leading-relaxed text-secondary [text-wrap:pretty]">
                {/* Sin evidencia el dato no se puede volver a verificar, y decirlo es más
                    útil que dejar el espacio en blanco. */}
                {despliegue.evidencia ?? 'Sin evidencia registrada: este dato no se puede volver a verificar.'}
              </span>
            </div>
          </div>
        )}

        {activo === undefined && despliegue === undefined && (
          <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            Es un nodo de la jerarquía. Su contenido son los activos que cuelgan de él; se
            administra en{' '}
            <Link href="/tecnologia/niveles" className="font-medium text-accent underline">
              Niveles
            </Link>
            .
          </p>
        )}
      </div>
    </>
  );
}

/// Exporta el árbol completo, no sólo lo visible: quien exporta quiere el inventario, no la
/// foto de sus ramas abiertas.
function exportarCsv(arbol: NodoArbol[]): void {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const filas = [
    ['profundidad', 'clase', 'codigo', 'nombre', 'meta', 'marca'],
    ...arbol.map((n) => [
      String(n.profundidad),
      n.clase,
      n.codigo ?? '',
      n.nombre,
      n.meta ?? '',
      n.marca ?? '',
    ]),
  ];
  const csv = '﻿' + filas.map((f) => f.map(escapar).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mapa-tecnologico.csv';
  a.click();
  URL.revokeObjectURL(url);
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
