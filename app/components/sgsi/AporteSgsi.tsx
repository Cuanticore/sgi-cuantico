// app/components/sgsi/AporteSgsi.tsx
//
// What the SGSI contributes to the SIG, on the Indicadores screen. Four figures that
// each link into the SGSI module, so the two domains are visibly one system rather than
// two applications behind the same login.
//
// Every figure comes from the same queries the SGSI screens use. A number that is not
// yet computable says so instead of showing a zero.

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { metricasMadurez, type ControlMadurez } from '@/lib/sgsi/madurez';

export default async function AporteSgsi() {
  const [controles, activos, riesgos, paresMapeados] = await Promise.all([
    prisma.control.findMany({ include: { actual: true, lineaBase: true, objetivo: true } }),
    prisma.activo.count({ where: { activo: true } }),
    prisma.riesgo.count({ where: { obsoleto: false } }),
    prisma.controlAmenaza.count(),
  ]);

  const m = metricasMadurez(
    controles.map<ControlMadurez>((c) => ({
      soa: c.soa === 'PARCIAL' ? 'parcial' : c.soa === 'NO' ? 'no' : 'si',
      lineaBase: c.lineaBase?.nivel ?? null,
      actual: c.actual?.nivel ?? null,
      objetivo: c.objetivo?.nivel ?? null,
    })),
  );

  const indicadores = [
    {
      etiqueta: 'Índice de madurez',
      valor: `${m.indice.toFixed(1)}%`,
      pie: 'media de la eficacia de los controles',
      href: '/sgsi/controles',
    },
    {
      etiqueta: 'Riesgos analizados',
      valor: riesgos,
      pie: paresMapeados > 0 ? 'con residual calculado' : 'residual sin calcular',
      href: '/sgsi/matrices',
    },
    {
      etiqueta: 'Brechas en L2 o menos',
      valor: m.brechas,
      pie: 'cada una es una acción del plan',
      href: '/sgsi/planes',
    },
    {
      etiqueta: 'Activos inventariados',
      valor: activos,
      pie: 'valorados en D, I y C',
      href: '/sgsi/inventario',
    },
  ];

  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <h2 className="etiqueta-campo">Aporte del SGSI al SIG</h2>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((i) => (
          <Link
            key={i.etiqueta}
            href={i.href}
            className="rounded-campo border border-hairline-strong px-3 py-2.5 transition-colors hover:bg-accent-50"
          >
            <p className="etiqueta-campo">{i.etiqueta}</p>
            <p className="cifra mt-1 text-20 text-primary">{i.valor}</p>
            <p className="mt-0.5 text-10 leading-tight text-faint">{i.pie}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
