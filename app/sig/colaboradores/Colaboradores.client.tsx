'use client';

// app/sig/colaboradores/Colaboradores.client.tsx
//
// La lista única del lienzo: filtros «Todos / Activos / Inactivos / Con anomalía», las
// columnas persona · vinculación · cuenta, y el panel lateral con «lo que esta lista
// responde sola» y la composición real.
//
// La composición no es decoración: es el argumento del módulo. Si de las personas activas
// sólo una minoría es de nómina, tratar al contratista como caso aparte deja fuera del
// control a la mayoría de la organización — y esa cifra está a la vista para que la
// decisión se pueda discutir con el dato delante.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sincronizarDirectorio } from '@/app/sig/acciones/personas';
import { crearColaborador } from '@/app/sig/acciones/colaborador-alta';
import AltaColaborador from './AltaColaborador';
import PopupPersona, { type CatalogosDelPopup } from '@/app/sig/personas/PopupPersona';
import type { PersonaFila } from '@/app/sig/personas/Personas.client';

type Filtro = 'todos' | 'activos' | 'inactivos' | 'anomalia';

export interface ColaboradorFila {
  id: number;
  nombre: string;
  correo: string;
  area: string | null;
  cargo: string | null;
  tipoContrato: string | null;
  esNomina: boolean;
  tipoColaborador: string | null;
  origen: string;
  activa: boolean;
  fechaIngreso: string | null;
  retiradoEn: string | null;
  conActa: boolean;
  tieneAnomalia: boolean;
}

export interface AnomaliaFila {
  clave: string;
  etiqueta: string;
  consecuencia: string;
  calculable: boolean;
  n: number;
}

