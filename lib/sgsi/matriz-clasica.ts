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
  /// El riesgo REAL del par, las dos caras. Viaja con la ubicación porque el color de una
  /// casilla ocupada sale de lo que contiene y no de su punto representativo — ver
  /// `contarMatriz`. Sin esto la casilla no puede saber si miente.
  valorInherente: number;
  valorResidual: number | null;
  /// El activo, para la matriz que ubica activos en vez de amenazas.
  activoCodigo?: string;
}

/// Lo mínimo que hay que saber de un riesgo para ubicarlo.
export interface RiesgoUbicable {
  impacto: number;
  /// Veces al año, inherente.
  aro: number;
  /// Veces al año después de los controles. `null` es «sin calcular».
  aroResidual: number | null;
  /// El código del activo. Opcional: sólo la matriz de activos lo necesita.
  activoCodigo?: string;
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
    // El riesgo real, no el de la casilla: impacto × ARO, cada cara con su ARO.
    valorInherente: riesgo.impacto * riesgo.aro,
    valorResidual: riesgo.aroResidual === null ? null : riesgo.impacto * riesgo.aroResidual,
    activoCodigo: riesgo.activoCodigo,
  };
}

/// Cuál de las dos matrices se está contando.
export type CaraMatriz = 'inherente' | 'residual';

export interface MatrizClasica {
  cara: CaraMatriz;
  /// `conteos[i][j]` — cuántos riesgos en la casilla.
  conteos: number[][];
  /// `bandas[i][j]` — la banda con la que se PINTA la casilla.
  ///
  /// ── POR QUÉ NO ES SIEMPRE LA DE LA ZONA ───────────────────────────────────────────────
  ///
  /// El riesgo representativo de una casilla es el punto medio de su banda de impacto por la
  /// frecuencia NOMINAL de su columna. En la matriz inherente eso funciona: el ARO de un
  /// riesgo es exactamente uno de los cinco puntos de la escala, así que la casilla y lo que
  /// contiene hablan del mismo número.
  ///
  /// En la residual no. El ARO residual es CONTINUO —`ARO × (1 − eficacia)`— y casi nunca
  /// cae sobre un punto de la escala; `columnaDeFrecuencia` lo ajusta a la columna más
  /// cercana en décadas, que es correcto como ubicación pero pierde el factor. Medido sobre
  /// el registro real, 226 de 584 riesgos —el 39 %— quedaban dibujados en una casilla que
  /// los pintaba MENOS graves de lo que son, incluido el peor riesgo del activo más crítico:
  /// un residual de 13,00 (Alto) en una casilla pintada Medio.
  ///
  /// Así que una casilla OCUPADA se pinta con la banda del peor riesgo que contiene, y una
  /// casilla VACÍA conserva la de su zona. La lectura documentada se preserva —una casilla
  /// vacía en zona crítica sigue siendo crítica— y una casilla ocupada ya no puede mentir
  /// sobre lo que tiene.
  bandas: (string | null)[][];
  /// `bandasZona[i][j]` — la banda del punto representativo, siempre, esté ocupada o no. Es
  /// lo que permite al pie de la matriz explicar la diferencia cuando las dos difieren.
  bandasZona: (string | null)[][];
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
  // El peor riesgo REAL de cada casilla, para pintarla con lo que contiene.
  const peor = filas.map(() => columnas.map(() => Number.NEGATIVE_INFINITY));
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
    const valor = cara === 'inherente' ? u.valorInherente : u.valorResidual;
    if (valor !== null && valor > peor[u.i][j]) peor[u.i][j] = valor;
    total++;
  }

  const bandasZona = filas.map((f) =>
    columnas.map((c) => clasificar(f.medio * c.vecesAno, bandasRiesgo)),
  );
  const bandas = bandasZona.map((fila, i) =>
    fila.map((zona, j) =>
      conteos[i][j] === 0 ? zona : (clasificar(peor[i][j], bandasRiesgo) ?? zona),
    ),
  );

  return { cara, conteos, bandas, bandasZona, total, sinImpacto, sinResidual };
}

