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
//
// La atenuación se aplica INDICADOR POR INDICADOR, no a la banda entera. Los cuatro cruzan
// módulos y sólo el cumplimiento del mes depende de `generar-asignaciones`: atenuar los
// hallazgos abiertos porque el motor de tareas no corrió diría que ese número no es de
// fiar cuando sí lo es, y sería el mismo error que la regla existe para evitar, al revés.

import Link from 'next/link';
import {
  ETIQUETA_ESTADO_TRABAJO,
  type EstadoTrabajo,
} from '@/lib/sig/trabajos-catalogo';
import type { Anomalia, TotalAnomalias } from '@/lib/sig/anomalias';

const COLOR: Record<EstadoTrabajo, { fondo: string; texto: string; borde: string }> = {
  AL_DIA: { fondo: '#e6efe9', texto: '#0b5c44', borde: '#c9e3d8' },
  ATRASADO: { fondo: '#fff3e6', texto: '#8a4407', borde: '#f2b473' },
  FALLIDO: { fondo: '#fdeeeb', texto: '#a52016', borde: '#f2cdc6' },
  NUNCA_CORRIO: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)', borde: 'var(--hf-border-field)' },
};

/// El tono lo decide el servidor porque es una lectura del dato, no una decisión de estilo;
/// acá sólo se traduce a la paleta. `NEUTRO` es «no se pudo medir», y por eso es gris y no
/// verde: un indicador sin medir no es un indicador en buen estado.
type Tono = 'BIEN' | 'ATENCION' | 'MAL' | 'NEUTRO';

const TONO: Record<Tono, string> = {
  BIEN: '#0b5c44',
  ATENCION: '#b8791a',
  MAL: '#a52016',
  NEUTRO: 'var(--hf-text-muted)',
};

export interface Indicador {
  etiqueta: string;
  /// Ya formateado. «—» cuando no hay nada que medir: un 0 diría que se midió y dio cero.
  valor: string;
  nota: string;
  tono: Tono;
  /// Si su fuente son las asignaciones que abre `generar-asignaciones`. Sólo éstos se
  /// atenúan cuando el motor no corrió.
  dependeDelMotor: boolean;
}

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
  indicadores,
  anomalias,
  totalAnomalias,
  porArea,
  sinAreas,
}: {
  ahora: string;
  midiendo: boolean;
  culpables: string[];
  trabajos: TrabajoFila[];
  indicadores: Indicador[];
  anomalias: Anomalia[];
  totalAnomalias: TotalAnomalias;
  porArea: { id: number; nombre: string; total: number; porcentaje: number | null; vencidas: number }[];
  sinAreas: boolean;
}) {
  // La atenuación. 0.45 y no 0: el número sigue siendo el que hay, y esconderlo haría
  // creer que la pantalla está rota.
  const opacidad = midiendo ? 1 : 0.45;
  const atenuados = midiendo ? 0 : indicadores.filter((i) => i.dependeDelMotor).length;

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
              : `${culpables.join(', ')} no está corriendo. Lo que se mide sobre asignaciones está atenuado a propósito: no es bajo porque la gente incumpla, es bajo porque los periodos no se abrieron. Esto va primero que cualquier porcentaje.`}
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

      {/* Banda 2 · los cuatro números del lienzo: cumplimiento del mes, hallazgos, riesgos
          y programa de auditoría. Cruzan módulos a propósito — ver la cabecera de
          `page.tsx`— y por eso sólo el primero se atenúa cuando el motor no corrió. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicadores.map((c) => (
          <span
            key={c.etiqueta}
            className="flex flex-col gap-1.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5"
            style={{ opacity: c.dependeDelMotor ? opacidad : 1 }}
          >
            <span className="etiqueta-campo">{c.etiqueta}</span>
            <span
              className="font-mono text-26 font-semibold leading-none tabular-nums"
              style={{ color: TONO[c.tono] }}
            >
              {c.valor}
            </span>
            <span className="text-10_5 leading-snug text-muted [text-wrap:pretty]">{c.nota}</span>
          </span>
        ))}
      </div>

      {!midiendo && atenuados > 0 && (
        <p className="mt-2 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
          {atenuados === 1
            ? 'El indicador que se apoya en las asignaciones está atenuado, no oculto: sigue siendo el número que hay. Esconderlo haría creer que la pantalla está rota. Los otros tres no dependen del motor y se leen normalmente.'
            : `Los ${atenuados} indicadores que se apoyan en las asignaciones están atenuados, no ocultos: siguen siendo los números que hay. Esconderlos haría creer que la pantalla está rota.`}
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
              {/* Las vencidas que siguen abiertas. No se descuentan del porcentaje ni
                  desaparecen del conteo: siguen siendo exigibles. */}
              <span
                className="w-[62px] flex-none text-right font-mono text-9_5 tabular-nums"
                style={{
                  color:
                    p.vencidas > 4 ? '#a52016' : p.vencidas > 0 ? '#8a4407' : 'var(--hf-text-faint)',
                }}
              >
                {p.vencidas === 0 ? '—' : `${p.vencidas} venc.`}
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

        {/* Lo que nadie está mirando. Cada fila enlaza a donde se resuelve: un conteo sin
            salida obliga a buscar a mano el módulo que lo produjo. */}
        <section className="flex w-full flex-none flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5 xl:w-[424px]">
          <Rotulo
            texto="Lo que nadie está mirando"
            derecha={
              totalAnomalias.sinMedir === 0
                ? `${totalAnomalias.total} en total`
                : `${totalAnomalias.total} en total · ${totalAnomalias.sinMedir} sin medir`
            }
          />
          <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            Cruces entre módulos que no aparecen en ningún indicador porque no son de nadie.
            Cada uno se calcula solo.
          </p>
          {anomalias.map((a) => {
            // Tres estados y no dos. «Sin medir» no se pinta como cero: un cruce que no se
            // pudo consultar en gris de «todo bien» es el defecto que esta lista existe
            // para no cometer.
            const sinMedir = a.cantidad === null;
            const hay = a.cantidad !== null && a.cantidad > 0;
            return (
              <Link
                key={a.clave}
                href={a.ruta}
                className="flex items-center gap-3 rounded-campo px-3 py-2.5 transition-colors hover:bg-subtle"
                style={{
                  background: hay ? '#fffbfa' : 'var(--hf-bg-subtle)',
                  border: `1px solid ${hay ? '#f2cdc6' : 'var(--hf-border-field)'}`,
                }}
              >
                <span
                  className="w-[26px] flex-none font-mono text-15 font-semibold tabular-nums"
                  style={{
                    color: sinMedir
                      ? 'var(--hf-text-faint)'
                      : hay
                        ? '#a52016'
                        : 'var(--hf-text-muted)',
                  }}
                >
                  {sinMedir ? '—' : String(a.cantidad)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-11_5 leading-snug text-secondary [text-wrap:pretty]">
                    {a.texto}
                  </span>
                  <span className="font-mono text-8_5 uppercase tracking-[0.06em] text-faint">
                    {a.donde}
                  </span>
                  {a.porQueNo !== null && (
                    <span className="text-10_5 leading-snug text-muted [text-wrap:pretty]">
                      No se puede medir: {a.porQueNo}.
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </section>
      </div>

      <section className="mt-3.5 flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
        <Rotulo texto="Trabajos programados" derecha={`${trabajos.length} declarados`} />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
        </div>
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
