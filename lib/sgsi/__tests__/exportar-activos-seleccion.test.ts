// lib/sgsi/__tests__/exportar-activos-seleccion.test.ts
//
// LA COSTURA ENTRE LA PANTALLA Y LA RUTA DE EXPORTACIÓN, probada como una sola cosa.
//
// El defecto que esta prueba existe para cerrar (2026-09-21, en producción):
//
//   1. Filtra el inventario a cero resultados —basta buscar algo que no exista—.
//   2. La pantalla dice «0 activos».
//   3. Clic en «Exportar a Excel».
//   4. Se baja «FOR-SIG-12 Inventario de activos de información» con los 378.
//
// Medido contra la aplicación corriendo antes del arreglo: 378 filas en «Matriz de Activos»,
// con un caso de control de un solo código que daba 1.
//
// NINGUNA DE LAS DOS PIEZAS ESTABA MAL. El cliente armaba bien su lista vacía —`[].join(',')`
// es `''`— y omitía el parámetro; la ruta trataba razonablemente «sin códigos» como «sin
// filtro», que es su comportamiento documentado de un clic. El defecto vivía ENTRE las dos: el
// cliente convertía «cero filas» en «sin filtro», que son cosas opuestas.
//
// POR ESO ESTA PRUEBA NO PRUEBA CADA MITAD POR SEPARADO. Una prueba del cliente que verifique
// que manda la lista vacía, y otra de la ruta que verifique qué hace con ella, pueden estar las
// dos en verde con el defecto vivo — es exactamente el error que lo produjo. Lo que se ejerce
// acá es la composición: lo que el cliente produce, leído por lo que el servidor consulta.

import {
  PARAM_CODIGOS,
  codigosExportables,
  filtroDeActivos,
  pedidoDesdeParametros,
  urlDeExportacion,
} from '../exportar-activos-seleccion';

/// El recorrido entero, del clic a la consulta, sin navegador y sin base: lo que el cliente
/// arma con estas filas visibles y lo que el servidor terminaría consultando con eso.
function delClicALaConsulta(filas: { codigo: string }[]): {
  url: string | null;
  where: { codigo?: { in: string[] } } | null;
} {
  const url = urlDeExportacion(codigosExportables(filas));
  // Si el cliente no produce URL es porque no hay petición: no hay consulta que hacer.
  if (url === null) return { url: null, where: null };
  const params = new URL(url, 'http://localhost').searchParams;
  return { url, where: filtroDeActivos(pedidoDesdeParametros(params)) };
}

describe('la costura · cero filas visibles no puede terminar exportando el inventario entero', () => {
  it('con cero filas no hay URL, así que no hay exportación', () => {
    const { url, where } = delClicALaConsulta([]);
    expect(url).toBeNull();
    expect(where).toBeNull();
  });

  it('y si alguien llama a la ruta con la selección vacía, no selecciona TODO', () => {
    // La segunda barrera, y no sobra: la primera vive en el cliente, y la ruta la puede
    // llamar cualquiera. `{}` como `where` es exactamente el defecto — significa «todo lo
    // activo». Lo correcto para una selección vacía es una selección vacía.
    const where = filtroDeActivos(pedidoDesdeParametros(new URLSearchParams(`${PARAM_CODIGOS}=`)));
    expect(where).toEqual({ codigo: { in: [] } });
    expect(where).not.toEqual({});
  });

  it('con filas, lo que el cliente manda es exactamente lo que el servidor consulta', () => {
    const { where } = delClicALaConsulta([{ codigo: 'TEC-SER-0001' }, { codigo: 'FIN-APP-0002' }]);
    expect(where).toEqual({ codigo: { in: ['TEC-SER-0001', 'FIN-APP-0002'] } });
  });

  it('un código con coma o espacio sobrevive el viaje de ida y vuelta', () => {
    // La lista viaja separada por comas: si un código llevara una, la ruta la partiría en dos
    // y exportaría activos que nadie pidió. Hoy no ocurre, y la prueba es lo que lo sostiene.
    const { where } = delClicALaConsulta([{ codigo: ' TEC-SER-0001 ' }]);
    expect(where).toEqual({ codigo: { in: ['TEC-SER-0001'] } });
  });
});

describe('pedidoDesdeParametros · las tres cosas que la ruta puede recibir', () => {
  // ESTA RAMA NO TIENE CONSUMIDOR EN LA INTERFAZ, Y ES A PROPÓSITO.
  //
  // Después del arreglo, la pantalla manda el parámetro siempre que hay filas y no llama
  // cuando no las hay, así que a `todo` sólo se llega escribiendo la URL a mano. Se conserva
  // porque es el comportamiento que la ruta documenta desde que existe y quitarlo rompería a
  // quien la llame así; se fija con una prueba porque a una rama sin consumidor le pasa una
  // de dos cosas: alguien la borra «limpiando», o alguien la ensancha sin ver que es la
  // puerta por la que sale el inventario entero.
  //
  // La otra mitad de esa protección es que `ninguno` NO caiga acá — ver la costura, arriba.
  it('sin el parámetro es «todo»: deliberado, documentado, y sólo alcanzable a mano', () => {
    expect(pedidoDesdeParametros(new URLSearchParams(''))).toEqual({ clase: 'todo' });
    expect(filtroDeActivos({ clase: 'todo' })).toEqual({});
  });

  it('el parámetro presente y vacío es «ninguno», que NO es lo mismo', () => {
    expect(pedidoDesdeParametros(new URLSearchParams(`${PARAM_CODIGOS}=`))).toEqual({
      clase: 'ninguno',
    });
  });

  it('el parámetro con códigos es «algunos»', () => {
    expect(pedidoDesdeParametros(new URLSearchParams(`${PARAM_CODIGOS}=A-1,B-2`))).toEqual({
      clase: 'algunos',
      codigos: ['A-1', 'B-2'],
    });
  });

  it('una lista que sólo trae separadores es «ninguno», no «todo»', () => {
    expect(pedidoDesdeParametros(new URLSearchParams(`${PARAM_CODIGOS}=,,`))).toEqual({
      clase: 'ninguno',
    });
  });
});

describe('codigosExportables · los activos sin código', () => {
  it('descarta el marcador «(sin código)», que no identifica a nadie', () => {
    expect(codigosExportables([{ codigo: 'A-1' }, { codigo: '(sin código)' }])).toEqual(['A-1']);
  });

  it('si NINGUNA fila visible tiene código, tampoco hay nada que exportar', () => {
    // Es el otro camino al mismo sitio: la pantalla muestra filas, pero ninguna se puede
    // nombrar en la URL. Antes, eso también terminaba en «exporta todo».
    const { url, where } = delClicALaConsulta([{ codigo: '(sin código)' }]);
    expect(url).toBeNull();
    expect(where).toBeNull();
  });
});
