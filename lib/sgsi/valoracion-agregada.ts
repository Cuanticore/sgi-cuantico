// lib/sgsi/valoracion-agregada.ts
//
// La aritmética de la pantalla de Valoración de activos (REQ-SIG-18 §3 al §6): el reparto
// del inventario por nivel de valor, por dimensión y por agrupador.
//
// **Por qué es un módulo puro y no cálculo dentro de la pantalla.** Un mismo dato sale en
// tres lugares —la fila del máximo de la matriz, la primera pila, y la fila de totales de la
// Tabla A— y el criterio 2 del §10 exige que los tres coincidan. Con el reparto calculado en
// cada pieza, «coincidir» pasa a ser una casualidad que hay que volver a comprobar cada vez
// que alguien toca una de las tres. Acá se calcula una vez y las tres lo leen.
//
// **Nada de esto guarda nada.** El valor del activo es derivado (`formulas.ts`), el umbral se
// lee de `Parametro.umbral_valoracion` y llega por argumento, y las dimensiones llegan como
// lista: cuando entre `A` o `T` aparece una quinta fila sin tocar este archivo.
//
// **Lo que este módulo NO hace: desempatar.** Un activo con `C=4, I=4` tiene el máximo
// determinado por C **y** por I, y `dimensionesQueMandan` lo cuenta en las dos. Elegir una
// por orden de catálogo inventaría una jerarquía entre C, I y D que la metodología no tiene
// (D-7), y a cambio dejaría cifras que suman: la pantalla prefiere la advertencia.

import { valorMaximo } from './formulas';

/// La clave del criterio «valor del activo». No es un código de dimensión: `Dimension.codigo`
/// es `Char(1)` y los cinco códigos posibles son de una letra, así que `MAX` no puede chocar
/// con ninguno presente ni futuro.
export const CRITERIO_MAX = 'MAX';

/// El valor que viaja en la URL cuando la fila es la de los que no tienen agrupador. Es el
/// mismo token del contrato de navegación del §8, para que la fila y su enlace no puedan
/// discrepar.
export const SIN_ASIGNAR = '__sin__';

export interface DimensionActiva {
  /// `D`, `I`, `C` — y `A` o `T` el día que se activen.
  codigo: string;
  nombre: string;
}

/// Una fila de `escala_valor`.
export interface NivelEscala {
  valor: number;
  etiqueta: string;
}

export interface PersonaCustodia {
  nombre: string;
  /// `Persona.correo`, que es único. Es lo que viaja en la URL: dos personas pueden llamarse
  /// igual y el nombre no distingue las filas (§9).
  correo: string;
  activa: boolean;
}

/// Un activo vigente reducido a lo que la agregación necesita.
export interface ActivoAgregable {
  codigo: string;
  /// Nombre del `CargoResponsable`. Nulo cuando el activo no tiene propietario.
  propietario: string | null;
  /// El custodio **persona** (`Activo.personaId`), no el cargo. Nulo en casi todo el
  /// inventario: se escribe de a un activo por vez desde el popup de REQ-SIG-16 (§6.6).
  persona: PersonaCustodia | null;
  /// Código de dimensión → nivel. Una dimensión **ausente o nula** es SIN VALORAR, que no es
  /// un 0: nadie la miró, y confundirlas infla el nivel más bajo (§9).
  valores: Readonly<Record<string, number | null>>;
}

export interface Criterio {
  clave: string;
  etiqueta: string;
}

/// Los criterios de la pantalla: el valor del activo primero, y una por dimensión activa en
/// el orden del catálogo. El máximo va primero porque es el resumen y las otras son su
/// descomposición (§4.2).
export function criterios(
  dimensiones: readonly DimensionActiva[],
  etiquetaMaximo: string,
): Criterio[] {
  return [
    { clave: CRITERIO_MAX, etiqueta: etiquetaMaximo },
    ...dimensiones.map((d) => ({ clave: d.codigo, etiqueta: d.nombre })),
  ];
}

/// Los niveles ordenados de menor a mayor, que es como se dibujan.
///
/// `escala_valor` llega ordenada por `orden`, y ese orden pone el 5 primero. La figura se lee
/// al revés: los segmentos van de 0 a 5 de izquierda a derecha para que «pasar el umbral» sea
/// literalmente estar a la derecha de la marca (§4.2).
export function nivelesAscendentes(niveles: readonly NivelEscala[]): NivelEscala[] {
  return [...niveles].sort((a, b) => a.valor - b.valor);
}

