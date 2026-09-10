// lib/sgsi/valoracion-figura.ts
//
// La geometría y la rampa de las cuatro pilas (REQ-SIG-18 §4.4 y §4.5). Puro, separado del
// componente, por la misma razón que `app/components/sgsi/inicio/radar.ts`: la posición de la
// marca del umbral es el hallazgo de la pantalla y se puede razonar sin renderizar nada.
//
// **La rampa está validada, no elegida a ojo.** Un solo tono, claro → oscuro, valor 0 → 5, y
// **la misma para las cuatro pilas**: cuatro paletas distintas harían creer que las filas son
// series independientes, cuando son la misma medida sobre cuatro cortes. Los tres pasos
// oscuros son los tokens de marca tal cual (`--hf-brand-500/700/900`); los tres claros están
// interpolados en la rampa.
//
//   node scripts/validate_palette.js "#93b4e0,#6c95d4,#4874c2,#2b52b8,#1b3a8a,#0c2461" \
//        --mode light --surface "#ffffff" --ordinal
//   → ALL CHECKS PASS (lightness monótona · ΔL adyacente ≥ 0.06 · extremo claro 2.13:1 · un
//     solo tono, 9° de dispersión)
//
// **`--hf-brand-100` (#e9f0fb) NO sirve como paso claro**, que era lo natural: el validador lo
// rechaza a 1.12:1 contra el blanco y el segmento del valor 0 quedaría invisible sobre la
// superficie de la app. Si alguien cambia un paso, tiene que volver a correr el validador
// (criterio 10 del §10).
//
// **Sin verde y sin rojo.** El verde está reservado para estado bueno —madurez L4-L5, riesgo
// bajo— y un activo de valor 5 no es «malo», es valioso. Pintarlo de rojo diría lo que la
// metodología no dice.
//
// **Sin rampa oscura.** `app/globals.css` no declara `prefers-color-scheme` ni `[data-theme]`:
// la app es de un solo modo y esta pantalla no introduce el segundo.

import type { NivelEscala, Reparto } from './valoracion-agregada';

/// Los seis pasos, del valor 0 al 5.
export const RAMPA = [
  '#93b4e0',
  '#6c95d4',
  '#4874c2',
  '#2b52b8',
  '#1b3a8a',
  '#0c2461',
] as const;

/// El paso más oscuro que el tinte de una celda puede alcanzar. Más oscuro que eso y el
/// número deja de leerse sobre el fondo, y el número es el dato (§6.3).
export const TINTE_TOPE_COLOR = RAMPA[2];

/// La opacidad del tinte en la celda más alta de su grupo.
export const TINTE_TOPE_OPACIDAD = 0.18;

/// Ancho del área de trazado de las barras, en px. Con 168 px de rótulo y 64 px de cuenta, la
/// figura entra en 1 280 sin scroll horizontal (criterio 11 del §10).
export const ANCHO_TRAZADO = 640;

/// Alto de barra, separación entre segmentos y el radio de las esquinas de los extremos.
export const ALTO_BARRA = 26;
export const SEPARACION = 2;
export const RADIO_EXTREMO = 4;

/// El color de un nivel de valor. Se recorta a la rampa en vez de fallar: una escala con un
/// séptimo nivel pintaría el extremo antes que nada.
export function colorDeNivelValor(valor: number): string {
  const i = Math.min(RAMPA.length - 1, Math.max(0, Math.round(valor)));
  return RAMPA[i]!;
}

/// El tinte de una celda del mapa de calor de las dos tablas.
///
/// `null` cuando la celda está en cero: se deja **vacía y sin `0`**, porque una parrilla de
/// seis columnas sembrada de ceros esconde las celdas que sí tienen algo (§6.3).
export function tinteDeCelda(cuenta: number, tope: number): string | null {
  if (cuenta <= 0 || tope <= 0) return null;
  const fraccion = Math.min(1, cuenta / tope);
  const alfa = (TINTE_TOPE_OPACIDAD * fraccion).toFixed(4);
  return `color-mix(in srgb, ${TINTE_TOPE_COLOR} ${(Number(alfa) * 100).toFixed(2)}%, transparent)`;
}

export interface Segmento {
  valor: number;
  etiqueta: string;
  cuenta: number;
  /// Fracción de su fila, 0 a 1. La pantalla la muestra en el tooltip.
  fraccionDeFila: number;
  entraAlAnalisis: boolean;
  /// px desde el borde izquierdo del área de trazado.
  x: number;
  ancho: number;
  primero: boolean;
  ultimo: boolean;
  color: string;
}

