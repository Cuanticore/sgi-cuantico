'use client';

// app/sgsi/verificaciones/Verificaciones.client.tsx
//
// Lista a la izquierda, ficha a la derecha. Tres cosas que la pantalla tiene que sostener:
//
// **El anclaje es la decisión nueva**, y por eso está arriba de todo en la ficha con su
// aviso a la vista. Los dos anclajes tienen consecuencia; el aviso cambia según cuál esté
// elegido y ninguno de los dos queda mudo.
//
// **El histórico de ejecuciones no se sobrescribe.** En el Excel del consultor los ciclos
// son tres bloques de columnas repetidos y el cuarto no cabe. Acá son filas y no hay
// límite.
//
// **Aquí se administran, no se ejecutan.** Las ejecuciones le llegan al responsable a Mi
// SIG junto con todo lo demás; ésta es la pantalla de quien define.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarAnclaje, registrarEjecucion } from '@/app/sig/acciones/verificaciones';
import {
  avisoDeAnclaje,
  ETIQUETA_ANCLAJE,
  ETIQUETA_ESTADO_VERIFICACION,
  ETIQUETA_RESULTADO,
  type EstadoVerificacion,
  type ResultadoVerificacion,
} from '@/lib/sig/verificaciones';
import type { Anclaje } from '@/lib/sig/generacion';

const COLOR_ESTADO: Record<EstadoVerificacion, { fondo: string; texto: string }> = {
  VENCIDA: { fondo: '#fdeeeb', texto: '#a52016' },
  PROXIMA: { fondo: '#fff3e6', texto: '#8a4407' },
  AL_DIA: { fondo: '#e6efe9', texto: '#0b5c44' },
  SIN_CICLOS: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
};

const COLOR_RESULTADO: Record<ResultadoVerificacion, { fondo: string; texto: string; borde: string }> = {
  CONFORME: { fondo: '#e6efe9', texto: '#0b5c44', borde: 'var(--hf-border-field)' },
  HALLAZGO: { fondo: '#fff3e6', texto: '#8a4407', borde: '#f2b473' },
  NO_CONFORME: { fondo: '#fdeeeb', texto: '#a52016', borde: '#f2cdc6' },
};

export interface FilaVerificacion {
  id: number;
  titulo: string;
  control: string | null;
  responsable: string;
  periodicidad: string;
  anclaje: Anclaje;
  esProveedor: boolean;
  estado: EstadoVerificacion;
}

export interface EjecucionFila {
  asignacionId: number;
  periodo: string;
  fechaLimite: string;
  fechaCierre: string | null;
  asignadaA: string;
  resultado: ResultadoVerificacion | null;
  nota: string | null;
  autor: string | null;
  hallazgo: string | null;
}

export interface FichaVerificacion {
  id: number;
  titulo: string;
  descripcion: string;
  control: string | null;
  responsable: string;
  periodicidad: string;
  anclaje: Anclaje;
  esProveedor: boolean;
  puntos: { id: number; texto: string }[];
  ejecuciones: EjecucionFila[];
}

