// lib/sgsi/consolidado.ts
//
// La carga del Consolidado de Activos V19 (REQ-SIG-12), como funciones puras.
//
// Sin Prisma y sin exceljs, por el mismo motivo que `plantilla-lectura.ts`: la acción
// convierte el archivo en texto de celdas y trae los catálogos; decidir qué significa cada
// fila —y qué está mal en ella— pasa acá, donde una prueba lo puede ejercitar sin base de
// datos y sin archivo.
//
// ─── La regla de oro (§3) ──────────────────────────────────────────────────────────────
//
// **El código del libro se PRESERVA, no se regenera.** Es la decisión con más
// consecuencias, y el importador actual hace lo contrario: mapea «Código» a
// `codigoHeredado` y emite uno nuevo desde `ContadorCodigo`.
//
// Con V19 eso rompe todo el tejido relacional. La hoja Dependencias, el Detalle de ambiente
// y las 720 aristas del Grafo referencian a los activos por su código exacto
// (`TEC-SER-0001`, `TEC-EQU-0004`…). Y no es un riesgo teórico: el prefijo de área del
// código **no siempre coincide** con la columna «Proceso o Área» del mismo activo —hay 134
// códigos con prefijo `TEC` y sólo 122 activos en «Gestión Tecnológica»—, así que regenerar
// le cambiaría el prefijo a una docena y sus referencias quedarían apuntando a la nada.
//
// El código es inmutable por diseño (REQ-SIG-01 §3). La carga lo respeta.

import type { ClaseNivel } from '@prisma/client';
import { caminoDelCiclo } from '@/lib/sig/dependencias';

/// `AAA-TTT-NNNN`. Los 299 activos del libro lo cumplen, cero excepciones.
///
/// Anclado en los dos extremos y sin tolerar espacios: un código con un blanco al final es
/// el mismo carácter que separa una referencia buena de una rota, y aceptarlo acá dejaría
/// pasar una clave que después no cruza con la hoja Dependencias.
export const PATRON_CODIGO = /^[A-Z]{3}-[A-Z]{3}-[0-9]{4}$/;

export function esCodigoDeLibro(valor: string): boolean {
  return PATRON_CODIGO.test(valor);
}

export interface PartesCodigo {
  /// Prefijo de área del código. **No es necesariamente el área del activo** (§3).
  area: string;
  tipo: string;
  /// El consecutivo, sin los ceros a la izquierda: `0001` es 1.
  numero: number;
  /// `TEC-SER`. Es la llave del contador: `ContadorCodigo` es por (área, tipo).
  serie: string;
}

export function partesDeCodigo(valor: string): PartesCodigo | null {
  if (!esCodigoDeLibro(valor)) return null;
  const [area, tipo, numero] = valor.split('-');
  return { area, tipo, numero: Number(numero), serie: `${area}-${tipo}` };
}

/// La serie de un código, o `null` si no cumple el patrón.
export function serieDeCodigo(valor: string): string | null {
  return partesDeCodigo(valor)?.serie ?? null;
}

/// El mayor consecutivo observado por serie, para sembrar `ContadorCodigo` (§3).
///
/// **El máximo y no la cantidad.** Si una serie tiene huecos —un activo dado de baja, un
/// número que nunca se usó— contar filas daría un valor por debajo del último emitido, y la
/// siguiente alta repetiría un código que ya existe. El código es inmutable y las bajas son
/// lógicas: el número de un activo retirado sigue siendo suyo.
///
/// Los códigos que no cumplen el patrón se ignoran en vez de reventar: esta función se
/// alimenta de una columna de una hoja de cálculo, y una celda con basura es un caso a
/// reportar fila por fila, no a hacer caer la carga entera.
export function maximosPorSerie(codigos: readonly string[]): Map<string, number> {
  const maximos = new Map<string, number>();
  for (const codigo of codigos) {
    const partes = partesDeCodigo(codigo);
    if (partes === null) continue;
    const previo = maximos.get(partes.serie);
    if (previo === undefined || partes.numero > previo) {
      maximos.set(partes.serie, partes.numero);
    }
  }
  return maximos;
}

