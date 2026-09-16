// lib/sgsi/informe-valoracion.ts
//
// El informe de valoración de activos y aceptación del riesgo residual, agrupado POR
// PROCESO. Módulo PURO: sin Prisma y sin React, porque lo que hay acá son las cuentas que
// el comité firma, y una cuenta que necesita una base de datos para probarse es una cuenta
// que nadie prueba.
//
// UN CAPÍTULO POR PROCESO, Y EL ORDEN NO ES ALFABÉTICO. Los procesos se ordenan por cuántos
// activos ponen en el análisis, de mayor a menor: el informe se lee de arriba hacia abajo y
// el que más expone es el que primero hay que mirar. Dentro de cada proceso, los activos
// van por residual descendente, por el mismo motivo.
//
// LO QUE ESTE MÓDULO NO HACE: no clasifica. Las bandas llegan ya resueltas por
// `lib/sgsi/clasificar.ts` — la misma que usan la ficha, el inventario y las matrices— para
// que el informe no pueda contradecir a la pantalla de la que sale. Acá solo se cuenta y se
// agrupa.

/// Un activo tal como el informe lo necesita. Es una vista PLANA a propósito: la consulta
/// resuelve nombres y bandas, y este módulo cuenta. Así la prueba se escribe con literales.
export interface ActivoDelInforme {
  codigo: string;
  nombre: string;
  /// `Activo.area.nombre`. «Proceso» en el lenguaje del dominio.
  proceso: string;
  /// El propietario del activo, que es por quién se filtra cuando se pide «por responsable».
  responsable: string | null;
  /// «[D] Datos / Información», tal como lo muestra el catálogo.
  tipo: string;
  /// `max(D, I, C)` — la única aritmética del valor, ya hecha.
  valor: number;
  /// La etiqueta de la escala: «Muy Alto», «Alto», «Medio»…
  nivelValor: string;
  /// Si alcanza `umbral_valoracion` y por lo tanto tiene riesgos calculados.
  entraAlAnalisis: boolean;
  /// La banda del PEOR riesgo inherente del activo. `null` cuando no entra al análisis.
  bandaInherente: string | null;
  /// La banda del peor riesgo residual. `null` es «sin calcular» —eficacia desconocida—,
  /// que NO es lo mismo que un residual bajo y el informe no puede confundirlos.
  bandaResidual: string | null;
}

/// Una aceptación formal del riesgo residual: un `AccionPlan` de tipo `ACEPTAR`.
///
/// Aceptar es planificar, no dejar de hacerlo: por eso lleva quién lo justificó y cuándo se
/// revisa. Una aceptación sin fecha de revisión es una que nadie vuelve a mirar, y el
/// informe la muestra igual — marcarla es justamente para lo que el comité lo lee.
export interface AceptacionDelInforme {
  activoCodigo: string;
  activoNombre: string;
  proceso: string;
  planCodigo: string;
  justificacion: string | null;
  /// `AAA-MM-DD`, o `null` cuando no se declaró.
  fechaRevision: string | null;
}

export interface ConteoEtiquetado {
  etiqueta: string;
  n: number;
}

/// Una celda de la matriz de traslado: cuántos activos del proceso pasaron de una banda
/// inherente a una residual.
export interface CeldaTraslado {
  inherente: string;
  residual: string;
  n: number;
}

export interface ProcesoDelInforme {
  proceso: string;
  /// Un ancla estable para la tabla de contenido. Derivado del nombre y no de un índice:
  /// un enlace que cambia porque se agregó un proceso antes es un enlace roto en el PDF que
  /// alguien ya archivó.
  ancla: string;
  activos: number;
  enAnalisis: number;
  /// Cantidades por rango de valor, de Muy Alto a Irrelevante.
  porNivelValor: ConteoEtiquetado[];
  /// Cuántos activos de cada tipo MAGERIT. Es la «tabla de frecuencias por tipo de activo».
  porTipo: ConteoEtiquetado[];
  /// Cuántos activos hay en cada banda de riesgo residual. «Sin calcular» es una fila más y
  /// no un cero: la eficacia desconocida es un estado del modelo, no un riesgo bajo.
  porBandaResidual: ConteoEtiquetado[];
  /// Inherente → residual. Es lo que el tratamiento consiguió, dicho en una tabla.
  traslado: CeldaTraslado[];
  /// Los activos del proceso, peor residual primero.
  filas: ActivoDelInforme[];
  /// Vacío cuando el proceso no tiene ninguna aceptación formal — y entonces el informe
  /// omite la sección entera en vez de imprimir un «no aplica» vacío.
  aceptaciones: AceptacionDelInforme[];
}

