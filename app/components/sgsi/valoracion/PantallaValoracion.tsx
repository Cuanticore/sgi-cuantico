'use client';

// app/components/sgsi/valoracion/PantallaValoracion.tsx
//
// La pantalla de Valoración de activos (REQ-SIG-18): cuatro pilas, una matriz y dos tablas.
//
// Responde de un golpe **cuánto vale el inventario, qué dimensión lo hace valioso y quién
// responde por lo que más vale**, y desde ahí lleva al activo concreto en dos clics. Hoy nada de
// eso se puede contestar: el inventario lista y filtra, pero no agrega.
//
// **La figura es el selector** (D-6). El rótulo de una fila no navega: pone la Tabla A en esa
// dimensión y le cambia el encabezado. La selección vive en un solo lugar y es la figura; no hay
// un segundo control dentro de la tarjeta de la tabla.
//
// **La pantalla no escribe nada.** No se valora desde acá —eso es la ficha del activo— y visitarla
// no deja una fila en `Bitacora`.
//
// **Toda la aritmética viene de `lib/sgsi/valoracion-agregada.ts`**, que es puro y probado, así
// que la fila del máximo de la matriz, la primera pila y los totales de la Tabla A son
// literalmente el mismo objeto leído tres veces. El criterio 2 del §10 pide que coincidan; con
// tres cálculos separados, coincidir habría sido una casualidad.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CRITERIO_MAX,
  criterios as construirCriterios,
  dimensionesQueMandan,
  escalaCompartida,
  matrizValoracion,
  nivelesAscendentes,
  tablaAgrupada,
  type ActivoAgregable,
  type DimensionActiva,
  type NivelEscala,
} from '@/lib/sgsi/valoracion-agregada';
import { urlDeInventario } from '@/lib/sgsi/inventario-filtros';
import PilasValoracion from './PilasValoracion';
import TablaValoracion from './TablaValoracion';
import GraficaDeTabla from './GraficaDeTabla';

export interface PantallaValoracionProps {
  activos: ActivoAgregable[];
  dimensiones: DimensionActiva[];
  escala: NivelEscala[];
  umbral: number;
  conPersona: number;
}

/// El rótulo del máximo en la figura y en la matriz explica la aritmética, porque ahí es donde se
/// descompone. En la Tabla B es «Valor final», que es el término que usó quien pidió la pantalla y
/// designa lo mismo: es corto porque encabeza un grupo de seis columnas y no hay lugar (D-9). El
/// tooltip de ese grupo dice la fórmula, para que nadie las crea distintas.
const ETIQUETA_MAXIMO_FIGURA = 'Valor del activo (máx D·I·C)';
const ETIQUETA_MAXIMO_TABLA = 'Valor final';

