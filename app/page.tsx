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
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow-sm max-w-2xl">
          <p className="text-red-600 font-semibold mb-2 text-center">Error al cargar indicadores</p>
          <p className="text-slate-500 text-sm text-center">
            No se pudo cargar la matriz de indicadores. Verifica la configuración e intenta de nuevo.
          </p>
          {process.env.NODE_ENV !== 'production' && (
            <pre className="mt-5 max-h-80 overflow-auto rounded-sm bg-slate-900 p-4 text-xs leading-relaxed text-amber-200">
              {err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}` : String(err)}
            </pre>
          )}
        </div>
      </div>
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
