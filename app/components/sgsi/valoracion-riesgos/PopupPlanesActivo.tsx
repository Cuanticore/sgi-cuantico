'use client';

// app/components/sgsi/valoracion-riesgos/PopupPlanesActivo.tsx
//
// Registrar planes de tratamiento DESDE la grilla de Análisis de riesgos, para una amenaza,
// varias o todas las del activo.
//
// ── POR QUÉ ACÁ Y NO EN LA FICHA DEL ACTIVO ─────────────────────────────────────────────
//
// El plan tiene que nacer donde se ve la brecha. El otro camino —ficha del activo, pestaña
// Amenazas, fila, popup— obliga a entrar al activo y repetir el recorrido por cada amenaza:
// el trabajo se ve en esta lista y se hacía en otra pantalla. Ese popup sigue existiendo para
// el caso puntual; éste es el que sirve cuando hay doce amenazas que atender.
//
// ── LO QUE SE ELIGE Y LO QUE SE CREA NO SON LA MISMA UNIDAD ─────────────────────────────
//
// Se marcan AMENAZAS y se crean PLANES, y un plan es sobre un CONTROL. Doce amenazas cuyos
// principales son tres controles producen TRES planes. El resumen lo dice ANTES de registrar,
// y lo calcula `agruparAmenazasEnPlanes` — la MISMA función que después ejecuta el servidor,
// no una cuenta parecida hecha acá. Si el popup promete tres planes y el servidor crea otra
// cosa, el popup deja de ser una previsualización y pasa a ser una suposición.

import { useEffect, useMemo, useState, useTransition } from 'react';
import Popup, { PopupVacio } from '@/app/components/sgsi/Popup';
import {
  datosPrefillPlanesActivo,
  registrarPlanesActivo,
  type PrefillPlanesActivo,
} from '@/app/sgsi/acciones/plan';
import { agruparAmenazasEnPlanes } from '@/lib/sgsi/planes-por-amenaza';
import type { TipoAccion } from '@prisma/client';

interface Props {
  activoCodigo: string;
  onCerrar: () => void;
  /// Se llama tras un registro exitoso, para que quien lo monta refresque la pantalla sin
  /// que este popup decida cómo.
  onRegistrado?: (codigos: string[]) => void;
}

const TIPOS: { valor: TipoAccion; etiqueta: string }[] = [
  { valor: 'MITIGAR', etiqueta: 'Mitigar' },
  { valor: 'TRANSFERIR', etiqueta: 'Transferir' },
  { valor: 'EVITAR', etiqueta: 'Evitar' },
  { valor: 'ACEPTAR', etiqueta: 'Aceptar' },
];

/// Por qué una amenaza no tiene brecha. Sin esto la celda queda vacía y se lee como «no
/// falta nada», que es distinto de «no se pudo evaluar».
const LECTURA_ESTADO: Record<string, string> = {
  cubierto: 'El principal ya alcanza lo exigido',
  'sin-exigencia': 'Ni la criticidad ni las dimensiones exigen nivel',
  'sin-principal': 'La amenaza no tiene control principal designado',
  'principal-sin-evaluar': 'El principal está designado pero sin evaluar',
  'brecha-de-verificacion': 'El nivel alcanza; falta la verificación de eficacia',
  'verificacion-sin-determinar': 'No se pudo determinar si hay verificación vigente',
};

const entrada =
  'w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300';

