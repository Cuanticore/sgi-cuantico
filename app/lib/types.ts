// app/lib/types.ts

export interface IndicatorsSummary {
  avanceGlobal: number;       // 81.4 (percentage, not decimal)
  totalIndicadores: number;   // 26
  medidos: number;            // 17
  enMeta: number;             // 11
  alerta: number;             // 1
  critico: number;            // 2
}

export type IndicatorStatus = 'en_meta' | 'alerta' | 'critico' | 'sin_datos';

export interface Quarter {
  label: string;              // "Q1"
  months: string;             // "Ene-Mar"
  cumplimiento: number | null; // 81.0
  mediciones: number;
  status: IndicatorStatus;
}

export interface Process {
  nombre: string;             // "Gestión Estratégica"
  numIndicadores: number;     // 3
  cumplimiento: number | null; // 44.5
  meta: number;               // 90.0
  status: IndicatorStatus;
}

export interface MonthlyData {
  mes: string;                // "Ene"
  cumplimiento: number | null; // 79.6 or null if no data
}

export interface QualityObjective {
  codigo: string;             // "OC1"
  descripcion: string;        // "Satisfacción del cliente"
  cumplimiento: number | null;
}

export interface Indicator {
  numero: number;
  proceso: string;
  nombre: string;
  lider: string;
  frecuencia: string;
  meta: string;              // kept as string (can be "90%", "≥ 2", "≥ 12 meses")
  resultado: number | null;  // percentage value or null
  status: IndicatorStatus;
  oc: string;                // "OC1", "OC5", etc.
}

export interface IndicatorsData {
  summary: IndicatorsSummary;
  trimestres: Quarter[];
  procesos: Process[];
  mensual: MonthlyData[];
  indicadores: Indicator[];
  objetivosCalidad: QualityObjective[];
  fetchedAt: string;         // ISO timestamp
}
