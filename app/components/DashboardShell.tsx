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
  const [ocFilter, setOcFilter] = useState<string | null>(null);

  function handleProcessSelect(nombre: string | null) {
    setProcessFilter(prev => (prev === nombre ? null : nombre));
  }

  function handleOcSelect(codigo: string | null) {
    setOcFilter(prev => (prev === codigo ? null : codigo));
  }

  const ocData = computeOcRadarData(indicadores, objetivosCalidad, processFilter);

  return (
    <div className="px-4 md:px-8 mt-6">
      <ChartsSection
        procesos={procesos}
        mensual={mensual}
        trimestres={trimestres}
        ocData={ocData}
        year={year}
        selectedProcess={processFilter}
        onProcessSelect={handleProcessSelect}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="col-span-1 md:col-span-2">
          <ProcessGrid
            procesos={procesos}
            selected={processFilter}
            onSelect={handleProcessSelect}
          />
        </div>
        <div className="flex flex-col h-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Objetivos de Calidad
          </p>
          <div className="flex-1 min-h-0">
            <OcCardsRow
              ocData={ocData}
              objetivosCalidad={objetivosCalidad}
              selected={ocFilter}
              onSelect={handleOcSelect}
            />
          </div>
        </div>
      </div>
      <IndicatorsTable
        indicadores={indicadores}
        objetivosCalidad={objetivosCalidad}
        processFilter={processFilter}
        onProcessFilterChange={setProcessFilter}
        ocFilter={ocFilter}
        onOcFilterChange={setOcFilter}
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
