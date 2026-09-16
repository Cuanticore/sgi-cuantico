'use client';

// app/sig/grupos-interes/GruposInteres.client.tsx
//
// Un grupo a la izquierda, sus miembros a la derecha. La edición es por CONJUNTO —se marca
// y se desmarca sobre la lista entera y se guarda de una— por lo mismo que las casillas del
// popup de la persona: la pantalla edita una lista, y mandar la lista completa es lo que
// permite que el servidor decida qué cambió en vez de creerle al cliente.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { crearGrupoInteres, guardarMiembrosDelGrupo } from '@/app/sig/acciones/grupos-interes';

export interface MiembroFila {
  personaId: number;
  nombre: string;
  correo: string;
  activa: boolean;
  desde: string;
}

export interface GrupoFila {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  derivado: boolean;
  obligaciones: number;
  miembros: MiembroFila[];
  /// Sólo en el derivado: cuántas personas activas hay. Decir «0 miembros» sería falso.
  cuentaDerivada: number | null;
}

export interface PersonaOpcion {
  id: number;
  nombre: string;
  correo: string;
}

export default function GruposInteresClient({
  grupos,
  personas,
  administra,
}: {
  grupos: GrupoFila[];
  personas: PersonaOpcion[];
  administra: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const [elegido, setElegido] = useState<number | null>(grupos.find((g) => !g.derivado)?.id ?? null);
  const grupo = grupos.find((g) => g.id === elegido) ?? null;

  // El borrador de la lista de miembros. Arranca de lo guardado y se reinicia cuando cambia
  // el grupo elegido: se llevan marcas de un grupo a otro es la clase de error que sólo se
  // descubre después de guardar.
  const [marcadas, setMarcadas] = useState<Set<number> | null>(null);
  const vigentes = useMemo(
    () => new Set((grupo?.miembros ?? []).map((m) => m.personaId)),
    [grupo],
  );
  const seleccion = marcadas ?? vigentes;

  const [buscar, setBuscar] = useState('');
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [descripcionNueva, setDescripcionNueva] = useState('');

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (q === '') return personas;
    return personas.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.correo.toLowerCase().includes(q),
    );
  }, [personas, buscar]);

  const sucio =
    marcadas !== null &&
    (marcadas.size !== vigentes.size || [...marcadas].some((id) => !vigentes.has(id)));

  const elegir = (id: number): void => {
    setElegido(id);
    setMarcadas(null);
    setAviso(null);
  };

  const alternar = (personaId: number): void => {
    const base = new Set(seleccion);
    if (base.has(personaId)) base.delete(personaId);
    else base.add(personaId);
    setMarcadas(base);
  };

  const guardar = (): void => {
    if (grupo === null || !sucio) return;
    iniciar(async () => {
      const r = await guardarMiembrosDelGrupo(grupo.id, [...seleccion]);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setMarcadas(null);
        router.refresh();
      }
    });
  };

  const crear = (): void => {
    if (nombreNuevo.trim() === '') return;
    iniciar(async () => {
      const r = await crearGrupoInteres(nombreNuevo, descripcionNueva);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setCreando(false);
        setNombreNuevo('');
        setDescripcionNueva('');
        if (r.id !== undefined) elegir(r.id);
        router.refresh();
      }
    });
  };

  return (
    <div className="px-8 pt-[22px] pb-[46px]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="titulo-pagina">Grupos de interés</h1>
          <p className="max-w-[82ch] text-12_5 text-muted [text-wrap:pretty]">
            A quién le corresponde cada obligación. Un grupo se asigna una vez y la obligación
            llega a todos sus miembros — por eso la lista de acá decide a quién le aparece el
            curso, la lectura o la verificación en su bandeja.
          </p>
        </div>
        {administra && !creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="rounded-campo border border-accent-border bg-accent-100 px-3.5 py-2 text-12_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
          >
            + Nuevo grupo
          </button>
        )}
      </div>

      {creando && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-[9px] border border-border-default bg-subtle px-4 py-3.5">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="etiqueta-campo text-9">NOMBRE</span>
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Mintrace"
              className="rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            />
          </label>
          <label className="flex min-w-[280px] flex-[2] flex-col gap-1">
            <span className="etiqueta-campo text-9">DESCRIPCIÓN — OPCIONAL</span>
            <input
              value={descripcionNueva}
              onChange={(e) => setDescripcionNueva(e.target.value)}
              placeholder="Qué clase de obligación le corresponde."
              className="rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            />
          </label>
          <button
            type="button"
            disabled={pendiente || nombreNuevo.trim() === ''}
            onClick={crear}
            className="rounded-campo border border-accent-500 bg-accent-100 px-3.5 py-2 text-12_5 font-semibold text-accent-700 disabled:opacity-40"
          >
            {pendiente ? 'Creando…' : 'Crear grupo'}
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-muted"
          >
            Cancelar
          </button>
          <p className="w-full text-11 text-label [text-wrap:pretty]">
            El código se deriva del nombre — «Mintrace» queda como <code className="font-mono">MINTRACE</code>.
            Un grupo nuevo nace vacío y con miembros explícitos: «Todos» es el único que se
            calcula solo, y no se puede crear otro igual.
          </p>
        </div>
      )}

      {aviso && (
        <p
          className="mt-4 text-12 [text-wrap:pretty]"
          style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-5 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        {/* ── Los grupos ── */}
        <div className="flex flex-col gap-2">
          {grupos.map((g) => {
            const activo = g.id === elegido;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => elegir(g.id)}
                className="flex flex-col gap-1 rounded-[9px] border px-3.5 py-3 text-left transition-colors"
                style={{
                  borderColor: activo ? 'var(--hf-accent-500)' : 'var(--hf-border-default)',
                  background: activo ? 'var(--hf-accent-50)' : 'var(--hf-bg-surface)',
                }}
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-13 font-semibold text-primary">{g.nombre}</span>
                  <span className="font-mono text-9_5 text-label">{g.codigo}</span>
                  {g.derivado && (
                    <span className="rounded-badge border border-border-default bg-subtle px-1.5 py-px font-mono text-9 uppercase tracking-[0.06em] text-muted">
                      se calcula solo
                    </span>
                  )}
                </span>
                {g.descripcion !== null && (
                  <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
                    {g.descripcion}
                  </span>
                )}
                <span className="font-mono text-10_5 text-label">
                  {g.derivado
                    ? `${g.cuentaDerivada ?? 0} personas activas`
                    : `${g.miembros.length} ${g.miembros.length === 1 ? 'miembro' : 'miembros'}`}
                  {g.obligaciones > 0
                    ? ` · ${g.obligaciones} ${g.obligaciones === 1 ? 'obligación' : 'obligaciones'}`
                    : ' · sin obligaciones'}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Los miembros del grupo elegido ── */}
        <div className="flex flex-col gap-3 rounded-[9px] border border-border-default bg-surface px-4 py-4">
          {grupo === null ? (
            <p className="text-12_5 text-muted">Elegí un grupo para ver y editar sus miembros.</p>
          ) : grupo.derivado ? (
            <>
              <span className="text-13 font-bold text-primary">{grupo.nombre}</span>
              <p className="text-12 leading-relaxed text-muted [text-wrap:pretty]">
                Este grupo <strong>se calcula</strong>: pertenece toda persona activa, hoy{' '}
                {grupo.cuentaDerivada ?? 0}. No tiene lista que editar, y eso es a propósito —
                con filas de membresía, «por defecto todos pertenecen» sería una promesa que se
                rompe la primera vez que un alta no crea la fila, y esa persona dejaría de
                recibir lo que le toca sin que nadie se entere.
              </p>
              <p className="text-11 text-label [text-wrap:pretty]">
                Alguien sale de acá inactivándose en el censo, no desmarcándose.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-13 font-bold text-primary">
                  Miembros de {grupo.nombre}
                </span>
                <span className="font-mono text-10_5 text-label">
                  {seleccion.size} marcada(s){sucio ? ' · sin guardar' : ''}
                </span>
              </div>

              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar por nombre o correo…"
                aria-label="Buscar una persona"
                className="rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              />

              <ul className="flex max-h-[420px] flex-col gap-0.5 overflow-y-auto">
                {visibles.map((p) => {
                  const marcada = seleccion.has(p.id);
                  const desde = grupo.miembros.find((m) => m.personaId === p.id)?.desde ?? null;
                  return (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-campo px-2 py-1.5 hover:bg-subtle">
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={!administra || pendiente}
                          onChange={() => alternar(p.id)}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-12_5 text-primary">{p.nombre}</span>
                          <span className="truncate font-mono text-10 text-muted">{p.correo}</span>
                        </span>
                        {desde !== null && (
                          <span
                            className="flex-none font-mono text-9_5 text-label"
                            title="Desde cuándo pertenece. Es el piso de los periodos que se le cobran."
                          >
                            desde {desde}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
                {visibles.length === 0 && (
                  <li className="px-2 py-4 text-12 text-faint">Nadie coincide con la búsqueda.</li>
                )}
              </ul>

              {/* Los miembros con la cuenta ya inactiva: siguen vigentes en el grupo y hay que
                  verlos, porque son justamente los que hay que cerrar. */}
              {grupo.miembros.some((m) => !m.activa) && (
                <p className="text-11 leading-relaxed text-warn-text [text-wrap:pretty]">
                  {grupo.miembros.filter((m) => !m.activa).length} miembro(s) tienen la cuenta
                  inactiva y siguen perteneciendo al grupo. Desmarcarlos cierra su membresía sin
                  borrar el historial.
                </p>
              )}

              {administra && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={pendiente || !sucio}
                    onClick={guardar}
                    className="rounded-campo border border-accent-500 bg-accent-100 px-3.5 py-2 text-12_5 font-semibold text-accent-700 disabled:opacity-40"
                  >
                    {pendiente ? 'Guardando…' : 'Guardar miembros'}
                  </button>
                  {sucio && (
                    <button
                      type="button"
                      onClick={() => setMarcadas(null)}
                      className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-muted"
                    >
                      Descartar
                    </button>
                  )}
                  <span className="text-11 text-label [text-wrap:pretty]">
                    Quien sale no se borra: su membresía se cierra con la fecha de hoy, para que
                    «quién estaba en {grupo.nombre} en marzo» siga teniendo respuesta.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