// ─── Reconocer el consolidado (§2) ─────────────────────────────────────────────────────

/// Las columnas que SOLO trae el consolidado. El formato histórico FOR-SIG-12 no tiene
/// jerarquía ni activo superior, y por eso alcanzan para distinguirlos.
const COLUMNAS_PROPIAS = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Depende del activo superior'];

/// Las hojas que el orden de carga del §5 necesita. Sin ellas no hay nada que cargar más
/// allá de la matriz, y un archivo así no es un consolidado: es una matriz suelta.
const HOJAS_NECESARIAS = ['Matriz de Activos', 'Dependencias', 'Detalle de ambiente'];

/// Comparación sin acentos ni caja. Quien renombre «Detalle de Ambiente» con mayúscula no
/// rompió el archivo, y hacerlo fallar por eso convierte un detalle de tipeo en un
/// diagnóstico equivocado.
function coincide(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;
}

function contiene(valores: readonly string[], buscado: string): boolean {
  return valores.some((v) => coincide(v, buscado));
}

/// ¿Este libro es el Consolidado de Activos V19?
///
/// **Tiene que decidirse ANTES que `esFormatoLegacy`.** V19 cumple la detección legacy
/// —trae «Código», «Proceso o Área», «Custodio» y «Valor en Disponibilidad»—, y por ese
/// camino el importador mapea el código del libro a `codigoHeredado` y emite uno nuevo. Con
/// V19 eso destruye el tejido relacional entero (§3): 98 dependencias, 129 despliegues y 720
/// aristas del grafo referencian a los activos por ese código exacto.
///
/// Se exigen las DOS cosas —columnas propias y hojas de carga— a propósito. Con solo las
/// columnas, una matriz exportada suelta pasaría por consolidado y la carga buscaría hojas
/// que no existen; con solo las hojas, un libro histórico al que alguien le agregó una hoja
/// «Dependencias» entraría por un camino que no sabe leer.
export function esConsolidadoV19(
  filaEncabezado: readonly string[],
  nombresDeHoja: readonly string[],
): boolean {
  const columnas = COLUMNAS_PROPIAS.every((c) => contiene(filaEncabezado, c));
  const hojas = HOJAS_NECESARIAS.every((h) => contiene(nombresDeHoja, h));
  return columnas && hojas;
}

/// Qué formato trae el libro, y si le falta algo para ser el consolidado.
///
/// **Por qué no alcanza un booleano.** `esConsolidadoV19` no distingue «esto es el formato
/// histórico» de «esto QUERÍA ser el consolidado y le falta una columna». Y esa diferencia
/// pesa, porque el camino de al lado —`esFormatoLegacy`— regenera el código.
///
/// Con un booleano, renombrar «Nivel 3» a «Nivel3» hace que un libro V19 se cargue como
/// histórico: los 299 activos entran con un código nuevo y las 98 dependencias, los 129
/// despliegues y las 720 aristas quedan apuntando a la nada. En silencio, y sin forma de
/// notarlo hasta abrir el grafo.
///
/// Un archivo que trae las hojas del consolidado NO es un archivo histórico. Si le falta
/// algo, la respuesta correcta es parar y decir QUÉ falta — no elegir el otro camino, que
/// para ese archivo es el destructivo.
export type FormatoLibro = 'CONSOLIDADO' | 'CONSOLIDADO_INCOMPLETO' | 'HISTORICO';

export interface DiagnosticoFormato {
  formato: FormatoLibro;
  /// Lo que falta para ser el consolidado, con el nombre que la persona ve en el archivo.
  /// Vacío cuando el formato es `CONSOLIDADO` o `HISTORICO`.
  faltantes: string[];
}