export default function ColaboradoresClient({
  filas,
  anomalias,
  composicion,
  tiposDeContrato,
  areas,
  cargos,
  administra,
  ultimaSincronizacion,
  censo,
  catalogosDelPopup,
  bloqueoDisponible,
}: {
  filas: ColaboradorFila[];
  anomalias: AnomaliaFila[];
  composicion: { etiqueta: string; n: number }[];
  tiposDeContrato: { id: number; nombre: string }[];
  areas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string }[];
  administra: boolean;
  /// La última corrida del Directorio, como texto ya formateado por el servidor. `null`
  /// cuando nunca corrió: decir «nunca» es un dato, y una fecha inventada no lo es.
  ultimaSincronizacion: string | null;
  /// Las MISMAS filas del censo. Esta pantalla lista colaboradores por su vinculación y el
  /// censo los lista por su cuenta; el popup edita a la persona, que es una sola — así que
  /// la fila rica viaja desde la misma lectura en vez de mapearse dos veces.
  censo: PersonaFila[];
  catalogosDelPopup: CatalogosDelPopup;
  bloqueoDisponible: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [dandoDeAlta, setDandoDeAlta] = useState(false);
  const [editando, setEditando] = useState<PersonaFila | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('activos');

  const sincronizar = (): void =>
    iniciar(async () => {
      const r = await sincronizarDirectorio();
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) router.refresh();
    });

  const conteos = useMemo(
    () => ({
      todos: filas.length,
      activos: filas.filter((f) => f.activa).length,
      inactivos: filas.filter((f) => !f.activa).length,
      anomalia: filas.filter((f) => f.tieneAnomalia).length,
    }),
    [filas],
  );

  const visibles = useMemo(() => {
    if (filtro === 'activos') return filas.filter((f) => f.activa);
    if (filtro === 'inactivos') return filas.filter((f) => !f.activa);
    if (filtro === 'anomalia') return filas.filter((f) => f.tieneAnomalia);
    return filas;
  }, [filas, filtro]);

  const sinCalcular = anomalias.filter((a) => !a.calculable);
  const totalActivos = conteos.activos;

  return (
    <main className="flex flex-1 gap-5 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="titulo-pagina">Colaboradores</h1>
            <p className="max-w-[106ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
              Una sola tabla con activos e inactivos, sincronizada del Directorio Activo.{' '}
              <strong className="font-semibold text-secondary">El estado no se almacena</strong>: se
              calcula de la fecha de retiro, así que el tipo de contrato sobrevive al retiro.
            </p>
          </div>
          {/* Las acciones superiores. El Directorio manda sobre quién existe, así que
              sincronizar es la primera: antes de dar de alta a alguien a mano conviene ver
              si el Directorio ya lo trajo. */}
          {administra && (
            <div className="ml-auto flex flex-none flex-col items-end gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={sincronizar}
                  className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5 text-secondary transition-colors hover:bg-app disabled:opacity-40"
                >
                  {pendiente ? 'Sincronizando…' : 'Sincronizar con el Directorio'}
                </button>
                <button
                  type="button"
                  onClick={() => setDandoDeAlta(true)}
                  className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  + Nuevo colaborador
                </button>
              </div>
              <span className="font-mono text-9_5 text-label">
                {ultimaSincronizacion === null
                  ? 'el Directorio nunca se sincronizó'
                  : `última sincronización · ${ultimaSincronizacion}`}
              </span>
            </div>
          )}
        </div>

        {aviso && (
          <p
            className="mt-3 max-w-[100ch] text-12 [text-wrap:pretty]"
            style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
          >
            {aviso.texto}
          </p>
        )}

        {editando !== null && (
          <PopupPersona
            persona={editando}
            catalogos={catalogosDelPopup}
            administra={administra}
            bloqueoDisponible={bloqueoDisponible}
            onCerrar={() => {
              setEditando(null);
              router.refresh();
            }}
            // La reasignación de pendientes vive en el censo, donde está su acción y su
            // estado. Acá no se ofrece en vez de ofrecerla rota.
            pieDeDatosBase={null}
          />
        )}

        {dandoDeAlta && (
          <AltaColaborador
            tiposDeContrato={tiposDeContrato}
            areas={areas}
            cargos={cargos}
            onCerrar={() => setDandoDeAlta(false)}
            onCrear={async (datos) => {
              const r = await crearColaborador(datos);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) {
                setDandoDeAlta(false);
                router.refresh();
              }
              return r.ok;
            }}
          />
        )}

        <div className="mt-4 flex items-start gap-5">
          <nav className="ml-auto flex flex-none flex-wrap items-center gap-1.5">
            {(['todos', 'activos', 'inactivos', 'anomalia'] as const).map((f) => {
              const activo = filtro === f;
              const rojo = f === 'anomalia' && conteos.anomalia > 0;
              return (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  aria-pressed={activo}
                  className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12"
                  style={{
                    background: activo
                      ? rojo
                        ? '#fdeeeb'
                        : 'var(--hf-brand-100)'
                      : 'var(--hf-bg-surface)',
                    color: activo
                      ? rojo
                        ? '#a52016'
                        : 'var(--hf-brand-nav)'
                      : 'var(--hf-text-secondary-soft)',
                    border: '1px solid var(--hf-border-field)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {f === 'todos'
                    ? 'Todos'
                    : f === 'activos'
                      ? 'Activos'
                      : f === 'inactivos'
                        ? 'Inactivos'
                        : 'Con anomalía'}
                  <span className="font-mono text-10 opacity-70">{conteos[f]}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-5 overflow-x-auto rounded-tarjeta border border-border-field bg-surface">
          <table className="w-full text-left text-12_5">
            <thead>
              <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 font-semibold">Vinculación</th>
                <th className="px-4 py-3 font-semibold">Área y cargo</th>
                <th className="px-4 py-3 font-semibold">Cuenta</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="border-t border-border-default">
                  <td className="px-4 py-3">
                    {/* La ficha es el destino de la lista. Sin enlace la ruta existe y no se
                        alcanza, que es el defecto que ya aparecio dos veces en este repo. */}
                    {/* El nombre ABRE EL EDITOR y ya no lleva al expediente. Es la pantalla
                        integradora: lo que se hace acá noventa veces de cada cien es
                        corregir un contrato, un área o una pertenencia, y para eso había que
                        irse a otra pantalla. El expediente sigue a un clic, desde el propio
                        popup. */}
                    <button
                      type="button"
                      onClick={() => {
                        const persona = censo.find((c) => c.id === f.id) ?? null;
                        setEditando(persona);
                      }}
                      className="text-left font-medium text-primary hover:underline"
                    >
                      {f.nombre}
                    </button>
                    <div className="font-mono text-10_5 text-muted">{f.correo}</div>
                  </td>
                  <td className="px-4 py-3">
                    {f.tipoContrato !== null ? (
                      <span className="flex flex-col gap-0.5">
                        <span
                          className="w-fit rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                          style={
                            f.esNomina
                              ? { background: '#e8f4ef', color: '#0b5c44' }
                              : { background: '#e9f0fb', color: '#12437f' }
                          }
                        >
                          {f.tipoContrato}
                        </span>
                        {f.tipoColaborador !== null && (
                          <span className="font-mono text-9_5 text-muted">{f.tipoColaborador}</span>
                        )}
                      </span>
                    ) : (
                      <Faltante>sin tipo de contrato</Faltante>
                    )}
                  </td>
                  <td className="px-4 py-3 text-11_5 text-muted">
                    {f.area ?? '—'}
                    {f.cargo !== null && <div className="text-10_5">{f.cargo}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {/* C1 · un activo con origen MANUAL es una anomalía de la vinculación,
                        no una categoría válida, y la lista lo muestra en rojo. */}
                    {f.origen === 'MANUAL' ? (
                      <Faltante>sin cuenta del Directorio</Faltante>
                    ) : (
                      <span className="font-mono text-10_5 text-muted">Directorio</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                      style={
                        f.activa
                          ? { background: '#e6efe9', color: '#0b5c44' }
                          : { background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }
                      }
                    >
                      {f.activa ? 'Activa' : 'Inactiva'}
                    </span>
                    {f.retiradoEn !== null && (
                      <div className="mt-0.5 font-mono text-9_5 text-muted">
                        retiro {f.retiradoEn}
                        {!f.conActa && <span style={{ color: '#a52016' }}> · sin acta</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && (
            <p className="px-4 py-8 text-center text-12 text-muted">
              {filtro === 'anomalia'
                ? 'Ninguna anomalía de las que hoy se pueden calcular.'
                : 'Ninguna persona en este filtro.'}
            </p>
          )}
        </div>

        {tiposDeContrato.length === 0 && (
          <p
            className="mt-4 max-w-[90ch] rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            El catálogo de tipos de contrato está vacío. Es cerrado a propósito (C8): el texto
            libre produjo siete valores para cuatro conceptos, uno con error de digitación.
          </p>
        )}
      </div>

      <aside className="flex w-[330px] flex-none flex-col gap-4">
        <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface p-4">
          <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
            Lo que esta lista responde sola
          </span>
          {anomalias.map((a) => (
            <div key={a.clave} className="flex flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span
                  className="font-mono text-15 font-semibold tabular-nums"
                  style={{
                    color: !a.calculable
                      ? 'var(--hf-text-muted)'
                      : a.n > 0
                        ? '#a52016'
                        : '#0b5c44',
                  }}
                >
                  {a.calculable ? a.n : '—'}
                </span>
                <span className="text-11_5 leading-tight text-primary">{a.etiqueta}</span>
              </span>
              <span className="pl-7 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                {a.calculable ? a.consecuencia : 'todavía no se puede calcular'}
              </span>
            </div>
          ))}
          {sinCalcular.length > 0 && (
            <p
              className="mt-1 rounded-campo px-2.5 py-2 text-10_5 leading-relaxed [text-wrap:pretty]"
              style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
            >
              {sinCalcular.length} de {anomalias.length} no se pueden calcular todavía. Se
              muestran en gris y no en cero verde a propósito: un cero verde diría que no hay
              nada que corregir, y eso no se sabe.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface p-4">
          <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
            Composición real
          </span>
          {composicion.length === 0 ? (
            <p className="text-11_5 text-muted">Sin personas activas.</p>
          ) : (
            <>
              {composicion.map((c) => (
                <div key={c.etiqueta} className="flex items-center gap-2.5">
                  <span className="min-w-0 flex-1 truncate text-11_5 text-secondary">
                    {c.etiqueta}
                  </span>
                  <span className="flex h-2 w-[70px] flex-none overflow-hidden rounded-[3px] bg-subtle">
                    <span
                      style={{
                        width: `${totalActivos === 0 ? 0 : Math.round((c.n / totalActivos) * 100)}%`,
                        background: 'var(--hf-brand-nav)',
                      }}
                    />
                  </span>
                  <span className="w-6 flex-none text-right font-mono text-11 tabular-nums text-primary">
                    {c.n}
                  </span>
                </div>
              ))}
              <p className="mt-1 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Es el argumento del módulo: si sólo una minoría es de nómina, tratar al
                contratista como caso aparte deja fuera del control a la mayoría. Un contratista
                firma el mismo acuerdo, recibe la misma inducción y se le revocan los accesos el
                mismo día.
              </p>
            </>
          )}
        </section>
      </aside>
    </main>
  );
}

function Faltante({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-[4px] px-1.5 py-0.5 font-mono text-9 font-semibold uppercase"
      style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
    >
      {children}
    </span>
  );
}
