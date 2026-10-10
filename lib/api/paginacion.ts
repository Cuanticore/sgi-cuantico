import 'server-only';

// lib/api/paginacion.ts
//
// **Tarea 3.3 · paginación estable, ordenada por clave natural y no por `id`.**
//
// POR QUÉ NO SE PAGINA POR DESPLAZAMIENTO. `?pagina=3&tamano=50` parece más simple y se rompe
// sola: si entre la página 2 y la 3 alguien da de alta un sistema, todo se corre un lugar y el
// cliente lee una fila dos veces o se salta otra. Un agente que recorra el expediente completo
// para generar el FOR-TEC-04 no tiene cómo notarlo — recibe 200 y datos con buena pinta.
//
// Un cursor sobre la clave natural no tiene ese problema: «lo que viene después de `SIS-012`»
// significa lo mismo antes y después del alta, porque no depende de cuántas filas haya delante.
//
// POR QUÉ POR CLAVE NATURAL Y NO POR `id`. `Sistema.codigo` es estable y lo conoce quien
// consume la API —es lo que escribe en su `.sgi/sistema.yml`—; `id` es un autoincremental que
// no significa nada afuera y que ata al cliente a un detalle de la base. Y el orden por `id` es
// el orden de creación, que no es el orden en que nadie quiere leer un expediente.
//
// EL PRECIO CONOCIDO DE UN CURSOR, dicho para que nadie lo descubra solo: una fila dada de alta
// DETRÁS del cursor no aparece en el recorrido en curso. Es correcto —el recorrido fotografía
// un momento— y es preferible al intercambio contrario, donde la fila nueva corre a todas las
// demás y produce duplicados silenciosos.

/// Cuántas filas devuelve una página cuando nadie pide otra cosa.
export const LIMITE_POR_DEFECTO = 50;

/// El tope. No es un número mágico: una página del expediente completo de un sistema arrastra
/// sus siete colecciones hijas, y cien de esas en una sola respuesta ya es una carga que al
/// cliente le conviene partir.
export const LIMITE_MAXIMO = 100;

/// Lo que se pidió, ya validado — o por qué no se puede atender.
export type Paginacion =
  | { ok: true; limite: number; desde: string | null }
  | { ok: false; detalle: string };

/// Lee `?limite=` y `?desde=` de la URL.
///
/// **Un valor fuera de rango se rechaza; no se recorta.** Devolver 100 a quien pidió 5000 deja
/// al cliente creyendo que recibió todo, y arma su recorrido sobre una suposición falsa. Fallar
/// nombrando el parámetro es la única respuesta que le permite corregir.
export function leerPaginacion(url: URL): Paginacion {
  const crudo = url.searchParams.get('limite');
  let limite = LIMITE_POR_DEFECTO;

  if (crudo !== null && crudo !== '') {
    // `Number` y no `parseInt`: `parseInt('10.5')` devuelve 10 y `parseInt('muchos')` NaN,
    // pero `parseInt('10abc')` devuelve 10 — aceptaría basura con un prefijo válido.
    const n = Number(crudo);
    if (!Number.isInteger(n) || n < 1 || n > LIMITE_MAXIMO) {
      return {
        ok: false,
        detalle: `El parámetro «limite» admite un entero entre 1 y ${LIMITE_MAXIMO}; llegó «${crudo}».`,
      };
    }
    limite = n;
  }

  // Un `?desde=` vacío sale de un cliente que concatenó mal su URL. Tratarlo como un código
  // existente devolvería cero filas y parecería un expediente vacío.
  const desde = url.searchParams.get('desde');

  return { ok: true, limite, desde: desde === null || desde === '' ? null : desde };
}

/// Una página de resultados y el cursor para pedir la siguiente.
export interface Pagina<T> {
  datos: T[];
  /// La clave natural de la ÚLTIMA fila entregada, o `null` si no hay más.
  siguiente: string | null;
}

/// Recorta a `limite` y calcula el cursor.
///
/// Se espera recibir **hasta `limite + 1` filas**: esa fila de más es cómo se sabe que hay
/// siguiente sin una segunda consulta de conteo, que sobre una tabla grande cuesta más que la
/// página misma. Si llegan `limite` o menos, no hay más y el cursor es `null`.
///
/// El cursor apunta a la última fila **entregada**, no a la siguiente. Si apuntara a la
/// siguiente y esa fila se diera de baja antes de la petición próxima, el recorrido se
/// detendría a mitad del expediente sin decir por qué.
export function armarPagina<T>(
  filas: readonly T[],
  limite: number,
  claveDe: (fila: T) => string,
): Pagina<T> {
  const hayMas = filas.length > limite;
  const datos = hayMas ? filas.slice(0, limite) : [...filas];

  return {
    datos,
    // `null` y no `''`: las dos son falsy, pero una cadena vacía reenviada como `?desde=` es
    // otra petición, y el cliente que la mande no entiende por qué recibe todo otra vez.
    siguiente: hayMas && datos.length > 0 ? claveDe(datos[datos.length - 1]) : null,
  };
}
