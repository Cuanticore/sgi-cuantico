// lib/sig/alcance-grupo.ts
//
// **P11 · qué se persiste cuando una obligación se dirige a un grupo de interés.**
//
// El selector de Nueva obligación ofrece UNA opción —«Un grupo de interés»— y debajo la lista
// de grupos activos. Pero lo que el usuario elige y lo que la base guarda **no son lo mismo**,
// y ése es exactamente el motivo por el que esta traducción es un módulo y no tres ternarios
// dentro del `onChange`: elegir «Todos» guarda `alcance: 'TODOS'` **sin** destino, y elegir
// cualquier otro guarda `alcance: 'GRUPO_INTERES'` **con** su id. Es la única opción del
// formulario donde la elección y la columna no coinciden, y una decisión así escrita en línea
// se copia mal la segunda vez que alguien la necesita.
//
// ── Las tres reglas que sostienen el módulo ──────────────────────────────────────────────
//
// **«Todos» es derivado, y por eso se guarda como `TODOS`.** Su pertenencia se calcula —«toda
// persona activa»— y no tiene filas de membresía (`GrupoInteres.derivado`, y la regla la
// escribe `grupos.ts`). Guardarlo como `GRUPO_INTERES` con su id produciría una obligación que
// **resuelve cero personas**: el generador busca membresías vigentes y no hay ninguna. No es
// un error que se vea: la obligación queda creada, activa, y no genera nada — el modo de falla
// exacto que `NIVEL_ACTIVO` tuvo durante meses. `alcance-equivalente.test.ts` lo fija.
//
// **Por eso «Todas las personas» salió del selector de alcance.** Ofrecer «Todas las personas»
// arriba *y* el grupo «Todos» abajo son dos entradas que producen **el mismo conjunto**, y así
// es como alguien crea la misma obligación dos veces sin darse cuenta. El valor `TODOS` del
// enum **no se borra ni se deprecia**: sigue siendo lo que esta función persiste al elegir el
// grupo derivado, y sigue siendo lo que resuelven el generador y la previsión. Lo que dejó de
// existir es la segunda puerta de entrada, no el valor.
//
// **Un grupo que el catálogo no tiene se rechaza con frase.** El catálogo trae sólo los
// ACTIVOS, así que un grupo inactivo sencillamente no está: da el mismo rechazo que uno
// inexistente, y es lo correcto. Sin el rechazo quedaría una obligación apuntando a un grupo
// que ninguna pantalla abre y al que el generador no le dirige nada — una obligación huérfana,
// que se ve igual que una que ya generó todo.

import type { AlcanceObligacion } from '@prisma/client';

/// Lo mínimo que hace falta saber de un grupo para decidir. Es la misma forma que
/// `GrupoConocido` de `grupos.ts` a propósito: el catálogo se arma una vez y sirve a los dos.
export interface GrupoOfrecido {
  id: number;
  nombre: string;
  derivado: boolean;
}

/// Lo que se escribe en las columnas de la obligación. Los dos únicos alcances que este
/// selector puede producir, y salen del **enum de Prisma** con `Extract`: si mañana el enum
/// renombra `TODOS`, esto deja de compilar en vez de guardar una cadena que no existe.
export interface DestinoDeAlcance {
  alcance: Extract<AlcanceObligacion, 'TODOS' | 'GRUPO_INTERES'>;
  /// Ausente —no `null`— cuando el alcance es `TODOS`. R4 cuenta los destinos definidos, y un
  /// `null` explícito contaría igual que ausente sólo por casualidad del filtro.
  alcanceGrupoInteresId?: number;
}

/// El resultado es una unión discriminada y no un `DestinoDeAlcance | null`: el motivo del
/// rechazo es la mitad útil de la respuesta, porque va a la pantalla tal cual.
export type DecisionDeAlcancePorGrupo =
  | { destino: DestinoDeAlcance; error: null }
  | { destino: null; error: string };

/// Traduce el grupo elegido en el selector a lo que se persiste.
///
/// No conoce Prisma ni la pantalla: recibe el id elegido y el catálogo de grupos activos, y
/// devuelve las columnas. Quien llama guarda o muestra el error, y no vuelve a decidir nada.
export function decidirAlcancePorGrupo(
  grupoId: number,
  ofrecidos: readonly GrupoOfrecido[],
): DecisionDeAlcancePorGrupo {
  if (!Number.isInteger(grupoId) || grupoId <= 0) {
    // El `<select>` vacío manda `''`, que `Number` convierte en `0`. Rechazarlo acá con su
    // propia frase evita que se lea como «el grupo 0 no existe», que suena a dato corrupto.
    return { destino: null, error: 'elegí a qué grupo de interés alcanza' };
  }

  const grupo = ofrecidos.find((g) => g.id === grupoId);
  if (grupo === undefined) {
    // La misma frase que `planificarGrupos`: el catálogo trae sólo los activos, así que un
    // grupo dado de baja y uno que nunca existió llegan acá indistinguibles — y se rechazan
    // igual, porque en los dos casos la obligación no tendría a quién alcanzar.
    return { destino: null, error: `el grupo de interés ${grupoId} no existe o está inactivo` };
  }

  if (grupo.derivado) {
    // El grupo derivado se persiste como `TODOS` **sin id**. Ver la segunda regla de arriba:
    // con id, la obligación resolvería cero personas en silencio.
    return { destino: { alcance: 'TODOS' }, error: null };
  }

  return { destino: { alcance: 'GRUPO_INTERES', alcanceGrupoInteresId: grupo.id }, error: null };
}
