// lib/sig/__tests__/rango-http.test.ts
//
// Los bordes de `Range:` son la razón de que esto sea una función aparte. Un rango mal
// interpretado no falla: sirve los bytes equivocados, y el navegador muestra un video
// corrupto sin que nada avise — la misma forma de defecto que `scorm-tiempo.ts`.

import { analizarRango } from '../rango-http';

const MIL = 1000;

describe('analizarRango', () => {
  it('sin cabecera sirve el archivo completo', () => {
    expect(analizarRango(null, MIL)).toEqual({ clase: 'completo' });
    expect(analizarRango('', MIL)).toEqual({ clase: 'completo' });
  });

  it('un rango cerrado se toma tal cual', () => {
    expect(analizarRango('bytes=0-499', MIL)).toEqual({ clase: 'parcial', desde: 0, hasta: 499 });
    expect(analizarRango('bytes=500-999', MIL)).toEqual({ clase: 'parcial', desde: 500, hasta: 999 });
  });

  it('un rango abierto llega hasta el último byte', () => {
    expect(analizarRango('bytes=500-', MIL)).toEqual({ clase: 'parcial', desde: 500, hasta: 999 });
  });

  // `bytes=-500` son los ÚLTIMOS 500 bytes, no «del 0 al 500». Es el borde que más se
  // confunde, y confundirlo sirve el principio del archivo cuando el reproductor pidió el
  // final —donde vive el índice de un MP4 con `moov` al final—.
  it('un sufijo son los últimos N bytes', () => {
    expect(analizarRango('bytes=-500', MIL)).toEqual({ clase: 'parcial', desde: 500, hasta: 999 });
  });

  it('un sufijo más largo que el archivo se recorta al archivo entero', () => {
    expect(analizarRango('bytes=-5000', MIL)).toEqual({ clase: 'parcial', desde: 0, hasta: 999 });
  });

  it('un final más allá del archivo se recorta al último byte', () => {
    expect(analizarRango('bytes=900-5000', MIL)).toEqual({ clase: 'parcial', desde: 900, hasta: 999 });
  });

  it('un comienzo fuera del archivo es inatendible', () => {
    expect(analizarRango('bytes=1000-1500', MIL)).toEqual({ clase: 'inatendible' });
    expect(analizarRango('bytes=2000-', MIL)).toEqual({ clase: 'inatendible' });
  });

  it('un rango invertido es inatendible', () => {
    expect(analizarRango('bytes=500-100', MIL)).toEqual({ clase: 'inatendible' });
  });

  it('`bytes=-0` es inatendible', () => {
    expect(analizarRango('bytes=-0', MIL)).toEqual({ clase: 'inatendible' });
  });

  it('un archivo vacío no tiene ningún byte que satisfacer', () => {
    expect(analizarRango('bytes=0-0', 0)).toEqual({ clase: 'inatendible' });
    // Sin cabecera sigue siendo una respuesta completa, de cero bytes.
    expect(analizarRango(null, 0)).toEqual({ clase: 'completo' });
  });

  // Se responde el archivo entero en vez de `multipart/byteranges`: ningún reproductor lo
  // necesita para un curso, y el formato multiparte es superficie de error sin beneficio.
  it('varios rangos en una cabecera se sirven como archivo completo', () => {
    expect(analizarRango('bytes=0-99,200-299', MIL)).toEqual({ clase: 'completo' });
  });

  it('una unidad que no es bytes se ignora', () => {
    expect(analizarRango('items=0-10', MIL)).toEqual({ clase: 'completo' });
    expect(analizarRango('bytes=abc-def', MIL)).toEqual({ clase: 'completo' });
    expect(analizarRango('bytes=-', MIL)).toEqual({ clase: 'completo' });
  });
});
