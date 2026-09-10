'use client';

// app/components/sgsi/valoracion/PilasValoracion.tsx
//
// La figura del REQ-SIG-18 §4: cuatro barras apiladas horizontales, una por criterio, alineadas
// a la izquierda, sobre una misma escala absoluta de conteo. Y debajo, la matriz en números que
// respalda cada cifra.
//
// **SVG a mano y no echarts, a propósito.** El repo tiene `echarts` y `echarts-for-react`, pero
// se usan solo en `app/components/charts` (el tablero de indicadores heredado) y en ninguna
// pantalla del SGSI; el único gráfico del módulo, `inicio/RadarCapacidades.tsx`, es SVG a mano
// con su geometría en un módulo puro y probado. Esta figura pide cinco cosas que una serie
// apilada de echarts no da sin pelearse con la librería, y que son requisitos escritos:
//
//   1. **Cada segmento es un enlace tabulable con su propio destino** (`?dimension=C&valor=4`).
//      En echarts los segmentos son canvas: no hay foco de teclado por segmento ni `href`.
//   2. **La marca del umbral cae en una x distinta por fila**, en la frontera acumulada del
//      nivel del umbral de ESA fila. Un `markLine` de echarts es por valor de eje, no por
//      frontera acumulada de una pila.
//   3. **2 px de superficie entre segmentos y esquinas de 4 px solo en los dos extremos**, del
//      lado de afuera.
//   4. **Escala absoluta compartida sin normalizar**, con el eje arriba y una sola leyenda.
//   5. La misma geometría tiene que ser **probable sin renderizar**, que es lo que
//      `lib/sgsi/valoracion-figura.ts` permite y un canvas no.
//
// Con echarts, las cinco se resuelven a fuerza de `custom series`, o sea dibujando a mano
// adentro de una librería de gráficos. Se dibuja a mano afuera.

import Link from 'next/link';
import { useState } from 'react';
import {
  CRITERIO_MAX,
  type Criterio,
  type Dominancia,
  type FilaMatriz,
  type NivelEscala,
} from '@/lib/sgsi/valoracion-agregada';
import {
  ALTO_BARRA,
  ANCHO_TRAZADO,
  RADIO_EXTREMO,
  cabeLaEtiqueta,
  colorDeNivelValor,
  cortesDeEje,
  posicionUmbral,
  segmentos,
} from '@/lib/sgsi/valoracion-figura';
import { urlDeInventario } from '@/lib/sgsi/inventario-filtros';

const ANCHO_ROTULO = 178;
const ANCHO_CUENTA = 62;

export interface PilasProps {
  matriz: FilaMatriz[];
  criterios: Criterio[];
  niveles: NivelEscala[];
  escala: number;
  umbral: number;
  vigentes: number;
  dominancia: Dominancia;
  /// El criterio que la tabla de abajo sigue. El rótulo de cada fila NO navega: selecciona
  /// (§4.6).
  seleccionado: string;
  onSeleccionar: (clave: string) => void;
}

/// El destino de un segmento o de una cuenta: con el máximo seleccionado no viaja `dimension`;
/// con una dimensión, sí.
function destino(clave: string, parametros: Record<string, number>): string {
  return urlDeInventario(clave === CRITERIO_MAX ? parametros : { dimension: clave, ...parametros });
}