export function diagnosticoDeFormato(
  filaEncabezado: readonly string[],
  nombresDeHoja: readonly string[],
): DiagnosticoFormato {
  const columnasQueFaltan = COLUMNAS_PROPIAS.filter((c) => !contiene(filaEncabezado, c));
  const hojasQueFaltan = HOJAS_NECESARIAS.filter((h) => !contiene(nombresDeHoja, h));

  if (columnasQueFaltan.length === 0 && hojasQueFaltan.length === 0) {
    return { formato: 'CONSOLIDADO', faltantes: [] };
  }

  // Las hojas propias del consolidado —Dependencias y Detalle de ambiente— son la señal de
  // INTENCIÓN. El histórico no las trae. Si están, este archivo se armó para ser el
  // consolidado, y cargarlo como histórico sería reescribirle los códigos.
  const traeHojasPropias = HOJAS_NECESARIAS.filter((h) => h !== 'Matriz de Activos').some((h) =>
    contiene(nombresDeHoja, h),
  );

  if (traeHojasPropias || columnasQueFaltan.length < COLUMNAS_PROPIAS.length) {
    return {
      formato: 'CONSOLIDADO_INCOMPLETO',
      faltantes: [...columnasQueFaltan, ...hojasQueFaltan.map((h) => `hoja «${h}»`)],
    };
  }

  return { formato: 'HISTORICO', faltantes: [] };
}

// ─── La jerarquía de niveles (§4.4) ────────────────────────────────────────────────────

/// Las columnas Nivel 1/2/3 son una jerarquía de TRES GRADOS, no tres columnas sueltas (E1).
export interface FilaNiveles {
  /// Número de fila en la hoja, para que un problema apunte a una línea que se puede abrir.
  fila: number;
  n1: string;
  n2: string;
  n3: string;
}

export interface NodoNivel {
  grado: 1 | 2 | 3;
  nombre: string;
  /// La IDENTIDAD del nivel. Ver `caminoDeNivel`.
  camino: string;
  /// El camino del padre. Nulo solo en grado 1.
  padreCamino: string | null;
  /// Solo en grado 1: un nivel 2 o 3 la hereda subiendo por el padre, y guardarla otra vez
  /// permitiría que un hijo contradijera a su raíz. `null` cuando la raíz no se reconoce.
  clase: ClaseNivel | null;
}

export interface ProblemaFila {
  fila: number;
  mensaje: string;
}

/// La clase de cada raíz conocida. **No se infiere ninguna otra.**
///
/// Adivinarle la clase a una raíz nueva es decidir por el SGSI qué parte de la organización
/// es un producto y cuál un proyecto, y eso cambia qué obligaciones le aplican. Una raíz
/// desconocida se carga sin clase y se reporta.
const CLASE_DE_RAIZ: Record<string, ClaseNivel> = {
  CUANTICO: 'EMPRESA',
  PRODUCTOS: 'PRODUCTOS',
  PROYECTOS: 'PROYECTOS',
};

/// La identidad de un nivel es su CAMINO, nunca su nombre.
///
/// En el libro hay doce nombres de Nivel 3 repetidos bajo padres distintos:
/// «Documentación» cuelga de ONCE ramas —MINTRACE, Gestión de Proyectos, SIG…—, «Código
/// fuente» de nueve, «Ambiente de producción» de nueve. Indexar por nombre colapsaría once
/// niveles en uno y dejaría a los activos de once ramas colgando del mismo nodo.
///
/// El separador es un NUL porque no puede aparecer dentro del nombre de un nivel; con un
/// guion o una barra, un nombre que lo contuviera produciría dos caminos iguales para dos
/// niveles distintos.
export function caminoDeNivel(segmentos: readonly string[]): string {
  return segmentos.join('\u0000');
}

