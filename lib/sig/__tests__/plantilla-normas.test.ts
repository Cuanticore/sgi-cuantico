// lib/sig/__tests__/plantilla-normas.test.ts
//
// El importador escribe en un catálogo NORMATIVO: los numerales son la referencia que citan
// las notas de auditoría. Así que los casos que importan son los que dejarían entrar un
// numeral mal formado, o los que ACTUALIZARÍAN en silencio un título que alguien ya auditó.

import { encabezadosValidos, leerNumerales, type Existente } from '../plantilla-normas';

const ENCABEZADO = ['Numeral', 'Título', 'Auditable'];

const YA_ESTAN: Existente[] = [
  { numeral: '4.1', titulo: 'Comprensión de la organización y su contexto', auditable: true },
  { numeral: '6.1', titulo: 'Planificación', auditable: true },
];

describe('encabezadosValidos', () => {
  it('acepta la plantilla', () => {
    expect(encabezadosValidos([ENCABEZADO])).toBe(true);
  });

  it('rechaza un libro cualquiera: importar la hoja equivocada es peor que no importar', () => {
    expect(encabezadosValidos([['Código', 'Nombre', 'Área']])).toBe(false);
    expect(encabezadosValidos([[]])).toBe(false);
    expect(encabezadosValidos([])).toBe(false);
  });
});

describe('leerNumerales', () => {
  it('lee una fila buena y la marca para agregar', () => {
    const r = leerNumerales([ENCABEZADO, ['8.1', 'Planificación y control operacional', 'Sí']], []);
    expect(r.listas).toBe(1);
    expect(r.conErrores).toBe(0);
    expect(r.filas[0]).toMatchObject({
      fila: 2,
      numeral: '8.1',
      titulo: 'Planificación y control operacional',
      auditable: true,
      decision: 'AGREGAR',
    });
  });

  // La forma del numeral es la clave del requisito dentro de la norma. Un «6,1» con coma
  // crearía un segundo requisito que nadie va a encontrar.
  it('rechaza un numeral que no tiene forma de numeral ISO', () => {
    for (const malo of ['6,1', '6.1.', 'seis', '6-1', 'A.5.1']) {
      const r = leerNumerales([ENCABEZADO, [malo, 'Un título', 'Sí']], []);
      expect(r.conErrores).toBe(1);
      expect(r.filas[0].errores.join(' ')).toContain('numeral ISO');
    }
  });

  it('acepta numerales de uno, dos y tres niveles', () => {
    const r = leerNumerales(
      [ENCABEZADO, ['4', 'Contexto', 'Sí'], ['4.2', 'Partes interesadas', 'Sí'], ['8.5.1', 'Control', 'Sí']],
      [],
    );
    expect(r.listas).toBe(3);
  });

  it('exige el título', () => {
    const r = leerNumerales([ENCABEZADO, ['7.5', '', 'Sí']], []);
    expect(r.filas[0].errores.join(' ')).toContain('título');
  });

  describe('la columna Auditable', () => {
    it('acepta las formas con que la gente escribe un sí y un no', () => {
      const si = ['Sí', 'si', 'X', 'true', '1', 'Auditable'];
      const no = ['No', 'false', '0', 'No auditable'];
      for (const v of si) {
        expect(leerNumerales([ENCABEZADO, ['9.1', 'Seguimiento', v]], []).filas[0].auditable).toBe(true);
      }
      for (const v of no) {
        expect(leerNumerales([ENCABEZADO, ['9.1', 'Seguimiento', v]], []).filas[0].auditable).toBe(false);
      }
    });

    it('vacío es auditable, que es el valor por defecto del modelo', () => {
      const r = leerNumerales([ENCABEZADO, ['9.1', 'Seguimiento', '']], []);
      expect(r.conErrores).toBe(0);
      expect(r.filas[0].auditable).toBe(true);
    });

    // Adivinar acá marcaría como auditable un numeral que alguien quiso excluir.
    it('un valor que no es ninguno de los dos NO se interpreta', () => {
      const r = leerNumerales([ENCABEZADO, ['9.1', 'Seguimiento', 'tal vez']], []);
      expect(r.conErrores).toBe(1);
      expect(r.filas[0].errores.join(' ')).toContain('tal vez');
    });
  });

  it('detecta el numeral repetido dentro del mismo libro, y dice en qué fila', () => {
    const r = leerNumerales(
      [ENCABEZADO, ['6.1', 'Planificación', 'Sí'], ['6.1', 'Otra cosa', 'Sí']],
      [],
    );
    expect(r.conErrores).toBe(1);
    expect(r.filas[1].errores.join(' ')).toContain('fila 2');
  });

  it('salta las filas vacías sin contarlas como error', () => {
    const r = leerNumerales(
      [ENCABEZADO, ['4.1', 'Contexto', 'Sí'], ['', '', ''], ['4.2', 'Partes', 'Sí']],
      [],
    );
    expect(r.filas).toHaveLength(2);
    expect(r.conErrores).toBe(0);
  });

  // Lo que separa este importador de uno que arruina un catálogo normativo: la vista previa
  // dice qué va a AGREGAR, qué va a ACTUALIZAR y qué ya está igual. Actualizar el título de
  // un numeral ya auditado reescribe la referencia de las notas que lo citan.
  describe('decisión contra lo que ya está en el catálogo', () => {
    it('un numeral nuevo se agrega', () => {
      const r = leerNumerales([ENCABEZADO, ['9.3', 'Revisión por la dirección', 'Sí']], YA_ESTAN);
      expect(r.filas[0].decision).toBe('AGREGAR');
      expect(r.agregar).toBe(1);
    });

    it('un numeral idéntico al que ya está no cambia nada', () => {
      const r = leerNumerales([ENCABEZADO, ['6.1', 'Planificación', 'Sí']], YA_ESTAN);
      expect(r.filas[0].decision).toBe('SIN_CAMBIO');
      expect(r.sinCambio).toBe(1);
      expect(r.actualizar).toBe(0);
    });

    it('un título distinto se marca para ACTUALIZAR, no se agrega en silencio', () => {
      const r = leerNumerales([ENCABEZADO, ['6.1', 'Planificación del SGSI', 'Sí']], YA_ESTAN);
      expect(r.filas[0].decision).toBe('ACTUALIZAR');
      expect(r.actualizar).toBe(1);
      expect(r.agregar).toBe(0);
    });

    it('cambiar sólo la auditabilidad también es una actualización', () => {
      const r = leerNumerales([ENCABEZADO, ['6.1', 'Planificación', 'No']], YA_ESTAN);
      expect(r.filas[0].decision).toBe('ACTUALIZAR');
    });
  });

  it('el orden sale de la posición en el libro: es el orden en que la norma enumera', () => {
    const r = leerNumerales(
      [ENCABEZADO, ['8.1', 'Uno', 'Sí'], ['4.1', 'Dos', 'Sí'], ['6.1', 'Tres', 'Sí']],
      [],
    );
    expect(r.filas.map((f) => f.orden)).toEqual([1, 2, 3]);
  });
});
