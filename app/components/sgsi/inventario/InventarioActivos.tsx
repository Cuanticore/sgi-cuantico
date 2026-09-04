'use client';

// app/components/sgsi/inventario/InventarioActivos.tsx
//
// Handoff v2.1 screen 2. Nothing on this screen is read from a stored aggregate: the
// asset's value is max(v_D, v_I, v_C) through lib/sgsi/formulas.ts, and the risk bands
// are classified at read time through lib/sgsi/clasificar.ts against the parametrized
// UmbralRiesgo rows. That is why editing D, I or C in the grid moves the value, the
// level badge, the row colour and the chip counters at once, with no round trip.

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guardarValoracion } from '@/app/sgsi/acciones/activos';
import PopupImportacion from '@/app/components/sgsi/inventario/PopupImportacion';
import { clasificar } from '@/lib/sgsi/clasificar';
import {
  nivelDeRiesgoDelActivo,
  type NivelRiesgo,
} from '@/lib/sgsi/riesgo-activo';
import { valorActivo } from '@/lib/sgsi/formulas';

/// One (asset, threat) row, reduced to what the inventory needs. Decimals travel as
/// strings: Prisma's Decimal cannot cross the server/client boundary, and a float would
/// reintroduce exactly the binary artefact lib/sgsi/formulas.ts exists to avoid.
export interface RiesgoDeActivo {
  potencial: string | null;
  residual: string | null;
}

export interface ActivoVista {
  codigo: string;
  codigoHeredado: string | null;
  nombre: string;
  proceso: string;
  tipo: string;
  subtipo: string;
  propietario: string | null;
  custodio: string | null;
  proveedor: string | null;
  /// La jerarquia del inventario (REQ-SIG-06). Los tres grados llegan DERIVADOS del
  /// servidor: el activo guarda `nivelId` apuntando al nivel 3 y los otros dos salen de
  /// subir por `padreId`. Nulos cuando el activo todavia no se clasifico, que hoy son casi
  /// todos — y ese «Sin clasificar» es el trabajo pendiente, no un defecto.
  nivel1: string | null;
  nivel2: string | null;
  nivel3: string | null;
  D: number;
  I: number;
  C: number;
  riesgos: RiesgoDeActivo[];
}

/// A row of `escala_valor`: "4 — Alto".
export interface NivelValor {
  valor: number;
  etiqueta: string;
}

/// A row of `umbral_riesgo`. `orden` is 1 for the worst band, which is what turns the
/// band into a position on the 1–5 ladder below.
export type BandaRiesgo = {
  nombre: string;
  desde: string;
  hasta: string;
  orden: number;
};

interface Props {
  activos: ActivoVista[];
  escala: NivelValor[];
  bandas: BandaRiesgo[];
  /// `umbral_valoracion`, 4 by default: an asset enters the analysis when its value
  /// reaches it, and only then does it have risks.
  umbralValoracion: number;
}

/// The top of the valuation scale. Both the asset value and the risk-band ladder are
/// read against it.
const TOPE_DE_ESCALA = 5;

// The collapse of an asset's risks into ONE level lives in lib/sgsi/riesgo-activo.ts,
// shared by this screen and the workbook export — one rule, one module. See its header
// for the unratified MAXIMUM assumption (README open question 2).

/// The three rules the client stated, plus the case they do not cover.
///
///   · rojo   — riesgo residual de 4 a 5
///   · verde  — riesgo inherente de 4 a 5 y residual de 1 a 3
///   · blanco — riesgo inherente de 1 a 3
///
/// Note what decides the white: the INHERENT RISK, not the asset's value. They are not the
/// same reading — an asset valued 5 whose threats are rare carries a low inherent risk, and
/// colouring it by value would call it dangerous for being expensive.
///
/// THE GAP: inherent 4-5 with the residual still uncalculated matches none of the three.
/// Left literal, every high-risk row would lose its colour until the 272 relevance pairs
/// exist — precisely the rows that have to be visible. So an uncalculated residual over a
/// high inherent renders RED: nobody has yet shown that the controls bring it down, and
/// treating the unknown as treated is the one error this screen must not make. The row says
/// so in words, so it is never mistaken for a measured residual.
export function colorDeRenglon(
  inherente: NivelRiesgo | null,
  residual: NivelRiesgo | null,
): 'rojo' | 'verde' | 'blanco' {
  // Residual can never exceed inherent — controls only reduce — so this clause is checked
  // first for faithfulness to the stated rule, not because it can disagree with the next.
  if (residual !== null && residual.nivel >= 4) return 'rojo';
  // No risks at all: the asset does not reach the valuation threshold. Nothing to colour.
  if (inherente === null) return 'blanco';
  if (inherente.nivel <= 3) return 'blanco';
  return residual === null ? 'rojo' : 'verde';
}

