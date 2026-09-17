// lib/sig/apagar-raiz.ts
//
// Decide si una raíz del inventario se puede sacar del árbol sin perder información.
//
// `armarArbol` filtra por `activo` (`lib/sig/niveles.ts:335`), así que apagar una raíz no
// reubica lo que cuelga de ella: lo esconde. Si tenía activos, el mapa se ve más limpio
// justamente porque perdió información, y el aviso ámbar de «Fuera del árbol» crece sin que
// nadie lo relacione con este cambio.
//
// Por eso esta función sólo autoriza el apagado cuando la rama está vacía. Cuando no lo está
// se niega y enumera qué hay: mudar activos de una rama a otra es una decisión de negocio, no
// algo que un script deba resolver solo.

import { normalizarNombreNivel } from './nombre-nivel';

export type { NivelCrudo } from './fusion-niveles';
import type { NivelCrudo } from './fusion-niveles';

export type PlanApagado = {
  /// El id a apagar, o `null` si no hay nada que hacer o hay impedimentos.
  apagar: number | null;
  /// Vacío significa «se puede». Si trae algo, `apagar` viene en `null`.
  impedimentos: string[];
};

export function planDeApagadoDeRaiz(niveles: NivelCrudo[], nombreRaiz: string): PlanApagado {
  const buscado = normalizarNombreNivel(nombreRaiz);
  const raiz = niveles.find(
    (n) => n.grado === 1 && n.padreId === null && normalizarNombreNivel(n.nombre) === buscado,
  );

  // No existe, o alguien ya la apagó. En ninguno de los dos casos hay un cambio que hacer.
  if (!raiz || !raiz.activo) return { apagar: null, impedimentos: [] };

  const hijos = new Map<number, NivelCrudo[]>();
  for (const n of niveles) {
    if (n.padreId === null) continue;
    const lista = hijos.get(n.padreId);
    if (lista) lista.push(n);
    else hijos.set(n.padreId, [n]);
  }

  // Sólo cuenta lo que hoy se ve. Un hijo ya apagado no se pierde al apagar al padre.
  let nivelesVivos = 0;
  let activos = 0;
  const recorrer = (id: number): void => {
    for (const h of hijos.get(id) ?? []) {
      if (!h.activo) continue;
      nivelesVivos += 1;
      activos += h.activosDirectos;
      recorrer(h.id);
    }
  };
  recorrer(raiz.id);
  activos += raiz.activosDirectos;

  const impedimentos: string[] = [];
  if (activos > 0) {
    impedimentos.push(
      `${activos} activo(s) en su rama: apagarla los dejaría fuera del árbol. Reubicarlos primero.`,
    );
  }
  if (nivelesVivos > 0) {
    impedimentos.push(
      `${nivelesVivos} nivel(es) vigente(s) cuelgan de ella y quedarían colgando de un padre invisible.`,
    );
  }
  if (raiz.encabezaProducto) {
    impedimentos.push('Encabeza un Producto, que quedaría apuntando a un nivel apagado.');
  }

  return { apagar: impedimentos.length === 0 ? raiz.id : null, impedimentos };
}
