// lib/sig/__tests__/catalogo-nivel-3.test.ts
//
// Qué ofrece el selector de Nivel 3 de la ficha del activo.
//
// **El defecto que este archivo existe para impedir:** el selector ofrecía únicamente los nodos
// que ya colgaban del Nivel 2 elegido. Bajo `PROYECTOS / INC`, que tiene dos hijos, un activo de
// código fuente no se podía clasificar sin salir de la ficha a crear el nodo en
// `/tecnologia/niveles` — aunque `CÓDIGO FUENTE` exista en otras nueve ramas y sea vocabulario
// corriente de la organización.
//
// Lo que se ofrece ahora son dos grupos: lo que ya cuelga de esta rama, y lo que el catálogo de
// la clase permite y esta rama todavía no tiene. El segundo grupo es el que faltaba.
//
// **La clase se deriva subiendo por `padreId`, no se lee del Nivel 2.** Los grados 2 y 3 no
// guardan clase justamente para que un hijo no pueda contradecir a su padre, y esa regla no se
// puede eludir acá sin reintroducir el problema en otro sitio.

import { opcionesDeNivel3 } from '../catalogo-nivel-3';
import type { Nivel } from '../niveles';

const nivel = (
  id: number,
  grado: number,
  nombre: string,
  padreId: number | null,
  extra: Partial<Nivel> = {},
): Nivel => ({ id, grado, nombre, padreId, clase: null, activo: true, ...extra });

/// El árbol mínimo que reproduce el caso real: dos ramas de PROYECTOS, una con código fuente y
/// otra sin él.
const ARBOL: Nivel[] = [
  nivel(3, 1, 'PROYECTOS', null, { clase: 'PROYECTOS' }),
  nivel(1, 1, 'EMPRESA', null, { clase: 'EMPRESA' }),
  // ILC, que sí tiene código fuente
  nivel(7, 2, 'ILC', 3),
  nivel(70, 3, 'CÓDIGO FUENTE', 7),
  nivel(71, 3, 'DEPENDENCIAS', 7),
  // INC, el del caso
  nivel(135, 2, 'INC', 3),
  nivel(136, 3, 'DOCUMENTACIÓN PRIVADA', 135),
  nivel(137, 3, 'DOCUMENTACIÓN CONFIDENCIAL', 135),
  // Un área de la empresa, para comprobar que el vocabulario no se mezcla entre clases
  nivel(14, 2, 'COMERCIAL', 1),
  nivel(140, 3, 'PERSONAS', 14),
];

const CATALOGO = [
  { clase: 'PROYECTOS' as const, nombre: 'CÓDIGO FUENTE', orden: 1 },
  { clase: 'PROYECTOS' as const, nombre: 'DEPENDENCIAS', orden: 2 },
  { clase: 'PROYECTOS' as const, nombre: 'DOCUMENTACIÓN PRIVADA', orden: 3 },
  { clase: 'PROYECTOS' as const, nombre: 'DOCUMENTACIÓN CONFIDENCIAL', orden: 4 },
  { clase: 'EMPRESA' as const, nombre: 'PERSONAS', orden: 1 },
  { clase: 'EMPRESA' as const, nombre: 'PUESTO DE TRABAJO', orden: 2 },
];

const nombres = (os: ReturnType<typeof opcionesDeNivel3>) => os.map((o) => o.nombre);
const delCatalogo = (os: ReturnType<typeof opcionesDeNivel3>) =>
  os.filter((o) => o.tipo === 'del-catalogo').map((o) => o.nombre);

