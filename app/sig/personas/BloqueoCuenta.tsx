'use client';

// app/sig/personas/BloqueoCuenta.tsx
//
// **La pestaña Cuenta del popup de una persona** (REQ-SIG-15 §6, P19 a P25): bloquear y
// desbloquear su cuenta del Directorio.
//
// Es la acción más destructiva que la aplicación tiene, y la pantalla está construida para
// que se note. No hay «¿está seguro?»: hay un motivo que tiene que decir algo, el correo de la
// persona escrito a mano, y el detalle —arriba del botón, no debajo— de lo que el bloqueo NO
// hace.
//
// **P25 · esta pestaña no se dibuja si `GRAPH_BLOQUEO_HABILITADO` no está en «true»**, y
// tampoco sin `personas:bloquear`. Quien decide es el servidor (`page.tsx`), que es el único
// que puede leer la variable; acá no llega ni el nombre de la bandera. Un botón que existe y
// responde 403 se lee como que la aplicación está rota, y alguien va a probarlo tres veces con
// tres personas distintas antes de concluirlo.
//
// **P22 · el bloqueo no cierra, no anula y no reasigna nada.** Los pendientes se listan y se
// OFRECE moverlos: el botón lleva al panel de reasignación de la pestaña de datos base, que es
// el que llama a `reasignarPendientesDe` y exige motivo. Repetir ese panel acá habría creado
// la segunda forma de reasignar, que es como terminan discrepando.
//
// **P23 · el bloqueo NO es la desvinculación**, y la pestaña lo dice y enlaza al trámite. El
// bloqueo contiene hoy; la desvinculación es el trámite de REQ-SIG-09 con revocación de
// accesos, paz y salvo y obligaciones subsistentes. Fundirlos haría que un bloqueo preventivo
// por sospecha —del que la persona puede volver limpia el lunes— arrancara una desvinculación
// que nadie pidió.

import Link from 'next/link';
import { useState } from 'react';

import { bloquearCuenta, desbloquearCuenta } from '@/app/sig/acciones/personas-bloqueo';
import { confirmacionCoincide, motivoValido, MOTIVO_MINIMO } from '@/lib/sgsi/bloqueo';
import type { PendienteDePersona } from '@/app/sig/acciones/persona-actividad';
import type { PersonaFila } from './Personas.client';

