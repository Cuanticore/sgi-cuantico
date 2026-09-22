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
import {
  contarMatriz,
  matrizDeActivos,
  repartirPorBanda,
  ubicarRiesgo,
  type ColumnaFrecuencia,
  type FilaImpacto,
} from '@/lib/sgsi/matriz-clasica';

// Los ejes viven en `lib/sgsi/matriz-clasica.ts` desde que el informe de valoración imprime
// la misma matriz: la casilla a la que cae un riesgo la tiene que decidir UNA sola función, o
// el informe que se firma y la pantalla que se mira pueden terminar diciendo cosas distintas.
// Se re-exportan acá porque `app/sgsi/matrices/page.tsx` los importa de este módulo.
export type { ColumnaFrecuencia, FilaImpacto } from '@/lib/sgsi/matriz-clasica';

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
  /// Cuántos activos VIGENTES hay en el inventario, sin filtrar.
  ///
  /// La matriz de activos cuenta los que entran al análisis —los que superan el umbral de
  /// valoración—, y hoy eso son 30 de 378. La cifra no está mal calculada, pero un «30» solo,
  /// bajo el rótulo «Activos», se lee como «el inventario son 30». Esto es su denominador, y
  /// lo único que sobrevive del intento de presentar los 378 dentro de la rejilla.
  activosVigentes: number;
}

type Matriz = 'inherente' | 'residual';

/// Qué cuenta cada casilla.
///
/// «Amenazas» cuenta pares activo-amenaza: dónde está el riesgo. «Activos» cuenta activos,
/// cada uno una sola vez y en la casilla de su PEOR riesgo: de quién es el riesgo. Con 584
/// riesgos sobre 30 activos son dos preguntas distintas, y la segunda es la que hace un
/// comité. La regla de agregación —el peor, no el promedio— es la misma del inventario y de
/// la página de análisis, para que un activo no aparezca en Alto en una pantalla y en Medio
/// en la otra.
type Unidad = 'amenazas' | 'activos';

interface Celda {
  matriz: Matriz;
  i: number;
  j: number;
}

