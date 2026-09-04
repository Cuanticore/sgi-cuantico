'use client';

// app/tecnologia/equipos/Equipos.client.tsx
//
// **Quien no tiene nada asignado aparece igual, y en rojo.** No es un adorno: es la única
// forma de que la pantalla responda «¿a quién le falta equipo?», y esa pregunta no la puede
// contestar una lista que salga del inventario.
//
// El botón de asignar todavía no existe porque el activo se edita en el inventario del
// SGSI, que ya tiene su propia pantalla y su propia bitácora. Duplicar la edición acá sería
// un segundo lugar donde el mismo campo se escribe distinto.

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export interface PersonaConEquipo {
  id: number;
  nombre: string;
  area: string | null;
  activos: { id: number; codigo: string | null; nombre: string; tipo: string }[];
}

export default function EquiposClient({
  personas,
  filtro,
  sinCustodio,
}: {
  personas: PersonaConEquipo[];
  filtro: string;
  sinCustodio: number;
}) {
  const router = useRouter();

  const sinNada = personas.filter((p) => p.activos.length === 0);
  const total = personas.reduce((n, p) => n + p.activos.length, 0);

  const visibles = useMemo(() => {
    if (filtro === 'sin') return sinNada;
    if (filtro === 'con') return personas.filter((p) => p.activos.length > 0);
    return personas;
  }, [personas, sinNada, filtro]);

  const irA = (f: string) => router.push(f === 'todas' ? '/tecnologia/equipos' : `/tecnologia/equipos?f=${f}`);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[96ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Equipos de colaboradores</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Las personas del Directorio cruzadas con lo que tienen a cargo.{' '}
            <strong className="font-semibold text-secondary">
              Quien no tiene nada asignado también aparece
            </strong>
            : es el hueco que hace que un inventario de equipos no sirva.
          </p>
        </div>
        <button
          onClick={() => exportarCsv(personas)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          Exportar equipos
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            etiqueta: 'Personas activas',
            valor: String(personas.length),
            nota: 'del Directorio',
            color: 'var(--hf-brand-nav)',
          },
          {
            etiqueta: 'Activos asignados',
            valor: String(total),
            nota: 'con custodio persona',
            color: '#0b5c44',
          },
          {
            etiqueta: 'Sin ningún activo',
            valor: String(sinNada.length),
            nota: 'revisar con Talento Humano',
            color: '#a52016',
          },
          {
            etiqueta: 'Promedio por persona',
            // Sin personas no hay promedio, y `0/0` daría `NaN` en pantalla. Se dice «—»,
            // que es lo que significa.
            valor: personas.length === 0 ? '—' : (total / personas.length).toFixed(1),
            nota: 'equipos',
            color: 'var(--hf-brand-nav)',
          },
        ].map((c) => (
          <span
            key={c.etiqueta}
            className="flex flex-col gap-1.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3"
            style={{ borderTopWidth: 2, borderTopColor: c.color }}
          >
            <span className="etiqueta-campo">{c.etiqueta}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-24 font-semibold leading-none tabular-nums" style={{ color: c.color }}>
                {c.valor}
              </span>
              <span className="text-11 leading-snug text-muted">{c.nota}</span>
            </span>
          </span>
        ))}
      </div>

      <nav className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { id: 'todas', etiqueta: 'Todas', conteo: personas.length },
          { id: 'sin', etiqueta: 'Sin activos', conteo: sinNada.length },
          { id: 'con', etiqueta: 'Con activos', conteo: personas.length - sinNada.length },
        ].map((x) => {
          const activo = filtro === x.id;
          return (
            <button
              key={x.id}
              onClick={() => irA(x.id)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {x.etiqueta}
              <span className="font-mono text-10 opacity-75">{x.conteo}</span>
            </button>
          );
        })}
        <span className="ml-auto text-11_5 text-muted [text-wrap:pretty]">
          El custodio persona se agregó al activo el 01/09/2026; el custodio cargo se conserva
          para la responsabilidad formal.
        </span>
      </nav>

      <div className="mt-4 flex flex-col gap-2.5">
        {visibles.map((p) => {
          const vacio = p.activos.length === 0;
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-start gap-4 rounded-tarjeta px-4 py-3.5"
              style={
                vacio
                  ? { background: '#fdeeeb', border: '1px solid #f2cdc6' }
                  : { background: 'var(--hf-bg-surface)', border: '1px solid var(--hf-border-field)' }
              }
            >
              <span
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-12 font-bold"
                style={
                  vacio
                    ? { background: '#f2cdc6', color: '#a52016' }
                    : { background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }
                }
              >
                {iniciales(p.nombre)}
              </span>

              <span className="flex w-[186px] flex-none flex-col gap-0.5">
                <span className="text-13_5 font-medium text-primary">{p.nombre}</span>
                <span className="font-mono text-9_5 text-muted">{p.area ?? 'sin área'}</span>
              </span>

              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {p.activos.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-2 rounded-campo border border-border-field bg-surface px-2.5 py-1.5"
                  >
                    <span className="text-11_5 text-primary">{a.nombre}</span>
                    <span className="font-mono text-9 text-faint">{a.codigo ?? `#${a.id}`}</span>
                  </span>
                ))}
                {vacio && (
                  <span
                    className="inline-flex items-center gap-2 rounded-campo px-3 py-1.5 text-11_5 font-medium"
                    style={{ background: 'var(--hf-bg-surface)', border: '1px solid #f2cdc6', color: '#a52016' }}
                  >
                    Sin ningún activo asignado
                  </span>
                )}
                {/* La asignación se hace en el inventario del SGSI, que ya edita el activo
                    con su bitácora. Un segundo lugar donde escribir el mismo campo es un
                    segundo lugar donde puede escribirse distinto. */}
                <Link
                  href="/sgsi/inventario"
                  className="inline-flex items-center rounded-campo border border-dashed border-border-field px-2.5 py-1.5 text-11 text-muted"
                >
                  + Asignar desde el inventario
                </Link>
              </span>

              <span className="flex w-[96px] flex-none flex-col items-end gap-0.5">
                <span
                  className="font-mono text-16 font-semibold tabular-nums"
                  style={{ color: vacio ? '#a52016' : 'var(--hf-brand-nav)' }}
                >
                  {p.activos.length}
                </span>
                <span className="etiqueta-campo">activos</span>
              </span>
            </div>
          );
        })}
        {visibles.length === 0 && (
          <p className="rounded-tarjeta border border-border-field bg-surface px-4 py-8 text-center text-12 text-muted [text-wrap:pretty]">
            {personas.length === 0
              ? 'No hay personas activas cargadas. La lista sale del Directorio, no del inventario.'
              : 'Ninguna con este filtro.'}
          </p>
        )}
      </div>

      {sinCustodio > 0 && (
        <p
          className="mt-3 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }}
        >
          {/* El reverso de la pantalla: activos que no aparecen en NINGUNA fila de arriba.
              Sin este renglón, un activo sin custodio persona sería invisible acá y nadie
              notaría que le falta. */}
          <strong className="font-semibold">{sinCustodio} activo(s) vigentes sin custodio persona.</strong>{' '}
          No salen en ninguna fila de arriba, así que sin este aviso serían invisibles en esta
          pantalla. Tienen custodio cargo o no lo tienen, pero nadie quedó registrado
          teniéndolos en la mano.
        </p>
      )}

      <p
        className="mt-3 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200, #d3dceb)', color: 'var(--hf-brand-nav)' }}
      >
        La lista sale de las{' '}
        <strong className="font-semibold">personas activas del Directorio</strong>, no del
        inventario. Por eso puede decir quién no tiene equipo: si partiera de los activos, esa
        persona sencillamente no aparecería. Al desvincular a alguien, sus activos quedan
        listados para reasignar, igual que sus tareas pendientes.
      </p>
    </main>
  );
}

/// La exportación que pide el lienzo. Incluye a quien no tiene nada, con la fila en blanco:
/// un CSV que sólo trae a los que tienen equipo repite el mismo error que la pantalla evita.
function exportarCsv(personas: PersonaConEquipo[]): void {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const filas: string[][] = [['persona', 'area', 'codigo', 'activo', 'tipo']];
  for (const p of personas) {
    if (p.activos.length === 0) {
      filas.push([p.nombre, p.area ?? '', '', 'SIN ACTIVO ASIGNADO', '']);
      continue;
    }
    for (const a of p.activos) {
      filas.push([p.nombre, p.area ?? '', a.codigo ?? '', a.nombre, a.tipo]);
    }
  }
  const csv = '﻿' + filas.map((f) => f.map(escapar).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'equipos-por-persona.csv';
  a.click();
  URL.revokeObjectURL(url);
}