/// Los segmentos de una pila, de 0 a 5 y de izquierda a derecha.
///
/// **Escala absoluta compartida**: `escala` es la barra más larga de las cuatro y no el total
/// de esta fila. Normalizar al 100 % escondería que una dimensión tiene menos activos
/// valorados que otra (D-5), y con valoración parcial cuatro barras del mismo largo dirían que
/// los cuatro denominadores son iguales.
///
/// Los niveles en cero se omiten: un segmento de ancho cero no es información, y su separación
/// de 2 px sí se vería.
export function segmentos(
  reparto: Reparto,
  niveles: readonly NivelEscala[],
  escala: number,
  umbral: number,
  anchoTrazado: number = ANCHO_TRAZADO,
): Segmento[] {
  if (escala <= 0 || reparto.valorados <= 0) return [];
  const px = anchoTrazado / escala;
  const conCuenta = niveles
    .map((n, i) => ({ nivel: n, cuenta: reparto.porNivel[i] ?? 0 }))
    .filter((s) => s.cuenta > 0);

  let acumulado = 0;
  return conCuenta.map((s, i) => {
    const x = acumulado * px;
    acumulado += s.cuenta;
    const bruto = s.cuenta * px;
    const ultimo = i === conCuenta.length - 1;
    // Los 2 px son de SUPERFICIE entre segmentos, no un borde: un borde alrededor de cada
    // relleno engorda la barra y ensucia el corte (§4.5). Se los descuenta al ancho, y el
    // último no lleva para que la barra termine donde la escala dice.
    const ancho = Math.max(1, ultimo ? bruto : bruto - SEPARACION);
    return {
      valor: s.nivel.valor,
      etiqueta: s.nivel.etiqueta,
      cuenta: s.cuenta,
      fraccionDeFila: s.cuenta / reparto.valorados,
      entraAlAnalisis: s.nivel.valor >= umbral,
      x,
      ancho,
      primero: i === 0,
      ultimo,
      color: colorDeNivelValor(s.nivel.valor),
    };
  });
}

/// La x de la marca del umbral, en px desde el borde izquierdo del área de trazado.
///
/// Cae **en la frontera del nivel del umbral de esa fila**, no en una x fija: si el umbral
/// pasa a 3, las cuatro marcas se mueven solas. Y esa desalineación entre filas **es el
/// hallazgo** de la pantalla: se ve de un vistazo qué dimensión empuja más activos por encima
/// de la línea (§4.1).
///
/// `null` cuando la marca caería en un extremo de la barra —todos los activos de un lado— o
/// cuando la fila no tiene nada valorado: una marca pegada al borde no separa nada (§9).
export function posicionUmbral(
  reparto: Reparto,
  niveles: readonly NivelEscala[],
  escala: number,
  umbral: number,
  anchoTrazado: number = ANCHO_TRAZADO,
): number | null {
  if (escala <= 0 || reparto.valorados <= 0) return null;
  const debajo = niveles.reduce(
    (t, n, i) => (n.valor < umbral ? t + (reparto.porNivel[i] ?? 0) : t),
    0,
  );
  if (debajo === 0 || debajo === reparto.valorados) return null;
  return (debajo / escala) * anchoTrazado;
}

/// Los cortes del eje de conteo, incluido el 0 y la escala.
///
/// Un solo eje, absoluto, compartido por las cuatro (§4.2). El paso se elige de una lista de
/// pasos «redondos» para que las etiquetas no queden en 37 y 74.
export function cortesDeEje(escala: number, cortesDeseados = 5): number[] {
  if (escala <= 0) return [0];
  const crudo = escala / cortesDeseados;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const paso =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitud).find((p) => p >= crudo) ?? 10 * magnitud;
  const cortes: number[] = [];
  for (let v = 0; v < escala; v += paso) cortes.push(Math.round(v));
  cortes.push(escala);
  return cortes;
}

/// Si la etiqueta de un segmento cabe adentro con aire.
///
/// **Un número recortado a media cifra es peor que ninguno** (§4.5): si no cabe, la cuenta
/// vive en el tooltip y en la matriz, que es la vista de tabla accesible y nunca el único
/// camino al dato.
export function cabeLaEtiqueta(ancho: number, cuenta: number): boolean {
  // ~7 px por dígito a 11 px de mono, más 8 px de aire a cada lado.
  return ancho >= String(cuenta).length * 7 + 16;
}
