'use client';

// app/components/sgsi/activos/PopupPlanCritico.tsx
//
// REQ-SIG-20 §7 (P2, D4, tarea 4.12) · se abre cuando un guardado deja el residual en banda
// Crítico. El guardado que lo disparó YA tuvo éxito antes de que este popup exista en
// pantalla — D17: «la aplicación registra y señala; no impide». Cerrar sin registrar no es
// un error: el riesgo queda «plan pendiente», con fecha, y la tarjeta SIN PLAN lo cuenta
// (spec `critical-risk-treatment-plan`, "Close without registering"). Nada se escribe al
// cerrar; `lib/sgsi/deuda-planes.ts` deriva ese estado la próxima vez que alguien mire.
//
// Prellena seis campos (spec "Popup prefill sources"): Control, Tipo (MITIGAR por defecto),
// Riesgo de origen, Madurez actual → objetivo, Responsable (editable) y Fecha. El plan
// resultante sigue siendo sobre el CONTROL — `AccionPlan.controlId` — y guarda de qué
// activo y qué amenaza nació con el prefijo verificable de `lib/sgsi/origen-plan.ts`; se
// publica en el módulo de planes de tratamiento que ya existe, nunca en una lista propia
// (tarea 4.19).

import { useEffect, useState, useTransition } from 'react';
import Popup, { PopupVacio } from '@/app/components/sgsi/Popup';
import {
  datosPrefillPlanCritico,
  registrarPlanCritico,
  type PrefillPlanCritico,
} from '@/app/sgsi/acciones/plan';
import type { TipoAccion } from '@prisma/client';

interface Props {
  activoCodigo: string;
  amenazaCodigo: string;
  onCerrar: () => void;
  /// Se llama tras un registro exitoso, además de `onCerrar` — para que quien la monta
  /// pueda refrescar la pantalla (`router.refresh()`) sin que este popup lo decida.
  onRegistrado?: (codigoAccion: string) => void;
}

const TIPOS: { valor: TipoAccion; etiqueta: string }[] = [
  { valor: 'MITIGAR', etiqueta: 'Mitigar' },
  { valor: 'TRANSFERIR', etiqueta: 'Transferir' },
  { valor: 'EVITAR', etiqueta: 'Evitar' },
  { valor: 'ACEPTAR', etiqueta: 'Aceptar' },
];