/// Lo que `TarjetaMatriz` necesita para dibujar, sea de amenazas o de activos.
interface Rejilla {
  conteos: number[][];
  bandas: (string | null)[][];
  bandasZona: (string | null)[][];
  total: number;
  reparto: { nombre: string; n: number }[];
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

/// El nombre de banda que trae la matriz, con su posición en el catálogo para el color. Una
/// banda desconocida cae en la última —la más leve— y se dibuja con su guion a la vista, que
/// es preferible a inventarle un color grave a algo que nadie clasificó.
function bandaDe(nombre: string | null, bandas: BandaVista[]) {
  const indice = nombre === null ? -1 : bandas.findIndex((x) => x.nombre === nombre);
  return { nombre: nombre ?? '—', indice: indice < 0 ? bandas.length - 1 : indice };
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
  activosVigentes,
}: Props) {
  const [filtro, setFiltro] = useState(TODOS);
  const [unidad, setUnidad] = useState<Unidad>('amenazas');
  const [celda, setCelda] = useState<Celda | null>(null);

  // --- Coordinates ------------------------------------------------------------------
  //
  // Where a risk sits on each matrix does not depend on the filter, so it is computed
  // once for the whole set instead of on every keystroke. The filter then only decides
  // which coordinates are counted.
  //
  // Ubicar es de `lib/sgsi/matriz-clasica.ts` —probado, y lo mismo que usa el informe—
  // hasta en la banda de impacto: esta pantalla tenía su propia copia de esa búsqueda, y
  // una copia sólo aguanta hasta el primer ajuste de escala.
  const coordenadas = useMemo(
    () =>
      filas.map((f) =>
        ubicarRiesgo(
          {
            impacto: f.impacto,
            aro: f.aro,
            aroResidual: f.aroResidual,
            activoCodigo: activos[f.activo]?.codigo,
          },
          filasImpacto,
          columnas,
        ),
      ),
    [filas, activos, filasImpacto, columnas],
  );

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

  // --- Buckets ------------------------------------------------------------------------
  //
  // Las dos rejillas las cuenta `contarMatriz`, la misma función que imprime el informe de
  // valoración. Esta pantalla las contaba por su cuenta, y por eso pintaba las casillas con
  // la banda de la ZONA mientras el informe ya las pintaba con la del peor riesgo que
  // contienen: dos superficies discrepando sobre la misma casilla, que es exactamente lo
  // que el módulo existe para impedir.
  const filtradas = useMemo(
    () => indicesFiltrados.map((k) => coordenadas[k]),
    [indicesFiltrados, coordenadas],
  );

  // Las cuatro rejillas se cuentan siempre, no sólo la que se está viendo: son cuatro
  // recorridos de un arreglo ya ubicado, y calcularlas juntas mantiene los `useMemo` con las
  // mismas dependencias en vez de invalidarlos al cambiar de unidad.
  const deAmenazas = useMemo(
    () =>
      (['inherente', 'residual'] as const).map((cara) => ({
        ...contarMatriz(filtradas, cara, filasImpacto, columnas, bandas),
        reparto: repartirPorBanda(filtradas, cara, bandas),
        // Las amenazas no colocan códigos de activo en la casilla: el detalle sale del
        // recorrido por coordenadas, más abajo.
        indices: null,
      })),
    [filtradas, filasImpacto, columnas, bandas],
  );
  const deActivos = useMemo(
    () =>
      (['inherente', 'residual'] as const).map((cara) => {
        const m = matrizDeActivos(filtradas, cara, filasImpacto, columnas, bandas);
        return { ...m, sinResidual: cara === 'residual' ? m.sinUbicar : 0 };
      }),
    [filtradas, filasImpacto, columnas, bandas],
  );

  const rejillas = unidad === 'amenazas' ? deAmenazas : deActivos;
  const matrizInherente = rejillas[0];
  const matrizResidual = rejillas[1];

  const conResidual = matrizResidual.total;

  // --- Drill-down ----------------------------------------------------------------------
  //
  // En «amenazas» la casilla contiene todos los riesgos que cayeron ahí. En «activos»
  // contiene un activo por fila, y la fila que se muestra es el riesgo que lo ubicó — su
  // peor riesgo —, que es la respuesta a «por qué está este activo acá». Esa correspondencia
  // la resuelve `matrizDeActivos`; recalcular acá el máximo por activo sería una segunda
  // cuenta sobre el mismo dato, y esa segunda cuenta es la que termina discrepando.
  const filasCelda = useMemo(() => {
    if (celda === null) return [];
    const m = celda.matriz === 'inherente' ? rejillas[0] : rejillas[1];
    if (m.indices !== null) {
      return (m.indices[celda.i]?.[celda.j] ?? []).map((p) => indicesFiltrados[p]);
    }
    return indicesFiltrados.filter((k) => {
      const c = coordenadas[k];
      if (c.i !== celda.i) return false;
      return (celda.matriz === 'inherente' ? c.inherente : c.residual) === celda.j;
    });
  }, [celda, rejillas, indicesFiltrados, coordenadas]);

  // --- Ten threats with the most high and critical risks ---------------------------------
  //
  // The handoff reads them off the residual risk. While the residual is unknown they
  // are read off the inherent one, and the card says which — a top ten labelled
  // "residual" that is secretly inherent is the same defect in a smaller frame.
  const sobreResidual = conResidual > 0;
  const matrizDe = (m: Matriz) => (m === 'inherente' ? matrizInherente : matrizResidual);
  const porActivos = unidad === 'activos';
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
            vigentes; no hay ninguna matriz almacenada.{' '}
            {porActivos
              ? 'Cada activo aparece una sola vez, en la casilla de su peor riesgo. Haz clic en cualquier casilla para ver qué activos contiene y qué riesgo los puso ahí.'
              : 'Haz clic en cualquier casilla para navegar los riesgos que contiene.'}
          </p>
          {/* EL DENOMINADOR DE LA CIFRA DE LAS TARJETAS.
              «30» bajo el rótulo «Activos», en una pantalla cuyo inventario tiene 378, se lee
              como «el inventario son 30». No está mal calculado: son exactamente los activos
              que entran al análisis. Falta decir de cuántos.
              No depende del filtro a propósito — es de cuántos hay, no de cuántos quedan —, y
              por eso se cuenta sobre el catálogo entero y no sobre el recorte. */}
          {porActivos && (
            <p data-testid="alcance-analisis" className="parrafo mt-1.5 text-12 text-faint">
              Esta matriz cuenta los <strong>{miles(activos.length)}</strong> activos que entran
              al análisis de riesgos —los que superan el umbral de valoración—, de{' '}
              {miles(activosVigentes)} activos vigentes en el inventario. Los demás no tienen
              riesgos calculados, así que no tienen impacto ni frecuencia con los que ubicarlos
              en esta rejilla.
            </p>
          )}
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

          <ConmutadorUnidad
            valor={unidad}
            onChange={(u) => {
              setUnidad(u);
              setCelda(null);
            }}
          />

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
          banda={bandaDe(matrizDe(celda.matriz).bandas[celda.i][celda.j], bandas)}
          bandaZona={bandaDe(matrizDe(celda.matriz).bandasZona[celda.i][celda.j], bandas)}
          bandas={bandas}
          unidad={unidad}
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
          matriz={matrizInherente}
          unidad={unidad}
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
            matriz={matrizResidual}
            unidad={unidad}
            filasImpacto={filasImpacto}
            columnas={columnas}
            bandas={bandas}
            seleccion={celda?.matriz === 'residual' ? celda : null}
            onCelda={(i, j, n) => seleccionar('residual', i, j, n)}
            aviso={
              matrizResidual.sinResidual > 0
                ? porActivos
                  ? `${miles(matrizResidual.sinResidual)} activos del filtro quedan fuera de esta matriz: ninguno de sus riesgos tiene el residual calculado.`
                  : `${miles(matrizResidual.sinResidual)} de ${miles(
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
          <p className="parrafo mt-2 text-11_5 text-muted">
            La lista de cada matriz cuenta los riesgos por su <strong>propio</strong> nivel,
            no por el color de la casilla en la que caen: dos riesgos de la misma casilla
            pueden estar en bandas distintas, y así se cuentan.
          </p>
        </section>
      </div>

      <p className="mt-5 text-11 leading-relaxed text-faint">
        Una casilla <strong>vacía</strong> se colorea por el riesgo representativo de su
        cruce — el punto medio de la banda de impacto por la frecuencia de la columna —, de
        modo que una zona crítica sigue leyéndose como crítica aunque hoy no haya nada ahí.
        Una casilla <strong>ocupada</strong> se colorea por el peor riesgo que contiene. La
        diferencia sólo aparece en la residual, donde la frecuencia después de los controles
        es continua y no cae sobre el punto nominal de su columna; pintar esas casillas por
        la zona dejaba riesgos altos dibujados como medios. El detalle de cada casilla
        siempre lleva el nivel calculado con el valor propio de cada riesgo.
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
      {/* El nombre va también en `aria-label`: el `<label>` envuelve al `<select>`, así que
          su texto accesible arrastraría además todas las opciones. */}
      <select
        aria-label={etiqueta}
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

/// Amenazas o activos. Dos botones y no un desplegable: son dos, y cuál está activo tiene
/// que verse sin abrir nada, porque cambia lo que significa cada cifra de la pantalla.
function ConmutadorUnidad({
  valor,
  onChange,
}: {
  valor: Unidad;
  onChange: (valor: Unidad) => void;
}) {
  const OPCIONES: { clave: Unidad; texto: string; ayuda: string }[] = [
    {
      clave: 'amenazas',
      texto: 'Amenazas',
      ayuda: 'Cada casilla cuenta pares activo-amenaza: dónde está el riesgo.',
    },
    {
      clave: 'activos',
      texto: 'Activos',
      ayuda:
        'Cada casilla cuenta activos, una sola vez cada uno y en la casilla de su peor riesgo: de quién es el riesgo.',
    },
  ];
  return (
    <div
      role="group"
      aria-label="Qué cuenta cada casilla"
      className="flex items-center gap-1 rounded-[7px] border border-border-field bg-surface p-1"
    >
      <span className="etiqueta-campo px-1.5 text-9_5">Cuenta</span>
      {OPCIONES.map((o) => {
        const activa = o.clave === valor;
        return (
          <button
            key={o.clave}
            type="button"
            title={o.ayuda}
            aria-pressed={activa}
            onClick={() => onChange(o.clave)}
            className={`rounded-[5px] px-2.5 py-1 text-12_5 font-semibold ${
              activa
                ? 'bg-accent-500 text-white'
                : 'text-secondary-soft hover:bg-app'
            }`}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

function TarjetaMatriz({
  titulo,
  subtitulo,
  matriz,
  unidad,
  filasImpacto,
  columnas,
  bandas,
  seleccion,
  onCelda,
  aviso,
}: {
  titulo: string;
  subtitulo: string;
  matriz: Rejilla;
  unidad: Unidad;
  filasImpacto: FilaImpacto[];
  columnas: ColumnaFrecuencia[];
  bandas: BandaVista[];
  seleccion: Celda | null;
  onCelda: (i: number, j: number, n: number) => void;
  aviso?: string;
}) {
  const total = matriz.total;
  const reparto = matriz.reparto;
  const cosa = unidad === 'activos' ? 'activos' : 'riesgos';

  // El reparto por nivel cuenta cada riesgo por SU valor, no por el color de la casilla que
  // lo contiene. Se acumulaba por casilla, y desde que una casilla ocupada se pinta con su
  // peor riesgo esa cuenta convertiría en altos a todos los medios que comparten casilla con
  // uno alto. La suma sigue siendo exactamente el total de la matriz — `repartirPorBanda` lo
  // garantiza y su prueba lo fija—, así que la lista no puede descuadrar contra la rejilla.
  const conteos = useMemo(() => {
    const suma = reparto.reduce((a, b) => a + b.n, 0) || 1;
    return reparto.map((b) => ({ ...b, pct: Math.round((b.n / suma) * 100) }));
  }, [reparto]);

  return (
    <section
      aria-label={titulo}
      className="flex min-w-0 flex-col gap-4 rounded-tarjeta border border-border-default bg-surface px-[22px] pt-5 pb-[22px]"
    >
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h2 className="text-15 font-bold text-primary">{titulo}</h2>
          <p className="mt-0.5 max-w-[46ch] text-11_5 text-muted [text-wrap:pretty]">
            {subtitulo}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end">
          <span data-testid="total-matriz" className="cifra text-20 text-primary">
            {miles(total)}
          </span>
          <span className="etiqueta-campo text-9">
            {unidad === 'activos' ? 'Activos' : 'Riesgos'}
          </span>
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
              const n = matriz.conteos[i][j];
              const banda = bandaDe(matriz.bandas[i][j], bandas);
              const zona = bandaDe(matriz.bandasZona[i][j], bandas);
              const color = colorBanda(banda.indice);
              const activa =
                seleccion !== null && seleccion.i === i && seleccion.j === j;
              return (
                <button
                  key={c.nombre}
                  data-testid={`casilla-${i}-${j}`}
                  onClick={() => onCelda(i, j, n)}
                  title={`${banda.nombre} · impacto ${b.nombre.toLowerCase()} · ${cifra(
                    c.vecesAno,
                  )} ${c.vecesAno === 1 ? 'vez' : 'veces'} al año · ${miles(n)} ${cosa}${
                    banda.nombre === zona.nombre
                      ? ''
                      : ` · la zona es ${zona.nombre}; la casilla sube a ${banda.nombre} por el peor riesgo que contiene`
                  }`}
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
            <div
              key={k.nombre}
              data-testid={`banda-${k.nombre}`}
              className="flex items-center gap-2.5"
            >
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
/// the controls mapped to each threat; when a threat has no EVALUATED control, its
/// efficacy is unknown — not zero.
///
/// Desde REQ-SIG-21 (16-sep-2026) las 57 amenazas tienen su control principal designado y
/// ningún riesgo vigente queda sin residual, así que esta tarjeta ya no aparece con los
/// datos de hoy. Se conserva porque la causa que la dispara sigue siendo posible: una
/// amenaza nueva sin controles mapeados, o con todos sus controles sin evaluar. With efficacy zero the residual ARO equals the
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
          Las amenazas de este filtro no tienen ningún control <strong>evaluado</strong>,
          así que su eficacia es <strong>desconocida, no cero</strong>. Los{' '}
          {miles(total)} riesgos del filtro tienen el residual en blanco.
        </p>
        <p className="text-11_5 leading-relaxed text-warn-text [text-wrap:pretty]">
          Dibujar aquí la matriz suponiendo eficacia cero la dejaría idéntica, casilla por
          casilla, a la inherente: un informe coherente con sus datos de entrada y
          equivocado. Esta matriz aparece sola en cuanto esas amenazas tengan al menos un
          control con su madurez evaluada.
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
  bandaZona,
  bandas,
  unidad,
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
  bandaZona: { nombre: string; indice: number };
  bandas: BandaVista[];
  unidad: Unidad;
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
            {miles(indices.length)} {unidad === 'activos' ? 'activos' : 'riesgos'} en la
            casilla · impacto de{' '}
            {cifra(filaImpacto.desde)} a {cifra(filaImpacto.hasta)} · {cifra(columna.vecesAno)}{' '}
            {columna.vecesAno === 1 ? 'vez al año' : 'veces al año'}
            {banda.nombre !== bandaZona.nombre &&
              ` · la zona del cruce es ${bandaZona.nombre}; la casilla queda en ${banda.nombre} por el peor riesgo que contiene`}
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
              `Se muestran ${MAXIMO_FILAS} de ${miles(indices.length)} ${
                unidad === 'activos' ? 'activos' : 'riesgos'
              } de la casilla. `}
            {unidad === 'activos' &&
              'Una fila por activo: el riesgo que se muestra es el peor del activo, que es el que lo ubica en esta casilla. '}
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
