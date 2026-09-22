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

// ── De una cadena a un día ──────────────────────────────────────────────────────────────

/// El piso y el techo de una fecha que una persona puede tener en su ficha.
///
/// El piso es 1900 y no una fecha de la empresa: este módulo no sabe de qué fecha se trata
/// —un ingreso, un cambio de área—, y poner un piso más alto rechazaría un dato legítimo de
/// alguien que no se le ocurrió a quien escribió esta línea.
///
/// El techo es el año en curso MÁS CINCO, y no «hoy». Registrar a quien empieza el mes que
/// viene es lo más común del alta, y un contrato firmado con un año de anticipación tampoco
/// es raro. Lo que el techo ataca es el error de tecleo: la cifra transpuesta —2062 por
/// 2026— y el año corrido —0202—, que son fechas VÁLIDAS y por eso no las atrapa nada más.
const ANIO_MINIMO = 1900;
const ANIOS_HACIA_ADELANTE = 5;

/// La cadena `YYYY-MM-DD` como el día UTC que representa, o `null` si no lo representa.
///
/// **Era una función privada de `app/sig/acciones/personas-edicion.ts`**, y el alta de
/// colaborador hacía la misma conversión sin su guarda —`new Date(…)` a secas—. Dos piezas
/// haciendo lo mismo desde orígenes distintos: exactamente lo que cuenta el encabezado de
/// este módulo sobre `diaDe`, y la razón de que viva acá y no se copie.
///
/// Devuelve `null` en los tres casos, y son el mismo caso para quien llama: **no hay una
/// fecha que guardar**. Vacío, ilegible, o imposible. Quien llame decide si eso es «no se
/// declaró» —y no escribe la columna— o si es un error que hay que contarle a alguien; lo que
/// no puede es recibir un `Invalid Date` y pasárselo a la base.
///
/// `hoy` es un parámetro para poder probar el techo sin que la prueba caduque.
export function dia(valor: string | null | undefined, hoy: Date = new Date()): Date | null {
  if (valor === null || valor === undefined || valor.trim() === '') return null;

  const fecha = new Date(`${valor.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) return null;

  const anio = fecha.getUTCFullYear();
  if (anio < ANIO_MINIMO || anio > hoy.getUTCFullYear() + ANIOS_HACIA_ADELANTE) return null;

  return fecha;
}
