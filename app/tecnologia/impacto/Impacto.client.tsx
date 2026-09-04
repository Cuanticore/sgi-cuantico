'use client';

// app/tecnologia/impacto/Impacto.client.tsx
//
// El activo al centro, aguas arriba a la izquierda y aguas abajo a la derecha.
//
// **El número de saltos no es una jerarquía.** Es la distancia en la cadena, y no tiene
// nada que ver con los tres grados de `NivelActivo`. Un activo puede aparecer en las dos
// columnas de otro activo sin que haya ciclo, y la pantalla lo dice para que nadie lea el
// «2» como «nivel 2».

import { useRouter } from 'next/navigation';
import { ETIQUETA_TIPO_DEPENDENCIA, type TipoDependencia } from '@/lib/sig/dependencias';

function pintarCriticidad(v: number | null): { texto: string; color: string } {
  if (v === null) return { texto: 'sin valorar', color: 'var(--hf-text-faint)' };
  if (v >= 5) return { texto: 'muy alto', color: '#a52016' };
  if (v === 4) return { texto: 'alto', color: '#b8791a' };
  if (v === 3) return { texto: 'medio', color: '#0f7a5a' };
  return { texto: 'bajo', color: 'var(--hf-text-muted)' };
}

export interface NodoImpacto {
  activoId: number;
  codigo: string | null;
  nombre: string;
  distancia: number;
  tipo: string;
  via: string | null;
  criticidad: number | null;
}

