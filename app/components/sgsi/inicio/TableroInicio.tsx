'use client';

// app/components/sgsi/inicio/TableroInicio.tsx
//
// The dashboard half of handoff v2.1 screen 1. Every element with a figure is a
// navigable button, Power BI style: the row you read is the filter you land on, so the
// number and the list behind it can never disagree.

import Link from 'next/link';
import type { DatosInicio } from './inicio.query';

/// The typographic minus, never a hyphen.
function delta(n: number, decimales = 1): string {
  const r = Number(n.toFixed(decimales));
  if (r === 0) return '0';
  return r > 0 ? `+${r}` : `−${Math.abs(r)}`;
}

function nivelTexto(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `L${r.toString().replace('.', ',')}`;
}

export default function TableroInicio({ datos: d }: { datos: DatosInicio }) {
  const brechaPuntos = d.indiceObjetivo - d.indice;

  return (
    <div className="space-y-6">
      {/* Efficacy zone comes first: the index is the headline indicator, and the two
          theme cards consolidate what used to be eleven separate tiles. */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
        <Hero datos={d} brechaPuntos={brechaPuntos} />

        <FichaTema
          titulo="Alcance y aplicabilidad"
          titular={`${d.total} controles del Anexo A`}
          filas={[
            { etiqueta: 'Aplicables', valor: d.aplicables, filtro: 'todos' },
            { etiqueta: 'No aplicables con justificación', valor: d.noAplicables, filtro: 'noAplican' },
            {
              etiqueta: 'Gestionados en L3 o superior',
              valor: `${d.enL3} · ${d.pctL3.toFixed(1)}%`,
              filtro: 'gestionados',
            },
            { etiqueta: 'Cumplen su objetivo', valor: d.enObjetivo, filtro: 'objetivo' },
          ]}
        />

        <FichaTema
          titulo="Nivel y brecha"
          titular={`${nivelTexto(d.nivelTipico)} nivel típico`}
          filas={[
            {
              etiqueta: 'Nivel medio, solo como referencia',
              valor: nivelTexto(d.nivelMedio),
              filtro: 'todos',
            },
            {
              etiqueta: 'Avance medio desde la línea base',
              valor: delta(d.avanceMedio, 2),
              filtro: 'todos',
            },
            {
              etiqueta: 'Brechas prioritarias en L2 o menos',
              valor: d.brechas,
              filtro: 'brechas',
              alerta: true,
            },
            {
              etiqueta: 'Brecha total hasta el objetivo',
              valor: d.brechaTotal,
              filtro: 'brechas',
              alerta: true,
            },
          ]}
        />
      </div>
    </div>
  );
}

function Hero({ datos: d, brechaPuntos }: { datos: DatosInicio; brechaPuntos: number }) {
  return (
    <section
      className="rounded-modal p-6"
      style={{ background: 'var(--hf-accent-800)' }}
    >
      <p
        className="font-mono text-8_5 uppercase tracking-[0.16em]"
        style={{ color: 'var(--hf-accent-300)' }}
      >
        Índice de madurez · indicador principal
      </p>

      <div className="mt-3 flex items-end gap-3">
        <span className="cifra text-46 text-white">{d.indice.toFixed(1)}%</span>
        <span
          className="mb-1.5 rounded-chip px-2.5 py-0.5 font-mono text-10_5"
          style={{ background: 'var(--hf-accent-300)', color: 'var(--hf-accent-800)' }}
        >
          {delta(d.indice - d.indiceLineaBase)} pts desde la línea base
        </span>
      </div>

      {/* Baseline and target are marked on the same track, so the distance still to
          travel is visible rather than something the reader has to subtract. */}
      <div className="mt-5">
        <div className="relative h-2.5 overflow-hidden rounded-swatch bg-white/15">
          <div
            className="absolute inset-y-0 left-0 rounded-swatch"
            style={{ width: `${d.indiceObjetivo}%`, background: 'rgba(127, 216, 180, 0.35)' }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-swatch"
            style={{ width: `${d.indice}%`, background: 'var(--hf-accent-300)' }}
          />
          <div
            className="absolute inset-y-0 w-px bg-white/70"
            style={{ left: `${d.indiceLineaBase}%` }}
          />
        </div>

        <div className="mt-2 flex justify-between font-mono text-9_5 text-white/60">
          <span>
            línea base · {d.fechaLineaBase} {d.indiceLineaBase.toFixed(1)}%
          </span>
          <span>objetivo {d.indiceObjetivo.toFixed(1)}%</span>
        </div>
      </div>

      <p className="mt-4 text-11_5 leading-relaxed text-white/75">
        Faltan{' '}
        <span className="font-mono font-semibold text-white">
          {brechaPuntos.toFixed(1)} puntos porcentuales
        </span>{' '}
        para alcanzar el objetivo aprobado. El índice es la media de la eficacia de los{' '}
        {d.aplicables} controles aplicables.
      </p>
    </section>
  );
}

interface FilaTema {
  etiqueta: string;
  valor: string | number;
  filtro: string;
  alerta?: boolean;
}

function FichaTema({
  titulo,
  titular,
  filas,
}: {
  titulo: string;
  titular: string;
  filas: FilaTema[];
}) {
  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <p className="etiqueta-campo">{titulo}</p>
      <p className="mt-1.5 text-15 font-semibold text-primary">{titular}</p>

      <div className="mt-3 flex flex-col">
        {filas.map((f) => (
          <Link
            key={f.etiqueta}
            href={`/sgsi/controles?filtro=${f.filtro}`}
            className="flex items-baseline justify-between gap-3 border-t border-hairline py-2 transition-colors hover:bg-accent-50"
          >
            <span className="text-11_5 leading-tight text-secondary">{f.etiqueta}</span>
            <span
              className="cifra shrink-0 text-13"
              style={f.alerta ? { color: 'var(--hf-risk-alto-bg)' } : undefined}
            >
              {f.valor}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/// Fifteen clickable rows, each landing on Controles filtered by that capability.
export function BrechaPorCapacidad({ datos: d }: { datos: DatosInicio }) {
  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <h2 className="etiqueta-campo">Brecha por capacidad operativa</h2>
      <div className="mt-3 flex flex-col">
        {d.capacidades.map((c) => (
          <Link
            key={c.capacidad}
            href={`/sgsi/controles?capacidad=${encodeURIComponent(c.capacidad)}`}
            className="grid items-center gap-3 border-t border-hairline py-2 transition-colors hover:bg-accent-50"
            style={{ gridTemplateColumns: '1fr 58px 46px 90px 52px 46px' }}
          >
            <span className="text-11_5 text-secondary" title={c.capacidad}>
              {c.corto}
            </span>
            <span className="text-right font-mono text-10_5 tabular-nums text-muted">
              {c.enL3}/{c.controles}
            </span>
            <span className="text-right font-mono text-10_5 tabular-nums text-muted">
              {nivelTexto(c.mediana)}
            </span>
            <span className="h-1.5 overflow-hidden rounded-swatch bg-hairline">
              <span
                className="block h-full rounded-swatch bg-accent-500"
                style={{ width: `${c.eficacia}%` }}
              />
            </span>
            <span className="text-right font-mono text-10_5 tabular-nums text-secondary">
              {c.eficacia.toFixed(0)}%
            </span>
            <span
              className="text-right font-mono text-10_5 tabular-nums"
              style={{ color: c.brecha > 0 ? 'var(--hf-risk-alto-bg)' : 'var(--hf-text-faint)' }}
            >
              {c.brecha > 0 ? `+${c.brecha}` : '0'}
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-10 text-faint">
        Controles en L3+, mediana del nivel, eficacia media y brecha en niveles hasta el
        objetivo.
      </p>
    </section>
  );
}

/// Six summary cards with a 3px top border in the accent or the alert colour.
export function TarjetasResumen({ datos: d }: { datos: DatosInicio }) {
  const tarjetas = [
    {
      titulo: 'Activos inventariados',
      valor: d.activos,
      pie: `${d.activosEnAnalisis} superan el umbral`,
      href: '/sgsi/inventario',
      alerta: false,
    },
    {
      titulo: 'Riesgos analizados',
      valor: d.riesgos,
      pie: 'activo × amenaza de su tipo',
      href: '/sgsi/matrices',
      alerta: false,
    },
    {
      titulo: 'Riesgos altos sin tratamiento',
      valor: d.altosSinTratamiento ?? 'sin calcular',
      pie: d.residualCalculable ? 'residual Alto o Crítico' : 'falta el cruce control-amenaza',
      href: '/sgsi/matrices',
      alerta: true,
    },
    {
      titulo: 'Controles que aplican',
      valor: d.aplicables,
      pie: `${d.noAplicables} no aplican, con justificación`,
      href: '/sgsi/controles',
      alerta: false,
    },
    {
      titulo: 'Brechas en L2 o menos',
      valor: d.brechas,
      pie: 'cada una es una acción con dueño',
      href: '/sgsi/controles?filtro=brechas',
      alerta: true,
    },
    {
      titulo: 'Amenazas parametrizadas',
      valor: d.amenazas,
      pie: 'del catálogo MAGERIT',
      href: '/sgsi/amenazas',
      alerta: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {tarjetas.map((t) => (
        <Link
          key={t.titulo}
          href={t.href}
          className="rounded-tarjeta border border-border-default bg-surface px-4 pt-3 pb-3.5 transition-colors hover:bg-accent-50"
          style={{
            borderTopWidth: 3,
            borderTopColor: t.alerta ? 'var(--hf-risk-alto-bg)' : 'var(--hf-accent-500)',
          }}
        >
          <p className="etiqueta-campo">{t.titulo}</p>
          <p className="cifra mt-1.5 text-32 text-primary">{t.valor}</p>
          <p className="mt-1 text-10 leading-tight text-faint">{t.pie}</p>
          <p className="mt-2 font-mono text-9_5 text-accent-700">ver ↗</p>
        </Link>
      ))}
    </div>
  );
}

/// Inherent against residual, four bands. The pale bar is the inherent and the solid one
/// the residual, so the movement between them is the effect of the controls.
export function InherenteResidual({ datos: d }: { datos: DatosInicio }) {
  const maximo = Math.max(...d.bandas.map((b) => b.inherente), 1);

  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <h2 className="etiqueta-campo">Riesgo inherente frente a residual</h2>

      <div className="mt-3 flex flex-col">
        {d.bandas.map((b) => (
          <div key={b.nombre} className="border-t border-hairline py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-11_5 text-secondary">{b.nombre}</span>
              <span className="font-mono text-10_5 tabular-nums text-muted">
                inherente {b.inherente} · residual{' '}
                {b.residual === null ? (
                  <span className="text-faint">sin calcular</span>
                ) : (
                  b.residual
                )}
              </span>
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="h-2 overflow-hidden rounded-swatch bg-hairline">
                <div
                  className="h-full rounded-swatch"
                  style={{
                    width: `${(b.inherente / maximo) * 100}%`,
                    background: 'var(--hf-brand-300)',
                  }}
                />
              </div>
              <div className="h-2 overflow-hidden rounded-swatch bg-hairline">
                {b.residual === null ? null : (
                  <div
                    className="h-full rounded-swatch"
                    style={{
                      width: `${(b.residual / maximo) * 100}%`,
                      background: 'var(--hf-brand-nav)',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-10 leading-relaxed text-faint">
        {d.residualCalculable
          ? 'El residual sube en los niveles bajos porque los controles mueven riesgos hacia abajo, no los eliminan.'
          : 'El residual está sin calcular: ninguna amenaza tiene controles mapeados todavía, así que su eficacia es desconocida y no cero. Mostrar cero dejaría esta comparación idéntica en las dos barras.'}
      </p>
    </section>
  );
}
