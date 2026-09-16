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

/// Adyacencia con el TIPO de la arista. El recorrido no lo necesita para avanzar —para eso
/// sólo importa la dirección— pero la pantalla sí: «vía Coolify, se aloja en» dice por dónde
/// llega la cadena, y sin eso una lista de siete nodos a tres saltos no se puede auditar.
interface Salto {
  hacia: number;
  tipo: TipoDependencia;
}

function aguasArribaDe(aristas: readonly Arista[]): Map<number, Salto[]> {
  const m = new Map<number, Salto[]>();
  for (const a of aristas) {
    const previas = m.get(a.activoId);
    const salto = { hacia: a.dependeDeId, tipo: a.tipo };
    if (previas === undefined) m.set(a.activoId, [salto]);
    else previas.push(salto);
  }
  return m;
}

function aguasAbajoDe(aristas: readonly Arista[]): Map<number, Salto[]> {
  const m = new Map<number, Salto[]>();
  for (const a of aristas) {
    const previas = m.get(a.dependeDeId);
    const salto = { hacia: a.activoId, tipo: a.tipo };
    if (previas === undefined) m.set(a.dependeDeId, [salto]);
    else previas.push(salto);
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
    for (const { hacia } of arriba.get(actual) ?? []) {
      if (hacia === activoId) return true;
      if (!vistos.has(hacia)) {
        vistos.add(hacia);
        pila.push(hacia);
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
    for (const { hacia } of arriba.get(actual) ?? []) {
      if (hacia === activoId) return [...camino, hacia];
      if (!vistos.has(hacia)) {
        vistos.add(hacia);
        cola.push([...camino, hacia]);
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
  /// El tipo de la arista por la que se llegó.
  tipo: TipoDependencia;
  /// El activo desde el que se dio el último salto, o `null` en los directos. Es lo que
  /// permite decir «vía Coolify»: sin eso, un nodo a tres saltos aparece sin explicación de
  /// cómo se llega, y la cadena no se puede auditar.
  viaId: number | null;
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
  adyacencia: ReadonlyMap<number, Salto[]>,
  soloDirectas: boolean,
): NodoAlcanzado[] {
  const salida: NodoAlcanzado[] = [];
  const vistos = new Set<number>([desde]);
  // Cada elemento de la frontera recuerda desde dónde vino, que es lo que da el «vía».
  let frontera = (adyacencia.get(desde) ?? []).map((s) => ({ ...s, viaId: null as number | null }));
  let distancia = 1;
  while (frontera.length > 0) {
    const siguiente: { hacia: number; tipo: TipoDependencia; viaId: number | null }[] = [];
    for (const paso of frontera) {
      if (vistos.has(paso.hacia)) continue;
      vistos.add(paso.hacia);
      salida.push({ activoId: paso.hacia, distancia, tipo: paso.tipo, viaId: paso.viaId });
      for (const v of adyacencia.get(paso.hacia) ?? []) {
        if (!vistos.has(v.hacia)) siguiente.push({ ...v, viaId: paso.hacia });
      }
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

// ─── El acomodo del grafo ──────────────────────────────────────────────────────────────

/// **Las columnas NO son niveles: son distancia a la dependencia más profunda.** Por eso la
/// flecha siempre va hacia la derecha, y por eso un activo de nivel 3 puede quedar a la
/// izquierda de uno de nivel 1.
///
/// La columna de un nodo es uno más que la del más lejano de los que dependen de él: así
/// toda arista «A depende de B» queda con B estrictamente a la derecha de A, sin
/// excepciones. Los que no tienen a nadie encima —las aplicaciones finales— caen en la
/// columna 0.
///
/// **Este cálculo sólo termina porque no hay ciclos** (E3). Con un ciclo, cada vuelta
/// empujaría a sus miembros una columna más a la derecha y el recorrido no pararía nunca.
/// Es la razón concreta por la que la validación del ciclo no es una formalidad: sin ella
/// esta pantalla se cuelga. La guarda de `vueltas` está igual, porque un dato corrupto no
/// debería colgar una pantalla — pero si se dispara, hay un ciclo en la base.
export function columnasDelGrafo(
  activoIds: readonly number[],
  aristas: readonly Arista[],
): Map<number, number> {
  const columna = new Map<number, number>(activoIds.map((id) => [id, 0]));
  // Relajación repetida: mientras alguna arista viole «el destino va a la derecha», se
  // empuja. Sin ciclos converge en, como mucho, tantas vueltas como nodos.
  const tope = activoIds.length + 1;
  let vueltas = 0;
  let cambio = true;
  while (cambio && vueltas < tope) {
    cambio = false;
    vueltas += 1;
    for (const a of aristas) {
      const desde = columna.get(a.activoId);
      const hasta = columna.get(a.dependeDeId);
      if (desde === undefined || hasta === undefined) continue;
      if (hasta <= desde) {
        columna.set(a.dependeDeId, desde + 1);
        cambio = true;
      }
    }
  }
  return columna;
}

/// **D5 · el orden vertical dentro de una columna, por baricentro.**
///
/// Hasta acá las cajas se apilaban en el orden en que venían de la consulta —por código—, así
/// que ninguna quedaba cerca de aquello con lo que se conecta y toda arista era una diagonal
/// larga. Cada pasada reordena una columna por el promedio de los índices de sus vecinos del
/// lado contrario; las pasadas alternan de izquierda a derecha y de derecha a izquierda.
///
/// Es el algoritmo clásico de reducción de cruces, no un motor de acomodo: aritmética sobre
/// dos mapas, sin fuerzas ni simulación.
///
/// **Determinista, y eso no es un detalle.** El grafo se dibuja a mano porque «un mapa que se
/// mueve solo no se puede señalar con el dedo en una reunión». Por eso:
///
/// - el orden inicial y todos los empates se rompen por `desempate` —el código— y, si también
///   empata, por id. Nunca por el orden de llegada de las filas;
/// - un nodo sin vecinos de ese lado **conserva su índice** en vez de irse al tope: empujarlo
///   al cero desplazaría a los que sí tienen una razón para estar ahí.
///
/// Devuelve `id → índice dentro de su columna`, siempre `0..n-1` sin huecos.
export function ordenDentroDeColumnas(
  columnas: ReadonlyMap<number, number>,
  aristas: readonly Arista[],
  desempate: ReadonlyMap<number, string>,
  pasadas = 3,
): Map<number, number> {
  const clave = (id: number) => desempate.get(id) ?? String(id);
  // El orden base no depende del orden de inserción de `columnas`: se ordena todo primero y
  // se agrupa después.
  const ids = [...columnas.keys()].sort((x, y) => {
    const cx = columnas.get(x) as number;
    const cy = columnas.get(y) as number;
    if (cx !== cy) return cx - cy;
    const kx = clave(x);
    const ky = clave(y);
    return kx === ky ? x - y : kx < ky ? -1 : 1;
  });

  const porColumna = new Map<number, number[]>();
  const indice = new Map<number, number>();
  for (const id of ids) {
    const c = columnas.get(id) as number;
    const previos = porColumna.get(c);
    if (previos === undefined) {
      porColumna.set(c, [id]);
      indice.set(id, 0);
    } else {
      indice.set(id, previos.length);
      previos.push(id);
    }
  }

  // El lado se decide por la columna y no por la dirección de la arista: así una arista que
  // salte varias columnas sigue contando, y una cuyos extremos no estén ambos dibujados se
  // descarta sola.
  const izquierda = new Map<number, number[]>();
  const derecha = new Map<number, number[]>();
  for (const a of aristas) {
    const ca = columnas.get(a.activoId);
    const cb = columnas.get(a.dependeDeId);
    if (ca === undefined || cb === undefined || ca === cb) continue;
    const [menor, mayor] = ca < cb ? [a.activoId, a.dependeDeId] : [a.dependeDeId, a.activoId];
    (izquierda.get(mayor) ?? izquierda.set(mayor, []).get(mayor) as number[]).push(menor);
    (derecha.get(menor) ?? derecha.set(menor, []).get(menor) as number[]).push(mayor);
  }

  const columnasOrdenadas = [...porColumna.keys()].sort((x, y) => x - y);

  for (let p = 0; p < pasadas; p += 1) {
    const haciaLaDerecha = p % 2 === 0;
    const recorrido = haciaLaDerecha ? columnasOrdenadas : [...columnasOrdenadas].reverse();
    const vecinosDe = haciaLaDerecha ? izquierda : derecha;
    for (const c of recorrido) {
      const enColumna = porColumna.get(c) as number[];
      const baricentro = new Map<number, number>();
      for (const id of enColumna) {
        const vecinos = vecinosDe.get(id) ?? [];
        baricentro.set(
          id,
          vecinos.length === 0
            ? (indice.get(id) as number)
            : vecinos.reduce((s, v) => s + (indice.get(v) as number), 0) / vecinos.length,
        );
      }
      enColumna.sort((x, y) => {
        const bx = baricentro.get(x) as number;
        const by = baricentro.get(y) as number;
        if (bx !== by) return bx - by;
        const kx = clave(x);
        const ky = clave(y);
        return kx === ky ? x - y : kx < ky ? -1 : 1;
      });
      enColumna.forEach((id, i) => indice.set(id, i));
    }
  }

  return indice;
}

export interface SubgrafoFiltrado {
  /// Los activos de la rama elegida. Son el tema de la pantalla.
  sujeto: Set<number>;
  /// Lo que sostiene a la rama sin pertenecer a ella: la infraestructura de `EMPRESA`, los
  /// externos. Contexto, no sujeto.
  frontera: Set<number>;
  /// Sólo las que tocan al menos un sujeto.
  aristas: Arista[];
}

/// **D2 · filtrar define quién es el SUJETO; lo que lo sostiene se dibuja como frontera.**
///
/// MINTRACE no se sostiene solo: su infraestructura vive en `EMPRESA` y sus externos no
/// cuelgan de ningún producto. Esconderlos dibujaría un MINTRACE apoyado en nada, que es lo
/// contrario de lo que este grafo promete responder.
///
/// **La frontera es de UN salto y las aristas frontera↔frontera no se dibujan.** Dos saltos
/// es el grafo entero disfrazado, y unir dos nodos de contexto entre sí lo trae de vuelta por
/// la puerta de atrás. Se dibuja una arista si y sólo si al menos uno de sus extremos es
/// sujeto.
///
/// Un sujeto sin ninguna arista sigue en el subgrafo (D11): con el filtro puesto, «qué activos
/// de la rama nadie conectó con nada» es el hallazgo, no un efecto secundario.
export function subgrafoDeRama(
  sujeto: ReadonlySet<number>,
  aristas: readonly Arista[],
): SubgrafoFiltrado {
  const frontera = new Set<number>();
  const dibujadas: Arista[] = [];
  for (const a of aristas) {
    const deDentro = sujeto.has(a.activoId);
    const aDentro = sujeto.has(a.dependeDeId);
    if (!deDentro && !aDentro) continue;
    dibujadas.push(a);
    if (!deDentro) frontera.add(a.activoId);
    if (!aDentro) frontera.add(a.dependeDeId);
  }
  return { sujeto: new Set(sujeto), frontera, aristas: dibujadas };
}

/// Los vecinos directos de un activo, en las dos direcciones y con el sentido dicho en
/// palabras. Es lo que el panel del grafo muestra al elegir un nodo.
export function vecinosDirectos(
  activoId: number,
  aristas: readonly Arista[],
): { activoId: number; sentido: 'depende de' | 'depende de él'; tipo: TipoDependencia }[] {
  return [
    ...aristas
      .filter((a) => a.activoId === activoId)
      .map((a) => ({ activoId: a.dependeDeId, sentido: 'depende de' as const, tipo: a.tipo })),
    ...aristas
      .filter((a) => a.dependeDeId === activoId)
      .map((a) => ({ activoId: a.activoId, sentido: 'depende de él' as const, tipo: a.tipo })),
  ];
}
