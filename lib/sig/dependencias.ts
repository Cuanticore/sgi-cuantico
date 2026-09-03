// lib/sig/dependencias.ts
//
// El grafo de dependencias entre activos. Módulo PURO.
//
// **E4 · la dependencia es dirigida y tipada.** «A depende de B» no implica «B depende de
// A», y el tipo dice en qué sentido.
//
// **E3 · no se admiten ciclos, de ninguna longitud.** Comprobar sólo la reciprocidad
// directa —«¿ya existe B→A?»— deja pasar A→B→C→A, que es justo el ciclo que hace que el
// drill-down del mapa no termine. Acá se recorre la cadena completa.
//
// Y la distinción que estos inventarios suelen romper: esto NO es `superiorId`.
// `superiorId` es contención («este ambiente está dentro de MINTRACE»): un padre, un árbol.
// Esto es dependencia («el CRM depende de nueve servicios»): muchos, y un grafo.

export type TipoDependencia = 'USA' | 'SE_ALOJA_EN' | 'AUTENTICA_CON' | 'ALMACENA_EN';

export interface Arista {
  activoId: number;
  dependeDeId: number;
  tipo: TipoDependencia;
}

/// Adyacencia «de quién depende cada uno», sin tipos: para recorrer la cadena el tipo no
/// importa, sólo la dirección.
function aguasArribaDe(aristas: readonly Arista[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const a of aristas) {
    const previas = m.get(a.activoId);
    if (previas === undefined) m.set(a.activoId, [a.dependeDeId]);
    else if (!previas.includes(a.dependeDeId)) previas.push(a.dependeDeId);
  }
  return m;
}

function aguasAbajoDe(aristas: readonly Arista[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const a of aristas) {
    const previas = m.get(a.dependeDeId);
    if (previas === undefined) m.set(a.dependeDeId, [a.activoId]);
    else if (!previas.includes(a.activoId)) previas.push(a.activoId);
  }
  return m;
}

/// **E3 · si agregar `activoId → dependeDeId` cerraría un ciclo.**
///
/// La pregunta real es: ¿`activoId` ya es alcanzable desde `dependeDeId` siguiendo las
/// dependencias existentes? Si lo es, la arista nueva cierra el lazo.
///
/// El caso de longitud cero —un activo dependiendo de sí mismo— se responde antes de
/// recorrer nada: no hay cadena que seguir y sin embargo es el ciclo más corto posible.
export function cerrariaCiclo(
  activoId: number,
  dependeDeId: number,
  aristas: readonly Arista[],
): boolean {
  if (activoId === dependeDeId) return true;
  const arriba = aguasArribaDe(aristas);
  const pila = [dependeDeId];
  const vistos = new Set<number>([dependeDeId]);
  while (pila.length > 0) {
    const actual = pila.pop() as number;
    for (const siguiente of arriba.get(actual) ?? []) {
      if (siguiente === activoId) return true;
      if (!vistos.has(siguiente)) {
        vistos.add(siguiente);
        pila.push(siguiente);
      }
    }
  }
  return false;
}

/// La cadena concreta que se cerraría, para poder DECIRLA en el mensaje de error. «Cerraría
/// un ciclo» sin mostrar por dónde manda a alguien a reconstruirlo a mano sobre un grafo
/// que puede tener decenas de aristas.
///
/// Devuelve los ids desde `dependeDeId` hasta `activoId`, o `null` si no hay ciclo.
export function caminoDelCiclo(
  activoId: number,
  dependeDeId: number,
  aristas: readonly Arista[],
): number[] | null {
  if (activoId === dependeDeId) return [activoId];
  const arriba = aguasArribaDe(aristas);
  const cola: number[][] = [[dependeDeId]];
  const vistos = new Set<number>([dependeDeId]);
  while (cola.length > 0) {
    const camino = cola.shift() as number[];
    const actual = camino[camino.length - 1];
    for (const siguiente of arriba.get(actual) ?? []) {
      if (siguiente === activoId) return [...camino, siguiente];
      if (!vistos.has(siguiente)) {
        vistos.add(siguiente);
        cola.push([...camino, siguiente]);
      }
    }
  }
  return null;
}

export interface NodoAlcanzado {
  activoId: number;
  /// En saltos. **Dos saltos no son dos niveles**: la distancia en la cadena no tiene nada
  /// que ver con la jerarquía de `NivelActivo`.
  distancia: number;
}

