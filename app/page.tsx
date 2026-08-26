import { getIndicatorsData } from '@/app/lib/data';
import { computeOcRadarData } from '@/app/lib/oc-utils';
import type { IndicatorYear } from '@/app/lib/sharepoint';
import AvisoIndicadores from './components/AvisoIndicadores';
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

    // Rendered INSIDE the shell. The previous version returned a bare page, which took the
    // header and the sidebar with it — so a 404 on a SharePoint path locked the person out
    // of the SGSI module as well, and the SGSI module never touches SharePoint. One
    // domain's remote dependency must not be able to hide the other.
    const estado =
      typeof err === 'object' && err !== null && 'response' in err
        ? ((err as { response?: { status?: number } }).response?.status ?? null)
        : null;

    return (
      <ShellSig>
        <CabeceraIndicadores
          year={year}
          matrixUrl={
            year === '2026'
              ? process.env.SHAREPOINT_MATRIX_URL_2026
              : process.env.SHAREPOINT_MATRIX_URL_2025
          }
        />
        <AvisoIndicadores
          estado={estado}
          anio={year}
          // A stack trace is a development aid, not something to put in front of whoever
          // opens the dashboard in production.
          detalle={
            process.env.NODE_ENV !== 'production'
              ? err instanceof Error
                ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}`
                : String(err)
              : null
          }
        />
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
