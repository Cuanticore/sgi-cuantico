'use client';
import { useState } from 'react';
import ChartsSection from './ChartsSection';
import ProcessGrid from './ProcessGrid';
import IndicatorsTable from './IndicatorsTable';
import OcCardsRow from './OcCardsRow';
import { computeOcRadarData } from '@/app/lib/oc-utils';
import type { Process, MonthlyData, Quarter, Indicator, QualityObjective } from '@/app/lib/types';

export default function DashboardShell({
  procesos,
  mensual,
  trimestres,
  indicadores,
  objetivosCalidad,
  year,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  indicadores: Indicator[];
  objetivosCalidad: QualityObjective[];
  year: string;
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="col-span-2">
          <ProcessGrid
            procesos={procesos}
            selected={processFilter}
            onSelect={handleProcessSelect}
          />
        </div>
        <div className="flex flex-col">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Objetivos de Calidad
          </p>
          <div className="overflow-y-auto max-h-[280px]">
            <OcCardsRow ocData={ocData} selected={ocFilter} onSelect={handleOcSelect} />
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
    </div>
  );
}
