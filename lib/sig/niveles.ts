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
