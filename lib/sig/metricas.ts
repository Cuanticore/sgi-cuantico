// lib/sig/metricas.ts
//
// Las métricas del SGSI (cláusula 9.1). Módulo PURO: sin prisma, sin fechas del sistema.
//
// **O10 · el umbral no está en el código.** Es un campo de la métrica, junto con su
// sentido. Acá se ve por qué hacen falta los dos: una métrica con umbral 80 mide el % de
// capacidad usada y cruza cuando SUBE; otra con umbral 15 mide días hasta parchar y
// también cruza cuando sube; una de cobertura de capacitación cruzaría cuando BAJA. El
// número solo no dice de qué lado está lo malo.
//
// **No existe tabla de alertas.** Una medición está en alerta cuando cruza el umbral en el
// sentido malo, y eso se calcula al leer (invariante 1). Lo que sí se persiste es la
// reacción: la asignación que se abrió.

export type SentidoMetrica = 'MENOR_ES_MEJOR' | 'MAYOR_ES_MEJOR';

export interface DefinicionMetrica {
  umbral: number;
  sentido: SentidoMetrica;
}

export interface Medicion {
  periodo: string;
  valor: number;
}

/// Si un valor cruzó el umbral **en el sentido malo**.
///
/// El límite exacto NO está en alerta: un umbral de 3 vulnerabilidades significa «hasta
/// tres es aceptable», no «tres ya es demasiado». Si se quisiera lo contrario, el umbral
/// sería 2 — y ésa es una decisión de quien define la métrica, no del código.
export function enAlerta(valor: number, def: DefinicionMetrica): boolean {
  return def.sentido === 'MENOR_ES_MEJOR' ? valor > def.umbral : valor < def.umbral;
}

/// **La tendencia es la alerta, no el dato suelto.** Cuántos periodos consecutivos, hasta
/// el más reciente, vienen cruzando el umbral.
///
/// Cero significa que el último está en rango — aunque hubiera cruzado antes. Es la
/// diferencia entre «se pasó una vez en abril» y «lleva tres meses subiendo», que son dos
/// conversaciones distintas y el conteo total no las separa.
///
/// La serie se recibe en orden cronológico, del más viejo al más reciente. Es el orden en
/// que se lee un gráfico, y ordenar cadenas de periodo (`2026-T3` contra `2026-09`) no es
/// algo que este módulo pueda hacer bien: las etiquetas de periodicidades distintas no son
/// comparables entre sí.
export function rachaDeAlerta(serie: readonly Medicion[], def: DefinicionMetrica): number {
  let racha = 0;
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (!enAlerta(serie[i].valor, def)) break;
    racha += 1;
  }
  return racha;
}

export type EstadoMetrica = 'EN_ALERTA' | 'EN_RANGO' | 'SIN_REGISTRAR';

/// El estado de una métrica según su última medición.
///
/// `SIN_REGISTRAR` NO es «en rango». Una métrica sin ninguna medición no está cumpliendo:
/// está sin medir, y pintarla de verde diría que alguien la miró y salió bien.
export function estadoDeMetrica(serie: readonly Medicion[], def: DefinicionMetrica): EstadoMetrica {
  if (serie.length === 0) return 'SIN_REGISTRAR';
  return enAlerta(serie[serie.length - 1].valor, def) ? 'EN_ALERTA' : 'EN_RANGO';
}

/// Las mediciones que cruzaron el umbral, de la más reciente a la más vieja. Es el
/// histórico de alertas que la ficha muestra — derivado, no almacenado.
export function alertasDeLaSerie(
  serie: readonly Medicion[],
  def: DefinicionMetrica,
): Medicion[] {
  return serie.filter((m) => enAlerta(m.valor, def)).reverse();
}

/// El texto de una alerta. Se genera del dato y del umbral en vez de escribirse a mano
/// porque una alerta redactada a mano envejece: el umbral cambia y el texto sigue citando
/// el viejo.
///
/// `racha` mayor que uno es la parte que convierte el dato suelto en tendencia.
export function textoDeAlerta(
  m: Medicion,
  def: DefinicionMetrica,
  unidad: string,
  racha: number,
): string {
  const lado = def.sentido === 'MENOR_ES_MEJOR' ? 'sobre' : 'bajo';
  const distancia = Math.abs(m.valor - def.umbral);
  const base = `${m.valor} ${unidad} contra un umbral de ${def.umbral}: ${formatearNumero(distancia)} ${lado === 'sobre' ? 'por encima' : 'por debajo'}`;
  if (racha < 2) return `${base}.`;
  return `${base}, y ${racha} periodos consecutivos del mismo lado. La tendencia es la alerta, no el dato suelto.`;
}

/// Sin decimales cuando no los hay: `6` y no `6.00`. Un `.00` en una cuenta de
/// vulnerabilidades sugiere una precisión que el dato no tiene.
export function formatearNumero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/// La altura de la barra en el gráfico, del 0 al 1. El tope contempla el umbral aunque
/// ningún valor lo alcance: si no, la línea de umbral quedaría fuera del dibujo en una
/// métrica que nunca se acercó, y sería un gráfico sin referencia.
export function escalaDeLaSerie(
  serie: readonly Medicion[],
  def: DefinicionMetrica,
): { tope: number; alturaDe: (valor: number) => number; alturaUmbral: number } {
  const maximo = serie.reduce((m, x) => Math.max(m, x.valor), 0);
  // El 18 % de aire arriba es lo que separa la barra más alta del borde de la caja.
  const tope = Math.max(maximo, def.umbral) * 1.18 || 1;
  return {
    tope,
    alturaDe: (valor) => Math.min(Math.max(valor / tope, 0), 1),
    alturaUmbral: def.umbral / tope,
  };
}

export const ETIQUETA_ESTADO_METRICA: Record<EstadoMetrica, string> = {
  EN_ALERTA: 'En alerta',
  EN_RANGO: 'En rango',
  SIN_REGISTRAR: 'Sin registrar',
};

export const ETIQUETA_SENTIDO: Record<SentidoMetrica, string> = {
  MENOR_ES_MEJOR: 'menor es mejor',
  MAYOR_ES_MEJOR: 'mayor es mejor',
};