/// El valor de un activo en un criterio, o `null` si en ese criterio no está valorado.
///
/// Para el máximo se toman **las dimensiones activas presentes**: un activo valorado solo en
/// C tiene máximo, y es su C. Si no tiene ninguna, no tiene máximo — y eso es «Sin valorar»,
/// no un 0.
export function valorDeCriterio(
  valores: Readonly<Record<string, number | null>>,
  clave: string,
  dimensiones: readonly DimensionActiva[],
): number | null {
  if (clave === CRITERIO_MAX) {
    const presentes = dimensiones
      .map((d) => valores[d.codigo])
      .filter((v): v is number => v !== null && v !== undefined);
    return presentes.length === 0 ? null : valorMaximo(presentes).toNumber();
  }
  // Una dimensión que no está activa no es un criterio: responder con su valor guardado
  // haría aparecer en pantalla una fila que la organización desactivó.
  if (!dimensiones.some((d) => d.codigo === clave)) return null;
  return valores[clave] ?? null;
}

/// El reparto de un conjunto de activos por nivel, en un criterio.
export interface Reparto {
  /// Alineado con los niveles ascendentes que se pasaron: `porNivel[i]` es la cuenta del
  /// nivel `niveles[i].valor`.
  porNivel: number[];
  /// Los que no tienen ese criterio valorado. Es la única columna de la matriz que mide
  /// trabajo pendiente en lugar de riesgo (§5).
  sinValorar: number;
  /// Los que sí tienen el criterio valorado: la longitud de la pila.
  valorados: number;
  /// `valorados + sinValorar`. En cada fila tiene que dar los activos vigentes (§10.1).
  total: number;
  /// Los que alcanzan el umbral. Sale de sumar los niveles `>= umbral`, nunca de una cuenta
  /// aparte: cambiar `Parametro.umbral_valoracion` a 3 tiene que moverlo sin tocar código.
  desdeUmbral: number;
}

export function repartir(
  activos: readonly ActivoAgregable[],
  clave: string,
  dimensiones: readonly DimensionActiva[],
  niveles: readonly NivelEscala[],
  umbral: number,
): Reparto {
  const porNivel = niveles.map(() => 0);
  const indiceDeNivel = new Map(niveles.map((n, i) => [n.valor, i]));
  let sinValorar = 0;

  for (const a of activos) {
    const v = valorDeCriterio(a.valores, clave, dimensiones);
    if (v === null) {
      sinValorar += 1;
      continue;
    }
    const i = indiceDeNivel.get(v);
    // Un valor guardado que no está en la escala no se redondea al vecino ni se descarta en
    // silencio: cuenta como sin valorar, que es lo que es —un dato que la escala vigente no
    // sabe leer— y así la fila sigue sumando los activos vigentes.
    if (i === undefined) sinValorar += 1;
    else porNivel[i] += 1;
  }

  const valorados = porNivel.reduce((t, n) => t + n, 0);
  const desdeUmbral = niveles.reduce(
    (t, n, i) => (n.valor >= umbral ? t + porNivel[i] : t),
    0,
  );
  return { porNivel, sinValorar, valorados, total: valorados + sinValorar, desdeUmbral };
}

export interface FilaMatriz extends Reparto {
  clave: string;
  etiqueta: string;
}

export interface ParametrosAgregacion {
  activos: readonly ActivoAgregable[];
  dimensiones: readonly DimensionActiva[];
  /// Ascendentes. Pasar `nivelesAscendentes(escala)`.
  niveles: readonly NivelEscala[];
  umbral: number;
}

/// La matriz del §4.5: una fila por criterio, seis niveles más «Sin valorar».
export function matrizValoracion(
  p: ParametrosAgregacion & { criterios: readonly Criterio[] },
): FilaMatriz[] {
  return p.criterios.map((c) => ({
    clave: c.clave,
    etiqueta: c.etiqueta,
    ...repartir(p.activos, c.clave, p.dimensiones, p.niveles, p.umbral),
  }));
}

/// La escala compartida de las cuatro pilas: la barra más larga.
///
/// Es **absoluta y compartida**, no normalizada (D-5): el largo significa cuántos activos, y
/// una dimensión con menos activos valorados tiene que salir más corta.
export function escalaCompartida(filas: readonly Reparto[]): number {
  return filas.reduce((m, f) => Math.max(m, f.valorados), 0);
}