export default function ImpactoClient({
  baseId,
  soloDirectas,
  activos,
  arriba,
  abajo,
  asimetricos,
}: {
  baseId: number | null;
  soloDirectas: boolean;
  activos: { id: number; codigo: string | null; nombre: string; criticidad: number | null }[];
  arriba: NodoImpacto[];
  abajo: NodoImpacto[];
  asimetricos: { dependeDeId: number; nombre: string; motivo: string }[];
}) {
  const router = useRouter();
  const base = activos.find((a) => a.id === baseId) ?? null;
  const c = pintarCriticidad(base?.criticidad ?? null);

  const irA = (id: number, directas: boolean) =>
    router.push(`/tecnologia/impacto?base=${id}${directas ? '&cadena=0' : ''}`);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-end gap-5">
        <div className="flex max-w-[104ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Impacto</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            La misma relación leída en las dos direcciones y en cadena.{' '}
            <a href="/tecnologia/dependencias" className="font-medium text-accent hover:underline">
              «Dependencias»
            </a>{' '}
            declara la arista; esta pantalla la interpreta.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Activo</span>
            <select
              value={baseId ?? ''}
              onChange={(e) => irA(Number(e.target.value), soloDirectas)}
              className="entrada-campo min-w-[300px]"
            >
              {activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo ?? `#${a.id}`} · {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Alcance</span>
            <div className="flex gap-1.5">
              {[
                { directas: false, etiqueta: 'Cadena completa' },
                { directas: true, etiqueta: 'Sólo directas' },
              ].map((o) => {
                const activo = soloDirectas === o.directas;
                return (
                  <button
                    key={o.etiqueta}
                    onClick={() => baseId !== null && irA(baseId, o.directas)}
                    aria-pressed={activo}
                    className="rounded-campo px-3 py-1.5 text-11_5"
                    style={{
                      background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                      border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                      color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    {o.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {base === null ? (
        <p className="mt-6 text-12_5 text-muted">No hay activos vigentes en el inventario.</p>
      ) : (
        <div className="mt-4 flex flex-col items-stretch gap-3.5 xl:flex-row">
          <Columna
            titulo="Aguas arriba · de qué depende"
            color="#8a4407"
            explicacion={<>Si algo de esta columna cae, <strong className="font-semibold text-secondary">{base.nombre}</strong> se ve afectado.</>}
            nodos={arriba}
            soloDirectas={soloDirectas}
            sufijo={soloDirectas ? 'directas' : 'en cadena'}
            alSeleccionar={(id) => irA(id, soloDirectas)}
            pie={
              asimetricos.length > 0 ? (
                <span
                  className="block px-4 py-3 text-10_5 leading-relaxed [text-wrap:pretty]"
                  style={{ background: '#fffaf3', color: '#8a4407', borderTop: '1px solid var(--hf-hairline)' }}
                >
                  {base.nombre} es de criticidad {c.texto} y depende de {asimetricos.length}{' '}
                  {asimetricos.length === 1 ? 'activo peor valorado' : 'activos peor valorados'}
                  {asimetricos.some((a) => a.motivo.includes('sin valorar')) &&
                    `, ${asimetricos.filter((a) => a.motivo.includes('sin valorar')).length} de ellos sin valorar`}
                  . La cadena vale lo que su eslabón más flojo.
                </span>
              ) : null
            }
          />

          <div className="flex flex-none flex-col justify-center gap-3.5 xl:w-[292px]">
            <section
              className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-5"
              style={{ border: '1px solid var(--hf-brand-200, #d3dceb)' }}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-10 font-semibold text-accent">
                  {base.codigo ?? `#${base.id}`}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                  <span className="font-mono text-9" style={{ color: c.color }}>
                    {c.texto}
                  </span>
                </span>
              </span>
              <span className="text-16 font-semibold leading-snug text-primary">{base.nombre}</span>
              <span className="h-px bg-hairline" />
              <div className="flex gap-2.5">
                <span className="flex flex-1 flex-col gap-1">
                  <span className="font-mono text-19 font-semibold tabular-nums" style={{ color: '#8a4407' }}>
                    {arriba.length}
                  </span>
                  <span className="etiqueta-campo leading-snug">Depende de</span>
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="font-mono text-19 font-semibold tabular-nums text-accent">
                    {abajo.length}
                  </span>
                  <span className="etiqueta-campo leading-snug">Dependen de él</span>
                </span>
              </div>
            </section>

            <p className="rounded-tarjeta border border-border-field bg-surface px-3.5 py-3 text-10_5 leading-relaxed text-secondary [text-wrap:pretty]">
              El número de saltos no es una jerarquía: es la distancia en la cadena. Un activo
              puede aparecer en las dos columnas de otro activo sin que haya ciclo.
            </p>
          </div>

          <Columna
            titulo="Aguas abajo · qué depende de él"
            color="var(--hf-brand-nav)"
            explicacion={<>Si <strong className="font-semibold text-secondary">{base.nombre}</strong> cae, esto se ve afectado. Es la columna del BIA.</>}
            nodos={abajo}
            soloDirectas={soloDirectas}
            sufijo={soloDirectas ? 'directos' : 'en cadena'}
            alSeleccionar={(id) => irA(id, soloDirectas)}
            pie={
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{ background: 'var(--hf-bg-subtle)', borderTop: '1px solid var(--hf-hairline)' }}
              >
                {/* El veredicto en una frase. Es lo que se copia al BIA, y por eso se
                    genera del dato: escrito a mano envejecería en cuanto cambie una arista. */}
                <span className="flex-1 text-11 leading-relaxed text-primary [text-wrap:pretty]">
                  {veredicto(base.nombre, abajo)}
                </span>
                <button
                  onClick={() => exportarCsv(base.nombre, arriba, abajo)}
                  className="flex-none rounded-campo border bg-surface px-3 py-1.5 text-11 font-semibold text-accent"
                  style={{ borderColor: 'var(--hf-brand-200, #d3dceb)' }}
                >
                  Exportar
                </button>
              </div>
            }
          />
        </div>
      )}
    </main>
  );
}

/// La frase que se copia al BIA. Se genera del dato en vez de escribirse a mano porque una
/// conclusión redactada envejece: cambia una arista y el texto sigue afirmando lo anterior.
///
/// «Ninguno depende de él» se dice en positivo y no como una lista vacía: que la
/// indisponibilidad NO se propague es una conclusión, no una ausencia de datos.
function veredicto(nombre: string, abajo: NodoImpacto[]): string {
  if (abajo.length === 0) {
    return `Ningún activo depende de ${nombre}. Su indisponibilidad no se propaga.`;
  }
  const graves = abajo.filter((n) => n.criticidad !== null && n.criticidad >= 4).length;
  return (
    `Si ${nombre} no está disponible, ${abajo.length} ` +
    `${abajo.length === 1 ? 'activo se ve afectado' : 'activos se ven afectados'}` +
    (graves > 0 ? `, ${graves} de criticidad alta o superior.` : '.')
  );
}

/// Exporta las dos columnas a CSV. **Se arma en el cliente y no en una ruta del servidor**
/// porque no hay nada que el servidor sepa y el cliente no: los datos ya están en pantalla,
/// y una ruta de descarga sería un segundo lugar donde la misma consulta puede divergir.
function exportarCsv(nombre: string, arriba: NodoImpacto[], abajo: NodoImpacto[]): void {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const filas = [
    ['direccion', 'codigo', 'activo', 'saltos', 'tipo', 'via', 'criticidad'],
    ...arriba.map((n) => [
      'depende de',
      n.codigo ?? '',
      n.nombre,
      String(n.distancia),
      n.tipo,
      n.via ?? '',
      n.criticidad === null ? 'sin valorar' : String(n.criticidad),
    ]),
    ...abajo.map((n) => [
      'dependen de el',
      n.codigo ?? '',
      n.nombre,
      String(n.distancia),
      n.tipo,
      n.via ?? '',
      n.criticidad === null ? 'sin valorar' : String(n.criticidad),
    ]),
  ];
  // El BOM es para que Excel abra el archivo en UTF-8: sin él, cada tilde de un nombre de
  // activo llega rota al informe.
  const csv = '﻿' + filas.map((f) => f.map(escapar).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `impacto-${nombre.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Columna({
  titulo,
  color,
  explicacion,
  nodos,
  sufijo,
  alSeleccionar,
  pie,
}: {
  titulo: string;
  color: string;
  explicacion: React.ReactNode;
  nodos: NodoImpacto[];
  soloDirectas: boolean;
  sufijo: string;
  alSeleccionar: (id: number) => void;
  pie: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <div className="flex flex-col gap-1 border-b border-hairline px-4 py-3.5">
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]" style={{ color }}>
            {titulo}
          </span>
          <span className="ml-auto font-mono text-9_5 text-faint">
            {nodos.length} {sufijo}
          </span>
        </span>
        <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">{explicacion}</span>
      </div>

      <div className="max-h-[520px] min-h-0 flex-1 overflow-y-auto p-2.5">
        {nodos.map((n) => {
          const c = pintarCriticidad(n.criticidad);
          return (
            <button
              key={n.activoId}
              onClick={() => alSeleccionar(n.activoId)}
              className="mb-1 flex w-full items-center gap-2.5 rounded-campo border border-border-field bg-surface px-3 py-2 text-left"
            >
              {/* El salto en su propia caja: es el dato que hace legible una cadena de tres
                  niveles de profundidad sin volver a recorrer el grafo. */}
              <span
                className="flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[4px] font-mono text-8_5 font-semibold"
                style={
                  n.distancia === 1
                    ? { background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }
                    : { background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }
                }
              >
                {n.distancia}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-11_5 text-primary">{n.nombre}</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-8_5 text-muted">{n.codigo ?? `#${n.activoId}`}</span>
                  <span className="font-mono text-8_5 text-faint">·</span>
                  <span className="truncate font-mono text-8_5 text-muted">
                    {ETIQUETA_TIPO_DEPENDENCIA[n.tipo as TipoDependencia] ?? n.tipo}
                    {n.via !== null && ` · vía ${n.via}`}
                  </span>
                </span>
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <span className="h-1 w-1 rounded-full" style={{ background: c.color }} />
                <span className="font-mono text-8_5" style={{ color: c.color }}>
                  {c.texto}
                </span>
              </span>
            </button>
          );
        })}
        {nodos.length === 0 && (
          <p className="px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
            Nada por acá. Que no haya dependencias declaradas no es lo mismo que que no las
            tenga.
          </p>
        )}
      </div>
      {pie}
    </section>
  );
}
