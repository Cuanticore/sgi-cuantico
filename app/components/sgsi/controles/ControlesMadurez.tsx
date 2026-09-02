'use client';

// app/components/sgsi/controles/ControlesMadurez.tsx
//
// Handoff v2.1 screen 5. Every figure here is recomputed from the current maturity
// levels through lib/sgsi/madurez.ts — the same module the seed verifies against the
// workbook — so dragging a select moves the header, the cards and both analysis
// panels at once, and no number is ever read from a stored aggregate.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  eficaciaDeNivel,
  esAplicable,
  media,
  mediana,
  metricasMadurez,
  type ControlMadurez,
  type EstadoSoa,
} from '@/lib/sgsi/madurez';
import { cambiarEstadoSoa, guardarMadurez } from '@/app/sgsi/acciones/controles';
import PantallaControl from './PantallaControl';

export interface ControlVista {
  codigo: string;
  nombre: string;
  dominio: string;
  capacidad: string;
  capacidadCorta: string;
  soa: EstadoSoa;
  lineaBase: number | null;
  actual: number | null;
  objetivo: number | null;
  evidencias: {
    id: number;
    tipo: string;
    texto: string;
    /// The entry that justified the rating. It has no delete button.
    esBase: boolean;
    creadaPor: string | null;
    creadaEn: string | null;
    activo: boolean;
    archivoNombre: string | null;
    archivoMime: string | null;
    archivoTamano: number | null;
    archivoSha256: string | null;
    archivoVersion: number | null;
  }[];
  amenazas: { codigo: string; nombre: string }[];
  accion: { codigo: string; estado: string } | null;
  justificacionSoa: string | null;
  soaActualizadoPor: string | null;
  soaActualizadoEn: string | null;
  soaDescripcion: string | null;
  soaDocumento: string | null;
  soaVersion: string | null;
  soaFecha: string | null;
  soaAprobadoPor: string | null;
  soaAlcanceAdaptado: boolean;
  /// Hallazgos abiertos del módulo B originados en este control (B11).
  hallazgosAbiertos: { codigo: string; descripcion: string }[];
  /// El id numérico del control. Es la referencia que guarda el hallazgo (`origenReferencia`),
  /// así que sin él no se puede enlazar a «Nuevo» con el vínculo ya tipado.
  id: number;
}

interface Props {
  controles: ControlVista[];
  capacidades: string[];
  dominios: string[];
  filtroInicial?: string;
  capacidadInicial?: string;
  dominioInicial?: string;
  directorio?: { nombre: string; correo: string }[];
}

/// The scale label carries its efficacy, in the select and in the distribution alike.
const ESCALA = [
  { nivel: 0, nombre: 'Inexistente' },
  { nivel: 1, nombre: 'Inicial / ad hoc' },
  { nivel: 2, nombre: 'Reproducible pero intuitivo' },
  { nivel: 3, nombre: 'Proceso definido' },
  { nivel: 4, nombre: 'Gestionado y medible' },
  { nivel: 5, nombre: 'Optimizado' },
];

function etiquetaEscala(nivel: number): string {
  const e = ESCALA[nivel];
  return `L${nivel} — ${e.nombre} · ${Math.round(eficaciaDeNivel(nivel) * 100)}%`;
}

/// Levels print as "L3", never "L3,0". The decimal survives only when it is not zero,
/// which happens for a median across an even count.
function nivelTexto(v: number | null): string {
  if (v === null) return '—';
  const redondeado = Math.round(v * 10) / 10;
  return `L${redondeado.toString().replace('.', ',')}`;
}

/// The typographic minus, never a hyphen.
function delta(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (r === 0) return '0';
  return r > 0 ? `+${r}` : `−${Math.abs(r)}`;
}

