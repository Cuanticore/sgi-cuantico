// app/sgsi/page.tsx
//
// Handoff v2.1 screen 1, "Resumen SGSI (Inicio)". A unified dashboard: every element
// with a figure is navigable, so the number you read and the list behind it are the
// same query.
//
// Order matters and comes from the handoff: the efficacy zone first, then the radar and
// the capability gap immediately after it, then the six summary cards.

import { leerInicio } from '@/app/components/sgsi/inicio/inicio.query';
import { cargarEvaluacionSgsi } from '@/app/components/sgsi/inicio/evaluacion.query';
import TableroInicio, {
  BrechaPorCapacidad,
  InherenteResidual,
  TarjetasResumen,
} from '@/app/components/sgsi/inicio/TableroInicio';
import RadarCapacidades from '@/app/components/sgsi/inicio/RadarCapacidades';
import EvaluacionSgsi from '@/app/components/sgsi/inicio/EvaluacionSgsi';

export const dynamic = 'force-dynamic';

export default async function ResumenSgsiPage() {
  const [datos, evaluacion] = await Promise.all([leerInicio(), cargarEvaluacionSgsi()]);

  const ejes = datos.capacidades.map((c) => ({
    capacidad: c.capacidad,
    corto: c.corto,
    actual: c.eficacia,
    objetivo: c.objetivo,
    lineaBase: c.lineaBase,
  }));

  return (
    <main className="px-8 pt-6 pb-14">
      <header className="mb-5">
        <h1 className="titulo-pagina">Resumen SGSI</h1>
        <p className="parrafo mt-1 text-muted">
          Sistema de Gestión de Seguridad de la Información. Todo elemento con dato lleva
          a su pantalla con el filtro aplicado.
        </p>
      </header>

      <TableroInicio datos={datos} />

      <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <RadarCapacidades ejes={ejes} etiquetaLineaBase={datos.fechaLineaBase} />
        <BrechaPorCapacidad datos={datos} />
      </div>

      <div className="mt-6">
        <TarjetasResumen datos={datos} />
      </div>

      <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <InherenteResidual datos={datos} />

        <section className="rounded-tarjeta border border-border-default bg-surface p-4">
          <h2 className="etiqueta-campo">Verificación del motor</h2>
          <p className="parrafo mt-2 text-11_5">
            Las cifras de esta pantalla se comprueban contra las del libro de Excel en una
            página aparte, sin diseño, para que si algo se ve mal quede claro si el problema
            es el cálculo o la presentación.
          </p>
          <a
            href="/sgsi/verificacion"
            className="mt-3 inline-block font-mono text-10_5 text-accent-700 underline decoration-accent-border underline-offset-2"
          >
            ver la verificación ↗
          </a>
        </section>
      </div>

      {/* INF-SIG-04. The section brings its own top border and expects the page's
          horizontal gutters, so it is composed without a wrapper. */}
      <div className="mt-8">
        <EvaluacionSgsi {...evaluacion} />
      </div>
    </main>
  );
}