const FONDO_RENGLON = {
  rojo: { fondo: 'var(--hf-row-rojo)', hover: 'var(--hf-row-rojo-hover)' },
  verde: { fondo: 'var(--hf-row-verde)', hover: 'var(--hf-row-verde-hover)' },
  blanco: { fondo: 'var(--hf-row-blanco)', hover: 'var(--hf-row-blanco-hover)' },
} as const;

/// Colour is never the only carrier: the row states its own state in words for anyone who
/// cannot see it, and the chips at the top say the same thing on screen.
///
/// The two reds are told apart on purpose. One is a measured residual of 4 or 5; the other
/// is a high inherent risk whose residual nobody has computed yet. They look the same and
/// they do not mean the same, and a reader who cannot see the colour is exactly the reader
/// who must not be told a guess is a measurement.
function textoDeRenglon(
  color: 'rojo' | 'verde' | 'blanco',
  inherente: NivelRiesgo | null,
  residual: NivelRiesgo | null,
): string {
  if (color === 'verde') return 'Renglón verde — riesgo inherente de 4 a 5 y residual de 1 a 3';
  if (color === 'blanco') {
    return inherente === null
      ? 'Renglón blanco — el activo no alcanza el umbral de valoración, no tiene riesgos'
      : 'Renglón blanco — riesgo inherente de 1 a 3';
  }
  return residual === null
    ? 'Renglón rojo — riesgo inherente de 4 a 5 y residual sin calcular'
    : 'Renglón rojo — riesgo residual de 4 a 5';
}

/// Value badges, Muy Alto down to Muy Bajo. Keyed by the number rather than by the
/// label, because the label is data and the organisation may reword it.
function colorDeNivel(valor: number): { bg: string; fg: string } {
  const i = Math.min(5, Math.max(1, valor));
  return { bg: `var(--hf-level-${i}-bg)`, fg: `var(--hf-level-${i}-fg)` };
}

/// Risk bands carry their own token pair. An unknown band falls back to Bajo rather
/// than to nothing, so a renamed band never renders as an unstyled word.
function colorDeBanda(nombre: string): { bg: string; fg: string } {
  const clave = nombre.toLowerCase().startsWith('crít')
    ? 'critico'
    : nombre.toLowerCase().startsWith('alto')
      ? 'alto'
      : nombre.toLowerCase().startsWith('medio')
        ? 'medio'
        : 'bajo';
  return { bg: `var(--hf-risk-${clave}-bg)`, fg: `var(--hf-risk-${clave}-fg)` };
}

const TODOS_TIPOS = 'Todos los tipos';
const TODOS_SUBTIPOS = 'Todos los subtipos';
const TODOS_RESPONSABLES = 'Todos los responsables';

type ColorFiltro = 'Todos' | 'rojo' | 'verde' | 'blanco';
type Agrupacion =
  | 'proceso|tipo'
  | 'tipo|proceso'
  | 'proceso|nivel'
  | 'nivel1|nivel2'
  | 'nivel2|nivel3'
  | 'nivel3|tipo';

interface Filtros {
  tipo: string;
  subtipo: string;
  responsable: string;
  color: ColorFiltro;
}

const FILTROS_VACIOS: Filtros = {
  tipo: TODOS_TIPOS,
  subtipo: TODOS_SUBTIPOS,
  responsable: TODOS_RESPONSABLES,
  color: 'Todos',
};

/// The twelve columns of the grid, verbatim from the handoff. They live in one constant
/// because the header row and every asset row must never drift apart.
const COLUMNAS =
  '150px minmax(170px, 0.85fr) 168px 168px 126px 126px 126px 74px 104px 124px 124px 92px';

/// 1552px of columns plus the row's 58px of padding. The handoff marks an insufficient
/// min-width as the rule that caused repeated defects.
const ANCHO_MINIMO = 1620;

