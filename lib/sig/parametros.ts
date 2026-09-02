// lib/sig/parametros.ts
//
// Qué hace válida una tabla del método (MAN-CAL-01) antes de guardarla.
//
// Estas seis tablas son el motor de toda la aritmética de riesgos: los registros guardan
// la REFERENCIA al nivel, no el número (D4), así que cambiar una escala recalcula los 66
// registros al instante sin tocar un solo dato. Ese es el poder de la parametrización, y
// también el peligro: una tabla mal guardada no rompe nada de forma visible — deja
// riesgos que se clasifican mal y nadie se entera.
//
// Por eso la validación es pura y está acá, probada sin base de datos. La que más importa
// es la de las BANDAS: `nivelDe()` recorre los mínimos ordenados y devuelve el índice del
// último que el valor supera. Con un hueco entre 12 y 15, un riesgo con valor 13 cae en la
// banda de abajo sin que nada avise. Con bandas solapadas, en la primera que coincida.

/// Un nivel de riesgo, como lo manda la pantalla.
export interface FilaNivel {
  id?: number;
  minimo: number;
  maximo: number;
  etiqueta: string;
  color: string;
  accionRiesgo: string;
  accionOportunidad: string;
}

/// Una fila de una escala numerada (probabilidad, impacto).
export interface FilaEscala {
  id?: number;
  valor: number;
  etiqueta: string;
}

/// Una medición de eficacia: el factor por el que se reduce.
export interface FilaEficacia {
  id?: number;
  nombre: string;
  valor: number;
}

export interface Validacion {
  errores: string[];
  /// Avisos que NO impiden guardar, pero que alguien debería leer antes de apretar.
  avisos: string[];
}

const vacio = (): Validacion => ({ errores: [], avisos: [] });

/// Las bandas de nivel: ordenadas, sin huecos, sin solapes, y cubriendo desde 1.
///
/// El rango útil de un mapa 5×5 es 1..25, y eso no se asume: se recibe, porque el método
/// puede parametrizar escalas de otro tamaño y la validación no debería quedar vieja.
export function validarNiveles(filas: readonly FilaNivel[], maximoPosible: number): Validacion {
  const v = vacio();
  if (filas.length === 0) {
    v.errores.push('tiene que haber al menos un nivel: sin niveles ningún riesgo se puede clasificar');
    return v;
  }

  for (const [i, f] of filas.entries()) {
    const n = i + 1;
    if (f.etiqueta.trim() === '') v.errores.push(`el nivel ${n} no tiene etiqueta`);
    if (f.accionRiesgo.trim() === '') v.errores.push(`el nivel ${n} no dice qué hacer con un riesgo`);
    if (f.accionOportunidad.trim() === '') {
      v.errores.push(`el nivel ${n} no dice qué hacer con una oportunidad`);
    }
    if (!Number.isInteger(f.minimo) || !Number.isInteger(f.maximo)) {
      v.errores.push(`el nivel ${n} tiene un límite que no es entero`);
      continue;
    }
    if (f.minimo > f.maximo) {
      v.errores.push(`el nivel «${f.etiqueta || n}» empieza en ${f.minimo} y termina en ${f.maximo}`);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(f.color)) {
      v.errores.push(`el color del nivel «${f.etiqueta || n}» no es un hex de seis dígitos`);
    }
  }
  if (v.errores.length > 0) return v;

  const ordenadas = [...filas].sort((a, b) => a.minimo - b.minimo);

  // La banda más baja tiene que arrancar EN O POR DEBAJO de 1, no exactamente en 1.
  //
  // El MAN-CAL-01 vigente arranca en 0 —«0–4 Aceptable»— y eso es correcto: el producto
  // mínimo de P×I es 1×1, así que empezar más abajo no deja nada afuera, sólo margen. La
  // primera versión de esta regla exigía el 1 exacto y RECHAZABA los datos reales del
  // método: una validación que no deja guardar lo que ya está guardado es peor que
  // ninguna, porque bloquea el único camino para arreglar lo demás.
  if (ordenadas[0].minimo > 1) {
    v.errores.push(
      `el nivel más bajo empieza en ${ordenadas[0].minimo} y tiene que arrancar en 1 o ` +
        'antes: un riesgo por debajo de ese mínimo no caería en ninguna banda',
    );
  }

  for (let i = 1; i < ordenadas.length; i++) {
    const previa = ordenadas[i - 1];
    const actual = ordenadas[i];
    if (actual.minimo <= previa.maximo) {
      v.errores.push(
        `«${previa.etiqueta}» (${previa.minimo}–${previa.maximo}) y «${actual.etiqueta}» ` +
          `(${actual.minimo}–${actual.maximo}) se solapan: un valor en común caería en la primera`,
      );
    } else if (actual.minimo !== previa.maximo + 1) {
      v.errores.push(
        `hay un hueco entre ${previa.maximo} y ${actual.minimo}: un riesgo con un valor de ` +
          'ahí adentro se clasificaría en la banda de abajo sin que nada avise',
      );
    }
  }

  const tope = ordenadas[ordenadas.length - 1];
  if (tope.maximo < maximoPosible) {
    v.avisos.push(
      `la banda más alta termina en ${tope.maximo} y el valor máximo posible es ` +
        `${maximoPosible}: los riesgos por encima quedan en «${tope.etiqueta}»`,
    );
  }

  return v;
}