describe('opcionesDeNivel3', () => {
  it('ofrece como DEL CATÁLOGO un nombre que existe en otra rama pero no en ésta', () => {
    // El caso que motivó todo: CÓDIGO FUENTE existe bajo ILC (#70) y no bajo INC.
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 135);

    expect(delCatalogo(opciones)).toContain('CÓDIGO FUENTE');
    // Y NO como existente: elegirlo tiene que crear un nodo propio de INC, no reutilizar el #70.
    expect(opciones.find((o) => o.nombre === 'CÓDIGO FUENTE')).toEqual({
      tipo: 'del-catalogo',
      nombre: 'CÓDIGO FUENTE',
    });
  });

  it('ofrece como EXISTENTES los nodos que ya cuelgan del Nivel 2, con su id', () => {
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 135);

    expect(opciones.filter((o) => o.tipo === 'existente')).toEqual([
      { tipo: 'existente', id: 136, nombre: 'DOCUMENTACIÓN PRIVADA' },
      { tipo: 'existente', id: 137, nombre: 'DOCUMENTACIÓN CONFIDENCIAL' },
    ]);
  });

  it('pone los existentes antes que los del catálogo', () => {
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 135);
    const ultimoExistente = opciones.map((o) => o.tipo).lastIndexOf('existente');
    const primeroDelCatalogo = opciones.map((o) => o.tipo).indexOf('del-catalogo');

    expect(ultimoExistente).toBeLessThan(primeroDelCatalogo);
  });

  it('no ofrece dos veces un nombre que ya existe en la rama', () => {
    // DOCUMENTACIÓN PRIVADA está en el catálogo Y cuelga de INC. Va una sola vez, como existente.
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 135);

    expect(nombres(opciones).filter((n) => n === 'DOCUMENTACIÓN PRIVADA')).toHaveLength(1);
    expect(delCatalogo(opciones)).not.toContain('DOCUMENTACIÓN PRIVADA');
  });

  it('compara por nombre NORMALIZADO, no literal', () => {
    // El árbol sin estandarizar guarda «Código fuente». El catálogo dice «CÓDIGO FUENTE». Son el
    // mismo nodo, y ofrecerlo dos veces sería pedirle a la persona que elija entre dos cosas
    // idénticas — que es el defecto que la estandarización arregla, no uno que se pueda agregar acá.
    const sinEstandarizar = [...ARBOL, nivel(200, 3, 'Código fuente', 135)];
    const opciones = opcionesDeNivel3(CATALOGO, sinEstandarizar, 135);

    expect(nombres(opciones).filter((n) => n.toUpperCase() === 'CÓDIGO FUENTE')).toHaveLength(1);
    expect(opciones).toContainEqual({ tipo: 'existente', id: 200, nombre: 'Código fuente' });
  });

  it('ofrece el vocabulario de la clase de la RAÍZ, no el de todas', () => {
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 135);

    // PERSONAS y PUESTO DE TRABAJO son de EMPRESA; INC cuelga de PROYECTOS.
    expect(nombres(opciones)).not.toContain('PERSONAS');
    expect(nombres(opciones)).not.toContain('PUESTO DE TRABAJO');
  });

  it('deriva la clase subiendo por padreId, no la lee del Nivel 2', () => {
    // COMERCIAL (#14) no guarda clase — los grados 2 y 3 nunca la guardan. Si se leyera de ahí,
    // este caso devolvería el catálogo vacío en vez del de EMPRESA.
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 14);

    expect(delCatalogo(opciones)).toEqual(['PUESTO DE TRABAJO']);
  });

  it('sin Nivel 2 elegido no ofrece nada', () => {
    expect(opcionesDeNivel3(CATALOGO, ARBOL, null)).toEqual([]);
  });

  it('en una rama huérfana ofrece sólo los existentes, sin adivinar el vocabulario', () => {
    // El Nivel 2 #900 cuelga de un padre que no existe: `claseDeNivel` devuelve null. Ofrecer el
    // catálogo de PRODUCTOS «porque suele ser ése» escondería la rama rota, que es lo que hay
    // que ver.
    const roto = [...ARBOL, nivel(900, 2, 'HUÉRFANO', 999), nivel(901, 3, 'DEPENDENCIAS', 900)];
    const opciones = opcionesDeNivel3(CATALOGO, roto, 900);

    expect(opciones).toEqual([{ tipo: 'existente', id: 901, nombre: 'DEPENDENCIAS' }]);
  });

  it('no ofrece los nodos inactivos entre los existentes', () => {
    // `asignarNivelAActivo` rechaza un nivel inactivo, así que ofrecerlo sería ofrecer un camino
    // que el servidor va a negar.
    const conInactivo = [...ARBOL, nivel(300, 3, 'DEPENDENCIAS', 135, { activo: false })];
    const opciones = opcionesDeNivel3(CATALOGO, conInactivo, 135);

    expect(opciones).not.toContainEqual({ tipo: 'existente', id: 300, nombre: 'DEPENDENCIAS' });
  });

  it('un nodo inactivo NO bloquea el mismo nombre del catálogo', () => {
    // Si alguien desactivó DEPENDENCIAS bajo INC, el nombre tiene que poder volver a ofrecerse.
    const conInactivo = [...ARBOL, nivel(300, 3, 'DEPENDENCIAS', 135, { activo: false })];

    expect(delCatalogo(opcionesDeNivel3(CATALOGO, conInactivo, 135))).toContain('DEPENDENCIAS');
  });

  it('respeta el orden del catálogo', () => {
    const opciones = opcionesDeNivel3(CATALOGO, ARBOL, 135);

    expect(delCatalogo(opciones)).toEqual(['CÓDIGO FUENTE', 'DEPENDENCIAS']);
  });

  it('ofrece los existentes aunque no estén en el catálogo', () => {
    // Un nodo creado antes de que existiera el catálogo, o retirado del vocabulario después. Se
    // sigue ofreciendo: el activo que hoy apunta ahí tiene que poder seguir apuntando.
    const conAjeno = [...ARBOL, nivel(400, 3, 'NOMBRE RETIRADO', 135)];
    const opciones = opcionesDeNivel3(CATALOGO, conAjeno, 135);

    expect(opciones).toContainEqual({ tipo: 'existente', id: 400, nombre: 'NOMBRE RETIRADO' });
  });
});
