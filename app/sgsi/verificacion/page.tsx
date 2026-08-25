// app/sgsi/page.tsx
//
// Engine verification page. Deliberately undesigned: it exists to prove the arithmetic
// and the data before any pixel is invested in the real screens, so that when something
// looks wrong later it is clear whether the maths or the design is at fault.
//
// The designed screens arrive in phase 6. This page goes away with them.

import { prisma } from '@/lib/db';
import { metricasMadurez, type ControlMadurez } from '@/lib/sgsi/madurez';
import { clasificar, clasificarZona } from '@/lib/sgsi/clasificar';

export const dynamic = 'force-dynamic';

const REFERENCIA: Record<string, number> = {
  Controles: 93,
  Aplicables: 86,
  'No aplicables': 7,
  'Índice de madurez (%)': 86.7,
  'Nivel típico': 3.0,
  'Nivel medio': 3.23,
  'En L3 o superior': 75,
  'Cumplen objetivo': 26,
  Brechas: 11,
  'Brecha total': 64,
};

export default async function VerificacionPage() {
  const [controles, umbralesRiesgo, umbralesImpacto, riesgos, activos, conValor] =
    await Promise.all([
      prisma.control.findMany({ include: { lineaBase: true, actual: true, objetivo: true } }),
      prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
      prisma.umbralImpacto.findMany({ orderBy: { orden: 'asc' } }),
      prisma.riesgo.findMany({
        where: { obsoleto: false },
        include: { amenaza: { include: { frecuencia: true } } },
      }),
      prisma.activo.count({ where: { activo: true } }),
      prisma.controlAmenaza.count(),
    ]);

  const m = metricasMadurez(
    controles.map<ControlMadurez>((c) => ({
      aplica: c.aplica,
      lineaBase: c.lineaBase?.nivel ?? null,
      actual: c.actual?.nivel ?? null,
      objetivo: c.objetivo?.nivel ?? null,
    })),
  );

  const metricas: [string, number][] = [
    ['Controles', m.total],
    ['Aplicables', m.aplicables],
    ['No aplicables', m.noAplicables],
    ['Índice de madurez (%)', Math.round(m.indice * 100) / 100],
    ['Nivel típico', m.nivelTipico],
    ['Nivel medio', Math.round(m.nivelMedio * 100) / 100],
    ['En L3 o superior', m.enL3],
    ['Cumplen objetivo', m.enObjetivo],
    ['Brechas', m.brechas],
    ['Brecha total', m.brechaTotal],
  ];

  const bandas = new Map<string, number>();
  const zonas = new Map<string, number>();
  for (const r of riesgos) {
    if (r.riesgoPotencial === null) continue;
    const banda = clasificar(r.riesgoPotencial.toString(), umbralesRiesgo) ?? 'sin banda';
    bandas.set(banda, (bandas.get(banda) ?? 0) + 1);
    const zona = clasificarZona(
      (r.impacto ?? 0).toString(),
      r.amenaza.frecuencia.vecesAno.toString(),
    );
    zonas.set(zona, (zonas.get(zona) ?? 0) + 1);
  }

  const sinResidual = riesgos.filter((r) => r.riesgoResidual === null).length;

  return (
    <main className="px-8 pt-6 pb-14 text-12_5 text-secondary">
      <div className="max-w-3xl space-y-7">
        <header>
          <h1 className="titulo-pagina">Verificación del motor</h1>
          <p className="parrafo mt-1 text-muted">
            Página sin diseño. Existe para comprobar la aritmética contra las cifras del
            libro antes de construir las pantallas, de modo que si algo se ve mal después
            quede claro si el problema es el cálculo o el diseño.
          </p>
        </header>

        <Seccion titulo="Madurez de los controles">
          <table className="w-full">
            <tbody>
              {metricas.map(([etiqueta, valor]) => {
                const esperado = REFERENCIA[etiqueta];
                const ok = Math.abs(valor - esperado) <= 0.05;
                return (
                  <tr key={etiqueta} className="border-b border-hairline-strong">
                    <td className="py-1.5">{etiqueta}</td>
                    <td className="py-1.5 text-right tabular-nums">{valor}</td>
                    <td className="py-1.5 pl-6 text-right tabular-nums text-faint">
                      libro {esperado}
                    </td>
                    <td className={`py-1.5 pl-4 ${ok ? 'text-accent-700' : 'text-danger-text'}`}>
                      {ok ? '✓' : '✗'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Seccion>

        <Seccion titulo="Riesgos generados">
          <Dato etiqueta="Activos en el inventario" valor={activos} />
          <Dato etiqueta="Riesgos vigentes" valor={riesgos.length} nota="el libro tiene 2256" />
          <Dato
            etiqueta="Activos que superan el umbral"
            valor={new Set(riesgos.map((r) => r.activoId)).size}
            nota="el libro tiene 122"
          />
        </Seccion>

        <Seccion titulo="Riesgo potencial por banda">
          {umbralesRiesgo.map((u) => (
            <Dato key={u.nombre} etiqueta={u.nombre} valor={bandas.get(u.nombre) ?? 0} />
          ))}
        </Seccion>

        <Seccion titulo="Zonas MAGERIT">
          {[...zonas.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([zona, n]) => (
              <Dato key={zona} etiqueta={zona} valor={n} />
            ))}
        </Seccion>

        {conValor === 0 && (
          <section className="rounded-tarjeta border border-warn-border bg-warn-100 p-4">
            <p className="font-bold text-warn-text">Riesgo residual sin calcular</p>
            <p className="mt-2 text-xs leading-relaxed text-warn-text">
              {sinResidual} de {riesgos.length} riesgos no tienen residual porque ninguna
              amenaza tiene controles mapeados: falta asignar la relevancia de los 272
              pares en <code>prisma/data/relevancia-pendiente.csv</code>.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-warn-text">
              La eficacia es <strong>desconocida</strong>, no cero. Escribir cero dejaría
              cada matriz residual idéntica a la inherente — un informe equivocado que
              parece correcto.
            </p>
          </section>
        )}

        <p className="text-xs text-faint">
          Impacto en bandas de{' '}
          {umbralesImpacto.map((u) => u.nombre).join(' · ')}. Todo lo de esta página se
          calcula en cada carga; nada de esto está almacenado como nivel ni como conteo.
        </p>
      </div>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="etiqueta-campo mb-2">
        {titulo}
      </h2>
      <div className="rounded-tarjeta border border-border-default bg-surface p-4">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: number; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-hairline py-1.5 last:border-0">
      <span>{etiqueta}</span>
      <span className="flex items-baseline gap-3">
        {nota && <span className="text-xs text-faint">{nota}</span>}
        <span className="tabular-nums font-bold">{valor}</span>
      </span>
    </div>
  );
}