export default function PopupPlanCritico({
  activoCodigo,
  amenazaCodigo,
  onCerrar,
  onRegistrado,
}: Props) {
  const [prefill, setPrefill] = useState<PrefillPlanCritico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [tipo, setTipo] = useState<TipoAccion>('MITIGAR');
  const [responsableId, setResponsableId] = useState<number | null>(null);
  const [apruebaId, setApruebaId] = useState<number | null>(null);
  const [madurezObjetivoId, setMadurezObjetivoId] = useState<number | null>(null);
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [riesgoRemanente, setRiesgoRemanente] = useState('');
  const [justificacionAceptacion, setJustificacionAceptacion] = useState('');
  const [fechaRevisionAceptacion, setFechaRevisionAceptacion] = useState('');

  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    // Sin `setCargando(true)` acá: el estado ya arranca en `true`, y quien monta este
    // popup por cada activo/amenaza de la cola (tarea 4.16) le da una key nueva por
    // par — nunca reutiliza la instancia para el siguiente crítico — así que un efecto
    // que llamara `setState` de forma síncrona en su cuerpo (en vez de dentro del
    // callback async) sería trabajo en cascada evitable, no un estado que de verdad
    // necesite resincronizarse.
    let vigente = true;
    void datosPrefillPlanCritico(activoCodigo, amenazaCodigo).then((r) => {
      if (!vigente) return;
      setCargando(false);
      if (!r.ok || !r.datos) {
        setError(r.mensaje);
        return;
      }
      setPrefill(r.datos);
      setResponsableId(r.datos.responsable?.id ?? null);
      setApruebaId(r.datos.apruebaSugerido?.id ?? null);
      setMadurezObjetivoId(
        r.datos.madurezObjetivoSugerida !== null
          ? (r.datos.escalaMadurez.find((m) => m.nivel === r.datos!.madurezObjetivoSugerida)?.id ?? null)
          : null,
      );
      setFechaObjetivo(r.datos.fechaObjetivo ?? '');
    });
    return () => {
      vigente = false;
    };
  }, [activoCodigo, amenazaCodigo]);

  const vacio = (v: string) => v.trim() === '';

  const impedimentos: string[] = [];
  if (prefill && prefill.control === null && tipo === 'MITIGAR') {
    impedimentos.push('No hay ningún control mapeado a esta amenaza: mitigar no es posible sin uno.');
  }
  if (responsableId === null) impedimentos.push('Falta el responsable.');
  if (apruebaId === null) impedimentos.push('Falta quien aprueba.');
  if (tipo === 'TRANSFERIR') {
    if (vacio(instrumento)) impedimentos.push('Transferir necesita el instrumento.');
    if (vacio(riesgoRemanente)) impedimentos.push('Transferir necesita el riesgo remanente.');
  }
  if (tipo === 'ACEPTAR') {
    if (vacio(justificacionAceptacion)) {
      impedimentos.push('Aceptar necesita la justificación escrita.');
    }
    if (vacio(fechaRevisionAceptacion)) {
      impedimentos.push('Aceptar necesita fecha de revisión: sin ella la aceptación no vence nunca.');
    }
  }

  const registrar = (): void => {
    if (!prefill || responsableId === null || apruebaId === null) return;
    setAviso(null);
    iniciar(async () => {
      const r = await registrarPlanCritico({
        activoCodigo,
        amenazaCodigo,
        controlId: prefill.control?.id ?? null,
        tipo,
        responsableId,
        apruebaId,
        madurezObjetivoId,
        fechaObjetivo: fechaObjetivo || null,
        instrumento: tipo === 'TRANSFERIR' ? instrumento : null,
        riesgoRemanente: tipo === 'TRANSFERIR' ? riesgoRemanente : null,
        justificacionAceptacion: tipo === 'ACEPTAR' ? justificacionAceptacion : null,
        fechaRevisionAceptacion: tipo === 'ACEPTAR' ? fechaRevisionAceptacion : null,
      });
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok && r.codigo) {
        onRegistrado?.(r.codigo);
        onCerrar();
      }
    });
  };

  return (
    <Popup
      titulo="Residual crítico — registrar plan de tratamiento"
      subtitulo={`${activoCodigo} · ${amenazaCodigo} — el guardado ya se hizo; cerrar sin registrar deja el riesgo «plan pendiente».`}
      ancho={720}
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
            {pendiente ? 'Registrando…' : 'Registrar plan'}
          </button>
        </>
      }
    >
      {cargando && <PopupVacio>Cargando…</PopupVacio>}
      {!cargando && error && <PopupVacio>{error}</PopupVacio>}

      {!cargando && prefill && (
        <div className="flex flex-col gap-4">
          <div className="rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11_5 text-warn-text">
            El residual de <strong>{prefill.amenazaNombre}</strong> en <strong>{prefill.activoCodigo}</strong>{' '}
            quedó en banda Crítico. Registrar un plan no es obligatorio para que el guardado
            valga — ya valió — pero sin uno el riesgo queda marcado «plan pendiente» y sale en
            la franja de planes sin registrar.
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

          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Campo etiqueta="Control">
              <div className="rounded-campo border border-border-field bg-subtle px-2.5 py-1.5 text-12_5 text-secondary">
                {prefill.control ? `${prefill.control.codigo} · ${prefill.control.nombre}` : 'Sin control mapeado'}
              </div>
            </Campo>

            <Campo etiqueta="Tipo de tratamiento">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAccion)} className={entrada}>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Riesgo de origen">
            <div className="rounded-campo border border-border-field bg-subtle px-2.5 py-1.5 text-12_5 text-secondary">
              {prefill.riesgoCodigo} — {prefill.activoNombre} × {prefill.amenazaNombre}
            </div>
          </Campo>

          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Campo etiqueta="Madurez actual">
              <div className="rounded-campo border border-border-field bg-subtle px-2.5 py-1.5 text-12_5 text-secondary">
                {prefill.control?.madurezActual !== null && prefill.control?.madurezActual !== undefined
                  ? `L${prefill.control.madurezActual}`
                  : 'Sin evaluar'}
              </div>
            </Campo>

            <Campo etiqueta="Madurez objetivo">
              <select
                value={madurezObjetivoId ?? ''}
                onChange={(e) => setMadurezObjetivoId(e.target.value === '' ? null : Number(e.target.value))}
                className={entrada}
              >
                <option value="">Sin definir</option>
                {prefill.escalaMadurez.map((m) => (
                  <option key={m.id} value={m.id}>
                    L{m.nivel} — {m.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Campo etiqueta="Responsable">
              <select
                value={responsableId ?? ''}
                onChange={(e) => setResponsableId(e.target.value === '' ? null : Number(e.target.value))}
                className={entrada}
              >
                <option value="">Elegir…</option>
                {prefill.cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Quien aprueba">
              <select
                value={apruebaId ?? ''}
                onChange={(e) => setApruebaId(e.target.value === '' ? null : Number(e.target.value))}
                className={entrada}
              >
                <option value="">Elegir…</option>
                {prefill.cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Fecha objetivo" pie="Hoy + el plazo de ejecución de la banda Crítico.">
            <input
              type="date"
              value={fechaObjetivo}
              onChange={(e) => setFechaObjetivo(e.target.value)}
              className={entrada}
            />
          </Campo>

          {tipo === 'TRANSFERIR' && (
            <div className="grid gap-4 rounded-campo border border-border-default bg-subtle p-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Campo etiqueta="Instrumento de transferencia">
                <input
                  value={instrumento}
                  onChange={(e) => setInstrumento(e.target.value)}
                  placeholder="Póliza, contrato, cláusula…"
                  className={entrada}
                />
              </Campo>
              <Campo etiqueta="Riesgo remanente">
                <input
                  value={riesgoRemanente}
                  onChange={(e) => setRiesgoRemanente(e.target.value)}
                  placeholder="Qué queda después de transferir"
                  className={entrada}
                />
              </Campo>
            </div>
          )}

          {tipo === 'ACEPTAR' && (
            <div className="rounded-campo border border-border-default bg-subtle p-3">
              <Campo etiqueta="Justificación de la aceptación">
                <textarea
                  value={justificacionAceptacion}
                  onChange={(e) => setJustificacionAceptacion(e.target.value)}
                  rows={2}
                  className={entrada}
                />
              </Campo>
              <div className="mt-3">
                <Campo
                  etiqueta="Fecha de revisión"
                  pie="Una aceptación sin fecha de revisión no caduca nunca, y eso no se admite."
                >
                  <input
                    type="date"
                    value={fechaRevisionAceptacion}
                    onChange={(e) => setFechaRevisionAceptacion(e.target.value)}
                    className={entrada}
                  />
                </Campo>
              </div>
            </div>
          )}
        </div>
      )}
    </Popup>
  );
}

const entrada =
  'w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12_5 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300';

function Campo({
  etiqueta,
  pie,
  children,
}: {
  etiqueta: string;
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      {children}
      {pie && <span className="text-10 leading-snug text-faint [text-wrap:pretty]">{pie}</span>}
    </label>
  );
}
