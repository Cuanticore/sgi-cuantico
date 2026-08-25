'use client';

// app/components/sgsi/controles/PopupControl.tsx
//
// Handoff v2.1, the control administration popup on screen 5.
//
// Its point is that a maturity level is not an opinion: the three version cards show
// where the control started, where it is and where it is meant to be, the efficacy is
// clickable and opens the arithmetic that produced it, and the evidence is right there —
// because without evidence the level does not hold up to an auditor.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Popup, { PopupVacio } from '@/app/components/sgsi/Popup';
import { EFICACIA_POR_NIVEL, eficaciaDeNivel } from '@/lib/sgsi/madurez';
import {
  agregarEvidencias,
  guardarMadurez,
  guardarMadurezObjetivo,
  quitarEvidencia,
  type TipoEvidencia,
} from '@/app/sgsi/acciones/controles';
import { crearAccionDesdeControl } from '@/app/sgsi/acciones/plan';
import type { ControlVista } from './ControlesMadurez';

const ESCALA = [
  { nivel: 0, nombre: 'Inexistente' },
  { nivel: 1, nombre: 'Inicial / ad hoc' },
  { nivel: 2, nombre: 'Reproducible pero intuitivo' },
  { nivel: 3, nombre: 'Proceso definido' },
  { nivel: 4, nombre: 'Gestionado y medible' },
  { nivel: 5, nombre: 'Optimizado' },
];

const TIPOS: { valor: TipoEvidencia; etiqueta: string }[] = [
  { valor: 'ENLACE', etiqueta: 'Enlace' },
  { valor: 'ARCHIVO', etiqueta: 'Archivo' },
  { valor: 'NOTA', etiqueta: 'Nota' },
];

function semaforo(nivel: number | null) {
  if (nivel === null) {
    return { fg: 'var(--hf-cmm-nulo-fg)', bg: 'var(--hf-cmm-nulo-bg)', bd: 'var(--hf-cmm-nulo-bd)' };
  }
  if (nivel <= 1) {
    return { fg: 'var(--hf-cmm-rojo-fg)', bg: 'var(--hf-cmm-rojo-bg)', bd: 'var(--hf-cmm-rojo-bd)' };
  }
  if (nivel <= 3) {
    return {
      fg: 'var(--hf-cmm-naranja-fg)',
      bg: 'var(--hf-cmm-naranja-bg)',
      bd: 'var(--hf-cmm-naranja-bd)',
    };
  }
  return { fg: 'var(--hf-cmm-verde-fg)', bg: 'var(--hf-cmm-verde-bg)', bd: 'var(--hf-cmm-verde-bd)' };
}

