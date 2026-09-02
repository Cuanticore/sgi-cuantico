// lib/sig/__tests__/parametros.test.ts
//
// Los casos que importan son los que PASARÍAN sin validar y clasificarían mal en silencio.
// Una tabla del método mal guardada no rompe ninguna pantalla: deja riesgos en la banda
// equivocada, y eso se descubre en una auditoría, no en un error.

import {
  validarNiveles,
  validarEscala,
  validarEficacias,
  validarMotivo,
  type FilaNivel,
} from '../parametros';

const nivel = (minimo: number, maximo: number, etiqueta: string): FilaNivel => ({
  minimo,
  maximo,
  etiqueta,
  color: '#0b5c44',
  accionRiesgo: 'Asumir',
  accionOportunidad: 'Monitorear',
});

describe('validarNiveles · las bandas', () => {
  const BUENAS = [nivel(1, 8, 'Aceptable'), nivel(9, 14, 'Moderado'), nivel(15, 25, 'Inaceptable')];

  it('acepta bandas contiguas que arrancan en 1', () => {
    const v = validarNiveles(BUENAS, 25);
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual([]);
  });

  // El caso que justifica el módulo: `nivelDe()` devuelve la banda de abajo y nadie avisa.
  it('detecta un hueco entre bandas', () => {
    const v = validarNiveles(
      [nivel(1, 8, 'Aceptable'), nivel(12, 25, 'Inaceptable')],
      25,
    );
    expect(v.errores).toHaveLength(1);
    expect(v.errores[0]).toContain('hueco entre 8 y 12');
  });

  it('detecta bandas solapadas', () => {
    const v = validarNiveles(
      [nivel(1, 10, 'Aceptable'), nivel(8, 25, 'Inaceptable')],
      25,
    );
    expect(v.errores).toHaveLength(1);
    expect(v.errores[0]).toContain('se solapan');
  });

  it('rechaza que la más baja arranque por encima de 1', () => {
    const v = validarNiveles([nivel(3, 25, 'Todo')], 25);
    expect(v.errores[0]).toContain('arrancar en 1 o antes');
  });

  // Los datos reales del MAN-CAL-01 arrancan en 0 —«0–4 Aceptable»— y eso es correcto: el
  // producto minimo de P×I es 1×1, asi que empezar mas abajo no deja nada afuera. La
  // primera version de esta regla exigia el 1 exacto y RECHAZABA los datos vigentes; se
  // descubrio corriendo el validador contra la base, no escribiendo mas pruebas.
  it('acepta que arranque en 0, como el metodo vigente', () => {
    const v = validarNiveles(
      [nivel(0, 4, 'Aceptable'), nivel(5, 12, 'Moderado'), nivel(13, 25, 'Inaceptable')],
      25,
    );
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual([]);
  });

  // No es error: puede ser deliberado. Pero hay que decirlo.
  it('avisa —sin bloquear— si la banda más alta no llega al máximo posible', () => {
    const v = validarNiveles([nivel(1, 8, 'Aceptable'), nivel(9, 20, 'Alto')], 25);
    expect(v.errores).toEqual([]);
    expect(v.avisos).toHaveLength(1);
    expect(v.avisos[0]).toContain('termina en 20');
  });

  it('valida el orden de los limites de una misma banda', () => {
    const v = validarNiveles([{ ...nivel(1, 25, 'Rara'), minimo: 20, maximo: 5 }], 25);
    expect(v.errores.some((e) => e.includes('empieza en 20 y termina en 5'))).toBe(true);
  });

  it('exige etiqueta y las dos acciones', () => {
    const v = validarNiveles(
      [{ ...nivel(1, 25, ''), accionRiesgo: '', accionOportunidad: '' }],
      25,
    );
    expect(v.errores).toHaveLength(3);
  });

  it('exige un color hex de seis digitos', () => {
    const v = validarNiveles([{ ...nivel(1, 25, 'Todo'), color: 'verde' }], 25);
    expect(v.errores.some((e) => e.includes('hex'))).toBe(true);
  });

  it('rechaza una tabla vacia: sin niveles nada se clasifica', () => {
    expect(validarNiveles([], 25).errores).toHaveLength(1);
  });

  // El orden en que llegan no importa: se ordenan antes de comparar.
  it('valida igual si las filas llegan desordenadas', () => {
    const v = validarNiveles([BUENAS[2], BUENAS[0], BUENAS[1]], 25);
    expect(v.errores).toEqual([]);
  });
});

describe('validarEscala', () => {
  const e = (valor: number, etiqueta: string) => ({ valor, etiqueta });

  it('acepta 1 a 5 consecutivos', () => {
    const v = validarEscala([e(1, 'Muy baja'), e(2, 'Baja'), e(3, 'Media'), e(4, 'Alta'), e(5, 'Muy alta')]);
    expect(v.errores).toEqual([]);
  });

  // Un salto deja una fila y una columna del mapa de calor en blanco para siempre.
  it('detecta un salto en los valores', () => {
    const v = validarEscala([e(1, 'Baja'), e(2, 'Media'), e(4, 'Alta')]);
    expect(v.errores[0]).toContain('falta el valor 3');
  });

  it('detecta un valor repetido', () => {
    const v = validarEscala([e(1, 'Baja'), e(1, 'Otra baja')]);
    expect(v.errores[0]).toContain('repetido');
  });

  it('exige que arranque en 1', () => {
    const v = validarEscala([e(2, 'Baja'), e(3, 'Media')]);
    expect(v.errores[0]).toContain('empezar en 1');
  });

  it('exige etiqueta', () => {
    expect(validarEscala([e(1, '  ')]).errores[0]).toContain('no tiene etiqueta');
  });
});

describe('validarEficacias', () => {
  it('acepta factores entre 0 y 1', () => {
    const v = validarEficacias([
      { nombre: 'Débil', valor: 0.2 },
      { nombre: 'Moderado', valor: 0.5 },
      { nombre: 'Alta', valor: 0.8 },
    ]);
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual([]);
  });

  // El error de tipeo mas probable: escribir 80 en vez de 0,8.
  it('rechaza un factor fuera de 0..1', () => {
    const v = validarEficacias([{ nombre: 'Alta', valor: 80 }]);
    expect(v.errores).toHaveLength(1);
    expect(v.errores[0]).toContain('entre 0 y 1');
  });

  it('avisa del 100 %: el residual queda en cero y el mapa deja de mostrarlos', () => {
    const v = validarEficacias([{ nombre: 'Total', valor: 1 }]);
    expect(v.errores).toEqual([]);
    expect(v.avisos[0]).toContain('deja de mostrarlos');
  });

  it('avisa del 0 %', () => {
    expect(validarEficacias([{ nombre: 'Nula', valor: 0 }]).avisos[0]).toContain('no reduce nada');
  });

  it('detecta nombres repetidos plegando la caja', () => {
    const v = validarEficacias([
      { nombre: 'Alta', valor: 0.8 },
      { nombre: 'alta', valor: 0.7 },
    ]);
    expect(v.errores.some((x) => x.includes('repetida'))).toBe(true);
  });
});

describe('validarMotivo', () => {
  it('exige motivo', () => {
    expect(validarMotivo('   ')).toContain('exige motivo');
  });

  it('rechaza uno demasiado corto para explicar nada', () => {
    expect(validarMotivo('ajuste')).toContain('demasiado corto');
  });

  it('acepta uno que explica', () => {
    expect(validarMotivo('El comité bajó el umbral de inaceptable en la sesión de febrero.')).toBeNull();
  });
});
