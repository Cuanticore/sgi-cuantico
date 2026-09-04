'use client';

// app/sig/estado/Estado.client.tsx
//
// **La banda de salud va arriba de todo y los indicadores se ATENÚAN cuando el motor no
// corrió.** No es un adorno: un porcentaje de cumplimiento bajo porque los periodos nunca
// se abrieron es indistinguible, a simple vista, de uno bajo porque la gente incumple — y
// el segundo acusa a personas por un fallo de infraestructura.
//
// Atenuar en vez de ocultar es deliberado: el número sigue siendo el que hay, y esconderlo
// haría creer que la pantalla está rota.

import Link from 'next/link';
import {
  ETIQUETA_ESTADO_TRABAJO,
  type EstadoTrabajo,
} from '@/lib/sig/trabajos-catalogo';

const COLOR: Record<EstadoTrabajo, { fondo: string; texto: string; borde: string }> = {
  AL_DIA: { fondo: '#e6efe9', texto: '#0b5c44', borde: '#c9e3d8' },
  ATRASADO: { fondo: '#fff3e6', texto: '#8a4407', borde: '#f2b473' },
  FALLIDO: { fondo: '#fdeeeb', texto: '#a52016', borde: '#f2cdc6' },
  NUNCA_CORRIO: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)', borde: 'var(--hf-border-field)' },
};

export interface TrabajoFila {
  trabajo: string;
  descripcion: string;
  cuando: string;
  disponible: boolean;
  inicio: string | null;
  creados: number | null;
  invocadoPor: string | null;
  error: string | null;
  estado: EstadoTrabajo;
}

