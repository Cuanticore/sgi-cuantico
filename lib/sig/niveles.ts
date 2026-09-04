// lib/sig/niveles.ts
//
// La jerarquía de tres grados del inventario. Módulo PURO.
//
// **E1 · es una jerarquía de verdad, no tres columnas sueltas.** En el Excel nada impide
// que `MINTRACE` aparezca bajo `EMPRESA`, porque son tres celdas y cualquier combinación se
// puede escribir. Acá el nivel 2 pertenece a un nivel 1 y el 3 a un 2, y eso lo valida el
// servidor con estas funciones.
//
// **E2 · el activo apunta al nivel 3.** Los grados 1 y 2 se derivan subiendo por `padreId`.
// Guardar los tres sería guardar lo derivable, y permitiría que un activo dijera que está
// en `PRODUCTOS / MINTRACE / Ambientes` mientras su nivel 3 cuelga de otra rama.

export type ClaseNivel = 'EMPRESA' | 'PRODUCTOS' | 'PROYECTOS';

export interface Nivel {
  id: number;
  grado: number;
  nombre: string;
  padreId: number | null;
  clase: ClaseNivel | null;
  activo: boolean;
}

/// La cadena desde la raíz hasta el nivel dado: `[grado 1, grado 2, grado 3]`.
///
/// Devuelve lo que haya, no lo que debería haber: un nivel 3 huérfano devuelve un solo
/// elemento. Rellenar la cadena con marcadores escondería exactamente el dato roto que la
/// pantalla necesita mostrar.
///
/// El recorrido corta si vuelve a pisar un id ya visto. Un ciclo en la jerarquía no debería
/// existir, pero si existiera, colgar la pantalla sería peor que dibujarlo mal.
export function cadenaDeNivel(nivelId: number, niveles: readonly Nivel[]): Nivel[] {
  const porId = new Map(niveles.map((n) => [n.id, n]));
  const cadena: Nivel[] = [];
  const vistos = new Set<number>();
  let actual = porId.get(nivelId);
  while (actual !== undefined && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    cadena.unshift(actual);
    actual = actual.padreId === null ? undefined : porId.get(actual.padreId);
  }
  return cadena;
}

/// La clase del nivel, heredada de su raíz. **No se almacena en los grados 2 y 3**: si se
/// almacenara, un hijo podría contradecir a su padre y nadie sabría cuál de los dos miente.
export function claseDeNivel(nivelId: number, niveles: readonly Nivel[]): ClaseNivel | null {
  return cadenaDeNivel(nivelId, niveles)[0]?.clase ?? null;
}

/// La ruta legible: `PRODUCTOS · MINTRACE · Ambientes`.
export function rutaDeNivel(nivelId: number, niveles: readonly Nivel[]): string {
  return cadenaDeNivel(nivelId, niveles)
    .map((n) => n.nombre)
    .join(' · ');
}

/// E1 · si un nivel puede colgar de otro. Devuelve el motivo del rechazo, no un booleano:
/// «no se puede» sin decir por qué manda a alguien a probar combinaciones.
export function validarPadre(
  grado: number,
  padreId: number | null,
  niveles: readonly Nivel[],
): { ok: true } | { ok: false; motivo: string } {
  if (grado < 1 || grado > 3) {
    return { ok: false, motivo: 'la jerarquía tiene exactamente tres grados' };
  }
  if (grado === 1) {
    // Los tres valores de grado 1 son cerrados (D8) y no cuelgan de nada.
    return padreId === null
      ? { ok: true }
      : { ok: false, motivo: 'un nivel de grado 1 no cuelga de nadie: es la raíz' };
  }
  if (padreId === null) {
    return { ok: false, motivo: `un nivel de grado ${grado} tiene que colgar de uno de grado ${grado - 1}` };
  }
  const padre = niveles.find((n) => n.id === padreId);
  if (padre === undefined) return { ok: false, motivo: 'el nivel padre no existe' };
  if (padre.grado !== grado - 1) {
    // Es el error que el Excel no puede evitar: un nivel 2 colgando de otro nivel 2.
    return {
      ok: false,
      motivo: `un nivel de grado ${grado} no puede colgar de uno de grado ${padre.grado}`,
    };
  }
  if (!padre.activo) {
    return { ok: false, motivo: 'el nivel padre está inactivo' };
  }
  return { ok: true };
}

/// E1 · qué impide desactivar un nivel. **Un nivel con hijos no se desactiva sin resolver
/// qué pasa con ellos**, y un nivel 3 con activos tampoco: los activos quedarían apuntando
/// a una rama que ya no se dibuja, que es la forma silenciosa de perder inventario.
export function impedimentosParaDesactivar(
  nivelId: number,
  niveles: readonly Nivel[],
  activosPorNivel: ReadonlyMap<number, number>,
): string[] {
  const impedimentos: string[] = [];
  const hijos = niveles.filter((n) => n.padreId === nivelId && n.activo);
  if (hijos.length > 0) {
    impedimentos.push(
      `tiene ${hijos.length} nivel(es) debajo: ${hijos.map((h) => h.nombre).join(', ')}`,
    );
  }
  const conActivos = activosPorNivel.get(nivelId) ?? 0;
  if (conActivos > 0) {
    impedimentos.push(`${conActivos} activo(s) apuntan a este nivel`);
  }
  return impedimentos;
}

