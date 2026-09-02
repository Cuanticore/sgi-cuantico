// lib/sig/plantilla-normas.ts
//
// Lee y valida la plantilla de numerales de una norma auditable. PURO: recibe una matriz de
// celdas ya extraída del libro y no toca Prisma ni la red, así que se prueba sin base de
// datos — el mismo criterio que `lib/sgsi/plantilla-lectura.ts` para los activos.
//
// El catálogo ya trae dos normas sembradas con 54 requisitos entre las dos, así que el
// importador tiene que decidir qué hace con un numeral que ya existe. La decisión está
// abajo, en `Decision`, y es explícita en la vista previa: nada se actualiza en silencio.

export type Matriz = (string | number | null | undefined)[][];

/// Qué va a pasar con cada fila. La vista previa muestra esto ANTES de importar, porque
/// «actualizar» sobre un catálogo normativo no es lo mismo que «agregar»: cambiar el título
/// de un numeral que ya se auditó reescribe la referencia de las notas que lo citan.
export type Decision = 'AGREGAR' | 'ACTUALIZAR' | 'SIN_CAMBIO';

export interface FilaNumeral {
  /// Número de fila en el libro, para que el error se pueda ir a corregir.
  fila: number;
  numeral: string;
  titulo: string;
  auditable: boolean;
  orden: number;
  decision: Decision;
  errores: string[];
}

export interface Existente {
  numeral: string;
  titulo: string;
  auditable: boolean;
}

export interface Lectura {
  filas: FilaNumeral[];
  listas: number;
  conErrores: number;
  agregar: number;
  actualizar: number;
  sinCambio: number;
}

const ENCABEZADOS = ['numeral', 'título', 'auditable'] as const;

function texto(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/// Acepta las tres formas con las que la gente escribe un sí en una hoja de cálculo. Un
/// valor que no es ninguna de las seis NO se interpreta: se rechaza la fila. Adivinar acá
/// significaría marcar como auditable un numeral que alguien quiso excluir.
function ternario(v: unknown): boolean | null {
  const t = texto(v).toLowerCase();
  if (t === '') return true; // vacío = auditable, que es el valor por defecto del modelo
  if (['sí', 'si', 'x', 'true', '1', 'auditable'].includes(t)) return true;
  if (['no', 'false', '0', 'no auditable'].includes(t)) return false;
  return null;
}

/// El numeral de una norma ISO: dígitos separados por puntos, como 6.1 o 8.5.1. Se valida
/// la forma porque es la clave con la que el requisito se identifica dentro de la norma, y
/// un «6,1» escrito con coma crea un segundo requisito que nadie va a encontrar.
const FORMA_NUMERAL = /^\d+(\.\d+)*$/;

export function encabezadosValidos(matriz: Matriz): boolean {
  const primera = (matriz[0] ?? []).map((c) => texto(c).toLowerCase());
  return ENCABEZADOS.every((e, i) => primera[i]?.startsWith(e.slice(0, 6)));
}

export function leerNumerales(matriz: Matriz, existentes: Existente[]): Lectura {
  const porNumeral = new Map(existentes.map((e) => [e.numeral, e]));
  const vistos = new Map<string, number>();
  const filas: FilaNumeral[] = [];

  // La primera fila es el encabezado. El orden se asigna por posición en el libro, que es
  // el orden en que la norma los enumera.
  for (let i = 1; i < matriz.length; i++) {
    const cruda = matriz[i] ?? [];
    const numeral = texto(cruda[0]);
    const titulo = texto(cruda[1]);
    const auditableCrudo = cruda[2];

    // Fila completamente vacía: no es un error, es el final de la hoja o un hueco.
    if (numeral === '' && titulo === '' && texto(auditableCrudo) === '') continue;

    const errores: string[] = [];

    if (numeral === '') errores.push('Falta el numeral.');
    else if (!FORMA_NUMERAL.test(numeral)) {
      errores.push(`El numeral «${numeral}» no tiene la forma de un numeral ISO (6.1, 8.5.1).`);
    }
    if (titulo === '') errores.push('Falta el título.');

    const auditable = ternario(auditableCrudo);
    if (auditable === null) {
      errores.push(`«${texto(auditableCrudo)}» no es un sí ni un no en la columna Auditable.`);
    }

    const repetida = vistos.get(numeral);
    if (repetida !== undefined) {
      errores.push(`El numeral «${numeral}» ya aparece en la fila ${repetida}.`);
    } else if (numeral !== '') {
      vistos.set(numeral, i + 1);
    }

    const previo = porNumeral.get(numeral);
    let decision: Decision = 'AGREGAR';
    if (previo) {
      decision =
        previo.titulo === titulo && previo.auditable === (auditable ?? true)
          ? 'SIN_CAMBIO'
          : 'ACTUALIZAR';
    }

    filas.push({
      fila: i + 1,
      numeral,
      titulo,
      auditable: auditable ?? true,
      orden: i,
      decision,
      errores,
    });
  }

  const listas = filas.filter((f) => f.errores.length === 0);
  return {
    filas,
    listas: listas.length,
    conErrores: filas.length - listas.length,
    agregar: listas.filter((f) => f.decision === 'AGREGAR').length,
    actualizar: listas.filter((f) => f.decision === 'ACTUALIZAR').length,
    sinCambio: listas.filter((f) => f.decision === 'SIN_CAMBIO').length,
  };
}
