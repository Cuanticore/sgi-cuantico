// lib/sgsi/exigencia.ts
//
// REQ-SIG-23 · qué nivel de control pide cada activo, y cuánto le falta.
//
// El sistema sabía qué tan bien está implementado cada control. No sabía QUÉ TAN BIEN LO
// NECESITA cada activo, y por eso no podía decir que algo faltaba. Esto agrega el término
// que faltaba: la exigencia. Con él, la frase que no se podía escribir queda escrita sola:
//
//   MINTRACE producción · criticidad C1 (RTO ≤ 10 min)
//      exige A.8.14 Redundancia en L4      la organización está en L1
//      ▸ brecha de tres niveles
//
// CADA DIMENSIÓN TIENE SU PROPIO CONDUCTOR (§3.1). La criticidad es un compromiso de
// TIEMPO —RTO y RPO— así que gobierna la DISPONIBILIDAD. La confidencialidad y la
// integridad las gobierna su propia valoración. Mezclarlas produciría el disparate de
// exigir cifrado de grado militar porque el servicio no tolera caídas.
//
// SOBRE LAS AMENAZAS QUE DEGRADAN D, EL NIVEL EXIGIDO ES EL MAYOR entre lo que pide el
// valor D y lo que pide la criticidad. Así los dos aportan y ninguno tapa al otro:
//
//   D=5 con C4 → exige L4 POR EL VALOR. Perder el activo es catastrófico aunque se pueda
//                esperar tres días a recuperarlo.
//   D=3 con C1 → exige L4 POR LA CRITICIDAD. La pérdida es moderada pero no se tolera ni
//                diez minutos, y eso sólo lo dice la criticidad.
//
// Ahí está lo que la columna de criticidad agrega y el valor D no podía dar solo.
//
// LA EXIGENCIA ES SOBRE EL PRINCIPAL, Y SÓLO SOBRE ÉL (§3.3). No sobre los siete controles
// de la amenaza. El principal es, por definición del catálogo, «sin este control la amenaza
// no se contiene»: es el único cuyo nivel fija el techo de la eficacia (REQ-SIG-21 §4) y por
// tanto el único cuya insuficiencia es una brecha real. **Sin principal designado no hay
// exigencia que evaluar** — se dice «pendiente de clasificar» y nunca se inventa uno.
//
// NADA DE ESTO SE ALMACENA (§5). La exigencia es una función de la criticidad y de la
// valoración; la brecha es una resta. Las dos se calculan al leer, como todo lo derivable.
//
// LA TABLA VIVE ACÁ Y DEBERÍA VIVIR EN UN CATÁLOGO. La decisión D-1 de REQ-SIG-23 está
// abierta y recomienda un catálogo editable con bitácora, para que cambiar «C2 exige L4» no
// sea recompilar. Mientras esa decisión no se cierre, la tabla es esta constante — y está
// en UN solo lugar justamente para que mudarla sea mover una constante, no quince ifs.

/// D, I, C — las tres dimensiones activas. Declarada acá y no importada para que este
/// módulo no arrastre la aritmética entera del riesgo sólo por un alias de tres letras.
type Dim = 'D' | 'I' | 'C';

/// §3.1 · el nivel que cada criticidad exige sobre las amenazas que degradan DISPONIBILIDAD.
/// `null` en C5 no es «cero»: es que un activo sin compromiso de servicio no exige nada por
/// esta vía. Su valoración D puede seguir exigiendo por la suya.
export const EXIGENCIA_POR_CRITICIDAD: Readonly<Record<string, number | null>> = {
  C1: 90,
  C2: 90,
  C3: 80,
  C4: 70,
  C5: null,
};

/// REQ-SIG-24 §6.1 · las criticidades que exigen, ADEMÁS del número, una verificación
/// vigente sobre el control principal.
///
/// C1 no pide un número mayor que C2: pide el mismo, verificado. Tres razones, y la
/// tercera es la que decide. Es auditable sin juicio —una verificación existe con su fecha
/// o no existe—, mientras que un escalón de 95 % exigiría redactar un descriptor que se
/// distinga del de 90 %, y si no se distingue en palabras el evaluador elige el de arriba.
/// Ataca el modo de falla real: el problema de MINTRACE producción nunca fue que A.8.14
/// estuviera en 90 y no en 95, fue que estaba en 90 SIN PRUEBA DE CONMUTACIÓN. Y deja la
/// brecha accionable: «falta la prueba formal de conmutación» es una tarea con dueño,
/// fecha y costo; «faltan cinco puntos» no es nada — con la población actual, exigir 95 %
/// produciría 55 brechas de las cuales 44 serían de cinco puntos, enterrando las 11 que
/// importan.
export const REQUIERE_VERIFICACION: readonly string[] = ['C1'];