export interface EsperadoDePlantilla {
  nombreNivel3: string;
  activoEsperado: string;
  obligatorio: boolean;
}

export interface Faltante {
  nombreNivel3: string;
  activoEsperado: string;
  obligatorio: boolean;
}

/// E8 · **la plantilla no bloquea: señala lo que falta.**
///
/// Compara lo que la plantilla espera contra los nombres de activo que hay bajo cada nivel
/// 3 del producto. Un producto incompleto se puede guardar; lo que no se puede es que nadie
/// lo sepa.
///
/// La comparación es por nombre normalizado y por CONTENCIÓN, no por igualdad: el activo
/// esperado «Staging» se da por cubierto con «Staging MINTRACE» o «Ambiente de staging».
/// Exigir el nombre exacto produciría faltantes falsos en cada producto, y una lista de
/// faltantes con ruido es una lista que nadie mira.
export function faltantesDePlantilla(
  plantilla: readonly EsperadoDePlantilla[],
  presentesPorNivel3: ReadonlyMap<string, readonly string[]>,
): Faltante[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const faltantes: Faltante[] = [];
  for (const e of plantilla) {
    const presentes = presentesPorNivel3.get(e.nombreNivel3) ?? [];
    const cubierto = presentes.some((p) => norm(p).includes(norm(e.activoEsperado)));
    if (!cubierto) {
      faltantes.push({
        nombreNivel3: e.nombreNivel3,
        activoEsperado: e.activoEsperado,
        obligatorio: e.obligatorio,
      });
    }
  }
  return faltantes;
}

/// El texto de la ficha del producto: «le faltan el ambiente de staging y la documentación
/// pública». Se genera de los faltantes para que no envejezca cuando la plantilla cambie.
///
/// Los opcionales se nombran aparte: mezclarlos con los obligatorios haría que un producto
/// interno sin documentación pública se viera igual de incompleto que uno sin ambiente de
/// producción, y no lo está.
export function resumenDeFaltantes(faltantes: readonly Faltante[]): string {
  if (faltantes.length === 0) return 'La configuración mínima está completa.';
  const obligatorios = faltantes.filter((f) => f.obligatorio).map((f) => f.activoEsperado.toLowerCase());
  const opcionales = faltantes.filter((f) => !f.obligatorio).map((f) => f.activoEsperado.toLowerCase());
  const partes: string[] = [];
  if (obligatorios.length > 0) partes.push(`Le falta${obligatorios.length > 1 ? 'n' : ''} ${lista(obligatorios)}.`);
  if (opcionales.length > 0) partes.push(`Sin ${lista(opcionales)}, que es opcional.`);
  return partes.join(' ');
}