export default function PantallaValoracion({
  activos,
  dimensiones,
  escala,
  umbral,
  conPersona,
}: PantallaValoracionProps) {
  const [seleccionado, setSeleccionado] = useState<string>(CRITERIO_MAX);

  const niveles = useMemo(() => nivelesAscendentes(escala), [escala]);
  const criterios = useMemo(
    () => construirCriterios(dimensiones, ETIQUETA_MAXIMO_FIGURA),
    [dimensiones],
  );
  const criteriosDeTabla = useMemo(
    () => construirCriterios(dimensiones, ETIQUETA_MAXIMO_TABLA),
    [dimensiones],
  );

  const base = useMemo(
    () => ({ activos, dimensiones, niveles, umbral }),
    [activos, dimensiones, niveles, umbral],
  );

  const matriz = useMemo(() => matrizValoracion({ ...base, criterios }), [base, criterios]);
  const escalaDeFigura = useMemo(() => escalaCompartida(matriz), [matriz]);
  const dominancia = useMemo(() => dimensionesQueMandan(base), [base]);

  // La selección puede haber quedado apuntando a una dimensión que ya no está activa. Cae al
  // máximo en vez de dejar la tabla en blanco.
  const criterioVigente =
    criteriosDeTabla.find((c) => c.clave === seleccionado) ?? criteriosDeTabla[0]!;

  const tablaA = useMemo(
    () =>
      tablaAgrupada({
        ...base,
        agrupador: 'propietario',
        criterios: [criterioVigente],
        // La Tabla A SÍ lleva fila «Sin propietario»: un activo valioso sin dueño es lo que la
        // pantalla debe hacer visible. La Tabla B no (D-8), y la diferencia es este argumento.
        incluirSinAsignar: true,
      }),
    [base, criterioVigente],
  );

  // La Tabla B pasó de «custodio persona» a «tipo y subtipo».
  //
  // La anterior no se dibujaba nunca: la pareja activo↔persona está en cero y la pantalla
  // dedicaba una sección entera a explicar por qué no había tabla. Esa explicación era
  // correcta y seguía siendo una sección que no informaba de nada.
  //
  // El tipo y el subtipo, en cambio, son obligatorios en el modelo: TODO activo los tiene,
  // así que esta tabla siempre tiene algo que decir — y dice algo que ninguna otra pantalla
  // contesta: qué clase de activo concentra los valores altos. «Los datos valen más que los
  // equipos» deja de ser una intuición.
  const tablaB = useMemo(
    () =>
      tablaAgrupada({
        ...base,
        agrupador: 'subtipo',
        criterios: criteriosDeTabla,
        // Sin fila «sin asignar»: la clasificación MAGERIT es obligatoria, así que esa fila
        // nunca tendría nada. Una fila que no puede tener contenido es ruido.
        incluirSinAsignar: false,
      }),
    [base, criteriosDeTabla],
  );

  /// Los destinos arrastran la dimensión seleccionada. Con el máximo no va parámetro
  /// `dimension`; con C, I o D, sí (§6.4).
  const arrastreDeCriterio = (clave: string): Record<string, string | number> =>
    clave === CRITERIO_MAX ? {} : { dimension: clave };

  // Inventario vacío: ni figura ni tablas. Cuatro barras de ancho cero no informan de nada (§9).
  if (activos.length === 0) {
    return (
      <main className="px-8 pt-6 pb-14">
        <Encabezado umbral={umbral} />
        <p className="parrafo mt-6 rounded-tarjeta border border-border-default bg-surface px-5 py-6 text-12_5 text-muted">
          No hay activos vigentes en el inventario, así que no hay nada que valorar todavía.{' '}
          <Link href="/sgsi/inventario" className="font-semibold text-brand-nav underline">
            Ir al inventario de activos →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="px-8 pt-6 pb-14">
      <Encabezado umbral={umbral} />

      <div className="mt-5">
        <PilasValoracion
          matriz={matriz}
          criterios={criterios}
          niveles={niveles}
          escala={escalaDeFigura}
          umbral={umbral}
          vigentes={activos.length}
          dominancia={dominancia}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
        />
      </div>

      {/* Tabla A · propietario (cargo) × nivel de la dimensión seleccionada. */}
      <section className="mt-5 rounded-tarjeta border border-border-default bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-15 font-bold text-primary">
            Propietario ×{' '}
            {criterioVigente.clave === CRITERIO_MAX
              ? 'valor del activo'
              : criterioVigente.etiqueta}
          </h2>
          <p className="text-11_5 text-faint">
            {tablaA.filas.filter((f) => !f.sinAsignar).length} cargos con activos · orden por ≥{' '}
            {umbral} descendente
          </p>
        </div>
        <p className="parrafo mt-1 text-12 text-muted">
          El propietario es un <span className="font-semibold">cargo</span>, no una persona: dice
          quién responde por el activo en el organigrama y sobrevive a la rotación. Quién lo tiene
          en la mano es la tabla de abajo.
        </p>
        <div className="mt-3">
          <TablaValoracion
            tabla={tablaA}
            criterios={[criterioVigente]}
            niveles={niveles}
            umbral={umbral}
            agrupador="propietario"
            encabezadoAgrupador="Propietario (cargo)"
            arrastreDeCriterio={arrastreDeCriterio}
          />
        </div>

        <GraficaPlegable titulo="Ver la gráfica por propietario">
          <GraficaDeTabla
            tabla={tablaA}
            // La Tabla A muestra un criterio a la vez —el que la pantalla tenga elegido— y
            // la gráfica ofrece los cuatro: es una lectura, no una edición, así que cambiar
            // de criterio acá no mueve la tabla ni la URL.
            criterios={criteriosDeTabla}
            niveles={niveles}
            umbral={umbral}
            etiquetaGrupo="Propietario"
          />
        </GraficaPlegable>
      </section>

      {/* Tabla B · custodio (persona) × los cuatro criterios × nivel. */}
      <section className="mt-5 rounded-tarjeta border border-border-default bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-15 font-bold text-primary">Tipo y subtipo × los cuatro criterios</h2>
          <span className="text-12 text-faint">
            {tablaB.filas.length} subtipos con activos · orden por ≥ {umbral}
          </span>
        </div>

        <p className="parrafo mt-1 text-12 text-muted">
          Qué clase de activo concentra los valores altos. Cada fila es un subtipo MAGERIT con
          su tipo debajo, y la clasificación es obligatoria, así que todos los{' '}
          <span className="font-mono tabular-nums">{activos.length}</span> activos están en
          alguna fila — no hay «sin clasificar» que explicar.{' '}
          <span className="font-semibold">Valor final</span> es el máximo de las dimensiones,
          lo mismo que «Valor del activo (máx D·I·C)» de la matriz.
        </p>

        <div className="mt-3">
          <TablaValoracion
            tabla={tablaB}
            criterios={criteriosDeTabla}
            niveles={niveles}
            umbral={umbral}
            agrupador="subtipo"
            encabezadoAgrupador="Subtipo (y su tipo)"
            arrastreDeCriterio={arrastreDeCriterio}
          />
        </div>

        <GraficaPlegable titulo="Ver la gráfica por subtipo">
          <GraficaDeTabla
            tabla={tablaB}
            criterios={criteriosDeTabla}
            niveles={niveles}
            umbral={umbral}
            etiquetaGrupo="Subtipo"
          />
        </GraficaPlegable>
      </section>
    </main>
  );
}

function Encabezado({ umbral }: { umbral: number }) {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titulo-pagina mr-auto">Valoración de activos</h1>
        {/* El acceso PRINCIPAL al informe, y va acá y no en Análisis de riesgos porque el
            informe cubre el inventario ENTERO —incluidos los activos que no alcanzan el
            umbral— y ésta es la pantalla que resume ese mismo universo. */}
        <Link
          href="/sgsi/informe-valoracion"
          className="rounded-campo bg-accent-700 px-3 py-1.5 text-11_5 font-semibold text-white hover:bg-accent-800"
        >
          Generar informe
        </Link>
      </div>
      <p className="parrafo text-13 text-muted">
        Cuánto vale el inventario, qué dimensión lo hace valioso y quién responde por lo que más
        vale. El valor del activo es el mayor de sus dimensiones y se calcula, no se guarda; el
        umbral de {umbral} se lee de los parámetros. Cada cifra de esta pantalla abre el inventario
        con exactamente esos activos.
      </p>
    </header>
  );
}

/// La gráfica de una tabla, plegada por omisión.
///
/// PLEGADA Y NO ABIERTA, y no es indecisión: la tabla es el dato exacto y la gráfica es la
/// forma. Quien entra a esta pantalla viene casi siempre a buscar un número —«¿cuántos
/// activos de este cargo llegan a 4?»— y para eso la tabla ya está. Abrir la gráfica por
/// omisión empujaría la tabla media pantalla hacia abajo para responder una pregunta que
/// nadie hizo todavía.
function GraficaPlegable({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="mt-4 border-t border-hairline-strong pt-3">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex items-center gap-1.5 text-12 font-semibold text-accent-700 hover:underline"
      >
        <span aria-hidden>{abierta ? '▾' : '▸'}</span>
        {abierta ? 'Ocultar la gráfica' : titulo}
      </button>
      {abierta && <div className="mt-3">{children}</div>}
    </div>
  );
}
