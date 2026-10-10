/**
 * @jest-environment node
 */

// lib/api/__tests__/paginacion.test.ts
//
// **Tarea 3.3 · paginación estable, ordenada por clave natural y no por `id`.**
//
// POR QUÉ NO SE PAGINA POR DESPLAZAMIENTO. `?pagina=3&tamano=50` parece más simple y se
// rompe sola: si entre la página 2 y la 3 alguien da de alta un sistema, todo se corre un
// lugar y el cliente LEE UNA FILA DOS VECES o se salta otra. Un agente que recorra el
// expediente completo para generar el FOR-TEC-04 no tiene cómo notarlo: recibe 200 y datos
// con buena pinta.
//
// Un cursor sobre la clave natural no tiene ese problema. «Dame lo que viene después de
// `SIS-012`» significa lo mismo antes y después del alta, porque no depende de cuántas filas
// haya delante.
//
// POR QUÉ POR CLAVE NATURAL Y NO POR `id`. `Sistema.codigo` es estable y lo conoce quien
// consume la API —es lo que escribe en su `.sgi/sistema.yml`—; `id` es un autoincremental que
// no significa nada afuera y que ata al cliente a un detalle de la base. Además el orden por
// `id` es el orden de creación, que no es el orden en que nadie quiere leer un expediente.
//
// LO QUE SE PRUEBA:
//
//   1. los límites se validan y se dicen con su nombre, no se recortan en silencio;
//   2. pedir una página de N devuelve N y un cursor; la última no devuelve cursor;
//   3. **el cursor apunta a la última fila ENTREGADA**, no a la siguiente. Si apuntara a la
//      siguiente y esa fila se borrara, el recorrido se detendría a mitad;
//   4. un alta en medio del recorrido no duplica ni se salta filas.

import { armarPagina, leerPaginacion, LIMITE_MAXIMO, LIMITE_POR_DEFECTO } from '../paginacion';

function url(consulta: string): URL {
  return new URL(`http://x/api/v1/sistemas${consulta}`);
}

describe('leer los parámetros de paginación', () => {
  it('sin parámetros usa el límite por defecto y arranca desde el principio', () => {
    expect(leerPaginacion(url(''))).toEqual({ ok: true, limite: LIMITE_POR_DEFECTO, desde: null });
  });

  it('acepta un límite dentro del rango', () => {
    expect(leerPaginacion(url('?limite=10'))).toEqual({ ok: true, limite: 10, desde: null });
  });

  it('acepta un cursor', () => {
    expect(leerPaginacion(url('?desde=SIS-012'))).toEqual({
      ok: true,
      limite: LIMITE_POR_DEFECTO,
      desde: 'SIS-012',
    });
  });

  it.each([
    ['0', 'cero'],
    ['-5', 'negativo'],
    [String(LIMITE_MAXIMO + 1), 'por encima del tope'],
    ['muchos', 'que no es un número'],
    ['10.5', 'fraccionario'],
  ])('rechaza el límite %s (%s) nombrando el parámetro', (valor) => {
    const r = leerPaginacion(url(`?limite=${valor}`));

    expect(r.ok).toBe(false);
    // Recortar en silencio —devolver 100 cuando pidieron 5000— es peor que fallar: el cliente
    // cree que recibió todo y arma su recorrido sobre una suposición falsa.
    if (!r.ok) expect(r.detalle).toContain('limite');
  });

  it('un cursor vacío se trata como ausente, no como un código válido', () => {
    // `?desde=` sale solo de un cliente que concatena mal su URL. Tratarlo como un código
    // existente devolvería cero filas y parecería un expediente vacío.
    expect(leerPaginacion(url('?desde='))).toEqual({
      ok: true,
      limite: LIMITE_POR_DEFECTO,
      desde: null,
    });
  });
});

describe('armar la página', () => {
  const filas = (...codigos: string[]) => codigos.map((codigo) => ({ codigo, nombre: 'x' }));

  it('devuelve exactamente el límite pedido y un cursor cuando hay más', () => {
    // La ruta pide `limite + 1` para saber si hay siguiente SIN una segunda consulta de
    // conteo, que sobre una tabla grande cuesta más que la página misma.
    const pagina = armarPagina(filas('SIS-001', 'SIS-002', 'SIS-003'), 2, (f) => f.codigo);

    expect(pagina.datos.map((d) => d.codigo)).toEqual(['SIS-001', 'SIS-002']);
    expect(pagina.siguiente).toBe('SIS-002');
  });

  it('la última página no devuelve cursor', () => {
    const pagina = armarPagina(filas('SIS-001', 'SIS-002'), 2, (f) => f.codigo);

    expect(pagina.datos).toHaveLength(2);
    // `null` y no una cadena vacía: el cliente para cuando esto es falsy, y una cadena vacía
    // también lo es, pero un `''` enviado de vuelta como `?desde=` es otra petición.
    expect(pagina.siguiente).toBeNull();
  });

  it('una página vacía no devuelve cursor', () => {
    expect(armarPagina([], 10, (f: { codigo: string }) => f.codigo)).toEqual({
      datos: [],
      siguiente: null,
    });
  });

  it('el cursor apunta a la última fila ENTREGADA, no a la siguiente', () => {
    // Si apuntara a la siguiente y esa fila se diera de baja antes de la petición siguiente,
    // el recorrido se detendría a mitad del expediente sin decir por qué.
    const pagina = armarPagina(filas('SIS-001', 'SIS-002', 'SIS-003'), 2, (f) => f.codigo);

    expect(pagina.siguiente).toBe(pagina.datos[pagina.datos.length - 1].codigo);
  });
});

describe('el recorrido completo sobrevive a un alta en el medio', () => {
  it('no duplica ni se salta filas', () => {
    // El caso que mata a la paginación por desplazamiento. Acá el cursor es un código, no una
    // posición, así que insertar `SIS-0015` entre medias no corre nada.
    const antes = [{ codigo: 'SIS-001' }, { codigo: 'SIS-002' }, { codigo: 'SIS-003' }];
    const primera = armarPagina(antes, 2, (f) => f.codigo);

    expect(primera.datos.map((d) => d.codigo)).toEqual(['SIS-001', 'SIS-002']);

    // Alguien da de alta `SIS-0015`, que ordena entre la 001 y la 002.
    const despues = [
      { codigo: 'SIS-001' },
      { codigo: 'SIS-0015' },
      { codigo: 'SIS-002' },
      { codigo: 'SIS-003' },
    ];
    // La ruta consultaría `codigo > 'SIS-002'`; acá se simula ese filtro.
    const resto = despues.filter((f) => f.codigo > primera.siguiente!);
    const segunda = armarPagina(resto, 2, (f) => f.codigo);

    expect(segunda.datos.map((d) => d.codigo)).toEqual(['SIS-003']);
    // `SIS-001` y `SIS-002` no se repiten, y `SIS-003` no se pierde. `SIS-0015` queda fuera
    // porque nació detrás del cursor: eso es correcto y es el precio conocido de un cursor.
    expect(segunda.datos.map((d) => d.codigo)).not.toContain('SIS-002');
  });
});
