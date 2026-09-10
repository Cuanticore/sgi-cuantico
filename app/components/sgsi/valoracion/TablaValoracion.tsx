'use client';

// app/components/sgsi/valoracion/TablaValoracion.tsx
//
// La pieza del REQ-SIG-18 §6, **una sola, llamada dos veces**: agrupador × criterios × niveles.
//
//   Tabla A · propietario (cargo) × un criterio  × 6 niveles
//   Tabla B · custodio (persona)  × cuatro criterios × 6 niveles
//
// Construir dos componentes sería duplicar el tinte, el orden, los totales, la fila «sin
// asignar» y el contrato de clic —cinco cosas que tienen que comportarse igual y que iban a
// divergir en el primer cambio—. La diferencia entre las dos tablas es enteramente de
// argumentos: cuántos criterios, qué agrupador, y si la fila «sin asignar» se dibuja.
//
// **La fila es el propietario, y el propietario es un `CargoResponsable`, no una persona.** El
// encabezado dice «Propietario (cargo)» y no «Responsable» a propósito: la pantalla no debe
// sugerir que ahí hay un nombre de persona. La Tabla B sí lleva nombres, y ahí la fila es quien
// tiene el activo en la mano.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  CRITERIO_MAX,
  SIN_ASIGNAR,
  topesDeTinte,
  type Agrupador,
  type Criterio,
  type FilaAgrupada,
  type NivelEscala,
  type TablaAgrupada,
} from '@/lib/sgsi/valoracion-agregada';
import { tinteDeCelda } from '@/lib/sgsi/valoracion-figura';
import { urlDeInventario } from '@/lib/sgsi/inventario-filtros';

/// 34 px por celda numérica. 24 × 34 = 816, más 220 de nombre y 128 de los dos totales = 1 164,
/// que entra en un viewport de 1 280. Por debajo de eso, scroll horizontal DENTRO de la tarjeta
/// —`.tabla-ancha`—, nunca en el cuerpo de la página (§6.7).
const ANCHO_CELDA = 34;
const ANCHO_NOMBRE = 220;
const ANCHO_TOTAL = 64;

type Orden = { clave: string; direccion: 'asc' | 'desc' };

export interface TablaValoracionProps {
  tabla: TablaAgrupada;
  criterios: Criterio[];
  niveles: NivelEscala[];
  umbral: number;
  agrupador: Agrupador;
  /// «Propietario (cargo)» o «Custodio (persona)».
  encabezadoAgrupador: string;
  /// Lo que la tabla arrastra a cada destino: `{}` con el máximo seleccionado, o
  /// `{ dimension: 'C' }` con una dimensión. En la Tabla B cada grupo pone el suyo.
  arrastreDeCriterio: (clave: string) => Record<string, string | number>;
  /// La Tabla B acota los encabezados de columna con `conPersona=1`, que es lo que hace que el
  /// total de la columna cuadre con lo que la tabla muestra. Sin él, el encabezado llevaría a
  /// todo el inventario y el número no coincidiría (§6.8).
  arrastreDeColumna?: Record<string, string | number>;
}

