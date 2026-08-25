'use client';

// app/components/sgsi/matrices/MatricesRiesgo.tsx
//
// Handoff v2.1 screen 7. Two 5×5 matrices — inherent and residual — over the axes of
// impact band and expected frequency, with filters that cut the real dataset and a
// drill-down into any cell.
//
// EVERY COUNT IS DERIVED HERE, on each render, from the risk rows the server sent. The
// prototype's MATRIZ_INH / MATRIZ_RES arrays are a designer's visual reference and are
// deliberately not reproduced: a stored matrix is a second place a figure can live, and
// two places is how a report ends up contradicting itself.
//
// The residual matrix is NOT drawn while the residual risk is unknown. No threat has
// controls with a relevance assigned yet, so efficacy is unknown, not zero — and a
// residual matrix drawn on efficacy zero comes out identical to the inherent one. That
// mistake has been paid for once already, so the card says "sin calcular" instead.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { clasificar } from '@/lib/sgsi/clasificar';

export interface ActivoVista {
  codigo: string;
  nombre: string;
  /// Indices into the catalogues below. −1 means the asset has none.
  proceso: number;
  responsable: number;
  categoria: number;
}

export interface AmenazaVista {
  codigo: string;
  nombre: string;
}

export interface FilaRiesgo {
  codigo: string;
  activo: number;
  amenaza: number;
  /// Override; −1 inherits the asset's responsible party.
  responsable: number;
  impacto: number;
  aro: number;
  riesgo: number;
  /// Null while the efficacy of the controls that mitigate the threat is unknown.
  aroResidual: number | null;
  riesgoResidual: number | null;
}

/// A band of umbral_impacto plus the midpoint that gives the row's cells their colour.
export interface FilaImpacto {
  nombre: string;
  desde: number;
  hasta: number;
  medio: number;
}

export interface ColumnaFrecuencia {
  nombre: string;
  lectura: string;
  vecesAno: number;
}

export interface BandaVista {
  nombre: string;
  desde: number;
  hasta: number;
}

interface Props {
  filas: FilaRiesgo[];
  activos: ActivoVista[];
  amenazas: AmenazaVista[];
  procesos: string[];
  responsables: string[];
  categorias: string[];
  filasImpacto: FilaImpacto[];
  columnas: ColumnaFrecuencia[];
  bandas: BandaVista[];
  sinUbicar: number;
}

type Matriz = 'inherente' | 'residual';

interface Celda {
  matriz: Matriz;
  i: number;
  j: number;
}

/// Severity ramp, most severe first. Indexed by the band's position in umbral_riesgo
/// rather than by its name, so renaming a band does not silently turn it grey.
const RAMPA = [
  { bg: 'var(--hf-risk-critico-bg)', fg: 'var(--hf-risk-critico-fg)' },
  { bg: 'var(--hf-risk-alto-bg)', fg: 'var(--hf-risk-alto-fg)' },
  { bg: 'var(--hf-risk-medio-bg)', fg: 'var(--hf-risk-medio-fg)' },
  { bg: 'var(--hf-risk-bajo-bg)', fg: 'var(--hf-risk-bajo-fg)' },
];

const ABREVIATURA: Record<string, string> = {
  Crítico: 'CRÍT',
  Alto: 'ALTO',
  Medio: 'MED',
  Bajo: 'BAJO',
};

function colorBanda(indice: number) {
  return RAMPA[Math.min(Math.max(indice, 0), RAMPA.length - 1)];
}

function abreviar(nombre: string): string {
  return ABREVIATURA[nombre] ?? nombre.slice(0, 4).toUpperCase();
}

/// Thousands with a point, decimals with a comma. Written out rather than delegated to
/// toLocaleString: the same markup is produced on the server and in the browser, and
/// two ICU builds do not always agree.
function miles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/// The prototype's fmt: whole numbers above 100, four decimals below a hundredth so a
/// residual frequency of 0,0010 does not print as 0, two decimals in between.
function cifra(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 100) return miles(n);
  if (Math.abs(n) < 0.01) return n.toFixed(4).replace('.', ',');
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