function lista(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export const ETIQUETA_CLASE: Record<ClaseNivel, string> = {
  EMPRESA: 'Empresa',
  PRODUCTOS: 'Productos',
  PROYECTOS: 'Proyectos',
};

// ─── El árbol del mapa tecnológico ─────────────────────────────────────────────────────

export type ClaseNodo = 'NIVEL_1' | 'NIVEL_2' | 'NIVEL_3' | 'ACTIVO' | 'DESPLIEGUE';

export interface NodoArbol {
  /// Único en todo el árbol. Lleva el prefijo del tipo porque un nivel y un activo pueden
  /// compartir id numérico y en una lista plana chocarían.
  id: string;
  padreId: string | null;
  clase: ClaseNodo;
  nombre: string;
  /// El código del activo, o `null` en los nodos que no lo tienen.
  codigo: string | null;
  profundidad: number;
  /// Lo que se dibuja a la derecha del nombre: el tipo del activo, el ambiente del
  /// despliegue, el conteo de hijos de un nivel.
  meta: string | null;
  /// Una marca que exige atención: «sin propietario», «legacy», «sin valorar».
  marca: string | null;
  refId: number;
}

export interface EntradaArbol {
  niveles: readonly Nivel[];
  activos: readonly {
    id: number;
    codigo: string | null;
    nombre: string;
    nivelId: number | null;
    tipo: string;
    propietarioId: number | null;
    criticidad: number | null;
  }[];
  despliegues: readonly {
    id: number;
    activoId: number | null;
    nombre: string;
    ambiente: string;
    estado: string;
  }[];
}

/// **D3 (02/09/2026) · el mapa incluye los despliegues como HOJAS**, no se detiene en el
/// activo. Es donde está la información que hoy no se ve, y el despliegue sigue sin ser un
/// activo: es una hoja de presentación, no un nodo del inventario.
///
/// Devuelve la lista PLANA en orden de recorrido. Plana y no anidada porque la pantalla
/// necesita poder colapsar cualquier rama sin volver a recorrer un árbol de objetos, y
/// porque el orden de una lista plana es el orden en que se lee.
///
/// **Lo que no encaja se muestra igual, al final.** Los activos sin nivel y los despliegues
/// sin activo padre son el trabajo pendiente del módulo; esconderlos haría que el mapa se
/// viera completo justamente porque le falta información.
export function armarArbol(e: EntradaArbol): NodoArbol[] {
  const salida: NodoArbol[] = [];
  const activosPorNivel = new Map<number, EntradaArbol['activos'][number][]>();
  for (const a of e.activos) {
    if (a.nivelId === null) continue;
    const previos = activosPorNivel.get(a.nivelId);
    if (previos === undefined) activosPorNivel.set(a.nivelId, [a]);
    else previos.push(a);
  }
  const desplieguesPorActivo = new Map<number, EntradaArbol['despliegues'][number][]>();
  for (const d of e.despliegues) {
    if (d.activoId === null) continue;
    const previos = desplieguesPorActivo.get(d.activoId);
    if (previos === undefined) desplieguesPorActivo.set(d.activoId, [d]);
    else previos.push(d);
  }

  const marcaDeActivo = (a: EntradaArbol['activos'][number]): string | null => {
    // Se reporta UNA marca, la más grave: dos etiquetas en la misma fila del árbol compiten
    // por la atención y ninguna gana.
    if (a.propietarioId === null) return 'sin propietario';
    if (a.criticidad === null) return 'sin valorar';
    return null;
  };

  const empujarActivos = (nivelId: number, padreId: string, profundidad: number) => {
    for (const a of activosPorNivel.get(nivelId) ?? []) {
      const idActivo = `a${a.id}`;
      salida.push({
        id: idActivo,
        padreId,
        clase: 'ACTIVO',
        nombre: a.nombre,
        codigo: a.codigo,
        profundidad,
        meta: a.tipo,
        marca: marcaDeActivo(a),
        refId: a.id,
      });
      for (const d of desplieguesPorActivo.get(a.id) ?? []) {
        salida.push({
          id: `d${d.id}`,
          padreId: idActivo,
          clase: 'DESPLIEGUE',
          nombre: d.nombre,
          codigo: null,
          profundidad: profundidad + 1,
          meta: d.ambiente,
          marca: /legacy|aband/i.test(d.estado) ? d.estado : null,
          refId: d.id,
        });
      }
    }
  };

  const vigentes = e.niveles.filter((n) => n.activo);
  for (const n1 of vigentes.filter((n) => n.grado === 1)) {
    const id1 = `n${n1.id}`;
    salida.push({
      id: id1,
      padreId: null,
      clase: 'NIVEL_1',
      nombre: n1.nombre,
      codigo: null,
      profundidad: 0,
      meta: null,
      marca: null,
      refId: n1.id,
    });
    empujarActivos(n1.id, id1, 1);

    for (const n2 of vigentes.filter((n) => n.padreId === n1.id && n.grado === 2)) {
      const id2 = `n${n2.id}`;
      salida.push({
        id: id2,
        padreId: id1,
        clase: 'NIVEL_2',
        nombre: n2.nombre,
        codigo: null,
        profundidad: 1,
        meta: null,
        marca: null,
        refId: n2.id,
      });
      empujarActivos(n2.id, id2, 2);

      for (const n3 of vigentes.filter((n) => n.padreId === n2.id && n.grado === 3)) {
        const id3 = `n${n3.id}`;
        const cuantos = (activosPorNivel.get(n3.id) ?? []).length;
        salida.push({
          id: id3,
          padreId: id2,
          clase: 'NIVEL_3',
          nombre: n3.nombre,
          codigo: null,
          profundidad: 2,
          meta: `${cuantos} activo(s)`,
          marca: cuantos === 0 ? 'vacío' : null,
          refId: n3.id,
        });
        empujarActivos(n3.id, id3, 3);
      }
    }
  }

  return salida;
}

/// Los nodos VISIBLES dado el conjunto de ramas abiertas. Un nodo se ve si todos sus
/// ancestros están abiertos.
///
/// Se calcula recorriendo la lista plana una sola vez y arrastrando la visibilidad del
/// padre: subir por la cadena en cada nodo sería cuadrático, y el árbol real tiene
/// centenares de nodos.
export function nodosVisibles(
  arbol: readonly NodoArbol[],
  abiertos: ReadonlySet<string>,
): NodoArbol[] {
  const visible = new Map<string, boolean>();
  const salida: NodoArbol[] = [];
  for (const n of arbol) {
    const seVe = n.padreId === null || (visible.get(n.padreId) === true && abiertos.has(n.padreId));
    if (seVe) salida.push(n);
    visible.set(n.id, seVe);
  }
  return salida;
}

/// Si un nodo tiene hijos. Lo necesita la flecha de expandir: dibujarla en una hoja invita
/// a un clic que no hace nada.
export function tieneHijos(arbol: readonly NodoArbol[], id: string): boolean {
  return arbol.some((n) => n.padreId === id);
}
