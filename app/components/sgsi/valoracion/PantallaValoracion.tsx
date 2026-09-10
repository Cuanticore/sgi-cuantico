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

  const tablaB = useMemo(
    () =>
      tablaAgrupada({
        ...base,
        agrupador: 'persona',
        criterios: criteriosDeTabla,
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
      </section>

      {/* Tabla B · custodio (persona) × los cuatro criterios × nivel. */}
      <section className="mt-5 rounded-tarjeta border border-border-default bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-15 font-bold text-primary">Custodio persona × los cuatro criterios</h2>
        </div>

        {/* La línea de encuadre, que va ENCIMA y no en una nota al pie: una matriz de 24 columnas
            que arranca casi vacía, sin explicación, parece rota (§6.6). */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-12_5 text-secondary">
            <span className="font-mono font-semibold tabular-nums text-primary">{conPersona}</span>{' '}
            de{' '}
            <span className="font-mono tabular-nums">{activos.length}</span> activos están
            entregados a una persona. Los otros{' '}
            <span className="font-mono tabular-nums">{activos.length - conPersona}</span> no tienen
            custodio persona asignado.
          </p>
          <Link
            href={urlDeInventario({ persona: '__sin__' })}
            className="text-12 font-semibold text-brand-nav underline decoration-from-font underline-offset-2"
          >
            ver en el inventario →
          </Link>
        </div>

        {conPersona === 0 ? (
          <p className="parrafo mt-3 text-11_5 text-faint">
            La tabla no se dibuja porque no hay a quién listar, y eso es el estado normal hoy: la
            pareja activo↔persona no se carga desde ningún libro. Se escribe de a un activo por vez
            desde el popup de asignación de equipos, y cargarla desde un Excel es un requerimiento
            aparte. No es que falten personas en el sistema: es que esa asignación todavía no se
            hizo. Una matriz de {criteriosDeTabla.length * niveles.length} columnas vacías no
            informa de nada.
          </p>
        ) : (
          <>
            <p className="parrafo mt-1 text-12 text-muted">
              Solo los activos entregados a alguien. Los cuatro grupos describen los mismos activos
              de cada persona, así que sus totales por fila coinciden.{' '}
              <span className="font-semibold">Valor final</span> es el máximo de las dimensiones —lo
              mismo que «Valor del activo (máx D·I·C)» de la matriz—.
            </p>
            <div className="mt-3">
              <TablaValoracion
                tabla={tablaB}
                criterios={criteriosDeTabla}
                niveles={niveles}
                umbral={umbral}
                agrupador="persona"
                encabezadoAgrupador="Custodio (persona)"
                arrastreDeCriterio={arrastreDeCriterio}
                // Sin esto, el encabezado de columna llevaría a todo el inventario y el número no
                // coincidiría con el total de la columna: el mismo defecto del §7.4, en otra
                // puerta.
                arrastreDeColumna={{ conPersona: 1 }}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Encabezado({ umbral }: { umbral: number }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="titulo-pagina">Valoración de activos</h1>
      <p className="parrafo text-13 text-muted">
        Cuánto vale el inventario, qué dimensión lo hace valioso y quién responde por lo que más
        vale. El valor del activo es el mayor de sus dimensiones y se calcula, no se guarda; el
        umbral de {umbral} se lee de los parámetros. Cada cifra de esta pantalla abre el inventario
        con exactamente esos activos.
      </p>
    </header>
  );
}
