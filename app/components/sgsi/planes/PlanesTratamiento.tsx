'use client';

// app/components/sgsi/planes/PlanesTratamiento.tsx
//
// Handoff v2.1 screen 8. The double-layer maturity bar is the piece that carries the
// most meaning per pixel: the pale layer marks the target and the solid one the current
// state, so the gap between them IS the pending work, readable without arithmetic.

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { eficaciaDeNivel } from '@/lib/sgsi/madurez';
import {
  cambiarEstadoAccion,
  darDeBajaAccion,
  restaurarAccion,
} from '@/app/sgsi/acciones/plan';
import type { EstadoAccion } from '@prisma/client';
import PopupAccion from './PopupAccion';

export interface AccionVista {
  codigo: string;
  accion: string;
  tipo: string;
  origen: string;
  responsable: string;
  aprueba: string;
  fechaObjetivo: string | null;
  fechaAprobacion: string | null;
  estado: string;
  avance: number;
  verificacion: string;
  observacion: string | null;
  recursos: string | null;
  madurezAlcanzada: number | null;
  justificacionAceptacion: string | null;
  control: {
    codigo: string;
    nombre: string;
    capacidad: string;
    lineaBase: number | null;
    actual: number | null;
    objetivo: number | null;
  } | null;
  riesgosQueMueve: number | null;
  controlId: number | null;
  responsableId: number;
  apruebaId: number;
  madurezAlcanzadaId: number | null;
  instrumento: string | null;
  riesgoRemanente: string | null;
  fechaRevisionAceptacion: string | null;
}

export interface OpcionControl {
  id: number;
  codigo: string;
  nombre: string;
}

export interface Opcion {
  id: number;
  nombre: string;
}

export interface OpcionMadurez {
  id: number;
  nivel: number;
  nombre: string;
}

const ESTADOS: Record<string, string> = {
  NO_INICIADA: 'No iniciada',
  EN_EJECUCION: 'En ejecución',
  EN_VERIFICACION: 'En verificación',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const TIPOS: Record<string, string> = {
  MITIGAR: 'Mitigar',
  TRANSFERIR: 'Transferir',
  EVITAR: 'Evitar',
  ACEPTAR: 'Aceptar',
};

const VERIFICACIONES: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  VERIFICADA_EFICAZ: 'Verificada — eficaz',
  VERIFICADA_NO_EFICAZ: 'Verificada — no eficaz',
  NO_APLICA: 'No aplica',
};

/// CMM traffic light: L0-L1 red, L2-L3 orange, L4-L5 green. L3 is orange.
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

function nivelTexto(v: number | null): string {
  return v === null ? '—' : `L${v}`;
}

type Filtro = 'todas' | 'NO_INICIADA' | 'EN_EJECUCION' | 'CERRADA' | 'MITIGAR' | 'ACEPTAR';