/// Arma la jerarquía a partir de las combinaciones distintas de Nivel 1/2/3.
///
/// Devuelve los nodos ORDENADOS POR GRADO: un grado 2 no se puede escribir antes que su
/// grado 1, y dejar ese orden a criterio del llamador es pedirle que recuerde una
/// dependencia que esta función ya conoce.
///
/// Una fila con algún nivel vacío no aporta nodos: se reporta y se sigue. Armar media
/// jerarquía con lo que hay dejaría un grado 3 colgando de un padre que no existe, que es
/// peor que no tenerlo.
export function jerarquiaDeNiveles(filas: readonly FilaNiveles[]): {
  nodos: NodoNivel[];
  problemas: ProblemaFila[];
} {
  const porCamino = new Map<string, NodoNivel>();
  const problemas: ProblemaFila[] = [];
  const raicesReportadas = new Set<string>();

  for (const f of filas) {
    const n1 = f.n1.trim();
    const n2 = f.n2.trim();
    const n3 = f.n3.trim();

    const faltan = [
      n1 === '' ? 'Nivel 1' : null,
      n2 === '' ? 'Nivel 2' : null,
      n3 === '' ? 'Nivel 3' : null,
    ].filter((x): x is string => x !== null);

    if (faltan.length > 0) {
      problemas.push({ fila: f.fila, mensaje: `Falta ${faltan.join(', ')}.` });
      continue;
    }

    const c1 = caminoDeNivel([n1]);
    const c2 = caminoDeNivel([n1, n2]);
    const c3 = caminoDeNivel([n1, n2, n3]);

    if (!porCamino.has(c1)) {
      const clase = CLASE_DE_RAIZ[n1] ?? null;
      if (clase === null && !raicesReportadas.has(n1)) {
        raicesReportadas.add(n1);
        problemas.push({
          fila: f.fila,
          mensaje: `La raíz «${n1}» no tiene clase conocida (EMPRESA, PRODUCTOS o PROYECTOS). Se carga sin clase.`,
        });
      }
      porCamino.set(c1, { grado: 1, nombre: n1, camino: c1, padreCamino: null, clase });
    }
    if (!porCamino.has(c2)) {
      porCamino.set(c2, { grado: 2, nombre: n2, camino: c2, padreCamino: c1, clase: null });
    }
    if (!porCamino.has(c3)) {
      porCamino.set(c3, { grado: 3, nombre: n3, camino: c3, padreCamino: c2, clase: null });
    }
  }

  // Estable dentro de cada grado: el orden de aparición en la hoja. Dos cargas del mismo
  // archivo tienen que producir el mismo `orden`, o el inventario se reordena solo.
  const nodos = [...porCamino.values()].sort((a, b) => a.grado - b.grado);
  return { nodos, problemas };
}

// ─── Las dependencias (§4.3) ───────────────────────────────────────────────────────────

export interface FilaDependencia {
  fila: number;
  base: string;
  relacionado: string;
  /// «(tercero sin activo propio)» viene acá cuando el relacionado no es un activo.
  nivel3Relacionado: string;
  nombreRelacionado: string;
}

export interface AristaDependencia {
  fila: number;
  base: string;
  relacionado: string;
}

/// Una dependencia hacia algo que el inventario NO lista, por diseño del libro.
export interface TerceroSinActivo {
  fila: number;
  /// El activo del que cuelga. Sin esto, «Coolify» no dice de qué depende y el parte deja
  /// de servir para arreglarlo.
  base: string;
  nombre: string;
}

