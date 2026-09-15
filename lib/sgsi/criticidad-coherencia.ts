// lib/sgsi/criticidad-coherencia.ts
//
// REQ-SIG-20 §11.3 (P9) · las dos comprobaciones que la columna de criticidad habilita.
// Criticidad y valoración D son primas, no gemelas — y cuando se contradicen, una de las
// dos está mal:
//
//   C1 o C2 con D ≤ 3   → sospechoso. Si no tolera diez minutos de caída, difícilmente su
//                          disponibilidad valga «Medio».
//   D = 5 con C4 o C5   → coherente y hay que dejarlo pasar. Perder el activo es
//                          catastrófico Y se puede esperar tres días a recuperarlo — son
//                          cosas distintas, y confundirlas es el error que esta columna
//                          existe para evitar.
//
// Predicado PURO, sin efectos: la pantalla decide qué hacer con el resultado. **Avisa, no
// bloquea** (D17 del sistema): «la aplicación registra y señala; no impide».

/// Los dos niveles de criticidad cuya exigencia de RTO es incompatible con una
/// disponibilidad baja. Por CÓDIGO, no por `id`: el id es un detalle de la base, el código
/// es el contrato con el negocio (C1..C5, §11.1).
const CRITICIDADES_EXIGENTES = new Set(['C1', 'C2']);

/// El umbral de disponibilidad bajo el cual C1/C2 empieza a ser sospechoso.
const UMBRAL_DISPONIBILIDAD_SOSPECHOSA = 3;

/// `true` cuando la criticidad declarada y la valoración de disponibilidad (D) se
/// contradicen. Solo marca el par C1/C2 + D ≤ 3 — cualquier otra combinación, incluida
/// D = 5 con C4/C5, es coherente y no se marca.
export function esCriticidadSospechosa(
  criticidadCodigo: string | null,
  valorD: number,
): boolean {
  if (criticidadCodigo === null) return false;
  return CRITICIDADES_EXIGENTES.has(criticidadCodigo) && valorD <= UMBRAL_DISPONIBILIDAD_SOSPECHOSA;
}
