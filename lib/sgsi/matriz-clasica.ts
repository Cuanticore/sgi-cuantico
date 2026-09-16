// lib/sgsi/matriz-clasica.ts
//
// La matriz de riesgo clásica: bandas de IMPACTO en las filas, puntos de FRECUENCIA en las
// columnas, y en cada casilla cuántos riesgos caen ahí.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO CÓDIGO DENTRO DE LA PANTALLA ─────────────────────────
//
// Nació adentro de un `useMemo` de `MatricesRiesgo.tsx`, que era el único lugar que lo
// necesitaba. Dejó de serlo: el informe de valoración imprime la misma matriz por proceso, y
// la única forma de que el informe y la pantalla no se contradigan es que la casilla la
// decida UNA sola función. Copiarla habría funcionado hasta el primer ajuste de escala —el
// día que alguien corrige una y no la otra, el informe que el comité firma dice algo distinto
// de lo que muestra la aplicación, y no hay manera de saber cuál de los dos miente.
//
// Es puro y sin React ni Prisma por la misma razón que `informe-valoracion.ts`: lo que hay
// acá son las cuentas que se firman, y una cuenta que necesita una base de datos para
// probarse es una cuenta que nadie prueba.
//
// ── LA MATRIZ NO SE GUARDA ──────────────────────────────────────────────────────────────
//
// Se deriva al leer, siempre. Una matriz almacenada es un segundo lugar donde vive la misma
// cifra, y dos lugares es como un informe termina contradiciéndose a sí mismo. Es una lección
// ya pagada: la v1 tenía conteos materializados y daban distinto de la pantalla.

import { clasificar, type Umbral } from './clasificar';

/// Una fila: una banda de impacto, con su punto medio.
///
/// El medio no es decoración — es lo que le da a la casilla su banda de riesgo. Una casilla
/// es una banda de impacto cruzada con un punto de frecuencia, así que su riesgo
/// representativo es el medio de la banda por la frecuencia. Se deriva de los umbrales y no
/// se escribe a mano.
export interface FilaImpacto {
  nombre: string;
  desde: number;
  hasta: number;
  medio: number;
}

/// Una columna: un punto de la escala de frecuencia.
export interface ColumnaFrecuencia {
  /// «Muy alta». El encabezado sólo tiene lugar para el grado.
  nombre: string;
  /// «Muy alta — ocurre a diario». La lectura completa, para el `title`.
  lectura: string;
  vecesAno: number;
}

/// Dónde cae un riesgo en las dos matrices. `-1` es «no se pudo ubicar», y es un estado que
/// se cuenta y se informa, nunca uno que se disimula metiéndolo en la banda más baja.
export interface Ubicacion {
  /// La fila, por la banda de impacto. `-1` si el impacto no clasifica en ninguna.
  i: number;
  /// La columna en la matriz inherente.
  inherente: number;
  /// La columna en la residual. `-1` cuando el ARO residual no está calculado — eficacia
  /// DESCONOCIDA, que no es lo mismo que frecuencia cero y la matriz no puede confundirlos.
  residual: number;
}

/// Lo mínimo que hay que saber de un riesgo para ubicarlo.
export interface RiesgoUbicable {
  impacto: number;
  /// Veces al año, inherente.
  aro: number;
  /// Veces al año después de los controles. `null` es «sin calcular».
  aroResidual: number | null;
}

/// La columna a la que cae una frecuencia: la más cercana EN ÓRDENES DE MAGNITUD.
///
/// La escala de frecuencia es geométrica —0,01 · 0,1 · 1 · 10 · 100—, así que «cercano» tiene
/// que medirse en décadas y no en distancia lisa. Con distancia lisa, un ARO de 5,5 caería en
/// «una vez al año» (|5,5−1| = 4,5) en vez de en «cada mes» (|5,5−10| = 4,5 pero a un factor
/// 1,8 contra un factor 5,5): década por década está mucho más cerca de 10.
///
/// Es una desviación deliberada del prototipo, que usa distancia lisa, y sólo mueve valores
/// RESIDUALES: un ARO inherente siempre cae exacto sobre un punto de la escala.
///
/// Frecuencia cero o negativa cae en la primera columna: una eficacia del 100 % lleva el ARO
/// a cero, y el logaritmo de cero no existe.
export function columnaDeFrecuencia(
  veces: number,
  columnas: readonly ColumnaFrecuencia[],
): number {
  if (columnas.length === 0) return -1;
  if (!(veces > 0)) return 0;

  const log = Math.log10(veces);
  let mejor = 0;
  let distancia = Infinity;
  for (let j = 0; j < columnas.length; j++) {
    const d = Math.abs(Math.log10(columnas[j].vecesAno) - log);
    if (d < distancia) {
      distancia = d;
      mejor = j;
    }
  }
  return mejor;
}