/// §3.1 · el nivel que exige el VALOR de una dimensión. Por debajo de 4 no exige nada: son
/// los activos que ni siquiera entran al análisis o que entran sin que esa dimensión mande.
export function exigenciaPorValor(valor: number): number | null {
  if (valor >= 5) return 90;
  if (valor >= 4) return 70;
  return null;
}

/// §3.2 · una amenaza degrada una dimensión cuando la destruye en una fracción mayor que
/// cero. No hace falta un catálogo nuevo: `AmenazaDegradacion` ya lo dice.
export function degradaLaDimension(factor: number): boolean {
  return factor > 0;
}

/// El mayor de dos exigencias, tratando `null` como «no exige».
function mayor(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

export interface EntradaExigencia {
  /// El código de criticidad del activo, `C1`..`C5`. `null` cuando todavía no se clasificó
  /// — y entonces la criticidad no exige nada, que no es lo mismo que exigir cero.
  criticidad: string | null;
  /// Los valores D, I y C del activo.
  valores: Record<Dim, number>;
  /// La degradación de la amenaza por dimensión, como fracción de 0 a 1.
  degradacion: Record<Dim, number>;
}

/// El nivel de madurez que este activo exige al control PRINCIPAL de esta amenaza.
///
/// `null` = no exige nada por ninguna vía: ni la criticidad ni ninguna de las dimensiones
/// que la amenaza degrada llegan al umbral.
export function nivelExigido(entrada: EntradaExigencia): number | null {
  let exigido: number | null = null;

  for (const d of ['D', 'I', 'C'] as const) {
    if (!degradaLaDimension(entrada.degradacion[d] ?? 0)) continue;

    // Lo que pide el valor de esa dimensión, siempre.
    exigido = mayor(exigido, exigenciaPorValor(entrada.valores[d] ?? 0));

    // Y sólo sobre D, además, lo que pide la criticidad.
    if (d === 'D' && entrada.criticidad !== null) {
      exigido = mayor(exigido, EXIGENCIA_POR_CRITICIDAD[entrada.criticidad] ?? null);
    }
  }

  return exigido;
}

/// Por qué se exige ese nivel: para que la pantalla no muestre un número sin dueño.
export type ConductorExigencia = 'criticidad' | 'valor' | 'ambos' | null;

export function conductorDeLaExigencia(entrada: EntradaExigencia): ConductorExigencia {
  const total = nivelExigido(entrada);
  if (total === null) return null;

  const porCriticidad =
    degradaLaDimension(entrada.degradacion.D ?? 0) && entrada.criticidad !== null
      ? (EXIGENCIA_POR_CRITICIDAD[entrada.criticidad] ?? null)
      : null;

  let porValor: number | null = null;
  for (const d of ['D', 'I', 'C'] as const) {
    if (!degradaLaDimension(entrada.degradacion[d] ?? 0)) continue;
    porValor = mayor(porValor, exigenciaPorValor(entrada.valores[d] ?? 0));
  }

  const critMandaSola = porCriticidad === total && porValor !== total;
  const valorMandaSolo = porValor === total && porCriticidad !== total;
  if (critMandaSola) return 'criticidad';
  if (valorMandaSolo) return 'valor';
  return 'ambos';
}

export type EstadoBrecha =
  /// Hay principal, hay exigencia, el principal la alcanza — y si la criticidad además
  /// pide verificación, la tiene vigente.
  | { tipo: 'cubierto'; exigido: number; actual: number }
  /// Hay principal, hay exigencia, y el principal no llega. `brecha` va en PUNTOS: la
  /// escala de REQ-SIG-24 es de razón, así que esto es una resta de verdad y no la
  /// diferencia de dos ordinales que la escala CMM obligaba a fingir.
  | { tipo: 'brecha'; exigido: number; actual: number; brecha: number }
  /// §6.1 · el nivel alcanza, pero la criticidad exige verificación y no hay una vigente.
  /// No es una brecha de puntos: no hay número que subir, hay una prueba que ejecutar.
  | { tipo: 'brecha-de-verificacion'; exigido: number; actual: number; codigoPrincipal?: string }
  /// D-3 · el nivel alcanza, la criticidad exige verificación, y NO SE PUDO DETERMINAR si
  /// la hay. Nunca se colapsa con `brecha-de-verificacion`: una afirma que falta la
  /// prueba, la otra que no se pudo mirar, y `Obligacion.controlAnexoA` es texto libre.
  | { tipo: 'verificacion-sin-determinar'; exigido: number; actual: number; codigoPrincipal?: string }
  /// Ni la criticidad ni la valoración exigen nada sobre esta amenaza.
  | { tipo: 'sin-exigencia' }
  /// §3.3 · la amenaza no tiene principal designado. No es una brecha de cero: es una
  /// brecha que NO SE PUEDE EVALUAR, y confundirlas es exactamente el «tablero que afirma
  /// con precisión que no hay brechas» que REQ-SIG-23 §2 advierte. Hoy es el estado de las
  /// 57 amenazas: los 272 pares de `ControlAmenaza` siguen con `relevanciaId` en null.
  | { tipo: 'sin-principal' }
  /// Hay principal designado pero nadie lo evaluó. Tampoco es cero: es un juicio pendiente.
  | { tipo: 'principal-sin-evaluar'; exigido: number };

/// §6.1 y D5 del diseño · si el control principal tiene una verificación de eficacia
/// vigente. **`null` es «no se pudo determinar»**, nunca «no tiene»: el vínculo entre
/// control y obligación es por CÓDIGO DE TEXTO (`Obligacion.controlAnexoA`), así que un
/// código que no resuelve tiene que decir que no resolvió. Afirmar que no hay verificación
/// porque un texto no coincidió es el mismo error que este módulo entero evita.
///
/// Se inyecta en vez de consultarse acá para que el módulo siga siendo puro: lo consumen
/// la ficha y la página de análisis, que reescopan del lado del cliente sin viaje al
/// servidor.
export type HayVerificacionVigente = (codigoControl: string) => boolean | null;

export interface EntradaBrecha extends EntradaExigencia {
  /// El nivel de madurez del control PRINCIPAL de la amenaza, en puntos. `undefined` = la
  /// amenaza no tiene principal designado; `null` = lo tiene y está sin evaluar.
  nivelPrincipal?: number | null;
  /// El código del principal, para poder preguntar por su verificación y para nombrarlo
  /// en la pantalla.
  codigoPrincipal?: string;
  hayVerificacionVigente?: HayVerificacionVigente;
}

/// `brecha = exigido − actual_del_principal` (§6.2), en puntos. Positiva es brecha; cero o
/// negativa, no hay nada que reportar.
///
/// EL ORDEN DE LAS PREGUNTAS IMPORTA. La brecha de NIVEL se evalúa antes que la de
/// verificación: no tiene sentido reclamar la prueba de conmutación de un control que
/// además está tres escalones por debajo. Primero se sube, después se verifica.
export function evaluarBrecha(entrada: EntradaBrecha): EstadoBrecha {
  const exigido = nivelExigido(entrada);
  if (exigido === null) return { tipo: 'sin-exigencia' };
  if (entrada.nivelPrincipal === undefined) return { tipo: 'sin-principal' };
  if (entrada.nivelPrincipal === null) return { tipo: 'principal-sin-evaluar', exigido };

  const actual = entrada.nivelPrincipal;
  const brecha = exigido - actual;
  if (brecha > 0) return { tipo: 'brecha', exigido, actual, brecha };

  // El nivel alcanza. ¿La criticidad pide además verificación?
  if (entrada.criticidad === null || !REQUIERE_VERIFICACION.includes(entrada.criticidad)) {
    return { tipo: 'cubierto', exigido, actual };
  }

  const codigoPrincipal = entrada.codigoPrincipal;
  // Sin predicado no se afirma cumplimiento. Es la misma regla que gobierna todo este
  // módulo: no haber mirado y haber mirado y no encontrar nada son hechos distintos.
  const vigente =
    entrada.hayVerificacionVigente !== undefined && codigoPrincipal !== undefined
      ? entrada.hayVerificacionVigente(codigoPrincipal)
      : null;

  if (vigente === null) {
    return { tipo: 'verificacion-sin-determinar', exigido, actual, codigoPrincipal };
  }
  return vigente
    ? { tipo: 'cubierto', exigido, actual }
    : { tipo: 'brecha-de-verificacion', exigido, actual, codigoPrincipal };
}

/// §6.2 · cuántas veces el residual de este riesgo es el que tendría el mismo riesgo si el
/// principal cumpliera: `(1 − actual) / (1 − exigido)`.
///
/// Es lo que permite que la franja diga «brecha de 20 puntos — el residual es tres veces el
/// del cumplidor», es decir que la lectura de cumplimiento y la de riesgo dejen de ser dos
/// cifras que no se hablan. En la escala CMM esto no se podía escribir: la diferencia entre
/// L3 y L4 eran cinco puntos de eficacia y la de L2 a L3, cuarenta.
///
/// `null` cuando la exigencia es del 100 %: ahí el cumplidor tendría residual cero y no hay
/// factor que calcular. No ocurre con la tabla de §6 —el máximo es 90— pero la tabla es
/// editable y dividir por cero en silencio no es una opción.
export function factorSobreResidual(exigido: number, actual: number): number | null {
  const restoExigido = 1 - exigido / 100;
  if (restoExigido <= 0) return null;
  return (1 - actual / 100) / restoExigido;
}
