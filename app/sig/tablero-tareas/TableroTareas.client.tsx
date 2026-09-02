'use client';

// app/sig/tablero-tareas/TableroTareas.client.tsx
//
// Las seis piezas del lienzo: titular con barra apilada, cumplimiento por área, deuda
// vencida con su antigüedad, capacitación vigente, cierres administrativos y las peores
// obligaciones.
//
// Los colores de estado son los que el lienzo dejó validados y anotados: verde #0f7a5a,
// ámbar #b8791a, rojo #a52016. La nota es explícita sobre por qué NO se usa el naranja de
// la aplicación (#c25a1e): junto al rojo da ΔE 12,8 en visión normal, por debajo del piso
// de 15. No es una preferencia — es la razón por la que dos estados distintos se pueden
// distinguir en esa barra.

import { useRouter } from 'next/navigation';
import type { Alcance } from './page';
import type { FilaDeArea, ObligacionFloja, Segmento, TramoDeAntiguedad } from '@/lib/sig/tablero-tareas';

const VERDE = '#0f7a5a';
const AMBAR = '#b8791a';
const ROJO = '#a52016';
const NARANJA = '#c25a1e';

const COLOR_SEGMENTO: Record<Segmento['etiqueta'], string> = {
  'A tiempo': VERDE,
  Tarde: AMBAR,
  'Sin hacer': ROJO,
};

/// El tramo intermedio de la antigüedad SÍ usa el naranja: acá los tres colores son una
/// escala de gravedad creciente y se leen en orden, no un contraste entre categorías.
const COLOR_TRAMO: Record<TramoDeAntiguedad['etiqueta'], string> = {
  'Menos de 7 d': AMBAR,
  '7 a 30 d': NARANJA,
  'Más de 30 d': ROJO,
};

function colorDelPorciento(p: number | null): string {
  if (p === null) return 'var(--hf-text-muted)';
  if (p >= 90) return '#0b5c44';
  if (p >= 75) return '#8a4407';
  return ROJO;
}

export interface TitularTablero {
  porciento: number | null;
  asignadas: number;
  realizadasATiempo: number;
  segmentos: Segmento[];
  variacion: number | null;
  deudaCantidad: number;
  deudaMasAntiguaDias: number | null;
  antiguedad: TramoDeAntiguedad[];
  cierresAdministrativos: number;
}

