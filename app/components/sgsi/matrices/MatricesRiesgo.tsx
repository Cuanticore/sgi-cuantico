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
  type ColumnaSinAnalizar,
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
  /// El valor propio del activo — el máximo de sus dimensiones, escala 0-5. Es lo que lo
  /// ubica en la columna «sin analizar» cuando no tiene ningún riesgo: no hay frecuencia,
  /// pero sí banda de impacto. `null` cuando el activo no está valorado.
  valor: number | null;
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
  /// El valor a partir del cual un activo entra al análisis de riesgos (`entraAlAnalisis`).
  /// Es la razón por la que la mayoría del inventario no tiene riesgos, y la pantalla la
  /// dice con su número en vez de mandar a buscarlo. `null` si el parámetro no existe.
  umbralValoracion: number | null;
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
///
/// En «activos» el universo es el INVENTARIO del filtro —378 activos—, no los 30 que superan
/// el umbral de valoración y por eso tienen riesgos. Contar sólo los 30 contesta «cuántos
/// activos analizamos» con la etiqueta «cuántos activos hay». Los otros 348 no caben en la
/// rejilla —sin amenaza evaluada no hay frecuencia—, pero sí tienen valor propio, y con él
/// se dibujan en la columna «Sin analizar».
type Unidad = 'amenazas' | 'activos';

interface Celda {
  matriz: Matriz;
  i: number;
  j: number;
}

/// La columna «sin analizar», como valor de `j`.
///
/// Un centinela y no un campo más en `Celda`: la selección viaja como (matriz, i, j) por
/// toda la pantalla, y agregar un booleano obligaría a revisar cada comparación —incluida la
/// de «¿es la misma casilla que ya estaba abierta?»—. −1 no puede colisionar con una columna
/// de frecuencia, que siempre es un índice válido del eje.
const SIN_ANALIZAR = -1;

/// Lo que `TarjetaMatriz` necesita para dibujar, sea de amenazas o de activos.
interface Rejilla {
  conteos: number[][];
  bandas: (string | null)[][];
  bandasZona: (string | null)[][];
  /// Lo que la tarjeta PRESENTA. En activos es el inventario del filtro entero; en amenazas,
  /// los riesgos que la rejilla ubica, que ahí es lo mismo.
  total: number;
  /// Lo que la rejilla DIBUJA. En activos puede ser menor que `total`.
  ubicados: number;
  reparto: { nombre: string; n: number }[];
  /// Sólo en activos: los del filtro sin ningún riesgo valorado. Se cuentan en `total` y se
  /// declaran en el pie, pero no caen en ninguna casilla de la rejilla.
  sinRiesgo: number;
  /// Sólo en activos: la columna aparte, con los que la rejilla no ubica puestos en la fila
  /// de su propio valor. `null` en amenazas, donde no hay valor propio que ubique nada.
  sinAnalizar: ColumnaSinAnalizar | null;
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
  umbralValoracion,
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

  // El inventario del filtro: TODOS los activos que pasan los mismos tres cortes, tengan
  // riesgo valorado o no. Es el universo de la matriz de activos.
  //
  // El responsable se mira acá sólo en el activo. A nivel de riesgo existe un override, y
  // un activo cuyo riesgo lo tenga puesto entra por la puerta del riesgo aunque su propio
  // responsable sea otro: `matrizDeActivos` cuenta a los dos y por eso no se pierde ninguno.
  const activosFiltrados = useMemo(() => {
    const salida: ActivoVista[] = [];
    for (const a of activos) {
      if (filtro.proceso >= 0 && a.proceso !== filtro.proceso) continue;
      if (filtro.responsable >= 0 && a.responsable !== filtro.responsable) continue;
      if (filtro.categoria >= 0 && a.categoria !== filtro.categoria) continue;
      salida.push(a);
    }
    return salida;
  }, [activos, filtro]);

  // Lo que `matrizDeActivos` necesita de cada uno: su código y su valor propio.
  const presentados = useMemo(
    () => activosFiltrados.map((a) => ({ codigo: a.codigo, valor: a.valor })),
    [activosFiltrados],
  );

