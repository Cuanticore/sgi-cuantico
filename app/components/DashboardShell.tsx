'use client';
import { useState } from 'react';
import ChartsSection from './ChartsSection';
import ProcessGrid from './ProcessGrid';
import IndicatorsTable from './IndicatorsTable';
import type { Process, MonthlyData, Quarter, Indicator } from '@/app/lib/types';

export default function DashboardShell({
  procesos,
  mensual,
  trimestres,
  indicadores,
  year,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  indicadores: Indicator[];
  year: string;
}) {
  const [processFilter, setProcessFilter] = useState<string | null>(null);

  function handleProcessSelect(nombre: string | null) {
    setProcessFilter(prev => (prev === nombre ? null : nombre));
  }

  return (
    <div className="px-8 mt-6">
      <ChartsSection
        procesos={procesos}
        mensual={mensual}
        trimestres={trimestres}
        year={year}
        selectedProcess={processFilter}
        onProcessSelect={handleProcessSelect}
      />
      <ProcessGrid
        procesos={procesos}
        selected={processFilter}
        onSelect={handleProcessSelect}
      />
      <IndicatorsTable
        indicadores={indicadores}
        processFilter={processFilter}
        onProcessFilterChange={setProcessFilter}
      />
    </div>
  );
}