/// Ubica un riesgo en las dos matrices.
export function ubicarRiesgo(
  riesgo: RiesgoUbicable,
  filas: readonly FilaImpacto[],
  columnas: readonly ColumnaFrecuencia[],
): Ubicacion {
  const banda = clasificar(riesgo.impacto, filas);
  return {
    i: banda === null ? -1 : filas.findIndex((f) => f.nombre === banda),
    inherente: columnaDeFrecuencia(riesgo.aro, columnas),
    residual:
      riesgo.aroResidual === null ? -1 : columnaDeFrecuencia(riesgo.aroResidual, columnas),
  };
}

/// Cuál de las dos matrices se está contando.
export type CaraMatriz = 'inherente' | 'residual';

export interface MatrizClasica {
  cara: CaraMatriz;
  /// `conteos[i][j]` — cuántos riesgos en la casilla.
  conteos: number[][];
  /// `bandas[i][j]` — la banda de riesgo de la casilla, por su riesgo representativo. Es
  /// una propiedad de la CASILLA y no de lo que cayó adentro: una casilla vacía sigue siendo
  /// crítica, y el informe la pinta igual. Esa es justamente la lectura que aporta.
  bandas: (string | null)[][];
  /// Cuántos riesgos entraron en la matriz.
  total: number;
  /// Cuántos NO se pudieron ubicar, y por qué. Se informa: un riesgo que desaparece de la
  /// matriz sin dejar rastro es una cifra que nadie puede cuadrar contra el inventario.
  sinImpacto: number;
  /// Sólo en la residual: riesgos cuyo ARO residual no está calculado.
  sinResidual: number;
}

/// Cuenta la matriz. Las ubicaciones llegan ya resueltas para que filtrar —por proceso, por
/// responsable— sea quedarse con un subconjunto, sin recalcular nada.
export function contarMatriz(
  ubicaciones: readonly Ubicacion[],
  cara: CaraMatriz,
  filas: readonly FilaImpacto[],
  columnas: readonly ColumnaFrecuencia[],
  bandasRiesgo: readonly Umbral[],
): MatrizClasica {
  const conteos = filas.map(() => columnas.map(() => 0));
  let total = 0;
  let sinImpacto = 0;
  let sinResidual = 0;

  for (const u of ubicaciones) {
    const j = cara === 'inherente' ? u.inherente : u.residual;
    if (u.i < 0) {
      sinImpacto++;
      continue;
    }
    if (j < 0) {
      sinResidual++;
      continue;
    }
    conteos[u.i][j]++;
    total++;
  }

  const bandas = filas.map((f) =>
    columnas.map((c) => clasificar(f.medio * c.vecesAno, bandasRiesgo)),
  );

  return { cara, conteos, bandas, total, sinImpacto, sinResidual };
}

/// Los umbrales de impacto tal como los entrega el catálogo, convertidos en filas con su
/// punto medio. Una sola forma de construirlas, para que la pantalla y el informe no puedan
/// discrepar en el medio de una banda.
export function filasDeUmbrales(
  umbrales: readonly { nombre: string; desde: unknown; hasta: unknown }[],
): FilaImpacto[] {
  return umbrales.map((u) => {
    const desde = Number(u.desde);
    const hasta = Number(u.hasta);
    return { nombre: u.nombre, desde, hasta, medio: (desde + hasta) / 2 };
  });
}

/// Las columnas tal como las entrega `escala_frecuencia`. El nombre del catálogo es
/// «Muy alta — ocurre a diario»: el encabezado se queda con el grado y la lectura completa
/// viaja aparte, porque una columna de matriz no tiene ancho para una frase.
export function columnasDeEscala(
  escala: readonly { nombre: string; vecesAno: unknown }[],
): ColumnaFrecuencia[] {
  return escala.map((f) => ({
    nombre: f.nombre.split('—')[0].trim(),
    lectura: f.nombre,
    vecesAno: Number(f.vecesAno),
  }));
}
