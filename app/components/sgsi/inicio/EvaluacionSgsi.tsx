'use client';

// app/components/sgsi/inicio/EvaluacionSgsi.tsx
//
// Handoff v2.1 screen 1, second half: everything from the INF-SIG-04 separator down. It
// is the report for the management review, rendered as a screen — so the rule it obeys
// most strictly is that it never shows a figure nobody calculated.
//
// `Riesgo.riesgoResidual` is NULL on every row today because no control-threat relevance
// is assigned, so efficacy is unknown, not zero. Every residual slot here reads "sin
// calcular": never 0, never a bare dash. A residual distribution identical to the
// inherent one would be arithmetically consistent with a zero and completely wrong as a
// report, and that is the single most likely way to get this screen wrong.
//
// Deltas use the typographic minus U+2212 and turn green when the change is an
// improvement, which is not always "up": one fewer priority gap is progress.
//
// The component owns no horizontal padding. It is composed into the Inicio page inside
// that page's own gutters, and adding a second set here would double them.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  DimensionAnalisis,
  EvaluacionSgsiDatos,
  FilaComparativa,
  RiesgoPendiente,
  SegmentoAnalisis,
  ValorComparativo,
} from './evaluacion.query';

export type EvaluacionSgsiProps = EvaluacionSgsiDatos;

/// The dimension chips, in the handoff's order. Declared here rather than imported from
/// the query module: that module opens with `import 'server-only'`, so pulling a runtime
/// value out of it would drag the whole server module into the client bundle and fail the
/// build. Types erase at compile time; constants do not. `satisfies` keeps the two lists
/// from drifting apart.
const DIMENSIONES = ['Proceso', 'Responsable', 'Tipo', 'Subtipo'] as const satisfies readonly DimensionAnalisis[];

/// What the report has to contain, and who says so. Static citations: they are the
/// requirement, not data, so they live with the view rather than crossing the wire.
const CITAS = [
  {
    fuente: 'MAGERIT v3.0 · Libro I, cap. 4',
    texto:
      'El informe presenta el modelo de valor (activos y su valoración), el mapa de riesgos con impacto y riesgo potencial y residual, la evaluación de salvaguardas y el estado de riesgo, con las decisiones de tratamiento explícitas.',
  },
  {
    fuente: 'MAGERIT v3.0 · Libro II',
    texto:
      'Las salvaguardas se evalúan por su madurez en la escala CMM de L0 a L5, y la eficacia derivada es la que modifica la frecuencia de la amenaza, nunca el impacto.',
  },
  {
    fuente: 'ISO/IEC 27001:2022 · 6.1.2 y 6.1.3',
    texto:
      'Debe conservarse información documentada del proceso de apreciación y del plan de tratamiento del riesgo, incluida la aceptación de los riesgos residuales por sus propietarios.',
  },
  {
    fuente: 'ISO/IEC 27001:2022 · 9.1 y 9.3',
    texto:
      'La revisión por la dirección exige presentar el desempeño y la eficacia del SGSI con datos comparables entre periodos: tendencias, no una foto aislada.',
  },
  {
    fuente: 'ISO/IEC 27005',
    texto:
      'Recomienda documentar los criterios de aceptación y las desviaciones metodológicas, para que el resultado sea reproducible y auditable.',
  },
] as const;

/// Severity ramp, most severe first. Indexed by the band's position in `umbral_riesgo`
/// rather than by its name, so renaming a band does not silently turn it grey.
const RAMPA = [
  { bg: 'var(--hf-risk-critico-bg)', fg: 'var(--hf-risk-critico-fg)' },
  { bg: 'var(--hf-risk-alto-bg)', fg: 'var(--hf-risk-alto-fg)' },
  { bg: 'var(--hf-risk-medio-bg)', fg: 'var(--hf-risk-medio-fg)' },
  { bg: 'var(--hf-risk-bajo-bg)', fg: 'var(--hf-risk-bajo-fg)' },
];

function colorBanda(indice: number) {
  return RAMPA[Math.min(Math.max(indice, 0), RAMPA.length - 1)];
}

