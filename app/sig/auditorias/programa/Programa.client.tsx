'use client';

// app/sig/auditorias/programa/Programa.client.tsx
//
// La matriz del lienzo: procesos en las filas, los doce meses en las columnas, y la marca
// de cada celda con su leyenda escrita al pie.
//
// El estado de una fila NO se guarda: sale de si su auditoría tiene informe emitido, está
// abierta, o no existe todavía. Guardar «ejecutada» a mano permitiría que la matriz diga
// que un proceso se auditó cuando no hay ni una nota de auditor detrás.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  aprobarPerfilAuditor,
  crearAuditoria,
  crearPrograma,
  programarAuditoria,
} from '@/app/sig/acciones/auditorias';

export interface FilaPrograma {
  id: number;
  proceso: string;
  meses: number[];
  tipo: string;
  responsable: string;
  plazoInformeDias: number;
  estado: 'PLANEADA' | 'EN_CURSO' | 'EJECUTADA' | string;
  auditoriaId: number | null;
}

export interface PerfilFila {
  id: number;
  nombre: string;
  personaId: number | null;
  externo: boolean;
  certificacion: string;
  entidadCertificadora: string;
  vigencia: string;
  experienciaAnios: number;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
}

const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/// La marca de la celda y su color. `marca` es una letra, no sólo un color: la leyenda del
/// pie explica cada una, y así la matriz se lee también impresa en blanco y negro.
const ESTADO: Record<string, { marca: string; etiqueta: string; bg: string; fg: string }> = {
  PLANEADA: { marca: 'P', etiqueta: 'Planeada', bg: '#e9f0fb', fg: '#12437f' },
  EN_CURSO: { marca: 'C', etiqueta: 'En curso', bg: '#fff3e6', fg: '#8a4407' },
  EJECUTADA: { marca: 'E', etiqueta: 'Ejecutada', bg: '#e6efe9', fg: '#0b5c44' },
};

