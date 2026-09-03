// lib/sig/__tests__/organizaciones.test.ts
//
// La reevaluacion anual de POL-TEC-02 (D4). Todo se DERIVA de la ultima evaluacion, y lo
// que se prueba aca son los dos errores que un «estado» guardado cometeria:
//
//   1. Quedarse viejo. Una organizacion evaluada en marzo de 2026 pasa a estar vencida en
//      marzo de 2027 sin que nadie escriba nada.
//   2. Confundir «nunca se evaluo» con «se dejo caducar». Colapsarlas haria que dar de alta
//      un proveedor generara un incumplimiento inmediato.

import {
  estadoDeEvaluacion,
  proximaEvaluacion,
  resultadoVigente,
  ultimaEvaluacion,
  type EvaluacionRegistrada,
} from '../organizaciones';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const e = (anio: number, fecha: string, resultado: EvaluacionRegistrada['resultado'] = 'CUMPLE'): EvaluacionRegistrada => ({
  anio,
  fecha: d(fecha),
  resultado,
});

describe('ultimaEvaluacion', () => {
  it('toma la del año mas alto, no la ultima de la lista', () => {
    const r = ultimaEvaluacion([e(2024, '2024-03-01'), e(2026, '2026-03-01'), e(2025, '2025-03-01')]);
    expect(r?.anio).toBe(2026);
  });

  it('sin evaluaciones devuelve null', () => {
    expect(ultimaEvaluacion([])).toBeNull();
  });
});

describe('proximaEvaluacion', () => {
  it('suma la periodicidad a la ultima fecha', () => {
    expect(proximaEvaluacion([e(2026, '2026-03-15')])).toEqual(d('2027-03-15'));
  });

  it('respeta una periodicidad distinta de la anual', () => {
    // El invariante 4: ningun plazo en el codigo. POL-TEC-02 pide anual y es el default,
    // pero semestral tiene que salir de un parametro y no de otra funcion.
    expect(proximaEvaluacion([e(2026, '2026-03-15')], 6)).toEqual(d('2026-09-15'));
  });

  // Sumar meses cruzando el año: el mes 14 de 2026 tiene que ser febrero de 2027, no el
  // mes 14 de 2026.
  it('cruza el año correctamente', () => {
    expect(proximaEvaluacion([e(2026, '2026-11-20')])).toEqual(d('2027-11-20'));
    expect(proximaEvaluacion([e(2026, '2026-11-20')], 3)).toEqual(d('2027-02-20'));
  });

  // Nunca evaluada no tiene desde donde contar. Devolver «hoy» convertiria un alta en un
  // vencimiento.
  it('sin evaluaciones no inventa una fecha', () => {
    expect(proximaEvaluacion([])).toBeNull();
  });
});

describe('estadoDeEvaluacion', () => {
  it('al dia cuando falta mas que el aviso', () => {
    expect(estadoDeEvaluacion([e(2026, '2026-03-15')], d('2026-06-01'))).toBe('AL_DIA');
  });

  it('por vencer dentro de los 30 dias', () => {
    // Proxima: 2027-03-15. A 20 dias.
    expect(estadoDeEvaluacion([e(2026, '2026-03-15')], d('2027-02-23'))).toBe('POR_VENCER');
  });

  it('vencida cuando la fecha ya paso', () => {
    expect(estadoDeEvaluacion([e(2026, '2026-03-15')], d('2027-03-16'))).toBe('VENCIDA');
  });

  // El error que un «estado» guardado comete: la organizacion no se toca y el estado cambia
  // solo con el paso del tiempo. Esta prueba es la razon por la que no hay columna.
  it('la MISMA evaluacion cambia de estado con el tiempo, sin que nadie la toque', () => {
    const evaluaciones = [e(2026, '2026-03-15')];
    expect(estadoDeEvaluacion(evaluaciones, d('2026-06-01'))).toBe('AL_DIA');
    expect(estadoDeEvaluacion(evaluaciones, d('2027-03-01'))).toBe('POR_VENCER');
    expect(estadoDeEvaluacion(evaluaciones, d('2027-04-01'))).toBe('VENCIDA');
  });

  // Y el segundo error: «nunca se evaluo» no es «se dejo caducar». Dar de alta un proveedor
  // no puede generar un incumplimiento el mismo dia.
  it('sin evaluar NO es lo mismo que vencida', () => {
    expect(estadoDeEvaluacion([], d('2026-06-01'))).toBe('SIN_EVALUAR');
  });

  // El limite exacto del aviso, que es donde se equivoca un `<` por un `<=`.
  it('a exactamente 30 dias ya esta por vencer, y a 31 todavia no', () => {
    expect(estadoDeEvaluacion([e(2026, '2026-03-15')], d('2027-02-13'))).toBe('POR_VENCER');
    expect(estadoDeEvaluacion([e(2026, '2026-03-15')], d('2027-02-12'))).toBe('AL_DIA');
  });

  // El dia exacto del vencimiento todavia se puede cumplir: vence, no ha vencido.
  it('el dia del vencimiento no esta vencida', () => {
    expect(estadoDeEvaluacion([e(2026, '2026-03-15')], d('2027-03-15'))).toBe('POR_VENCER');
  });

  // La familia de defectos que ya aparecio cinco veces: restar fechas empaquetadas.
  // Del 31 de enero al 1 de febrero son 1 dia, no 70.
  it('cruzar un fin de mes no descuadra el conteo', () => {
    // Proxima: 2027-02-01. Hoy 2027-01-31 → falta 1 dia.
    expect(estadoDeEvaluacion([e(2026, '2026-02-01')], d('2027-01-31'))).toBe('POR_VENCER');
  });
});

describe('resultadoVigente', () => {
  // Una organizacion al dia con NO_CUMPLE esta PEOR que una vencida con CUMPLE, y un solo
  // semaforo no distingue las dos. Por eso el resultado se lee aparte del estado.
  it('devuelve el resultado de la ultima, no el mejor ni el peor', () => {
    const r = resultadoVigente([e(2025, '2025-03-01', 'CUMPLE'), e(2026, '2026-03-01', 'NO_CUMPLE')]);
    expect(r).toBe('NO_CUMPLE');
  });

  it('sin evaluaciones devuelve null y no un CUMPLE optimista', () => {
    expect(resultadoVigente([])).toBeNull();
  });
});