/// Las tres formas que trae la hoja Dependencias.
///
/// El REQ describe dos —con base y sin base— y el libro tiene tres. Las 58 del medio traen
/// base válida y el relacionado SOLO por nombre, con la leyenda «(tercero sin activo
/// propio)» en su columna de nivel: Coolify, Docker, systemd, GHCR, Apache Superset.
/// `DependenciaActivo` exige dos `Activo`, así que esas no se pueden escribir — y no es un
/// defecto del libro, es que esos terceros no son activos del inventario.
///
/// Ninguna forma aborta la carga (§6): se escribe lo válido y se reporta el resto fila por
/// fila.
export function clasificarDependencias(filas: readonly FilaDependencia[]): {
  aristas: AristaDependencia[];
  terceros: TerceroSinActivo[];
  huerfanas: { fila: number; nombre: string }[];
  problemas: ProblemaFila[];
} {
  const aristas: AristaDependencia[] = [];
  const terceros: TerceroSinActivo[] = [];
  const huerfanas: { fila: number; nombre: string }[] = [];
  const problemas: ProblemaFila[] = [];
  const vistas = new Set<string>();

  for (const f of filas) {
    const base = f.base.trim();
    const rel = f.relacionado.trim();
    const nombre = f.nombreRelacionado.trim();
    const nivel3 = f.nivel3Relacionado.trim();

    // Una fila es vacía solo si TODAS sus columnas lo están. Mirar únicamente las dos
    // primeras fue mi error leyendo el libro: las nueve huérfanas de H-43 traen su dato en
    // la tercera y la cuarta, y desaparecieron del conteo sin dejar rastro.
    if (base === '' && rel === '' && nombre === '' && nivel3 === '') continue;

    if (esCodigoDeLibro(base) && esCodigoDeLibro(rel)) {
      if (base === rel) {
        problemas.push({ fila: f.fila, mensaje: `${base} no puede depender de sí mismo.` });
        continue;
      }
      // La tabla tiene única (activo, dependeDe, tipo): repetir el par en dos filas no son
      // dos aristas, y la segunda moriría contra el índice.
      const clave = `${base}\u0000${rel}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      aristas.push({ fila: f.fila, base, relacionado: rel });
      continue;
    }

    if (esCodigoDeLibro(base)) {
      terceros.push({ fila: f.fila, base, nombre });
      continue;
    }

    huerfanas.push({ fila: f.fila, nombre });
  }

  return { aristas, terceros, huerfanas, problemas };
}

/// D-1 · el tipo de la arista se deriva del Grafo, que sí lo trae.
///
/// La hoja Dependencias no tiene la columna del enum. La decisión cerrada mapea
/// `usa`→`USA`, `alojado en`→`SE_ALOJA_EN` y `depende de`→`USA` por defecto.
///
/// `AUTENTICA_CON` y `ALMACENA_EN` **no se inventan nunca**: no aparecen en el libro y se
/// refinan a mano en la app. Que el importador no los adivine es parte de la decisión, no
/// una omisión — poner `AUTENTICA_CON` por parecido de palabras sería afirmar sobre un
/// control de identidad algo que nadie verificó.
export function tipoDeDependencia(relacion: string): 'USA' | 'SE_ALOJA_EN' {
  const r = relacion.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (r === 'alojado en') return 'SE_ALOJA_EN';
  return 'USA';
}

// ─── §5.4 · la segunda pasada: el activo superior ──────────────────────────────────────

export interface FilaSuperior {
  fila: number;
  codigo: string;
  superiorCodigo: string | null;
}

export interface Superior {
  codigo: string;
  superiorCodigo: string;
}

/// Resuelve «Depende del activo superior» cuando ya se conocen TODOS los activos del libro.
///
/// **Por qué es una segunda pasada.** La columna apunta a otro activo del mismo archivo, y
/// nada garantiza que el padre esté más arriba en la hoja. Nueve filas del libro traen
/// superior; pedirle a la persona que las ordene sería pedirle que resuelva un problema del
/// importador.
///
/// **Y por qué valida ciclos.** `superiorId` es CONTENCIÓN: un padre, un árbol. Un árbol con
/// un ciclo no tiene raíz, y el drill-down del mapa no termina nunca. Es la misma
/// comprobación que las dependencias (E3), sobre otro grafo — de ahí que reutilice
/// `caminoDelCiclo` en vez de tener su propio recorrido, que se desincronizaría.
export function resolverSuperiores(filas: readonly FilaSuperior[]): {
  superiores: Superior[];
  problemas: ProblemaFila[];
} {
  const existentes = new Set(filas.map((f) => f.codigo));
  const superiores: Superior[] = [];
  const problemas: ProblemaFila[] = [];
  const aceptadas: { base: string; relacionado: string }[] = [];

  for (const f of filas) {
    const destino = f.superiorCodigo?.trim() ?? '';
    if (destino === '') continue;

    if (destino === f.codigo) {
      problemas.push({
        fila: f.fila,
        mensaje: `${f.codigo} no puede estar contenido en sí mismo.`,
      });
      continue;
    }
    if (!existentes.has(destino)) {
      problemas.push({
        fila: f.fila,
        mensaje: `El activo superior «${destino}» no está en el archivo. ${f.codigo} se carga sin padre.`,
      });
      continue;
    }
    const camino = caminoEntre(f.codigo, destino, aceptadas);
    if (camino !== null) {
      problemas.push({
        fila: f.fila,
        mensaje: `Contener ${f.codigo} en ${destino} cerraría un ciclo: ${camino.join(' → ')}.`,
      });
      continue;
    }
    aceptadas.push({ base: f.codigo, relacionado: destino });
    superiores.push({ codigo: f.codigo, superiorCodigo: destino });
  }

  return { superiores, problemas };
}

// ─── E3 · las dependencias no admiten ciclos, de ninguna longitud ──────────────────────

/// El camino que se cerraría al agregar `base → relacionado`, en CÓDIGOS, o `null`.
///
/// `caminoDelCiclo` de `lib/sig/dependencias.ts` trabaja con ids numéricos porque es lo que
/// tiene la app; acá los activos todavía no existen y la única identidad es el código. En
/// vez de duplicar el recorrido —que es donde se cuela el bug de mirar sólo el recíproco
/// directo— se numeran los códigos y se traduce la respuesta de vuelta.
function caminoEntre(
  base: string,
  relacionado: string,
  aristas: readonly { base: string; relacionado: string }[],
): string[] | null {
  const id = new Map<string, number>();
  const codigo: string[] = [];
  const numerar = (c: string): number => {
    const previo = id.get(c);
    if (previo !== undefined) return previo;
    const nuevo = codigo.length;
    id.set(c, nuevo);
    codigo.push(c);
    return nuevo;
  };

  const numeradas = aristas.map((a) => ({
    activoId: numerar(a.base),
    dependeDeId: numerar(a.relacionado),
    // El recorrido sólo mira la dirección; el tipo es irrelevante para cerrar un ciclo.
    tipo: 'USA' as const,
  }));
  const camino = caminoDelCiclo(numerar(base), numerar(relacionado), numeradas);
  return camino === null ? null : [base, ...camino.map((n) => codigo[n])];
}

export interface CicloReportado {
  fila: number;
  mensaje: string;
}

/// Acepta las aristas una por una, rechazando las que cerrarían un ciclo (E3).
///
/// **Una por una y no todas juntas.** Un lote con un ciclo no tiene una arista culpable: la
/// culpa es del conjunto. Aceptarlas en orden de archivo hace que la rechazada sea siempre
/// la última en llegar, que es la que la persona puede encontrar en la hoja.
///
/// `previas` son las que ya están en la base: una arista nueva puede cerrar un ciclo contra
/// una vieja, y mirar sólo el archivo lo dejaría pasar.
export function aristasSinCiclos(
  aristas: readonly AristaDependencia[],
  previas: readonly { base: string; relacionado: string }[] = [],
): { aceptadas: AristaDependencia[]; ciclos: CicloReportado[] } {
  const aceptadas: AristaDependencia[] = [];
  const ciclos: CicloReportado[] = [];
  const acumuladas: { base: string; relacionado: string }[] = [...previas];

  for (const a of aristas) {
    const camino = caminoEntre(a.base, a.relacionado, acumuladas);
    if (camino !== null) {
      ciclos.push({
        fila: a.fila,
        mensaje: `${a.base} → ${a.relacionado} cerraría un ciclo: ${camino.join(' → ')}.`,
      });
      continue;
    }
    acumuladas.push({ base: a.base, relacionado: a.relacionado });
    aceptadas.push(a);
  }

  return { aceptadas, ciclos };
}

// ─── §5.7 · sembrar `ContadorCodigo` ───────────────────────────────────────────────────

export interface ContadorASembrar {
  serie: string;
  areaId: number;
  tipoId: number;
  valor: number;
}

export interface SerieSinPar {
  serie: string;
  motivo: string;
}

/// Traduce los máximos por serie a filas de `ContadorCodigo`, que se indexa por (área, tipo)
/// y no por la cadena del código.
///
/// **Once de las cuarenta series del libro no tienen par.** Los prefijos `PRO`, `LCO` y
/// `CLI` no son de ningún área del catálogo —hoy son `PRY`, `LEG` y `SAC`— y `GEN` no es la
/// abreviatura de ningún tipo MAGERIT. Son códigos históricos que el libro conserva, y el
/// §3 es explícito en que conservarlos es la regla.
///
/// **No sembrarlas no rompe nada, y vale explicar por qué.** La app arma el código como
/// `area.prefijo`-`tipo.abreviatura`-`NNNN`: sin par (área, tipo) tampoco puede EMITIR un
/// código de esa serie. Una serie que no se puede emitir no se puede repetir, así que el
/// riesgo que el §3 quiere evitar —que un alta futura repita un código vivo— no existe ahí.
/// Se reporta igual: que sea inofensivo hoy no lo hace invisible.
export function contadoresASembrar(
  maximos: ReadonlyMap<string, number>,
  areas: readonly { id: number; prefijo: string }[],
  tipos: readonly { id: number; abreviatura: string }[],
): { sembrar: ContadorASembrar[]; sinPar: SerieSinPar[] } {
  const sembrar: ContadorASembrar[] = [];
  const sinPar: SerieSinPar[] = [];

  for (const [serie, valor] of maximos) {
    const [prefijo, abreviatura] = serie.split('-');
    const area = areas.find((a) => a.prefijo === prefijo);
    const tipo = tipos.find((t) => t.abreviatura === abreviatura);

    if (!area || !tipo) {
      const falta = !area ? `ningún área tiene el prefijo «${prefijo}»` : `ningún tipo MAGERIT tiene la abreviatura «${abreviatura}»`;
      sinPar.push({
        serie,
        motivo: `${falta}, así que la app no puede emitir códigos de esta serie y no hay contador que sembrar.`,
      });
      continue;
    }
    sembrar.push({ serie, areaId: area.id, tipoId: tipo.id, valor });
  }

  return { sembrar, sinPar };
}

// ─── D-1 · el tipo de la arista sale del Grafo ─────────────────────────────────────────


/// La clave con la que se indexa un par (origen → destino).
///
/// El separador es un NUL porque no puede aparecer dentro de un código de activo; con un
/// guion —que los códigos SÍ contienen— dos pares distintos producirían la misma clave.
/// Vive acá y no en cada llamador para que el índice y la consulta no puedan discrepar: una
/// clave escrita con otro separador no falla: devuelve `undefined`, y todo cae en el `USA`
/// por defecto de D-1 sin que nadie lo note.
export function claveDeArista(origen: string, destino: string): string {
  return `${origen}\u0000${destino}`;
}

/// Una fila de «Grafo (aristas)», reducida a lo que el cruce necesita.
export interface AristaGrafo {
  origen: string;
  relacion: string;
  destino: string;
}

/// La cabecera REAL de «Grafo (aristas)» está en la FILA 3, no en la 1.
///
/// Las dos primeras son un título («Aristas del grafo») y una nota sobre los prefijos. Leer
/// desde la 1 no falla: devuelve basura como nombres de columna y el cruce queda vacío. Y
/// eso es lo peor que podría pasar, porque las 40 aristas caerían todas en el `USA` por
/// defecto de D-1 y nadie notaría que el tipo nunca se derivó.
export const FILA_ENCABEZADO_GRAFO = 3;

/// El tipo de cada par (origen → destino) del grafo, indexado por el mismo camino que usan
/// las aristas de la hoja Dependencias.
///
/// **Sólo los pares activo→activo.** El grafo del libro tiene 585 nodos contra 299 activos:
/// modela la raíz (`RAIZ`), los grupos (`G:`), los caminos (`C:`) y los terceros por nombre.
/// `DependenciaActivo` exige dos `Activo`, así que el resto no puede ser una arista y
/// guardarlo sólo agrandaría el índice con claves que nadie va a consultar.
export function tiposDelGrafo(
  aristas: readonly AristaGrafo[],
): Map<string, 'USA' | 'SE_ALOJA_EN'> {
  const tipos = new Map<string, 'USA' | 'SE_ALOJA_EN'>();
  for (const a of aristas) {
    const origen = a.origen.trim();
    const destino = a.destino.trim();
    if (!esCodigoDeLibro(origen) || !esCodigoDeLibro(destino)) continue;
    // La dirección importa: A→B no dice nada de B→A (E4).
    tipos.set(claveDeArista(origen, destino), tipoDeDependencia(a.relacion));
  }
  return tipos;
}

// ─── El parte de la carga (§6 y §8) ────────────────────────────────────────────────────
//
// Vive acá —y no en la acción— porque lo escribe el servidor y lo dibuja el cliente, y esos
// dos no pueden discrepar sobre su forma. Mismo motivo que `plantilla.ts`.

export interface LineaParte {
  /// Fila de Excel, para que la persona la pueda abrir.
  fila: number;
  /// El código del activo o el nombre del despliegue: con qué reconocerla en la hoja.
  referencia: string;
  mensaje: string;
}

/// Lo que pasó con una hoja del libro.
///
/// **`rechazadas` y `avisos` separadas a propósito.** Una rechazada NO entró y hay que
/// arreglar el archivo; una con aviso SÍ entró y hay algo que completar en la app. Mezclarlas
/// en una sola lista de «problemas» obliga a leer cada mensaje para saber si el dato está o
/// no está — que es justo lo que el parte tiene que responder de un vistazo.
export interface BloqueParte {
  /// Nombre de la hoja tal como aparece en el libro.
  hoja: string;
  titulo: string;
  cargadas: number;
  rechazadas: LineaParte[];
  avisos: LineaParte[];
}

/// Un criterio del §8, con lo que se esperaba y lo que salió.
export interface CriterioAceptacion {
  numero: number;
  texto: string;
  esperado: string;
  obtenido: string;
  cumple: boolean;
}

/// Lo que la carga va a BORRAR antes de escribir.
///
/// **Esta es la parte del parte que más importa, y la que no salía a la pantalla.** El §1
/// del REQ dice que V19 *sustituye* al inventario, y los códigos obligan a que así sea: 135
/// de los 299 del libro ya existen apuntando a otro activo, porque el importador anterior los
/// REGENERÓ. Escribir encima pisaría 121 activos ajenos en silencio, así que la carga borra
/// primero.
///
/// Para una migración de una vez eso es correcto. Como botón permanente, decir «Importar 299
/// activos» y no decir «y borra los 247 que hay» convierte una decisión informada en una
/// sorpresa. La pantalla muestra estos números ANTES de pedir confirmación.
export interface Sustitucion {
  activos: number;
  valoraciones: number;
  riesgos: number;
  /// Los riesgos que alguien TOCÓ: tratamiento, estado, responsable, observación,
  /// justificación, o excluido a mano.
  ///
  /// Va aparte del total porque no duelen igual. `generarRiesgos` regenera los derivados sin
  /// esfuerzo —son un cálculo—, pero estos son trabajo humano del SGSI y no vuelven. Si este
  /// número es cero, la carga no destruye ninguna decisión; si no lo es, la persona tiene que
  /// verlo antes de confirmar, no después.
  riesgosConDecision: number;
  dependencias: number;
  despliegues: number;
  actasBorrado: number;
  activosAfectados: number;
  asignaciones: number;
}

export interface ParteConsolidado {
  bloques: BloqueParte[];
  criterios: CriterioAceptacion[];
  /// Series del §3 que no se pudieron sembrar por no tener par (área, tipo).
  seriesSinContador: SerieSinPar[];
  /// Lo que se va a borrar. Ausente cuando el parte se arma después de escribir.
  sustitucion?: Sustitucion;
}