export default function PopupPlanesActivo({ activoCodigo, onCerrar, onRegistrado }: Props) {
  const [prefill, setPrefill] = useState<PrefillPlanesActivo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<TipoAccion>('MITIGAR');
  const [responsableId, setResponsableId] = useState<number>(0);
  const [apruebaId, setApruebaId] = useState<number>(0);
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [fechaRevision, setFechaRevision] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [remanente, setRemanente] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    // Sin `setCargando(true)` acá: el estado inicial YA es «cargando», y quien monta este
    // popup le pasa el código como `key`, así que cambiar de activo lo remonta en vez de
    // reusarlo con los datos del anterior a la vista.
    let vigente = true;
    datosPrefillPlanesActivo(activoCodigo)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok || r.datos === null) {
          setError(r.mensaje);
          return;
        }
        setPrefill(r.datos);
        setResponsableId(r.datos.responsable?.id ?? 0);
        setApruebaId(r.datos.apruebaSugerido?.id ?? 0);
        setFechaObjetivo(r.datos.fechaObjetivo ?? '');
        // Se abren marcadas las que tienen brecha de NIVEL y no están cubiertas: es lo que
        // alguien viene a hacer al abrir esto. Nunca se marca lo que ya tiene plan.
        setMarcadas(
          new Set(
            r.datos.amenazas
              .filter((a) => a.brecha !== null && a.planExistente === null)
              .map((a) => a.amenazaCodigo),
          ),
        );
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el prellenado.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [activoCodigo]);

  // La MISMA agrupación que hará el servidor. Ver la cabecera del archivo.
  const agrupacion = useMemo(() => {
    if (prefill === null) return { grupos: [], excluidas: [] };
    return agruparAmenazasEnPlanes(
      prefill.amenazas
        .filter((a) => marcadas.has(a.amenazaCodigo))
        .map((a) => ({
          amenazaCodigo: a.amenazaCodigo,
          amenazaNombre: a.amenazaNombre,
          principalCodigo: a.principalCodigo,
          principalNombre: a.principalNombre,
          brecha: a.brecha,
          planExistente: a.planExistente,
        })),
    );
  }, [prefill, marcadas]);

  const impedimentos: string[] = [];
  if (responsableId === 0) impedimentos.push('Falta el responsable.');
  if (apruebaId === 0) impedimentos.push('Falta quien aprueba.');
  if (marcadas.size === 0) impedimentos.push('No hay ninguna amenaza marcada.');
  if (agrupacion.grupos.length === 0 && marcadas.size > 0) {
    impedimentos.push('Ninguna de las amenazas marcadas produce un plan nuevo.');
  }
  if (tipo === 'ACEPTAR' && justificacion.trim() === '') {
    impedimentos.push('Aceptar necesita la justificación.');
  }
  if (tipo === 'ACEPTAR' && fechaRevision === '') {
    impedimentos.push('Aceptar necesita fecha de revisión.');
  }
  if (tipo === 'TRANSFERIR' && instrumento.trim() === '') {
    impedimentos.push('Transferir necesita el instrumento.');
  }
  if (tipo === 'TRANSFERIR' && remanente.trim() === '') {
    impedimentos.push('Transferir necesita el riesgo remanente.');
  }

  const alternar = (codigo: string) => {
    setMarcadas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(codigo)) siguiente.delete(codigo);
      else siguiente.add(codigo);
      return siguiente;
    });
  };

  const registrar = () => {
    if (prefill === null) return;
    empezar(async () => {
      const r = await registrarPlanesActivo({
        activoCodigo,
        amenazaCodigos: [...marcadas],
        tipo,
        responsableId,
        apruebaId,
        fechaObjetivo: fechaObjetivo === '' ? null : fechaObjetivo,
        justificacionAceptacion: tipo === 'ACEPTAR' ? justificacion : null,
        fechaRevisionAceptacion: tipo === 'ACEPTAR' && fechaRevision !== '' ? fechaRevision : null,
        instrumento: tipo === 'TRANSFERIR' ? instrumento : null,
        riesgoRemanente: tipo === 'TRANSFERIR' ? remanente : null,
      });
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok && r.creados.length > 0) {
        onRegistrado?.(r.creados.map((c) => c.codigo));
        onCerrar();
      }
    });
  };

  const conBrecha = prefill?.amenazas.filter((a) => a.brecha !== null && a.planExistente === null) ?? [];

  return (
    <Popup
      titulo={
        prefill ? `Planes de tratamiento · ${prefill.activoCodigo}` : 'Planes de tratamiento'
      }
      subtitulo={prefill?.activoNombre}
      // Más ancho que el popup del plan puntual: acá la tabla de amenazas lleva seis
      // columnas y el control principal no puede quedar cortado, que es el dato con el que
      // se decide qué marcar.
      ancho={860}
      onCerrar={onCerrar}
      pie={
        <>
          {aviso && (
            <span
              className="mr-auto text-11_5"
              style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
            >
              {aviso.texto}
            </span>
          )}
          <button
            onClick={onCerrar}
            className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-subtle"
          >
            Cerrar sin registrar
          </button>
          <button
            onClick={registrar}
            disabled={pendiente || cargando || !prefill || impedimentos.length > 0}
            title={impedimentos.length > 0 ? impedimentos.join(' · ') : undefined}
            className="rounded-campo px-3.5 py-1.5 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {pendiente
              ? 'Registrando…'
              : `Registrar ${agrupacion.grupos.length} ${agrupacion.grupos.length === 1 ? 'plan' : 'planes'}`}
          </button>
        </>
      }
    >
      {cargando && <PopupVacio>Cargando…</PopupVacio>}
      {!cargando && error && <PopupVacio>{error}</PopupVacio>}

      {!cargando && prefill && (
        <div className="flex flex-col gap-4">
          <Resumen agrupacion={agrupacion} marcadas={marcadas.size} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMarcadas(new Set(conBrecha.map((a) => a.amenazaCodigo)))}
              className="rounded-campo border border-border-field px-2.5 py-1 text-11_5 text-secondary-soft hover:bg-subtle"
            >
              Sólo las que tienen brecha ({conBrecha.length})
            </button>
            <button
              onClick={() =>
                setMarcadas(
                  new Set(
                    prefill.amenazas.filter((a) => a.planExistente === null).map((a) => a.amenazaCodigo),
                  ),
                )
              }
              className="rounded-campo border border-border-field px-2.5 py-1 text-11_5 text-secondary-soft hover:bg-subtle"
            >
              Todas las amenazas sin plan
            </button>
            <button
              onClick={() => setMarcadas(new Set())}
              className="rounded-campo border border-border-field px-2.5 py-1 text-11_5 text-secondary-soft hover:bg-subtle"
            >
              Ninguna
            </button>
          </div>

          <div className="tabla-ancha max-h-[280px] overflow-y-auto rounded-campo border border-border-default">
            <table className="w-full border-collapse text-11_5">
              <thead className="sticky top-0 bg-subtle">
                <tr className="border-b border-hairline-strong">
                  <th className="w-[34px] py-1.5"></th>
                  <th className="etiqueta-campo py-1.5 pr-2 text-left">Amenaza</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Control principal</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-right">Brecha</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Residual</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Plan</th>
                </tr>
              </thead>
              <tbody>
                {prefill.amenazas.map((a) => {
                  const bloqueada = a.planExistente !== null;
                  return (
                    <tr key={a.amenazaCodigo} className="border-b border-hairline-faint">
                      <td className="py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={marcadas.has(a.amenazaCodigo)}
                          disabled={bloqueada}
                          onChange={() => alternar(a.amenazaCodigo)}
                          aria-label={`Marcar ${a.amenazaCodigo}`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="font-mono font-semibold text-accent-500">
                          {a.amenazaCodigo}
                        </span>{' '}
                        <span className="text-secondary">{a.amenazaNombre}</span>
                      </td>
                      <td className="px-2 py-1.5 text-secondary">
                        {a.principalCodigo === null ? (
                          <span className="text-faint">sin designar</span>
                        ) : (
                          <>
                            <span className="font-mono">{a.principalCodigo}</span>
                            <span className="text-faint">
                              {' '}
                              · {a.principalNivel === null ? 'sin evaluar' : `${a.principalNivel} %`}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {a.brecha === null ? (
                          <span className="text-faint" title={LECTURA_ESTADO[a.estadoBrecha] ?? a.estadoBrecha}>
                            —
                          </span>
                        ) : (
                          <span className="font-semibold text-warn-text">{a.brecha}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-secondary">{a.bandaResidual ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        {a.planExistente === null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <a
                            href={`/sgsi/planes#${a.planExistente}`}
                            className="font-mono text-brand-nav underline decoration-from-font underline-offset-2"
                          >
                            {a.planExistente}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Campo etiqueta="Tipo de tratamiento">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoAccion)}
                className={entrada}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Responsable">
              <select
                value={responsableId}
                onChange={(e) => setResponsableId(Number(e.target.value))}
                className={entrada}
              >
                <option value={0}>Elegir…</option>
                {prefill.cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Aprueba">
              <select
                value={apruebaId}
                onChange={(e) => setApruebaId(Number(e.target.value))}
                className={entrada}
              >
                <option value={0}>Elegir…</option>
                {prefill.cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Fecha objetivo">
              <input
                type="date"
                value={fechaObjetivo}
                onChange={(e) => setFechaObjetivo(e.target.value)}
                className={entrada}
              />
            </Campo>

            {tipo === 'ACEPTAR' && (
              <>
                <Campo etiqueta="Justificación de la aceptación">
                  <input
                    value={justificacion}
                    onChange={(e) => setJustificacion(e.target.value)}
                    className={entrada}
                  />
                </Campo>
                <Campo etiqueta="Fecha de revisión">
                  <input
                    type="date"
                    value={fechaRevision}
                    onChange={(e) => setFechaRevision(e.target.value)}
                    className={entrada}
                  />
                </Campo>
              </>
            )}

            {tipo === 'TRANSFERIR' && (
              <>
                <Campo etiqueta="Instrumento">
                  <input
                    value={instrumento}
                    onChange={(e) => setInstrumento(e.target.value)}
                    className={entrada}
                  />
                </Campo>
                <Campo etiqueta="Riesgo remanente">
                  <input
                    value={remanente}
                    onChange={(e) => setRemanente(e.target.value)}
                    className={entrada}
                  />
                </Campo>
              </>
            )}
          </div>

          {impedimentos.length > 0 && (
            <div className="flex flex-col gap-1 rounded-campo border border-border-default bg-subtle px-3 py-2">
              {impedimentos.map((m) => (
                <span key={m} className="text-11_5 text-muted">
                  · {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Popup>
  );
}

/// Lo que va a pasar, antes de que pase: cuántos planes, sobre qué controles, y qué amenazas
/// marcadas no producen ninguno.
function Resumen({
  agrupacion,
  marcadas,
}: {
  agrupacion: ReturnType<typeof agruparAmenazasEnPlanes>;
  marcadas: number;
}) {
  const { grupos, excluidas } = agrupacion;
  return (
    <div className="rounded-campo border border-border-default bg-subtle px-3 py-2.5">
      <p className="text-12_5 text-secondary">
        <strong>{marcadas}</strong> {marcadas === 1 ? 'amenaza marcada' : 'amenazas marcadas'} ·{' '}
        <strong>{grupos.length}</strong> {grupos.length === 1 ? 'plan' : 'planes'} a registrar.
      </p>
      {grupos.length > 0 && (
        <p className="mt-1 text-11_5 text-muted">
          Un plan es sobre un control, así que varias amenazas con el mismo control principal
          comparten plan:{' '}
          {grupos
            .map((g) => `${g.principalCodigo} (${g.amenazas.length})`)
            .join(' · ')}
          .
        </p>
      )}
      {excluidas.length > 0 && (
        <p className="mt-1 text-11_5 text-warn-text">
          {excluidas.length}{' '}
          {excluidas.length === 1 ? 'amenaza marcada no produce plan' : 'amenazas marcadas no producen plan'}:{' '}
          {excluidas
            .map(
              (e) =>
                `${e.amenaza.amenazaCodigo} (${
                  e.motivo === 'ya-cubierta' ? `ya la cubre ${e.amenaza.planExistente}` : 'sin control principal'
                })`,
            )
            .join(' · ')}
          .
        </p>
      )}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo text-9_5">{etiqueta}</span>
      {children}
    </label>
  );
}