/// Thousands with a point, decimals with a comma, negatives with U+2212. Written out
/// rather than delegated to toLocaleString: the same markup has to come out of the server
/// and out of the browser, and two ICU builds do not always agree.
function num(n: number): string {
  const redondeado = Math.round(n * 100) / 100;
  const [entero, decimales] = Math.abs(redondeado).toString().split('.');
  const cuerpo = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${redondeado < 0 ? '−' : ''}${cuerpo}${decimales ? `,${decimales}` : ''}`;
}

function conUnidad(valor: number, unidad: FilaComparativa['unidad']): string {
  if (unidad === 'porcentaje') return `${num(valor)} %`;
  if (unidad === 'nivel') return `L${num(valor)}`;
  return num(valor);
}

/// The three states of a comparative figure, spelled out. "sin calcular" is a residual
/// nobody has computed; "sin periodo" is a period that was never recorded. Neither is a
/// zero, and neither is a dash.
function textoValor(v: ValorComparativo, unidad: FilaComparativa['unidad']): string {
  if (v.estado === 'dato') return conUnidad(v.valor, unidad);
  return v.estado === 'sinCalcular' ? 'sin calcular' : 'sin periodo';
}

interface Delta {
  texto: string;
  color: string;
}

/// The delta exists only when both ends are real figures. Percentages vary in percentage
/// POINTS, not percent: "+8,4 pp" and "+8,4 %" are different claims.
function calcularDelta(fila: FilaComparativa): Delta | null {
  if (fila.anterior.estado !== 'dato' || fila.actual.estado !== 'dato') return null;

  const diferencia = Math.round((fila.actual.valor - fila.anterior.valor) * 100) / 100;
  const sufijo = fila.unidad === 'porcentaje' ? ' pp' : '';

  if (diferencia === 0) {
    return { texto: `0${sufijo}`, color: 'var(--hf-text-faint)' };
  }

  const signo = diferencia > 0 ? '+' : '−';
  const mejora =
    fila.mejoraCuando === 'ninguna'
      ? null
      : fila.mejoraCuando === 'sube'
        ? diferencia > 0
        : diferencia < 0;

  return {
    texto: `${signo}${num(Math.abs(diferencia))}${sufijo}`,
    color:
      mejora === null
        ? 'var(--hf-text-faint)'
        : mejora
          ? 'var(--hf-accent-700)'
          : 'var(--hf-danger-text)',
  };
}

export default function EvaluacionSgsi({
  codigoInforme,
  lineaBaseVigente,
  periodoAnterior,
  periodos,
  anteriorEsCalificacionInicial,
  metricas,
  resumen,
  progreso,
  brechas,
  brechasTotal,
  pendientes,
  pendientesTotal,
  pendientesBase,
  conclusiones,
  bandas,
  analisis,
  totalInventario,
  entidades,
  activosInventariados,
  activosEnAnalisis,
  riesgosVigentes,
  riesgosConResidual,
  riesgosSinDecision,
}: EvaluacionSgsiProps) {
  const [dimA, setDimA] = useState<DimensionAnalisis>('Proceso');
  const [selA, setSelA] = useState<string | null>(null);
  const [verPeriodos, setVerPeriodos] = useState(false);

  const segmentos = analisis[dimA];

  // Twelve rows at most, but the bars are scaled against the whole dimension so the
  // visible rows keep their true proportion instead of being renormalised by the cut.
  const visibles = useMemo(() => segmentos.slice(0, 12), [segmentos]);
  const maxActivos = useMemo(
    () => Math.max(1, ...segmentos.map((s) => s.activos)),
    [segmentos],
  );
  const maxRiesgos = useMemo(
    () => Math.max(1, ...segmentos.map((s) => s.riesgos)),
    [segmentos],
  );

  const segmento: SegmentoAnalisis =
    (selA !== null ? segmentos.find((s) => s.clave === selA) : undefined) ?? totalInventario;

  const identificacion = [
    codigoInforme,
    lineaBaseVigente === null
      ? 'SIN LÍNEA BASE REGISTRADA'
      : `LÍNEA BASE ${lineaBaseVigente.toUpperCase()}`,
    `COMPARATIVO CONTRA ${periodoAnterior.toUpperCase()}`,
  ].join(' · ');

  return (
    <section className="flex flex-col gap-5 border-t border-border-default pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-10 tracking-[0.07em] text-label">{identificacion}</span>
          <h2 className="text-19 font-bold tracking-[-0.02em] text-primary">Evaluación del SGSI</h2>
          <p className="parrafo text-muted">
            Madurez de los controles, avance frente a la calificación de partida y pendientes
            de tratamiento. De aquí sale el informe para la revisión por la dirección.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setVerPeriodos((v) => !v)}
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-primary hover:bg-accent-50"
          >
            Comparar otros periodos
          </button>
          <button
            onClick={() =>
              descargarInforme({
                codigoInforme,
                lineaBaseVigente,
                periodoAnterior,
                resumen,
                brechas,
                pendientes,
                pendientesBase,
                conclusiones,
                activosInventariados,
                activosEnAnalisis,
                riesgosVigentes,
              })
            }
            className="rounded-campo bg-accent-500 px-3.5 py-2 text-12_5 font-semibold text-white hover:bg-accent-700"
          >
            Generar informe en Word editable
          </button>
        </div>
      </header>

      {verPeriodos && (
        <div className="rounded-tarjeta border border-border-default bg-subtle p-4">
          <p className="etiqueta-campo">Periodos registrados</p>
          {periodos.length === 0 ? (
            <p className="parrafo mt-2 text-12 text-muted">
              No hay ninguna línea base registrada en el sistema, de modo que no existe un
              periodo anterior contra el que comparar. El comparativo de esta pantalla se
              traza contra la calificación inicial que cada control tiene guardada, que es la
              única medición previa que sí existe. En cuanto se registre el primer corte, esta
              lista lo mostrará y el informe comparará periodo contra periodo.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {periodos.map((p) => (
                <li key={p.nombre} className="flex items-baseline gap-3 text-12">
                  <span className="font-mono font-semibold text-secondary">{p.nombre}</span>
                  <span className="font-mono text-11 text-faint">{p.fecha}</span>
                  {p.nombre === lineaBaseVigente && (
                    <span className="rounded-badge bg-accent-100 px-2 py-0.5 font-mono text-9_5 text-accent-700">
                      vigente
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {periodos.length === 1 && (
            <p className="parrafo mt-2 text-11_5 text-muted">
              Con una sola línea base registrada, el comparativo se traza contra la
              calificación inicial guardada en cada control — la misma del GAP del 2 de
              marzo de 2026.
            </p>
          )}
        </div>
      )}

      {/* Two-column grid with a real minimum, per the handoff's layout rule: fixed
          fractions here collapse the comparative table below its own columns. */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}
      >
        <Tarjeta titulo="Resumen ejecutivo comparativo" className="min-w-0">
          <div className="tabla-ancha">
            <div style={{ minWidth: 470 }}>
              <div
                className="grid"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 104px 104px 96px' }}
              >
                <Encabezado>Indicador</Encabezado>
                <Encabezado derecha>{periodoAnterior}</Encabezado>
                <Encabezado derecha>Actual · agosto de 2026</Encabezado>
                <Encabezado derecha>Variación</Encabezado>

                {resumen.map((fila) => {
                  const delta = calcularDelta(fila);
                  const esDato = fila.actual.estado === 'dato';
                  return (
                    <div key={fila.etiqueta} className="contents">
                      <span className="border-t border-hairline py-2 pr-3 text-12_5 text-secondary">
                        {fila.etiqueta}
                        {fila.nota && (
                          <span className="block text-10_5 leading-tight text-faint">
                            {fila.nota}
                          </span>
                        )}
                      </span>
                      <span className="border-t border-hairline py-2 text-right font-mono text-11 text-faint">
                        {textoValor(fila.anterior, fila.unidad)}
                      </span>
                      <span
                        className={`border-t border-hairline py-2 text-right font-mono ${
                          esDato ? 'text-12_5 font-semibold text-primary' : 'text-10_5 text-faint'
                        }`}
                      >
                        {textoValor(fila.actual, fila.unidad)}
                      </span>
                      <span
                        className="border-t border-hairline py-2 text-right font-mono text-11 font-semibold"
                        style={{ color: delta?.color ?? 'var(--hf-text-faint)' }}
                      >
                        {delta?.texto ?? 'sin dato'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="text-10_5 leading-relaxed text-faint">
            {anteriorEsCalificacionInicial
              ? 'La columna anterior es la línea base: el GAP Análisis ISO/IEC 27001:2022 · CUANTICO · 2 de marzo de 2026, guardado en cada control. A.7.13 quedó sin evaluar en el GAP y no entra en los promedios.'
              : 'Las variaciones en puntos porcentuales se marcan «pp»; el resto son conteos o niveles.'}
          </p>
        </Tarjeta>

        <div className="flex min-w-0 flex-col gap-5">
          <Tarjeta titulo="Progreso por periodo">
            <div className="tabla-ancha">
              <div style={{ minWidth: 470 }}>
                <div
                  className="grid items-center gap-x-2 gap-y-2.5"
                  style={{ gridTemplateColumns: '112px minmax(0, 1fr) 40px 78px 84px' }}
                >
                  <Encabezado>Periodo</Encabezado>
                  <Encabezado>Madurez</Encabezado>
                  <Encabezado derecha>L3+</Encabezado>
                  <Encabezado derecha>Altos</Encabezado>
                  <Encabezado derecha>Sin trat.</Encabezado>

                  {progreso.map((p) => (
                    <div key={p.periodo} className="contents">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-12 font-semibold text-secondary">
                          {p.periodo}
                        </span>
                        <span className="truncate text-10 text-faint" title={p.etiqueta}>
                          {p.etiqueta}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-swatch bg-hairline">
                          <span
                            className="block h-full rounded-swatch bg-accent-500"
                            style={{ width: `${Math.min(100, p.indice)}%` }}
                          />
                        </span>
                        <span className="w-11 text-right font-mono text-12 font-semibold tabular-nums text-secondary">
                          {num(Math.round(p.indice * 10) / 10)}%
                        </span>
                      </span>
                      <span className="text-right font-mono text-11_5 tabular-nums text-secondary">
                        {p.enL3}
                      </span>
                      <SinDato valor={p.altos} conocido={p.riesgosConocidos} />
                      <SinDato
                        valor={p.sinTratamiento}
                        conocido={p.riesgosConocidos}
                        alerta
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-10_5 leading-relaxed text-faint">
              «Altos» y «sin trat.» son cifras residuales: hoy no se pueden calcular porque
              ninguna amenaza tiene la relevancia de sus controles asignada, así que la
              eficacia es desconocida y no cero. En el periodo inicial ni siquiera se midieron
              — «sin dato» y «sin calcular» son ausencias distintas y se escriben distinto.
            </p>
          </Tarjeta>

          <Tarjeta
            titulo="Brechas prioritarias · L2 o menos"
            pie={`${brechas.length} de ${brechasTotal} · ordenadas por brecha hasta el objetivo`}
            className="flex-1"
          >
            {brechas.length === 0 ? (
              <p className="text-12 text-muted">
                Ningún control aplicable está en L2 o menos.
              </p>
            ) : (
              <div className="flex flex-col">
                {brechas.map((b) => (
                  <Link
                    key={b.codigo}
                    href="/sgsi/controles"
                    title={`${b.codigo} · ${b.nombre} · ${b.capacidad}`}
                    className="grid items-center gap-2 border-b border-hairline-faint px-1 py-1.5 hover:bg-accent-50"
                    style={{ gridTemplateColumns: '62px minmax(0, 1fr) 76px 44px' }}
                  >
                    <span className="font-mono text-11 font-semibold text-accent-500">
                      {b.codigo}
                    </span>
                    <span className="truncate text-11_5 text-secondary">{b.nombre}</span>
                    <span className="text-right font-mono text-11 text-muted">
                      {b.objetivo === null
                        ? `L${b.actual} · sin objetivo`
                        : `L${b.actual} → L${b.objetivo}`}
                    </span>
                    <span
                      className="text-right font-mono text-11_5 font-semibold"
                      style={{ color: 'var(--hf-risk-alto-bg)' }}
                    >
                      {b.brecha > 0 ? `+${b.brecha}` : '0'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Tarjeta>
        </div>
      </div>

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}
      >
        <Tarjeta
          titulo="Riesgos altos y críticos sin tratamiento"
          pie={
            pendientesBase === 'residual'
              ? `${pendientes.length} de ${pendientesTotal} con residual Alto o Crítico y sin decisión registrada`
              : `${pendientes.length} de ${pendientesTotal} candidatos · el conjunto definitivo está contenido en este`
          }
          className="min-w-0"
        >
          {pendientesBase === 'inherente' && (
            <p className="rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11 leading-relaxed text-warn-text">
              La lista que pide el informe es la de riesgos con residual Alto o Crítico sin
              decisión de tratamiento, y el residual no está calculado en ninguno de los{' '}
              {num(riesgosVigentes)} riesgos vigentes. Se listan los <strong>inherentes</strong>{' '}
              Alto o Crítico sin decisión: como la eficacia está entre 0 y 1, el residual nunca
              supera al inherente, así que este conjunto contiene al definitivo.
            </p>
          )}

          {pendientes.length === 0 ? (
            <p className="text-12 text-muted">
              No hay riesgos Alto o Crítico sin decisión de tratamiento registrada.
            </p>
          ) : (
            <div className="flex flex-col">
              {pendientes.map((p) => (
                <FilaPendiente key={p.codigo} pendiente={p} bandas={bandas} />
              ))}
            </div>
          )}

          <p className="text-10_5 leading-relaxed text-faint">
            {riesgosConResidual === 0
              ? `Residual sin calcular en los ${num(riesgosVigentes)} riesgos vigentes. `
              : `${num(riesgosConResidual)} de ${num(riesgosVigentes)} riesgos tienen residual calculado. `}
            {num(riesgosSinDecision)} riesgos no tienen decisión de tratamiento registrada en
            ninguna banda. Conforme al criterio de aceptación, ningún riesgo Alto o Crítico
            puede permanecer sin decisión aprobada por el Comité del SIG.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Qué debe contener el informe" className="min-w-0">
          <div className="flex flex-col gap-2.5">
            {CITAS.map((c) => (
              <div
                key={c.fuente}
                className="flex flex-col gap-0.5 border-l-2 pl-3"
                style={{ borderColor: 'var(--hf-accent-100)' }}
              >
                <span className="font-mono text-9_5 tracking-[0.04em] text-accent-500">
                  {c.fuente}
                </span>
                <span className="text-12 leading-relaxed text-secondary">{c.texto}</span>
              </div>
            ))}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta
        titulo="Conclusiones que se incluirán en el informe"
        pie="Editables en el documento generado."
      >
        <div className="flex flex-col gap-2.5">
          {conclusiones.map((c, i) => (
            <p key={i} className="text-12_5 leading-relaxed text-secondary" style={{ textWrap: 'pretty' }}>
              {c}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
          <button
            onClick={() =>
              descargarInforme({
                codigoInforme,
                lineaBaseVigente,
                periodoAnterior,
                resumen,
                brechas,
                pendientes,
                pendientesBase,
                conclusiones,
                activosInventariados,
                activosEnAnalisis,
                riesgosVigentes,
              })
            }
            className="rounded-campo bg-accent-500 px-3.5 py-2 text-12_5 font-semibold text-white hover:bg-accent-700"
          >
            Generar informe en Word editable
          </button>
          <span className="text-11_5 text-muted">
            Descarga un .doc construido en el navegador con el alcance, las tablas
            comparativas, las brechas, los pendientes y el cuadro de aprobación, listo para
            editar y firmar.
          </span>
        </div>
      </Tarjeta>

      {/* Fixed 1fr 1fr: the two cards of the descriptive analysis are one instrument — the
          left one filters the right one — and they have to stay side by side. */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Tarjeta className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-14 font-bold text-primary">
                Activos y riesgos por {dimA.toLowerCase()}
              </h3>
              <p className="text-11_5 text-muted">
                Barra clara: activos inventariados. Barra sólida: riesgos generados.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {DIMENSIONES.map((d) => {
                const activa = d === dimA;
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setDimA(d);
                      // The selection belongs to the old dimension's keys; carrying it
                      // across would filter the right card by a segment that no longer
                      // exists in the chart.
                      setSelA(null);
                    }}
                    className="rounded-chip border px-3 py-1 text-11_5 font-semibold transition-colors"
                    style={
                      activa
                        ? {
                            borderColor: 'var(--hf-brand-nav)',
                            background: 'var(--hf-brand-nav)',
                            color: '#ffffff',
                          }
                        : {
                            borderColor: 'var(--hf-brand-border)',
                            background: 'var(--hf-bg-surface)',
                            color: 'var(--hf-text-secondary-soft)',
                          }
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="grid gap-x-2.5"
            style={{ gridTemplateColumns: '152px minmax(0, 1fr) 44px 44px' }}
          >
            <Encabezado>{dimA}</Encabezado>
            <Encabezado />
            <Encabezado derecha>Act.</Encabezado>
            <Encabezado derecha>Riesg.</Encabezado>
          </div>

          <div className="flex flex-col gap-0.5">
            {visibles.map((s) => {
              const seleccionada = selA === s.clave;
              // Red only when the segment really holds residual Alto or Crítico. With the
              // residual unknown it stays blue: colouring on an unknown would invent a
              // finding, and the counts are written out beside the bar anyway.
              const conAltos = s.altosResiduales !== null && s.altosResiduales > 0;
              const colorRiesgos = conAltos
                ? 'var(--hf-risk-alto-bg)'
                : 'var(--hf-brand-nav)';

              return (
                <button
                  key={s.clave}
                  onClick={() => setSelA(seleccionada ? null : s.clave)}
                  title={`${s.clave} · ${num(s.activos)} activos · ${num(s.riesgos)} riesgos`}
                  className="grid items-center gap-2.5 rounded-campo px-1.5 py-1.5 text-left hover:bg-accent-50"
                  style={{
                    gridTemplateColumns: '152px minmax(0, 1fr) 44px 44px',
                    background: seleccionada ? 'var(--hf-brand-100-soft)' : 'transparent',
                  }}
                >
                  <span
                    className="truncate text-11_5"
                    style={{
                      color: 'var(--hf-text-secondary-soft)',
                      fontWeight: seleccionada ? 700 : 500,
                    }}
                  >
                    {s.clave}
                  </span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="h-[7px] overflow-hidden rounded-swatch bg-hairline">
                      <span
                        className="block h-full rounded-swatch"
                        style={{
                          width: `${(s.activos / maxActivos) * 100}%`,
                          background: 'var(--hf-brand-300)',
                        }}
                      />
                    </span>
                    <span className="h-[7px] overflow-hidden rounded-swatch bg-hairline">
                      <span
                        className="block h-full rounded-swatch"
                        style={{
                          width: `${(s.riesgos / maxRiesgos) * 100}%`,
                          background: colorRiesgos,
                        }}
                      />
                    </span>
                  </span>
                  <span className="text-right font-mono text-11_5 tabular-nums text-muted">
                    {num(s.activos)}
                  </span>
                  <span
                    className="text-right font-mono text-12 font-semibold tabular-nums"
                    style={{ color: colorRiesgos }}
                  >
                    {num(s.riesgos)}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-10_5 leading-relaxed text-faint">
            {segmentos.length > visibles.length
              ? `Mostrando los 12 segmentos con más riesgos de ${segmentos.length}. `
              : ''}
            Pulsa una fila para filtrar el panel de la derecha; vuelve a pulsarla para quitar
            el filtro. La barra de riesgos se marca en naranja sólo cuando el segmento tiene
            residuales Alto o Crítico confirmados.
          </p>
        </Tarjeta>

        <Tarjeta className="min-w-0">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-14 font-bold text-primary" style={{ textWrap: 'pretty' }}>
              {selA === null ? 'Riesgo de todo el inventario' : `Riesgo del segmento · ${selA}`}
            </h3>
            <p className="text-11_5 text-muted">
              {selA === null
                ? `Pulsa una barra para filtrar este panel por ${dimA.toLowerCase()}.`
                : `${dimA} seleccionado — vuelve a pulsarlo para quitar el filtro.`}
            </p>
          </div>

          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <Contador
              etiqueta="Activos"
              valor={num(segmento.activos)}
              nota={`de ${num(activosInventariados)} en el inventario`}
            />
            <Contador
              etiqueta="Riesgos"
              valor={num(segmento.riesgos)}
              nota={`${num(activosEnAnalisis)} activos superan el umbral`}
            />
            <Contador
              etiqueta="Altos+"
              valor={segmento.altosResiduales === null ? null : num(segmento.altosResiduales)}
              nota={`${num(segmento.altosInherentes)} inherentes`}
              color="var(--hf-risk-alto-bg)"
            />
            <Contador
              etiqueta="Valor medio"
              valor={segmento.valorMedio === null ? null : num(segmento.valorMedio)}
              nota="máx(D, I, C) del activo"
            />
          </div>

          <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
            {bandas.map((banda, i) => {
              const color = colorBanda(i);
              const inherente = segmento.inherentePorBanda[i] ?? 0;
              const residual = segmento.residualPorBanda[i] ?? 0;
              const base = segmento.riesgos === 0 ? 1 : segmento.riesgos;

              return (
                <div
                  key={banda}
                  className="grid items-center gap-2.5"
                  style={{ gridTemplateColumns: '84px minmax(0, 1fr) 84px' }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-swatch"
                      style={{ background: color.bg }}
                    />
                    <span className="text-12 font-medium text-secondary">{banda}</span>
                  </span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="h-[7px] overflow-hidden rounded-swatch bg-hairline">
                      <span
                        className="block h-full rounded-swatch"
                        style={{
                          width: `${(inherente / base) * 100}%`,
                          background: color.bg,
                          opacity: 0.45,
                        }}
                      />
                    </span>
                    {/* No solid bar at all when the residual is unknown. A zero-width bar
                        reads as "none in this band", which is a different claim. */}
                    {segmento.conResidual > 0 && (
                      <span className="h-[7px] overflow-hidden rounded-swatch bg-hairline">
                        <span
                          className="block h-full rounded-swatch"
                          style={{ width: `${(residual / base) * 100}%`, background: color.bg }}
                        />
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-mono text-10_5 text-faint">
                      {num(inherente)} inh.
                    </span>
                    {segmento.conResidual > 0 ? (
                      <span className="font-mono text-12 font-semibold text-secondary">
                        {num(residual)} res.
                      </span>
                    ) : (
                      <span className="font-mono text-9_5 text-faint">sin calcular</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {selA !== null && (
              <button
                onClick={() => setSelA(null)}
                className="rounded-campo border bg-surface px-3 py-1.5 text-12 font-semibold hover:bg-accent-50"
                style={{ borderColor: 'var(--hf-brand-border)', color: 'var(--hf-brand-nav)' }}
              >
                Quitar el filtro
              </button>
            )}
            <Link
              href="/sgsi/inventario"
              className="rounded-campo border px-3 py-1.5 text-12 font-semibold hover:bg-accent-50"
              style={{
                borderColor: 'var(--hf-brand-border)',
                background: 'var(--hf-brand-100-soft)',
                color: 'var(--hf-brand-nav)',
              }}
            >
              Ver el inventario →
            </Link>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Entidades del sistema">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {entidades.map((e) => (
            <Link
              key={e.etiqueta}
              href={e.href}
              className="flex flex-col gap-1 border-l-2 py-1 pl-3 pr-2 hover:bg-accent-50"
              style={{ borderColor: 'var(--hf-accent-100)', borderRadius: '0 6px 6px 0' }}
            >
              <span className="cifra text-20 text-primary">{num(e.n)}</span>
              <span className="text-12 font-medium text-secondary" style={{ textWrap: 'pretty' }}>
                {e.etiqueta}
              </span>
              <span className="text-11 text-faint" style={{ textWrap: 'pretty' }}>
                {e.nota}
              </span>
            </Link>
          ))}
        </div>
      </Tarjeta>

      <p className="text-11 text-faint">
        Índice de madurez {num(Math.round(metricas.indice * 10) / 10)} % sobre{' '}
        {metricas.aplicables} controles aplicables. Nada de esta pantalla está almacenado
        como conteo, banda ni matriz: todo se clasifica en cada carga contra
        <span className="font-mono"> umbral_riesgo</span>, de modo que un cambio de escala
        mueve el informe sin desplegar código.
      </p>
    </section>
  );
}

// ============================================================================
// Pieces
// ============================================================================

function Tarjeta({
  titulo,
  pie,
  className,
  children,
}: {
  titulo?: string;
  pie?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-tarjeta border border-border-default bg-surface px-5 py-4.5 ${
        className ?? ''
      }`}
    >
      {titulo && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-14 font-bold text-primary">{titulo}</h3>
          {pie && <span className="text-11_5 text-faint">{pie}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function Encabezado({
  children,
  derecha,
}: {
  children?: React.ReactNode;
  derecha?: boolean;
}) {
  return (
    <span className={`etiqueta-campo pb-1.5 ${derecha ? 'text-right' : ''}`}>{children}</span>
  );
}

/// A residual that was measured but cannot be computed says "sin calcular"; a period that
/// was never measured says "sin dato". Neither is ever 0 and neither is ever a dash.
function SinDato({
  valor,
  conocido,
  alerta,
}: {
  valor: number | null;
  conocido: boolean;
  alerta?: boolean;
}) {
  if (valor === null) {
    return (
      <span className="text-right font-mono text-9_5 leading-tight text-faint">
        {conocido ? 'sin calcular' : 'sin dato'}
      </span>
    );
  }
  return (
    <span
      className="text-right font-mono text-11_5 font-semibold tabular-nums"
      style={{ color: alerta ? 'var(--hf-risk-alto-bg)' : 'var(--hf-text-secondary)' }}
    >
      {num(valor)}
    </span>
  );
}

function Contador({
  etiqueta,
  valor,
  nota,
  color,
}: {
  etiqueta: string;
  valor: string | null;
  nota: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      {valor === null ? (
        <span className="font-mono text-12 text-faint">sin calcular</span>
      ) : (
        <span className="cifra text-19" style={{ color: color ?? 'var(--hf-text-primary)' }}>
          {valor}
        </span>
      )}
      <span className="text-10 leading-tight text-faint">{nota}</span>
    </div>
  );
}

/// Rows link to the inventory, not to the asset sheet: the asset sheet — screen 3 of the
/// handoff, the one that opens on the threat with the risk expanded — does not exist yet.
/// When it does, this href becomes `/sgsi/inventario/{codigo}?amenaza={codigo}` and the
/// rest of the row stays as it is.
function FilaPendiente({
  pendiente,
  bandas,
}: {
  pendiente: RiesgoPendiente;
  bandas: string[];
}) {
  const indice = bandas.indexOf(pendiente.bandaInherente);
  const color = colorBanda(indice < 0 ? RAMPA.length - 1 : indice);

  return (
    <Link
      href="/sgsi/inventario"
      title={`${pendiente.codigo} · ${pendiente.activoNombre} · ${pendiente.amenazaNombre}`}
      className="grid items-center gap-2.5 border-b border-hairline-faint px-1 py-1.5 hover:bg-accent-50"
      style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr) 84px 78px' }}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-12 font-medium text-primary">
          <span className="font-mono text-11 text-secondary">{pendiente.activoCodigo}</span>{' '}
          {pendiente.activoNombre}
        </span>
        <span className="truncate text-11 text-faint">
          {pendiente.amenazaCodigo} {pendiente.amenazaNombre}
        </span>
      </span>
      <span className="truncate text-11 text-muted">
        {pendiente.responsable ?? 'sin responsable asignado'}
      </span>
      <span className="flex items-center justify-end gap-1.5">
        <span
          className="rounded-badge px-1.5 py-0.5 font-mono text-9_5"
          style={{ background: color.bg, color: color.fg }}
        >
          {pendiente.bandaInherente}
        </span>
        <span className="font-mono text-11 font-semibold tabular-nums text-secondary">
          {num(pendiente.inherente)}
        </span>
      </span>
      <span className="text-right font-mono text-9_5 text-faint">
        {pendiente.residual === null ? 'residual sin calcular' : num(pendiente.residual)}
      </span>
    </Link>
  );
}

// ============================================================================
// Word export
// ============================================================================

interface DatosInforme {
  codigoInforme: string;
  lineaBaseVigente: string | null;
  periodoAnterior: string;
  resumen: FilaComparativa[];
  brechas: EvaluacionSgsiProps['brechas'];
  pendientes: RiesgoPendiente[];
  pendientesBase: 'residual' | 'inherente';
  conclusiones: string[];
  activosInventariados: number;
  activosEnAnalisis: number;
  riesgosVigentes: number;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/// Word opens an HTML document with a .doc extension and keeps it fully editable, which
/// is exactly what the handoff asks for: the Committee edits and signs the file, it does
/// not read a PDF. Built in the browser from the props already on screen, so the document
/// cannot disagree with the screen it came from.
function descargarInforme(d: DatosInforme): void {
  const fila = (celdas: string[], etiqueta: 'td' | 'th' = 'td') =>
    `<tr>${celdas.map((c) => `<${etiqueta}>${escapar(c)}</${etiqueta}>`).join('')}</tr>`;

  const cuerpo = [
    `<h1>Evaluación del Sistema de Gestión de Seguridad de la Información</h1>`,
    `<p><b>${escapar(d.codigoInforme)}</b> · ${escapar(
      d.lineaBaseVigente ?? 'sin línea base registrada',
    )} · comparativo contra ${escapar(d.periodoAnterior)}</p>`,
    `<p>Cuántico S.A.S. · MAGERIT v3.0 sobre ISO/IEC 27001:2022 · elaborado por el Líder del SIG</p>`,

    `<h2>1. Alcance</h2>`,
    `<p>El análisis cubre ${num(d.activosInventariados)} activos inventariados, de los cuales ` +
      `${num(d.activosEnAnalisis)} superan el umbral de valoración y generan ` +
      `${num(d.riesgosVigentes)} riesgos. El riesgo se calcula como impacto por frecuencia ` +
      `esperada; la eficacia de los controles preventivos reduce la frecuencia y no el ` +
      `impacto, por lo que no se reporta impacto residual. La valoración usa una escala 0 a 5 ` +
      `y tres dimensiones (Disponibilidad, Integridad, Confidencialidad): ambas desviaciones ` +
      `respecto de MAGERIT están declaradas y aprobadas por el Comité del SIG.</p>`,

    `<h2>2. Resumen ejecutivo comparativo</h2>`,
    `<table border="1" cellspacing="0" cellpadding="4">`,
    fila(['Indicador', d.periodoAnterior, 'Actual', 'Variación'], 'th'),
    ...d.resumen.map((r) =>
      fila([
        r.etiqueta,
        textoValor(r.anterior, r.unidad),
        textoValor(r.actual, r.unidad),
        calcularDelta(r)?.texto ?? 'sin dato',
      ]),
    ),
    `</table>`,

    `<h2>3. Brechas prioritarias en L2 o menos</h2>`,
    `<table border="1" cellspacing="0" cellpadding="4">`,
    fila(['Control', 'Nombre', 'Capacidad', 'Actual', 'Objetivo', 'Brecha'], 'th'),
    ...d.brechas.map((b) =>
      fila([
        b.codigo,
        b.nombre,
        b.capacidad,
        `L${b.actual}`,
        b.objetivo === null ? 'sin objetivo' : `L${b.objetivo}`,
        `+${b.brecha}`,
      ]),
    ),
    `</table>`,

    `<h2>4. Riesgos altos y críticos sin tratamiento</h2>`,
    d.pendientesBase === 'inherente'
      ? `<p>El riesgo residual no está calculado en ningún riesgo vigente, de modo que esta ` +
        `sección lista los riesgos <b>inherentes</b> Alto o Crítico sin decisión de ` +
        `tratamiento registrada. Como la eficacia de los controles está entre 0 y 1, el ` +
        `residual nunca supera al inherente y el conjunto definitivo está contenido en este.</p>`
      : '',
    `<table border="1" cellspacing="0" cellpadding="4">`,
    fila(['Activo', 'Amenaza', 'Inherente', 'Residual', 'Responsable'], 'th'),
    ...d.pendientes.map((p) =>
      fila([
        `${p.activoCodigo} · ${p.activoNombre}`,
        `${p.amenazaCodigo} ${p.amenazaNombre}`,
        `${num(p.inherente)} (${p.bandaInherente})`,
        p.residual === null ? 'sin calcular' : num(p.residual),
        p.responsable ?? 'sin responsable asignado',
      ]),
    ),
    `</table>`,

    `<h2>5. Conclusiones y plan</h2>`,
    ...d.conclusiones.map((c) => `<p>${escapar(c)}</p>`),

    `<h2>6. Aprobación</h2>`,
    `<table border="1" cellspacing="0" cellpadding="4">`,
    fila(['Rol', 'Actuación', 'Nombre', 'Fecha'], 'th'),
    fila(['Líder del SIG', 'Elabora', '', '']),
    fila(['Chief Technology Officer', 'Revisa', '', '']),
    fila(['Comité del SIG', 'Aprueba', '', '']),
    `</table>`,
  ].join('');

  const documento =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">` +
    `<title>${escapar(d.codigoInforme)}</title></head><body>${cuerpo}</body></html>`;

  const enlace = document.createElement('a');
  const url = URL.createObjectURL(new Blob([documento], { type: 'application/msword' }));
  enlace.href = url;
  enlace.download = `${d.codigoInforme} Evaluacion SGSI.doc`;
  enlace.click();
  URL.revokeObjectURL(url);
}
