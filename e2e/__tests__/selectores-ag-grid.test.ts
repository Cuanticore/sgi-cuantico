// e2e/__tests__/selectores-ag-grid.test.ts
//
// Que los selectores `.ag-*` del recorrido existan en el AG Grid INSTALADO.
//
// POR QUÉ EXISTE ESTE ARCHIVO. El 21/09/2026, `e2e/analisis-riesgos.spec.ts` se escribió con
// tres nombres de clase de una versión anterior de AG Grid:
//
//     .ag-body-viewport              · no existe con `domLayout="autoHeight"`
//     .ag-pinned-left-header         · nombre viejo
//     .ag-pinned-left-cols-container · nombre viejo
//
// Cada uno se descubrió en una corrida distinta del recorrido, y cada corrida cuesta minutos:
// levantar el servidor, acuñar la sesión, navegar. Peor, el fallo no dice «esa clase no
// existe»: dice que el paso se colgó 120 s esperando un elemento. Tres diagnósticos desde cero
// para el mismo error de fondo.
//
// Y el error de fondo tiene nombre: **se escribió contra la librería que se recordaba, no
// contra la que está instalada.** Es lo mismo que `AGENTS.md` advierte de este Next —«esta no
// es la versión que conoces, lee la documentación del paquete»— aplicado a otra dependencia.
//
// Así que el chequeo baja de minutos a milisegundos y de tres corridas a una: se leen los
// selectores del spec y se buscan en el paquete instalado. Es el mismo criterio con el que
// `lib/__tests__/use-server.test.ts` convirtió un fallo de despliegue en una prueba de
// milisegundos sobre el propio código fuente.
//
// LO QUE ESTA PRUEBA NO HACE: afirmar que el selector encuentre algo en la pantalla. Que la
// clase exista en la librería no significa que esté en el DOM de esta configuración — eso sólo
// lo sabe el navegador, y por eso el recorrido sigue existiendo. Lo que esto ataja es el caso
// barato: un nombre que ya no existe en ninguna parte.
//
// Y HAY UNA FORMA CONCRETA DE ESA FRONTERA QUE COSTÓ OTRA CORRIDA, así que se nombra:
// **un selector compuesto puede pasar esta prueba y fallar en el DOM.** El paso 6 decía
// `.ag-root-wrapper.ag-has-left-pinned-cols` y daba cero elementos. Las dos clases existen en
// el paquete —esta prueba pasaba, y tenía razón en pasar—, pero viven en `div` distintos:
// `ag-root-wrapper` es el de afuera y `ag-has-left-pinned-cols` está en `ag-root`, su hijo.
//
// Un compuesto afirma ESTRUCTURA, y la estructura no está en la lista de clases del paquete.
// Por eso abajo hay una regla que los prohíbe en este spec: cuando lo que se quiere afirmar es
// un hecho —«hay columnas fijadas»— la clase sola lo dice y además sobrevive a que la librería
// mueva el atributo de nodo.

import fs from 'fs';
import path from 'path';

const SPEC = path.join(process.cwd(), 'e2e/analisis-riesgos.spec.ts');
const BUNDLE = path.join(
  process.cwd(),
  'node_modules/ag-grid-community/dist/package/main.cjs.js',
);

/// Las clases `ag-*` que el recorrido usa como selector.
///
/// Se leen del texto del spec y no de una lista escrita a mano: una lista a mano se desactualiza
/// en cuanto alguien agregue un paso, y entonces la prueba diría que todo está bien sobre un
/// selector que nunca miró.
function clasesDelSpec(): string[] {
  const fuente = fs.readFileSync(SPEC, 'utf8');
  // FUERA LOS COMENTARIOS, y sólo entonces las cadenas.
  //
  // Los dos pasos hacen falta, y el orden importa. El spec menciona las tres clases obsoletas
  // en sus comentarios, justamente para explicar que no existen — y las escribe entre acentos
  // graves, que para un extractor de cadenas son comillas. Mirar sólo «dentro de comillas» las
  // recogía igual, y esta prueba fallaba sobre su propia documentación.
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const enCadenas = sinComentarios.match(/(['"`])[^'"`\n]*\1/g) ?? [];
  const clases = enCadenas.flatMap((cadena) => cadena.match(/\.ag-[a-z0-9-]+/g) ?? []);
  return [...new Set(clases.map((c) => c.slice(1)))].sort();
}

/// Las clases que el paquete instalado emite de verdad.
///
/// Se extraen a un conjunto en vez de buscar cada nombre dentro de los 5 MB del bundle: con
/// `toContain` sobre la cadena entera, un fallo imprime el paquete completo y el rojo se vuelve
/// ilegible — que es otra forma de que una prueba deje de servir.
function clasesDelPaquete(): Set<string> {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  return new Set(bundle.match(/ag-[a-z0-9-]+/g) ?? []);
}

describe('los selectores del recorrido existen en el AG Grid instalado', () => {
  const delPaquete = clasesDelPaquete();
  const clases = clasesDelSpec();

  it('el spec usa al menos un selector de AG Grid, o esta prueba no está mirando nada', () => {
    expect(clases.length).toBeGreaterThan(3);
  });

  it.each(clases)('«%s» existe en ag-grid-community', (clase) => {
    expect(delPaquete.has(clase)).toBe(true);
  });

  // LA REGLA QUE SALIÓ DE LA CUARTA CORRIDA: nada de selectores compuestos sobre clases de AG
  // Grid en este spec.
  //
  // `.ag-a.ag-b` afirma que las dos clases están en el MISMO elemento, y eso es una afirmación
  // sobre el árbol que esta prueba no puede verificar —las dos clases pueden existir y estar en
  // nodos distintos, que es exactamente lo que pasó—. Una clase sola afirma un hecho, cuesta lo
  // mismo de escribir, y sobrevive a que la librería mueva el atributo de sitio.
  //
  // Si algún día hace falta un compuesto de verdad, la salida no es borrar esta prueba: es
  // comprobarlo en el navegador y dejar escrito por qué el hecho suelto no alcanzaba.
  it('ningún selector compuesto de clases AG: afirman estructura que esto no puede ver', () => {
    const fuente = fs
      .readFileSync(SPEC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const compuestos = fuente.match(/\.ag-[a-z0-9-]+\.ag-[a-z0-9-]+/g) ?? [];
    expect(compuestos).toEqual([]);
  });

  // Las tres que costaron una corrida del recorrido cada una. Se nombran explícitamente para
  // que, si alguien las reintroduce «arreglando» un selector de memoria, el rojo diga qué pasó
  // en vez de limitarse a no encontrarlas.
  it('y ninguna de las tres clases obsoletas volvió al spec', () => {
    const obsoletas = ['ag-body-viewport', 'ag-pinned-left-header', 'ag-pinned-left-cols-container'];
    for (const vieja of obsoletas) {
      // Primero se confirma que siguen sin existir: el día que AG Grid las reintroduzca, esto
      // avisa de que la prohibición dejó de tener sentido.
      expect(delPaquete.has(vieja)).toBe(false);
      expect(clases).not.toContain(vieja);
    }
  });
});
