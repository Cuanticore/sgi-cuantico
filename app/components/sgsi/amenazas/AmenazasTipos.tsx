'use client';

// app/components/sgsi/amenazas/AmenazasTipos.tsx
//
// Handoff v2.1 screen 6. The screen looks like a table of pairs and is not one.
//
// Degradation and frequency are attributes of the THREAT: AmenazaDegradacion is keyed
// by amenaza + dimensión, and `frecuenciaId` hangs off Amenaza. MET-SIG-01 section 7.4
// puts it plainly — controls that limit damage are reflected by lowering the threat's
// degradation, "así hay un único juicio por fila y no dos". The type selector therefore
// only scopes what is DISPLAYED; every edit made here reaches all the types the threat
// applies to. That asymmetry is the trap of this screen, so the reach of each row is
// written on the row itself, before the user touches a select, and again in warn colour
// once they have.
//
// Only the relation is per pair, and it is a boolean that is flipped, never a row that
// is deleted: applicability is recorded for all ten types, so `aplica: false` means
// "explicitly not applicable" and is a fact worth keeping.

import { useMemo, useState } from 'react';

export interface TipoVista {
  codigo: string;
  nombre: string;
  abreviatura: string;
}

export interface GradoDegradacion {
  nombre: string;
  factor: number;
  lectura: string | null;
}

export interface GradoFrecuencia {
  nombre: string;
  vecesAno: number;
}

export interface DimensionVista {
  codigo: string;
  nombre: string;
}

export interface AmenazaVista {
  codigo: string;
  nombre: string;
  grupo: string;
  nota: string | null;
  frecuencia: string;
  /// Grade name per dimension code: { D: 'Muy alta', I: 'No aplica', … }.
  degradacion: Record<string, string>;
  /// The declared deviation. E.3, A.3, A.5 and A.13 were moved from Autenticidad or
  /// Trazabilidad to Integridad so their risk does not vanish with the two dimensions
  /// Cuantico does not value.
  reasignada: { dimension: string; desde: string } | null;
  /// Every type, with its recorded verdict — the false ones included.
  tipos: Record<string, boolean>;
}

interface Props {
  amenazas: AmenazaVista[];
  tipos: TipoVista[];
  gradosDegradacion: GradoDegradacion[];
  gradosFrecuencia: GradoFrecuencia[];
  dimensiones: DimensionVista[];
  nombresDimension: Record<string, string>;
}

/// What the user has changed and not published. Degradation is held per dimension code;
/// `frecuencia` is the threat's own scale row.
type Borrador = Record<string, Record<string, string>>;

const CAMPO_FRECUENCIA = 'frecuencia';

/// Decimal comma, and the typographic minus for anything negative.
function cifra(n: number, decimales?: number): string {
  const texto = decimales === undefined ? n.toString() : n.toFixed(decimales);
  return texto.replace('-', '−').replace('.', ',');
}

/// "Muy alta — ocurre a diario" is too long for a 176px select. The grade is the part
/// that identifies the row; the em-dash reading goes to the title attribute.
function gradoCorto(nombre: string): string {
  return nombre.split(' — ')[0];
}