export default function VerificacionesClient({
  lista,
  elegidaId,
  ficha,
  hoy,
}: {
  lista: FilaVerificacion[];
  elegidaId: number | null;
  ficha: FichaVerificacion | null;
  hoy: string;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[88ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Verificaciones programadas</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Puntos a verificar, periodicidad y responsable. Cada ciclo produce una{' '}
            <strong className="font-semibold text-secondary">ejecución</strong> con su resultado —
            filas, no columnas repetidas.
          </p>
        </div>
        {/* Se define como cualquier otra obligación: contenido de tipo verificación,
            periodicidad y alcance. No hay un alta propia acá porque no hay una entidad
            propia detrás. */}
        <a
          href="/sig/obligaciones"
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          Nueva verificación
        </a>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <div className="flex w-full flex-none flex-col gap-2.5 xl:w-[402px]">
          <div className="flex flex-col gap-1 rounded-tarjeta border border-border-field bg-surface p-2">
            {lista.map((v) => {
              const activa = v.id === elegidaId;
              const e = COLOR_ESTADO[v.estado];
              return (
                <button
                  key={v.id}
                  onClick={() => router.push(`/sgsi/verificaciones?v=${v.id}`)}
                  aria-pressed={activa}
                  className="flex flex-col gap-1.5 rounded-campo px-3 py-2.5 text-left"
                  style={{
                    background: activa ? 'var(--hf-brand-100)' : 'transparent',
                    border: `1px solid ${activa ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                  }}
                >
                  <span className="flex w-full items-center gap-2">
                    <Etiqueta
                      texto={ETIQUETA_ANCLAJE[v.anclaje]}
                      fondo={v.anclaje === 'ANCLADA' ? 'var(--hf-brand-100)' : '#e8f4ef'}
                      color={v.anclaje === 'ANCLADA' ? 'var(--hf-brand-nav)' : '#0b5c44'}
                    />
                    <span className="font-mono text-9_5 text-muted">{v.periodicidad}</span>
                    <span className="ml-auto">
                      <Etiqueta texto={ETIQUETA_ESTADO_VERIFICACION[v.estado]} fondo={e.fondo} color={e.texto} />
                    </span>
                  </span>
                  <span className="w-full text-13 font-medium leading-snug text-primary">{v.titulo}</span>
                  <span className="w-full font-mono text-9_5 text-muted">
                    {v.control ?? 'sin control declarado'} · {v.responsable}
                  </span>
                </button>
              );
            })}
            {lista.length === 0 && (
              <p className="px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
                Ninguna verificación programada todavía. Se crean como obligaciones con un
                contenido de tipo lista de verificación.
              </p>
            )}
          </div>

          <p
            className="rounded-tarjeta px-3.5 py-3 text-11 leading-relaxed [text-wrap:pretty]"
            style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200, #d3dceb)', color: 'var(--hf-brand-nav)' }}
          >
            Estas verificaciones son{' '}
            <strong className="font-semibold">obligaciones del motor de tareas</strong>. Sus
            ejecuciones le llegan al responsable a Mi SIG junto con lo demás; aquí se
            administran, no se ejecutan.
          </p>
        </div>

        {ficha !== null && (
          <Ficha ficha={ficha} hoy={hoy} setAviso={setAviso} />
        )}
      </div>
    </main>
  );
}

function Ficha({
  ficha,
  hoy,
  setAviso,
}: {
  ficha: FichaVerificacion;
  hoy: string;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [anclaje, setAnclaje] = useState<Anclaje>(ficha.anclaje);
  const [guardando, setGuardando] = useState(false);
  const nota = avisoDeAnclaje(anclaje);
  const abiertas = ficha.ejecuciones.filter((e) => e.fechaCierre === null);

  return (
    <section className="min-w-0 flex-1 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <div className="flex flex-col gap-2 border-b border-hairline px-5 py-4">
        <span className="text-16 font-semibold leading-snug text-primary">{ficha.titulo}</span>
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-10_5 text-muted">
            {ficha.control ?? 'sin control declarado'}
          </span>
          <span className="h-3 w-px bg-hairline" />
          <span className="text-11_5 text-muted">{ficha.responsable}</span>
          <span className="h-3 w-px bg-hairline" />
          <span className="text-11_5 text-muted">{ficha.periodicidad}</span>
          {ficha.esProveedor && (
            <span className="ml-auto">
              <Etiqueta texto="Proveedor crítico" fondo="#fdeeeb" color="#a52016" />
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        {/* El anclaje, que es la decisión nueva. */}
        <div className="flex flex-col gap-2.5">
          <Rotulo texto="Anclaje de la periodicidad" />
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { id: 'ANCLADA', titulo: 'Anclada al calendario', texto: 'El periodo siguiente nace se haya cerrado el anterior o no.' },
                { id: 'FLOTANTE', titulo: 'Flotante', texto: 'El siguiente nace al cerrar el previo, a los días de plazo.' },
              ] as const
            ).map((a) => {
              const activo = anclaje === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAnclaje(a.id)}
                  aria-pressed={activo}
                  className="flex flex-col items-start gap-1 rounded-tarjeta px-3.5 py-3 text-left"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  }}
                >
                  <span className="text-12_5 font-semibold">{a.titulo}</span>
                  <span className="text-11 leading-relaxed opacity-85 [text-wrap:pretty]">{a.texto}</span>
                </button>
              );
            })}
          </div>

          <p
            className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
            style={
              nota.tono === 'cuidado'
                ? { background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }
                : { background: '#f7fbf9', border: '1px solid #c9e3d8', color: '#0b5c44' }
            }
          >
            {nota.texto}
          </p>

          {anclaje !== ficha.anclaje && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={guardando}
                onClick={async () => {
                  setGuardando(true);
                  const r = await cambiarAnclaje(ficha.id, anclaje);
                  setGuardando(false);
                  setAviso({ ok: r.ok, texto: r.mensaje });
                  if (r.ok) setTimeout(() => window.location.reload(), 1200);
                }}
                className="rounded-campo px-3.5 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--hf-brand-nav)' }}
              >
                {guardando ? 'Guardando…' : `Cambiar a ${ETIQUETA_ANCLAJE[anclaje].toLowerCase()}`}
              </button>
              <button
                onClick={() => setAnclaje(ficha.anclaje)}
                className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-muted"
              >
                Dejar como está
              </button>
              {/* Lo que el cambio NO hace. Es lo primero que alguien va a preguntar. */}
              <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Sólo afecta a lo que se genere de acá en adelante: los ciclos ya abiertos no
                se mueven.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Rotulo texto="Puntos a verificar" derecha={`${ficha.puntos.length} puntos`} />
          {ficha.puntos.length === 0 ? (
            <p className="text-11_5 text-muted [text-wrap:pretty]">
              El contenido no tiene puntos cargados. Una lista de verificación sin puntos deja
              a quien la ejecuta sin nada que verificar.
            </p>
          ) : (
            ficha.puntos.map((p, n) => (
              <span
                key={p.id}
                className="flex items-start gap-3 rounded-campo border border-border-field bg-subtle px-3.5 py-2.5"
              >
                <span className="flex-none pt-0.5 font-mono text-10 text-faint">
                  {String(n + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-12 leading-relaxed text-primary [text-wrap:pretty]">
                  {p.texto}
                </span>
              </span>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Rotulo texto="Ejecuciones" derecha="el histórico no se sobrescribe" />
          {ficha.ejecuciones.length === 0 ? (
            <p className="text-11_5 text-muted [text-wrap:pretty]">
              {ficha.anclaje === 'FLOTANTE'
                ? 'Ningún ciclo abierto. Con anclaje flotante eso puede significar que el previo nunca se cerró.'
                : 'Ningún ciclo todavía. El motor los abre según la periodicidad.'}
            </p>
          ) : (
            ficha.ejecuciones.map((e) => (
              <FilaEjecucion key={e.asignacionId} e={e} hoy={hoy} setAviso={setAviso} />
            ))
          )}
          {abiertas.length > 0 && (
            <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
              {abiertas.length} ciclo(s) sin resultado. Registrarlo cierra la asignación en la
              misma operación: un ciclo con resultado y sin cerrar seguiría contando como
              deuda en Mi SIG.
            </p>
          )}
          <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            En el Excel del consultor los ciclos son tres bloques de columnas repetidos, y el
            cuarto no cabe. Aquí no hay límite, se puede filtrar por vencidas y se puede
            comparar un punto entre ciclos.
          </p>
        </div>
      </div>
    </section>
  );
}

function FilaEjecucion({
  e,
  hoy,
  setAviso,
}: {
  e: EjecucionFila;
  hoy: string;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const c = e.resultado === null ? null : COLOR_RESULTADO[e.resultado];
  const vencida = e.fechaCierre === null && e.fechaLimite < hoy;

  return (
    <div
      className="flex flex-col gap-2 rounded-tarjeta px-3.5 py-3"
      style={{
        background: c?.fondo === '#fdeeeb' ? '#fdeeeb' : 'var(--hf-bg-surface)',
        border: `1px solid ${c?.borde ?? (vencida ? '#f2cdc6' : 'var(--hf-border-field)')}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-[74px] flex-none font-mono text-11 text-secondary">{e.periodo}</span>
        {e.resultado === null ? (
          <Etiqueta
            texto={vencida ? 'Vencida' : 'Sin registrar'}
            fondo={vencida ? '#fdeeeb' : 'var(--hf-bg-subtle)'}
            color={vencida ? '#a52016' : 'var(--hf-text-muted)'}
          />
        ) : (
          <Etiqueta texto={ETIQUETA_RESULTADO[e.resultado]} fondo={c!.fondo} color={c!.texto} />
        )}
        <span className="min-w-0 flex-1 text-12 leading-snug text-secondary [text-wrap:pretty]">
          {e.nota ?? `Vence el ${e.fechaLimite} · ${e.asignadaA}`}
        </span>
        {e.autor !== null && <span className="font-mono text-10 text-faint">{e.autor}</span>}
        {e.hallazgo !== null && (
          <a href={`/sig/hallazgos/${e.hallazgo}`} className="font-mono text-9_5 font-medium text-accent hover:underline">
            {e.hallazgo}
          </a>
        )}
        {e.resultado === null && !abierto && (
          <button
            onClick={() => setAbierto(true)}
            className="rounded-campo border border-border-field bg-surface px-2.5 py-1 text-11 text-secondary"
          >
            Registrar resultado
          </button>
        )}
      </div>

      {abierto && (
        <FormularioEjecucion
          asignacionId={e.asignacionId}
          onCerrar={() => setAbierto(false)}
          setAviso={setAviso}
        />
      )}
    </div>
  );
}

function FormularioEjecucion({
  asignacionId,
  onCerrar,
  setAviso,
}: {
  asignacionId: number;
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [resultado, setResultado] = useState<ResultadoVerificacion>('CONFORME');
  const [nota, setNota] = useState('');
  const [hallazgo, setHallazgo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const exigeHallazgo = resultado !== 'CONFORME';

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {(['CONFORME', 'HALLAZGO', 'NO_CONFORME'] as const).map((r) => {
          const activo = resultado === r;
          const c = COLOR_RESULTADO[r];
          return (
            <button
              key={r}
              onClick={() => setResultado(r)}
              aria-pressed={activo}
              className="rounded-chip px-3 py-1.5 text-12"
              style={{
                background: activo ? c.fondo : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? c.texto : 'var(--hf-border-field)'}`,
                color: activo ? c.texto : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {ETIQUETA_RESULTADO[r]}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Qué se verificó · obligatorio</span>
        <textarea
          value={nota}
          onChange={(ev) => setNota(ev.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          placeholder="Una ejecución sin nota no se distingue de una que nadie miró."
        />
      </label>

      {exigeHallazgo && (
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Hallazgo en Mejora · obligatorio con este resultado</span>
          <input
            value={hallazgo}
            onChange={(ev) => setHallazgo(ev.target.value)}
            className="entrada-campo"
            placeholder="HAL-2026-0017"
          />
          <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            Lo que se encontró vive en Mejora, no acá. Registrar el resultado sin levantarlo
            deja la ejecución diciendo que algo pasó y a nadie a cargo de arreglarlo.
          </span>
        </label>
      )}

      <div className="flex gap-2">
        <button
          disabled={enviando || nota.trim().length < 10 || (exigeHallazgo && hallazgo.trim() === '')}
          onClick={async () => {
            setEnviando(true);
            // El código se resuelve a id en el servidor: la pantalla no debería conocer
            // los ids de Mejora, y pegar un código es lo que alguien tiene a mano.
            const r = await registrarEjecucion(asignacionId, {
              resultado,
              nota,
              codigoHallazgo: hallazgo.trim() || undefined,
            });
            setEnviando(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) setTimeout(() => window.location.reload(), 1200);
          }}
          className="rounded-campo px-3.5 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {enviando ? 'Guardando…' : 'Registrar y cerrar el ciclo'}
        </button>
        <button
          onClick={onCerrar}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
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

function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <span
      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.06em]"
      style={{ background: fondo, color }}
    >
      {texto}
    </span>
  );
}
