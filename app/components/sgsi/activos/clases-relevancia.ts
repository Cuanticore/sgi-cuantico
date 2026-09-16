// app/components/sgsi/activos/clases-relevancia.ts
//
// Cómo se PINTAN las tres clases de relevancia. Qué son y cómo se llaman no se decide acá:
// eso es `CATALOGO_RELEVANCIA` (lib/sgsi/madurez.ts), la misma declaración que siembra
// `relevancia_control`. Este archivo sólo agrega el color y el formato.
//
// Lo comparten la pestaña Ecuación y la tabla de controles de la ficha, que es donde el
// rótulo cruzado se notaba: las dos hablan del mismo grupo en la misma pantalla.

import { catalogoDeClase, type ClaseRelevancia } from '@/lib/sgsi/madurez';

/// Rampa ORDINAL de un solo tono (REQ-SIG-21 §7): las tres clases están ordenadas, así que
/// tres matices distintos dirían que son categorías independientes. Los tres pasos pasan
/// `scripts/validate_palette.js --mode light --surface "#ffffff" --ordinal`.
export const TONO_CLASE: Readonly<Record<ClaseRelevancia, string>> = {
  principal: '#1b3a8a',
  secundario: '#4874c2',
  complementario: '#93b4e0',
};

/// El nombre del CATÁLOGO en mayúsculas — «Complementario» para la clase `secundario`, que es
/// la del 20 %. Nunca el nombre de la clase: ése es vocabulario interno de la fórmula y en
/// pantalla nombraba al grupo equivocado.
export function rotuloClase(clase: ClaseRelevancia): string {
  return catalogoDeClase(clase).nombre.toLocaleUpperCase('es-CO');
}

/// Cuándo se elige esta clase. Es el texto de `relevancia_control.criterio`, para que la
/// persona que clasifica no tenga que abrir la metodología.
export function criterioClase(clase: ClaseRelevancia): string {
  return catalogoDeClase(clase).criterio;
}