const nivelTexto = (v: number | null) => (v === null ? '—' : `L${v}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function PopupControl({
  control,
  onCerrar,
}: {
  control: ControlVista;
  onCerrar: () => void;
}) {
  const [nivel, setNivel] = useState<number | null>(control.actual);
  const [objetivo, setObjetivo] = useState<number | null>(control.objetivo);
  const [tipo, setTipo] = useState<TipoEvidencia>('ENLACE');
  const [lote, setLote] = useState('');
  const [motivoQuitar, setMotivoQuitar] = useState<Record<number, string>>({});
  const [verFormulas, setVerFormulas] = useState(false);
  const [verEquivalencia, setVerEquivalencia] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const correr = (op: () => Promise<{ ok: boolean; mensaje: string }>) =>
    iniciar(async () => {
      const r = await op();
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) router.refresh();
    });

  const avance =
    control.lineaBase !== null && nivel !== null ? nivel - control.lineaBase : null;
  // Both read from the edited values, not from the props, so dragging either select moves
  // the gap live instead of waiting for a round trip.
  const brecha = objetivo !== null && nivel !== null ? Math.max(0, objetivo - nivel) : null;
  const cambioNivel = nivel !== null && nivel !== control.actual;
  const cambioObjetivo = objetivo !== control.objetivo;

  const versiones = [
    { titulo: 'Versión inicial', sub: 'línea base', nivel: control.lineaBase, actual: false },
    { titulo: 'Madurez actual', sub: 'en evaluación', nivel, actual: true },
    { titulo: 'Versión objetivo', sub: 'aprobada', nivel: objetivo, actual: false },
  ];

  return (
    <Popup
      titulo={`${control.codigo} · ${control.nombre}`}
      subtitulo={`${control.dominio} · ${control.capacidad}`}
      ancho={880}
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
            Cerrar
          </button>
          {control.aplica && (
            <button
              onClick={() =>
                correr(() => guardarMadurez([{ codigoControl: control.codigo, nivel: nivel! }]))
              }
              disabled={pendiente || !cambioNivel}
              title={!cambioNivel ? 'La madurez no cambió' : undefined}
              className="rounded-campo px-3.5 py-1.5 text-12_5 font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              {pendiente ? 'Guardando…' : 'Guardar la madurez'}
            </button>
          )}
        </>
      }
    >
      {!control.aplica && (
        <div className="mb-4 rounded-campo border border-border-default bg-subtle p-3">
          <p className="etiqueta-campo">No aplica · justificación aprobada</p>
          <p className="parrafo mt-1 text-11_5">{control.justificacion}</p>
          <p className="mt-2 text-11 text-faint">
            Un control que no aplica queda excluido de todos los promedios, pero no se
            borra: su no aplicabilidad es una decisión que el Comité aprueba y que un
            auditor revisa.
          </p>
        </div>
      )}

      {/* Three cards with the CMM traffic light; the current one carries a 2px border. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {versiones.map((v) => {
          const s = semaforo(v.nivel);
          return (
            <div
              key={v.titulo}
              className="rounded-tarjeta p-3"
              style={{
                background: s.bg,
                border: v.actual ? `2px solid ${s.fg}` : `1px solid ${s.bd}`,
              }}
            >
              <p className="etiqueta-campo" style={{ color: s.fg }}>
                {v.titulo}
              </p>
              <p className="mt-0.5 text-9_5" style={{ color: s.fg, opacity: 0.75 }}>
                {v.sub}
              </p>
              <p className="cifra mt-1.5 text-22" style={{ color: s.fg }}>
                {nivelTexto(v.nivel)}
              </p>
              <p className="mt-0.5 font-mono text-10" style={{ color: s.fg }}>
                eficacia {pct(eficaciaDeNivel(v.nivel))}
              </p>
            </div>
          );
        })}
      </div>

      {control.aplica && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Madurez actual</span>
            {/* Tinted with the level's own colour, so the select says what it means before
                you read it. */}
            <select
              value={nivel ?? 0}
              onChange={(e) => setNivel(Number(e.target.value))}
              style={{
                color: semaforo(nivel).fg,
                background: semaforo(nivel).bg,
                borderColor: semaforo(nivel).bd,
              }}
              className="w-[280px] rounded-campo border px-2.5 py-1.5 font-mono text-11_5 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              {ESCALA.map((e) => (
                <option key={e.nivel} value={e.nivel}>
                  L{e.nivel} — {e.nombre} · {pct(EFICACIA_POR_NIVEL[e.nivel])}
                </option>
              ))}
            </select>
          </label>

          {/* The Committee's commitment, and the thing «brecha» is measured against. Kept
              visually plainer than the current level and saved with its own button: the
              current level is an assessment, the target is a decision, and lowering a
              target to meet the level is how a gap disappears with nothing improved. */}
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Madurez objetivo</span>
            <select
              value={objetivo === null ? '' : String(objetivo)}
              onChange={(e) => setObjetivo(e.target.value === '' ? null : Number(e.target.value))}
              className="w-[280px] rounded-campo border border-border-field bg-surface px-2.5 py-1.5 font-mono text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              <option value="">— sin objetivo —</option>
              {ESCALA.map((e) => (
                <option key={e.nivel} value={e.nivel}>
                  L{e.nivel} — {e.nombre} · {pct(EFICACIA_POR_NIVEL[e.nivel])}
                </option>
              ))}
            </select>
          </label>

          {cambioObjetivo && (
            <button
              onClick={() =>
                correr(() => guardarMadurezObjetivo(control.codigo, objetivo))
              }
              disabled={pendiente}
              className="rounded-campo border border-accent-500 bg-accent-100 px-3 py-1.5 text-11_5 font-semibold text-accent-700 disabled:opacity-50"
            >
              {pendiente ? 'Guardando…' : 'Guardar el objetivo'}
            </button>
          )}

          <p className="text-11_5 text-muted">
            avance{' '}
            <span className="font-mono text-secondary">
              {avance === null ? '—' : avance > 0 ? `+${avance}` : avance < 0 ? `−${Math.abs(avance)}` : '0'}
            </span>{' '}
            · brecha <span className="font-mono text-secondary">{brecha ?? '—'}</span>
          </p>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setVerEquivalencia(true)}
              className="rounded-campo border border-border-field px-2.5 py-1.5 font-mono text-10_5 text-accent-700 hover:bg-accent-50"
            >
              equivalencia de niveles
            </button>
            <button
              onClick={() => setVerFormulas((v) => !v)}
              className="rounded-campo border border-border-field px-2.5 py-1.5 font-mono text-10_5 text-accent-700 hover:bg-accent-50"
            >
              {verFormulas ? 'ocultar la fórmula' : 'ver la fórmula'}
            </button>
          </div>
        </div>
      )}

      {verEquivalencia && <PopupEquivalencia onCerrar={() => setVerEquivalencia(false)} />}

      {verFormulas && <BloqueFormulas nivel={nivel} control={control} />}

      <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section>
          <p className="etiqueta-campo">Amenazas que mitiga</p>
          {control.amenazas.length === 0 ? (
            <p className="mt-1.5 text-11_5 text-faint">sin relación registrada</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {control.amenazas.map((a) => (
                <li key={a.codigo} className="text-11_5 leading-tight">
                  <span className="font-mono text-11 text-secondary">{a.codigo}</span>
                  <span className="block text-muted">{a.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="etiqueta-campo">Acción del plan de tratamiento</p>
          {control.accion ? (
            <div className="mt-1.5">
              <p className="text-11_5 text-secondary">
                <span className="font-mono">{control.accion.codigo}</span> ·{' '}
                {control.accion.estado.toLowerCase().replace(/_/g, ' ')}
              </p>
              <Link
                href="/sgsi/planes"
                className="mt-1 inline-block font-mono text-10_5 text-accent-700 underline decoration-accent-border underline-offset-2"
              >
                editar la acción ↗
              </Link>
            </div>
          ) : (
            <div className="mt-1.5">
              <p className="text-11_5 text-faint">sin acción asociada</p>
              {control.aplica && (
                <button
                  onClick={() =>
                    correr(async () => {
                      const r = await crearAccionDesdeControl(control.codigo);
                      return r;
                    })
                  }
                  disabled={pendiente}
                  className="mt-1.5 rounded-campo border border-accent-border bg-accent-100 px-2.5 py-1 text-11_5 font-semibold text-accent-700 disabled:opacity-50"
                >
                  + Agregarlo al plan
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="mt-5">
        <p className="etiqueta-campo">Evidencias</p>
        {control.evidencias.length === 0 ? (
          <PopupVacio>
            Sin evidencia registrada. Sin evidencia, el máximo admisible en auditoría es L2.
          </PopupVacio>
        ) : (
          <ul className="mt-1.5 flex flex-col">
            {control.evidencias.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 border-t border-hairline py-2"
              >
                <span className="min-w-0">
                  <span className="rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-muted">
                    {TIPOS.find((t) => t.valor === e.tipo)?.etiqueta ?? e.tipo}
                  </span>
                  <span className="ml-2 text-11_5 text-secondary [text-wrap:pretty]">{e.texto}</span>
                  {e.esBase && (
                    <span className="ml-2 font-mono text-9 text-faint">
                      base de la evaluación · no se retira
                    </span>
                  )}
                </span>
                {!e.esBase && (
                  <span className="flex flex-none items-center gap-1.5">
                    <input
                      value={motivoQuitar[e.id] ?? ''}
                      onChange={(ev) =>
                        setMotivoQuitar((m) => ({ ...m, [e.id]: ev.target.value }))
                      }
                      placeholder="motivo"
                      className="w-28 rounded-campo border border-border-field px-2 py-0.5 text-11 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    />
                    <button
                      onClick={() => correr(() => quitarEvidencia(e.id, motivoQuitar[e.id] ?? ''))}
                      disabled={pendiente || !(motivoQuitar[e.id] ?? '').trim()}
                      title={
                        !(motivoQuitar[e.id] ?? '').trim()
                          ? 'Escribí el motivo: queda en la bitácora'
                          : undefined
                      }
                      className="rounded-campo border border-danger-border px-2 py-0.5 font-mono text-10 text-danger-text disabled:opacity-40"
                    >
                      quitar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 rounded-campo border border-border-default bg-subtle p-3">
          <p className="etiqueta-campo">Agregar en lote</p>
          <p className="mt-1 text-10_5 text-faint">
            Cada línea, o cada fragmento separado por «;», crea una evidencia del tipo
            elegido.
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-2.5">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEvidencia)}
              className="rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
            <textarea
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              rows={2}
              placeholder="Una por línea…"
              className="min-w-[280px] flex-1 rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            />
            <button
              onClick={() =>
                correr(async () => {
                  const r = await agregarEvidencias(control.codigo, tipo, lote);
                  if (r.ok) setLote('');
                  return r;
                })
              }
              disabled={pendiente || lote.trim() === ''}
              className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              Agregar
            </button>
          </div>
        </div>
      </section>
    </Popup>
  );
}

/// The six formulas, plus the concrete arithmetic for the control that is open. Clicking
/// the efficacy should answer "where does this number come from", not just restate it.
function BloqueFormulas({ nivel, control }: { nivel: number | null; control: ControlVista }) {
  const e = eficaciaDeNivel(nivel);
  return (
    <div
      className="mt-3 rounded-tarjeta p-4 font-mono text-10_5 leading-relaxed"
      style={{ background: 'var(--hf-code-bg)', color: 'var(--hf-accent-300)' }}
    >
      <p style={{ color: 'var(--hf-text-placeholder)' }}>
        {'// Escala CMM a eficacia, según PILAR (CCN-CERT)'}
      </p>
      <p>
        EFI = [{EFICACIA_POR_NIVEL.map((v) => v.toFixed(2)).join(', ')}] &nbsp;→&nbsp; L
        {nivel ?? '—'} = {pct(e)}
      </p>

      <p className="mt-2.5" style={{ color: 'var(--hf-text-placeholder)' }}>
        {'// Eficacia agregada de la amenaza, MET-SIG-01 §7.4'}
      </p>
      <p>e(t) = MIN( Σ(wᵢ × eficaciaᵢ) / Σ(wᵢ) , eficacia_principal + δ ) &nbsp; δ = 0,05</p>

      <p className="mt-2.5" style={{ color: 'var(--hf-text-placeholder)' }}>
        {'// La eficacia baja la FRECUENCIA, nunca el impacto'}
      </p>
      <p>aro_residual(a,t) = aro(t) × (1 − e(t))</p>
      <p>riesgo_residual(a,t) = impacto(a,t) × aro_residual(a,t)</p>

      <p className="mt-2.5" style={{ color: 'var(--hf-text-placeholder)' }}>
        {'// Índice de madurez: media de la EFICACIA, no del nivel'}
      </p>
      <p>índice = media( EFI[nivel_actual] ) sobre los controles aplicables</p>
      <p>nivel típico = mediana( nivel_actual )</p>

      <p className="mt-2.5" style={{ color: 'var(--hf-text-placeholder)' }}>
        {`// Este control: ${control.codigo}`}
      </p>
      <p>
        L{control.lineaBase ?? '—'} → L{nivel ?? '—'} → L{control.objetivo ?? '—'} &nbsp;·&nbsp;
        eficacia {pct(eficaciaDeNivel(control.lineaBase))} → {pct(e)} →{' '}
        {pct(eficaciaDeNivel(control.objetivo))}
      </p>
      <p>
        mitiga {control.amenazas.length}{' '}
        {control.amenazas.length === 1 ? 'amenaza' : 'amenazas'} · {control.evidencias.length}{' '}
        {control.evidencias.length === 1 ? 'evidencia' : 'evidencias'}
      </p>
    </div>
  );
}