/// CMM traffic light: L0-L1 red, L2-L3 orange, L4-L5 green. L3 is orange — a defined
/// process is not yet the target.
function semaforo(nivel: number | null): { fg: string; bg: string; bd: string } {
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

type Filtro =
  | { tipo: 'todos' }
  | { tipo: 'brechas' }
  | { tipo: 'gestionados' }
  | { tipo: 'objetivo' }
  | { tipo: 'plan' }
  | { tipo: 'parciales' }
  | { tipo: 'noAplican' }
  | { tipo: 'dominio'; valor: string }
  | { tipo: 'capacidad'; valor: string };

const ESTILO_SOA: Record<EstadoSoa, { fg: string; bg: string; bd: string }> = {
  si: { fg: '#12437f', bg: '#f7f9fd', bd: '#d3dceb' },
  parcial: { fg: '#8a4407', bg: '#fff3e6', bd: '#f2b473' },
  no: { fg: '#8a938e', bg: '#f5f7f6', bd: '#e2e6e3' },
};

const ETIQUETA_SOA: Record<EstadoSoa, string> = {
  si: 'Aplica',
  parcial: 'Aplica con alcance adaptado',
  no: 'No aplica',
};

export default function ControlesMadurez({
  controles,
  capacidades,
  dominios,
  filtroInicial,
  capacidadInicial,
  dominioInicial,
  directorio = [],
}: Props) {
  const [niveles, setNiveles] = useState<Record<string, number>>({});
  const [filtro, setFiltro] = useState<Filtro>(() => {
    if (filtroInicial === 'noAplican' || filtroInicial === 'parciales') {
      return { tipo: filtroInicial };
    }
    if (dominioInicial && dominios.includes(dominioInicial)) {
      return { tipo: 'dominio', valor: dominioInicial };
    }
    if (capacidadInicial && capacidades.includes(capacidadInicial)) {
      return { tipo: 'capacidad', valor: capacidadInicial };
    }
    return { tipo: 'todos' };
  });
  const [abierto, setAbierto] = useState<string | null>(null);
  // The administration popup, addressed by control code so a refresh re-reads the row.
  const [administrando, setAdministrando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciarGuardado] = useTransition();
  const router = useRouter();

  // Saving a maturity level is not a local edit: efficacy derives from it and every risk
  // the control mitigates moves with it, so the action recalculates and the screen
  // refreshes from the server rather than trusting its own copy.
  const guardar = (): void => {
    const cambios = Object.entries(niveles).map(([codigoControl, nivel]) => ({
      codigoControl,
      nivel,
    }));
    iniciarGuardado(async () => {
      const r = await guardarMadurez(cambios);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setNiveles({});
        router.refresh();
      }
    });
  };

  const conNivel = useMemo(
    () => controles.map((c) => ({ ...c, actual: niveles[c.codigo] ?? c.actual })),
    [controles, niveles],
  );

  const m = useMemo(
    () =>
      metricasMadurez(
        conNivel.map<ControlMadurez>((c) => ({
          soa: c.soa,
          lineaBase: c.lineaBase,
          actual: c.actual,
          objetivo: c.objetivo,
        })),
      ),
    [conNivel],
  );

  // The index before any edit, so the header can show what moved.
  const indiceOriginal = useMemo(
    () =>
      metricasMadurez(
        controles.map<ControlMadurez>((c) => ({
          soa: c.soa,
          lineaBase: c.lineaBase,
          actual: c.actual,
          objetivo: c.objetivo,
        })),
      ).indice,
    [controles],
  );

  const visibles = useMemo(() => conNivel.filter((c) => pasa(c, filtro)), [conNivel, filtro]);
  const aplicables = conNivel.filter((c) => esAplicable(c.soa));
  const sinGuardar = Object.keys(niveles).length;

  const tarjetas = [
    {
      clave: 'todos',
      titulo: 'Controles del Anexo A',
      valor: m.total,
      pie: `${m.aplicables} aplicables · ${m.parciales} con alcance adaptado · ${m.noAplicables} no aplican`,
    },
    { clave: 'indice', titulo: 'Índice de madurez', valor: `${m.indice.toFixed(1)}%`, pie: 'media de la eficacia' },
    { clave: 'tipico', titulo: 'Nivel típico', valor: nivelTexto(m.nivelTipico), pie: 'mediana del nivel' },
    { clave: 'gestionados', titulo: 'Gestionados en L3+', valor: m.enL3, pie: `${m.pctL3.toFixed(1)}%` },
    { clave: 'objetivo', titulo: 'Cumplen su objetivo', valor: m.enObjetivo, pie: `de ${m.aplicables}` },
    { clave: 'brechas', titulo: 'Brechas prioritarias', valor: m.brechas, pie: 'en L2 o menos' },
  ] as const;

  return (
    <main className="px-8 pt-6 pb-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pagina">Controles y madurez</h1>
          <p className="mt-1 text-12_5 text-muted">
            {m.total} controles del Anexo A · índice{' '}
            <span className="font-mono font-semibold text-secondary">{m.indice.toFixed(1)}%</span>
            {sinGuardar > 0 && (
              <>
                {' '}
                <span className="font-mono text-warn-text">
                  ({delta(m.indice - indiceOriginal)} pts · {sinGuardar} sin guardar)
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {sinGuardar > 0 && (
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              {guardando
                ? 'Guardando…'
                : `Guardar ${sinGuardar} ${sinGuardar === 1 ? 'cambio' : 'cambios'}`}
            </button>
          )}
          {sinGuardar > 0 && !guardando && (
            <button
              onClick={() => {
                setNiveles({});
                setAviso(null);
              }}
              className="rounded-campo border border-border-field px-3 py-2 text-12 text-muted transition-colors hover:bg-subtle"
            >
              Descartar
            </button>
          )}
          <select
            value={claveFiltro(filtro)}
            onChange={(e) => setFiltro(desdeClave(e.target.value))}
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          >
            <option value="todos">Todos</option>
            <option value="brechas">Solo brechas L2−</option>
            <option value="gestionados">Solo gestionados L3+</option>
            <option value="objetivo">Solo en objetivo</option>
            <option value="plan">Solo en el plan de tratamiento</option>
            <option value="parciales">Solo alcance adaptado</option>
            <option value="noAplican">Solo no aplicables</option>
            <optgroup label="Dominio del Anexo A">
              {dominios.map((d) => (
                <option key={d} value={`dominio:${d}`}>
                  {d}
                </option>
              ))}
            </optgroup>
            <optgroup label="Capacidad operativa">
              {capacidades.map((c) => (
                <option key={c} value={`capacidad:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
          </select>
          <a
            href="/api/sgsi/declaracion-soa"
            target="_blank"
            className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-secondary transition-colors hover:bg-accent-50"
            title="Exportar la declaración de aplicabilidad (.xlsx)"
          >
            Exportar declaración de aplicabilidad
          </a>
        </div>
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

      {/* Six filter cards, Power BI style: pressing one applies its filter, pressing it
          again removes it. Cards whose target IS the current filter all read active. */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tarjetas.map((t) => {
          const activa = claveFiltro(filtro) === t.clave;
          return (
            <button
              key={t.clave}
              onClick={() => setFiltro(activa ? { tipo: 'todos' } : desdeClave(t.clave))}
              className={`rounded-tarjeta border bg-surface px-4 py-3 text-left transition-colors ${
                activa
                  ? 'border-accent-500 bg-accent-50'
                  : 'border-border-default hover:bg-accent-50'
              }`}
            >
              <p className="etiqueta-campo">{t.titulo}</p>
              <p className="cifra mt-1.5 text-24 text-primary">{t.valor}</p>
              <p className="mt-1 text-10_5 text-faint">{t.pie}</p>
            </button>
          );
        })}
      </div>

      {/* Fixed two-column grid, not a responsive breakpoint: the handoff specifies
          1fr 1fr and the two cards are meant to be read side by side. */}
      <div className="mb-6 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Distribucion controles={aplicables} />
        <PorDominio controles={aplicables} dominios={dominios} />
      </div>

      <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
        <div style={{ minWidth: 1340 }}>
          <table className="w-full border-collapse text-12" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 30 }} />
              <col style={{ width: 76 }} />
              <col style={{ minWidth: 200 }} />
              <col style={{ width: 118 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 214 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 108 }} />
            </colgroup>
            <thead>
              <tr className="bg-subtle text-left">
                <Th>
                  <span className="sr-only">Vista previa</span>
                </Th>
                <Th>CÓDIGO</Th>
                <Th>CONTROL</Th>
                <Th>DOMINIO</Th>
                <Th>CAPACIDAD OPERATIVA</Th>
                <Th>
                  <span
                    className="block font-mono text-center"
                    style={{ fontSize: 8.5, color: '#12437f' }}
                  >
                    APLICA · SOA
                  </span>
                </Th>
                <Th>MADUREZ ACTUAL</Th>
                <Th>BASE</Th>
                <Th>OBJET.</Th>
                <Th>EFICACIA</Th>
                <Th>EVIDENCIA·PLAN</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const s = semaforo(c.actual);
                const estaAbierto = abierto === c.codigo;
                // Precedence: open beats non-applicable, which beats white.
                const fondo = estaAbierto
                  ? 'var(--hf-accent-50)'
                  : !esAplicable(c.soa)
                    ? '#fbfcfb'
                    : 'var(--hf-row-blanco)';
                const soaEstilo = ESTILO_SOA[c.soa];

                return (
                  <tr
                    key={c.codigo}
                    onClick={() => setAdministrando(c.codigo)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setAdministrando(c.codigo);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Administrar el control ${c.codigo} ${c.nombre}`}
                    style={{ background: fondo }}
                    className="cursor-pointer border-t border-hairline align-middle"
                  >
                    <Td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAbierto(estaAbierto ? null : c.codigo);
                        }}
                        title="Vista previa"
                        aria-label={`Vista previa del control ${c.codigo}`}
                        aria-expanded={estaAbierto}
                        className="h-5 w-5 rounded-campo text-11 leading-none text-muted transition-transform hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                      >
                        <span style={{ transform: estaAbierto ? 'rotate(90deg)' : undefined, display: 'inline-block' }}>
                          ▸
                        </span>
                      </button>
                    </Td>
                    <Td>
                      <span className="font-mono text-11 text-secondary">{c.codigo}</span>
                    </Td>
                    <Td>
                      <span
                        className="text-12_5 text-primary"
                        style={{
                          color: !esAplicable(c.soa) ? '#8a938e' : undefined,
                        }}
                      >
                        {c.nombre}
                        {!esAplicable(c.soa) && (
                          <span className="ml-2 rounded-badge bg-[var(--hf-cmm-nulo-bg)] px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-faint">
                            no aplica
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-11_5 text-muted">{c.dominio}</span>
                    </Td>
                    <Td>
                      <span className="text-11_5 text-muted" title={c.capacidad}>
                        {c.capacidadCorta}
                      </span>
                    </Td>
                    <Td>
                      <SelectSoa
                        control={c}
                        onAviso={setAviso}
                        onCambio={() => setAbierto(null)}
                      />
                    </Td>
                    <Td>
                      {esAplicable(c.soa) ? (
                        <select
                          value={c.actual === null ? '' : c.actual}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value === '') return;
                            setNiveles((n) => ({ ...n, [c.codigo]: Number(e.target.value) }));
                          }}
                          style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
                          className="w-full rounded-campo border px-2 py-1 font-mono text-11 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                        >
                          <option value="" disabled style={{ color: 'var(--hf-text-faint)' }}>
                            Por evaluar
                          </option>
                          {ESCALA.map((e) => (
                            <option key={e.nivel} value={e.nivel}>
                              {etiquetaEscala(e.nivel)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-11 text-faint">—</span>
                      )}
                    </Td>
                    <Td>
                      {c.lineaBase === null ? (
                        <span
                          className="inline-flex rounded-chip px-2 py-0.5 font-mono text-10"
                          style={{
                            color: 'var(--hf-cmm-nulo-fg)',
                            background: 'var(--hf-cmm-nulo-bg)',
                            border: '1px solid var(--hf-cmm-nulo-bd)',
                          }}
                          title="El GAP de marzo de 2026 no evaluó este control. Debe valorarse antes de cerrar la línea base; la media no lo cuenta."
                        >
                          Sin evaluar
                        </span>
                      ) : (
                        <span className="font-mono text-11 text-muted">
                          {nivelTexto(c.lineaBase)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="font-mono text-11 text-muted">{nivelTexto(c.objetivo)}</span>
                    </Td>
                    <Td>
                      <BarraEficacia nivel={c.actual} aplica={esAplicable(c.soa)} />
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <BadgeEvidencia n={c.evidencias.length} />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdministrando(c.codigo);
                          }}
                          aria-label={`Administrar el control ${c.codigo}`}
                          title="Administrar el control"
                          className="h-6 w-6 flex-none rounded-campo border border-border-field text-11 leading-none text-muted transition-colors hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                        >
                          ✎
                        </button>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <Detalle control={conNivel.find((c) => c.codigo === abierto)!} />
      )}

      {administrando && (() => {
        const idx = controles.findIndex((c) => c.codigo === administrando);
        const abiertoVino = idx >= 0 ? controles[idx] : null;
        return (
          <PantallaControl
            control={abiertoVino!}
            onCerrar={() => setAdministrando(null)}
            onNavegar={(codigo) => setAdministrando(codigo)}
            directorio={directorio}
            hallazgosAbiertos={abiertoVino!.hallazgosAbiertos}
            navegacion={{
              anterior: idx > 0 ? controles[idx - 1].codigo : null,
              siguiente: idx >= 0 && idx < controles.length - 1 ? controles[idx + 1].codigo : null,
            }}
          />
        );
      })()}

      <p className="mt-5 text-11 text-faint">
        Mostrando {visibles.length} de {m.total} controles. El índice es la media de la
        eficacia de los aplicables; el nivel típico es la mediana del nivel. El nivel medio
        se conserva solo como referencia entre periodos.
      </p>
    </main>
  );
}

function Distribucion({ controles }: { controles: ControlVista[] }) {
  // The bar is a share of the controls actually EVALUATED, not of every applicable one:
  // «Sin evaluar» (A.7.13) y «Por evaluar» (los siete de alcance adaptado) no son L0.
  const evaluados = controles.filter((c) => c.actual !== null);
  const total = evaluados.length;
  const porNivel = (nivel: number, campo: 'lineaBase' | 'actual' | 'objetivo') =>
    controles.filter((c) => c[campo] === nivel).length;
  const pendientes = controles.length - evaluados.length;

  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <h2 className="etiqueta-campo">Distribución por nivel</h2>
      {pendientes > 0 && (
        <p className="mt-1 text-10 text-faint">
          {pendientes} control{pendientes === 1 ? '' : 'es'} fuera de la distribución:
          {controles
            .filter((c) => c.actual === null)
            .map((c) => c.codigo)
            .join(', ')} — valoración pendiente.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {ESCALA.map((e) => {
          const actual = porNivel(e.nivel, 'actual');
          const base = porNivel(e.nivel, 'lineaBase');
          const objetivo = porNivel(e.nivel, 'objetivo');
          const s = semaforo(e.nivel);
          // The bar is a share of the APPLICABLE controls, not of the biggest bucket,
          // so the levels stay comparable between rows.
          const ancho = total === 0 ? 0 : (actual / total) * 100;

          return (
            <div key={e.nivel} className="text-11">
              <div className="flex items-baseline justify-between">
                <span className="text-secondary">{etiquetaEscala(e.nivel)}</span>
                <span className="font-mono text-faint">
                  base {base} · obj {objetivo}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-swatch bg-hairline">
                  <div
                    className="h-full rounded-swatch"
                    style={{ width: `${ancho}%`, background: s.fg }}
                  />
                </div>
                <span className="w-7 text-right font-mono tabular-nums text-secondary">
                  {actual}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PorDominio({
  controles,
  dominios,
}: {
  controles: ControlVista[];
  dominios: string[];
}) {
  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <h2 className="etiqueta-campo">Madurez por dominio del Anexo A</h2>
      <div className="mt-3 space-y-3">
        {dominios.map((d) => {
          const delDominio = controles.filter((c) => c.dominio === d);
          if (delDominio.length === 0) return null;
          const evaluados = delDominio.filter((c) => c.actual !== null);
          const niveles = evaluados.map((c) => c.actual as number);
          const enL3 = evaluados.filter((c) => (c.actual as number) >= 3).length;
          const pct = (enL3 / evaluados.length) * 100;
          const eficaciaMedia = media(evaluados.map((c) => eficaciaDeNivel(c.actual))) * 100;

          return (
            <div key={d} className="text-11_5">
              <div className="flex items-baseline justify-between">
                <span className="text-secondary">{d}</span>
                <span className="font-mono text-faint">
                  mediana {nivelTexto(mediana(niveles))} · eficacia {eficaciaMedia.toFixed(0)}%
                </span>
              </div>
              {/* The bar tracks the share at L3 or above; efficacy already has its own
                  column, so repeating it here would say the same thing twice. */}
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-swatch bg-hairline">
                  <div
                    className="h-full rounded-swatch bg-accent-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-11 text-right font-mono tabular-nums text-secondary">
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-10 leading-relaxed text-faint">
        Se reporta la mediana del nivel porque L0–L5 es una escala ordinal, y la media de
        la eficacia porque es de razón y es la que alimenta el riesgo residual.
      </p>
    </section>
  );
}

function Detalle({ control }: { control: ControlVista }) {
  const s = semaforo(control.actual);
  const avance =
    control.lineaBase !== null && control.actual !== null ? control.actual - control.lineaBase : null;
  const brecha =
    control.objetivo !== null && control.actual !== null
      ? Math.max(0, control.objetivo - control.actual)
      : null;

  return (
    <section className="mt-4 rounded-tarjeta border border-border-default bg-subtle p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-13 font-semibold text-secondary">{control.codigo}</span>
        <span className="text-14 text-primary">{control.nombre}</span>
        <span
          className="rounded-badge border px-2 py-0.5 font-mono text-10"
          style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
        >
          {nivelTexto(control.actual)} · {Math.round(eficaciaDeNivel(control.actual) * 100)}%
        </span>
      </div>

      {/* Fixed three-column detail grid, as the handoff specifies. */}
      <div className="mt-4 grid gap-5" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <p className="etiqueta-campo">Calificación</p>
          <p className="mt-1.5 text-11_5 text-secondary">
            Base {nivelTexto(control.lineaBase)} · objetivo {nivelTexto(control.objetivo)}
          </p>
          {avance !== null && (
            <p className="mt-1 font-mono text-11 text-muted">
              avance {delta(avance)} · brecha {brecha ?? '—'}
            </p>
          )}
          {control.justificacionSoa && (
            <p className="parrafo mt-2 text-11 text-muted">{control.justificacionSoa}</p>
          )}
          {(control.soaActualizadoPor || control.soaActualizadoEn) && (
            <p className="mt-2 text-10 text-faint">
              SOA: {ETIQUETA_SOA[control.soa]} · último cambio{' '}
              {control.soaActualizadoPor ? `por ${control.soaActualizadoPor}` : ''}
              {control.soaActualizadoEn
                ? ` · ${new Date(control.soaActualizadoEn).toLocaleDateString('es-AR')}`
                : ''}
            </p>
          )}
        </div>

        <div>
          <p className="etiqueta-campo">Amenazas que mitiga</p>
          {control.amenazas.length === 0 ? (
            <p className="mt-1.5 text-11_5 text-faint">sin relación registrada</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {control.amenazas.map((a) => (
                <li key={a.codigo} className="text-11_5 leading-tight">
                  <span className="font-mono text-11 text-secondary">{a.codigo}</span>
                  <span className="block text-muted">{a.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="etiqueta-campo">Plan de tratamiento</p>
          {control.accion ? (
            <p className="mt-1.5 text-11_5 text-secondary">
              <span className="font-mono">{control.accion.codigo}</span> ·{' '}
              {control.accion.estado.toLowerCase().replace(/_/g, ' ')}
            </p>
          ) : (
            <p className="mt-1.5 text-11_5 text-faint">sin acción asociada</p>
          )}
          <p className="etiqueta-campo mt-4">Criterio</p>
          <p className="parrafo mt-1.5 text-11 text-muted">
            L3 exige procedimiento documentado. Sin evidencia, el máximo admisible en
            auditoría es L2.
          </p>
        </div>
      </div>
    </section>
  );
}

/// The SOA selector: three states, styled per state, and no row-expansion on click.
/// The change flow asks for the justification and confirmation in a small dialog, so a
/// change never lands silently — the auditor asks for both the reason and the author.
function SelectSoa({
  control,
  onAviso,
  onCambio,
}: {
  control: ControlVista;
  onAviso: (a: { ok: boolean; texto: string }) => void;
  onCambio: () => void;
}) {
  const [esperando, setEsperando] = useState(false);
  const [dialogo, setDialogo] = useState<{
    estadoPropuesto: EstadoSoa;
    justificacion: string;
    confirmando?: { codigo: string; nombre: string }[];
  } | null>(null);
  const router = useRouter();

  const aplicar = async (confirmar: boolean): Promise<void> => {
    setEsperando(true);
    try {
      const r = await cambiarEstadoSoa(
        control.codigo,
        dialogo!.estadoPropuesto,
        dialogo!.justificacion,
        undefined,
        confirmar,
      );
      onAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setDialogo(null);
        onCambio();
        // One refresh, no reload: the server has recomputed the risks and re-read the
        // row, so the select value, the cards and both panels settle on the same state
        // in the same render.
        router.refresh();
      } else if (r.confirmacionRequerida) {
        // The dialog shows the affected items before the author confirms.
        setDialogo((d) => (d ? { ...d, confirmando: r.afectados } : null));
        setEsperando(false);
      }
    } finally {
      setEsperando(false);
    }
  };

  const estilo = ESTILO_SOA[control.soa];
  return (
    <>
      <select
        value={control.soa}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          const nuevo = e.target.value as EstadoSoa;
          setDialogo({ estadoPropuesto: nuevo, justificacion: '' });
        }}
        disabled={esperando}
        style={{
          color: estilo.fg,
          background: estilo.bg,
          borderColor: estilo.bd,
          fontSize: 11,
          fontWeight: 600,
          padding: '5px 6px',
          borderRadius: 5,
          width: '100%',
        }}
        className="focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        title={
          control.soa === 'no'
            ? `No aplica — ${control.justificacionSoa ?? 'sin justificación registrada'}`
            : ETIQUETA_SOA[control.soa]
        }
      >
        <option value="si">Aplica</option>
        <option value="parcial">Aplica con alcance adaptado</option>
        <option value="no">No aplica</option>
      </select>

      {dialogo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!esperando) setDialogo(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-tarjeta border border-border-default bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="etiqueta-campo">
              Declaración de aplicabilidad · {control.codigo}
            </p>
            <p className="mt-1 text-12_5 text-primary">{control.nombre}</p>
            <p className="mt-3 text-11_5 text-secondary">
              Pasar de <span className="font-semibold">{ETIQUETA_SOA[control.soa]}</span> a{' '}
              <span className="font-semibold">{ETIQUETA_SOA[dialogo.estadoPropuesto]}</span>
            </p>

            <label className="etiqueta-campo mt-4 block">Justificación escrita</label>
            <textarea
              value={dialogo.justificacion}
              onChange={(e) =>
                setDialogo((d) => (d ? { ...d, justificacion: e.target.value } : null))
              }
              rows={4}
              placeholder={
                dialogo.estadoPropuesto === 'no'
                  ? 'Por qué se excluye de la declaración de aplicabilidad…'
                  : dialogo.estadoPropuesto === 'parcial'
                    ? 'Qué parte del alcance cubre y qué parte no…'
                    : 'Motivo de la nueva declaración…'
              }
              className="mt-1 w-full rounded-campo border border-border-field bg-surface px-3 py-2 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            />

            {'confirmando' in dialogo && dialogo.confirmando && (
              <div className="mt-4 rounded-campo border border-[var(--hf-danger-border)] bg-[var(--hf-danger-bg)] px-3 py-2.5">
                <p className="text-11 font-semibold text-danger-text">
                  Confirmación requerida — {dialogo.confirmando.length} elemento
                  {dialogo.confirmando.length === 1 ? '' : 's'} afectado
                  {dialogo.confirmando.length === 1 ? '' : 's'}:
                </p>
                <ul className="mt-1.5 list-inside list-disc text-11 text-danger-text">
                  {dialogo.confirmando.map((a) => (
                    <li key={a.codigo}>
                      <span className="font-mono">{a.codigo}</span> · {a.nombre}
                    </li>
                  ))}
                </ul>
                <p className="mx-auto mt-2 text-10 leading-relaxed">
                  Confirmá la advertencia para continuar. La decisión queda en la bitácora
                  con tu usuario y el motivo.
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDialogo(null)}
                disabled={esperando}
                className="rounded-campo border border-border-field px-3.5 py-2 text-12 text-muted transition-colors hover:bg-subtle disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void aplicar('confirmando' in dialogo && !!dialogo.confirmando)}
                disabled={esperando || !dialogo.justificacion.trim()}
                className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--hf-accent-500)' }}
              >
                {'confirmando' in dialogo && dialogo.confirmando
                  ? 'Confirmar exclusión'
                  : dialogo.estadoPropuesto === 'no'
                    ? 'Excluir control'
                    : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BarraEficacia({ nivel, aplica }: { nivel: number | null; aplica: boolean }) {
  if (!aplica) return <span className="text-11 text-faint">—</span>;
  if (nivel === null) {
    return (
      <span className="font-mono text-11" style={{ color: 'var(--hf-text-faint)' }}>
        Por evaluar
      </span>
    );
  }
  const pct = eficaciaDeNivel(nivel) * 100;
  const s = semaforo(nivel);
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-swatch bg-hairline">
        <span
          className="block h-full rounded-swatch"
          style={{ width: `${pct}%`, background: s.fg }}
        />
      </span>
      <span className="font-mono text-11 tabular-nums text-secondary">{pct.toFixed(0)}%</span>
    </span>
  );
}

/// Singular matters, and no evidence is a finding — red, not amber.
function BadgeEvidencia({ n }: { n: number }) {
  const texto = n === 0 ? 'sin evidencia' : n === 1 ? '1 evidencia' : `${n} evidencias`;
  const estilo =
    n === 0
      ? { color: 'var(--hf-danger-text)', background: 'var(--hf-row-rojo)' }
      : { color: 'var(--hf-accent-700)', background: 'var(--hf-accent-100)' };
  return (
    <span className="rounded-badge px-2 py-0.5 font-mono text-10" style={estilo}>
      {texto}
    </span>
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

function claveFiltro(f: Filtro): string {
  if (f.tipo === 'dominio' || f.tipo === 'capacidad') return `${f.tipo}:${f.valor}`;
  if (f.tipo === 'todos') return 'todos';
  return f.tipo;
}

function desdeClave(clave: string): Filtro {
  const [tipo, valor] = clave.split(/:(.+)/);
  if (tipo === 'dominio' || tipo === 'capacidad') return { tipo, valor } as Filtro;
  if (tipo === 'indice' || tipo === 'tipico') return { tipo: 'todos' };
  return { tipo: tipo as Exclude<Filtro['tipo'], 'dominio' | 'capacidad'> };
}

function pasa(c: ControlVista, f: Filtro): boolean {
  switch (f.tipo) {
    case 'brechas':
      return esAplicable(c.soa) && c.actual !== null && c.actual <= 2;
    case 'gestionados':
      return esAplicable(c.soa) && c.actual !== null && c.actual >= 3;
    case 'objetivo':
      return esAplicable(c.soa) && c.actual !== null && c.objetivo !== null && c.actual >= c.objetivo;
    case 'plan':
      return c.accion !== null;
    case 'parciales':
      return c.soa === 'parcial';
    case 'noAplican':
      return c.soa === 'no';
    case 'dominio':
      return c.dominio === f.valor;
    case 'capacidad':
      return c.capacidad === f.valor;
    default:
      return true;
  }
}
