// lib/sgsi/estado-acta-residual.ts
//
// El estado de un acta de aprobación del riesgo residual se CALCULA AL LEER, nunca se guarda
// resuelto. Es la misma doctrina de `lib/sgsi/clasificar.ts`: un estado guardado es un segundo
// lugar donde una verdad puede vivir, y dos lugares es como un documento termina
// contradiciendo a la pantalla de la que salió.
//
// La columna `estado` de la tabla guarda sólo lo que NO es derivable: si alguien anuló el acta
// a mano, con su motivo. Todo lo demás sale de comparar la huella y la fecha contra el momento
// en que se lee.

export type EstadoActa = 'EMITIDA' | 'APROBADA' | 'DESACTUALIZADA' | 'VENCIDA' | 'ANULADA';

export interface ActaParaEstado {
  /// Lo guardado. Sólo `ANULADA` es significativo acá; el resto se recalcula.
  estado: EstadoActa;
  alcanceHash: string;
  generadaEn: Date;
  /// Cuántos procesos pueden firmar. **Son los resolubles**, no todos: un proceso sin cargo
  /// líder no puede firmar nunca, y exigir su firma dejaría el acta eternamente sin aprobar
  /// por una deuda del catálogo de cargos. Esa deuda se muestra en su propia tarjeta, que es
  /// donde alguien puede hacer algo con ella.
  procesos: number;
  procesosFirmados: number;
}

/// Suma meses de CALENDARIO sin arrastrar una librería de fechas. El día 31 en un mes de 30
/// cae al último día de ese mes, que es lo que cualquiera entiende por «un año después».
function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimoDelMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimoDelMes));
  return d;
}

export function estadoVigente(
  acta: ActaParaEstado,
  huellaActual: string,
  hoy: Date,
  vigenciaMeses: number,
): EstadoActa {
  // Anular es un acto deliberado con motivo escrito. Nada lo revierte al leer.
  if (acta.estado === 'ANULADA') return 'ANULADA';

  // **Desactualizada gana a vencida, y el orden de estas dos líneas es la decisión.**
  // Decirle «venció, renuévela» a alguien cuya acta además ya no describe las cifras vigentes
  // lo manda a recoger firmas sobre un documento que hay que rehacer, no renovar.
  if (huellaActual !== acta.alcanceHash) return 'DESACTUALIZADA';

  if (hoy > sumarMeses(acta.generadaEn, vigenciaMeses)) return 'VENCIDA';

  // Un acta sin procesos que firmar no se declara aprobada sola: aprobada significa que
  // alguien firmó, y nadie firmó.
  if (acta.procesos > 0 && acta.procesosFirmados >= acta.procesos) return 'APROBADA';

  return 'EMITIDA';
}