/// The CMM equivalence table, as a table.
///
/// The selects already print "L3 — Proceso definido · 90%", but that line does not say WHY
/// L3 is 90% and L2 is 50%, and the jump between those two is the single most consequential
/// step on the scale: it is where a control stops depending on who happens to be on shift.
/// People assign maturity by feel until they can read what each level asserts, so the
/// definition and the arithmetic sit side by side here.
///
/// The efficacy column is EFICACIA_POR_NIVEL, the same array the engine multiplies by — not
/// a transcription. `Escalas MAGERIT` B40:C45 of the workbook holds these same six pairs.
function PopupEquivalencia({ onCerrar }: { onCerrar: () => void }) {
  const definiciones: Record<number, string> = {
    0: 'No existe. Nadie lo hace, o se hace por accidente.',
    1: 'Se hace, pero depende de la persona. Sin documentar y sin repetibilidad: si esa persona falta, no se hace.',
    2: 'Se repite porque alguien se acuerda cómo. Hay práctica, no hay proceso escrito ni forma de verificarlo.',
    3: 'Documentado, comunicado y exigible. Se hace igual sin importar quién esté de turno. Es el primer nivel que un auditor puede verificar.',
    4: 'Además se mide. Hay indicadores, se revisan y las desviaciones se corrigen con evidencia.',
    5: 'Se mejora con lo que la medición muestra. El proceso cambia porque los datos lo piden.',
  };

  return (
    <Popup
      titulo="Equivalencia de los niveles de madurez"
      subtitulo="Escala CMM del modelo (PILAR / CCN-CERT). La columna de eficacia es la que el motor multiplica para obtener el riesgo residual: no es una referencia, es el número."
      ancho={780}
      onCerrar={onCerrar}
      pie={
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          Entendido
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-campo border border-hairline-strong">
          <table className="w-full border-collapse text-11_5" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-subtle text-left">
                <th className="border-b border-hairline-strong px-2.5 py-2 font-mono text-10 tracking-[0.06em] text-label">
                  NIVEL
                </th>
                <th className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary">
                  Nombre
                </th>
                <th className="border-b border-hairline-strong px-2.5 py-2 text-right font-semibold text-secondary whitespace-nowrap">
                  Eficacia
                </th>
                <th className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary">
                  Qué afirma el nivel
                </th>
              </tr>
            </thead>
            <tbody>
              {ESCALA.map((e) => {
                const s = semaforo(e.nivel);
                return (
                  <tr key={e.nivel}>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top">
                      <span
                        className="rounded-badge border px-1.5 py-0.5 font-mono text-10 font-bold"
                        style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
                      >
                        L{e.nivel}
                      </span>
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top font-medium text-primary">
                      {e.nombre}
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-right font-mono tabular-nums text-secondary">
                      {pct(EFICACIA_POR_NIVEL[e.nivel])}
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-secondary [text-wrap:pretty]">
                      {definiciones[e.nivel]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-campo border border-accent-border bg-accent-50 px-3.5 py-3">
          <p className="text-11_5 text-accent-800 [text-wrap:pretty]">
            <strong>El salto que importa es L2 → L3: de 50% a 90%.</strong> No es una curva
            suave. Es la diferencia entre «alguien se acuerda de hacerlo» y «está documentado,
            comunicado y se hace igual sin importar quién esté de turno». Un control en L2 deja
            pasar la mitad del riesgo por diseño.
          </p>
        </div>

        <p className="text-11 text-faint [text-wrap:pretty]">
          El índice de madurez es la media de la <strong>eficacia</strong>, nunca la del nivel.
          El nivel es una escala ordinal y promediarlo es incorrecto en rigor: un L5 que
          compensa un L0 esconde justamente lo que hay que gestionar. Un control que no aplica
          se excluye de toda media — no entra como cero.
        </p>
      </div>
    </Popup>
  );
}
