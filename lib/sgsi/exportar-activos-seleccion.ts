// lib/sgsi/exportar-activos-seleccion.ts
//
// QUÉ SE EXPORTA CUANDO SE PIDE EL FOR-SIG-12. Las dos direcciones del contrato, en un solo
// módulo, para que la pantalla y la ruta no puedan volver a entender cosas distintas.
//
// **Por qué existe.** El 2026-09-21, en producción: filtrar el inventario a cero resultados
// —basta buscar algo que no exista—, darle a «Exportar a Excel», y bajarse el FOR-SIG-12 con
// los 378 activos vigentes. Medido contra la aplicación corriendo, no deducido.
//
// Ninguna de las dos piezas estaba mal. El cliente armaba su lista de códigos con
// `filas.map(...).join(',')`, que para cero filas da `''`, y entonces omitía el parámetro. La
// ruta trataba «sin códigos» como «sin filtro», que es su comportamiento documentado de un
// clic. **El defecto vivía entre las dos**: el cliente convertía «cero filas» en «sin filtro»,
// que son cosas opuestas, y cada mitad por separado se veía razonable.
//
// La causa raíz no es ninguno de los dos archivos: es que la regla estaba escrita dos veces,
// en dos lenguajes de intención distintos, sin nada que las obligara a coincidir. Por eso el
// arreglo es un módulo del que dependen los dos lados, y no un parche en cada uno.
//
// Es la misma forma de las cicatrices de HARNESS.md, y la razón por la que la suite en verde
// no lo veía: una prueba unitaria del cliente y otra de la ruta pueden estar las dos en verde
// con el defecto vivo. Lo que lo cierra es `__tests__/exportar-activos-seleccion.test.ts`, que
// ejerce la composición.

/// El nombre del parámetro, en un solo sitio: es lo que viaja entre los dos lados.
export const PARAM_CODIGOS = 'codigos';

export const RUTA_EXPORTAR_ACTIVOS = '/api/sgsi/exportar-activos';

/// Lo que la aplicación pone donde un activo no tiene código. No identifica a nadie, así que
/// no puede viajar como selección.
///
/// Está repetido en seis consultas más (`inventario/page.tsx`, `valoracion.query.ts`,
/// `analisis-riesgos.query.ts`, `informe.query.ts`, `evaluacion.query.ts`, `planes/page.tsx`).
/// Unificarlo es deuda aparte y no se hace acá para no tocar seis archivos en un arreglo de
/// producción.
export const CODIGO_AUSENTE = '(sin código)';

/// Las tres cosas distintas que la ruta puede recibir, y que antes eran dos.
///
/// La distinción entre `todo` y `ninguno` **es el arreglo**. Aplanarlas otra vez —tratar la
/// lista vacía como «sin filtro»— reabre el defecto.
export type PedidoExportacion =
  | { clase: 'todo' }
  | { clase: 'algunos'; codigos: string[] }
  | { clase: 'ninguno' };

/// LADO CLIENTE · los códigos de estas filas que se pueden nombrar en la URL.
///
/// Descarta el marcador de «sin código»: un activo que no tiene código no se puede pedir por
/// código. Si eso deja la lista vacía **aunque haya filas en pantalla**, no hay nada que
/// exportar — y ése es el tercer camino al defecto, el que no se ve leyendo.
export function codigosExportables(filas: readonly { codigo: string }[]): string[] {
  return filas
    .map((f) => f.codigo.trim())
    .filter((c) => c !== '' && c !== CODIGO_AUSENTE);
}

/// LADO CLIENTE · la URL que exporta exactamente estos códigos, o `null` cuando no hay nada
/// que exportar.
///
/// **`null` es el arreglo del lado del cliente.** Antes, cero códigos producía una URL sin
/// parámetro, que la ruta lee como «todo». Ahora cero códigos no produce URL: no hay petición
/// que hacer, y quien llama tiene que decidir qué mostrar en vez de exportar.
export function urlDeExportacion(codigos: readonly string[]): string | null {
  if (codigos.length === 0) return null;
  const params = new URLSearchParams({ [PARAM_CODIGOS]: codigos.join(',') });
  return `${RUTA_EXPORTAR_ACTIVOS}?${params.toString()}`;
}

/// Lo mínimo que `URLSearchParams` cumple. El módulo no importa nada de Next para poder
/// probarse sin un servidor, igual que `inventario-filtros.ts`.
export interface ParametrosLeibles {
  get(clave: string): string | null;
}

/// LADO SERVIDOR · qué pidió esa URL.
///
/// La diferencia que importa: **`null` es «no me pasaron el parámetro»** —un clic pelado
/// contra la ruta, que exporta todo y así está documentado— **y `''` es «me pasaron una
/// selección vacía»**, que no es lo mismo ni por asomo.
export function pedidoDesdeParametros(params: ParametrosLeibles): PedidoExportacion {
  const crudo = params.get(PARAM_CODIGOS);
  if (crudo === null) return { clase: 'todo' };

  const codigos = crudo
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return codigos.length === 0 ? { clase: 'ninguno' } : { clase: 'algunos', codigos };
}

/// LADO SERVIDOR · el fragmento de `where` de Prisma que representa el pedido.
///
/// `{}` significa «todo lo activo» y es exactamente la forma que tenía el defecto, así que
/// sólo `todo` lo produce. `ninguno` da una selección vacía de verdad.
///
/// **La ruta responde 400 ante `ninguno` y nunca llega acá con eso.** Esta rama existe igual,
/// como segunda barrera: si mañana alguien quita el 400, lo peor que puede pasar es un libro
/// vacío, no el inventario entero.
export function filtroDeActivos(pedido: PedidoExportacion): { codigo?: { in: string[] } } {
  if (pedido.clase === 'todo') return {};
  if (pedido.clase === 'ninguno') return { codigo: { in: [] } };
  return { codigo: { in: pedido.codigos } };
}