export default function TableroTareasClient({
  alcance,
  etiquetaPeriodo,
  titular,
  areas,
  peores,
  capacitacion,
}: {
  alcance: Alcance;
  etiquetaPeriodo: string;
  etiquetaAlcance: string;
  titular: TitularTablero;
  areas: FilaDeArea[];
  peores: ObligacionFloja[];
  capacitacion: { alDia: number; total: number; obligatorias: number };
}) {
  const router = useRouter();
  const pctCapacitacion =
    capacitacion.total === 0 ? null : Math.round((capacitacion.alDia / capacitacion.total) * 100);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Cumplimiento de tareas del SIG</h1>
          <p className="max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            {etiquetaPeriodo} · todas las cifras se calculan al leer, contra las asignaciones
            reales.
          </p>
        </div>
        <nav className="ml-auto flex flex-none items-center gap-2">
          {(['mes', 'trimestre', 'anio'] as const).map((a) => (
            <button
              key={a}
              onClick={() => router.push(`/sig/tablero-tareas?alcance=${a}`)}
              aria-pressed={alcance === a}
              className="rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: alcance === a ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: alcance === a ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: '1px solid var(--hf-border-field)',
                fontWeight: alcance === a ? 600 : 500,
              }}
            >
              {a === 'mes' ? 'Este mes' : a === 'trimestre' ? 'Trimestre' : 'Año'}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[372px_minmax(0,1fr)]">
        {/* ── Titular: un solo número ── */}
        <section className="flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
          <Cabecera>Cumplimiento del periodo</Cabecera>
          {titular.asignadas === 0 ? (
            <p className="text-12_5 text-muted">
              No hay asignaciones exigibles en este periodo. Sin denominador no hay porcentaje
              que mostrar, y un 100 % sobre cero diría que todo se cumplió.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-3.5">
                <span
                  className="font-mono text-[52px] font-semibold leading-[0.9] tabular-nums"
                  style={{ color: colorDelPorciento(titular.porciento) }}
                >
                  {titular.porciento} %
                </span>
                <span className="flex flex-col gap-0.5 pb-1.5">
                  <span className="text-12 text-secondary">
                    {titular.realizadasATiempo} de {titular.asignadas} realizadas a tiempo
                  </span>
                  {titular.variacion !== null && (
                    <span
                      className="text-11_5 font-medium"
                      style={{ color: titular.variacion >= 0 ? '#0b5c44' : '#8a4407' }}
                    >
                      {titular.variacion >= 0 ? '▲' : '▼'} {Math.abs(titular.variacion)} pp
                      contra el periodo anterior
                    </span>
                  )}
                </span>
              </div>
              <BarraApilada
                segmentos={titular.segmentos.map((s) => ({
                  etiqueta: s.etiqueta,
                  n: s.n,
                  porciento: s.porciento,
                  color: COLOR_SEGMENTO[s.etiqueta],
                }))}
                alto={12}
                total={titular.asignadas}
              />
            </>
          )}
        </section>

        {/* ── Por área ── */}
        <section className="row-span-2 flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
          <Cabecera derecha="asignaciones del periodo">Por área</Cabecera>
          {areas.length === 0 ? (
            <p className="text-12_5 text-muted">Ningún área tiene asignaciones en este periodo.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {areas.map((a) => (
                <div key={a.areaId ?? 'sin-area'} className="flex items-center gap-3">
                  <span className="w-[168px] flex-none text-right text-12 text-secondary">
                    {a.nombre}
                  </span>
                  <span className="flex h-3.5 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-subtle">
                    {a.segmentos.map((s) => (
                      <span
                        key={s.etiqueta}
                        title={`${s.etiqueta}: ${s.n} de ${a.total}`}
                        style={{
                          width: `${s.porciento}%`,
                          background: COLOR_SEGMENTO[s.etiqueta],
                          borderRight: '2px solid var(--hf-bg-surface)',
                        }}
                      />
                    ))}
                  </span>
                  <span
                    className="w-11 flex-none text-right font-mono text-12 font-semibold tabular-nums"
                    style={{ color: colorDelPorciento(a.porciento) }}
                  >
                    {a.porciento} %
                  </span>
                  <span className="w-[46px] flex-none text-right font-mono text-10_5 text-muted">
                    {a.total}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            Un área con pocas asignaciones se ve muy bien o muy mal por una sola tarea. La
            columna de la derecha es el total, y está ahí para leer el porcentaje con esa
            cautela.
          </p>
        </section>

        {/* ── Columna izquierda inferior ── */}
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
            <Cabecera color={ROJO}>Deuda vencida</Cabecera>
            <div className="flex items-end gap-4">
              <span className="flex flex-col gap-0.5">
                <span
                  className="font-mono text-[32px] font-semibold leading-none"
                  style={{ color: titular.deudaCantidad === 0 ? '#0b5c44' : ROJO }}
                >
                  {titular.deudaCantidad}
                </span>
                <span className="text-11 text-muted">asignaciones abiertas y vencidas</span>
              </span>
              {titular.deudaMasAntiguaDias !== null && (
                <span className="ml-auto flex flex-col items-end gap-0.5">
                  <span
                    className="font-mono text-xl font-semibold leading-none"
                    style={{ color: ROJO }}
                  >
                    {titular.deudaMasAntiguaDias} d
                  </span>
                  <span className="text-11 text-muted">la más antigua</span>
                </span>
              )}
            </div>
            {titular.antiguedad.length > 0 && (
              <BarraApilada
                segmentos={titular.antiguedad.map((t) => ({
                  etiqueta: t.etiqueta,
                  n: t.n,
                  porciento: t.porciento,
                  color: COLOR_TRAMO[t.etiqueta],
                }))}
                alto={6}
                total={titular.deudaCantidad}
                redondeada
              />
            )}
          </section>

          <section className="flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
            <Cabecera>Capacitación vigente</Cabecera>
            {capacitacion.obligatorias === 0 ? (
              <p className="text-12_5 text-muted">
                No hay obligaciones de tipo capacitación declaradas, así que no hay nada
                vigente que medir.
              </p>
            ) : (
              <div className="flex items-center gap-3.5">
                <span
                  className="font-mono text-[28px] font-semibold leading-none"
                  style={{ color: colorDelPorciento(pctCapacitacion) }}
                >
                  {pctCapacitacion} %
                </span>
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="flex h-2.5 overflow-hidden rounded-[4px] bg-subtle">
                    <span
                      title={`${capacitacion.alDia} personas al día`}
                      className="rounded-l-[4px]"
                      style={{ width: `${pctCapacitacion}%`, background: VERDE }}
                    />
                  </span>
                  <span className="text-11 leading-relaxed text-muted">
                    {capacitacion.alDia} de {capacitacion.total} personas al día con las{' '}
                    {capacitacion.obligatorias} capacitaciones obligatorias
                  </span>
                </span>
              </div>
            )}
          </section>

          <section
            className="flex flex-col gap-2.5 rounded-tarjeta p-5"
            style={{ border: '1px solid #e0b93c', background: '#fdfaf0' }}
          >
            <Cabecera color="#6b5410">Cierres administrativos</Cabecera>
            <div className="flex items-baseline gap-3">
              <span
                className="font-mono text-[26px] font-semibold leading-none"
                style={{ color: '#6b5410' }}
              >
                {titular.cierresAdministrativos}
              </span>
              <span className="text-11_5 leading-relaxed" style={{ color: '#6b5410' }}>
                de {titular.asignadas} · se cuentan aparte del cumplimiento, porque el auditor
                pregunta quién <em>hizo</em> la tarea, no quién la marcó
              </span>
            </div>
          </section>
        </div>

        {/* ── Peores obligaciones ── */}
        <section className="flex flex-col gap-3.5 rounded-tarjeta border border-border-field bg-surface p-5">
          <Cabecera>Obligaciones con peor cumplimiento</Cabecera>
          {peores.length === 0 ? (
            <p className="text-12_5 text-muted">
              Ninguna obligación tiene todavía suficientes asignaciones en este periodo para
              ordenarlas. Con una sola, el resultado sólo puede ser 0 % o 100 %.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {peores.map((p) => (
                <div key={p.obligacionId} className="flex items-center gap-3">
                  <span className="w-[62px] flex-none font-mono text-10_5 font-medium text-accent">
                    {p.codigo}
                  </span>
                  <span className="w-[268px] flex-none truncate text-12 text-secondary">
                    {p.titulo}
                  </span>
                  <span className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-subtle">
                    <span
                      title={`${p.titulo} · ${p.porciento} % sobre ${p.total} asignaciones`}
                      className="rounded-[4px]"
                      style={{ width: `${p.porciento}%`, background: 'var(--hf-brand-nav)' }}
                    />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-12 font-semibold tabular-nums text-accent">
                    {p.porciento} %
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            Un solo tono a propósito: aquí la identidad la lleva el nombre de la obligación, no
            el color. Reservar los colores para el estado es lo que hace que rojo signifique
            algo en esta pantalla.
          </p>
        </section>
      </div>
    </main>
  );
}

function Cabecera({
  children,
  derecha,
  color,
}: {
  children: React.ReactNode;
  derecha?: string;
  color?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="whitespace-nowrap font-mono text-9 font-medium uppercase tracking-[0.07em]"
        style={{ color: color ?? 'var(--hf-brand-nav)' }}
      >
        {children}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha && <span className="font-mono text-9 text-muted">{derecha}</span>}
    </span>
  );
}

/// La barra apilada con su leyenda. El lienzo insiste: «el color nunca va solo». Cada
/// segmento lleva etiqueta y conteo debajo, que es lo que la vuelve legible para quien no
/// distingue el verde del ámbar.
function BarraApilada({
  segmentos,
  alto,
  total,
  redondeada,
}: {
  segmentos: { etiqueta: string; n: number; porciento: number; color: string }[];
  alto: number;
  total: number;
  redondeada?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="flex overflow-hidden bg-subtle"
        style={{ height: alto, borderRadius: redondeada ? 999 : 4 }}
      >
        {segmentos.map((s) => (
          <span
            key={s.etiqueta}
            title={`${s.etiqueta}: ${s.n} de ${total}`}
            style={{
              width: `${s.porciento}%`,
              background: s.color,
              borderRight: '2px solid var(--hf-bg-surface)',
            }}
          />
        ))}
      </span>
      <span className="flex flex-wrap gap-3.5">
        {segmentos.map((s) => (
          <span key={s.etiqueta} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: s.color }}
            />
            <span className="text-11 text-secondary">{s.etiqueta}</span>
            <span className="font-mono text-11 font-semibold text-primary">{s.n}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
