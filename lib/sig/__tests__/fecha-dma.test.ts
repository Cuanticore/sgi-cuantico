// lib/sig/__tests__/fecha-dma.test.ts
//
// La conversión entre lo que se guarda (ISO `yyyy-mm-dd`) y lo que la persona ve y escribe
// (`dd/mm/aaaa`). Vive pura porque es una regla —qué fecha es válida— y una regla que sólo se
// comprueba tecleando en la pantalla termina sin comprobarse.
//
// Existe porque el `<input type="date">` nativo muestra el formato del IDIOMA DEL NAVEGADOR,
// no el del documento: en un equipo en inglés aparece `mm/dd/yyyy`, y quien escribe el día
// primero produce una fecha inválida que el navegador descarta en silencio. El campo quedaba
// vacío y «no guardaba» — no era un fallo de guardado, era una fecha que nunca se formó.

import { isoAdma, dmaAiso } from '../fecha-dma';

describe('isoAdma · de lo guardado a lo que se muestra', () => {
  it('reordena a día/mes/año', () => {
    expect(isoAdma('1990-05-20')).toBe('20/05/1990');
  });
  it('lo vacío se queda vacío', () => {
    expect(isoAdma('')).toBe('');
    expect(isoAdma('   ')).toBe('');
  });
  it('basura no revienta, devuelve vacío', () => {
    expect(isoAdma('no-es-fecha')).toBe('');
  });
});

describe('dmaAiso · de lo que se escribe a lo que se guarda', () => {
  it('una fecha completa se convierte a ISO', () => {
    expect(dmaAiso('20/05/1990')).toBe('1990-05-20');
  });
  it('admite día y mes de un solo dígito', () => {
    expect(dmaAiso('5/9/2001')).toBe('2001-09-05');
  });
  it('vacío es vacío (borrar la fecha es válido)', () => {
    expect(dmaAiso('')).toBe('');
    expect(dmaAiso('  ')).toBe('');
  });
  it('incompleto o con letras es null, no una fecha inventada', () => {
    expect(dmaAiso('20/05')).toBeNull();
    expect(dmaAiso('20/05/19')).toBeNull();
    expect(dmaAiso('aa/bb/cccc')).toBeNull();
  });
  it('un mes fuera de 1..12 es null', () => {
    expect(dmaAiso('10/13/2000')).toBeNull();
    expect(dmaAiso('10/00/2000')).toBeNull();
  });
  it('un día imposible para el mes es null', () => {
    expect(dmaAiso('31/04/2000')).toBeNull(); // abril tiene 30
    expect(dmaAiso('00/05/2000')).toBeNull();
  });
  // El 29 de febrero es la fecha que separa una validación de verdad de una que sólo cuenta
  // dígitos: existe en año bisiesto y no existe fuera de él.
  it('respeta los años bisiestos en febrero', () => {
    expect(dmaAiso('29/02/2020')).toBe('2020-02-29'); // bisiesto
    expect(dmaAiso('29/02/2021')).toBeNull(); // no bisiesto
  });
});
