// lib/sig/valoracion.ts
//
// Cómo se NOMBRA el valor de un activo, en un solo lugar.
//
// La escala vive en la tabla `escala_valor` y tiene seis niveles, con su etiqueta ya
// escrita: «5 — Muy Alto», «4 — Alto», «3 — Medio», «2 — Bajo», «1 — Muy Bajo»,
// «0 — Irrelevante». Es un catálogo del sistema, no una constante del código.
//
// **El defecto que este módulo cierra.** `pintarCriticidad` estaba copiada palabra por
// palabra en `/tecnologia/dependencias` y en `/tecnologia/impacto`, y las dos copias
// aplastaban la escala de seis niveles en cuatro:
//
//     if (v >= 5) 'muy alto'; if (v === 4) 'alto'; if (v === 3) 'medio'; else 'bajo';
//
// Un activo valorado **0 — Irrelevante** y otro valorado **2 — Bajo** salían iguales. No es
// un matiz de redacción: son dos decisiones distintas de quien valoró, y la pantalla las
// hacía indistinguibles. Además, una tercera copia de la misma idea —partir la etiqueta por
// el guion— vivía en el inventario.
//
// Por eso el nombre se toma del catálogo y no de una tabla escrita acá: si mañana alguien
// renombra un nivel en `escala_valor`, la aplicación entera lo dice igual. El color sí es
// del código, porque es presentación y no dato.

export interface NivelEscala {
  valor: number;
  /// Tal como viene del catálogo: «5 — Muy Alto».
  etiqueta: string;
}

/// El texto que se muestra cuando el activo no tiene valoración.
///
/// **`null` no es «bajo» ni es cero**: es que NADIE lo valoró. Un activo sin valorar del que
/// depende un servicio crítico es justamente el hallazgo que la pantalla de dependencias
/// existe para encontrar; pintarlo como «bajo» lo escondería entre los que sí se miraron.
export const SIN_VALORAR = 'sin valorar';

/// El nombre del nivel, sin el número: «5 — Muy Alto» → «Muy Alto».
///
/// El catálogo escribe la etiqueta con el número adelante porque así se lee en la matriz de
/// valoración; en una celda que ya muestra la cifra al lado, repetirla es ruido.
export function nombreDeNivel(etiqueta: string): string {
  const partes = etiqueta.split('—');
  return (partes.length > 1 ? partes.slice(1).join('—') : etiqueta).trim();
}

/// El nombre del valor de un activo según el catálogo recibido.
///
/// Un valor que el catálogo no tiene se muestra como número. No se aproxima al nivel más
/// cercano: si la escala cambia y llega un 7, decir «muy alto» sería inventar una lectura
/// que nadie definió.
export function etiquetaDeValor(escala: readonly NivelEscala[], valor: number | null): string {
  if (valor === null) return SIN_VALORAR;
  const nivel = escala.find((e) => e.valor === valor);
  return nivel === undefined ? String(valor) : nombreDeNivel(nivel.etiqueta);
}

/// El color del nivel. Esto SÍ vive en el código: es presentación, no dato del catálogo.
///
/// Sube con el valor porque un activo vale más cuanto más duele perderlo. Los tres niveles
/// de abajo se apagan en vez de colorearse: teñir de verde lo irrelevante le daría el mismo
/// peso visual que a lo que sí exige atención.
export function colorDeValor(valor: number | null): string {
  if (valor === null) return 'var(--hf-text-faint)';
  if (valor >= 5) return '#a52016';
  if (valor === 4) return '#b8791a';
  if (valor === 3) return '#0f7a5a';
  if (valor === 2) return 'var(--hf-text-secondary-soft)';
  return 'var(--hf-text-faint)';
}

/// Lo que una celda necesita para pintar un valor: el texto y el color, juntos.
export function pintarValor(
  escala: readonly NivelEscala[],
  valor: number | null,
): { texto: string; color: string } {
  return { texto: etiquetaDeValor(escala, valor), color: colorDeValor(valor) };
}
