// lib/sig/catalogo-nivel-3.ts
//
// Qué ofrece el selector de Nivel 3 de la ficha del activo. Módulo PURO.
//
// **El selector ofrecía sólo los nodos que ya colgaban del Nivel 2 elegido**, y eso convertía
// clasificar un activo en una tarea de dos pantallas: bajo `PROYECTOS / INC`, que tiene dos
// hijos, un activo de código fuente obligaba a salir a `/tecnologia/niveles` a crear el nodo y
// volver. `CÓDIGO FUENTE` existe en otras nueve ramas; lo que no existía era en ésta.
//
// Acá se ofrecen dos grupos: lo que ya cuelga de la rama —con su id, listo para elegir— y lo que
// el catálogo de la clase permite y la rama todavía no tiene. Elegir del segundo grupo NO
// reutiliza el nodo de otra rama: crea uno propio. E2 no cambia — el activo sigue apuntando a un
// nodo de grado 3 que es suyo y de nadie más.
//
// Vive aparte de la ficha porque es donde está la corrección y donde las pruebas son baratas:
// `FichaActivo.tsx` pasa de las 4.800 líneas, y meter la regla adentro la haría comprobable sólo
// montando el componente.

import { claseDeNivel, type ClaseNivel, type Nivel } from './niveles';
import { normalizarNombreNivel } from './nombre-nivel';

export type OpcionNivel3 =
  /// Un nodo que ya cuelga de esta rama. Se elige por id, como siempre.
  | { tipo: 'existente'; id: number; nombre: string }
  /// Un nombre del vocabulario que esta rama todavía no tiene. Elegirlo crea el nodo, y lo crea
  /// **al guardar**: ver `guardarDatosGenerales`.
  | { tipo: 'del-catalogo'; nombre: string };

export interface EntradaCatalogo {
  clase: ClaseNivel;
  nombre: string;
  orden: number;
}

/// Las opciones de Nivel 3 para el Nivel 2 elegido: primero lo que ya cuelga de él, después lo
/// que el catálogo de su clase permite.
///
/// **La clase se deriva subiendo por `padreId`, no se lee del Nivel 2.** Los grados 2 y 3 no
/// guardan clase —si la guardaran, un hijo podría contradecir a su padre y nadie sabría cuál de
/// los dos miente—, así que la única forma honesta de saberla es preguntarle a la raíz.
///
/// **Una rama huérfana no recibe vocabulario adivinado.** Si la cadena no llega a una raíz con
/// clase, se devuelven sólo los existentes. Ofrecer el catálogo de PRODUCTOS «porque suele ser
/// ése» escondería la rama rota, que es justo lo que hay que ver — la misma postura que toma
/// `conElegido` en la ficha al agregar un nivel guardado que no encaja.
///
/// La comparación entre lo que hay y lo que el catálogo ofrece es por nombre NORMALIZADO, con la
/// misma regla que usan los escritores masivos. Con igualdad literal, un árbol sin estandarizar
/// —`Código fuente` en la rama, `CÓDIGO FUENTE` en el catálogo— ofrecería las dos y le pediría a
/// la persona que eligiera entre dos cosas idénticas.
export function opcionesDeNivel3(
  catalogo: readonly EntradaCatalogo[],
  niveles: readonly Nivel[],
  nivel2Id: number | null,
): OpcionNivel3[] {
  if (nivel2Id === null) return [];

  // Los inactivos no se ofrecen: `asignarNivelAActivo` los rechaza, así que ofrecerlos sería
  // ofrecer un camino que el servidor va a negar. Tampoco ocupan su nombre — si alguien
  // desactivó `DEPENDENCIAS` bajo esta rama, el nombre tiene que poder volver por el catálogo.
  const existentes: OpcionNivel3[] = niveles
    .filter((n) => n.grado === 3 && n.padreId === nivel2Id && n.activo)
    .map((n) => ({ tipo: 'existente', id: n.id, nombre: n.nombre }));

  const clase = claseDeNivel(nivel2Id, niveles);
  if (clase === null) return existentes;

  const ocupados = new Set(existentes.map((o) => normalizarNombreNivel(o.nombre)));

  const nuevos: OpcionNivel3[] = catalogo
    .filter((c) => c.clase === clase && !ocupados.has(normalizarNombreNivel(c.nombre)))
    .slice()
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => ({ tipo: 'del-catalogo', nombre: c.nombre }));

  return [...existentes, ...nuevos];
}