export interface CuentaDominante {
  codigo: string;
  nombre: string;
  cuenta: number;
}

export interface Dominancia {
  /// Los activos cuyo máximo alcanza el umbral.
  alcanzanUmbral: number;
  porDimension: CuentaDominante[];
  /// La dimensión con más activos, o `null` si no hay ninguno sobre el umbral o si dos
  /// empatan en la punta: nombrar una de dos empatadas sería elegir por orden de catálogo,
  /// que es justo lo que D-7 prohíbe.
  manda: CuentaDominante | null;
  /// `true` cuando las cuentas suman más que `alcanzanUmbral` — o sea, cuando hay activos con
  /// el máximo empatado. La pantalla tiene que decirlo (§4.3): sin la frase, la línea parece
  /// un error de cálculo.
  hayEmpates: boolean;
}

/// De los que alcanzan el umbral, qué dimensión se lo determina.
///
/// **Un activo con empate cuenta en cada dimensión empatada**, así que las cuentas suman más
/// que el total. No se desempata (D-7).
export function dimensionesQueMandan(p: ParametrosAgregacion): Dominancia {
  const porDimension: CuentaDominante[] = p.dimensiones.map((d) => ({
    codigo: d.codigo,
    nombre: d.nombre,
    cuenta: 0,
  }));
  const indice = new Map(porDimension.map((c, i) => [c.codigo, i]));
  let alcanzanUmbral = 0;

  for (const a of p.activos) {
    const max = valorDeCriterio(a.valores, CRITERIO_MAX, p.dimensiones);
    if (max === null || max < p.umbral) continue;
    alcanzanUmbral += 1;
    for (const d of p.dimensiones) {
      if (a.valores[d.codigo] === max) porDimension[indice.get(d.codigo)!]!.cuenta += 1;
    }
  }

  const suma = porDimension.reduce((t, c) => t + c.cuenta, 0);
  const tope = porDimension.reduce((m, c) => Math.max(m, c.cuenta), 0);
  const enLaPunta = porDimension.filter((c) => c.cuenta === tope);
  return {
    alcanzanUmbral,
    porDimension,
    manda: tope > 0 && enLaPunta.length === 1 ? enLaPunta[0]! : null,
    hayEmpates: suma > alcanzanUmbral,
  };
}

export type Agrupador = 'propietario' | 'persona';

export interface FilaAgrupada {
  /// Lo que viaja en la URL: el nombre del cargo, el correo de la persona, o `SIN_ASIGNAR`.
  clave: string;
  etiqueta: string;
  /// Segunda línea bajo el nombre. El correo, en la Tabla B; nulo cuando la fila es un cargo.
  subtitulo: string | null;
  sinAsignar: boolean;
  /// Una persona dada de baja con activos en la mano. Es justo lo que hay que ver, así que
  /// aparece marcada en vez de esconderse (§9).
  inactiva: boolean;
  /// Clave de criterio → reparto. La Tabla A trae uno; la Tabla B, cuatro.
  porCriterio: Record<string, Reparto>;
  total: number;
  desdeUmbral: number;
}

export interface TablaAgrupada {
  filas: FilaAgrupada[];
  /// La fila de totales del pie. Con el máximo seleccionado, su total general es el mismo
  /// número que la fila del máximo de la matriz (§10.2).
  totales: FilaAgrupada;
  /// Los activos que la tabla NO cubre. La Tabla A cubre todo el inventario y acá va 0; la
  /// Tabla B cubre solo lo entregado a alguien, y este número es el de su línea de encuadre
  /// (§6.6).
  fuera: number;
}

export interface ParametrosTabla extends ParametrosAgregacion {
  agrupador: Agrupador;
  criterios: readonly Criterio[];
  /// La Tabla A **sí** lleva fila «Sin propietario»: son 9 de 296 y un activo valioso sin
  /// dueño es lo que la pantalla debe hacer visible (§6.1). La Tabla B **no**: serían 275 de
  /// 296, la fila aplastaría a las demás y el tinte de todas las otras celdas quedaría
  /// invisible (D-8). Es la misma pieza y la diferencia es un argumento.
  incluirSinAsignar: boolean;
}