export default function PlanesTratamiento({
  acciones,
  alcanceCalculable,
  controles,
  cargos,
  madurez,
}: {
  acciones: AccionVista[];
  alcanceCalculable: boolean;
  controles: OpcionControl[];
  cargos: Opcion[];
  madurez: OpcionMadurez[];
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [estados, setEstados] = useState<Record<string, string>>({});
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  // The edit popup, addressed by action code so a refresh re-reads the row.
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  // The state select persists on change: it is one field, and holding it locally would
  // mean a KPI on this very screen disagreeing with the database until someone
  // remembered to save.
  const cambiarEstado = (codigo: string, estado: string): void => {
    setEstados((s) => ({ ...s, [codigo]: estado }));
    iniciar(async () => {
      const r = await cambiarEstadoAccion(codigo, estado as EstadoAccion);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEstados((s) => {
          const { [codigo]: _quitado, ...resto } = s;
          return resto;
        });
        router.refresh();
      }
    });
  };

  const darDeBaja = (codigo: string, motivo: string): void => {
    iniciar(async () => {
      const r = await darDeBajaAccion(codigo, motivo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEliminadas((e) => [...e, codigo]);
        setAbierta(null);
        router.refresh();
      }
    });
  };

  const deshacerBaja = (codigo: string): void => {
    iniciar(async () => {
      const r = await restaurarAccion(codigo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEliminadas((e) => e.filter((c) => c !== codigo));
        router.refresh();
      }
    });
  };

  const vigentes = useMemo(
    () =>
      acciones
        .filter((a) => !eliminadas.includes(a.codigo))
        .map((a) => ({ ...a, estado: estados[a.codigo] ?? a.estado })),
    [acciones, eliminadas, estados],
  );

  const visibles = vigentes.filter((a) => {
    if (filtro === 'todas') return true;
    if (filtro === 'MITIGAR' || filtro === 'ACEPTAR') return a.tipo === filtro;
    return a.estado === filtro;
  });

  // Pending maturity jump: the sum of what every action still has to climb.
  const saltoPendiente = vigentes.reduce((suma, a) => {
    if (!a.control) return suma;
    return suma + Math.max(0, (a.control.objetivo ?? 0) - (a.control.actual ?? 0));
  }, 0);

  const riesgosAlcanzados = alcanceCalculable
    ? vigentes.reduce((s, a) => s + (a.riesgosQueMueve ?? 0), 0)
    : null;

  const kpis = [
    { titulo: 'Acciones en el plan', valor: vigentes.length },
    { titulo: 'De mitigación', valor: vigentes.filter((a) => a.tipo === 'MITIGAR').length },
    { titulo: 'Cerradas', valor: vigentes.filter((a) => a.estado === 'CERRADA').length },
    { titulo: 'Sin iniciar', valor: vigentes.filter((a) => a.estado === 'NO_INICIADA').length },
    { titulo: 'Salto pendiente', valor: saltoPendiente, pie: 'Σ máx(0, objetivo − actual)' },
    {
      titulo: 'Riesgos alcanzados',
      valor: riesgosAlcanzados ?? 'sin calcular',
      pie: alcanceCalculable ? 'sobre el inventario real' : 'falta el cruce control-amenaza',
    },
  ];

  const ultimaEliminada = eliminadas[eliminadas.length - 1];

  return (
    <main className="px-8 pt-6 pb-14">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pagina">Planes de tratamiento</h1>
          <p className="mt-1 font-mono text-10_5 tracking-[0.06em] text-faint">
            PLA-SIG-02 · ISO/IEC 27001:2022 cláusulas 6.1.3 y 8.3
          </p>
          <p className="parrafo mt-2 text-muted">
            Una fila por acción, no por riesgo: la unidad de gestión es la mejora de un
            control, porque al subir su madurez bajan de golpe todos los riesgos que ese
            control mitiga.
          </p>
        </div>

        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          <option value="todas">Todas</option>
          <option value="NO_INICIADA">No iniciada</option>
          <option value="EN_EJECUCION">En curso</option>
          <option value="CERRADA">Cerrada</option>
          <option value="MITIGAR">Solo mitigar</option>
          <option value="ACEPTAR">Solo aceptar</option>
        </select>
      </header>

      {aviso && (
        <div
          className="mb-4 rounded-campo border px-4 py-2.5 text-12"
          style={
            aviso.ok
              ? {
                  borderColor: 'var(--hf-accent-border)',
                  background: 'var(--hf-accent-100)',
                  color: 'var(--hf-accent-700)',
                }
              : {
                  borderColor: 'var(--hf-danger-border)',
                  background: 'var(--hf-danger-bg)',
                  color: 'var(--hf-danger-text)',
                }
          }
        >
          {aviso.texto}
        </div>
      )}

      {ultimaEliminada && (
        <div className="mb-4 flex items-center justify-between rounded-campo border border-danger-border bg-danger-bg px-4 py-2.5">
          <span className="text-12 text-danger-text">
            Se dio de baja la acción <span className="font-mono">{ultimaEliminada}</span>. La
            baja es lógica y quedó en la bitácora con su motivo.
          </span>
          <button
            onClick={() => deshacerBaja(ultimaEliminada)}
            disabled={pendiente}
            className="rounded-campo border border-danger-border px-3 py-1 font-mono text-10_5 uppercase tracking-[0.1em] text-danger-text transition-colors hover:bg-surface disabled:opacity-50"
          >
            {pendiente ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.titulo} className="rounded-tarjeta border border-border-default bg-surface px-4 py-3">
            <p className="etiqueta-campo">{k.titulo}</p>
            <p className="cifra mt-1.5 text-22 text-primary">{k.valor}</p>
            {k.pie && <p className="mt-1 text-10 leading-tight text-faint">{k.pie}</p>}
          </div>
        ))}
      </div>

      <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
        <div style={{ minWidth: 1420 }}>
          <table className="w-full border-collapse text-12">
            <thead>
              <tr className="bg-subtle text-left">
                <Th ancho={78}>Código</Th>
                <Th>Acción</Th>
                <Th ancho={92}>Tipo</Th>
                <Th ancho={100}>Control</Th>
                <Th ancho={220}>Madurez actual → objetivo</Th>
                <Th ancho={62}>Salto</Th>
                <Th ancho={120}>Riesgos</Th>
                <Th ancho={150}>Responsable</Th>
                <Th ancho={140}>Fecha objetivo</Th>
                <Th ancho={150}>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const estaAbierta = abierta === a.codigo;
                const salto = a.control
                  ? Math.max(0, (a.control.objetivo ?? 0) - (a.control.actual ?? 0))
                  : 0;
                return (
                  <tr
                    key={a.codigo}
                    onClick={() => setAbierta(estaAbierta ? null : a.codigo)}
                    style={{
                      background: estaAbierta ? 'var(--hf-accent-50)' : 'var(--hf-row-blanco)',
                    }}
                    className="cursor-pointer border-t border-hairline align-middle"
                  >
                    <Td>
                      <span className="font-mono text-11 text-secondary">{a.codigo}</span>
                    </Td>
                    <Td>
                      <span className="text-12_5 text-primary">{a.accion}</span>
                    </Td>
                    <Td>
                      <span className="rounded-badge bg-subtle px-2 py-0.5 font-mono text-10 text-muted">
                        {TIPOS[a.tipo] ?? a.tipo}
                      </span>
                    </Td>
                    <Td>
                      {a.control ? (
                        <Link
                          href="/sgsi/controles"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-11 text-accent-700 underline decoration-accent-border underline-offset-2"
                        >
                          {a.control.codigo}
                        </Link>
                      ) : (
                        <span className="text-11 text-faint">—</span>
                      )}
                    </Td>
                    <Td>
                      <BarraDoble control={a.control} />
                    </Td>
                    <Td>
                      <span className="font-mono text-11 tabular-nums text-secondary">
                        {salto > 0 ? `+${salto}` : '0'}
                      </span>
                    </Td>
                    <Td>
                      {a.riesgosQueMueve === null ? (
                        <span className="text-10_5 text-faint">sin calcular</span>
                      ) : (
                        <span className="font-mono text-11 tabular-nums text-secondary">
                          {a.riesgosQueMueve}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-11_5 text-muted">{a.responsable}</span>
                    </Td>
                    <Td>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-11 text-muted">
                          {a.fechaObjetivo ?? '—'}
                        </span>
                        {/* The bar was length and colour only, which reads as nothing to
                            anyone who cannot see it. The figure carries the meaning and
                            the bar is decoration, so it is hidden from the reader. */}
                        <span className="font-mono text-10 tabular-nums text-faint">
                          {a.avance}%
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="mt-1 block h-1.5 w-full overflow-hidden rounded-swatch bg-hairline"
                      >
                        <span
                          className="block h-full rounded-swatch bg-accent-500"
                          style={{ width: `${a.avance}%` }}
                        />
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditando(a.codigo);
                          }}
                          aria-label={`Editar la acción ${a.codigo}`}
                          title="Editar la acción"
                          className="h-6 w-6 flex-none rounded-campo border border-border-field text-11 leading-none text-muted transition-colors hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                        >
                          ✎
                        </button>
                      <select
                        value={a.estado}
                        disabled={pendiente}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => cambiarEstado(a.codigo, e.target.value)}
                        className="w-full rounded-campo border border-border-field bg-surface px-2 py-1 text-11 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-60"
                      >
                        {Object.entries(ESTADOS).map(([clave, etiqueta]) => (
                          <option key={clave} value={clave}>
                            {etiqueta}
                          </option>
                        ))}
                      </select>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <PopupAccion
          accion={vigentes.find((a) => a.codigo === editando)!}
          controles={controles}
          cargos={cargos}
          madurez={madurez}
          onCerrar={() => setEditando(null)}
        />
      )}

      {abierta && (
        <Detalle
          accion={visibles.find((a) => a.codigo === abierta)!}
          pendiente={pendiente}
          onEliminar={darDeBaja}
        />
      )}

      <p className="mt-5 text-11 text-faint">
        Mostrando {visibles.length} de {vigentes.length} acciones. Al cerrar una acción se
        registra la madurez alcanzada y el residual de los riesgos afectados se recalcula
        solo.
      </p>
    </main>
  );
}