/// Una escala numerada: valores únicos, consecutivos desde 1, con etiqueta.
///
/// Los valores tienen que ser consecutivos porque son los ejes del mapa de calor: un
/// salto del 3 al 5 deja una fila y una columna que la malla dibuja vacías para siempre.
export function validarEscala(filas: readonly FilaEscala[]): Validacion {
  const v = vacio();
  if (filas.length === 0) {
    v.errores.push('la escala no puede quedar vacía');
    return v;
  }

  const vistos = new Set<number>();
  for (const [i, f] of filas.entries()) {
    const n = i + 1;
    if (f.etiqueta.trim() === '') v.errores.push(`el valor ${n} no tiene etiqueta`);
    if (!Number.isInteger(f.valor) || f.valor < 1) {
      v.errores.push(`la fila ${n} tiene un valor que no es un entero desde 1`);
      continue;
    }
    if (vistos.has(f.valor)) v.errores.push(`el valor ${f.valor} está repetido`);
    vistos.add(f.valor);
  }
  if (v.errores.length > 0) return v;

  const ordenados = [...vistos].sort((a, b) => a - b);
  if (ordenados[0] !== 1) {
    v.errores.push(`la escala tiene que empezar en 1 y empieza en ${ordenados[0]}`);
  }
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i] !== ordenados[i - 1] + 1) {
      v.errores.push(
        `falta el valor ${ordenados[i - 1] + 1}: los valores son los ejes del mapa de calor, ` +
          'y un salto deja una fila y una columna dibujadas para siempre en blanco',
      );
      break;
    }
  }

  return v;
}

/// Las mediciones de eficacia: nombre único y un factor entre 0 y 1.
///
/// El 1 exacto se avisa, no se rechaza: un control que reduce el 100 % lleva el residual a
/// cero, y un riesgo con residual cero es un riesgo que el mapa deja de mostrar. Puede ser
/// una decisión legítima del comité, pero no debería ser un descuido de tipeo.
export function validarEficacias(filas: readonly FilaEficacia[]): Validacion {
  const v = vacio();
  if (filas.length === 0) {
    v.errores.push('tiene que haber al menos una medición de eficacia');
    return v;
  }

  const nombres = new Set<string>();
  for (const [i, f] of filas.entries()) {
    const n = i + 1;
    const nombre = f.nombre.trim();
    if (nombre === '') {
      v.errores.push(`la medición ${n} no tiene nombre`);
    } else if (nombres.has(nombre.toLowerCase())) {
      v.errores.push(`la medición «${nombre}» está repetida`);
    } else {
      nombres.add(nombre.toLowerCase());
    }

    if (!Number.isFinite(f.valor) || f.valor < 0 || f.valor > 1) {
      v.errores.push(
        `«${nombre || n}» tiene un factor de ${f.valor}: va entre 0 y 1, donde 0,6 significa ` +
          'que el control reduce el 60 %',
      );
      continue;
    }
    if (f.valor === 1) {
      v.avisos.push(
        `«${nombre}» reduce el 100 %: el residual de esos riesgos queda en cero y el mapa ` +
          'deja de mostrarlos',
      );
    }
    if (f.valor === 0) {
      v.avisos.push(`«${nombre}» no reduce nada: el residual queda igual al inherente`);
    }
  }

  return v;
}

/// Todo cambio del método exige motivo. No es una formalidad: es lo que un auditor lee
/// cuando pregunta por qué el umbral de «Inaceptable» bajó de 15 a 12 el año pasado.
export function validarMotivo(motivo: string): string | null {
  const limpio = motivo.trim();
  if (limpio === '') return 'El cambio exige motivo: queda en la bitácora con tu nombre.';
  if (limpio.length < 10) {
    return 'El motivo es demasiado corto para explicar el cambio a quien lo lea en un año.';
  }
  return null;
}
