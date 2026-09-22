// lib/sgsi/firmantes-acta-residual.ts
//
// QUIÉN PUEDE FIRMAR UN ACTA DE RIESGO RESIDUAL, y qué decir cuando no puede nadie.
//
// **Por qué existe.** `PantallaRiesgoResidual.tsx` previó que ALGUNOS procesos no tuvieran
// firmante —lo dice su cabecera, y el denominador los excluye a propósito para que una deuda
// del catálogo de cargos no deje el acta eternamente sin aprobar—. No previó que no lo
// tuviera NINGUNO, que es el estado real: medido contra la base el 2026-09-22, las 10 áreas
// activas están sin cargo líder y los firmantes resolubles son **cero**.
//
// Con cero resolubles el tablero se veía completo: «Procesos firmados: 0 / 0» y «Pendientes
// de firma: 0». Es el mismo defecto que la exportación del inventario del día anterior —lo
// problemático queda fuera del denominador y el contador se lee como «no falta nada»—, y en
// el peor escenario posible: el que dice que no hay nada que hacer es justo el que debería
// gritar.
//
// **Y la emisión no estaba guardada.** Un acta emitida sin firmantes resolubles NO PUEDE
// LLEGAR NUNCA a `APROBADA`: `estado-acta-residual.ts` exige `procesos > 0` para declararlo,
// y con cero se queda en `EMITIDA` para siempre. No tarda en aprobarse — el estado es
// inalcanzable por construcción. Y emitir no es gratis: quema un consecutivo `ARR-…` que sale
// de `count(periodo) + 1` y no se recicla, genera el PDF y guarda su sha256. La única salida
// es anular, que no borra: deja el acta con su motivo, permanente, en el registro del SGSI.
//
// Por eso se bloquea, y **sólo cuando es cero**. La asimetría es el argumento entero: si
// bloqueamos y alguien lo necesitaba, cuesta un mensaje y asignar un cargo líder; si lo
// permitimos y estaba mal, queda un documento numerado e insalvable. Cuando una rama es
// reversible en segundos y la otra deja rastro permanente, no hay empate que resolver.
//
// `puedeEmitirActa` la usan LA PANTALLA Y LA SERVER ACTION. Es deliberado: el botón apagado
// solo deja la acción abierta para cualquier otro que la llame, y la acción sola deja al
// botón prometiendo algo que va a fallar. Es la lección de
// `exportar-activos-seleccion.ts`, pagada el día anterior con un defecto de producción.

/// Lo mínimo de un firmante para decidir si puede firmar y por qué no. Es un subconjunto de
/// `FirmanteProceso` (`alcance-residual.ts`) a propósito: este módulo no necesita saber de
/// procesos ni de activos, y pedir menos lo deja probarse con objetos de tres campos.
export interface FirmanteResoluble {
  /// Nulo cuando el área no tiene cargo líder asignado. Es la causa (a).
  cargoId: number | null;
  /// Quiénes pueden firmar hoy por ese cargo. Vacío con el cargo puesto es la causa (b).
  candidatos: { id: number; nombre: string }[];
  resoluble: boolean;
}

export interface ResumenFirmantes {
  total: number;
  resolubles: number;
  /// Causa (a): el área no tiene cargo líder. **Se arregla asignando un cargo.**
  sinCargoLider: number;
  /// Causa (b): el cargo existe y no tiene ninguna persona activa. **Se arregla con personas.**
  cargoSinPersona: number;
  sinResolver: number;
}

/// Las dos causas, contadas por separado.
///
/// Se separan porque **se arreglan en sitios distintos**, y un solo número manda a la mitad
/// de la gente al lugar equivocado.
export function resumenDeFirmantes(firmantes: readonly FirmanteResoluble[]): ResumenFirmantes {
  let resolubles = 0;
  let sinCargoLider = 0;
  let cargoSinPersona = 0;

  for (const f of firmantes) {
    if (f.resoluble) resolubles += 1;
    else if (f.cargoId === null) sinCargoLider += 1;
    else cargoSinPersona += 1;
  }

  return {
    total: firmantes.length,
    resolubles,
    sinCargoLider,
    cargoSinPersona,
    sinResolver: sinCargoLider + cargoSinPersona,
  };
}

/// La nota de la tarjeta «Sin firmante resoluble», dicha por su causa.
///
/// Antes era una constante: «El cargo líder del proceso no tiene persona activa». Es una de
/// las dos causas, y hoy la real es la otra — quien la leyera iría a buscar personas que
/// faltan en vez de asignaciones que faltan. El `title` de la fila ya decía las dos; la nota
/// se había quedado con la mitad, y era la que se ve primero.
export function notaSinFirmante(resumen: ResumenFirmantes): string {
  const { sinCargoLider, cargoSinPersona } = resumen;
  if (sinCargoLider === 0 && cargoSinPersona === 0) return '';
  if (cargoSinPersona === 0) return 'El área no tiene cargo líder asignado';
  if (sinCargoLider === 0) return 'El cargo líder del proceso no tiene persona activa';
  return `${sinCargoLider} sin cargo líder · ${cargoSinPersona} con el cargo sin persona activa`;
}

/// El valor de la tarjeta «Procesos firmados».
///
/// Con cero resolubles **no dice «0 / 0»**: un cociente cuyo denominador es cero se lee como
/// «están todos», y lo que pasa es que no hay ninguno a quien contar.
export function textoProcesosFirmados(firmados: number, resolubles: number): string {
  if (resolubles === 0) return 'Sin firmantes';
  return `${firmados} / ${resolubles}`;
}

/// El valor de la tarjeta «Pendientes de firma».
///
/// Con cero resolubles daba `0` por la resta `resolubles - firmados`, que es aritmética
/// correcta y una respuesta falsa: no es que no queden firmas pendientes, es que no hay nadie
/// a quien pedírselas.
export function textoPendientesDeFirma(
  hayActa: boolean,
  firmados: number,
  resolubles: number,
): string {
  if (!hayActa) return '—';
  if (resolubles === 0) return 'Nadie puede firmar';
  return String(resolubles - firmados);
}

export type PuedeEmitir = { puede: true } | { puede: false; motivo: string };

/// Si tiene sentido emitir el acta. La usan la pantalla y la server action, y ésa es la idea.
///
/// Las dos razones para no emitir son distintas y se dicen distinto: sin activos no hay nada
/// que aprobar; sin firmantes hay mucho que aprobar y nadie que pueda hacerlo.
export function puedeEmitirActa(activos: number, resolubles: number): PuedeEmitir {
  if (activos === 0) {
    return {
      puede: false,
      motivo:
        'No hay activos en banda Alta o Crítica en este periodo: no hay riesgo residual que aprobar.',
    };
  }
  if (resolubles === 0) {
    return {
      puede: false,
      motivo:
        'Ningún proceso del acta tiene un firmante que pueda firmarla, así que el acta nunca podría aprobarse. Asigna el cargo líder de las áreas —y una persona activa a ese cargo— antes de emitirla.',
    };
  }
  return { puede: true };
}