  // Del código al activo, para que el detalle de la columna pueda mostrar nombre, proceso y
  // responsable sin recorrer el catálogo por cada fila.
  const porCodigo = useMemo(() => {
    const mapa = new Map<string, ActivoVista>();
    for (const a of activos) if (!mapa.has(a.codigo)) mapa.set(a.codigo, a);
    return mapa;
  }, [activos]);

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
      (['inherente', 'residual'] as const).map((cara) => {
        const m = contarMatriz(filtradas, cara, filasImpacto, columnas, bandas);
        return {
          ...m,
          // Un riesgo que entra al filtro siempre tiene sus dos cifras, así que acá el
          // universo y lo dibujado son lo mismo y no hay nadie que declarar aparte.
          ubicados: m.total,
          sinRiesgo: 0,
          // Una amenaza no tiene valor propio que la ubique fuera de la rejilla: la columna
          // aparte es de activos y acá no existe.
          sinAnalizar: null,
          reparto: repartirPorBanda(filtradas, cara, bandas),
          // Las amenazas no colocan códigos de activo en la casilla: el detalle sale del
          // recorrido por coordenadas, más abajo.
          indices: null,
        };
      }),
    [filtradas, filasImpacto, columnas, bandas],
  );
  const deActivos = useMemo(
    () =>
      (['inherente', 'residual'] as const).map((cara) => {
        const m = matrizDeActivos(
          filtradas,
          cara,
          filasImpacto,
          columnas,
          bandas,
          presentados,
        );
        // `sinUbicar` se reparte en las dos causas que lo producen, con los mismos nombres
        // que ya usa `contarMatriz`: así las dos rejillas tienen la misma forma y el aviso
        // del pie no necesita saber cuál de las dos está mirando.
        return {
          ...m,
          sinImpacto: cara === 'inherente' ? m.sinUbicar : 0,
          sinResidual: cara === 'residual' ? m.sinUbicar : 0,
        };
      }),
    [filtradas, filasImpacto, columnas, bandas, presentados],
  );

  const rejillas = unidad === 'amenazas' ? deAmenazas : deActivos;
  const matrizInherente = rejillas[0];
  const matrizResidual = rejillas[1];

  // Si la residual se dibuja o no lo decide lo que la rejilla UBICA, no lo que la tarjeta
  // presenta: con 348 activos sin riesgo valorado, un total mayor que cero no significa que
  // haya una sola casilla que dibujar.
  const conResidual = matrizResidual.ubicados;

  // --- Drill-down ----------------------------------------------------------------------
  //
  // En «amenazas» la casilla contiene todos los riesgos que cayeron ahí. En «activos»
  // contiene un activo por fila, y la fila que se muestra es el riesgo que lo ubicó — su
  // peor riesgo —, que es la respuesta a «por qué está este activo acá». Esa correspondencia
  // la resuelve `matrizDeActivos`; recalcular acá el máximo por activo sería una segunda
  // cuenta sobre el mismo dato, y esa segunda cuenta es la que termina discrepando.
  const filasCelda = useMemo(() => {
    if (celda === null || celda.j === SIN_ANALIZAR) return [];
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

  // Los activos de una casilla de la columna aparte. Salen de `matrizDeActivos`, que es
  // quien decidió la fila de cada uno; volver a clasificar acá el valor sería una segunda
  // cuenta sobre el mismo dato, y esa segunda cuenta es la que termina discrepando.
  const activosCelda = useMemo(() => {
    if (celda === null || celda.j !== SIN_ANALIZAR) return [];
    const m = celda.matriz === 'inherente' ? rejillas[0] : rejillas[1];
    const codigos = m.sinAnalizar?.codigos[celda.i] ?? [];
    return codigos.map((c) => porCodigo.get(c)).filter((a): a is ActivoVista => a !== undefined);
  }, [celda, rejillas, porCodigo]);

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

  /// Quién queda fuera de la rejilla y por qué, en una frase por causa.
  ///
  /// Son dos causas distintas y se corrigen distinto: al activo SIN RIESGO le falta que
  /// alguien le evalúe una amenaza; al activo SIN RESIDUAL le falta la madurez de un control
  /// de una amenaza que ya tiene. Juntarlas en «N activos quedan fuera» obligaría a quien
  /// lee a adivinar cuál de los dos trabajos pendientes es el suyo.
  const avisoDe = (m: {
    sinRiesgo: number;
    sinImpacto: number;
    sinResidual: number;
    sinAnalizar: ColumnaSinAnalizar | null;
  }): string | undefined => {
    const partes: string[] = [];
    if (porActivos && m.sinRiesgo > 0) {
      const uno = m.sinRiesgo === 1;
      // Cuántos de ellos son GRAVES por su propio valor. Es lo que un comité busca en esta
      // columna, y decir sólo «348 quedan fuera» lo esconde: la cifra que importa no es
      // cuántos son, es cuántos de ellos pesan. Sale de las dos peores bandas del eje de
      // impacto, sin nombrarlas a mano, para que reparametrizar la escala no la tuerza.
      const graves =
        m.sinAnalizar === null
          ? 0
          : m.sinAnalizar.conteos.slice(0, 2).reduce((a, b) => a + b, 0);
      const nombresGraves = filasImpacto
        .slice(0, 2)
        .map((f) => f.nombre.toLowerCase())
        .join(' o ');
      partes.push(
        `${miles(m.sinRiesgo)} ${uno ? 'activo' : 'activos'} del filtro no ${
          uno ? 'alcanza' : 'alcanzan'
        } el umbral de valoración${
          umbralValoracion === null ? '' : ` (${cifra(umbralValoracion)})`
        }, así que el motor no ${uno ? 'le' : 'les'} generó riesgos y no ${
          uno ? 'tiene' : 'tienen'
        } frecuencia. ${uno ? 'Va' : 'Van'} en la columna «Sin analizar», en la fila de su propio valor${
          graves > 0
            ? `: ${miles(graves)} ${graves === 1 ? 'es' : 'son'} de impacto ${nombresGraves}`
            : ''
        }.`,
      );
    }
    if (porActivos && m.sinImpacto > 0) {
      partes.push(
        `${miles(m.sinImpacto)} activos del filtro tienen riesgos, pero ninguno con el impacto calculado.`,
      );
    }
    if (m.sinResidual > 0) {
      partes.push(
        porActivos
          ? `${miles(m.sinResidual)} activos del filtro tienen riesgos, pero ninguno con el residual calculado.`
          : `${miles(m.sinResidual)} de ${miles(
              indicesFiltrados.length,
            )} riesgos del filtro quedan fuera de esta matriz: su eficacia todavía es desconocida.`,
      );
    }
    return partes.length === 0 ? undefined : partes.join(' ');
  };

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
              ? 'Cada activo aparece una sola vez, en la casilla de su peor riesgo. El total es el inventario del filtro entero. Los activos que no alcanzan el umbral de valoración no tienen riesgos generados ni, por tanto, frecuencia: van en la columna «Sin analizar», ubicados por su propio valor. Haz clic en cualquier casilla para ver qué activos contiene.'
              : 'Haz clic en cualquier casilla para navegar los riesgos que contiene.'}
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

          <ConmutadorUnidad
            valor={unidad}
            onChange={(u) => {
              setUnidad(u);
              setCelda(null);
            }}
          />

          {/* La cifra del encabezado cuenta lo mismo que las tarjetas. Contando siempre
              riesgos, la pantalla decía «584 riesgos en el filtro» junto a dos tarjetas que
              dicen «378 activos»: dos cifras que no se pueden sumar ni comparar. */}
          <div className="ml-auto flex items-baseline gap-2">
            <span className="cifra text-17 text-primary">
              {miles(porActivos ? activosFiltrados.length : indicesFiltrados.length)}
            </span>
            <span className="text-12 text-muted">
              {porActivos
                ? `activos en el filtro, de ${miles(activos.length)}`
                : `riesgos en el filtro, de ${miles(filas.length)}`}
            </span>
          </div>
        </div>
      </header>

      {celda !== null && celda.j === SIN_ANALIZAR && (
        <DetalleSinAnalizar
          activos={activosCelda}
          filaImpacto={filasImpacto[celda.i]}
          procesos={procesos}
          responsables={responsables}
          categorias={categorias}
          onCerrar={() => setCelda(null)}
        />
      )}

      {celda !== null && celda.j !== SIN_ANALIZAR && (
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
          aviso={avisoDe(matrizInherente)}
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
            aviso={avisoDe(matrizResidual)}
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
        {porActivos &&
          ' En «activos» el total de cada tarjeta es el inventario del filtro entero. La columna «Sin analizar» no es una columna de frecuencia y por eso va separada del eje y sin color de riesgo: quien está ahí no tiene frecuencia, así que su riesgo es desconocido y no bajo. Lo que sí tiene es su propio valor, que es el impacto que alcanzaría si una amenaza lo degradara por completo, y eso es lo que le da la fila. Un activo sin valorar no tiene ni siquiera eso: se cuenta aparte, porque meterlo en la banda más baja diría que es despreciable cuando lo que pasa es que nadie lo ha valorado.'}
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
        'Cada casilla cuenta activos, una sola vez cada uno y en la casilla de su peor riesgo: de quién es el riesgo. El total es el inventario del filtro, y los que no alcanzan el umbral de valoración van en la columna «Sin analizar».',
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

  // La columna aparte se dibuja siempre que haya alguien en ella. Sin nadie no se dibuja:
  // una columna vacía permanente sólo le quita ancho a la rejilla.
  const columnaAparte = matriz.sinAnalizar;
  const enLaColumna = columnaAparte?.conteos.reduce((a, b) => a + b, 0) ?? 0;
  const hayColumna = columnaAparte !== null && enLaColumna > 0;
  const sinValorar = columnaAparte?.sinValor ?? 0;

  // El reparto por nivel cuenta cada riesgo por SU valor, no por el color de la casilla que
  // lo contiene. Se acumulaba por casilla, y desde que una casilla ocupada se pinta con su
  // peor riesgo esa cuenta convertiría en altos a todos los medios que comparten casilla con
  // uno alto. La suma sigue siendo exactamente el total de la matriz — `repartirPorBanda` lo
  // garantiza y su prueba lo fija—, así que la lista no puede descuadrar contra la rejilla.
  //
  // El denominador es el TOTAL de la tarjeta, no la suma del reparto: con 348 activos fuera
  // de la rejilla, medir las barras contra los 30 ubicados haría que «30 críticos» dibujara
  // una barra llena en una pantalla que acaba de decir 378. La diferencia entre las dos
  // cifras son los dos renglones de abajo.
  const denominador = total || 1;
  const conteos = useMemo(
    () => reparto.map((b) => ({ ...b, pct: Math.round((b.n / denominador) * 100) })),
    [reparto, denominador],
  );
  const pct = (n: number) => Math.round((n / denominador) * 100);

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

      {/* La columna aparte va PRIMERO y separada por un hueco mayor: no pertenece al eje de
          frecuencia. Ponerla al final, pegada a «Muy alta», la leería como la frecuencia más
          alta de todas — exactamente lo contrario de lo que dice. */}
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: hayColumna
            ? `90px 58px 14px repeat(${columnas.length}, minmax(52px, 1fr))`
            : `90px repeat(${columnas.length}, minmax(52px, 1fr))`,
        }}
      >
        <div className="flex items-end justify-end pr-2 pb-1 text-right font-mono text-8_5 leading-tight text-placeholder">
          IMPACTO ↓
          <br />
          FREC. →
        </div>
        {hayColumna && (
          <>
            <div
              data-testid="cabecera-sin-analizar"
              title="Sin analizar — el activo no alcanza el umbral de valoración, así que el motor no le generó riesgos. Se ubica por su propio valor; no tiene frecuencia."
              className="pb-[3px] text-center font-mono text-9 leading-tight tracking-[0.04em] text-faint"
            >
              {/* Que envuelva solo, sin un <br/>: partirlo a mano dejaría el texto accesible
                  como «Sinanalizar», sin el espacio. */}
              Sin analizar
            </div>
            <div aria-hidden />
          </>
        )}
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
            {hayColumna && (
              <>
                <CasillaSinAnalizar
                  n={columnaAparte.conteos[i]}
                  banda={b.nombre}
                  activa={seleccion !== null && seleccion.i === i && seleccion.j === SIN_ANALIZAR}
                  onClic={() => onCelda(i, SIN_ANALIZAR, columnaAparte.conteos[i])}
                  testId={`sinanalizar-${i}`}
                />
                <div aria-hidden />
              </>
            )}
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

        {/* Ninguno de estos dos es una banda de riesgo: son la ausencia de una. Van separados
            por un filete, con el punto hueco y sin color de la rampa — pintarlos del color más
            leve diría que esos activos son de riesgo bajo, que es justamente lo que nadie ha
            determinado. Y van separados ENTRE SÍ porque tienen causas distintas: al de arriba
            le falta que alcance el umbral de valoración; al de abajo, que alguien lo valore. */}
        {(enLaColumna > 0 || sinValorar > 0) && (
          <div className="mt-1 flex flex-col gap-1.5 border-t border-dashed border-hairline pt-2">
            {enLaColumna > 0 && (
              <RenglonSinRiesgo
                testId="banda-sin-analizar"
                etiqueta="Sin analizar"
                n={enLaColumna}
                pct={pct(enLaColumna)}
              />
            )}
            {sinValorar > 0 && (
              <RenglonSinRiesgo
                testId="sin-valorar"
                etiqueta="Sin valorar"
                n={sinValorar}
                pct={pct(sinValorar)}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/// Una casilla de la columna aparte.
///
/// NO LLEVA COLOR DE RIESGO, y ésa es toda la razón de que sea un componente propio en vez
/// de una variante de la casilla normal. Riesgo es impacto por frecuencia; acá la frecuencia
/// es desconocida, así que el riesgo también lo es. Pintarla con la banda más leve diría
/// «riesgo bajo» sobre algo que nadie ha calculado, que es la mentira que esta pantalla lleva
/// tres cicatrices evitando.
///
/// Lo que sí dice es la fila: el valor propio del activo, que es su impacto si una amenaza lo
/// degradara por completo. Por eso el segundo renglón repite la banda de impacto y no una de
/// riesgo — es lo único que se sabe.
function CasillaSinAnalizar({
  n,
  banda,
  activa,
  onClic,
  testId,
}: {
  n: number;
  banda: string;
  activa: boolean;
  onClic: () => void;
  testId: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClic}
      disabled={n === 0}
      title={
        n === 0
          ? `Sin analizar · impacto ${banda.toLowerCase()} · ningún activo`
          : `Sin analizar · ${miles(n)} ${n === 1 ? 'activo' : 'activos'} de valor propio ${banda.toLowerCase()}, sin riesgos generados. No tienen frecuencia, así que no entran a la rejilla.`
      }
      className="flex flex-col items-center justify-center gap-px rounded-campo border border-dashed border-border-field bg-app transition-shadow enabled:hover:shadow-[0_0_0_2px_var(--hf-text-primary)]"
      style={{
        aspectRatio: '1.6 / 1',
        color: n === 0 ? 'var(--hf-text-placeholder-soft)' : 'var(--hf-text-secondary)',
        outline: activa ? '2px solid var(--hf-text-primary)' : '2px solid transparent',
        outlineOffset: '1px',
      }}
    >
      {/* Sólo la cifra. Las casillas de la rejilla llevan debajo su banda de riesgo porque el
          color no puede ser el único portador; acá no hay color que decodificar, y la banda
          que le correspondería —la de IMPACTO— ya está escrita en el rótulo de la fila. La
          repetición además salía ambigua: `abreviar` recorta «Muy alto» y «Muy bajo» al mismo
          «MUY». */}
      <span className="cifra text-17">{n === 0 ? '—' : miles(n)}</span>
    </button>
  );
}

/// Un renglón del pie que no es una banda de riesgo.
function RenglonSinRiesgo({
  testId,
  etiqueta,
  n,
  pct,
}: {
  testId: string;
  etiqueta: string;
  n: number;
  pct: number;
}) {
  return (
    <div data-testid={testId} className="flex items-center gap-2.5">
      <span className="h-[9px] w-[9px] flex-none rounded-swatch border border-border-field" />
      <span className="w-[62px] text-12 text-muted">{etiqueta}</span>
      <span className="h-[7px] flex-1 overflow-hidden rounded-badge bg-hairline">
        <span
          className="block h-full rounded-badge border border-border-field"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-[42px] text-right font-mono text-12_5 font-semibold tabular-nums text-muted">
        {miles(n)}
      </span>
    </div>
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

const COLUMNAS_SIN_ANALIZAR = '138px minmax(220px, 1fr) 200px 220px 120px 90px';
const MIN_SIN_ANALIZAR = 1020;

/// El detalle de una casilla de la columna aparte.
///
/// Es una tabla distinta de la de la rejilla y no una variante suya, porque las preguntas no
/// se parecen: allá la fila es un RIESGO —amenaza, veces al año, nivel— y acá no hay ninguno.
/// Reutilizar la tabla obligaría a dejar cuatro columnas en guion, y una fila llena de
/// guiones se lee como «faltan datos» cuando lo que pasa es que la pregunta es otra.
///
/// Lo que sí hay que poder hacer desde acá es lo mismo: abrir la ficha del activo. Por eso
/// cada fila es un enlace, aunque no tenga amenaza a la que apuntar.
function DetalleSinAnalizar({
  activos,
  filaImpacto,
  procesos,
  responsables,
  categorias,
  onCerrar,
}: {
  activos: ActivoVista[];
  filaImpacto: FilaImpacto;
  procesos: string[];
  responsables: string[];
  categorias: string[];
  onCerrar: () => void;
}) {
  const visibles = activos.slice(0, MAXIMO_FILAS);

  return (
    <section
      aria-label={`Sin analizar · impacto ${filaImpacto.nombre.toLowerCase()}`}
      className="mb-5 overflow-hidden rounded-tarjeta border border-border-default bg-surface"
    >
      <div className="flex flex-wrap items-center gap-3.5 border-b border-border-default bg-subtle px-[18px] py-3.5">
        <span className="rounded-[5px] border border-dashed border-border-field px-2.5 py-1 text-12 font-bold text-secondary-soft">
          Sin analizar
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-13_5 font-bold text-primary">
            Valor propio {filaImpacto.nombre.toLowerCase()} · sin riesgos generados
          </span>
          <span className="text-11_5 text-muted">
            {miles(activos.length)} {activos.length === 1 ? 'activo' : 'activos'} · valor de{' '}
            {cifra(filaImpacto.desde)} a {cifra(filaImpacto.hasta)} · no alcanzan el umbral de
            valoración, así que el motor no les generó riesgos y no tienen frecuencia que los
            ubique en la rejilla
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
        <div style={{ minWidth: MIN_SIN_ANALIZAR }}>
          <div
            className="etiqueta-campo grid gap-0 border-b border-border-default px-4 py-2.5"
            style={{ gridTemplateColumns: COLUMNAS_SIN_ANALIZAR }}
          >
            <div>Código</div>
            <div>Activo</div>
            <div>Proceso</div>
            <div>Responsable</div>
            <div>Tipo</div>
            <div className="text-right">Valor</div>
          </div>

          {visibles.map((a) => {
            const categoria = a.categoria >= 0 ? categorias[a.categoria] : '';
            return (
              <Link
                key={a.codigo}
                href={`/sgsi/inventario/${encodeURIComponent(a.codigo)}`}
                className="grid items-center gap-0 border-b border-hairline-faint px-4 py-2 text-12_5 hover:bg-accent-50"
                style={{ gridTemplateColumns: COLUMNAS_SIN_ANALIZAR }}
              >
                <div className="font-mono text-11_5 font-semibold text-accent-500">
                  {a.codigo}
                </div>
                <div className="min-w-0 truncate pr-3.5 font-medium text-primary" title={a.nombre}>
                  {a.nombre}
                </div>
                <div className="min-w-0 truncate pr-3 text-muted">
                  {a.proceso >= 0 ? procesos[a.proceso] : '—'}
                </div>
                <div className="min-w-0 truncate pr-3 text-muted">
                  {a.responsable >= 0 ? responsables[a.responsable] : '—'}
                </div>
                <div className="min-w-0 truncate pr-2.5 text-11 text-faint" title={categoria}>
                  {categoria === '' ? '—' : categoria}
                </div>
                <div className="text-right font-mono text-12_5 font-bold text-primary">
                  {a.valor === null ? '—' : cifra(a.valor)}
                </div>
              </Link>
            );
          })}

          <p className="px-4 py-2.5 text-11 text-label">
            {activos.length > MAXIMO_FILAS &&
              `Se muestran ${MAXIMO_FILAS} de ${miles(activos.length)} activos de la casilla. `}
            El valor es el máximo de las dimensiones del activo, en la misma escala que el
            impacto. Clic en una fila abre la ficha del activo.
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