export default function InventarioActivos({
  activos,
  escala,
  bandas,
  umbralValoracion,
}: Props) {
  // D, I and C are edited in the grid. The override map is keyed by asset code and holds
  // only what actually moved, so an untouched dimension keeps showing the stored value.
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, Partial<Record<'D' | 'I' | 'C', number>>>>(
    {},
  );
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [busqueda, setBusqueda] = useState('');
  const [agrupar, setAgrupar] = useState<Agrupacion>('proceso|tipo');
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({});
  const [importando, setImportando] = useState(false);

  const nombreDeNivel = useMemo(() => {
    const porValor = new Map(escala.map((e) => [e.valor, e.etiqueta.split('— ')[1] ?? e.etiqueta]));
    return (v: number) => porValor.get(v) ?? String(v);
  }, [escala]);

  // Every derived figure for every asset, recomputed from the current D/I/C. This is the
  // single pass the whole screen reads from.
  const calculados = useMemo(
    () =>
      activos.map((a) => {
        const ov = valores[a.codigo] ?? {};
        const D = ov.D ?? a.D;
        const I = ov.I ?? a.I;
        const C = ov.C ?? a.C;
        const valor = valorActivo({ D, I, C }).toNumber();
        const inherente = nivelDeRiesgoDelActivo(
          a.riesgos.map((r) => r.potencial),
          bandas,
        );
        const residual = nivelDeRiesgoDelActivo(
          a.riesgos.map((r) => r.residual),
          bandas,
        );
        return {
          activo: a,
          D,
          I,
          C,
          desviado: { D: ov.D !== undefined, I: ov.I !== undefined, C: ov.C !== undefined },
          valor,
          nivel: nombreDeNivel(valor),
          inherente,
          residual,
          entra: valor >= umbralValoracion,
          color: colorDeRenglon(inherente, residual),
        };
      }),
    [activos, valores, bandas, umbralValoracion, nombreDeNivel],
  );

  type Calculado = (typeof calculados)[number];

  const opcionesTipo = useMemo(
    () => [TODOS_TIPOS, ...unicos(activos.map((a) => a.tipo))],
    [activos],
  );
  const opcionesSubtipo = useMemo(
    () => [
      TODOS_SUBTIPOS,
      ...unicos(
        activos.filter((a) => filtros.tipo === TODOS_TIPOS || a.tipo === filtros.tipo).map((a) => a.subtipo),
      ),
    ],
    [activos, filtros.tipo],
  );
  const opcionesResponsable = useMemo(
    () => [
      TODOS_RESPONSABLES,
      ...unicos([
        ...activos.map((a) => a.propietario),
        ...activos.map((a) => a.custodio),
      ].filter((v): v is string => v !== null)),
    ],
    [activos],
  );

  // The selects and the search box narrow the set first; the colour chips count over
  // THAT set, so a chip always says how many of the currently visible assets it would
  // keep, and never how many exist in the whole inventory.
  const preColor = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return calculados.filter((c) => {
      const a = c.activo;
      if (filtros.tipo !== TODOS_TIPOS && a.tipo !== filtros.tipo) return false;
      if (filtros.subtipo !== TODOS_SUBTIPOS && a.subtipo !== filtros.subtipo) return false;
      if (
        filtros.responsable !== TODOS_RESPONSABLES &&
        a.propietario !== filtros.responsable &&
        a.custodio !== filtros.responsable
      ) {
        return false;
      }
      if (q === '') return true;
      return [a.codigo, a.codigoHeredado, a.nombre, a.proveedor, a.subtipo]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [calculados, filtros, busqueda]);

  const cuentaColor = useMemo(() => {
    const c = { rojo: 0, verde: 0, blanco: 0 };
    for (const x of preColor) c[x.color] += 1;
    return c;
  }, [preColor]);

  const visibles = useMemo(
    () => preColor.filter((c) => filtros.color === 'Todos' || c.color === filtros.color),
    [preColor, filtros.color],
  );

  const [clave1, clave2] = agrupar.split('|') as [ClaveGrupo, ClaveGrupo];

  // Two collapsible levels. Insertion order is the asset order, which arrives sorted by
  // code, so the groups come out in the same order on every render.
  const grupos = useMemo(() => {
    const orden: string[] = [];
    const mapa = new Map<string, Map<string, Calculado[]>>();
    for (const c of visibles) {
      const k1 = claveDeGrupo(c, clave1);
      const k2 = claveDeGrupo(c, clave2);
      if (!mapa.has(k1)) {
        mapa.set(k1, new Map());
        orden.push(k1);
      }
      const sub = mapa.get(k1)!;
      sub.set(k2, [...(sub.get(k2) ?? []), c]);
    }
    return orden.map((k1) => ({ nombre: k1, sub: mapa.get(k1)! }));
  }, [visibles, clave1, clave2]);

  const sinValorar = calculados.filter((c) => !c.entra).length;
  const sinResidual = calculados.filter((c) => c.entra && c.residual === null).length;

  const editar = (codigo: string, dim: 'D' | 'I' | 'C', valor: number) =>
    setValores((v) => ({ ...v, [codigo]: { ...v[codigo], [dim]: valor } }));

  // How many dimensions differ from what the server holds. Editing recomputes the value,
  // the level, the row colour and the chip counts live; this is what makes it stick.
  const pendientesDeGuardar = Object.entries(valores).flatMap(([codigo, dims]) =>
    (['D', 'I', 'C'] as const)
      .filter((d) => dims[d] !== undefined)
      .map((d) => ({ codigoActivo: codigo, dimension: d, valor: dims[d] as number })),
  );

  const guardar = (): void => {
    iniciar(async () => {
      const r = await guardarValoracion(pendientesDeGuardar);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setValores({});
        router.refresh();
      }
    });
  };

  const sustantivo = clave2 === 'tipo' ? 'tipo' : clave2 === 'proceso' ? 'proceso' : 'nivel';

  return (
    <main className="px-8 pt-6 pb-14">
      {importando && <PopupImportacion onCerrar={() => setImportando(false)} />}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="titulo-pagina">Inventario de activos</h1>
            <p className="parrafo mt-1 text-13 text-muted" style={{ maxWidth: '62ch' }}>
              Inventario clasificado con la taxonomía MAGERIT y valorado en Disponibilidad,
              Integridad y Confidencialidad. El valor del activo es el mayor de las tres
              dimensiones y se calcula, no se captura.
            </p>
          </div>
          {/* There is no menu entry for creating an asset: the sheet itself has a
              creation mode, and this is the way in. */}
          <div className="flex items-center gap-2.5">
            {pendientesDeGuardar.length > 0 && (
              <>
                <button
                  onClick={guardar}
                  disabled={pendiente}
                  className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--hf-accent-500)' }}
                >
                  {pendiente
                    ? 'Guardando…'
                    : `Guardar ${pendientesDeGuardar.length} ${
                        pendientesDeGuardar.length === 1 ? 'valoración' : 'valoraciones'
                      }`}
                </button>
                <button
                  onClick={() => {
                    setValores({});
                    setAviso(null);
                  }}
                  disabled={pendiente}
                  className="rounded-campo border border-border-field px-3 py-2 text-12 text-muted transition-colors hover:bg-subtle disabled:opacity-50"
                >
                  Descartar
                </button>
              </>
            )}
            {/* One button for the whole import: the popup carries the template download,
                the upload, the row-by-row validation and the result. Two separate buttons
                would leave the person to sequence the steps themselves. */}
            <button
              onClick={() => setImportando(true)}
              className="rounded-campo border border-accent-border bg-accent-100 px-3.5 py-2 text-12_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
            >
              Importar desde Excel
            </button>
            <button
              onClick={() => exportarInventario(visibles, agrupar)}
              className="rounded-campo border border-accent-border bg-accent-100 px-3.5 py-2 text-12_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
            >
              Exportar a Excel
            </button>
            <Link
              href="/sgsi/inventario/nuevo"
              className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              Nuevo activo
            </Link>
          </div>
        </div>

        {/* Row 1 — grouping, search and the counter. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-[7px] border border-accent-border bg-accent-100 py-1.5 pr-1.5 pl-3">
            <span className="font-mono text-10 tracking-[0.06em] text-accent-700">AGRUPAR POR</span>
            <select
              value={agrupar}
              onChange={(e) => setAgrupar(e.target.value as Agrupacion)}
              className="rounded-[5px] border border-accent-border bg-surface px-2 py-1 text-12_5 font-semibold text-accent-700 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              <option value="proceso|tipo">Proceso → Tipo</option>
              <option value="tipo|proceso">Tipo → Proceso</option>
              <option value="proceso|nivel">Proceso → Nivel del activo</option>
              <option value="nivel1|nivel2">Jerarquía · Nivel 1 → Nivel 2</option>
              <option value="nivel2|nivel3">Jerarquía · Nivel 2 → Nivel 3</option>
              <option value="nivel3|tipo">Jerarquía · Nivel 3 → Tipo</option>
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-[7px] border border-border-field bg-surface py-1.5 px-3">
            <span className="text-12_5 text-muted">Buscar</span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="código, nombre, proveedor…"
              className="w-56 border-0 bg-transparent font-mono text-11 text-secondary placeholder:text-[var(--hf-text-placeholder)] focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            />
          </div>

          <div className="ml-auto text-12 text-faint">
            {visibles.length} {visibles.length === 1 ? 'activo' : 'activos'} · {grupos.length}{' '}
            {grupos.length === 1 ? 'grupo' : 'grupos'}
          </div>
        </div>

        {/* Row 2 — the three dependent filters. Subtipo narrows with Tipo. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Filtro
            etiqueta="TIPO"
            valor={filtros.tipo}
            opciones={opcionesTipo}
            onChange={(v) => setFiltros((f) => ({ ...f, tipo: v, subtipo: TODOS_SUBTIPOS }))}
          />
          <Filtro
            etiqueta="SUBTIPO"
            valor={filtros.subtipo}
            opciones={opcionesSubtipo}
            onChange={(v) => setFiltros((f) => ({ ...f, subtipo: v }))}
          />
          <Filtro
            etiqueta="RESPONSABLE"
            valor={filtros.responsable}
            opciones={opcionesResponsable}
            onChange={(v) => setFiltros((f) => ({ ...f, responsable: v }))}
          />
          <button
            onClick={() => {
              setFiltros(FILTROS_VACIOS);
              setBusqueda('');
            }}
            className="text-12 font-semibold text-brand-nav"
          >
            Limpiar
          </button>
        </div>

        {/* Row 3 — the row-colour chips, which also filter and carry their own count. */}
        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <span className="etiqueta-campo text-9">COLOR DEL RENGLÓN</span>
          {(
            [
              {
                k: 'Todos' as const,
                label: 'Todos',
                swatch:
                  'linear-gradient(90deg, var(--hf-row-rojo) 0 34%, var(--hf-row-verde) 34% 67%, var(--hf-row-blanco) 67%)',
                borde: '#dde2df',
                n: preColor.length,
              },
              {
                k: 'rojo' as const,
                // Two readings under one colour: a measured residual of 4-5, and a high
                // inherent whose residual nobody has computed. The chip names both, because
                // "Residual 4 a 5" over rows that have no residual at all is a lie.
                label: 'Residual 4 a 5 o sin calcular',
                swatch: 'var(--hf-row-rojo)',
                borde: 'var(--hf-cmm-rojo-bd)',
                n: cuentaColor.rojo,
              },
              {
                k: 'verde' as const,
                label: 'Inherente 4 a 5, residual 1 a 3',
                swatch: 'var(--hf-row-verde)',
                borde: '#cfe4d7',
                n: cuentaColor.verde,
              },
              {
                k: 'blanco' as const,
                label: 'Valor 1 a 3',
                swatch: 'var(--hf-row-blanco)',
                borde: '#dde2df',
                n: cuentaColor.blanco,
              },
            ] as const
          ).map((c) => {
            const activo = filtros.color === c.k;
            return (
              <button
                key={c.k}
                aria-pressed={activo}
                onClick={() => setFiltros((f) => ({ ...f, color: c.k }))}
                className="flex items-center gap-2 rounded-chip border py-1.5 pr-3 pl-2 transition-colors"
                style={{
                  borderColor: activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)',
                  background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                }}
              >
                <span
                  className="rounded-swatch border"
                  style={{
                    width: 20,
                    height: 13,
                    flex: 'none',
                    background: c.swatch,
                    borderColor: c.borde,
                  }}
                />
                <span
                  className="text-11_5"
                  style={{
                    fontWeight: activo ? 700 : 500,
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  }}
                >
                  {c.label}
                </span>
                <span className="font-mono text-11 tabular-nums text-faint">{c.n}</span>
              </button>
            );
          })}
        </div>
      </header>

      {aviso && (
        <div
          className="mt-4 rounded-campo border px-4 py-2.5 text-12"
          style={
            aviso.ok
              ? { borderColor: 'var(--hf-accent-border)', background: 'var(--hf-accent-100)', color: 'var(--hf-accent-700)' }
              : { borderColor: 'var(--hf-danger-border)', background: 'var(--hf-danger-bg)', color: 'var(--hf-danger-text)' }
          }
        >
          {aviso.texto}
        </div>
      )}

      {/* The grid owns its own horizontal overflow. The cards INSIDE it round and clip
          their corners; none of them is allowed to be the scrolling element. */}
      <div className="tabla-ancha mt-5">
        <div style={{ minWidth: ANCHO_MINIMO }} className="flex flex-col gap-2.5">
          <div
            className="grid font-mono text-9_5 tracking-[0.06em] text-label"
            style={{ gridTemplateColumns: COLUMNAS, padding: '0 12px 8px 46px' }}
          >
            <div>CÓDIGO</div>
            <div>ACTIVO</div>
            <div>SUBTIPO</div>
            <div>PROPIETARIO</div>
            <div className="text-accent-700">DISPONIBILIDAD</div>
            <div className="text-accent-700">INTEGRIDAD</div>
            <div className="text-accent-700">CONFIDENCIALIDAD</div>
            <div className="text-center">VALOR</div>
            <div>NIVEL</div>
            <div>RIESGO INHERENTE</div>
            <div>RIESGO RESIDUAL</div>
            <div className="text-right">RIESGOS</div>
          </div>

          {grupos.map((g) => {
            const colapsado = !!colapsados[g.nombre];
            const subclaves = [...g.sub.keys()];
            const nActivos = subclaves.reduce((t, k) => t + g.sub.get(k)!.length, 0);

            return (
              <div
                key={g.nombre}
                className="overflow-hidden rounded-[9px] border border-border-default bg-surface"
              >
                <button
                  onClick={() => setColapsados((c) => ({ ...c, [g.nombre]: !c[g.nombre] }))}
                  aria-expanded={!colapsado}
                  className="flex w-full items-center gap-3 border-b border-hairline-strong bg-subtle px-3.5 py-2.5 text-left transition-colors hover:bg-app"
                >
                  <span className="w-2.5 font-mono text-10 text-accent-500">
                    {colapsado ? '▸' : '▾'}
                  </span>
                  <span className="text-13_5 font-semibold text-primary">{g.nombre}</span>
                  <span className="font-mono text-10_5 text-faint">
                    {nActivos} {nActivos === 1 ? 'activo' : 'activos'} · {subclaves.length}{' '}
                    {subclaves.length === 1 ? sustantivo : `${sustantivo}s`}
                  </span>
                </button>

                {!colapsado &&
                  subclaves.map((k2) => {
                    const ck = `${g.nombre}§${k2}`;
                    const col2 = !!colapsados[ck];
                    const filas = g.sub.get(k2)!;

                    return (
                      <div key={ck} className="flex flex-col">
                        <button
                          onClick={() => setColapsados((c) => ({ ...c, [ck]: !c[ck] }))}
                          aria-expanded={!col2}
                          className="flex w-full items-center gap-2.5 border-b border-hairline bg-surface py-2 pr-3.5 pl-[34px] text-left transition-colors hover:bg-subtle"
                        >
                          <span className="w-2.5 font-mono text-9_5 text-[var(--hf-text-placeholder)]">
                            {col2 ? '▸' : '▾'}
                          </span>
                          <span className="font-mono text-11 font-medium text-secondary-soft">
                            {k2}
                          </span>
                          <span className="text-11 text-label">
                            {filas.length} {filas.length === 1 ? 'activo' : 'activos'}
                          </span>
                        </button>

                        {!col2 &&
                          filas.map((c) => (
                            <Renglon
                              key={c.activo.codigo}
                              c={c}
                              escala={escala}
                              onEditar={editar}
                            />
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {grupos.length === 0 && (
            <p className="rounded-tarjeta border border-border-default bg-surface px-4 py-6 text-12_5 text-muted">
              Ningún activo cumple los filtros actuales.
            </p>
          )}
        </div>
      </div>

      <p className="parrafo mt-5 text-11 text-faint">
        {calculados.length} activos en el inventario. {sinValorar} no alcanzan el umbral de
        valoración ({umbralValoracion}) y por eso no generan riesgos: la columna dice{' '}
        <span className="font-mono">no requiere</span>, que no es lo mismo que cero.{' '}
        {sinResidual > 0 && (
          <>
            El riesgo residual de {sinResidual} activos figura como{' '}
            <span className="font-mono">sin calcular</span> porque todavía no hay relevancia
            asignada entre controles y amenazas; tampoco es cero.{' '}
          </>
        )}
        El nivel 1–5 por activo se deriva con el máximo de sus riesgos — criterio de trabajo,
        pendiente de ratificación del cliente.
      </p>
    </main>
  );
}

interface RenglonProps {
  c: {
    activo: ActivoVista;
    D: number;
    I: number;
    C: number;
    desviado: { D: boolean; I: boolean; C: boolean };
    valor: number;
    nivel: string;
    inherente: NivelRiesgo | null;
    residual: NivelRiesgo | null;
    entra: boolean;
    color: 'rojo' | 'verde' | 'blanco';
  };
  escala: NivelValor[];
  onEditar: (codigo: string, dim: 'D' | 'I' | 'C', valor: number) => void;
}

function Renglon({ c, escala, onEditar }: RenglonProps) {
  const a = c.activo;
  const fondo = FONDO_RENGLON[c.color];
  const nivelColor = colorDeNivel(c.valor);
  // Row click opens the asset sheet (tab Valoración); the D/I/C selects and the code
  // link stop propagation so inline editing never navigates.
  const ir = () => {
    const url = `/sgsi/inventario/${encodeURIComponent(a.codigo)}`;
    window.location.href = url;
  };
  const alClic = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return;
    ir();
  };
  const alTecla = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ir();
    }
  };

  return (
    <div
      className="grid items-center border-b border-hairline-faint text-12_5 hover:bg-[var(--fila-hover)]"
      style={
        {
          gridTemplateColumns: COLUMNAS,
          padding: '9px 12px 9px 46px',
          background: fondo.fondo,
          '--fila-hover': fondo.hover,
        } as React.CSSProperties
      }
      role="button"
      tabIndex={0}
      onClick={alClic}
      onKeyDown={alTecla}
      aria-label={`Abrir la ficha del activo ${a.codigo} ${a.nombre}`}
    >
      <span className="sr-only">{textoDeRenglon(c.color, c.inherente, c.residual)}</span>

      {/* The code opens the asset sheet. Only this cell is a link: the row carries D/I/C
          selects, and wrapping the whole thing would swallow their clicks. */}
      <div className="flex min-w-0 flex-col gap-px">
        <Link
          href={`/sgsi/inventario/${encodeURIComponent(a.codigo)}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-11_5 font-semibold text-accent-500 underline decoration-accent-border decoration-from-font underline-offset-2"
        >
          {a.codigo}
        </Link>
        <span className="font-mono text-9_5 text-[var(--hf-text-placeholder)]">
          {a.codigoHeredado ?? 'sin código heredado'}
        </span>
      </div>

      <div className="min-w-0 truncate pr-4 font-medium text-primary" title={a.nombre}>
        {a.nombre}
      </div>

      <div className="min-w-0 truncate pr-3 font-mono text-10_5 text-muted" title={a.subtipo}>
        {a.subtipo}
      </div>

      <div className="min-w-0 truncate pr-3 text-muted" title={a.propietario ?? undefined}>
        {a.propietario ?? <span className="text-[var(--hf-text-placeholder)]">sin asignar</span>}
      </div>

      {(['D', 'I', 'C'] as const).map((dim) => (
        <div key={dim} className="pr-1.5" onClick={(e) => e.stopPropagation()}>
          <SelectDimension
            dim={dim}
            valor={c[dim]}
            desviado={c.desviado[dim]}
            escala={escala}
            onChange={(v) => onEditar(a.codigo, dim, v)}
          />
        </div>
      ))}

      <div className="cifra text-center text-13 font-bold text-primary">{c.valor}</div>

      <div>
        <span
          className="inline-block rounded-badge px-2 py-0.5 text-11 font-semibold"
          style={{ background: nivelColor.bg, color: nivelColor.fg }}
        >
          {c.nivel}
        </span>
      </div>

      <CeldaRiesgo nivel={c.inherente} entra={c.entra} tieneRiesgos={a.riesgos.length > 0} />
      <CeldaRiesgo nivel={c.residual} entra={c.entra} tieneRiesgos={a.riesgos.length > 0} />

      <div className="text-right font-mono text-11">
        {!c.entra ? (
          <span className="text-[var(--hf-text-placeholder)]" title="Su valor no alcanza el umbral">
            no requiere
          </span>
        ) : a.riesgos.length === 0 ? (
          <span className="text-[var(--hf-text-placeholder)]">sin generar</span>
        ) : (
          <span className="tabular-nums text-primary">{a.riesgos.length}</span>
        )}
      </div>
    </div>
  );
}

/// Three states, and none of them is a zero or a bare dash: an asset below the threshold
/// does not require the analysis, one above it without rows has not had them generated,
/// and a level that cannot be classified has not been calculated.
function CeldaRiesgo({
  nivel,
  entra,
  tieneRiesgos,
}: {
  nivel: NivelRiesgo | null;
  entra: boolean;
  tieneRiesgos: boolean;
}) {
  if (nivel === null) {
    const texto = !entra ? 'no requiere' : !tieneRiesgos ? 'sin generar' : 'sin calcular';
    return (
      <div className="font-mono text-10_5 text-[var(--hf-text-placeholder)]">{texto}</div>
    );
  }
  const color = colorDeBanda(nivel.banda);
  return (
    <div className="flex items-center gap-2" title={`Mayor riesgo del activo: ${nivel.figura}`}>
      <span className="cifra text-13 font-bold text-primary">{nivel.nivel}</span>
      <span
        className="inline-block rounded-badge px-1.5 py-0.5 text-10_5 font-semibold"
        style={{ background: color.bg, color: color.fg }}
      >
        {nivel.banda}
      </span>
    </div>
  );
}

/// The select shows the full label — "4 — Alto" — because a bare number in a grid of
/// numbers says nothing. Deviating from the stored value marks the border in warn/500,
/// which is the same signal the asset sheet uses.
function SelectDimension({
  dim,
  valor,
  desviado,
  escala,
  onChange,
}: {
  dim: 'D' | 'I' | 'C';
  valor: number;
  desviado: boolean;
  escala: NivelValor[];
  onChange: (v: number) => void;
}) {
  const nombre = dim === 'D' ? 'Disponibilidad' : dim === 'I' ? 'Integridad' : 'Confidencialidad';
  return (
    <select
      value={valor}
      title={desviado ? `${nombre} — modificada, sin guardar` : nombre}
      aria-label={nombre}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ borderColor: desviado ? 'var(--hf-warn-500)' : 'transparent' }}
      className="w-full rounded-badge border bg-transparent px-1 py-0.5 text-11 text-secondary-soft transition-colors hover:border-accent-border hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
    >
      {escala.map((e) => (
        <option key={e.valor} value={e.valor}>
          {e.etiqueta}
        </option>
      ))}
    </select>
  );
}

function Filtro({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  opciones: string[];
  onChange: (v: string) => void;
}) {
  // An active filter is worth seeing from across the room: the container's border turns
  // corporate blue, the same signal the chips use.
  const activo = !valor.startsWith('Todos');
  return (
    <div
      className="flex items-center gap-2 rounded-[7px] border bg-surface py-1.5 pr-1.5 pl-3"
      style={{ borderColor: activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)' }}
    >
      <span className="font-mono text-9_5 tracking-[0.06em] text-faint">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{ maxWidth: 250 }}
        className="rounded-[5px] border border-border-default bg-subtle px-2 py-1 text-12_5 font-medium text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      >
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function unicos(valores: string[]): string[] {
  return [...new Set(valores)];
}

/// Grouping reads a key off the asset, except for "nivel", which is the DERIVED level of
/// the current valuation — so raising a dimension in the grid moves the asset to another
/// group without a reload.
/// Las claves por las que se puede agrupar. `nivel` es el NIVEL DE VALOR del activo —el
/// que sale de la escala—; `nivel1`, `nivel2` y `nivel3` son los tres grados de la
/// jerarquia del inventario. Se llaman distinto a proposito: son dos cosas sin relacion y
/// compartir la palabra «nivel» ya confundio a esta pantalla una vez.
type ClaveGrupo = 'proceso' | 'tipo' | 'nivel' | 'nivel1' | 'nivel2' | 'nivel3';

function claveDeGrupo(fila: { activo: ActivoVista; nivel: string }, clave: ClaveGrupo): string {
  if (clave === 'proceso') return fila.activo.proceso;
  if (clave === 'tipo') return fila.activo.tipo;
  if (clave === 'nivel') return fila.nivel;
  // Sin clasificar se agrupa junto y con nombre: repartir esos activos en un grupo vacio
  // por cada uno los volveria invisibles justo cuando hay que clasificarlos.
  const g = clave === 'nivel1' ? fila.activo.nivel1 : clave === 'nivel2' ? fila.activo.nivel2 : fila.activo.nivel3;
  return g ?? 'Sin clasificar';
}

/// The filtered set, exported as the FOR-SIG-12 form (.xlsx real, with its dropdowns),
/// built server-side by /api/sgsi/exportar-activos — the same route that checks the
/// session and reads the catalogues. The browser only names the codes on screen.
async function exportarInventario(
  filas: {
    activo: ActivoVista;
    D: number;
    I: number;
    C: number;
    valor: number;
    nivel: string;
    inherente: NivelRiesgo | null;
    residual: NivelRiesgo | null;
    entra: boolean;
  }[],
  agrupar: string,
): Promise<void> {
  const codigos = filas
    .map((f) => f.activo.codigo)
    .filter((c) => c !== '(sin código)')
    .join(',');
  const url = `/api/sgsi/exportar-activos${codigos ? `?codigos=${encodeURIComponent(codigos)}` : ''}`;

  const respuesta = await fetch(url, { method: 'GET' });
  if (!respuesta.ok) {
    alert('No se pudo exportar el inventario. Revisá la sesión e intentá de nuevo.');
    return;
  }

  const blob = await respuesta.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `FOR-SIG-12 Inventario de activos de información ${agrupar.replace('|', '-')}.xlsx`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
}