const TODOS = { proceso: -1, responsable: -1, categoria: -1 };

export default function MatricesRiesgo({
  filas,
  activos,
  amenazas,
  procesos,
  responsables,
  categorias,
  filasImpacto,
  columnas,
  bandas,
  sinUbicar,
}: Props) {
  const [filtro, setFiltro] = useState(TODOS);
  const [celda, setCelda] = useState<Celda | null>(null);

  // --- Coordinates ------------------------------------------------------------------
  //
  // Where a risk sits on each matrix does not depend on the filter, so it is computed
  // once for the whole set instead of on every keystroke. The filter then only decides
  // which coordinates are counted.
  const coordenadas = useMemo(() => {
    const columnaDe = (veces: number): number => {
      // The frequency scale is geometric — 0,01 · 0,1 · 1 · 10 · 100 — so the nearest
      // column is the nearest in orders of magnitude, not in plain distance. Plain
      // distance would put an ARO of 5,5 in the "una vez al año" column when it is
      // nearer, decade for decade, to "cada mes". (The prototype uses plain distance;
      // this is a deliberate deviation, and it only ever moves residual values, since
      // an inherent ARO always lands exactly on a point of the scale.)
      if (!(veces > 0)) return 0; // efficacy of 100% drives the ARO to zero
      const log = Math.log10(veces);
      let mejor = 0;
      let distancia = Infinity;
      for (let j = 0; j < columnas.length; j++) {
        const d = Math.abs(Math.log10(columnas[j].vecesAno) - log);
        if (d < distancia) {
          distancia = d;
          mejor = j;
        }
      }
      return mejor;
    };

    return filas.map((f) => {
      const banda = clasificar(f.impacto, filasImpacto);
      const i = banda === null ? -1 : filasImpacto.findIndex((b) => b.nombre === banda);
      return {
        i,
        inherente: columnaDe(f.aro),
        residual: f.aroResidual === null ? -1 : columnaDe(f.aroResidual),
      };
    });
  }, [filas, filasImpacto, columnas]);

  // --- Filter -------------------------------------------------------------------------
  const indicesFiltrados = useMemo(() => {
    const salida: number[] = [];
    for (let k = 0; k < filas.length; k++) {
      const f = filas[k];
      const a = activos[f.activo];
      if (filtro.proceso >= 0 && a.proceso !== filtro.proceso) continue;
      const responsable = f.responsable >= 0 ? f.responsable : a.responsable;
      if (filtro.responsable >= 0 && responsable !== filtro.responsable) continue;
      if (filtro.categoria >= 0 && a.categoria !== filtro.categoria) continue;
      salida.push(k);
    }
    return salida;
  }, [filas, activos, filtro]);

  const conResidual = useMemo(
    () =>
      indicesFiltrados.filter(
        (k) => filas[k].riesgoResidual !== null && filas[k].aroResidual !== null,
      ).length,
    [indicesFiltrados, filas],
  );

  // --- Buckets ------------------------------------------------------------------------
  const rejillas = useMemo(() => {
    const vacia = () => filasImpacto.map(() => columnas.map(() => 0));
    const inherente = vacia();
    const residual = vacia();
    let ubicadosInh = 0;
    let ubicadosRes = 0;

    for (const k of indicesFiltrados) {
      const c = coordenadas[k];
      if (c.i < 0) continue;
      inherente[c.i][c.inherente] += 1;
      ubicadosInh++;
      if (c.residual >= 0) {
        residual[c.i][c.residual] += 1;
        ubicadosRes++;
      }
    }
    return { inherente, residual, ubicadosInh, ubicadosRes };
  }, [indicesFiltrados, coordenadas, filasImpacto, columnas]);

  // The band of every cell, from the row's midpoint times the column's frequency. It
  // depends only on the scales, so it survives every filter change.
  const bandasCelda = useMemo(
    () =>
      filasImpacto.map((b) =>
        columnas.map((c) => {
          const nombre = clasificar(b.medio * c.vecesAno, bandas);
          const indice = nombre === null ? bandas.length - 1 : bandas.findIndex((x) => x.nombre === nombre);
          return { nombre: nombre ?? '—', indice };
        }),
      ),
    [filasImpacto, columnas, bandas],
  );

  // --- Drill-down ----------------------------------------------------------------------
  const filasCelda = useMemo(() => {
    if (celda === null) return [];
    return indicesFiltrados.filter((k) => {
      const c = coordenadas[k];
      if (c.i !== celda.i) return false;
      return (celda.matriz === 'inherente' ? c.inherente : c.residual) === celda.j;
    });
  }, [celda, indicesFiltrados, coordenadas]);

  // --- Ten threats with the most high and critical risks ---------------------------------
  //
  // The handoff reads them off the residual risk. While the residual is unknown they
  // are read off the inherent one, and the card says which — a top ten labelled
  // "residual" that is secretly inherent is the same defect in a smaller frame.
  const sobreResidual = conResidual > 0;
  const topAmenazas = useMemo(() => {
    const severas = new Set(bandas.slice(0, 2).map((b) => b.nombre));
    const acumulado = new Map<number, number>();
    for (const k of indicesFiltrados) {
      const f = filas[k];
      const valor = sobreResidual ? f.riesgoResidual : f.riesgo;
      if (valor === null) continue;
      const nombre = clasificar(valor, bandas);
      if (nombre === null || !severas.has(nombre)) continue;
      acumulado.set(f.amenaza, (acumulado.get(f.amenaza) ?? 0) + 1);
    }
    const orden = [...acumulado.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maximo = orden.length > 0 ? orden[0][1] : 1;
    return orden.map(([indice, n]) => ({
      codigo: amenazas[indice].codigo,
      nombre: amenazas[indice].nombre,
      n,
      pct: Math.round((n / maximo) * 100),
    }));
  }, [indicesFiltrados, filas, amenazas, bandas, sobreResidual]);

  const hayFiltro =
    filtro.proceso >= 0 || filtro.responsable >= 0 || filtro.categoria >= 0;

  const seleccionar = (matriz: Matriz, i: number, j: number, n: number) => {
    if (n === 0) {
      setCelda(null);
      return;
    }
    setCelda((previa) =>
      previa && previa.matriz === matriz && previa.i === i && previa.j === j
        ? null
        : { matriz, i, j },
    );
  };

  return (
    <main className="px-8 pt-6 pb-14">
      <header className="mb-5 flex flex-col gap-4">
        <div>
          <h1 className="titulo-pagina">Matrices de riesgo</h1>
          <p className="parrafo mt-1 text-muted">
            Riesgo inherente y residual sobre los ejes de nivel de impacto y frecuencia
            esperada. Cada casilla se cuenta al abrir la pantalla desde los riesgos
            vigentes; no hay ninguna matriz almacenada. Haz clic en cualquier casilla para
            navegar los riesgos que contiene.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Filtro
            etiqueta="Proceso"
            valor={filtro.proceso}
            opciones={procesos}
            todos="Todos los procesos"
            onChange={(v) => {
              setFiltro((f) => ({ ...f, proceso: v }));
              setCelda(null);
            }}
          />
          <Filtro
            etiqueta="Responsable"
            valor={filtro.responsable}
            opciones={responsables}
            todos="Todos los responsables"
            onChange={(v) => {
              setFiltro((f) => ({ ...f, responsable: v }));
              setCelda(null);
            }}
          />
          <Filtro
            etiqueta="Categoría"
            valor={filtro.categoria}
            opciones={categorias}
            todos="Todas las categorías"
            onChange={(v) => {
              setFiltro((f) => ({ ...f, categoria: v }));
              setCelda(null);
            }}
          />
          {hayFiltro && (
            <button
              onClick={() => {
                setFiltro(TODOS);
                setCelda(null);
              }}
              className="text-12 font-semibold text-brand-nav hover:underline"
            >
              Limpiar
            </button>
          )}

          <div className="ml-auto flex items-baseline gap-2">
            <span className="cifra text-17 text-primary">{miles(indicesFiltrados.length)}</span>
            <span className="text-12 text-muted">
              riesgos en el filtro, de {miles(filas.length)}
            </span>
          </div>
        </div>
      </header>

      {celda !== null && (
        <DetalleCelda
          celda={celda}
          indices={filasCelda}
          filas={filas}
          activos={activos}
          amenazas={amenazas}
          responsables={responsables}
          procesos={procesos}
          categorias={categorias}
          filaImpacto={filasImpacto[celda.i]}
          columna={columnas[celda.j]}
          banda={bandasCelda[celda.i][celda.j]}
          bandas={bandas}
          onCerrar={() => setCelda(null)}
        />
      )}

      {/* auto-fit and not two fixed fractions: below roughly 1000px of content the two
          matrices stack instead of squeezing the cells past legibility. */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))' }}
      >
        <TarjetaMatriz
          titulo="Matriz de riesgo inherente"
          subtitulo="Antes de aplicar los controles. Nivel de impacto contra frecuencia esperada."
          total={rejillas.ubicadosInh}
          rejilla={rejillas.inherente}
          bandasCelda={bandasCelda}
          filasImpacto={filasImpacto}
          columnas={columnas}
          bandas={bandas}
          seleccion={celda?.matriz === 'inherente' ? celda : null}
          onCelda={(i, j, n) => seleccionar('inherente', i, j, n)}
        />

        {conResidual === 0 ? (
          <TarjetaResidualSinCalcular total={indicesFiltrados.length} />
        ) : (
          <TarjetaMatriz
            titulo="Matriz de riesgo residual"
            subtitulo="Después de descontar la eficacia de los controles preventivos, que reducen la frecuencia."
            total={rejillas.ubicadosRes}
            rejilla={rejillas.residual}
            bandasCelda={bandasCelda}
            filasImpacto={filasImpacto}
            columnas={columnas}
            bandas={bandas}
            seleccion={celda?.matriz === 'residual' ? celda : null}
            onCelda={(i, j, n) => seleccionar('residual', i, j, n)}
            aviso={
              conResidual < indicesFiltrados.length
                ? `${miles(indicesFiltrados.length - conResidual)} de ${miles(
                    indicesFiltrados.length,
                  )} riesgos del filtro quedan fuera de esta matriz: su eficacia todavía es desconocida.`
                : undefined
            }
          />
        )}
      </div>

      <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <section className="min-w-0 rounded-tarjeta border border-border-default bg-surface px-5 pt-[18px] pb-5">
          <h2 className="text-14 font-bold text-primary">
            Diez amenazas con más riesgos altos y críticos
          </h2>
          <p className="mt-0.5 text-11_5 text-muted">
            {sobreResidual
              ? 'Sobre el riesgo residual, dentro del filtro aplicado.'
              : 'Sobre el riesgo inherente, dentro del filtro aplicado: el residual todavía no está calculado.'}
          </p>
          <div className="mt-3.5 flex flex-col gap-1.5">
            {topAmenazas.length === 0 && (
              <p className="text-12 text-faint">
                Ninguna amenaza alcanza nivel alto o crítico en el filtro actual.
              </p>
            )}
            {topAmenazas.map((t) => (
              <div
                key={t.codigo}
                className="grid items-center gap-2.5"
                style={{ gridTemplateColumns: '52px minmax(0, 1fr) 130px 52px' }}
              >
                <span className="font-mono text-11_5 font-semibold text-accent-500">
                  {t.codigo}
                </span>
                <span className="truncate text-12_5 text-secondary" title={t.nombre}>
                  {t.nombre}
                </span>
                <span className="h-[7px] overflow-hidden rounded-badge bg-hairline">
                  <span
                    className="block h-full rounded-badge"
                    style={{
                      width: `${t.pct}%`,
                      background: 'var(--hf-risk-alto-bg)',
                    }}
                  />
                </span>
                <span className="text-right font-mono text-12 font-semibold tabular-nums text-secondary">
                  {miles(t.n)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-tarjeta border border-border-default bg-surface px-5 pt-[18px] pb-5">
          <h2 className="text-14 font-bold text-primary">Criterio de color de las casillas</h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {bandas.map((b, indice) => {
              const c = colorBanda(indice);
              return (
                <div key={b.nombre} className="flex items-center gap-2.5">
                  <span
                    className="flex h-[22px] w-[34px] flex-none items-center justify-center rounded-campo text-9 font-bold"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {abreviar(b.nombre)}
                  </span>
                  <span className="w-[62px] text-12_5 font-semibold text-secondary">
                    {b.nombre}
                  </span>
                  <span className="font-mono text-11_5 text-muted">
                    {rangoBanda(bandas, indice)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="parrafo mt-3 text-11_5 text-muted">
            El nivel de riesgo es el impacto acumulado multiplicado por las veces al año
            que se espera la amenaza. Un impacto moderado que ocurre cada mes pesa más que
            un impacto muy alto que ocurre una vez cada cien años. El color nunca es el
            único portador de la información: cada casilla lleva escrito su conteo y su
            nivel.
          </p>
        </section>
      </div>

      <p className="mt-5 text-11 leading-relaxed text-faint">
        Cada casilla se colorea por el riesgo representativo de su cruce — el punto medio
        de la banda de impacto por la frecuencia de la columna — mientras que cada riesgo
        del detalle lleva el nivel calculado con su propio valor.
        {sinUbicar > 0 && ` ${miles(sinUbicar)} riesgos no tienen impacto calculado y quedan fuera de las dos matrices.`}
      </p>
    </main>
  );
}

/// "25 o más" · "de 5 a menos de 25" · "menos de 0,5", derived from the thresholds so a
/// reparametrised scale relabels itself.
function rangoBanda(bandas: BandaVista[], indice: number): string {
  const b = bandas[indice];
  const superior = indice > 0 ? bandas[indice - 1].desde : null;
  if (indice === 0) return `${cifra(b.desde)} o más`;
  if (indice === bandas.length - 1) return `menos de ${cifra(superior as number)}`;
  return `de ${cifra(b.desde)} a menos de ${cifra(superior as number)}`;
}

function Filtro({
  etiqueta,
  valor,
  opciones,
  todos,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  opciones: string[];
  todos: string;
  onChange: (valor: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-[7px] border border-border-field bg-surface py-1.5 pr-1.5 pl-3">
      <span className="etiqueta-campo text-9_5">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={opciones.length === 0}
        className="max-w-[230px] rounded-[5px] border border-border-default bg-subtle px-2 py-1 text-12_5 font-medium text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      >
        <option value={-1}>{todos}</option>
        {opciones.map((o, i) => (
          <option key={o} value={i}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function TarjetaMatriz({
  titulo,
  subtitulo,
  total,
  rejilla,
  bandasCelda,
  filasImpacto,
  columnas,
  bandas,
  seleccion,
  onCelda,
  aviso,
}: {
  titulo: string;
  subtitulo: string;
  total: number;
  rejilla: number[][];
  bandasCelda: { nombre: string; indice: number }[][];
  filasImpacto: FilaImpacto[];
  columnas: ColumnaFrecuencia[];
  bandas: BandaVista[];
  seleccion: Celda | null;
  onCelda: (i: number, j: number, n: number) => void;
  aviso?: string;
}) {
  // Band totals, accumulated from the very same cells that are drawn above them. There
  // is no second pass over the risks and therefore no way for the two to disagree.
  const conteos = useMemo(() => {
    const acumulado = bandas.map(() => 0);
    rejilla.forEach((fila, i) =>
      fila.forEach((n, j) => {
        acumulado[bandasCelda[i][j].indice] += n;
      }),
    );
    const suma = acumulado.reduce((a, b) => a + b, 0) || 1;
    return bandas.map((b, i) => ({
      nombre: b.nombre,
      n: acumulado[i],
      pct: Math.round((acumulado[i] / suma) * 100),
    }));
  }, [rejilla, bandasCelda, bandas]);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-tarjeta border border-border-default bg-surface px-[22px] pt-5 pb-[22px]">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h2 className="text-15 font-bold text-primary">{titulo}</h2>
          <p className="mt-0.5 max-w-[46ch] text-11_5 text-muted [text-wrap:pretty]">
            {subtitulo}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end">
          <span className="cifra text-20 text-primary">{miles(total)}</span>
          <span className="etiqueta-campo text-9">Riesgos</span>
        </div>
      </div>

      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `90px repeat(${columnas.length}, minmax(52px, 1fr))` }}
      >
        <div className="flex items-end justify-end pr-2 pb-1 text-right font-mono text-8_5 leading-tight text-placeholder">
          IMPACTO ↓
          <br />
          FREC. →
        </div>
        {columnas.map((c) => (
          <div
            key={c.nombre}
            title={c.lectura}
            className="pb-[3px] text-center font-mono text-9 tracking-[0.04em] text-faint"
          >
            {c.nombre}
          </div>
        ))}

        {filasImpacto.map((b, i) => (
          <div key={b.nombre} style={{ display: 'contents' }}>
            <div className="flex items-center justify-end pr-2 text-right text-11 text-secondary-soft">
              {b.nombre}
            </div>
            {columnas.map((c, j) => {
              const n = rejilla[i][j];
              const banda = bandasCelda[i][j];
              const color = colorBanda(banda.indice);
              const activa =
                seleccion !== null && seleccion.i === i && seleccion.j === j;
              return (
                <button
                  key={c.nombre}
                  onClick={() => onCelda(i, j, n)}
                  title={`${banda.nombre} · impacto ${b.nombre.toLowerCase()} · ${cifra(
                    c.vecesAno,
                  )} ${c.vecesAno === 1 ? 'vez' : 'veces'} al año · ${miles(n)} riesgos`}
                  className="flex flex-col items-center justify-center gap-px rounded-campo transition-shadow hover:shadow-[0_0_0_2px_var(--hf-text-primary)]"
                  style={{
                    aspectRatio: '1.6 / 1',
                    background: n === 0 ? 'var(--hf-bg-app)' : color.bg,
                    color: n === 0 ? 'var(--hf-text-placeholder-soft)' : color.fg,
                    outline: activa ? '2px solid var(--hf-text-primary)' : '2px solid transparent',
                    outlineOffset: '1px',
                  }}
                >
                  <span className="cifra text-17">{n === 0 ? '—' : miles(n)}</span>
                  {/* Colour is never the only carrier: the abbreviation is written in
                      every cell, empty ones included. */}
                  <span className="text-8_5 tracking-[0.03em] opacity-85">
                    {abreviar(banda.nombre)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {aviso && (
        <p className="rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11 leading-relaxed text-warn-text">
          {aviso}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        {conteos.map((k, i) => {
          const color = colorBanda(i);
          return (
            <div key={k.nombre} className="flex items-center gap-2.5">
              <span
                className="h-[9px] w-[9px] flex-none rounded-swatch"
                style={{ background: color.bg }}
              />
              <span className="w-[62px] text-12 text-secondary">{k.nombre}</span>
              <span className="h-[7px] flex-1 overflow-hidden rounded-badge bg-hairline">
                <span
                  className="block h-full rounded-badge"
                  style={{ width: `${k.pct}%`, background: color.bg }}
                />
              </span>
              <span className="w-[42px] text-right font-mono text-12_5 font-semibold tabular-nums text-secondary">
                {miles(k.n)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/// The residual matrix while the residual risk is unknown.
///
/// This card exists instead of a grid on purpose. Efficacy comes from the maturity of
/// the controls mapped to each threat, and no threat has that mapping yet, so the
/// efficacy is unknown — not zero. With efficacy zero the residual ARO equals the
/// inherent one and this matrix would come out cell for cell identical to the one beside
/// it: consistent with its inputs and wrong as a report. Greying the grid would not fix
/// it either, because a grid of empty cells reads as "everything is in the lowest band".
function TarjetaResidualSinCalcular({ total }: { total: number }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-tarjeta border border-border-default bg-surface px-[22px] pt-5 pb-[22px]">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h2 className="text-15 font-bold text-primary">Matriz de riesgo residual</h2>
          <p className="mt-0.5 max-w-[46ch] text-11_5 text-muted [text-wrap:pretty]">
            Después de descontar la eficacia de los controles preventivos, que reducen la
            frecuencia.
          </p>
        </div>
        <div className="flex flex-none flex-col items-end">
          <span className="cifra text-20 text-faint">—</span>
          <span className="etiqueta-campo text-9">Riesgos</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-campo border border-dashed border-warn-border bg-warn-100 px-5 py-6">
        <span className="cifra text-22 text-warn-text">Sin calcular</span>
        <p className="text-12 leading-relaxed text-warn-text [text-wrap:pretty]">
          Ninguna amenaza tiene todavía controles con relevancia asignada, así que la
          eficacia de los controles es <strong>desconocida, no cero</strong>. Los{' '}
          {miles(total)} riesgos del filtro tienen el residual en blanco.
        </p>
        <p className="text-11_5 leading-relaxed text-warn-text [text-wrap:pretty]">
          Dibujar aquí la matriz suponiendo eficacia cero la dejaría idéntica, casilla por
          casilla, a la inherente: un informe coherente con sus datos de entrada y
          equivocado. Esta matriz aparece sola en cuanto se registre la relevancia de los
          pares control–amenaza.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        <p className="text-11_5 text-faint">
          Sin distribución por nivel mientras el residual no esté calculado.
        </p>
      </div>
    </section>
  );
}

const COLUMNAS_DETALLE =
  '138px minmax(180px, 1fr) 164px 186px 92px 232px 74px 78px 74px 100px';
// The handoff's layout rule: the min-width must be at least the sum of the columns plus
// the row padding. 138+180+164+186+92+232+74+78+74+100 = 1318, plus 16px of padding on
// each side = 1350. The prototype writes 1240 here, which is short of its own rule and
// clips the last column.
const MIN_DETALLE = 1350;
const MAXIMO_FILAS = 60;

function DetalleCelda({
  celda,
  indices,
  filas,
  activos,
  amenazas,
  responsables,
  procesos,
  categorias,
  filaImpacto,
  columna,
  banda,
  bandas,
  onCerrar,
}: {
  celda: Celda;
  indices: number[];
  filas: FilaRiesgo[];
  activos: ActivoVista[];
  amenazas: AmenazaVista[];
  responsables: string[];
  procesos: string[];
  categorias: string[];
  filaImpacto: FilaImpacto;
  columna: ColumnaFrecuencia;
  banda: { nombre: string; indice: number };
  bandas: BandaVista[];
  onCerrar: () => void;
}) {
  const color = colorBanda(banda.indice);
  const esInherente = celda.matriz === 'inherente';
  const visibles = indices.slice(0, MAXIMO_FILAS);

  return (
    <section className="mb-5 overflow-hidden rounded-tarjeta border border-border-default bg-surface">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-border-default bg-subtle px-[18px] py-3.5">
        <span
          className="rounded-[5px] px-2.5 py-1 text-12 font-bold"
          style={{ background: color.bg, color: color.fg }}
        >
          {banda.nombre}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-13_5 font-bold text-primary">
            {esInherente ? 'Riesgo inherente' : 'Riesgo residual'} · impacto{' '}
            {filaImpacto.nombre.toLowerCase()} · frecuencia {columna.nombre.toLowerCase()}
          </span>
          <span className="text-11_5 text-muted">
            {miles(indices.length)} riesgos en la casilla · impacto de{' '}
            {cifra(filaImpacto.desde)} a {cifra(filaImpacto.hasta)} · {cifra(columna.vecesAno)}{' '}
            {columna.vecesAno === 1 ? 'vez al año' : 'veces al año'}
          </span>
        </div>
        <button
          onClick={onCerrar}
          className="ml-auto flex-none rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 font-semibold text-secondary-soft hover:bg-app"
        >
          Cerrar detalle
        </button>
      </div>

      <div className="tabla-ancha">
        <div style={{ minWidth: MIN_DETALLE }}>
          <div
            className="etiqueta-campo grid gap-0 border-b border-border-default px-4 py-2.5"
            style={{ gridTemplateColumns: COLUMNAS_DETALLE }}
          >
            <div>Código</div>
            <div>Activo</div>
            <div>Proceso</div>
            <div>Responsable</div>
            <div>Tipo</div>
            <div>Amenaza</div>
            <div className="text-center">Impacto</div>
            <div className="text-center">Veces/año</div>
            <div className="text-center">Riesgo</div>
            <div className="text-right">Nivel</div>
          </div>

          {visibles.map((k) => {
            const f = filas[k];
            const a = activos[f.activo];
            const amenaza = amenazas[f.amenaza];
            const valor = esInherente ? f.riesgo : f.riesgoResidual;
            const veces = esInherente ? f.aro : f.aroResidual;
            const nivel = valor === null ? null : clasificar(valor, bandas);
            const responsableIndice = f.responsable >= 0 ? f.responsable : a.responsable;
            const categoria = a.categoria >= 0 ? categorias[a.categoria] : '';
            // "[D] Datos / Información" in 92px is only its MAGERIT code; the full name
            // stays in the title.
            const tipoCorto = categoria === '' ? '—' : `${categoria.split(']')[0]}]`;

            return (
              // Opens the asset sheet on this very threat, on its Amenazas tab, so the
              // row you clicked is the row you land on.
              <Link
                key={f.codigo}
                href={`/sgsi/inventario/${encodeURIComponent(a.codigo)}?tab=amenazas&amenaza=${encodeURIComponent(
                  amenazas[f.amenaza]?.codigo ?? '',
                )}`}
                className="grid items-center gap-0 border-b border-hairline-faint px-4 py-2 text-12_5 hover:bg-accent-50"
                style={{ gridTemplateColumns: COLUMNAS_DETALLE }}
              >
                <div className="font-mono text-11_5 font-semibold text-accent-500">
                  {f.codigo}
                </div>
                <div className="min-w-0 truncate pr-3.5 font-medium text-primary" title={a.nombre}>
                  {a.nombre}
                </div>
                <div className="min-w-0 truncate pr-3 text-muted">
                  {a.proceso >= 0 ? procesos[a.proceso] : '—'}
                </div>
                <div className="min-w-0 truncate pr-3 text-muted">
                  {responsableIndice >= 0 ? responsables[responsableIndice] : '—'}
                </div>
                <div className="pr-2.5 font-mono text-10_5 text-faint" title={categoria}>
                  {tipoCorto}
                </div>
                <div className="pr-3.5 text-11_5 leading-tight text-secondary">
                  {amenaza.codigo} · {amenaza.nombre}
                </div>
                <div className="text-center font-mono text-12 text-secondary">
                  {cifra(f.impacto)}
                </div>
                <div className="text-center font-mono text-11_5 text-muted">
                  {veces === null ? '—' : cifra(veces)}
                </div>
                <div className="text-center font-mono text-12_5 font-bold text-primary">
                  {valor === null ? '—' : cifra(valor)}
                </div>
                <div className="text-right">
                  <NivelRiesgo nombre={nivel} bandas={bandas} />
                </div>
              </Link>
            );
          })}

          <p className="px-4 py-2.5 text-11 text-label">
            {indices.length > MAXIMO_FILAS &&
              `Se muestran ${MAXIMO_FILAS} de ${miles(indices.length)} riesgos de la casilla. `}
            Clic en una fila abre la ficha del activo en la amenaza correspondiente.
          </p>
        </div>
      </div>
    </section>
  );
}

/// The level a single risk reaches with its OWN value, which is not necessarily the
/// level that colours its cell: the cell is coloured by the representative risk of the
/// crossing. A risk of 4,9 and one of 0,6 share a cell and do not share a badge.
function NivelRiesgo({ nombre, bandas }: { nombre: string | null; bandas: BandaVista[] }) {
  if (nombre === null) {
    return <span className="text-11 text-faint">sin calcular</span>;
  }
  const indice = bandas.findIndex((b) => b.nombre === nombre);
  const color = colorBanda(indice);
  return (
    <span
      className="inline-block rounded-badge px-2 py-0.5 text-10_5 font-semibold"
      style={{ background: color.bg, color: color.fg }}
    >
      {nombre}
    </span>
  );
}
