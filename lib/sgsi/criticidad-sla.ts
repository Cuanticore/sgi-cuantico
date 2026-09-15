// lib/sgsi/criticidad-sla.ts
//
// REQ-SIG-20 §11 (P9) · el último tramo de la criticidad: minuto → texto.
//
// `CriticidadNegocio` guarda el RTO y el RPO EN MINUTOS porque el minuto es el dato — es lo
// que permite ordenar el inventario por exigencia y comparar dos activos. «≤ 4 h» es
// presentación, y nadie debería leerla de vuelta para reconvertirla. Esta función hace esa
// conversión en un solo lugar para que cada pantalla no la improvise a su manera.
//
// Los dos casos que NO son una duración se dicen con palabras, no con un número:
//
//   null → «sin compromiso»        C5. Un valor declarado —el activo no tiene SLA— y no la
//                                  ausencia de uno (ver `prisma/seeds/criticidad.ts`).
//   0    → «sin pérdida tolerada»  RPO cero, réplica síncrona. «≤ 0 min» escondería que el
//                                  compromiso es el más exigente de todos, no el más laxo.

const MINUTOS_POR_HORA = 60;

/// El RTO o el RPO de un nivel de criticidad, listo para pintar. Total: para cualquier
/// entrada devuelve algo legible, y un valor corrupto (negativo, no finito) se trata como
/// no declarado antes que imprimir «≤ -5 min» como si fuera un compromiso.
export function formatearSla(minutos: number | null): string {
  if (minutos === null || !Number.isFinite(minutos) || minutos < 0) return 'sin compromiso';
  if (minutos === 0) return 'sin pérdida tolerada';
  if (minutos < MINUTOS_POR_HORA) return `≤ ${minutos} min`;

  const horas = Math.floor(minutos / MINUTOS_POR_HORA);
  const resto = minutos % MINUTOS_POR_HORA;
  // Las horas no se convierten a días: «72 h» es como el negocio escribe un SLA, y
  // «3 días» invita a leerlo como jornadas laborales, que no es lo que significa.
  return resto === 0 ? `≤ ${horas} h` : `≤ ${horas} h ${resto} min`;
}