/// Sin calcular NO es una banda. Se nombra acá una sola vez para que el conteo, la matriz y
/// la tabla digan exactamente la misma palabra.
export const SIN_CALCULAR = 'Sin calcular';

/// El ancla de un proceso para la tabla de contenido: minúsculas, sin acentos y con guiones.
export function anclaDeProceso(proceso: string): string {
  return proceso
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/// Cuenta por clave conservando el ORDEN DECLARADO de las etiquetas, e incluyendo las que
/// dan cero.
///
/// Las de cero se incluyen a propósito: en un informe que se firma, «Muy Alto: 0» es una
/// afirmación que alguien quiere leer, y una fila ausente obliga a preguntarse si el rango
/// no existe o si nadie lo contó.
function contarPorEtiqueta(
  valores: readonly string[],
  ordenDeclarado: readonly string[],
): ConteoEtiquetado[] {
  const cuenta = new Map<string, number>();
  for (const e of ordenDeclarado) cuenta.set(e, 0);
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);

  // Lo declarado primero y en su orden; lo que apareció sin estar declarado, después y
  // alfabético. Un tipo nuevo en el catálogo no puede desaparecer del informe por no estar
  // en una lista escrita a mano.
  const declaradas = ordenDeclarado.map((e) => ({ etiqueta: e, n: cuenta.get(e) ?? 0 }));
  const extra = [...cuenta.keys()]
    .filter((k) => !ordenDeclarado.includes(k))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((e) => ({ etiqueta: e, n: cuenta.get(e) ?? 0 }));
  return [...declaradas, ...extra];
}

export interface EntradaInforme {
  activos: readonly ActivoDelInforme[];
  aceptaciones: readonly AceptacionDelInforme[];
  /// Las etiquetas de la escala de valor, de mayor a menor. Llegan del catálogo, nunca
  /// escritas acá: cambiar la escala no puede exigir recompilar el informe.
  nivelesDeValor: readonly string[];
  /// Las bandas de riesgo, de la peor a la mejor.
  bandas: readonly string[];
}

/// Arma el informe: un capítulo por proceso, ordenados por cuántos activos ponen en el
/// análisis.
export function armarInforme(entrada: EntradaInforme): ProcesoDelInforme[] {
  const porProceso = new Map<string, ActivoDelInforme[]>();
  for (const a of entrada.activos) {
    porProceso.set(a.proceso, [...(porProceso.get(a.proceso) ?? []), a]);
  }

  const bandasConSinCalcular = [...entrada.bandas, SIN_CALCULAR];

  const capitulos = [...porProceso.entries()].map(([proceso, activos]) => {
    const enAnalisis = activos.filter((a) => a.entraAlAnalisis);

    // Peor residual primero. Un activo sin residual calculado va al final y no al principio:
    // «sin calcular» es una deuda del modelo, no el riesgo más alto del proceso.
    const orden = (a: ActivoDelInforme) => {
      const i = entrada.bandas.indexOf(a.bandaResidual ?? '');
      return i < 0 ? entrada.bandas.length : i;
    };
    const filas = [...activos].sort(
      (a, b) => orden(a) - orden(b) || b.valor - a.valor || a.codigo.localeCompare(b.codigo),
    );

    const traslado = new Map<string, number>();
    for (const a of enAnalisis) {
      const clave = `${a.bandaInherente ?? SIN_CALCULAR}|${a.bandaResidual ?? SIN_CALCULAR}`;
      traslado.set(clave, (traslado.get(clave) ?? 0) + 1);
    }

    return {
      proceso,
      ancla: anclaDeProceso(proceso),
      activos: activos.length,
      enAnalisis: enAnalisis.length,
      porNivelValor: contarPorEtiqueta(
        activos.map((a) => a.nivelValor),
        entrada.nivelesDeValor,
      ),
      porTipo: contarPorEtiqueta(
        activos.map((a) => a.tipo),
        [],
      ),
      porBandaResidual: contarPorEtiqueta(
        enAnalisis.map((a) => a.bandaResidual ?? SIN_CALCULAR),
        bandasConSinCalcular,
      ),
      traslado: [...traslado.entries()]
        .map(([clave, n]) => {
          const [inherente, residual] = clave.split('|');
          return { inherente, residual, n };
        })
        .sort(
          (a, b) =>
            bandasConSinCalcular.indexOf(a.inherente) - bandasConSinCalcular.indexOf(b.inherente) ||
            bandasConSinCalcular.indexOf(a.residual) - bandasConSinCalcular.indexOf(b.residual),
        ),
      filas,
      aceptaciones: entrada.aceptaciones.filter((x) => x.proceso === proceso),
    };
  });

  return capitulos.sort(
    (a, b) => b.enAnalisis - a.enAnalisis || a.proceso.localeCompare(b.proceso, 'es'),
  );
}