/// La pieza del §6, que se llama dos veces: agrupador × criterios × niveles.
///
/// **Una sola, parametrizada.** Dos componentes serían dos veces el tinte, el orden, los
/// totales, la fila «sin asignar» y el contrato de clic — cinco cosas que tienen que
/// comportarse igual y que iban a divergir.
export function tablaAgrupada(p: ParametrosTabla): TablaAgrupada {
  const claveDe = (a: ActivoAgregable): string | null =>
    p.agrupador === 'propietario' ? a.propietario : (a.persona?.correo ?? null);

  const grupos = new Map<string, { etiqueta: string; subtitulo: string | null; inactiva: boolean; activos: ActivoAgregable[] }>();
  const sinAsignar: ActivoAgregable[] = [];

  for (const a of p.activos) {
    const k = claveDe(a);
    if (k === null) {
      sinAsignar.push(a);
      continue;
    }
    const existente = grupos.get(k);
    if (existente) {
      existente.activos.push(a);
      continue;
    }
    grupos.set(k, {
      etiqueta: p.agrupador === 'propietario' ? k : (a.persona?.nombre ?? k),
      subtitulo: p.agrupador === 'persona' ? (a.persona?.correo ?? null) : null,
      inactiva: p.agrupador === 'persona' ? a.persona?.activa === false : false,
      activos: [a],
    });
  }

  const fila = (
    clave: string,
    etiqueta: string,
    subtitulo: string | null,
    esSinAsignar: boolean,
    inactiva: boolean,
    activos: readonly ActivoAgregable[],
  ): FilaAgrupada => {
    const porCriterio: Record<string, Reparto> = {};
    for (const c of p.criterios) {
      porCriterio[c.clave] = repartir(activos, c.clave, p.dimensiones, p.niveles, p.umbral);
    }
    // El total y el ≥ umbral de la fila se leen del PRIMER criterio, que es el que la tabla
    // ordena y el que su columna de totales muestra. Los cuatro criterios describen los
    // mismos activos, así que sus totales coinciden salvo valoración parcial — y cuando no
    // coinciden, lo que falta es la columna «Sin valorar» de ese grupo (§10.12).
    const principal = porCriterio[p.criterios[0]!.clave]!;
    return {
      clave,
      etiqueta,
      subtitulo,
      sinAsignar: esSinAsignar,
      inactiva,
      porCriterio,
      total: activos.length,
      desdeUmbral: principal.desdeUmbral,
    };
  };

  const filas = [...grupos.entries()]
    .map(([k, g]) => fila(k, g.etiqueta, g.subtitulo, false, g.inactiva, g.activos))
    // Orden por defecto: `≥ umbral` descendente y después `Total` descendente. La pantalla es
    // sobre valor, así que arriba va quien responde por más activos valiosos, no quien tiene
    // más activos (§6.5). El nombre desempata para que el orden sea estable entre renders.
    .sort(
      (a, b) =>
        b.desdeUmbral - a.desdeUmbral ||
        b.total - a.total ||
        a.etiqueta.localeCompare(b.etiqueta, 'es'),
    );

  if (p.incluirSinAsignar && sinAsignar.length > 0) {
    filas.push(
      fila(
        SIN_ASIGNAR,
        p.agrupador === 'propietario' ? 'Sin propietario' : 'Sin custodio persona',
        null,
        true,
        false,
        sinAsignar,
      ),
    );
  }

  const cubiertos = p.incluirSinAsignar
    ? p.activos
    : p.activos.filter((a) => claveDe(a) !== null);

  return {
    filas,
    totales: fila('', 'Total', null, false, false, cubiertos),
    fuera: p.activos.length - cubiertos.length,
  };
}

/// El tope contra el que se escala el tinte, **por criterio**.
///
/// Se escala dentro de cada grupo y no sobre la tabla entera: con cuatro grupos, escalar
/// global le daría todo el rango al grupo con más activos y dejaría los otros tres planos
/// (§6.7). Con un solo criterio —la Tabla A— «dentro del grupo» y «toda la tabla» son lo
/// mismo, así que es una sola regla para las dos tablas.
///
/// La fila de totales NO entra: es de otra magnitud y arrastraría el rango entero.
export function topesDeTinte(
  filas: readonly FilaAgrupada[],
  criterios: readonly Criterio[],
): Record<string, number> {
  const topes: Record<string, number> = {};
  for (const c of criterios) {
    topes[c.clave] = filas.reduce(
      (m, f) => Math.max(m, ...(f.porCriterio[c.clave]?.porNivel ?? [0])),
      0,
    );
  }
  return topes;
}