export default function TablaValoracion({
  tabla,
  criterios,
  niveles,
  umbral,
  agrupador,
  encabezadoAgrupador,
  arrastreDeCriterio,
  arrastreDeColumna = {},
}: TablaValoracionProps) {
  // Orden por defecto: `≥ umbral` descendente, luego `Total` descendente. Ya viene así de
  // `tablaAgrupada`; los encabezados lo pueden cambiar. El orden NO cambia colores: el tinte
  // sigue a la cuenta, nunca al puesto en la lista (§6.5).
  const [orden, setOrden] = useState<Orden | null>(null);
  const hayVariosCriterios = criterios.length > 1;

  const filas = useMemo(() => {
    if (orden === null) return tabla.filas;
    const [criterio, resto] = orden.clave.split('#');
    const valorDe = (f: FilaAgrupada): number => {
      if (resto === 'total') return f.total;
      if (resto === 'umbral') return f.desdeUmbral;
      const i = niveles.findIndex((n) => String(n.valor) === resto);
      return f.porCriterio[criterio!]?.porNivel[i] ?? 0;
    };
    // La fila «sin asignar» se queda al final en cualquier orden: es un caso, no un competidor.
    const reales = tabla.filas.filter((f) => !f.sinAsignar);
    const sueltas = tabla.filas.filter((f) => f.sinAsignar);
    const signo = orden.direccion === 'desc' ? -1 : 1;
    return [
      ...[...reales].sort((a, b) => signo * (valorDe(a) - valorDe(b)) || a.etiqueta.localeCompare(b.etiqueta, 'es')),
      ...sueltas,
    ];
  }, [tabla.filas, orden, niveles]);

  const topes = useMemo(() => topesDeTinte(tabla.filas, criterios), [tabla.filas, criterios]);

  // La guía cruzada del hover: en una parrilla de seis columnas —y más en una de veinticuatro—
  // el ojo pierde de qué nivel es la celda que está mirando (§6.4).
  const [cruz, setCruz] = useState<{ fila: string; columna: string } | null>(null);

  const ordenar = (clave: string) =>
    setOrden((o) =>
      o !== null && o.clave === clave
        ? { clave, direccion: o.direccion === 'desc' ? 'asc' : 'desc' }
        : { clave, direccion: 'desc' },
    );

  const anchoMinimo =
    ANCHO_NOMBRE + criterios.length * niveles.length * ANCHO_CELDA + 2 * ANCHO_TOTAL + 24;

  if (tabla.filas.length === 0) return null;

  return (
    <div className="tabla-ancha">
      <table
        className="border-collapse text-12"
        style={{ minWidth: anchoMinimo, borderSpacing: 0 }}
        onMouseLeave={() => setCruz(null)}
      >
        <thead>
          {/* Encabezado de dos pisos cuando hay varios criterios: el grupo arriba, el nivel
              abajo. Los dos `sticky` (§6.7). */}
          {hayVariosCriterios && (
            <tr>
              <th
                className="sticky left-0 z-20 bg-surface"
                style={{ width: ANCHO_NOMBRE, minWidth: ANCHO_NOMBRE }}
              />
              {criterios.map((c) => (
                <th
                  key={c.clave}
                  colSpan={niveles.length}
                  className="etiqueta-campo bg-surface py-1 text-center"
                  // 4 px de superficie entre grupos, más que el 1 px entre columnas del mismo
                  // grupo: si la separación de afuera no es mayor que la de adentro, los cuatro
                  // bloques se leen como veinticuatro columnas sueltas.
                  style={{ borderLeft: '4px solid var(--hf-bg-surface)' }}
                  title={
                    c.clave === CRITERIO_MAX
                      ? 'Valor final = máximo de las dimensiones del activo. Es lo mismo que «Valor del activo (máx D·I·C)» de la matriz.'
                      : undefined
                  }
                >
                  {c.etiqueta}
                </th>
              ))}
              <th colSpan={2} className="bg-surface" />
            </tr>
          )}
          <tr className="border-b border-hairline-strong">
            <th
              className="sticky left-0 z-20 bg-surface py-1.5 pr-3 text-left"
              style={{ width: ANCHO_NOMBRE, minWidth: ANCHO_NOMBRE }}
            >
              <span className="etiqueta-campo">{encabezadoAgrupador}</span>
            </th>
            {criterios.map((c) =>
              niveles.map((n, i) => (
                <th
                  key={`${c.clave}#${n.valor}`}
                  className="bg-surface py-1.5 text-right"
                  style={{
                    width: ANCHO_CELDA,
                    minWidth: ANCHO_CELDA,
                    paddingRight: 6,
                    borderLeft: i === 0 && hayVariosCriterios ? '4px solid var(--hf-bg-surface)' : undefined,
                  }}
                >
                  {/* El encabezado de una columna de nivel lleva al inventario en ese nivel, sin
                      el agrupador: es la columna entera. */}
                  <Link
                    href={urlDeInventario({
                      ...arrastreDeCriterio(c.clave),
                      valor: n.valor,
                      ...arrastreDeColumna,
                    })}
                    onClick={(e) => e.stopPropagation()}
                    title={`${c.etiqueta} · ${n.etiqueta} — abrir el inventario`}
                    className="font-mono text-10 tabular-nums text-label hover:text-brand-nav"
                  >
                    {n.valor}
                  </Link>
                  <button
                    onClick={() => ordenar(`${c.clave}#${n.valor}`)}
                    aria-label={`Ordenar por ${c.etiqueta} nivel ${n.valor}`}
                    className="ml-0.5 font-mono text-8_5 text-label hover:text-brand-nav"
                  >
                    {orden?.clave === `${c.clave}#${n.valor}` ? (orden.direccion === 'desc' ? '▾' : '▴') : '·'}
                  </button>
                </th>
              )),
            )}
            <th className="bg-surface py-1.5 pr-2 text-right" style={{ width: ANCHO_TOTAL, minWidth: ANCHO_TOTAL }}>
              <button
                onClick={() => ordenar(`${criterios[0]!.clave}#total`)}
                className="etiqueta-campo hover:text-brand-nav"
              >
                Total{orden?.clave === `${criterios[0]!.clave}#total` ? (orden.direccion === 'desc' ? ' ▾' : ' ▴') : ''}
              </button>
            </th>
            <th className="bg-surface py-1.5 pr-2 text-right" style={{ width: ANCHO_TOTAL, minWidth: ANCHO_TOTAL }}>
              <button
                onClick={() => ordenar(`${criterios[0]!.clave}#umbral`)}
                className="etiqueta-campo hover:text-brand-nav"
              >
                ≥ {umbral}
                {orden?.clave === `${criterios[0]!.clave}#umbral` ? (orden.direccion === 'desc' ? ' ▾' : ' ▴') : ''}
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {filas.map((f) => (
            <tr
              key={f.clave}
              className="border-b border-hairline-faint"
              style={{ background: cruz?.fila === f.clave ? 'var(--hf-hairline-faint)' : undefined }}
            >
              {/* Primera columna `sticky` con el nombre. Es la única forma de leer 24 columnas
                  sin perder de quién es la fila. Toda la fila es un objetivo de clic de 24 px de
                  alto mínimo. */}
              <th
                scope="row"
                className="sticky left-0 z-10 py-1.5 pr-3 text-left font-normal"
                style={{
                  background: cruz?.fila === f.clave ? 'var(--hf-bg-subtle)' : 'var(--hf-bg-surface)',
                  minHeight: 24,
                }}
                onMouseEnter={() => setCruz({ fila: f.clave, columna: '' })}
              >
                <Link
                  href={urlDeInventario({
                    ...arrastreDeCriterio(criterios[0]!.clave),
                    [agrupador]: f.clave,
                  })}
                  className="flex min-w-0 flex-col"
                  title={`Abrir el inventario de ${f.etiqueta}`}
                >
                  <span
                    className="truncate text-12_5"
                    style={{
                      fontStyle: f.sinAsignar ? 'italic' : undefined,
                      color: f.sinAsignar || f.inactiva ? 'var(--hf-text-faint)' : 'var(--hf-text-primary)',
                    }}
                  >
                    {f.etiqueta}
                    {f.inactiva && (
                      <span className="ml-1.5 font-mono text-9_5 text-faint">· inactiva</span>
                    )}
                  </span>
                  {f.subtitulo !== null && (
                    <span className="truncate font-mono text-9_5 text-[var(--hf-text-placeholder)]">
                      {f.subtitulo}
                    </span>
                  )}
                </Link>
              </th>

              {criterios.map((c) =>
                niveles.map((n, i) => {
                  const cuenta = f.porCriterio[c.clave]?.porNivel[i] ?? 0;
                  const clave = `${c.clave}#${n.valor}`;
                  const tinte = tinteDeCelda(cuenta, topes[c.clave] ?? 0);
                  return (
                    <td
                      key={clave}
                      className="py-1.5 text-right font-mono tabular-nums"
                      style={{
                        width: ANCHO_CELDA,
                        minWidth: ANCHO_CELDA,
                        paddingRight: 6,
                        borderLeft: i === 0 && hayVariosCriterios ? '4px solid var(--hf-bg-surface)' : undefined,
                        background:
                          cruz?.columna === clave || cruz?.fila === f.clave
                            ? 'var(--hf-hairline-faint)'
                            : (tinte ?? undefined),
                      }}
                      onMouseEnter={() => setCruz({ fila: f.clave, columna: clave })}
                    >
                      {/* Celda en cero: sin tinte y sin `0`. Se deja vacía — una parrilla de seis
                          columnas sembrada de ceros esconde las celdas que sí tienen algo. */}
                      {cuenta === 0 ? (
                        ''
                      ) : (
                        <Link
                          href={urlDeInventario({
                            ...arrastreDeCriterio(c.clave),
                            [agrupador]: f.clave,
                            valor: n.valor,
                          })}
                          title={`${f.etiqueta} · ${c.etiqueta} · ${n.etiqueta} · ${cuenta} ${
                            cuenta === 1 ? 'activo' : 'activos'
                          }`}
                          className="text-secondary hover:text-brand-nav"
                        >
                          {cuenta}
                        </Link>
                      )}
                    </td>
                  );
                }),
              )}

              {/* Total y ≥ umbral NO llevan tinte: son otra magnitud y teñirlas las pondría a
                  competir con la parrilla (§6.3). */}
              <td className="py-1.5 pr-2 text-right font-mono font-semibold tabular-nums text-primary">
                {f.total}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono font-semibold tabular-nums text-primary">
                {f.desdeUmbral === 0 ? (
                  ''
                ) : (
                  <Link
                    href={urlDeInventario({
                      ...arrastreDeCriterio(criterios[0]!.clave),
                      [agrupador]: f.clave,
                      valorMinimo: umbral,
                    })}
                    title={`${f.etiqueta} · ${f.desdeUmbral} activos con valor ${umbral} o más`}
                    className="hover:text-brand-nav"
                  >
                    {f.desdeUmbral}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>

        {/* Fila de totales fija al pie, en negrita. Con el máximo seleccionado, su total general
            es igual al de la fila del máximo de la matriz: mismo dato, dos formas (§6.5). */}
        <tfoot className="sticky bottom-0 z-10">
          <tr style={{ background: 'var(--hf-bg-subtle)' }}>
            <th
              scope="row"
              className="sticky left-0 z-20 py-2 pr-3 text-left text-12_5 font-bold text-primary"
              style={{ background: 'var(--hf-bg-subtle)' }}
            >
              Total
            </th>
            {criterios.map((c) =>
              niveles.map((n, i) => (
                <td
                  key={`t-${c.clave}#${n.valor}`}
                  className="py-2 text-right font-mono font-bold tabular-nums text-primary"
                  style={{
                    paddingRight: 6,
                    borderLeft: i === 0 && hayVariosCriterios ? '4px solid var(--hf-bg-subtle)' : undefined,
                  }}
                >
                  {(tabla.totales.porCriterio[c.clave]?.porNivel[i] ?? 0) === 0
                    ? ''
                    : tabla.totales.porCriterio[c.clave]!.porNivel[i]}
                </td>
              )),
            )}
            <td className="py-2 pr-2 text-right font-mono font-bold tabular-nums text-primary">
              {tabla.totales.total}
            </td>
            <td className="py-2 pr-2 text-right font-mono font-bold tabular-nums text-primary">
              {tabla.totales.desdeUmbral}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* «Sin valorar» aparece en la tabla solo cuando la selección la tiene distinta de cero
          (§6.2). Con todo valorado, la columna sería seis ceros y una columna de ancho. */}
      {criterios.some((c) => (tabla.totales.porCriterio[c.clave]?.sinValorar ?? 0) > 0) && (
        <p className="mt-2 text-11 text-faint">
          {criterios
            .filter((c) => (tabla.totales.porCriterio[c.clave]?.sinValorar ?? 0) > 0)
            .map(
              (c) =>
                `${c.etiqueta}: ${tabla.totales.porCriterio[c.clave]!.sinValorar} sin valorar`,
            )
            .join(' · ')}
          . No cuentan en ningún nivel: sin valorar no es cero.
        </p>
      )}

      {tabla.filas.some((f) => f.clave === SIN_ASIGNAR) && (
        <p className="mt-2 text-11 text-faint" style={{ maxWidth: '74ch' }}>
          La fila <span className="italic">Sin propietario</span> nunca se omite: un activo
          valioso sin dueño es justo lo que esta pantalla debe hacer visible.
        </p>
      )}
    </div>
  );
}
