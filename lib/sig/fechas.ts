// lib/sig/fechas.ts
//
// La comparación por día calendario, en un solo lugar y sin entero a la vista.
//
// La forma vieja era una función privada `diaDe(fecha)` que empaquetaba la fecha como
// `YYYYMMDD`. Ese entero COMPARA bien —el orden se conserva— y RESTA mal: entre el 31 de
// enero y el 1 de febrero la diferencia salta a 70. Estaba copiada en cinco módulos, y la
// resta indebida produjo cuatro defectos distintos, cada uno encontrado y parcheado por
// separado: el correo semanal perdía toda tarea que cruzara un fin de mes, el recordatorio
// de siete días veía 76, la deuda vencida decía 70 días en vez de uno, y en la bandeja de
// «Mi SIG» el grupo «Vence mañana» era inalcanzable.
//
// Advertir no alcanzó: cada copia llevaba su comentario contra la resta, y la copia
// siguiente se hizo sin leerlo. Por eso este módulo NO exporta el entero. Sólo exporta las
// dos comparaciones, y la única forma de restar días es `diasHasta` en `lib/sig/cierre.ts`.
// Lo que no se puede pedir no se puede restar mal.

/// `a` cae en un día calendario posterior al de `b`. La hora no cuenta.
///
/// Es el criterio de «vencido» de toda la aplicación: el día del plazo todavía está en
/// plazo, así que vence al día siguiente.
export function esDiaPosterior(a: Date, b: Date): boolean {
  return diaEmpaquetado(a) > diaEmpaquetado(b);
}

/// `a` cae en el mismo día calendario que `b`, o en uno posterior.
///
/// Es el criterio de «vigente»: el día del vencimiento cuenta como vigente, igual que el
/// día del plazo cuenta como en plazo.
export function esDiaPosteriorOIgual(a: Date, b: Date): boolean {
  return diaEmpaquetado(a) >= diaEmpaquetado(b);
}

/// La fecha como entero `YYYYMMDD`. Privada a propósito: conserva el orden, así que sirve
/// para comparar, pero restarla no da días. Si hace falta restar, `diasHasta`.
function diaEmpaquetado(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}