export default function BloqueoCuenta({
  persona,
  pendientes,
  onIrAReasignar,
}: {
  persona: PersonaFila;
  /// Los pendientes de la persona, **cargados por el popup**, no por esta pestaña.
  ///
  /// Viajaban dentro de `PersonaFila` —los 91 arreglos del censo— y ahora se piden al abrir.
  /// La consulta la dispara el popup cuando la sección activa es Pendientes **o** Cuenta,
  /// justamente para que entrar directo acá no muestre una lista vacía sobre alguien que sí
  /// tiene carga abierta.
  ///
  /// `null` es «todavía no llegaron», que no es «no tiene». El conteo de arriba sale de
  /// `persona.pendientes`, que sigue en el censo y está desde el primer render.
  pendientes: PendienteDePersona[] | null;
  /// Lleva a la pestaña de Pendientes, donde vive el panel de reasignación (R9). No se
  /// duplica acá: una segunda forma de reasignar es una que mañana dice otra cosa.
  onIrAReasignar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [correoEscrito, setCorreoEscrito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /// Graph aplicó el cambio y la base no. No es un error más: el estado del mundo cambió.
  const [desincronizado, setDesincronizado] = useState(false);

  const bloquear = persona.activa;
  const verbo = bloquear ? 'Bloquear' : 'Desbloquear';

  // Las mismas dos reglas que el servidor vuelve a comprobar. Acá sirven para no dejar
  // apretar un botón que iba a fallar; allá sirven para que no alcance con no apretarlo.
  const motivoListo = motivoValido(motivo);
  const correoListo = confirmacionCoincide(persona.correo, correoEscrito);
  const puedeEnviar = motivoListo && correoListo && !enviando;

  async function ejecutar() {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    setDesincronizado(false);
    const accion = bloquear ? bloquearCuenta : desbloquearCuenta;
    const r = await accion(persona.id, motivo, correoEscrito);
    setEnviando(false);
    if (!r.ok) {
      setError(r.mensaje);
      setDesincronizado(r.desincronizado);
      return;
    }
    setMensaje(r.mensaje);
    setCorreoEscrito('');
    setMotivo('');
    // La fila del censo, los chips y la columna de estado quedan viejos: el estado de la
    // persona acaba de cambiar. Se recarga con retraso para que el mensaje se alcance a leer
    // —dice qué pasó con los pendientes, que es lo que hay que hacer a continuación—.
    setTimeout(() => window.location.reload(), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="etiqueta-campo">
          {bloquear ? 'Cuenta habilitada en el Directorio' : 'Cuenta bloqueada en el Directorio'}
        </span>
        <h2 className="text-13 font-semibold text-primary">
          {verbo} la cuenta de {persona.nombre}
        </h2>
        <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          {bloquear
            ? 'Es la acción más destructiva de la aplicación: deja a esta persona sin poder ' +
              'trabajar. Se deshabilita la cuenta en el Directorio Activo y se le revocan las ' +
              'sesiones abiertas, así que el acceso se corta ya. Sin la revocación, el token ' +
              'que ya tiene seguiría siendo válido hasta una hora.'
            : 'Vuelve a habilitar la cuenta en el Directorio Activo y la reactiva en el censo. ' +
              'Exige motivo igual que el bloqueo: un desbloqueo sin motivo deja la bitácora ' +
              'contando la mitad de la historia.'}
        </p>
      </div>

      {/* P19 · los cuatro pasos, dichos antes de hacerlos. Quien bloquea tiene que saber que
          esto no espera al cron de sincronización y que la bitácora se escribe con su motivo. */}
      <ol
        className="flex flex-col gap-1 rounded-campo border px-3 py-2.5"
        style={{ background: 'var(--hf-bg-subtle)', borderColor: 'var(--hf-border-field)' }}
      >
        {(bloquear
          ? [
              'Se registra el motivo, que queda en la bitácora con tu nombre.',
              'Se deshabilita la cuenta en el Directorio (accountEnabled: false).',
              'Se le revocan las sesiones abiertas: el acceso se corta ahora, no dentro de una hora.',
              'Se marca inactiva en el censo, en una transacción con la bitácora. La pantalla dice la verdad al recargar.',
            ]
          : [
              'Se registra el motivo, que queda en la bitácora con tu nombre.',
              'Se habilita la cuenta en el Directorio (accountEnabled: true).',
              'Se marca activa en el censo, en una transacción con la bitácora.',
            ]
        ).map((paso, i) => (
          <li key={paso} className="flex gap-2 text-11_5 leading-relaxed text-secondary">
            <span className="font-mono text-10_5 text-muted">{i + 1}</span>
            <span className="[text-wrap:pretty]">{paso}</span>
          </li>
        ))}
      </ol>

      {/* P22 · lo que el bloqueo NO hace con las tareas. Va ARRIBA del formulario: leerlo
          después de bloquear no ayuda a decidir. */}
      {bloquear && (
        <div className="flex flex-col gap-2 rounded-campo border border-border-field px-3 py-2.5">
          <p className="text-12_5 font-semibold text-primary">
            {persona.pendientes === 0
              ? 'No tiene pendientes abiertos.'
              : `Tiene ${persona.pendientes} pendiente(s) abierto(s)${
                  persona.vencidas > 0 ? `, ${persona.vencidas} vencido(s)` : ''
                }.`}
          </p>
          <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            El bloqueo <strong>no los cierra, no los anula y no los reasigna</strong>. Cerrarlos
            inventaría cumplimiento y anularlos en silencio borraría carga real que alguien
            tiene que asumir. Si hay que moverlos, se reasignan con motivo — y eso se decide
            acá, no se hace solo.
          </p>
          {persona.pendientes > 0 && (
            <>
              {/* «Todavía no llegaron» se dice; no se dibuja una lista vacía, que acá se
                  leería como «no tiene nada que mover» justo antes de cortarle el acceso. */}
              {pendientes === null ? (
                <p className="text-11_5 text-muted">Cargando cuáles son…</p>
              ) : (
                <ul className="flex max-h-[140px] flex-col gap-1 overflow-y-auto rounded-campo border border-hairline p-2">
                  {pendientes.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 px-1">
                      <span className="min-w-0 text-11_5 text-primary">
                        <span className="font-mono text-10_5 text-muted">{a.codigo}</span>{' '}
                        {a.titulo}
                      </span>
                      <span
                        className="shrink-0 font-mono text-10"
                        style={{
                          color: a.vencida ? 'var(--hf-danger-text)' : 'var(--hf-text-secondary)',
                        }}
                      >
                        {a.fechaLimite.slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={onIrAReasignar}
                className="self-start rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 text-secondary"
              >
                Reasignar sus pendientes antes de bloquear
              </button>
            </>
          )}
        </div>
      )}

      {/* P23 · el bloqueo no reemplaza la desvinculación, y se enlaza el trámite. */}
      <p
        className="rounded-campo border px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{
          background: 'var(--hf-warn-100)',
          borderColor: 'var(--hf-warn-border)',
          color: 'var(--hf-warn-text)',
        }}
      >
        <strong className="font-semibold">El bloqueo no es la desvinculación.</strong> Contiene
        hoy (A.5.11, A.8.3) y sirve igual para una sospecha de la que la persona puede volver
        limpia el lunes. Si además se va de la organización, el trámite es otro —revocación de
        accesos, paz y salvo y obligaciones subsistentes— y sigue pendiente:{' '}
        <Link
          href={`/sig/colaboradores/${persona.id}`}
          className="font-semibold underline underline-offset-2"
        >
          abrir la desvinculación de {persona.nombre}
        </Link>
        .
      </p>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Motivo (obligatorio)</span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        />
        <span className="text-10_5 text-faint [text-wrap:pretty]">
          Mínimo {MOTIVO_MINIMO} caracteres. Va a la bitácora y es lo único que responde por qué
          esta persona no puede trabajar — ante ella y ante un auditor.
        </span>
      </label>

      {/* P20 · la confirmación no es «¿está seguro?»: es escribir el correo exacto. Es lo que
          se usa para las operaciones irreversibles, y acá la irreversibilidad es de la
          persona, no del dato. */}
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">
          Escribí <code className="font-mono">{persona.correo}</code> para confirmar
        </span>
        <input
          type="text"
          value={correoEscrito}
          onChange={(e) => setCorreoEscrito(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 font-mono text-12_5"
        />
        <span className="text-10_5 text-faint [text-wrap:pretty]">
          Es lo que evita {verbo.toLowerCase()} a quien estaba una fila más abajo. El servidor lo
          vuelve a comprobar.
        </span>
      </label>

      {error !== null && (
        <p
          className="rounded-campo border px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={
            desincronizado
              ? {
                  // El estado en el que Azure ya cambió y la base no. Se pinta como aviso y no
                  // como error a secas: hay algo cierto en el mundo que la pantalla todavía no
                  // muestra, y quien lee esto tiene que actuar, no sólo reintentar.
                  background: 'var(--hf-warn-100)',
                  borderColor: 'var(--hf-warn-border)',
                  color: 'var(--hf-warn-text)',
                }
              : { background: 'transparent', borderColor: 'transparent', color: 'var(--hf-danger-text)' }
          }
        >
          {desincronizado && <strong className="font-semibold">Atención · </strong>}
          {error}
        </p>
      )}

      {mensaje !== null && (
        <p
          className="rounded-campo border px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#e6efe9', borderColor: '#0b5c44', color: '#0b5c44' }}
        >
          {mensaje}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {!motivoListo && (
          <span className="text-11 text-muted">Falta el motivo.</span>
        )}
        {motivoListo && !correoListo && (
          <span className="text-11 text-muted">Falta escribir el correo exacto.</span>
        )}
        <button
          type="button"
          onClick={ejecutar}
          disabled={!puedeEnviar}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-40"
          style={{ background: bloquear ? 'var(--hf-danger-text)' : 'var(--hf-brand-nav)' }}
        >
          {enviando
            ? `${bloquear ? 'Bloqueando' : 'Desbloqueando'}…`
            : `${verbo} la cuenta de ${persona.nombre}`}
        </button>
      </div>
    </div>
  );
}
