// lib/sgsi/__tests__/responsables-v19.test.ts
//
// Las tres traducciones de H-19, y por qué son una decisión y no cableado.
//
// El libro V19 escribe en las columnas de responsable tres valores que NO son cargos:
// «Cada usuario», «External Legal Counsel» y «Cliente». El importador resuelve el cargo por
// nombre, no lo encuentra, y deja la casilla en null avisando — que es la conducta correcta
// para un valor desconocido y la equivocada para un valor conocido que se llama distinto.
//
// Esta tabla es lo que convierte el segundo caso en el primero. Vive en un módulo puro
// porque la llaman DOS: el importador (REQ-SIG-18 §15.6) y la corrección de los registros ya
// cargados (§15.5 Ruta B). Si cada uno tuviera la suya, corregir la base y reimportar darían
// resultados distintos, que es exactamente el defecto que §15.6 viene a cerrar.

import {
  SINONIMOS_RESPONSABLE,
  esResponsableGenerico,
  traducirResponsable,
} from '../responsables-v19';

describe('traducirResponsable', () => {
  // §15.3 · los tres de H-19, con el cargo real al que van.
  it('traduce los tres roles genéricos de H-19', () => {
    expect(traducirResponsable('Cada usuario')).toEqual({
      nombre: 'Operations & Services Manager',
      original: 'Cada usuario',
    });
    expect(traducirResponsable('External Legal Counsel')).toEqual({
      nombre: 'Chief Legal Officer',
      original: 'External Legal Counsel',
    });
    expect(traducirResponsable('Cliente')).toEqual({
      nombre: 'Chief Operating Officer',
      original: 'Cliente',
    });
  });

  // El importador compara con `localeCompare(…, 'es', { sensitivity: 'base' })`, así que la
  // tabla tiene que ser igual de tolerante o una celda escrita «CLIENTE» se escaparía.
  it('ignora caso y acentos, igual que el resolutor del importador', () => {
    expect(traducirResponsable('cada usuario').nombre).toBe('Operations & Services Manager');
    expect(traducirResponsable('  CLIENTE  ').nombre).toBe('Chief Operating Officer');
  });

  // Lo que no está en la tabla pasa intacto y SIN marca de traducción: el importador tiene
  // que seguir avisando de un valor que de verdad no conoce.
  it('deja pasar sin marca lo que no es un sinónimo', () => {
    expect(traducirResponsable('Chief Operating Officer')).toEqual({
      nombre: 'Chief Operating Officer',
      original: null,
    });
    expect(traducirResponsable('Architecture and Technology Manager').original).toBe(null);
  });

  it('la cadena vacía no se traduce', () => {
    expect(traducirResponsable('')).toEqual({ nombre: '', original: null });
  });

  // Un cargo del catálogo NO puede estar como clave de la tabla: traduciría un valor válido.
  it('ninguna clave de la tabla es un cargo real', () => {
    for (const generico of Object.keys(SINONIMOS_RESPONSABLE)) {
      expect(esResponsableGenerico(generico)).toBe(true);
    }
  });
});

describe('esResponsableGenerico', () => {
  it('reconoce los tres, sin importar el caso', () => {
    expect(esResponsableGenerico('Cada usuario')).toBe(true);
    expect(esResponsableGenerico('cliente')).toBe(true);
    expect(esResponsableGenerico('Chief Legal Officer')).toBe(false);
  });
});
