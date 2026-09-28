// lib/sgsi/arbol-analisis.ts
//
// La lista de filas de la grilla cuando algunos activos están expandidos.
//
// POR QUÉ ES UN MÓDULO Y NO TRES LÍNEAS DENTRO DEL COMPONENTE. Es una decisión —qué filas
// existen, en qué orden y de quién cuelga cada una— y las decisiones de esta pantalla se
// prueban puras, en milisegundos, sin montar AG Grid. El cableado queda en `GrillaAnalisis`.
//
// EL ÁRBOL SE CONSTRUYE A MANO Y NO ES CAPRICHO. De los 67 módulos de `ag-grid-community`
// ninguno es de agrupación ni de árbol: Row Grouping, Tree Data y Master/Detail son de AG Grid
// Enterprise (999 USD por desarrollador). Lo que sí trae Community es `isFullWidthRow` y
// `fullWidthCellRenderer`, y con eso alcanza — el mismo criterio con que se resolvió exportar
// a Excel con estilos en vez de pagar la licencia.
//
// EL HIJO VA EN UNA FRANJA DE ANCHO COMPLETO, no alineado bajo las columnas del padre. Un
// riesgo no tiene «Proceso» ni «Propietario» propios; ponerlo bajo esas columnas diría que sí.

import type { FilaAnalisis, RiesgoDeFila } from './analisis-riesgos';

/// Lo que la grilla muestra de un riesgo cuando su activo está expandido.
export interface FilaRiesgoArbol {
  tipo: 'riesgo';
  /// El código del ACTIVO al que cuelga. Es lo que hace visible, desde el dato, que esta fila
  /// no se sostiene sola: si algún día aparece huérfana, se ve en el modelo y no en pantalla.
  padre: string;
  amenazaCodigo: string;
  amenazaNombre: string;
  residual: string | null;
  /// El control que debería contener esta amenaza, y la brecha YA EVALUADA. Viajan hasta acá
  /// porque `brechaDelRiesgo` necesita el activo entero —criticidad y valores— y recalcularla
  /// en la pantalla sería la segunda cuenta que separa las dos vistas.
  principal: { codigo: string; nivel: number | null } | null;
  brecha: RiesgoDeFila['brecha'];
}

export interface FilaActivoArbol extends FilaAnalisis {
  tipo: 'activo';
  /// Cuántos riesgos colgarían de este activo si se expandiera. Se calcula acá y no en el
  /// renderizador para que el expansor pueda decir «23» antes de abrir nada.
  hijos: number;
}

export type FilaArbol = FilaActivoArbol | FilaRiesgoArbol;

/// Los riesgos de un activo, como los necesita el árbol.
export type RiesgoDeArbol = RiesgoDeFila;

/// Arma la lista que recibe AG Grid: cada activo, y detrás de él sus riesgos SÓLO si está
/// expandido.
///
/// LOS HIJOS VAN INMEDIATAMENTE DETRÁS DE SU PADRE, y ese orden es todo lo que sostiene la
/// relación: AG Grid no sabe que son hijos de nadie. Por eso `GrillaAnalisis` colapsa el árbol
/// entero cuando alguien ordena o filtra — si no, la grilla reubica las filas por su cuenta y
/// los hijos quedan bajo un activo que no es el suyo, sin que nada proteste.
export function armarFilasArbol(
  filas: readonly FilaAnalisis[],
  riesgosPorActivo: ReadonlyMap<string, readonly RiesgoDeArbol[]>,
  expandidos: ReadonlySet<string>,
): FilaArbol[] {
  const salida: FilaArbol[] = [];

  for (const f of filas) {
    const vigentes = (riesgosPorActivo.get(f.codigo) ?? []).filter((r) => !r.obsoleto);
    salida.push({ ...f, tipo: 'activo', hijos: vigentes.length });

    if (!expandidos.has(f.codigo)) continue;

    for (const r of vigentes) {
      salida.push({
        tipo: 'riesgo',
        padre: f.codigo,
        amenazaCodigo: r.amenazaCodigo,
        amenazaNombre: r.amenazaNombre,
        residual: r.residual,
        principal: r.principal,
        brecha: r.brecha,
      });
    }
  }

  return salida;
}

/// ¿Esta fila es una franja de riesgo? Lo usa `isFullWidthRow`, y existe como función con
/// nombre para que la pregunta se lea igual en la grilla y en la prueba.
export function esFilaDeRiesgo(fila: FilaArbol | undefined): boolean {
  return fila !== undefined && fila.tipo === 'riesgo';
}
