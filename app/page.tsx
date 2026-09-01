import { getIndicatorsData } from '@/app/lib/data';
import { computeOcRadarData } from '@/app/lib/oc-utils';
import type { IndicatorYear } from '@/app/lib/sharepoint';
import HeroBanner from './components/HeroBanner';
import DashboardShell from './components/DashboardShell';
import ShellSig from './components/sgsi/ShellSig';
import CabeceraIndicadores from './components/sgsi/CabeceraIndicadores';
import AporteSgsi from './components/sgsi/AporteSgsi';

export default async function DashboardPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise; synchronous access was removed.
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year: IndicatorYear = yearParam === '2025' ? '2025' : '2026';

  const otherYear: IndicatorYear = year === '2026' ? '2025' : '2026';

  let data;
  let otherData;
  try {
    [data, otherData] = await Promise.all([
      getIndicatorsData(year),
      getIndicatorsData(otherYear).catch(() => null),
    ]);
  } catch (err) {
    // A bare catch here hid every cause behind the same SharePoint message.
    console.error('[dashboard] could not load indicators', err);
    // The notice renders INSIDE the shell. This route is where a session lands after
    // signing in, so returning a bare card left the header and the sidebar out and the
    // whole SIG unreachable: Mi SIG, Operación, Estratégico and the SGSI are all fine when
    // SharePoint is not, and a reader stranded on this page cannot tell. ShellSig already
    // tolerates the same failure for its own counter, so wrapping costs nothing.
    return (
      <ShellSig>
        <main className="px-8 pt-10 pb-14">
          <div
            className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
            style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
          >
            <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
              Los indicadores no están disponibles
            </h1>
            <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
              No se pudo leer la matriz de indicadores {year} desde SharePoint. Es un problema
              de esa fuente, no del resto del sistema: Mi SIG, Operación, Estratégico y el
              SGSI siguen funcionando y podés entrar desde el menú de arriba.
            </p>
            <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text-soft)' }}>
              Si esto no se resuelve solo, quien administre el sistema debe revisar la ruta y
              el nombre del archivo configurados para el año {year}, y que la aplicación
              conserve permiso de lectura sobre esa biblioteca.
            </p>
            {process.env.NODE_ENV !== 'production' && (
              <details className="mt-1">
                <summary
                  className="cursor-pointer text-11_5"
                  style={{ color: 'var(--hf-warn-text-soft)' }}
                >
                  Detalle técnico (solo en desarrollo)
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-tarjeta bg-subtle p-4 text-11 leading-relaxed text-secondary">
                  {err instanceof Error
                    ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}`
                    : String(err)}
                </pre>
              </details>
            )}
          </div>
        </main>
      </ShellSig>
    );
  }

  const srcData2025 = year === '2025' ? data : otherData;
  const srcData2026 = year === '2026' ? data : otherData;
  const ocData2025 = srcData2025
    ? computeOcRadarData(srcData2025.indicadores, srcData2025.objetivosCalidad, null)
    : [];
  const ocData2026 = srcData2026
    ? computeOcRadarData(srcData2026.indicadores, srcData2026.objetivosCalidad, null)
    : [];

  return (
    // The corporate bar replaces the old Nav: it carries the brand, the identity and the
    // tabs for both domains of the SIG, so the year selector and the matrix link move
    // down into the page header where they belong.
    <ShellSig>
      <CabeceraIndicadores
        year={year}
        matrixUrl={
          year === '2026'
            ? process.env.SHAREPOINT_MATRIX_URL_2026
            : process.env.SHAREPOINT_MATRIX_URL_2025
        }
      />
      <HeroBanner summary={data.summary} year={year} />
      <div className="px-8 pb-2">
        <AporteSgsi />
      </div>
      <DashboardShell
        procesos={data.procesos}
        mensual={data.mensual}
        trimestres={data.trimestres}
        indicadores={data.indicadores}
        objetivosCalidad={data.objetivosCalidad}
        year={year}
        ocData2025={ocData2025}
        ocData2026={ocData2026}
      />
      <footer className="bg-slate-50 border-t border-slate-200 px-8 py-4 flex justify-between items-center">
        <span className="text-xs text-slate-400">
          Cuantico · Sistema de Gestión de Calidad ISO 9001 · {year}
        </span>
        <span className="text-xs text-slate-400">
          Datos sincronizados desde SharePoint · MAT-CAL-03 v1
        </span>
      </footer>
    </ShellSig>
  );
}