export default function AmenazasTipos({
  amenazas,
  tipos,
  gradosDegradacion,
  gradosFrecuencia,
  dimensiones,
  nombresDimension,
}: Props) {
  const [tipoSel, setTipoSel] = useState(tipos[0]?.codigo ?? '');
  const [borrador, setBorrador] = useState<Borrador>({});
  // Flipped applicability, keyed by threat and type. A key that is absent falls back to
  // the published verdict, so discarding is a reset and never a rewrite.
  const [relaciones, setRelaciones] = useState<Record<string, boolean>>({});
  const [mostrarNoAplican, setMostrarNoAplican] = useState(false);
  const [avisoPublicar, setAvisoPublicar] = useState(false);
  /// Row-click opens the amenaza–tipo relation form. The draft flow is the same: the
  /// popup writes to `borrador` / `relaciones` and the screen publishes on save.
  const [detalle, setDetalle] = useState<string | null>(null);

  const clave = (amenaza: string, tipo: string) => `${amenaza}\u0000${tipo}`;

  const aplica = (a: AmenazaVista, tipo: string) =>
    relaciones[clave(a.codigo, tipo)] ?? a.tipos[tipo] ?? false;

  /// The blast radius of editing this row: degradation and frequency are attributes of
  /// the threat, so a change reaches every type in this count, not only the one on
  /// screen. Counted against the staged relations, because flipping one moves it.
  const alcance = (a: AmenazaVista) => tipos.filter((t) => aplica(a, t.codigo)).length;

  const valorDe = (a: AmenazaVista, campo: string) =>
    borrador[a.codigo]?.[campo] ??
    (campo === CAMPO_FRECUENCIA ? a.frecuencia : (a.degradacion[campo] ?? 'No aplica'));

  const publicadoDe = (a: AmenazaVista, campo: string) =>
    campo === CAMPO_FRECUENCIA ? a.frecuencia : (a.degradacion[campo] ?? 'No aplica');

  // Deviation is a comparison, not the presence of a draft entry: picking the published
  // value back from the select must clear the orange mark.
  const desviado = (a: AmenazaVista, campo: string) => valorDe(a, campo) !== publicadoDe(a, campo);

  const editar = (codigo: string, campo: string, valor: string) =>
    setBorrador((b) => ({ ...b, [codigo]: { ...b[codigo], [campo]: valor } }));

  const campos = useMemo(
    () => [...dimensiones.map((d) => d.codigo), CAMPO_FRECUENCIA],
    [dimensiones],
  );

  const valoresSinPublicar = amenazas.reduce(
    (suma, a) => suma + campos.filter((campo) => desviado(a, campo)).length,
    0,
  );

  const relacionesSinPublicar = useMemo(
    () =>
      Object.entries(relaciones).filter(([k, v]) => {
        const [codigo, tipo] = k.split('\u0000');
        return amenazas.find((a) => a.codigo === codigo)?.tipos[tipo] !== v;
      }).length,
    [relaciones, amenazas],
  );

  const sinPublicar = valoresSinPublicar + relacionesSinPublicar;

  const filas = amenazas.filter((a) => aplica(a, tipoSel));
  const noAplican = amenazas.filter((a) => !aplica(a, tipoSel));
  const tipoActual = tipos.find((t) => t.codigo === tipoSel);

  const descartar = () => {
    setBorrador({});
    setRelaciones({});
    setAvisoPublicar(false);
  };

  return (
    <main className="px-8 pt-6 pb-14">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pagina">Amenazas y tipos de activo</h1>
          <p className="mt-1 font-mono text-10_5 tracking-[0.06em] text-faint">
            MET-SIG-01 §7.4 · CATÁLOGO MAGERIT · {amenazas.length} AMENAZAS ×{' '}
            {tipos.length} TIPOS
          </p>
          <p className="parrafo mt-2 text-muted">
            Parametrización que alimenta la ficha del activo: qué amenazas se
            preclasifican para cada tipo, y con qué degradación y frecuencia
            recomendadas llegan. La degradación es atributo de la amenaza, no del par:
            editarla aquí alcanza a todos los tipos a los que esa amenaza aplica.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={descartar}
            disabled={sinPublicar === 0}
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-secondary hover:bg-app disabled:cursor-not-allowed disabled:text-placeholder"
          >
            Descartar cambios
          </button>
          <button
            onClick={() => setAvisoPublicar(true)}
            disabled={sinPublicar === 0}
            className="rounded-campo bg-accent-500 px-3.5 py-2 text-12_5 font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-hairline disabled:text-placeholder"
          >
            Publicar parametrización
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-[7px] border border-accent-border bg-accent-100 py-1.5 pr-1.5 pl-3">
          <span className="font-mono text-9_5 tracking-[0.06em] text-accent-700 uppercase">
            Tipo de activo
          </span>
          <select
            value={tipoSel}
            onChange={(e) => setTipoSel(e.target.value)}
            className="max-w-[280px] rounded-[5px] border border-accent-border bg-surface px-2 py-1 text-12_5 font-semibold text-accent-700 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          >
            {tipos.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <span className="text-12 text-faint">
          <span className="font-mono text-secondary">{filas.length}</span> amenazas
          preclasificadas para este tipo · {noAplican.length} marcadas como no aplicables
        </span>

        <button
          onClick={() => setMostrarNoAplican((v) => !v)}
          className="rounded-campo border border-dashed border-accent-border bg-accent-50 px-3 py-1.5 text-12 font-semibold text-accent-700 hover:bg-accent-100"
        >
          {mostrarNoAplican ? '× Cerrar el listado' : '+ Relacionar amenaza con este tipo'}
        </button>

        {sinPublicar > 0 && (
          <span className="rounded-badge border border-warn-border bg-warn-100 px-2.5 py-1 font-mono text-10 text-warn-text">
            ◆ {sinPublicar} sin publicar
            {valoresSinPublicar > 0 && ` · ${valoresSinPublicar} valores`}
            {relacionesSinPublicar > 0 && ` · ${relacionesSinPublicar} relaciones`}
          </span>
        )}
      </div>

      {avisoPublicar && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-campo border border-warn-border bg-warn-100 px-4 py-2.5">
          <span className="text-12 text-warn-text">
            Los cambios están en borrador de cliente. Todavía no existe tabla de versión
            publicada contra borrador, así que publicar no persiste nada: al recargar la
            página vuelven los valores del catálogo.
          </span>
          <button
            onClick={() => setAvisoPublicar(false)}
            className="rounded-campo border border-warn-border px-3 py-1 font-mono text-10_5 tracking-[0.1em] text-warn-text uppercase hover:bg-surface"
          >
            Entendido
          </button>
        </div>
      )}

      {mostrarNoAplican && (
        <section className="mb-4 rounded-tarjeta border border-border-default bg-subtle p-4">
          <p className="etiqueta-campo">
            No aplicables a {tipoActual?.codigo} {tipoActual?.nombre}
          </p>
          <p className="parrafo mt-1.5 text-11 text-muted">
            La aplicabilidad está registrada para las diez parejas de cada amenaza, así
            que estas no son huecos: alguien dictaminó que no aplican. Relacionar una
            vuelve a poner la pareja en Sí; la fila nunca se borra.
          </p>
          {noAplican.length === 0 ? (
            <p className="mt-3 text-11_5 text-faint">
              Todas las amenazas del catálogo aplican a este tipo.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {noAplican.map((a) => (
                <li
                  key={a.codigo}
                  className="flex items-center justify-between gap-3 rounded-campo border border-border-default bg-surface px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-11 font-semibold text-accent-500">
                      {a.codigo}
                    </span>
                    <span className="ml-2 text-11_5 text-secondary">{a.nombre}</span>
                    <span className="mt-0.5 block font-mono text-9_5 text-faint">
                      aplica hoy a {alcance(a)} de {tipos.length} tipos
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      setRelaciones((r) => ({ ...r, [clave(a.codigo, tipoSel)]: true }))
                    }
                    title={`Relacionar ${a.codigo} con ${tipoActual?.nombre}`}
                    className="shrink-0 rounded-campo border border-dashed border-accent-border bg-accent-50 px-2.5 py-1 font-mono text-10 font-semibold text-accent-700 hover:bg-accent-100"
                  >
                    + Relacionar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
        <div style={{ minWidth: 1080 }}>
          <table className="w-full border-collapse text-12_5">
            <thead>
              <tr className="bg-subtle text-left">
                <Th ancho={66}>Cód.</Th>
                <Th>Amenaza</Th>
                <Th ancho={124}>Grupo</Th>
                {dimensiones.map((d) => (
                  <Th key={d.codigo} ancho={118} acento title={`Degradación en ${d.nombre}`}>
                    ◆ Deg {d.codigo}
                  </Th>
                ))}
                <Th ancho={176} acento>
                  ◆ Frecuencia
                </Th>
                <Th ancho={80} centrado title="Tipos de activo a los que la amenaza aplica">
                  Tipos
                </Th>
                <Th ancho={64} derecha>
                  Baja
                </Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => {
                const editada = campos.some((campo) => desviado(a, campo));
                const n = alcance(a);
                return (
                  // The row itself is not tinted: the warn background belongs to the
                  // select that changed, and tinting the row behind it would swallow
                  // exactly the mark the user needs to find. A left rule carries the
                  // row-level signal instead.
                  <tr
                    key={a.codigo}
                    onClick={() => setDetalle(a.codigo)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetalle(a.codigo);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Abrir la relación amenaza–tipo de ${a.codigo} ${a.nombre}`}
                    className="cursor-pointer border-t border-hairline align-top"
                    style={
                      editada
                        ? { boxShadow: 'inset 3px 0 0 0 var(--hf-warn-500)' }
                        : undefined
                    }
                  >
                    <Td>
                      <span className="font-mono text-11_5 font-semibold text-accent-500">
                        {a.codigo}
                      </span>
                    </Td>

                    <Td>
                      <span className="block pr-3">
                        <span className="text-12_5 font-medium text-primary">{a.nombre}</span>
                        {a.nota && (
                          <span
                            title={a.nota}
                            className="mt-0.5 block truncate text-11 text-label"
                          >
                            {a.nota}
                          </span>
                        )}
                        {editada && (
                          <span className="mt-1 inline-block rounded-badge border border-warn-border bg-surface px-1.5 py-0.5 font-mono text-9 tracking-[0.06em] text-warn-text uppercase">
                            ◆ Modificada sin publicar
                          </span>
                        )}
                      </span>
                    </Td>

                    <Td>
                      <span className="font-mono text-10 text-faint">{a.grupo}</span>
                    </Td>

                    {dimensiones.map((d) => (
                      <Td key={d.codigo}>
                        <Selector
                          valor={valorDe(a, d.codigo)}
                          publicado={publicadoDe(a, d.codigo)}
                          desviado={desviado(a, d.codigo)}
                          etiqueta={`Degradación en ${d.nombre} de ${a.codigo} ${a.nombre}`}
                          alcance={n}
                          onChange={(v) => editar(a.codigo, d.codigo, v)}
                          opciones={gradosDegradacion.map((g) => ({
                            valor: g.nombre,
                            texto: `${g.nombre} · ${cifra(g.factor, 2)}`,
                            titulo: g.lectura ?? undefined,
                          }))}
                        />
                        {a.reasignada?.dimension === d.codigo && (
                          <span
                            title={`Desviación declarada: MAGERIT dirige esta amenaza a ${
                              nombresDimension[a.reasignada.desde] ?? a.reasignada.desde
                            }, dimensión que Cuantico no valora. Se reasignó a ${
                              d.nombre
                            } para que su riesgo no desaparezca.`}
                            className="mt-1 block rounded-badge border border-accent-border bg-accent-100 px-1.5 py-0.5 font-mono text-9 text-accent-700"
                          >
                            ↳ desde{' '}
                            {nombresDimension[a.reasignada.desde] ?? a.reasignada.desde}
                          </span>
                        )}
                      </Td>
                    ))}

                    <Td>
                      <Selector
                        valor={valorDe(a, CAMPO_FRECUENCIA)}
                        publicado={publicadoDe(a, CAMPO_FRECUENCIA)}
                        desviado={desviado(a, CAMPO_FRECUENCIA)}
                        etiqueta={`Frecuencia esperada de ${a.codigo} ${a.nombre}`}
                        alcance={n}
                        onChange={(v) => editar(a.codigo, CAMPO_FRECUENCIA, v)}
                        opciones={gradosFrecuencia.map((f) => ({
                          valor: f.nombre,
                          texto: `${gradoCorto(f.nombre)} · ${cifra(f.vecesAno)}/año`,
                          titulo: f.nombre,
                        }))}
                      />
                    </Td>

                    <Td centrado>
                      <span
                        title={`Editar la degradación o la frecuencia de ${a.codigo} alcanza a estos ${n} tipos de activo, no solo al que está en pantalla.`}
                        className="font-mono text-11_5 tabular-nums text-secondary"
                      >
                        {n}
                      </span>
                      {editada && (
                        <span className="mt-0.5 block font-mono text-9 text-warn-text">
                          alcanza {n}
                        </span>
                      )}
                    </Td>

                    <Td derecha>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRelaciones((r) => ({ ...r, [clave(a.codigo, tipoSel)]: false }));
                        }}
                        title={`Dar de baja la relación de ${a.codigo} con ${tipoActual?.nombre}. La pareja queda registrada como no aplicable, no se borra.`}
                        aria-label={`Dar de baja la relación de ${a.codigo} con ${tipoActual?.nombre}`}
                        className="h-6 w-6 rounded-campo border border-danger-border bg-surface text-13 leading-none text-danger-text hover:bg-danger-bg"
                      >
                        ×
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <p className="parrafo text-11 text-muted">
          <span className="font-mono text-warn-text">◆</span> La marca naranja, la
          etiqueta «modificada sin publicar» y el recuadro de la fila señalan lo mismo:
          el valor se apartó del publicado. La columna <b>Tipos</b> es el alcance real de
          esa edición — la degradación y la frecuencia cuelgan de la amenaza, así que el
          cambio llega a todos esos tipos y no solo al que está en pantalla. El selector
          de tipo únicamente acota lo que se muestra.
        </p>
        <p className="parrafo text-11 text-muted">
          <span className="font-mono text-accent-700">↳</span> Las amenazas con la marca
          de reasignación son la desviación declarada frente a MAGERIT: E.3, A.3, A.5 y
          A.13 apuntan a Autenticidad o Trazabilidad, dimensiones que Cuantico no valora,
          y se llevaron a Integridad para que su riesgo no desaparezca. La baja de una
          relación es lógica: la pareja pasa a «no aplica» y sigue en el registro.
        </p>
      </div>

      {detalle !== null && (() => {
        const a = amenazas.find((x) => x.codigo === detalle)!;
        const n = alcance(a);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setDetalle(null)}
          >
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-tarjeta border border-border-default bg-surface p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="etiqueta-campo">Relación amenaza–tipo · {a.codigo}</p>
              <p className="mt-1 text-12_5 font-semibold text-primary">{a.nombre}</p>
              <p className="mt-0.5 font-mono text-10 text-faint">{a.grupo}</p>
              {a.nota && <p className="mt-2 text-11_5 text-secondary">{a.nota}</p>}

              <p className="etiqueta-campo mt-4">Tipos de activo a los que aplica</p>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {tipos.map((t) => {
                  const si = aplica(a, t.codigo);
                  return (
                    <label
                      key={t.codigo}
                      className="flex items-center gap-2 rounded-campo border border-border-field px-2.5 py-1.5 text-11_5"
                    >
                      <input
                        type="checkbox"
                        checked={si}
                        onChange={() =>
                          setRelaciones((r) => ({
                            ...r,
                            [clave(a.codigo, t.codigo)]: !si,
                          }))
                        }
                        className="h-3.5 w-3.5 accent-[var(--hf-accent-500)]"
                      />
                      <span className="font-mono text-10 text-muted">{t.codigo}</span>
                      <span className="truncate">{t.nombre}</span>
                    </label>
                  );
                })}
              </div>

              <p className="etiqueta-campo mt-4">Degradación y frecuencia</p>
              <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {dimensiones.map((d) => (
                  <label key={d.codigo} className="block">
                    <span className="mb-0.5 block font-mono text-9_5 text-muted">
                      Degradación · {d.codigo}
                    </span>
                    <Selector
                      valor={valorDe(a, d.codigo)}
                      publicado={publicadoDe(a, d.codigo)}
                      desviado={desviado(a, d.codigo)}
                      etiqueta={`Degradación en ${d.nombre} de ${a.codigo} ${a.nombre}`}
                      alcance={n}
                      onChange={(v) => editar(a.codigo, d.codigo, v)}
                      opciones={gradosDegradacion.map((g) => ({
                        valor: g.nombre,
                        texto: `${g.nombre} · ${cifra(g.factor, 2)}`,
                        titulo: g.lectura ?? undefined,
                      }))}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-0.5 block font-mono text-9_5 text-muted">
                    Frecuencia
                  </span>
                  <Selector
                    valor={valorDe(a, CAMPO_FRECUENCIA)}
                    publicado={publicadoDe(a, CAMPO_FRECUENCIA)}
                    desviado={desviado(a, CAMPO_FRECUENCIA)}
                    etiqueta={`Frecuencia esperada de ${a.codigo} ${a.nombre}`}
                    alcance={n}
                    onChange={(v) => editar(a.codigo, CAMPO_FRECUENCIA, v)}
                    opciones={gradosFrecuencia.map((f) => ({
                      valor: f.nombre,
                      texto: `${gradoCorto(f.nombre)} · ${cifra(f.vecesAno)}/año`,
                      titulo: f.nombre,
                    }))}
                  />
                </label>
              </div>

              <p className="mt-4 text-10_5 text-faint">
                Los cambios quedan en el borrador de la pantalla: se publican con el
                botón «Publicar cambios».
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setDetalle(null)}
                  className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-subtle"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}

/// One editable cell. Deviation is carried three ways at once — border and background
/// in the warn family, the ◆ glyph, and the published value written underneath — so
/// colour is never the only thing saying it. The blast radius travels in the title,
/// because the reach of this select is not the row it sits in.
function Selector({
  valor,
  publicado,
  desviado,
  etiqueta,
  alcance,
  opciones,
  onChange,
}: {
  valor: string;
  publicado: string;
  desviado: boolean;
  etiqueta: string;
  alcance: number;
  opciones: { valor: string; texto: string; titulo?: string }[];
  onChange: (valor: string) => void;
}) {
  return (
    <>
      <select
        value={valor}
        aria-label={etiqueta}
        title={`${etiqueta}. Alcanza a los ${alcance} tipos a los que la amenaza aplica.`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-campo border px-2 py-1 text-11 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        style={
          desviado
            ? {
                borderColor: 'var(--hf-warn-500)',
                background: 'var(--hf-warn-100)',
                color: 'var(--hf-warn-text)',
              }
            : {
                borderColor: 'var(--hf-border-field)',
                background: 'var(--hf-bg-surface)',
                color: 'var(--hf-text-secondary)',
              }
        }
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} title={o.titulo}>
            {o.texto}
          </option>
        ))}
      </select>
      {desviado && (
        <span className="mt-0.5 block truncate font-mono text-9 text-warn-text">
          ◆ publicado: {gradoCorto(publicado)}
        </span>
      )}
    </>
  );
}

function Th({
  children,
  ancho,
  acento,
  centrado,
  derecha,
  title,
}: {
  children: React.ReactNode;
  ancho?: number;
  acento?: boolean;
  centrado?: boolean;
  derecha?: boolean;
  title?: string;
}) {
  return (
    <th
      title={title}
      style={{
        ...(ancho ? { width: ancho } : {}),
        ...(acento ? { color: 'var(--hf-accent-700)' } : {}),
        ...(centrado ? { textAlign: 'center' as const } : {}),
        ...(derecha ? { textAlign: 'right' as const } : {}),
      }}
      className="etiqueta-campo px-3 py-2.5 font-normal"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  centrado,
  derecha,
}: {
  children: React.ReactNode;
  centrado?: boolean;
  derecha?: boolean;
}) {
  return (
    <td className={`px-3 py-2 ${centrado ? 'text-center' : ''} ${derecha ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}
