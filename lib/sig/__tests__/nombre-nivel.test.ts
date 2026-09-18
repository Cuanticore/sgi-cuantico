// lib/sig/__tests__/nombre-nivel.test.ts
//
// La regla de identidad de un nivel, en un solo lugar.
//
// Hoy la identidad de un nivel es su nombre LITERAL: `consolidado-carga.ts:408` e
// `importar.ts:282` lo buscan con `findFirst({ grado, nombre, padreId })`, igualdad exacta.
// Por eso `PRODUCTOS` y `Productos` son dos ramas distintas del árbol del inventario, y por
// eso una carga que escriba la celda en otra caja duplica la rama en vez de encontrarla.
//
// Este módulo es la regla que los tres escritores van a compartir. Que viva en un solo sitio
// es el punto: tres copias de la misma regla se separan, y la que se queda corta sigue
// dando verde.
//
// **Las tildes se conservan a propósito.** `CÓDIGO` y `CODIGO` siguen siendo dos nombres
// distintos hasta que la auditoría diga cuántas fusiones costaría unirlos: esa decisión se
// toma con el número, no por gusto.

import { normalizarNombreNivel } from '../nombre-nivel';

describe('normalizarNombreNivel', () => {
  test('pasa el nombre a mayúscula', () => {
    expect(normalizarNombreNivel('Productos')).toBe('PRODUCTOS');
  });

  test('recorta los espacios de los bordes', () => {
    expect(normalizarNombreNivel('  MINTRACE  ')).toBe('MINTRACE');
  });

  test('colapsa los espacios internos repetidos', () => {
    expect(normalizarNombreNivel('codigo    fuente')).toBe('CODIGO FUENTE');
  });

  test('trata los tabuladores y saltos como espacio', () => {
    expect(normalizarNombreNivel('codigo\tfuente')).toBe('CODIGO FUENTE');
  });

  test('es idempotente: normalizar lo ya normalizado no cambia nada', () => {
    const una = normalizarNombreNivel('  Ambientes de   Pruebas ');
    expect(normalizarNombreNivel(una)).toBe(una);
  });

  test('conserva las tildes, porque esa decisión todavía no está tomada', () => {
    expect(normalizarNombreNivel('Código Fuente')).toBe('CÓDIGO FUENTE');
  });

  test('una cadena de solo espacios queda vacía', () => {
    expect(normalizarNombreNivel('   ')).toBe('');
  });

  test('la ñ sube a mayúscula sin romperse', () => {
    expect(normalizarNombreNivel('diseño')).toBe('DISEÑO');
  });
});
