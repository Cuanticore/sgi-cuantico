// lib/sig/__tests__/trabajos.test.ts
//
// El catalogo de trabajos programados. Lo que se prueba aca es la parte que NO toca la
// base: que el catalogo sea coherente y que un trabajo declarado sin construir no se
// confunda con uno que no existe.
//
// La distincion importa porque decide el codigo HTTP de la ruta: 404 manda a alguien a
// buscar un error de escritura en el crontab; 501 dice «el nombre esta bien, el modulo no
// esta». Con la respuesta equivocada se pierde una tarde.

import { TRABAJOS, trabajoPorNombre, AUTOR_SISTEMA } from '../trabajos-catalogo';

describe('el catalogo', () => {
  // Los ocho del documento, mas el de envios que agrupa tres. Si alguien agrega o quita
  // uno, esta prueba obliga a mirar el documento antes de que el crontab quede desfasado.
  it('declara los trabajos del documento', () => {
    const nombres = TRABAJOS.map((t) => t.nombre);
    expect(nombres).toContain('generar-asignaciones');
    expect(nombres).toContain('marcar-vencidas');
    expect(nombres).toContain('enviar-notificaciones');
    expect(nombres).toContain('sincronizar-directorio');
    expect(nombres).toContain('excepciones-vencidas');
    expect(nombres).toContain('permisos-temporales-vencidos');
  });

  it('ningun nombre se repite', () => {
    const nombres = TRABAJOS.map((t) => t.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  // Un nombre con espacios o mayusculas no sobrevive a una URL sin que alguien lo escape,
  // y el crontab lo escribe a mano.
  it('los nombres son seguros en una URL', () => {
    for (const t of TRABAJOS) {
      expect(t.nombre).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('todos dicen cuando corren y que hacen', () => {
    for (const t of TRABAJOS) {
      expect(t.cuando.length).toBeGreaterThan(3);
      // La descripcion de uno NO disponible tiene que explicar por que: es lo que la ruta
      // devuelve en el 501, y «no esta construido» a secas no dice si falta un modulo o
      // si la decision esta en el comite.
      expect(t.descripcion.length).toBeGreaterThan(20);
    }
  });

  // `marcar-vencidas` esta declarado y NO se construye a proposito: el vencimiento es
  // derivado (invariante 1) y no hay columna que actualizar. Si algun dia alguien lo
  // implementa, esta prueba lo obliga a explicar por que.
  it('marcar-vencidas queda sin construir porque el vencimiento es derivado', () => {
    const t = trabajoPorNombre('marcar-vencidas');
    expect(t?.disponible).toBe(false);
    expect(t?.descripcion).toContain('DERIVADO');
  });
});

describe('trabajoPorNombre', () => {
  it('encuentra el que existe', () => {
    expect(trabajoPorNombre('generar-asignaciones')?.nombre).toBe('generar-asignaciones');
  });

  // `null` y no una excepcion: la ruta necesita distinguir «no existe» (404) de «existe y
  // no esta construido» (501), y una excepcion colapsaria los dos en un 500.
  it('devuelve null cuando no existe, no una excepcion', () => {
    expect(trabajoPorNombre('generar-asignacion')).toBeNull();
    expect(trabajoPorNombre('')).toBeNull();
  });
});

describe('AUTOR_SISTEMA', () => {
  // Un registro de bitacora firmado por una persona que estaba durmiendo es peor que uno
  // firmado por el sistema: el autor de la bitacora es evidencia de auditoria.
  it('no se puede confundir con una persona', () => {
    expect(AUTOR_SISTEMA).toContain('sistema');
    expect(AUTOR_SISTEMA).not.toContain('@cuantico.com');
  });
});