/// Cuántos riesgos hay en cada banda, contados por el valor PROPIO de cada riesgo.
///
/// Es la lista que acompaña a la matriz, y no se puede sacar sumando casillas. El color de
/// una casilla lo pone su peor riesgo; los demás que comparten esa casilla no se vuelven
/// graves por vecindad. Contar por casilla convertiría veinte riesgos medios en veinte altos
/// cada vez que un alto cae al lado.
///
/// Reparte exactamente los riesgos que `contarMatriz` dibuja en esa cara —los que no se
/// ubican quedan fuera de las dos cuentas—, así que la suma del reparto es su `total`. Esa
/// igualdad es lo que impide que el pie de la matriz contradiga a la matriz.
export function repartirPorBanda(
  ubicaciones: readonly Ubicacion[],
  cara: CaraMatriz,
  bandasRiesgo: readonly Umbral[],
): { nombre: string; n: number }[] {
  const cuenta = new Map(bandasRiesgo.map((b) => [b.nombre, 0]));
  for (const u of ubicaciones) {
    if (u.i < 0) continue;
    const j = cara === 'inherente' ? u.inherente : u.residual;
    const valor = cara === 'inherente' ? u.valorInherente : u.valorResidual;
    if (j < 0 || valor === null) continue;
    const nombre = clasificar(valor, bandasRiesgo);
    if (nombre === null) continue;
    cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
  }
  return bandasRiesgo.map((b) => ({ nombre: b.nombre, n: cuenta.get(b.nombre) ?? 0 }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// LA MATRIZ DE ACTIVOS
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// La misma rejilla, pero cada casilla cuenta ACTIVOS y no pares activo-amenaza. Con 584
// riesgos sobre 30 activos, la matriz de amenazas dice dónde está el riesgo y la de activos
// dice de quién es — que es la pregunta que hace un comité.
//
// Cada activo aparece UNA vez, en la casilla de su PEOR riesgo. Es la misma regla de
// agregación que ya usan el inventario y la página de análisis: el nivel de riesgo de un
// activo es el de su riesgo más alto. Cualquier otra —la media, un percentil— escondería un
// riesgo crítico detrás de una masa de riesgos bajos.
//
// ── EL UNIVERSO ES EL INVENTARIO, NO LOS RIESGOS ────────────────────────────────────────
//
// La matriz nació contando los activos que aparecían en las ubicaciones, que son los que
// tienen al menos un riesgo valorado. Hoy son 30 de 378: la tarjeta decía «30 ACTIVOS» en
// una pantalla cuyo inventario tiene 378, y la cifra no estaba mal calculada — estaba
// contestando otra pregunta. Quien la lee entiende «el inventario son 30».
//
// Los otros 348 no tienen riesgos porque NO ALCANZAN EL UMBRAL DE VALORACIÓN —4 hoy—, que
// es la puerta de `entraAlAnalisis`. No es que estén pendientes: el motor los dejó fuera a
// propósito. Sin amenaza evaluada no tienen frecuencia, así que no hay casilla de la rejilla
// a la que puedan caer.
//
// ── PERO CONTARLOS NO ES VERLOS ─────────────────────────────────────────────────────────
//
// Declararlos al pie —«348 sin riesgo valorado»— deja invisible lo único que de ellos
// importa: CUÁLES son graves. Medido el 22/09/2026, 330 de esos 348 valen 3, y 3 en la
// escala de impacto es la banda ALTO. Trescientos treinta activos de impacto alto que la
// pantalla no dibujaba en ninguna parte.
//
// Frecuencia no tienen. Fila SÍ: el valor propio del activo —el máximo de sus dimensiones—
// está en la misma escala 0-5 que el impacto, y de hecho ES su impacto si una amenaza lo
// degradara por completo (`impactoAcumulado` con degradación 1). Así que van a una COLUMNA
// APARTE, cada uno en la fila de su propio valor: `sinAnalizar`.
//
// Esa columna no es una columna de frecuencia y no se pinta con una banda de riesgo. Riesgo
// es impacto × frecuencia, y acá la frecuencia es desconocida: pintarla del color más leve
// diría «riesgo bajo» sobre algo que nadie ha calculado. Lleva el conteo y la fila, que es
// exactamente lo que se sabe.

export interface MatrizActivos {
  cara: CaraMatriz;
  /// `conteos[i][j]` — cuántos ACTIVOS caen ahí.
  conteos: number[][];
  /// `codigos[i][j]` — cuáles, ordenados. La matriz de activos se lee con los nombres a la
  /// vista; un conteo sin los códigos obliga a cruzarla contra otra tabla.
  codigos: string[][][];
  /// `indices[i][j]` — la posición, dentro del arreglo de ubicaciones recibido, del riesgo
  /// que ubicó a cada activo: su peor riesgo. En el MISMO orden que `codigos`.
  ///
  /// Sin esto, quien dibuje la casilla tiene que volver a buscar ese máximo por su cuenta
  /// para poder explicar por qué está ahí cada activo, y esa segunda cuenta es la que
  /// termina discrepando de la primera.
  indices: number[][][];
  bandas: (string | null)[][];
  bandasZona: (string | null)[][];
  /// Cuántos activos PRESENTA la matriz: el inventario del filtro entero, estén ubicados o
  /// no. Es la cifra grande de la tarjeta, y se cumple
  /// `total = ubicados + sinUbicar + sinRiesgo`.
  total: number;
  /// Cuántos quedaron dibujados en alguna casilla. Es la suma de `conteos` y la suma de
  /// `reparto`: lo que la rejilla realmente muestra.
  ubicados: number;
  /// Cuántos ACTIVOS en cada banda, por el valor de su peor riesgo. Suma `ubicados`.
  reparto: { nombre: string; n: number }[];
  /// Activos que TIENEN riesgo pero no se pudieron ubicar en esta cara: sin impacto, o sin
  /// residual calculado.
  sinUbicar: number;
  /// Activos del inventario del filtro sin ningún riesgo valorado. Distinto de `sinUbicar`:
  /// allá falta una cifra de un riesgo que existe, acá no hay ningún riesgo todavía, y la
  /// pantalla lo explica distinto porque se corrige distinto.
  sinRiesgo: number;
  /// La columna aparte: todo activo presentado que la rejilla NO ubica, puesto en la fila de
  /// su propio valor. Una sola regla —«lo que la rejilla no ubica, a la columna»— en vez de
  /// dos listas que alguien tendría que mantener iguales.
  sinAnalizar: ColumnaSinAnalizar;
}

/// Un activo tal como lo presenta la matriz, con lo que hace falta para ubicarlo cuando no
/// tiene riesgo: su valor propio.
export interface ActivoPresentado {
  codigo: string;
  /// El máximo de las dimensiones del activo, en la misma escala 0-5 que el impacto. `null`
  /// cuando el activo no está valorado — y entonces no hay fila que le corresponda, que es
  /// distinto de la fila más baja.
  valor: number | null;
}

export interface ColumnaSinAnalizar {
  /// `conteos[i]` — cuántos activos en la fila de impacto `i`.
  conteos: number[];
  /// `codigos[i]` — cuáles, ordenados, por la misma razón que en la rejilla: la columna se
  /// lee con los nombres a la vista.
  codigos: string[][];
  /// Los que no tienen valoración: sin valor no hay fila, y meterlos en la más baja diría
  /// que son despreciables cuando lo que pasa es que nadie los ha valorado.
  sinValor: number;
}

export function matrizDeActivos(
  ubicaciones: readonly Ubicacion[],
  cara: CaraMatriz,
  filas: readonly FilaImpacto[],
  columnas: readonly ColumnaFrecuencia[],
  bandasRiesgo: readonly Umbral[],
  /// TODOS los activos que la matriz presenta — el inventario del filtro, no sólo los que
  /// aparecen en `ubicaciones`. Omitirlo deja el universo en los activos que traen las
  /// ubicaciones, que es lo que hacía esta función antes de existir el parámetro.
  activosPresentados?: readonly ActivoPresentado[],
): MatrizActivos {
  // Primero el peor riesgo de cada activo en esta cara.
  const peorDelActivo = new Map<
    string,
    { i: number; j: number; valor: number; indice: number }
  >();
  const vistos = new Set<string>();

  ubicaciones.forEach((u, indice) => {
    const codigo = u.activoCodigo;
    if (codigo === undefined) return;
    vistos.add(codigo);
    const j = cara === 'inherente' ? u.inherente : u.residual;
    const valor = cara === 'inherente' ? u.valorInherente : u.valorResidual;
    if (u.i < 0 || j < 0 || valor === null) return;
    const previo = peorDelActivo.get(codigo);
    if (previo === undefined || valor > previo.valor) {
      peorDelActivo.set(codigo, { i: u.i, j, valor, indice });
    }
  });

  const conteos = filas.map(() => columnas.map(() => 0));
  // Se arma como pares y se ordena una sola vez, para que código e índice no puedan
  // desalinearse: dos arreglos ordenados por separado es como una casilla termina
  // atribuyéndole a un activo el riesgo de su vecino.
  const pares: { codigo: string; indice: number }[][][] = filas.map(() =>
    columnas.map(() => [] as { codigo: string; indice: number }[]),
  );
  const peor = filas.map(() => columnas.map(() => Number.NEGATIVE_INFINITY));

  for (const [codigo, u] of peorDelActivo) {
    conteos[u.i][u.j]++;
    pares[u.i][u.j].push({ codigo, indice: u.indice });
    if (u.valor > peor[u.i][u.j]) peor[u.i][u.j] = u.valor;
  }
  for (const fila of pares) {
    for (const celda of fila) celda.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));
  }
  const codigos = pares.map((fila) => fila.map((celda) => celda.map((x) => x.codigo)));
  const indices = pares.map((fila) => fila.map((celda) => celda.map((x) => x.indice)));

  const cuenta = new Map(bandasRiesgo.map((b) => [b.nombre, 0]));
  for (const u of peorDelActivo.values()) {
    const nombre = clasificar(u.valor, bandasRiesgo);
    if (nombre !== null) cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
  }
  const reparto = bandasRiesgo.map((b) => ({ nombre: b.nombre, n: cuenta.get(b.nombre) ?? 0 }));

  const bandasZona = filas.map((f) =>
    columnas.map((c) => clasificar(f.medio * c.vecesAno, bandasRiesgo)),
  );
  const bandas = bandasZona.map((fila, i) =>
    fila.map((zona, j) =>
      conteos[i][j] === 0 ? zona : (clasificar(peor[i][j], bandasRiesgo) ?? zona),
    ),
  );

  // El universo se deduplica: un código repetido en el inventario es un activo, no dos, y
  // la matriz tiene que cuadrar contra el inventario aunque la lista que le llegue no venga
  // limpia. Se queda la primera aparición.
  const inventario = new Map<string, ActivoPresentado>();
  for (const a of activosPresentados ?? []) {
    if (!inventario.has(a.codigo)) inventario.set(a.codigo, a);
  }

  const ubicados = peorDelActivo.size;
  const sinUbicar = vistos.size - ubicados;
  // Los `vistos` son activos con riesgo, así que se descuentan del inventario aunque la
  // lista no los traiga — restar a ciegas `inventario.size - vistos.size` dejaría negativo
  // un total al que le faltara un activo, y un conteo negativo no avisa de nada.
  const sinRiesgo = [...inventario.keys()].filter((c) => !vistos.has(c)).length;

  // La columna aparte. Entra todo lo presentado que la rejilla no ubicó: el que no tiene
  // riesgo y el que lo tiene pero esta cara no puede colocar. Una sola regla.
  const columna: string[][] = filas.map(() => []);
  let sinValor = 0;
  for (const a of inventario.values()) {
    if (peorDelActivo.has(a.codigo)) continue;
    const banda = a.valor === null ? null : clasificar(a.valor, filas);
    const i = banda === null ? -1 : filas.findIndex((f) => f.nombre === banda);
    if (i < 0) {
      sinValor++;
      continue;
    }
    columna[i].push(a.codigo);
  }
  for (const celda of columna) celda.sort((a, b) => a.localeCompare(b, 'es'));

  return {
    cara,
    conteos,
    codigos,
    indices,
    bandas,
    bandasZona,
    total: ubicados + sinUbicar + sinRiesgo,
    ubicados,
    reparto,
    sinUbicar,
    sinRiesgo,
    sinAnalizar: {
      conteos: columna.map((c) => c.length),
      codigos: columna,
      sinValor,
    },
  };
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
