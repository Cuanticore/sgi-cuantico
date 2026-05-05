import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';
import { getIndicatorsData } from '@/app/lib/data';
import type { IndicatorYear } from '@/app/lib/sharepoint';
import Nav from './components/Nav';
import HeroBanner from './components/HeroBanner';
import ChartsSection from './components/ChartsSection';
import ProcessGrid from './components/ProcessGrid';
import IndicatorsTable from './components/IndicatorsTable';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const year: IndicatorYear = searchParams.year === '2025' ? '2025' : '2026';
  const session = await getServerSession(authOptions);
  const userName = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const initials =
    userName
      .split(' ')
      .map((n: string) => n[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  let data;
  try {
    data = await getIndicatorsData(year);
  } catch {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow text-center max-w-sm">
          <p className="text-red-600 font-semibold mb-2">Error al cargar indicadores</p>
          <p className="text-slate-500 text-sm">
            No se pudo conectar a SharePoint. Verifica la configuración e intenta de nuevo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav year={year} initials={initials} fetchedAt={data.fetchedAt} />
      <HeroBanner summary={data.summary} year={year} />
      <div className="px-8 mt-6">
        <ChartsSection
          procesos={data.procesos}
          mensual={data.mensual}
          trimestres={data.trimestres}
          year={year}
        />
        <ProcessGrid procesos={data.procesos} />
        <IndicatorsTable indicadores={data.indicadores} />
      </div>
      <footer className="bg-slate-50 border-t border-slate-200 px-8 py-4 flex justify-between items-center">
        <span className="text-xs text-slate-400">
          Cuantico · Sistema de Gestión de Calidad ISO 9001 · {year}
        </span>
        <span className="text-xs text-slate-400">
          Datos sincronizados desde SharePoint · MAT-CAL-03 v1
        </span>
      </footer>
    </main>
  );
}
