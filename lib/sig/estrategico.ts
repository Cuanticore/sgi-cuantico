// lib/sig/estrategico.ts
//
// Las fórmulas de MAT-CAL-02, verificadas fila por fila. Puro a propósito: la paridad
// de la migración y la parametrización (D4) se prueban sin base. Nada de esto se
// almacena: inherente, residual y nivel se derivan al leer.

export type ReduceTipo = 'PROBABILIDAD' | 'IMPACTO' | 'AMBOS';
export type Medicion = 'DEBIL' | 'MODERADO' | 'FUERTE';

export const EFICACIA: Record<Medicion, number> = {
  DEBIL: 0.1,
  MODERADO: 0.4,
  FUERTE: 0.8,
};

export interface ResultadoResidual {
  inherente: number;
  pRes: number;
  iRes: number;
  residual: number;
}

function reduceDe(tipo: string): ReduceTipo {
  switch (tipo) {
    case 'PREVENTIVO':
    case 'REFORZADOR':
      return 'PROBABILIDAD';
    case 'CORRECTIVO':
    case 'REACTIVO':
      return 'IMPACTO';
    case 'PREVENTIVO_Y_CORRECTIVO':
    case 'PROACTIVO':
      return 'AMBOS';
  }
  return 'AMBOS';
}

export function inherenteDe(probabilidad: number, impacto: number): number {
  return probabilidad * impacto;
}

export function residualDe(
  probabilidad: number,
  impacto: number,
  tipo: string,
  medicion: Medicion,
): ResultadoResidual {
  const e = EFICACIA[medicion];
  const reduce = reduceDe(tipo);
  const pRes =
    reduce === 'PROBABILIDAD' || reduce === 'AMBOS' ? probabilidad * (1 - e) : probabilidad;
  const iRes = reduce === 'IMPACTO' || reduce === 'AMBOS' ? impacto * (1 - e) : impacto;
  return {
    inherente: inherenteDe(probabilidad, impacto),
    pRes,
    iRes,
    residual: pRes * iRes,
  };
}

/// Índice del nivel que contiene al valor, contra los mínimos ordenados.
export function nivelDe(valor: number, minimos: readonly number[]): number {
  let indice = minimos.length - 1;
  for (let i = 0; i < minimos.length; i++) {
    if (valor < minimos[i]) {
      indice = i - 1;
      break;
    }
  }
  return indice;
}