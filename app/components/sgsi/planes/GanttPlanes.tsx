'use client';

// app/components/sgsi/planes/GanttPlanes.tsx
//
// El tablero de los planes: cuatro tarjetas que resumen y una línea de tiempo que muestra
// cómo van.
//
// ── LA PREGUNTA QUE ESTA PANTALLA RESPONDE ──────────────────────────────────────────────
//
// No es «¿cuándo termina cada plan?» —eso ya lo dice la tabla— sino **«¿cuáles no van a
// llegar?»**. Por eso la barra lleva DOS trazos superpuestos: el plazo completo en claro, y el
// avance registrado en color. Cuando el trazo de color se queda corto respecto de la línea de
// hoy, el plan va por detrás, y eso se ve de un vistazo sin leer un solo número.
//
// Las cuentas —cuál está vencido, cuál en riesgo, dónde cae cada barra— están en
// `lib/sgsi/gantt-planes.ts`, puras y probadas. Acá sólo se dibuja.
//
// ── EL ORDEN ES POR URGENCIA ────────────────────────────────────────────────────────────
//
// Vencidos arriba. Un Gantt ordenado por fecha esconde lo vencido en medio de la lista
// justamente cuando es lo único que hay que mirar.

import { useMemo, useState } from 'react';
import {
  armarLinea,
  posicionDeHoy,
  type EstadoLinea,
  type PlanDeLinea,
} from '@/lib/sgsi/gantt-planes';

/// Los colores de cada estado. Literales y no tokens porque son una escala SEMÁNTICA propia
/// de este tablero —urgencia, no riesgo— y reusar la rampa de riesgo haría leer «crítico»
/// donde dice «vencido». Coinciden a propósito en el rojo: un plan vencido es una deuda.
const COLOR: Record<EstadoLinea, { barra: string; fondo: string; texto: string; etiqueta: string }> = {
  VENCIDO: { barra: '#a52016', fondo: '#f7e3e1', texto: '#a52016', etiqueta: 'Vencido' },
  EN_RIESGO: { barra: '#c25a1e', fondo: '#f9ebe0', texto: '#8a3f14', etiqueta: 'En riesgo' },
  EN_PLAZO: { barra: '#2f7d5d', fondo: '#e2efe9', texto: '#1f5a41', etiqueta: 'En plazo' },
  NO_INICIADO: { barra: '#8b97a3', fondo: '#eef1f4', texto: '#5b6875', etiqueta: 'No iniciado' },
  CERRADO: { barra: '#b9c4cd', fondo: '#f2f5f7', texto: '#5b6875', etiqueta: 'Cerrado' },
};