/// Two layers: the pale one marks the target, the solid one the current state. The gap
/// between them is the pending work, readable without doing arithmetic.
function BarraDoble({ control }: { control: AccionVista['control'] }) {
  if (!control) return <span className="text-11 text-faint">—</span>;

  const actual = control.actual ?? 0;
  const objetivo = control.objetivo ?? 0;
  const sActual = semaforo(control.actual);
  const sObjetivo = semaforo(control.objetivo);

  return (
    <span className="flex items-center gap-2">
      <span
        className="rounded-badge border px-1.5 py-0.5 font-mono text-9_5"
        style={{ color: sActual.fg, background: sActual.bg, borderColor: sActual.bd }}
      >
        {nivelTexto(control.actual)}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-swatch bg-hairline">
        <span
          className="absolute inset-y-0 left-0 rounded-swatch"
          style={{ width: `${(objetivo / 5) * 100}%`, background: sObjetivo.bg }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-swatch"
          style={{ width: `${(actual / 5) * 100}%`, background: sActual.fg }}
        />
      </span>
      <span
        className="rounded-badge border px-1.5 py-0.5 font-mono text-9_5"
        style={{ color: sObjetivo.fg, background: sObjetivo.bg, borderColor: sObjetivo.bd }}
      >
        {nivelTexto(control.objetivo)}
      </span>
    </span>
  );
}

function Detalle({
  accion,
  pendiente,
  onEliminar,
}: {
  accion: AccionVista;
  pendiente: boolean;
  onEliminar: (codigo: string, motivo: string) => void;
}) {
  // The reason is asked for BEFORE the delete, not after it fails: the action requires
  // it, so a button that could be refused is a button that should not be pressable.
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const versiones = [
    { titulo: 'Versión inicial', nivel: accion.control?.lineaBase ?? null },
    { titulo: 'Madurez actual', nivel: accion.control?.actual ?? null, actual: true },
    { titulo: 'Versión objetivo', nivel: accion.control?.objetivo ?? null },
  ];

  return (
    <section className="mt-4 rounded-tarjeta border border-border-default bg-subtle p-5">
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <p className="etiqueta-campo">Origen y justificación</p>
          <p className="parrafo mt-1.5 text-11_5">{accion.origen}</p>
        </div>

        <div>
          <p className="etiqueta-campo">Control asociado</p>
          {accion.control ? (
            <>
              <p className="mt-1.5 text-11_5 text-secondary">
                <span className="font-mono">{accion.control.codigo}</span>{' '}
                {accion.control.nombre}
              </p>
              <p className="mt-1 text-11 text-faint">{accion.control.capacidad}</p>
            </>
          ) : (
            <p className="mt-1.5 text-11_5 text-faint">sin control asociado</p>
          )}
          {accion.recursos && (
            <>
              <p className="etiqueta-campo mt-3">Recursos</p>
              <p className="mt-1 text-11_5 text-muted">{accion.recursos}</p>
            </>
          )}
        </div>

        <div>
          <p className="etiqueta-campo">Aprobación y verificación</p>
          <p className="mt-1.5 text-11_5 text-secondary">
            Aprueba {accion.aprueba}
            {accion.fechaAprobacion && (
              <span className="font-mono text-11 text-faint"> · {accion.fechaAprobacion}</span>
            )}
          </p>
          <p className="mt-1 text-11_5 text-muted">
            {VERIFICACIONES[accion.verificacion] ?? accion.verificacion}
            {accion.madurezAlcanzada !== null && ` · alcanzó ${nivelTexto(accion.madurezAlcanzada)}`}
          </p>
          {accion.observacion && (
            <p className="parrafo mt-2 text-11 text-muted">{accion.observacion}</p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
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
              <p className="cifra mt-1 text-20" style={{ color: s.fg }}>
                {nivelTexto(v.nivel)}
              </p>
              <p className="mt-0.5 font-mono text-10" style={{ color: s.fg }}>
                eficacia {Math.round(eficaciaDeNivel(v.nivel) * 100)}%
              </p>
            </div>
          );
        })}
      </div>

      {confirmando ? (
        <div className="mt-5 rounded-campo border border-danger-border bg-danger-bg p-4">
          <p className="etiqueta-campo" style={{ color: 'var(--hf-danger-text)' }}>
            Motivo de la baja · obligatorio
          </p>
          <p className="mt-1 text-11 text-danger-text">
            La acción no se borra: sale de la grilla y de los KPI, y el motivo queda en la
            bitácora con tu nombre y la fecha.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Por qué sale del plan"
            className="mt-2 w-full rounded-campo border border-danger-border bg-surface px-3 py-2 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
          <div className="mt-2.5 flex justify-end gap-2">
            <button
              onClick={() => {
                setConfirmando(false);
                setMotivo('');
              }}
              className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              onClick={() => onEliminar(accion.codigo, motivo)}
              disabled={pendiente || motivo.trim() === ''}
              title={motivo.trim() === '' ? 'Escribí el motivo para poder dar de baja' : undefined}
              className="rounded-campo px-3 py-1.5 font-mono text-10_5 uppercase tracking-[0.1em] text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--hf-danger-text)' }}
            >
              {pendiente ? 'Dando de baja…' : 'Confirmar la baja'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setConfirmando(true)}
            className="rounded-campo border border-danger-border px-3 py-1.5 font-mono text-10_5 uppercase tracking-[0.1em] text-danger-text hover:bg-danger-bg"
          >
            Dar de baja la acción
          </button>
        </div>
      )}
    </section>
  );
}

function Th({ children, ancho }: { children: React.ReactNode; ancho?: number }) {
  return (
    <th
      style={ancho ? { width: ancho } : undefined}
      className="etiqueta-campo px-3 py-2.5 font-normal"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
