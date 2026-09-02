'use client';

// app/estrategico/parametros/Parametros.client.tsx
//
// Las seis pestañas del modelo con su historial conceptual: probabilidad, impacto
// (riesgo y oportunidad), tipos de control, eficacias y niveles. Todo cambio exige
// motivo y queda en bitácora; la pantalla avisa que cambiar una escala recalcula
// sin tocar datos (los registros guardan la referencia, no el número — D4).

import { useState } from 'react';
import Restaurar from './Restaurar.client';
import CongelarLineaBase from './CongelarLineaBase.client';
import {
  EficaciasEditables,
  EscalaEditable,
  Historial,
  NivelesEditables,
  type EntradaHistorial,
} from './TablasEditables.client';

type Pestana = 'probabilidad' | 'impactoRiesgo' | 'impactoOportunidad' | 'tipos' | 'eficacias' | 'niveles';

export default function ParametrosClient({
  probabilidad,
  impactoRiesgo,
  impactoOportunidad,
  factores,
  tipos,
  eficacias,
  niveles,
  lineaBase,
  registros,
  historial,
}: {
  probabilidad: { id: number; valor: number; etiqueta: string; descripcion: string | null; color: string }[];
  impactoRiesgo: { id: number; valor: number; etiqueta: string; pct: number | null; cop: number | null }[];
  impactoOportunidad: { id: number; valor: number; etiqueta: string }[];
  factores: string[];
  tipos: { id: number; nombre: string; reduce: string; descripcion: string | null }[];
  eficacias: { id: number; nombre: string; valor: number }[];
  niveles: { id: number; minimo: number; maximo: number; etiqueta: string; color: string; accionRiesgo: string; accionOportunidad: string }[];
  /// La linea base mas reciente, o null si nunca se congelo.
  lineaBase: string | null;
  /// Cuantos riesgos activos hay de verdad. 66 eran los del Excel de referencia.
  registros: number;
  /// Cada cambio del metodo, desde la bitacora.
  historial: EntradaHistorial[];
}) {
  const [pestana, setPestana] = useState<Pestana>('probabilidad');
  const [aviso, setAviso] = useState<string | null>(null);

  const pestañas: Record<Pestana, string> = {
    probabilidad: 'Probabilidad',
    impactoRiesgo: 'Impacto · riesgo',
    impactoOportunidad: 'Impacto · oportunidad',
    tipos: 'Tipos de control',
    eficacias: 'Eficacia',
    niveles: 'Niveles y tratamiento',
  };

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Parámetros del modelo estratégico</h1>
          <p className="text-12_5 text-muted">
            Cambiar una escala recalcula los {registros} registros al instante: guardan la referencia al nivel, no el número.
          </p>
        </div>
        <div className="flex flex-none items-start gap-2">
          <CongelarLineaBase vigente={lineaBase} />
          <Restaurar />
        </div>
      </div>

      <nav className="mt-5 flex border-b border-border-default">
        {Object.entries(pestañas).map(([key, etiqueta]) => (
          <button
            key={key}
            onClick={() => setPestana(key as Pestana)}
            aria-current={pestana === key ? 'page' : undefined}
            className="px-4 py-2.5 text-12_5"
            style={{
              fontWeight: pestana === key ? 600 : 500,
              color: pestana === key ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              borderBottom: pestana === key ? '2px solid var(--hf-brand-nav)' : '2px solid transparent',
            }}
          >
            {etiqueta}
          </button>
        ))}
      </nav>

      {aviso && (
        <p className="mt-4 rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}>
          {aviso}
        </p>
      )}

      <div className="mt-5 max-w-[820px]">
        {pestana === 'probabilidad' && (
          <>
            <EscalaEditable
              tabla="probabilidad"
              iniciales={probabilidad.map((p) => ({ id: p.id, valor: p.valor, etiqueta: p.etiqueta }))}
              columnaExtra={{
                cabecera: 'Descripción',
                valores: Object.fromEntries(probabilidad.map((p) => [p.id, p.descripcion ?? '—'])),
              }}
            />
            <Historial entradas={historial} tabla="escala_probabilidad" />
          </>
        )}
        {pestana === 'impactoRiesgo' && (
          <>
            <EscalaEditable
              tabla="impactoRiesgo"
              iniciales={impactoRiesgo.map((i) => ({ id: i.id, valor: i.valor, etiqueta: i.etiqueta }))}
              columnaExtra={{
                cabecera: '% patrimonio · referencia',
                valores: Object.fromEntries(
                  impactoRiesgo.map((i) => [
                    i.id,
                    [
                      i.pct !== null ? `${i.pct} %` : null,
                      i.cop !== null ? `$${i.cop.toLocaleString('es-CO')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—',
                  ]),
                ),
              }}
            />
            <p className="mt-2 text-11_5 text-muted">
              La referencia en COP es sólo de referencia: no entra al cálculo.
            </p>
            <Historial entradas={historial} tabla="escala_impacto_riesgo" />
          </>
        )}
        {pestana === 'impactoOportunidad' && (
          <>
            <EscalaEditable
              tabla="impactoOportunidad"
              iniciales={impactoOportunidad.map((i) => ({ id: i.id, valor: i.valor, etiqueta: i.etiqueta }))}
            />
            <Historial entradas={historial} tabla="escala_impacto_oportunidad" />
          </>
        )}
        {pestana === 'tipos' && (
          <>
            <Tabla
              cabeceras={['Tipo', 'Reduce', 'Descripción']}
              filas={tipos.map((t) => [t.nombre, t.reduce.toLowerCase(), t.descripcion ?? '—'])}
            />
            <p className="mt-3 text-11_5 text-muted">
              Es una fila de esta tabla, no una condición en el código: «Reactivo» está
              definido en el manual y la matriz nunca lo usó.
            </p>
          </>
        )}
        {pestana === 'eficacias' && (
          <>
            <EficaciasEditables
              iniciales={eficacias.map((e) => ({ id: e.id, nombre: e.nombre, valor: e.valor }))}
            />
            <p className="mt-2 text-11_5 text-muted">
              Cambiar Fuerte de 80 % a 90 % recalcula los {registros} al instante, sin tocar
              datos: los controles guardan la referencia a la medición, no el número.
            </p>
            <Historial entradas={historial} tabla="eficacia_control" />
          </>
        )}
        {pestana === 'niveles' && (
          <>
            <NivelesEditables
              iniciales={niveles.map((n) => ({
                id: n.id,
                minimo: n.minimo,
                maximo: n.maximo,
                etiqueta: n.etiqueta,
                color: n.color,
                accionRiesgo: n.accionRiesgo,
                accionOportunidad: n.accionOportunidad,
              }))}
            />
            <p className="mt-2 max-w-[92ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
              El manual dice «Impactante» en la tabla de tratamiento; acá se adoptó
              «Inaceptable», la de valoración — conviene corregir el manual.
            </p>
            <Historial entradas={historial} tabla="nivel_riesgo" />
          </>
        )}

        <p className="mt-5 text-11_5 text-muted">
          Factores: {factores.join(' · ')}. Historial: cada cambio con autor, fecha,
          valor anterior y motivo en la bitácora.
        </p>
      </div>
    </main>
  );
}

function Tabla({ cabeceras, filas }: { cabeceras: string[]; filas: string[][] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <table className="w-full text-left text-12_5">
        <thead>
          <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
            {cabeceras.map((c) => (
              <th key={c} className="px-4 py-3 font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} className="border-t border-border-default">
              {fila.map((celda, j) => (
                <td key={j} className="px-4 py-3">
                  {j === fila.length - 1 && /^#/.test(celda) ? (
                    <span className="inline-block h-3 w-6 rounded-sm" style={{ background: celda }} />
                  ) : (
                    <span className={j === 0 ? 'font-mono text-11 text-muted' : 'text-primary'}>{celda}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}