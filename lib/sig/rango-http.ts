// lib/sig/rango-http.ts
//
// Interpretar la cabecera `Range:` contra el tamaño de un archivo (RFC 7233 §3.1).
//
// Puro y aparte de la ruta por la misma razón que `scorm-tiempo.ts` está aparte del modelo:
// un rango mal interpretado NO falla. Sirve los bytes equivocados, y lo que se ve es un
// video corrupto que nadie relaciona con esta función.
//
// El caso que más se confunde es el sufijo: `bytes=-500` son los ÚLTIMOS 500 bytes. Leerlo
// como «del 0 al 500» sirve el principio del archivo cuando el reproductor pidió el final,
// que es justo donde un MP4 con el `moov` al final guarda su índice.

export type Rango =
  /// Sin cabecera, o con una que no entendemos: se sirve el archivo entero con 200.
  | { clase: 'completo' }
  /// Ambos extremos INCLUSIVOS, ya recortados al archivo.
  | { clase: 'parcial'; desde: number; hasta: number }
  /// 416 · el rango no se puede satisfacer.
  | { clase: 'inatendible' };

/// Un solo rango de bytes. Lo que no case —varios rangos, otra unidad, basura— cae en
/// `completo`: responder de más es correcto y es lo que el estándar permite (RFC 7233 §3.1,
/// «a server MAY ignore the Range header field»); adivinar no.
///
/// La `i` es por el ABNF: `bytes-unit = "bytes"`, y un literal entre comillas en ABNF es
/// insensible a mayúsculas (RFC 5234 §2.3). No afecta a los dígitos.
///
/// Los espacios, en cambio, se rechazan a propósito. El `OWS` de la regla de lista sólo
/// aparece alrededor de las COMAS, no dentro de un `byte-range-spec` ni pegado al `=`:
/// aceptar `bytes= 0-499` sería más permisivo que el estándar sin ganar ningún cliente.
const UN_RANGO = /^bytes=(\d*)-(\d*)$/i;

export function analizarRango(cabecera: string | null, tamano: number): Rango {
  if (cabecera === null || cabecera.trim() === '') return { clase: 'completo' };

  const m = UN_RANGO.exec(cabecera.trim());
  if (m === null) return { clase: 'completo' };

  const [, crudoDesde, crudoHasta] = m;
  // `bytes=-` no dice nada.
  if (crudoDesde === '' && crudoHasta === '') return { clase: 'completo' };

  // Un archivo de cero bytes no tiene ningún rango que satisfacer. Se contesta antes de
  // calcular nada: con `tamano - 1` las cuentas de abajo darían -1 y un rango imposible.
  if (tamano === 0) return { clase: 'inatendible' };

  if (crudoDesde === '') {
    const largo = Number(crudoHasta);
    // `bytes=-0` pide los últimos cero bytes: no hay nada que devolver.
    if (largo === 0) return { clase: 'inatendible' };
    return { clase: 'parcial', desde: Math.max(0, tamano - largo), hasta: tamano - 1 };
  }

  const desde = Number(crudoDesde);
  if (desde >= tamano) return { clase: 'inatendible' };

  const hasta = crudoHasta === '' ? tamano - 1 : Math.min(Number(crudoHasta), tamano - 1);
  if (hasta < desde) return { clase: 'inatendible' };

  return { clase: 'parcial', desde, hasta };
}
