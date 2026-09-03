// lib/sig/__tests__/metricas.test.ts
//
// O10 · el umbral es un dato de la métrica, y su SENTIDO también: el número solo no dice
// de qué lado está lo malo.

import {
  alertasDeLaSerie,
  enAlerta,
  escalaDeLaSerie,
  estadoDeMetrica,
  formatearNumero,
  rachaDeAlerta,
  textoDeAlerta,
  type DefinicionMetrica,
  type Medicion,
} from '../metricas';

const CAPACIDAD: DefinicionMetrica = { umbral: 80, sentido: 'MENOR_ES_MEJOR' };
const COBERTURA: DefinicionMetrica = { umbral: 90, sentido: 'MAYOR_ES_MEJOR' };

const serie = (...valores: number[]): Medicion[] =>
  valores.map((valor, i) => ({ periodo: `2026-${String(i + 1).padStart(2, '0')}`, valor }));

describe('enAlerta — el sentido decide de qué lado está lo malo', () => {
  it('con MENOR_ES_MEJOR cruza al subir', () => {
    expect(enAlerta(86, CAPACIDAD)).toBe(true);
    expect(enAlerta(70, CAPACIDAD)).toBe(false);
  });

  it('con MAYOR_ES_MEJOR cruza al bajar — el mismo número, la conclusión opuesta', () => {
    expect(enAlerta(70, COBERTURA)).toBe(true);
    expect(enAlerta(95, COBERTURA)).toBe(false);
  });

  it('el límite exacto NO está en alerta', () => {
    // Un umbral de 80 significa «hasta 80 es aceptable». Quien quiera lo contrario pone 79,
    // y ésa es una decisión de quien define la métrica.
    expect(enAlerta(80, CAPACIDAD)).toBe(false);
    expect(enAlerta(90, COBERTURA)).toBe(false);
  });
});

describe('rachaDeAlerta — la tendencia es la alerta, no el dato suelto', () => {
  it('cuenta los consecutivos hasta el más reciente', () => {
    expect(rachaDeAlerta(serie(74, 76, 79, 82, 84, 86), CAPACIDAD)).toBe(3);
  });

  it('es cero si el último volvió al rango, aunque antes hubiera cruzado', () => {
    // «Se pasó una vez en abril» y «lleva tres meses subiendo» son dos conversaciones
    // distintas; el conteo total no las separa.
    expect(rachaDeAlerta(serie(95, 92, 70), CAPACIDAD)).toBe(0);
  });

  it('una serie vacía no tiene racha', () => {
    expect(rachaDeAlerta([], CAPACIDAD)).toBe(0);
  });
});

describe('estadoDeMetrica — sin registrar no es en rango', () => {
  it('sin mediciones queda SIN_REGISTRAR', () => {
    // Pintarla de verde diría que alguien la miró y salió bien.
    expect(estadoDeMetrica([], CAPACIDAD)).toBe('SIN_REGISTRAR');
  });

  it('mira la última, no la peor', () => {
    expect(estadoDeMetrica(serie(95, 70), CAPACIDAD)).toBe('EN_RANGO');
    expect(estadoDeMetrica(serie(70, 95), CAPACIDAD)).toBe('EN_ALERTA');
  });
});

describe('alertasDeLaSerie — derivadas, no almacenadas', () => {
  it('devuelve sólo las que cruzaron, de la más reciente a la más vieja', () => {
    const r = alertasDeLaSerie(serie(82, 70, 86), CAPACIDAD);
    expect(r.map((m) => m.valor)).toEqual([86, 82]);
  });
});

describe('textoDeAlerta — se genera del dato, no se escribe a mano', () => {
  it('cita el umbral vigente y la distancia', () => {
    const t = textoDeAlerta({ periodo: '2026-08', valor: 86 }, CAPACIDAD, '% de la capacidad', 1);
    expect(t).toContain('umbral de 80');
    expect(t).toContain('6 por encima');
  });

  it('con racha nombra la tendencia', () => {
    const t = textoDeAlerta({ periodo: '2026-08', valor: 86 }, CAPACIDAD, '%', 3);
    expect(t).toContain('3 periodos consecutivos');
  });

  it('con MAYOR_ES_MEJOR dice «por debajo», no «por encima»', () => {
    const t = textoDeAlerta({ periodo: '2026-08', valor: 70 }, COBERTURA, '%', 1);
    expect(t).toContain('20 por debajo');
  });
});

describe('formatearNumero — sin decimales cuando no los hay', () => {
  it('no inventa precisión', () => {
    // Un `.00` en una cuenta de vulnerabilidades sugiere una precisión que el dato no tiene.
    expect(formatearNumero(6)).toBe('6');
    expect(formatearNumero(6.5)).toBe('6.5');
  });
});

describe('escalaDeLaSerie — el umbral entra en el dibujo aunque nadie se le acerque', () => {
  it('el tope contempla el umbral, no sólo el máximo medido', () => {
    // Si no, la línea de umbral quedaría fuera de la caja y el gráfico no tendría
    // referencia contra la cual leerse.
    const e = escalaDeLaSerie(serie(2, 3, 1), CAPACIDAD);
    expect(e.tope).toBeGreaterThan(80);
    expect(e.alturaUmbral).toBeLessThan(1);
    expect(e.alturaUmbral).toBeGreaterThan(0);
  });

  it('una serie vacía no divide por cero', () => {
    const e = escalaDeLaSerie([], { umbral: 0, sentido: 'MENOR_ES_MEJOR' });
    expect(Number.isFinite(e.tope)).toBe(true);
    expect(e.tope).toBeGreaterThan(0);
  });
});
