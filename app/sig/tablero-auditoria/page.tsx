// app/sig/tablero-auditoria/page.tsx
//
// El tablero de auditoría: programa cumplido, cobertura de la norma numeral por numeral,
// notas por tipo, hallazgos por proceso y el tiempo del cierre al informe. Todo calculado
// al leer.
//
// La cobertura era un párrafo rojo con la lista de los numerales que faltan. El lienzo pide
// la malla completa —cada numeral marcado «Auditado» o «Sin auditar», agrupado por
// capítulo— y con razón: la lista dice qué falta, la malla dice CUÁNTO falta y dónde se
// concentra. Un capítulo entero sin tocar se ve de un golpe; en una lista de códigos, no.

import { prisma } from '@/lib/db';
import { vencidoEntrega } from '@/lib/sig/auditorias';
import CoberturaNorma from './CoberturaNorma.client';

export const dynamic = 'force-dynamic';

export default async function TableroAuditoriaPage() {
  const anio = new Date().getUTCFullYear();

  const [programas, auditorias, normas, hallazgosAbiertos, porArea] = await Promise.all([
    prisma.programaAuditoria.findMany({
      where: { anio },
      include: { programadas: { include: { auditorias: true } } },
    }),
    prisma.auditoria.findMany({
      include: { celdas: { include: { notas: true } }, programada: true },
    }),
    prisma.normaAuditable.findMany({
      orderBy: { codigo: 'asc' },
      include: {
        requisitos: {
          orderBy: { orden: 'asc' },
          include: { _count: { select: { celdas: true } } },
        },
      },
    }),
    prisma.hallazgo.findMany({
      where: { origen: 'AUDITORIA_INTERNA', fechaCierre: null, anuladoEn: null },
      select: { fechaDeteccion: true, area: { select: { nombre: true } } },
    }),
    // Hallazgos por PROCESO, que es lo que el lienzo pide. Antes la tarjeta decía «por
    // origen» y era una frase con un conteo: útil para saber que existen, inútil para
    // saber dónde se concentran.
    prisma.hallazgo.groupBy({
      by: ['areaId'],
      where: { origen: 'AUDITORIA_INTERNA', anuladoEn: null },
      _count: { _all: true },
    }),
  ]);

  const areas = await prisma.area.findMany({ select: { id: true, nombre: true } });
  const nombreDeArea = new Map(areas.map((a) => [a.id, a.nombre]));

  const programa = programas[0] ?? null;
  const programadas = programa?.programadas ?? [];
  const ejecutadas = programadas.filter((p) =>
    p.auditorias.some((a) => a.cerradaEn || a.emitidoEn),
  ).length;
  const cumplimiento =
    programadas.length === 0 ? null : Math.round((ejecutadas / programadas.length) * 100);

  const notas = auditorias.flatMap((a) => a.celdas.flatMap((c) => c.notas));
  const porTipo = {
    OK: notas.filter((n) => n.tipo === 'OK').length,
    NC: notas.filter((n) => n.tipo === 'NC').length,
    OM: notas.filter((n) => n.tipo === 'OM').length,
    RM: notas.filter((n) => n.tipo === 'RM').length,
    FORTALEZA: notas.filter((n) => n.tipo === 'FORTALEZA').length,
  };

  const hoy = new Date();
  const vencidas = auditorias.filter((a) => {
    if (!a.fechaFin || a.emitidoEn) return false;
    const plazo = a.programada?.plazoInformeDias ?? 4;
    return vencidoEntrega(a.fechaFin, plazo, hoy);
  });

  // «Del cierre al informe»: los días que de verdad se tardó, medidos sobre las auditorías
  // que ya emitieron. El plazo del programa dice cuánto se permite; esto dice cuánto se
  // tardó, y son dos cosas distintas — una auditoría puede estar dentro del plazo y aun así
  // haber tardado el triple que las demás.
  const MS_DIA = 86_400_000;
  const alDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const entregas = auditorias
    .filter((a) => a.fechaFin !== null && a.emitidoEn !== null)
    .map((a) => Math.round((alDia(a.emitidoEn!) - alDia(a.fechaFin!)) / MS_DIA));
  const promedioEntrega =
    entregas.length === 0
      ? null
      : Math.round(entregas.reduce((s, d) => s + d, 0) / entregas.length);
  const peorEntrega = entregas.length === 0 ? null : Math.max(...entregas);

  // Abiertos de años ANTERIORES, que es lo que la tarjeta dice. Antes contaba todos los
  // abiertos sin filtrar el año: la etiqueta afirmaba algo que el número no medía.
  const deAniosAnteriores = hallazgosAbiertos.filter(
    (h) => h.fechaDeteccion.getUTCFullYear() < anio,
  ).length;

  const hallazgosPorProceso = porArea
    .map((g) => ({
      proceso: g.areaId === null ? 'Sin proceso' : (nombreDeArea.get(g.areaId) ?? 'Sin proceso'),
      n: g._count._all,
    }))
    .sort((a, b) => b.n - a.n);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="titulo-pagina">Tablero de auditoría</h1>
          <p className="text-12_5 text-muted">
            Todo se calcula al leer, contra las auditorías y sus notas.
          </p>
        </div>
        <span
          className="ml-auto flex-none rounded-campo border border-border-field bg-surface px-3.5 py-2 font-mono text-12_5 font-semibold text-primary"
        >
          {anio}
        </span>
      </div>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra
          cifra={cumplimiento ?? '—'}
          etiqueta={
            programadas.length === 0
              ? `sin programa para ${anio}`
              : `programa cumplido · ${ejecutadas} de ${programadas.length}`
          }
          color="#0b5c44"
          sufijo={cumplimiento === null ? '' : '%'}
        />
        <Cifra cifra={porTipo.NC} etiqueta="no conformidades registradas" color="#a52016" />
        <Cifra
          cifra={hallazgosAbiertos.length}
          etiqueta={
            deAniosAnteriores === 0
              ? 'hallazgos de auditoría abiertos'
              : `abiertos · ${deAniosAnteriores} de años anteriores`
          }
          color="#8a4407"
        />
        <Cifra
          cifra={vencidas.length}
          etiqueta="informes vencidos contra el plazo"
          color={vencidas.length === 0 ? '#0b5c44' : '#a52016'}
        />
      </section>

      <section className="mt-6 flex flex-col gap-5">
        <CoberturaNorma
          normas={normas.map((n) => ({
            id: n.id,
            codigo: n.codigo,
            nombre: n.nombre,
            requisitos: n.requisitos
              .filter((r) => r.auditable)
              .map((r) => ({
                id: r.id,
                numeral: r.numeral,
                titulo: r.titulo,
                auditado: r._count.celdas > 0,
              })),
          }))}
        />

        <div className="grid grid-cols-3 gap-5">
          <div className="rounded-tarjeta border border-border-field bg-surface p-5">
            <h2 className="text-12_5 font-semibold text-primary">Notas por tipo</h2>
            <div className="mt-3 flex flex-col gap-1.5">
              {Object.entries(porTipo).map(([tipo, n]) => (
                <div key={tipo} className="flex items-center gap-3">
                  <span className="w-[76px] font-mono text-11 text-muted">{tipo}</span>
                  <span
                    className="h-[6px] flex-1 overflow-hidden rounded-full"
                    style={{ background: 'var(--hf-hairline-strong)' }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (n / Math.max(notas.length, 1)) * 100)}%`,
                        background:
                          tipo === 'NC'
                            ? '#a52016'
                            : tipo === 'OM'
                              ? '#b8791a'
                              : tipo === 'OK'
                                ? '#0f7a5a'
                                : '#8a4407',
                      }}
                    />
                  </span>
                  <span className="w-6 text-right font-mono text-11 text-primary">{n}</span>
                </div>
              ))}
            </div>
            {notas.length === 0 && (
              <p className="mt-3 text-11_5 text-muted">
                Sin notas de auditor todavía: las notas se registran en la ficha de cada
                auditoría.
              </p>
            )}
          </div>

          <div className="rounded-tarjeta border border-border-field bg-surface p-5">
            <h2 className="text-12_5 font-semibold text-primary">Hallazgos por proceso</h2>
            <div className="mt-3 flex flex-col gap-1.5">
              {hallazgosPorProceso.map((p) => (
                <div key={p.proceso} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-11_5 text-secondary-soft">
                    {p.proceso}
                  </span>
                  <span
                    className="h-[6px] w-16 flex-none overflow-hidden rounded-full"
                    style={{ background: 'var(--hf-hairline-strong)' }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (p.n / Math.max(hallazgosPorProceso[0]?.n ?? 1, 1)) * 100)}%`,
                        background: '#a52016',
                      }}
                    />
                  </span>
                  <span className="w-6 text-right font-mono text-11 text-primary">{p.n}</span>
                </div>
              ))}
              {hallazgosPorProceso.length === 0 && (
                <p className="text-11_5 text-muted">
                  Ninguna auditoría interna generó hallazgos todavía.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-tarjeta border border-border-field bg-surface p-5">
            <h2 className="text-12_5 font-semibold text-primary">Entrega del informe</h2>
            {promedioEntrega === null ? (
              <p className="mt-3 text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
                Ninguna auditoría cerró y emitió su informe todavía, así que no hay días que
                medir.
              </p>
            ) : (
              <>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-22 font-semibold" style={{ color: '#8a4407' }}>
                    {promedioEntrega} d
                  </span>
                  <span className="text-11_5 text-muted">del cierre al informe</span>
                </div>
                <p className="mt-2 text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
                  Promedio de {entregas.length} auditoría(s) emitida(s)
                  {peorEntrega !== null && peorEntrega !== promedioEntrega
                    ? `; la más lenta tardó ${peorEntrega} d`
                    : ''}
                  . El plazo del programa dice cuánto se permite; esto dice cuánto se tardó.
                </p>
              </>
            )}
            {vencidas.length > 0 && (
              <p
                className="mt-3 rounded-campo px-3 py-2 text-11_5 [text-wrap:pretty]"
                style={{ background: '#fdeeeb', color: '#a52016' }}
              >
                {vencidas.length} auditoría(s) con el informe vencido contra el plazo del
                programa (C7).
              </p>
            )}
          </div>
        </div>
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
  cifra: number | string;
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
      <span className="text-12 leading-snug text-muted [text-wrap:pretty]">{etiqueta}</span>
    </div>
  );
}