export default function EstadoClient({
  ahora,
  midiendo,
  culpables,
  trabajos,
  cifras,
  porArea,
  sinAreas,
}: {
  ahora: string;
  midiendo: boolean;
  culpables: string[];
  trabajos: TrabajoFila[];
  cifras: { total: number; abiertas: number; vencidas: number; cumplimiento: number | null };
  porArea: { id: number; nombre: string; total: number; porcentaje: number | null }[];
  sinAreas: boolean;
}) {
  // La atenuación de los indicadores. 0.45 y no 0: el número sigue siendo el que hay, y
  // esconderlo haría creer que la pantalla está rota.
  const opacidad = midiendo ? 1 : 0.45;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-col gap-1">
        <h1 className="titulo-pagina">Estado del sistema</h1>
        <span className="font-mono text-10_5 text-muted">{ahora}</span>
      </div>

      {/* Banda 1 · la pregunta que va primero que cualquier porcentaje. */}
      <section
        className="mt-4 flex flex-wrap items-stretch gap-3 rounded-tarjeta px-4 py-3.5"
        style={
          midiendo
            ? { background: '#f7fbf9', border: '1px solid #c9e3d8' }
            : { background: '#fdeeeb', border: '1px solid #f2cdc6' }
        }
      >
        <span
          className="flex h-[34px] w-[34px] flex-none items-center justify-center self-center rounded-full text-15 font-bold text-white"
          style={{ background: midiendo ? '#0b5c44' : '#a52016' }}
        >
          {midiendo ? '✓' : '!'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 self-center">
          <span
            className="text-13_5 font-semibold"
            style={{ color: midiendo ? '#0b5c44' : '#a52016' }}
          >
            {midiendo ? 'El sistema está midiendo' : 'El sistema NO está midiendo'}
          </span>
          <span
            className="text-11_5 leading-relaxed [text-wrap:pretty]"
            style={{ color: midiendo ? '#0b5c44' : '#a52016' }}
          >
            {midiendo
              ? 'Los trabajos que abren periodos corrieron. Los indicadores de abajo son de fiar.'
              : `${culpables.join(', ')} no está corriendo. Los indicadores de abajo están atenuados a propósito: no son bajos porque la gente incumpla, son bajos porque los periodos no se abrieron. Esto va primero que cualquier porcentaje.`}
          </span>
        </span>
        <span className="flex flex-none flex-wrap gap-2">
          {trabajos
            .filter((t) => t.estado !== 'AL_DIA' || !midiendo)
            .slice(0, 3)
            .map((t) => {
              const c = COLOR[t.estado];
              return (
                <span
                  key={t.trabajo}
                  className="flex min-w-[132px] flex-col gap-1 rounded-campo bg-surface px-3 py-2"
                  style={{ border: `1px solid ${c.borde}` }}
                >
                  <span className="etiqueta-campo">{t.trabajo}</span>
                  <span className="font-mono text-11 font-semibold" style={{ color: c.texto }}>
                    {ETIQUETA_ESTADO_TRABAJO[t.estado]}
                  </span>
                </span>
              );
            })}
        </span>
      </section>

      {/* Banda 2 · los cuatro números, atenuados si el motor no corrió. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ opacity: opacidad }}>
        {[
          {
            etiqueta: 'Asignaciones abiertas',
            valor: String(cifras.abiertas),
            nota: 'pendientes de cerrar',
            color: 'var(--hf-brand-nav)',
          },
          {
            etiqueta: 'Vencidas',
            valor: String(cifras.vencidas),
            nota: 'pasaron su fecha límite y siguen abiertas',
            color: cifras.vencidas > 0 ? '#a52016' : '#0b5c44',
          },
          {
            etiqueta: 'Cumplimiento',
            // Sin asignaciones no hay porcentaje. Mostrar 0 % diría que nadie cumplió.
            valor: cifras.cumplimiento === null ? '—' : `${cifras.cumplimiento} %`,
            nota: cifras.cumplimiento === null ? 'no hay asignaciones que medir' : 'cerradas sobre el total',
            color:
              cifras.cumplimiento === null
                ? 'var(--hf-text-muted)'
                : cifras.cumplimiento >= 80
                  ? '#0b5c44'
                  : cifras.cumplimiento >= 50
                    ? '#b8791a'
                    : '#a52016',
          },
          {
            etiqueta: 'Asignaciones en total',
            valor: String(cifras.total),
            nota: 'histórico completo',
            color: 'var(--hf-text-secondary-soft)',
          },
        ].map((c) => (
          <span
            key={c.etiqueta}
            className="flex flex-col gap-1.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5"
          >
            <span className="etiqueta-campo">{c.etiqueta}</span>
            <span className="font-mono text-26 font-semibold leading-none tabular-nums" style={{ color: c.color }}>
              {c.valor}
            </span>
            <span className="text-10_5 leading-snug text-muted [text-wrap:pretty]">{c.nota}</span>
          </span>
        ))}
      </div>

      {!midiendo && (
        <p className="mt-2 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
          Los cuatro números están atenuados, no ocultos: siguen siendo los que hay. Esconderlos
          haría creer que la pantalla está rota.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3.5 xl:flex-row">
        <section
          className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5"
          style={{ opacity: opacidad }}
        >
          {/* El lienzo dice «por proceso». Se agrupa por ÁREA porque es lo que el dato
              tiene: `Proceso` existe como entidad pero las personas siguen clasificadas por
              área (D16). Rotularlo «proceso» sería nombrar algo que no se está midiendo. */}
          <Rotulo texto="Cumplimiento por área" derecha={`${porArea.length} áreas con tareas`} />
          {porArea.map((p) => (
            <span key={p.id} className="flex items-center gap-3">
              <span className="w-[170px] flex-none truncate text-11 text-secondary">{p.nombre}</span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                <span
                  className="block h-full"
                  style={{
                    width: `${p.porcentaje ?? 0}%`,
                    background:
                      p.porcentaje === null
                        ? 'var(--hf-text-faint)'
                        : p.porcentaje >= 80
                          ? '#0f7a5a'
                          : p.porcentaje >= 50
                            ? '#b8791a'
                            : '#a52016',
                  }}
                />
              </span>
              <span className="w-[74px] flex-none text-right font-mono text-10_5 tabular-nums text-muted">
                {p.porcentaje === null ? '—' : `${p.porcentaje} %`} · {p.total}
              </span>
            </span>
          ))}
          {porArea.length === 0 && (
            <p className="py-6 text-center text-11_5 text-muted [text-wrap:pretty]">
              {sinAreas
                ? 'No hay áreas activas cargadas.'
                : 'Ninguna área tiene asignaciones todavía. Si el motor no corrió, ése es el motivo.'}
            </p>
          )}
        </section>

        <section className="flex w-full flex-none flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5 xl:w-[460px]">
          <Rotulo texto="Trabajos programados" derecha={`${trabajos.length} declarados`} />
          {trabajos.map((t) => {
            const c = COLOR[t.estado];
            return (
              <div
                key={t.trabajo}
                className="flex flex-col gap-1 rounded-campo border border-border-field bg-subtle px-3 py-2.5"
                style={{ borderLeft: `3px solid ${c.texto}` }}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-11 font-semibold text-primary">{t.trabajo}</span>
                  <span
                    className="rounded-[4px] px-1.5 py-0.5 font-mono text-8 font-semibold uppercase"
                    style={{ background: c.fondo, color: c.texto }}
                  >
                    {ETIQUETA_ESTADO_TRABAJO[t.estado]}
                  </span>
                  {!t.disponible && (
                    <span className="rounded-[4px] bg-surface px-1.5 py-0.5 font-mono text-8 uppercase text-faint">
                      sin construir
                    </span>
                  )}
                  <span className="ml-auto font-mono text-9_5 text-muted">{t.cuando}</span>
                </span>
                <span className="font-mono text-9_5 text-muted">
                  {t.inicio === null
                    ? 'nunca se ejecutó'
                    : `${t.inicio} · ${t.creados ?? 0} producidos · ${t.invocadoPor ?? 'sin autor'}`}
                </span>
                {t.error !== null && (
                  <span className="text-10_5 leading-relaxed" style={{ color: '#a52016' }}>
                    {t.error}
                  </span>
                )}
              </div>
            );
          })}
          <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            {/* Un trabajo declarado y nunca corrido es el que nadie nota que falta. */}
            «Nunca corrió» no es «al día»: un trabajo declarado que jamás se ejecutó es
            exactamente el que nadie nota que falta. La programación real vive en el crontab del
            servidor —
            <Link href="/sgsi/verificacion" className="font-medium text-accent underline">
              verificación del motor
            </Link>{' '}
            comprueba lo demás.
          </p>
        </section>
      </div>
    </main>
  );
}

function Rotulo({ texto, derecha }: { texto: string; derecha?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha !== undefined && <span className="flex-none font-mono text-9 text-faint">{derecha}</span>}
    </span>
  );
}