export default function ProgramaClient({
  anio,
  aniosConPrograma,
  programa,
  filas,
  personas,
  procesos,
  perfiles,
}: {
  anio: number;
  aniosConPrograma: number[];
  programa: {
    id: number;
    alcance: string;
    objetivo: string;
    criterios: string;
    metodos: string;
    aprobadoPor: string | null;
    fechaAprobacion: string | null;
  } | null;
  filas: FilaPrograma[];
  personas: { id: number; nombre: string }[];
  procesos: string[];
  perfiles: PerfilFila[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(programa === null);
  const [programando, setProgramando] = useState(false);
  const [perfilNuevo, setPerfilNuevo] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const aprobados = perfiles.filter((p) => p.aprobadoEn !== null);
  const plazo = filas[0]?.plazoInformeDias ?? null;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Programa de auditoría {anio}</h1>
          <p className="max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            FOR-CAL-04 · se elabora en el primer bimestre, y esa elaboración es ella misma una
            obligación del motor de tareas.
          </p>
        </div>
        <span className="ml-auto flex flex-none items-center gap-2">
          <span className="flex items-center gap-2 rounded-campo border border-border-field bg-surface px-3 py-1.5">
            <button
              onClick={() => router.push(`/sig/auditorias/programa?anio=${anio - 1}`)}
              aria-label="Año anterior"
              className="text-12 text-muted"
            >
              ‹
            </button>
            <span className="min-w-[38px] text-center font-mono text-12_5 font-semibold text-primary">
              {anio}
            </span>
            <button
              onClick={() => router.push(`/sig/auditorias/programa?anio=${anio + 1}`)}
              aria-label="Año siguiente"
              className="text-12 text-muted"
            >
              ›
            </button>
          </span>
          <Link
            href="/sig/auditorias"
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 font-medium text-secondary"
          >
            Ver las auditorías
          </Link>
          {programa && (
            <a
              href={`/api/sig/programa-auditoria?anio=${anio}`}
              className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
              style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-700)' }}
            >
              Exportar
            </a>
          )}
        </span>
      </div>

      {aniosConPrograma.length > 0 && !aniosConPrograma.includes(anio) && (
        <p className="mt-3 text-11_5 text-muted">
          Hay programa en{' '}
          {aniosConPrograma.map((a, n) => (
            <span key={a}>
              {n > 0 && ' · '}
              <Link
                href={`/sig/auditorias/programa?anio=${a}`}
                className="font-medium"
                style={{ color: 'var(--hf-brand-nav)' }}
              >
                {a}
              </Link>
            </span>
          ))}
          .
        </p>
      )}

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

      {editando ? (
        <Cabecera
          anio={anio}
          programa={programa}
          onCerrar={() => setEditando(false)}
          setAviso={setAviso}
        />
      ) : (
        programa && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Campo etiqueta="Alcance del programa" valor={programa.alcance} />
              <Campo etiqueta="Objetivo" valor={programa.objetivo} />
              <Campo etiqueta="Criterios" valor={programa.criterios} />
              <Campo etiqueta="Métodos" valor={programa.metodos} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => setEditando(true)}
                className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 font-medium text-secondary"
              >
                Editar la cabecera
              </button>
              {programa.aprobadoPor && (
                <span className="text-11_5 text-muted">
                  Aprobado por {programa.aprobadoPor}
                  {programa.fechaAprobacion ? ` · ${programa.fechaAprobacion}` : ''}
                </span>
              )}
            </div>
          </>
        )
      )}

      {programa && (
        <>
          <div className="mt-5 overflow-x-auto rounded-tarjeta border border-border-field bg-surface px-4 pb-2 pt-4">
            <table className="w-full min-w-[880px] border-collapse text-left text-12_5">
              <thead>
                <tr
                  className="text-11 uppercase tracking-[0.05em]"
                  style={{ color: 'var(--hf-text-label)' }}
                >
                  <th className="w-[208px] px-2 py-2 font-semibold">Proceso a auditar</th>
                  {MESES.map((m, n) => (
                    <th key={n} className="px-0 py-2 text-center font-semibold">
                      {m}
                    </th>
                  ))}
                  <th className="w-[74px] px-2 py-2 font-semibold">Tipo</th>
                  <th className="w-[150px] px-2 py-2 font-semibold">Responsable</th>
                  <th className="w-[110px] px-2 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const e = ESTADO[f.estado] ?? ESTADO.PLANEADA;
                  return (
                    <tr key={f.id} className="border-t border-border-default">
                      <td className="px-2 py-2.5 pr-3">
                        <span className="font-medium text-primary">{f.proceso}</span>
                      </td>
                      {MESES.map((_, n) => {
                        const marcado = f.meses.includes(n + 1);
                        return (
                          <td key={n} className="px-0 py-2.5 text-center">
                            {marcado ? (
                              <span
                                className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-10 font-bold"
                                style={{ background: e.bg, color: e.fg }}
                                title={`${e.etiqueta} · mes ${n + 1}`}
                              >
                                {e.marca}
                              </span>
                            ) : (
                              <span className="text-10 text-label">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5">
                        <span
                          className="rounded-[4px] px-1.5 py-0.5 font-mono text-9 uppercase"
                          style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                        >
                          {f.tipo.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-11_5 text-secondary-soft">{f.responsable}</td>
                      <td className="px-2 py-2.5">
                        {f.auditoriaId ? (
                          <Link
                            href={`/sig/auditorias/${f.auditoriaId}`}
                            className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
                            style={{ background: e.bg, color: e.fg }}
                          >
                            {e.etiqueta}
                          </Link>
                        ) : (
                          <CrearDesdeFila
                            fila={f}
                            aprobados={aprobados}
                            setAviso={setAviso}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filas.length === 0 && (
                  <tr className="border-t border-border-default">
                    <td colSpan={16} className="px-2 py-8 text-center text-12 text-muted">
                      Ningún proceso programado para {anio}. La matriz se llena programando
                      procesos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="flex flex-wrap items-center gap-3">
              {Object.values(ESTADO).map((e) => (
                <span key={e.marca} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-8_5 font-bold"
                    style={{ background: e.bg, color: e.fg }}
                  >
                    {e.marca}
                  </span>
                  <span className="text-11 text-secondary-soft">{e.etiqueta}</span>
                </span>
              ))}
            </span>
            <button
              onClick={() => setProgramando(true)}
              className="rounded-campo px-3 py-1.5 text-11_5 font-medium"
              style={{
                color: 'var(--hf-brand-nav)',
                border: '1px dashed var(--hf-brand-border)',
              }}
            >
              + Programar un proceso
            </button>
            {plazo !== null && (
              <span className="ml-auto max-w-[52ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
                Tiempo máximo de entrega del informe:{' '}
                <strong className="font-semibold text-secondary-soft">
                  {plazo} día{plazo === 1 ? '' : 's'} calendario
                </strong>
                , y el vencimiento se calcula.
              </span>
            )}
          </div>

          {programando && (
            <NuevaProgramada
              programaId={programa.id}
              procesos={procesos}
              personas={personas}
              onCerrar={() => setProgramando(false)}
              setAviso={setAviso}
            />
          )}
        </>
      )}

      {/* C3. Vive acá porque aprobar quién puede auditar es una decisión del programa, y
          porque sin un perfil aprobado `crearAuditoria` rechaza: es el primer eslabón. */}
      <section className="mt-8 flex flex-col gap-2.5">
        <span className="flex items-center gap-2.5">
          <span className="etiqueta-campo">Perfiles de auditor aprobados · C3</span>
          <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
          <span className="font-mono text-9_5 text-label">{aprobados.length}</span>
        </span>
        <p className="max-w-[92ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          Una auditoría interna no se puede crear sin un auditor líder con perfil aprobado.
          El perfil declara formación, certificación, entidad certificadora, vigencia y años
          de experiencia, y queda con quién lo aprobó y cuándo.
        </p>

        {aprobados.length === 0 ? (
          <p
            className="max-w-[92ch] rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            No hay ningún perfil aprobado, así que ninguna auditoría interna se puede crear
            todavía. Aprobá el primero para desbloquear el resto del módulo.
          </p>
        ) : (
          <div className="overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <table className="w-full text-left text-12_5">
              <thead>
                <tr
                  className="text-11 uppercase tracking-[0.05em]"
                  style={{ color: 'var(--hf-text-label)' }}
                >
                  <th className="px-4 py-3 font-semibold">Auditor</th>
                  <th className="px-4 py-3 font-semibold">Certificación</th>
                  <th className="px-4 py-3 font-semibold">Entidad</th>
                  <th className="px-4 py-3 text-right font-semibold">Vigencia</th>
                  <th className="px-4 py-3 text-right font-semibold">Experiencia</th>
                  <th className="px-4 py-3 font-semibold">Aprobado</th>
                </tr>
              </thead>
              <tbody>
                {aprobados.map((p) => (
                  <tr key={p.id} className="border-t border-border-default">
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary">{p.nombre}</span>
                      {p.externo && (
                        <span
                          className="ml-2 rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase"
                          style={{ background: 'var(--hf-bg-app)', color: 'var(--hf-text-muted)' }}
                        >
                          externo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary-soft">{p.certificacion}</td>
                    <td className="px-4 py-3 text-secondary-soft">{p.entidadCertificadora}</td>
                    <td className="px-4 py-3 text-right font-mono text-11 text-secondary-soft">
                      {p.vigencia}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-11 text-secondary-soft">
                      {p.experienciaAnios} a
                    </td>
                    <td className="px-4 py-3 text-11_5 text-muted">
                      {p.aprobadoPor ?? '—'}
                      {p.aprobadoEn ? ` · ${p.aprobadoEn}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={() => setPerfilNuevo(true)}
          className="w-fit rounded-campo px-3.5 py-2 text-12 font-medium"
          style={{ color: 'var(--hf-brand-nav)', border: '1px dashed var(--hf-brand-border)' }}
        >
          + Aprobar un perfil de auditor
        </button>

        {perfilNuevo && (
          <NuevoPerfil
            personas={personas}
            onCerrar={() => setPerfilNuevo(false)}
            setAviso={setAviso}
          />
        )}
      </section>
    </main>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span className="entrada-campo leading-relaxed">{valor}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// La cabecera del programa
// ──────────────────────────────────────────────────────────────────────────────

function Cabecera({
  anio,
  programa,
  onCerrar,
  setAviso,
}: {
  anio: number;
  programa: { alcance: string; objetivo: string; criterios: string; metodos: string } | null;
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [alcance, setAlcance] = useState(programa?.alcance ?? '');
  const [objetivo, setObjetivo] = useState(programa?.objetivo ?? '');
  const [criterios, setCriterios] = useState(programa?.criterios ?? '');
  const [metodos, setMetodos] = useState(programa?.metodos ?? '');
  const [ocupado, setOcupado] = useState(false);

  const completo =
    alcance.trim() !== '' &&
    objetivo.trim() !== '' &&
    criterios.trim() !== '' &&
    metodos.trim() !== '';

  return (
    <div className="mt-4 flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-14 font-bold text-primary">
          {programa ? `Editar el programa ${anio}` : `Crear el programa ${anio}`}
        </h2>
        {programa && (
          <button onClick={onCerrar} className="text-12_5 text-muted">
            Cancelar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Alcance del programa</span>
          <textarea
            value={alcance}
            onChange={(e) => setAlcance(e.target.value)}
            rows={2}
            placeholder="Qué queda dentro del programa de este año"
            className="entrada-campo leading-relaxed"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Objetivo</span>
          <textarea
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            rows={2}
            placeholder="Qué se busca evidenciar"
            className="entrada-campo leading-relaxed"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Criterios</span>
          <textarea
            value={criterios}
            onChange={(e) => setCriterios(e.target.value)}
            rows={2}
            placeholder="Norma ISO 9001:2015 y documentación del SIG"
            className="entrada-campo leading-relaxed"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Métodos</span>
          <textarea
            value={metodos}
            onChange={(e) => setMetodos(e.target.value)}
            rows={2}
            placeholder="Visitas en sitio o remotas, entrevistas y revisión documental"
            className="entrada-campo leading-relaxed"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setOcupado(true);
            const r = await crearPrograma({ anio, alcance, objetivo, criterios, metodos });
            setOcupado(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) window.location.reload();
          }}
          disabled={!completo || ocupado}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Guardando…' : programa ? 'Guardar' : 'Crear el programa'}
        </button>
        {!completo && (
          <span className="text-11_5 text-muted">
            Los cuatro campos son del formato FOR-CAL-04 y ninguno es opcional.
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Programar un proceso
// ──────────────────────────────────────────────────────────────────────────────

function NuevaProgramada({
  programaId,
  procesos,
  personas,
  onCerrar,
  setAviso,
}: {
  programaId: number;
  procesos: string[];
  personas: { id: number; nombre: string }[];
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [proceso, setProceso] = useState(procesos[0] ?? '');
  const [meses, setMeses] = useState<number[]>([]);
  const [responsableId, setResponsableId] = useState('');
  const [plazo, setPlazo] = useState('4');
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-4 flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-14 font-bold text-primary">Programar un proceso</h2>
        <button onClick={onCerrar} className="text-12_5 text-muted">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Proceso</span>
          <select
            value={proceso}
            onChange={(e) => setProceso(e.target.value)}
            className="entrada-campo"
          >
            {procesos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Responsable</span>
          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir persona…</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Plazo del informe · días</span>
          <input
            value={plazo}
            onChange={(e) => setPlazo(e.target.value)}
            inputMode="numeric"
            className="entrada-campo font-mono"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="etiqueta-campo">Meses · se puede programar más de una vez al año</span>
        <div className="flex flex-wrap gap-1">
          {MESES.map((m, n) => {
            const mes = n + 1;
            const puesto = meses.includes(mes);
            return (
              <button
                key={n}
                onClick={() =>
                  setMeses(puesto ? meses.filter((x) => x !== mes) : [...meses, mes].sort((a, b) => a - b))
                }
                aria-pressed={puesto}
                aria-label={`Mes ${mes}`}
                className="h-8 w-8 rounded-campo font-mono text-11"
                style={{
                  background: puesto ? 'var(--hf-brand-nav)' : 'var(--hf-bg-surface)',
                  color: puesto ? '#ffffff' : 'var(--hf-text-secondary-soft)',
                  border: `1px solid ${puesto ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                  fontWeight: puesto ? 600 : 400,
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setOcupado(true);
            const r = await programarAuditoria({
              programaId,
              procesoRef: proceso,
              meses: meses.join(','),
              responsableId: Number(responsableId),
              plazoInformeDias: Number(plazo),
            });
            setOcupado(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) window.location.reload();
            else onCerrar();
          }}
          disabled={responsableId === '' || meses.length === 0 || ocupado}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Programando…' : 'Programar'}
        </button>
        {meses.length === 0 && (
          <span className="text-11_5 text-muted">
            Elegí al menos un mes: sin mes la fila no aparece en ninguna columna de la matriz.
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Crear la auditoría de una fila programada
// ──────────────────────────────────────────────────────────────────────────────

function CrearDesdeFila({
  fila,
  aprobados,
  setAviso,
}: {
  fila: FilaPrograma;
  aprobados: PerfilFila[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [liderId, setLiderId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [sitio, setSitio] = useState('Remota');
  const [ocupado, setOcupado] = useState(false);

  // Sólo los perfiles aprobados QUE SON del censo: un auditor externo no tiene `Persona`,
  // y `auditorLiderId` apunta a `Persona`. Ofrecerlo sería ofrecer algo que falla al enviar.
  const candidatos = aprobados.filter((p) => p.personaId !== null);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        disabled={candidatos.length === 0}
        title={
          candidatos.length === 0
            ? 'Hace falta un perfil de auditor aprobado del censo (C3).'
            : undefined
        }
        className="rounded-campo px-2.5 py-1 text-11 font-medium disabled:opacity-40"
        style={{ color: 'var(--hf-brand-nav)', border: '1px dashed var(--hf-brand-border)' }}
      >
        Crear
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-15 font-bold text-primary">Crear la auditoría</h2>
          <button onClick={() => setAbierto(false)} className="text-12_5 text-muted">
            Cancelar
          </button>
        </div>
        <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          Del proceso <strong className="font-semibold">{fila.proceso}</strong>. El objeto, el
          alcance y los criterios se heredan del programa; el plan de la matriz se arma
          después, en la ficha.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="etiqueta-campo">Auditor líder · con perfil aprobado</span>
            <select
              value={liderId}
              onChange={(e) => setLiderId(e.target.value)}
              className="entrada-campo"
            >
              <option value="">Elegir auditor…</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.personaId ?? ''}>
                  {p.nombre} · {p.certificacion}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Inicio</span>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="entrada-campo font-mono"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Sitio</span>
          <input
            value={sitio}
            onChange={(e) => setSitio(e.target.value)}
            placeholder="Remota, o la sede"
            className="entrada-campo"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setAbierto(false)}
            className="rounded-campo px-3 py-1.5 text-12 text-muted"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              setOcupado(true);
              const r = await crearAuditoria({
                programadaId: fila.id,
                fechaInicio: new Date(`${fechaInicio}T00:00:00.000Z`),
                sitio,
                objeto: `Auditoría interna · ${fila.proceso}`,
                alcance: fila.proceso,
                criterios: 'Programa del año',
                auditorLiderId: Number(liderId),
              });
              setOcupado(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) window.location.reload();
              else setAbierto(false);
            }}
            disabled={liderId === '' || ocupado}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {ocupado ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Aprobar un perfil de auditor (C3)
// ──────────────────────────────────────────────────────────────────────────────

function NuevoPerfil({
  personas,
  onCerrar,
  setAviso,
}: {
  personas: { id: number; nombre: string }[];
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [interno, setInterno] = useState(true);
  const [personaId, setPersonaId] = useState('');
  const [nombreExterno, setNombreExterno] = useState('');
  const [formacion, setFormacion] = useState('');
  const [certificacion, setCertificacion] = useState('');
  const [entidad, setEntidad] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [experiencia, setExperiencia] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const identificado = interno ? personaId !== '' : nombreExterno.trim() !== '';
  const completo =
    identificado &&
    formacion.trim() !== '' &&
    certificacion.trim() !== '' &&
    entidad.trim() !== '' &&
    vigencia !== '' &&
    experiencia.trim() !== '';

  return (
    <div className="mt-2 flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-14 font-bold text-primary">Aprobar un perfil de auditor</h2>
        <button onClick={onCerrar} className="text-12_5 text-muted">
          Cancelar
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Quién</span>
          <span className="flex gap-1.5">
            {(
              [
                [true, 'Del censo'],
                [false, 'Externo'],
              ] as const
            ).map(([v, etiqueta]) => (
              <button
                key={etiqueta}
                onClick={() => setInterno(v)}
                aria-pressed={interno === v}
                className="rounded-chip px-3.5 py-1.5 text-12"
                style={{
                  background: interno === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  color: interno === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  border: `1px solid ${interno === v ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                  fontWeight: interno === v ? 600 : 500,
                }}
              >
                {etiqueta}
              </button>
            ))}
          </span>
        </label>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
          <span className="etiqueta-campo">{interno ? 'Persona' : 'Nombre'}</span>
          {interno ? (
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="entrada-campo"
            >
              <option value="">Elegir persona…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={nombreExterno}
              onChange={(e) => setNombreExterno(e.target.value)}
              placeholder="Nombre del auditor externo"
              className="entrada-campo"
            />
          )}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Formación</span>
          <input
            value={formacion}
            onChange={(e) => setFormacion(e.target.value)}
            placeholder="Ingeniería industrial"
            className="entrada-campo"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Certificación</span>
          <input
            value={certificacion}
            onChange={(e) => setCertificacion(e.target.value)}
            placeholder="Auditor interno ISO 9001:2015"
            className="entrada-campo"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Entidad certificadora</span>
          <input
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            placeholder="ICONTEC"
            className="entrada-campo"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Vigencia</span>
            <input
              type="date"
              value={vigencia}
              onChange={(e) => setVigencia(e.target.value)}
              className="entrada-campo font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Experiencia · años</span>
            <input
              value={experiencia}
              onChange={(e) => setExperiencia(e.target.value)}
              inputMode="numeric"
              placeholder="3"
              className="entrada-campo font-mono"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setOcupado(true);
            const r = await aprobarPerfilAuditor({
              personaId: interno ? Number(personaId) : undefined,
              nombreExterno: interno ? undefined : nombreExterno,
              formacion,
              certificacion,
              entidadCertificadora: entidad,
              vigencia: new Date(`${vigencia}T00:00:00.000Z`),
              experienciaAnios: Number(experiencia),
            });
            setOcupado(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) window.location.reload();
            else onCerrar();
          }}
          disabled={!completo || ocupado}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Aprobando…' : 'Aprobar el perfil'}
        </button>
        <span className="text-11_5 text-muted">
          Queda con quién lo aprobó y cuándo: es la evidencia de C3.
        </span>
      </div>
    </div>
  );
}