export default function PilasValoracion({
  matriz,
  criterios,
  niveles,
  escala,
  umbral,
  vigentes,
  dominancia,
  seleccionado,
  onSeleccionar,
}: PilasProps) {
  const [verMatriz, setVerMatriz] = useState(true);
  const cortes = cortesDeEje(escala);
  const filaMaximo = matriz.find((f) => f.clave === CRITERIO_MAX);
  const porcentaje =
    vigentes === 0 ? 0 : Math.round(((filaMaximo?.desdeUmbral ?? 0) / vigentes) * 100);

  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-5">
      {/* Las cifras protagonistas. La del medio va en tamaño de figura y con cifras
          proporcionales — NO `tabular-nums`, que a ese tamaño deja los dígitos flojos. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="text-13 text-muted">
          <span className="text-17 font-bold text-primary">{vigentes}</span> activos vigentes
        </p>
        <p className="text-13 text-muted">
          {/* La misma sans del resto y cifras PROPORCIONALES: `tabular-nums` a 32 px deja los
              dígitos flojos, y esta cifra no se compara verticalmente con ninguna otra (§4.2). */}
          <span
            className="text-32 font-bold text-brand-nav"
            style={{ lineHeight: 1, fontVariantNumeric: 'proportional-nums' }}
          >
            {filaMaximo?.desdeUmbral ?? 0}
          </span>{' '}
          alcanzan el umbral de {umbral} ({porcentaje} %)
        </p>
        <p className="text-13 text-muted">
          {dominancia.manda !== null ? (
            <>
              <span className="font-semibold text-primary">{dominancia.manda.nombre}</span> es la
              dimensión que más manda
            </>
          ) : dominancia.alcanzanUmbral === 0 ? (
            'Ningún activo alcanza el umbral'
          ) : (
            'Dos dimensiones empatan en la punta: ninguna manda sola'
          )}
        </p>
      </div>

      {/* La línea de las tres cuentas, y su advertencia. Los empates son la norma, no la
          excepción: un activo valorado C=4, I=4 tiene el máximo determinado por C Y por I, así
          que las cifras suman más que el total. Sin la frase, la línea parece un error de
          cálculo; con ella, es un dato (§4.3). No se desempata por orden de catálogo. */}
      {dominancia.alcanzanUmbral > 0 && (
        <div className="mt-3">
          <p className="text-12_5 text-secondary">
            De los {dominancia.alcanzanUmbral} que alcanzan el umbral, lo determina{' '}
            {dominancia.porDimension.map((d, i) => (
              <span key={d.codigo}>
                {i > 0 && ' · '}
                <span className="font-semibold">{d.codigo}</span> en{' '}
                <span className="font-mono tabular-nums">{d.cuenta}</span>
              </span>
            ))}
          </p>
          {dominancia.hayEmpates && (
            <p className="mt-1 text-11_5 text-faint" style={{ maxWidth: '74ch' }}>
              Un activo con empate en el máximo cuenta en cada dimensión empatada, así que las
              cifras suman más que el total.
            </p>
          )}
        </div>
      )}

      {/* El eje, arriba, uno solo y absoluto para las cuatro. Hairlines sólidas, nunca
          punteadas. */}
      <div className="mt-6 flex items-end">
        <div style={{ width: ANCHO_ROTULO, flex: 'none' }} />
        <div className="relative" style={{ width: ANCHO_TRAZADO, flex: 'none', height: 18 }}>
          {cortes.map((c) => (
            <span
              key={c}
              className="absolute bottom-0.5 font-mono text-9_5 tabular-nums text-faint"
              style={{
                left: `${(c / (escala || 1)) * ANCHO_TRAZADO}px`,
                transform: c === 0 ? 'none' : 'translateX(-50%)',
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <span className="ml-3 font-mono text-9_5 text-faint" style={{ flex: 'none' }}>
          activos
        </span>
      </div>
      <div className="flex">
        <div style={{ width: ANCHO_ROTULO, flex: 'none' }} />
        <div
          style={{
            width: ANCHO_TRAZADO,
            flex: 'none',
            height: 1,
            background: 'var(--hf-hairline-strong)',
          }}
        />
      </div>

      <div className="mt-3 flex flex-col">
        {matriz.map((fila, i) => (
          <Pila
            key={fila.clave}
            fila={fila}
            niveles={niveles}
            escala={escala}
            umbral={umbral}
            seleccionado={seleccionado === fila.clave}
            onSeleccionar={() => onSeleccionar(fila.clave)}
            // La fila del máximo va primero y SEPARADA de las otras tres: es el resumen, y las
            // otras tres son su descomposición. Un espacio mayor y una hairline es lo que
            // impide que alguien lea las cuatro como cuatro series independientes (§4.2).
            separada={i === 1}
          />
        ))}
      </div>

      {/* Una sola leyenda de escala para las cuatro, abajo. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-mono text-9_5 text-faint" style={{ width: ANCHO_ROTULO - 12, flex: 'none' }}>
          ┃ UMBRAL {umbral} · A LA DERECHA DE LA MARCA ENTRA AL ANÁLISIS
        </span>
        {niveles.map((n) => (
          <span key={n.valor} className="flex items-center gap-1.5 text-11 text-secondary-soft">
            <span
              aria-hidden
              className="inline-block"
              style={{
                width: 16,
                height: 11,
                borderRadius: 2,
                background: colorDeNivelValor(n.valor),
                flex: 'none',
              }}
            />
            {n.etiqueta}
          </span>
        ))}
      </div>

      <p className="mt-4 text-12 text-muted">
        Elegí una fila para ver la tabla por propietario en esa dimensión.
      </p>

      {/* La matriz en números. El tooltip nunca es el único camino al dato: esta es la vista de
          tabla accesible y la que respalda cada cifra (§4.5). Abierta por defecto. */}
      <div className="mt-5 border-t border-hairline-strong pt-4">
        <button
          onClick={() => setVerMatriz((v) => !v)}
          aria-expanded={verMatriz}
          className="flex items-center gap-2 text-12_5 font-semibold text-brand-nav"
        >
          <span className="font-mono text-10">{verMatriz ? '▾' : '▸'}</span>
          La matriz en números
        </button>
        {verMatriz && (
          <Matriz matriz={matriz} niveles={niveles} umbral={umbral} vigentes={vigentes} />
        )}
      </div>
    </section>
  );
}

function Pila({
  fila,
  niveles,
  escala,
  umbral,
  seleccionado,
  onSeleccionar,
  separada,
}: {
  fila: FilaMatriz;
  niveles: NivelEscala[];
  escala: number;
  umbral: number;
  seleccionado: boolean;
  onSeleccionar: () => void;
  separada: boolean;
}) {
  const partes = segmentos(fila, niveles, escala, umbral);
  const marca = posicionUmbral(fila, niveles, escala, umbral);
  const esMaximo = fila.clave === CRITERIO_MAX;

  return (
    <div
      className="flex items-center"
      style={{
        // 10 px entre las tres dimensiones; 20 px más una hairline entre el máximo y ellas.
        marginTop: separada ? 20 : 10,
        paddingTop: separada ? 20 : 0,
        borderTop: separada ? '1px solid var(--hf-hairline-strong)' : undefined,
      }}
    >
      {/* El rótulo NO navega: selecciona. El seleccionado va en color de marca con un marcador
          a la izquierda; los otros en tinta secundaria (§4.6). */}
      <button
        onClick={onSeleccionar}
        aria-pressed={seleccionado}
        className="flex items-start gap-1.5 pr-3 text-left"
        style={{ width: ANCHO_ROTULO, flex: 'none' }}
      >
        <span
          aria-hidden
          style={{
            width: 3,
            alignSelf: 'stretch',
            minHeight: 16,
            borderRadius: 2,
            background: seleccionado ? 'var(--hf-brand-nav)' : 'transparent',
            flex: 'none',
          }}
        />
        <span className="flex min-w-0 flex-col">
          <span
            className="text-12_5"
            style={{
              fontWeight: seleccionado ? 700 : 500,
              color: seleccionado ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
            }}
          >
            {esMaximo ? 'Valor del activo' : fila.etiqueta}
          </span>
          {esMaximo && (
            <span className="font-mono text-9_5 text-faint">(máximo D·I·C)</span>
          )}
        </span>
      </button>

      <div
        className="relative"
        style={{ width: ANCHO_TRAZADO, flex: 'none', height: ALTO_BARRA }}
      >
        {partes.length === 0 && (
          <span className="absolute top-1.5 left-0 text-11 text-faint">
            Sin ningún activo valorado en esta dimensión
          </span>
        )}
        {partes.map((s) => (
          <Link
            key={s.valor}
            href={destino(fila.clave, { valor: s.valor })}
            title={`${esMaximo ? 'Valor del activo' : fila.etiqueta} · ${s.etiqueta} · ${
              s.cuenta
            } ${s.cuenta === 1 ? 'activo' : 'activos'} · ${Math.round(s.fraccionDeFila * 100)} % de la fila · ${
              s.entraAlAnalisis ? 'entra al análisis' : 'no entra al análisis'
            }`}
            aria-label={`${esMaximo ? 'Valor del activo' : fila.etiqueta}, nivel ${s.etiqueta}: ${
              s.cuenta
            } activos. Abrir el inventario filtrado.`}
            className="absolute top-0 flex items-center justify-center transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hf-brand-nav)]"
            style={{
              left: s.x,
              width: s.ancho,
              height: ALTO_BARRA,
              background: s.color,
              // Esquinas solo en los dos segmentos de los extremos, del lado de afuera. Los
              // interiores van rectos.
              borderTopLeftRadius: s.primero ? RADIO_EXTREMO : 0,
              borderBottomLeftRadius: s.primero ? RADIO_EXTREMO : 0,
              borderTopRightRadius: s.ultimo ? RADIO_EXTREMO : 0,
              borderBottomRightRadius: s.ultimo ? RADIO_EXTREMO : 0,
            }}
          >
            {/* Etiqueta adentro solo si cabe con aire. Si no cabe, va al tooltip y a la matriz:
                un número recortado a media cifra es peor que ninguno. */}
            {cabeLaEtiqueta(s.ancho, s.cuenta) && (
              <span
                className="font-mono text-10_5 tabular-nums"
                style={{ color: s.valor >= 3 ? '#ffffff' : 'var(--hf-text-primary)' }}
              >
                {s.cuenta}
              </span>
            )}
          </Link>
        ))}
        {/* La marca del umbral: 2 px que sobresalen 4 px arriba y abajo de su barra, en tinta de
            texto. Si el umbral pasa a 3, las cuatro marcas se mueven solas. */}
        {marca !== null && (
          <span
            aria-hidden
            className="absolute"
            style={{
              left: marca - 1,
              top: -4,
              width: 2,
              height: ALTO_BARRA + 8,
              background: 'var(--hf-text-primary)',
            }}
          />
        )}
      </div>

      {/* A la derecha de cada barra, su cuenta ≥ umbral, alineada en columna y con
          `tabular-nums`: acá sí, son números que se comparan verticalmente. */}
      <Link
        href={destino(fila.clave, { valorMinimo: umbral })}
        title={`${fila.desdeUmbral} activos con valor ${umbral} o más en ${
          esMaximo ? 'el valor del activo' : fila.etiqueta
        }`}
        className="ml-4 text-right font-mono text-12 tabular-nums text-primary underline decoration-hairline-strong decoration-from-font underline-offset-2"
        style={{ width: ANCHO_CUENTA, flex: 'none' }}
      >
        {fila.desdeUmbral} ≥ {umbral}
      </Link>
    </div>
  );
}

function Matriz({
  matriz,
  niveles,
  umbral,
  vigentes,
}: {
  matriz: FilaMatriz[];
  niveles: NivelEscala[];
  umbral: number;
  vigentes: number;
}) {
  // «Sin valorar» es una columna y no un cero (D-3). Cuesta una columna y evita el error de
  // leer «tenemos 40 activos irrelevantes» cuando lo que hay son 40 que nadie valoró. Cuando
  // ninguna fila tiene, la columna no aporta ancho y se omite.
  const hayPendientes = matriz.some((f) => f.sinValorar > 0);

  return (
    <div className="tabla-ancha mt-3">
      <table className="w-full border-collapse text-12_5">
        <thead>
          <tr className="border-b border-hairline-strong">
            <th className="etiqueta-campo py-1.5 pr-3 text-left">Criterio</th>
            {hayPendientes && (
              <th className="etiqueta-campo px-2 py-1.5 text-right">Sin valorar</th>
            )}
            {niveles.map((n) => (
              <th key={n.valor} className="etiqueta-campo px-2 py-1.5 text-right">
                {n.valor}
              </th>
            ))}
            <th className="etiqueta-campo px-2 py-1.5 text-right">Total</th>
            <th className="etiqueta-campo px-2 py-1.5 text-right">≥ {umbral}</th>
          </tr>
        </thead>
        <tbody>
          {matriz.map((f) => (
            <tr key={f.clave} className="border-b border-hairline-faint">
              <td className="py-1.5 pr-3 text-secondary">
                {f.clave === CRITERIO_MAX ? (
                  <span className="font-semibold text-primary">Valor del activo (máx D·I·C)</span>
                ) : (
                  f.etiqueta
                )}
              </td>
              {hayPendientes && (
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-faint">
                  {f.sinValorar === 0 ? '' : f.sinValorar}
                </td>
              )}
              {niveles.map((n, i) => (
                <td key={n.valor} className="px-2 py-1.5 text-right font-mono tabular-nums text-secondary">
                  {f.porNivel[i] === 0 ? '' : f.porNivel[i]}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-primary">
                {f.total}
              </td>
              <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-primary">
                {f.desdeUmbral}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="parrafo mt-2 text-11 text-faint">
        Cada fila suma {vigentes} activos vigentes: los {niveles.length} niveles más «Sin
        valorar». Los totales pueden diferir entre filas si hay valoración parcial — un activo
        valorado solo en C aporta a la fila de C y a la del máximo, y cae en «Sin valorar» en I y
        en D. La fila del máximo <span className="font-semibold">no es la suma ni el promedio</span>{' '}
        de las otras tres: es el máximo activo por activo.
      </p>
    </div>
  );
}
