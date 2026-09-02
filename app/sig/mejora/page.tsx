// app/sig/mejora/page.tsx
//
// Las cuatro cifras y las cuatro tarjetas del artboard TableroMejora: embudo por
// estado, por tipo, por origen y días hasta el cierre contra el plazo parametrizado.

import { prisma } from '@/lib/db';
import { estadoCalculado } from '@/lib/sig/hallazgos';

export const dynamic = 'force-dynamic';

export default async function TableroMejoraPage() {
  const [hallazgos, plazos] = await Promise.all([
    prisma.hallazgo.findMany({
      include: { analisis: true, acciones: true, verificaciones: true },
    }),
    prisma.plazoPorTipoHallazgo.findMany(),
  ]);

  const hoy = new Date();
  const anio = hoy.getUTCFullYear();

  // El lienzo rotula «del ano» y «cerrados del ano». La pantalla calculaba sobre TODO el
  // historico bajo esos rotulos, asi que el titulo iba a decir el ano y las cifras no iban
  // a ser del ano. El embudo por estado si es de todo lo abierto —un hallazgo de 2025 que
  // sigue abierto pesa hoy— pero la composicion por tipo y los dias hasta el cierre son
  // del ano, porque comparan contra el ano anterior.
  const delAnio = hallazgos.filter((h) => h.fechaDeteccion.getUTCFullYear() === anio);

  const conEstado = hallazgos.map((h) => ({
    ...h,
    estado: estadoCalculado({
      anuladoEn: h.anuladoEn,
      fechaCierre: h.fechaCierre,
      tieneAnalisis: h.analisis !== null,
      accionesAbiertas: h.acciones.filter((a) => a.asignacionId > 0).length,
      verificacionEficaz: h.verificaciones.some((v) => v.resultado === 'EFICAZ'),
      verificacionPendiente: false,
    }),
  }));

  const abiertos = conEstado.filter((h) => !['CERRADO', 'ANULADO'].includes(h.estado));
  const porEstado = ['ABIERTO', 'EN_ANALISIS', 'EN_EJECUCION', 'EN_VERIFICACION'].map((e) => ({
    estado: e,
    n: abiertos.filter((h) => h.estado === e).length,
  }));
  const porTipo = ['NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD'].map((t) => ({
    tipo: t,
    n: delAnio.filter((h) => h.tipo === t).length,
  }));
  const porOrigen = Object.entries(
    hallazgos.reduce<Record<string, number>>((acc, h) => {
      acc[h.origen] = (acc[h.origen] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([origen, n]) => ({ origen, n }));
  const vencidos = abiertos.filter((h) => h.fechaCompromiso && h.fechaCompromiso < hoy);

  const verificadas = hallazgos.filter((h) => h.verificaciones.length > 0);
  const eficaces = verificadas.filter((h) => h.verificaciones.some((v) => v.resultado === 'EFICAZ'));
  const tasaEficacia = verificadas.length === 0 ? 0 : Math.round((eficaces.length / verificadas.length) * 100);
  const reincidentes = hallazgos.filter((h) => h.hallazgoAnteriorId !== null);
  const tasaReincidencia = hallazgos.length === 0 ? 0 : Math.round((reincidentes.length / hallazgos.length) * 100);

  // Los días que de VERDAD se tardó en cerrar, por tipo.
  //
  // La tarjeta mostraba `{p.diasEjecucion} d / plazo {p.diasEjecucion}`: el plazo contra sí
  // mismo. Los dos lados eran el mismo número, así que la comparación siempre parecía
  // perfecta y no medía nada. Comparar el promedio real contra el plazo parametrizado es el
  // punto entero de la tarjeta.
  const MS_DIA = 86_400_000;
  const alDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const cerradosDelAnio = delAnio.filter((h) => h.fechaCierre !== null);
  const cierrePorTipo = new Map<string, number[]>();
  for (const h of cerradosDelAnio) {
    const dias = Math.round((alDia(h.fechaCierre!) - alDia(h.fechaDeteccion)) / MS_DIA);
    cierrePorTipo.set(h.tipo, [...(cierrePorTipo.get(h.tipo) ?? []), dias]);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-col gap-1">
        <h1 className="titulo-pagina">Tablero de mejora</h1>
        <p className="text-12_5 text-muted">
          Año {anio} · {delAnio.length} hallazgo(s) registrado(s)
        </p>
      </div>
      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={abiertos.length} etiqueta={`abiertos · ${delAnio.length} registrados en ${anio}`} color="#12437f" />
        <Cifra cifra={vencidos.length} etiqueta="vencidos con su antigüedad" color="#a52016" />
        <Cifra cifra={tasaEficacia} etiqueta={`${eficaces.length} de ${verificadas.length} verificadas`} color="#0f7a5a" sufijo="%" />
        <Cifra cifra={tasaReincidencia} etiqueta={`${reincidentes.length} con antecesor`} color="#b8791a" sufijo="%" />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-5">
        <Tarjeta titulo="Dónde están los hallazgos abiertos">
          {porEstado.map((p) => (
            <Barra key={p.estado} etiqueta={p.estado.replaceAll('_', ' ')} n={p.n} total={Math.max(abiertos.length, 1)} />
          ))}
          {abiertos.length === 0 && <p className="text-12 text-muted">Sin hallazgos abiertos.</p>}
        </Tarjeta>
        <Tarjeta titulo="Por tipo" nota="del año">
          {porTipo.map((p) => (
            <Barra key={p.tipo} etiqueta={p.tipo.replace('_', ' ').toLowerCase()} n={p.n} total={Math.max(delAnio.length, 1)} />
          ))}
        </Tarjeta>
        <Tarjeta titulo="De dónde salieron" nota="histórico">
          {porOrigen.map((p) => (
            <Barra key={p.origen} etiqueta={p.origen.replaceAll('_', ' ').toLowerCase()} n={p.n} total={Math.max(hallazgos.length, 1)} />
          ))}
        </Tarjeta>
        <Tarjeta titulo="Días hasta el cierre" nota="cerrados del año">
          {plazos.map((p) => {
            const dias = cierrePorTipo.get(p.tipo) ?? [];
            const promedio =
              dias.length === 0 ? null : Math.round(dias.reduce((s, d) => s + d, 0) / dias.length);
            const excedido = promedio !== null && promedio > p.diasEjecucion;
            return (
              <div key={p.tipo} className="flex items-center justify-between gap-3 text-12_5">
                <span className="min-w-0 flex-1 truncate text-muted">
                  {p.tipo.replace('_', ' ').toLowerCase()}
                </span>
                {promedio === null ? (
                  <span
                    className="flex-none font-mono text-11"
                    title={`Ninguno de este tipo se cerró en ${anio}: no hay días que promediar.`}
                    style={{ color: 'var(--hf-text-label)' }}
                  >
                    sin cierres · plazo {p.diasEjecucion} d
                  </span>
                ) : (
                  <span
                    className="flex-none font-mono text-12"
                    title={`${dias.length} cerrado(s) de este tipo en ${anio}`}
                    style={{ color: excedido ? '#a52016' : '#0f7a5a' }}
                  >
                    {promedio} d / plazo {p.diasEjecucion} d
                  </span>
                )}
              </div>
            );
          })}
          {cerradosDelAnio.length === 0 && (
            <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
              Ningún hallazgo se cerró en {anio} todavía, así que no hay días que comparar
              contra el plazo.
            </p>
          )}
        </Tarjeta>
      </section>
    </main>
  );
}

function Cifra({
  cifra,
  etiqueta,
  color,
  sufijo,
}: {
  cifra: number;
  etiqueta: string;
  color: string;
  sufijo?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
        {sufijo ?? ''}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}

function Tarjeta({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  /// El alcance de la cifra, como en el lienzo: «del ano», «cerrados del ano». Decirlo
  /// junto al titulo es lo que evita leer una cifra del ano como si fuera del historico.
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface p-5">
      <h2 className="flex items-baseline gap-2 text-12_5 font-semibold text-primary">
        {titulo}
        {nota && <span className="font-mono text-9_5 font-normal text-label">{nota}</span>}
      </h2>
      {children}
    </section>
  );
}

function Barra({ etiqueta, n, total }: { etiqueta: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 truncate text-12 text-muted">{etiqueta}</span>
      <span
        className="h-[6px] flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--hf-hairline-strong)' }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.round((n / total) * 100)}%`, background: '#12437f' }}
        />
      </span>
      <span className="w-8 text-right font-mono text-11 text-primary">{n}</span>
    </div>
  );
}