/// **De qué depende un activo.** Aguas arriba: lo que se cae y lo arrastra.
///
/// `soloDirectas` corta en el primer salto. La pantalla lo ofrece porque son dos preguntas
/// distintas: «con quién hablo si esto falla» es el primer salto, y «qué tengo que revisar
/// antes de tocarlo» es la cadena completa.
export function aguasArriba(
  activoId: number,
  aristas: readonly Arista[],
  soloDirectas = false,
): NodoAlcanzado[] {
  return recorrer(activoId, aguasArribaDe(aristas), soloDirectas);
}

/// **Qué depende de un activo.** Aguas abajo: lo que se cae si esto se cae.
///
/// Es la dirección que hoy no contesta nadie y la que alimenta el BIA anual del sistema de
/// continuidad. El editor de dependencias responde la otra.
export function aguasAbajo(
  activoId: number,
  aristas: readonly Arista[],
  soloDirectas = false,
): NodoAlcanzado[] {
  return recorrer(activoId, aguasAbajoDe(aristas), soloDirectas);
}

/// Anchura primero, para que la distancia sea la MÍNIMA en saltos y no la del camino que se
/// exploró primero. Un nodo alcanzable por dos rutas se reporta con la más corta, que es la
/// que responde «qué tan cerca está».
function recorrer(
  desde: number,
  adyacencia: ReadonlyMap<number, number[]>,
  soloDirectas: boolean,
): NodoAlcanzado[] {
  const salida: NodoAlcanzado[] = [];
  const vistos = new Set<number>([desde]);
  let frontera = adyacencia.get(desde) ?? [];
  let distancia = 1;
  while (frontera.length > 0) {
    const siguiente: number[] = [];
    for (const id of frontera) {
      if (vistos.has(id)) continue;
      vistos.add(id);
      salida.push({ activoId: id, distancia });
      for (const v of adyacencia.get(id) ?? []) if (!vistos.has(v)) siguiente.push(v);
    }
    if (soloDirectas) break;
    frontera = siguiente;
    distancia += 1;
  }
  return salida;
}

export interface CriticidadDeActivo {
  activoId: number;
  /// `null` cuando el activo no fue valorado. **No es «baja»**: es que nadie lo miró.
  criticidad: number | null;
}

export interface Asimetria {
  activoId: number;
  dependeDeId: number;
  motivo: string;
}

/// **Un activo de criticidad alta que depende de uno sin valorar es un hallazgo, no un
/// dato.** La pantalla lo dice en palabras en vez de dejarlo para que alguien lo note.
///
/// Se reportan dos formas de asimetría, y la segunda es la que más se pasa por alto:
///
/// 1. **Depende de uno sin valorar.** No se puede afirmar que el conjunto está bien si una
///    pieza no se miró.
/// 2. **Depende de uno MENOS crítico.** Un activo no puede ser más confiable que aquello de
///    lo que depende: si el CRM es crítico y postgres está valorado como bajo, una de las
///    dos valoraciones está mal, y la pantalla no sabe cuál — por eso lo reporta en vez de
///    corregirlo.
export function asimetrias(
  aristas: readonly Arista[],
  criticidades: readonly CriticidadDeActivo[],
  umbralAlto: number,
): Asimetria[] {
  const porId = new Map(criticidades.map((c) => [c.activoId, c.criticidad]));
  const salida: Asimetria[] = [];
  for (const a of aristas) {
    const propia = porId.get(a.activoId) ?? null;
    if (propia === null || propia < umbralAlto) continue;
    const suya = porId.get(a.dependeDeId) ?? null;
    if (suya === null) {
      salida.push({
        activoId: a.activoId,
        dependeDeId: a.dependeDeId,
        motivo: 'depende de un activo sin valorar',
      });
    } else if (suya < propia) {
      salida.push({
        activoId: a.activoId,
        dependeDeId: a.dependeDeId,
        motivo: `depende de un activo menos crítico (${suya} contra ${propia})`,
      });
    }
  }
  return salida;
}

export const ETIQUETA_TIPO_DEPENDENCIA: Record<TipoDependencia, string> = {
  USA: 'usa',
  SE_ALOJA_EN: 'se aloja en',
  AUTENTICA_CON: 'autentica con',
  ALMACENA_EN: 'almacena en',
};
