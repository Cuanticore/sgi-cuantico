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
    // **El que sostiene la guarda `tamano === 0`.** El caso de arriba NO la pincha: lo
    // atrapa antes `desde >= tamano` (`0 >= 0`). La única rama donde el archivo vacío
    // produce un rango negativo es la del sufijo, porque calcula contra `tamano - 1`. Sin
    // este renglón se puede borrar la guarda y la suite queda verde, con la función
    // devolviendo `{ desde: 0, hasta: -1 }` — que aguas abajo es un `Content-Range` inválido.
    expect(analizarRango('bytes=-500', 0)).toEqual({ clase: 'inatendible' });
    // Sin cabecera sigue siendo una respuesta completa, de cero bytes.
    expect(analizarRango(null, 0)).toEqual({ clase: 'completo' });
  });

  // Los dos rangos de UN byte, que es donde se nota un off-by-one y donde no se nota en
  // ningún otro lado. Con `bytes=-500` sobre 1000 el resultado es `500-999`, donde `desde`
  // y el largo coinciden numéricamente y varias fórmulas erradas dan el mismo número; con
  // `-1` esa coincidencia no existe. Y `bytes=0-0` es lo que manda un reproductor para
  // sondear si el servidor soporta rangos antes de pedir nada en serio.
  it('un rango de un solo byte se calcula bien en los dos extremos', () => {
    expect(analizarRango('bytes=-1', MIL)).toEqual({ clase: 'parcial', desde: 999, hasta: 999 });
    expect(analizarRango('bytes=0-0', MIL)).toEqual({ clase: 'parcial', desde: 0, hasta: 0 });
  });

  // El ABNF del RFC 7233 §2.1 define `bytes-unit = "bytes"`, y los literales entre comillas
  // en ABNF son insensibles a mayúsculas por el RFC 5234 §2.3. Ningún cliente real lo manda
  // así, y la consecuencia de no aceptarlo sería benigna —un 200 con el archivo entero—,
  // pero cuesta un carácter y esta función existe para acertar en los bordes.
  it('la unidad no distingue mayúsculas', () => {
    expect(analizarRango('Bytes=0-499', MIL)).toEqual({ clase: 'parcial', desde: 0, hasta: 499 });
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