export default function GanttPlanes({ planes }: { planes: PlanDeLinea[] }) {
  // HOY se fija UNA vez por montaje y viaja como argumento. Llamar a `new Date()` dentro del
  // render haría que el servidor y el cliente pintaran la línea de hoy en sitios distintos
  // —el desfase de hidratación clásico— y en un tablero de plazos eso no es cosmético.
  const [hoy] = useState(() => new Date());
  const [filtro, setFiltro] = useState<EstadoLinea | 'TODOS'>('TODOS');

  const linea = useMemo(() => armarLinea(planes, hoy), [planes, hoy]);
  const hoyX = posicionDeHoy(linea, hoy);

  const barras = useMemo(
    () => (filtro === 'TODOS' ? linea.barras : linea.barras.filter((b) => b.estado === filtro)),
    [linea.barras, filtro],
  );

  const r = linea.resumen;
  const cerrados = r.porEstado.find((e) => e.estado === 'CERRADO')?.n ?? 0;

  if (r.total === 0) {
    return (
      <p className="rounded-campo border border-dashed border-border-field p-4 text-12 text-secondary-soft">
        No hay planes registrados todavía. Se crean desde la ficha de un activo, en el riesgo
        que los motiva.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Las tarjetas ──────────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo="Planes activos"
          cifra={r.total}
          pie={`${cerrados} cerrados · ${r.total - cerrados} abiertos`}
        />
        <Tarjeta
          titulo="Avance de lo abierto"
          cifra={`${r.avancePromedioAbiertos} %`}
          // Se dice que excluye a los cerrados. Sin esa línea, la cifra sube cuando se cierra
          // algo y parece que se avanzó, cuando lo que pasó es que se fue del promedio.
          pie={
            r.total - cerrados === 0
              ? 'No queda nada abierto que promediar'
              : 'Promedio de los planes abiertos; los cerrados no cuentan'
          }
        />
        <Tarjeta
          titulo="Van por detrás"
          cifra={r.enRiesgo}
          tono={r.enRiesgo > 0 ? 'EN_RIESGO' : undefined}
          pie="Avance por debajo del plazo consumido, con la fecha aún por delante"
        />
        <Tarjeta
          titulo="Vencidos"
          cifra={r.vencidos}
          tono={r.vencidos > 0 ? 'VENCIDO' : undefined}
          pie="Pasó la fecha objetivo y no están cerrados"
        />
      </div>

      {/* ── El filtro por estado ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Pildora activo={filtro === 'TODOS'} onClick={() => setFiltro('TODOS')}>
          Todos ({linea.barras.length})
        </Pildora>
        {r.porEstado
          .filter((e) => e.n > 0)
          .map((e) => (
            <Pildora
              key={e.estado}
              activo={filtro === e.estado}
              color={COLOR[e.estado].barra}
              onClick={() => setFiltro(filtro === e.estado ? 'TODOS' : e.estado)}
            >
              {COLOR[e.estado].etiqueta} ({e.n})
            </Pildora>
          ))}
        <span className="ml-auto font-mono text-9_5 text-label">
          {linea.desde} → {linea.hasta}
        </span>
      </div>

      {/* ── La línea de tiempo ────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-campo border border-border-field bg-surface">
        <div className="min-w-[760px] p-3">
          {/* Los meses. Van arriba y se repiten abajo no haría falta: la línea de hoy es la
              referencia, y los meses sólo dan escala. */}
          <div className="relative mb-2 h-4" style={{ marginLeft: 260 }}>
            {linea.meses.map((m) => (
              <span
                key={m.etiqueta}
                className="absolute top-0 -translate-x-1/2 font-mono text-9 text-label"
                style={{ left: `${m.posicion * 100}%` }}
              >
                {m.etiqueta}
              </span>
            ))}
          </div>

          <div className="relative">
            {/* HOY, de arriba abajo. Es la referencia contra la que se lee cada barra. */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-px"
              style={{ left: `calc(260px + ${hoyX * 100}% - ${hoyX * 260}px)`, background: '#a52016' }}
              aria-hidden
            />

            <div className="flex flex-col gap-1">
              {barras.map((b) => {
                const c = COLOR[b.estado];
                const avance = Math.min(Math.max(b.plan.avance, 0), 100) / 100;
                return (
                  <div key={b.plan.codigo} className="flex items-center gap-2">
                    <div className="flex-none overflow-hidden" style={{ width: 252 }}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-10 font-semibold text-primary">
                          {b.plan.codigo}
                        </span>
                        <span className="truncate text-10_5 text-secondary-soft" title={b.plan.accion}>
                          {b.plan.accion}
                        </span>
                      </div>
                      <div className="truncate text-9 text-label" title={b.plan.responsable}>
                        {b.plan.control ?? b.plan.tipo.toLowerCase()} · {b.plan.responsable}
                      </div>
                    </div>

                    <div className="relative h-7 flex-1">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded"
                        style={{
                          left: `${b.inicio * 100}%`,
                          width: `${b.ancho * 100}%`,
                          height: 18,
                          background: c.fondo,
                          border: `1px solid ${c.barra}33`,
                        }}
                        title={
                          `${b.plan.codigo} · ${c.etiqueta}\n` +
                          `${b.plan.fechaAprobacion ?? 'sin fecha de inicio'} → ${b.plan.fechaObjetivo}\n` +
                          `avance ${b.plan.avance} %` +
                          (b.desvio === null
                            ? ''
                            : ` · ${b.desvio >= 0 ? '+' : ''}${Math.round(b.desvio)} puntos respecto del plazo consumido`)
                        }
                      >
                        {/* El trazo del avance, dentro del plazo. Es la comparación que da la
                            lectura: si se queda corto de la línea de hoy, va por detrás. */}
                        <div
                          className="h-full rounded-l"
                          style={{
                            width: `${avance * 100}%`,
                            background: c.barra,
                            borderTopRightRadius: avance >= 1 ? 4 : 0,
                            borderBottomRightRadius: avance >= 1 ? 4 : 0,
                          }}
                        />
                        {/* El número va ESCRITO, no sólo codificado en el largo: un ancho no
                            se lee, y en una barra estrecha el color es lo único que quedaría. */}
                        <span
                          className="absolute inset-0 flex items-center px-1.5 font-mono text-9 font-bold tabular-nums"
                          style={{ color: avance > 0.5 ? '#ffffff' : c.texto }}
                        >
                          {b.plan.avance}%
                        </span>
                      </div>
                    </div>

                    <span
                      className="flex-none text-right font-mono text-9_5 tabular-nums"
                      style={{ width: 92, color: c.texto }}
                    >
                      {b.desvio === null
                        ? c.etiqueta.toLowerCase()
                        : `${b.desvio >= 0 ? '+' : ''}${Math.round(b.desvio)} pts`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Los que no se pueden dibujar ──────────────────────────────────────────────── */}
      {linea.sinFecha.length > 0 && (
        <div className="rounded-campo border border-dashed border-warn-border bg-warn-bg p-3">
          <p className="mb-1.5 text-11_5 font-semibold text-warn-text">
            {linea.sinFecha.length}{' '}
            {linea.sinFecha.length === 1 ? 'plan sin fecha objetivo' : 'planes sin fecha objetivo'}
          </p>
          <p className="mb-2 text-10_5 text-secondary-soft">
            No se les puede dibujar una barra y no se les inventa una. Un plan invisible en un
            tablero de seguimiento es un plan que nadie va a reclamar.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {linea.sinFecha.map((p) => (
              <li key={p.codigo} className="text-10_5 text-secondary">
                <span className="font-mono font-semibold">{p.codigo}</span> · {p.accion}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-9_5 text-label">
        La barra clara es el plazo; la de color, el avance registrado. La línea vertical roja es
        hoy. «Pts» es el avance menos el plazo ya consumido: negativo significa ir por detrás.
      </p>
    </div>
  );
}

function Tarjeta({
  titulo,
  cifra,
  pie,
  tono,
}: {
  titulo: string;
  cifra: string | number;
  pie: string;
  tono?: EstadoLinea;
}) {
  const c = tono ? COLOR[tono] : null;
  return (
    <div
      className="rounded-campo border border-border-field p-3"
      style={c ? { background: c.fondo, borderColor: `${c.barra}55` } : undefined}
    >
      <p className="etiqueta-campo text-9">{titulo.toUpperCase()}</p>
      <p
        className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums"
        style={{ color: c?.texto ?? 'var(--hf-text-primary)' }}
      >
        {cifra}
      </p>
      <p className="mt-1.5 text-9_5 leading-snug text-secondary-soft">{pie}</p>
    </div>
  );
}

function Pildora({
  activo,
  color,
  onClick,
  children,
}: {
  activo: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-10_5 font-semibold transition-colors ${
        activo
          ? 'border-accent-500 bg-accent-100 text-accent-700'
          : 'border-border-field bg-surface text-secondary-soft hover:bg-surface-hover'
      }`}
    >
      {color && (
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{ width: 8, height: 8, background: color, flex: 'none' }}
        />
      )}
      {children}
    </button>
  );
}
