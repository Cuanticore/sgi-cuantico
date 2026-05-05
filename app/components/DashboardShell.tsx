'use client';
import { useState } from 'react';
import ChartsSection from './ChartsSection';
import ProcessGrid from './ProcessGrid';
import IndicatorsTable from './IndicatorsTable';
import OcCardsRow from './OcCardsRow';
import OcComparisonSection from './OcComparisonSection';
import { computeOcRadarData } from '@/app/lib/oc-utils';
import type { Process, MonthlyData, Quarter, Indicator, QualityObjective, OcRadarData } from '@/app/lib/types';

export default function DashboardShell({
  procesos,
  mensual,
  trimestres,
  indicadores,
  objetivosCalidad,
  year,
  ocData2025,
  ocData2026,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  indicadores: Indicator[];
  objetivosCalidad: QualityObjective[];
  year: string;
  ocData2025: OcRadarData[];
  ocData2026: OcRadarData[];
}) {
  const [processFilter, setProcessFilter] = useState<string | null>(null);

  function handleProcessSelect(nombre: string | null) {
    setProcessFilter(prev => (prev === nombre ? null : nombre));
  }

  const ocData = computeOcRadarData(indicadores, objetivosCalidad, processFilter);

  return (
    <div className="px-8 mt-6">
      <ChartsSection
        procesos={procesos}
        mensual={mensual}
        trimestres={trimestres}
        ocData={ocData}
        year={year}
        selectedProcess={processFilter}
        onProcessSelect={handleProcessSelect}
      />
      <ProcessGrid
        procesos={procesos}
        selected={processFilter}
        onSelect={handleProcessSelect}
      />
      <OcCardsRow ocData={ocData} />
      <IndicatorsTable
        indicadores={indicadores}
        objetivosCalidad={objetivosCalidad}
        processFilter={processFilter}
        onProcessFilterChange={setProcessFilter}
      />
      <OcComparisonSection
        ocData2025={ocData2025}
        ocData2026={ocData2026}
        indicadores={indicadores}
        year={year}
      />
    </div>
  );
}
