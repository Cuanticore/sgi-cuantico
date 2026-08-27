// lib/sgsi/plantilla-lectura.ts
//
// The template reader, as a pure function.
//
// No Prisma and no exceljs here on purpose. The action's job is to turn the upload into a
// matrix of cell text and load the catalogues; deciding what each row MEANS — and what is
// wrong with it — happens here, where a test can drive it with fixture catalogues and no
// database. Same reason lib/sgsi/madurez.ts is pure: the arithmetic that classifies data
// must be exercisable without the environment that stores it.

import { COLUMNAS_PLANTILLA } from './plantilla';
import type { FilaLeida } from './plantilla';

/// Alineación del formato histórico FOR-SIG-12 (hoja «1. Matriz de Activos», encabezado
/// en la fila 7, columnas B..U). Cada encabezado del workbook original apunta a la clave
/// interna de la plantilla; las columnas T («Valor del activo») y U («Nivel») se ignoran
/// porque se derivan.
export const LEGACY_FORSIG12: Record<string, string> = {
  'Código': 'codigoHeredado',
  'Nombre del activo': 'nombre',
  'Descripción': 'descripcion',
  'Tipo de activo': 'tipo',
  'Subtipo de activo': 'subtipo',
  'Proceso o área': 'area',
  'Proceso o Área': 'area',
  'Responsable (custodio)': 'custodio',
  'Custodio': 'custodio',
  'Propietario del activo': 'propietario',
  'Ubicación': 'ubicacion',
  'Entorno': 'entorno',
  '¿Contiene datos de cliente?': 'datosCliente',
  '¿Contiene datos personales (Ley 1581)?': 'datosPersonales',
  '¿Está expuesto a Internet?': 'expuestoInternet',
  'Proveedor o subencargado': 'proveedor',
  'Valor en Disponibilidad': 'valorD',
  'Valor en Integridad': 'valorI',
  'Valor en Confidencialidad': 'valorC',
};

/// Valores legacy que el workbook original escribe de otra forma a los del catálogo
/// actual. Un solo mapeo para que el importador y el exportador digan lo mismo.
export const LEGACY_NORMALIZAR = {
  ubicacion: { 'N.A.': 'No aplica', 'Física': 'Físico', 'Nube Microsoft 366': 'Nube Microsoft 365' },
  entorno: { 'N.A.': 'No aplica' },
  proveedor: { 'Por definir': '' },
  area: { 'Gestió de Proyectos': 'Gestión de Proyectos' },
} as const;

/// Búsqueda insensible a mayúsculas/acentos del encabezado legacy: el workbook original
/// escribe «Proceso o Área» y la plantilla «área» — es la misma columna, no un error.
export function claveLegacy(encabezado: string): string | undefined {
  for (const [nombre, clave] of Object.entries(LEGACY_FORSIG12)) {
    if (encabezado.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0) return clave;
  }
  return undefined;
}

/// True cuando la alineación de la fila de encabezado coincide con el formato
/// FOR-SIG-12 heredado (col B «Código», col G «Proceso o Área», col Q valor D…).
export function esFormatoLegacy(filaEncabezado: readonly string[]): boolean {
  const claves = new Set<string>();
  let reconocidas = 0;
  for (const v of filaEncabezado) {
    const clave = claveLegacy(v.trim());
    if (clave) {
      claves.add(clave);
      reconocidas++;
    }
  }
  return (
    claves.has('codigoHeredado') &&
    claves.has('area') &&
    claves.has('custodio') &&
    claves.has('valorD') &&
    reconocidas >= 10
  );
}

export type Ternario = 'SI' | 'NO' | 'POR_DEFINIR';

export interface Catalogos {
  tipos: { id: number; codigo: string }[];
  subtipos: { id: number; tipoId: number; codigo: string }[];
  areas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string }[];
  ubicaciones: { id: number; nombre: string }[];
  entornos: { id: number; nombre: string }[];
  proveedores: { id: number; nombre: string }[];
  escala: { valor: number; etiqueta: string }[];
  /// Legacy codes already in the inventory, lowercased and trimmed by the caller.
  heredadosExistentes: Set<string>;
}

/// A row that passed every check, resolved to ids and ready to write.
export interface FilaResuelta extends FilaLeida {
  codigoHeredado: string | null;
  nombre: string;
  descripcion: string | null;
  areaId: number;
  tipoId: number;
  subtipoId: number;
  custodioId: number;
  propietarioId: number | null;
  ubicacionId: number | null;
  entornoId: number | null;
  proveedorId: number | null;
  datosCliente: Ternario;
  datosPersonales: Ternario;
  expuestoInternet: Ternario;
  valorD: number;
  valorI: number;
  valorC: number;
}

/// "[D] Datos / Información" and a bare "[D]" mean the same catalogue entry, so the code in
/// brackets is what gets matched. The rest of the cell is the person's own wording.
export function entreCorchetes(v: string): string {
  const m = /^(\[[^\]]+\])/.exec(v.trim());
  return m ? m[1] : v.trim();
}

export function aTernario(v: string): Ternario {
  const t = v.trim().toLowerCase();
  if (t === 'sí' || t === 'si') return 'SI';
  if (t === 'no') return 'NO';
  // Anything unrecognised becomes "por definir" rather than a silent "no": an unanswered
  // question about personal data must not read as an answer.
  return 'POR_DEFINIR';
}

/// Accent- and case-insensitive. Somebody typing "Direccion" for "Dirección" made a typing
/// mistake, not a data mistake.
function igual(a: string, b: string): boolean {
  return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

/// One row of cell text per sheet row, header included, in template column order.
export type Matriz = string[][];

/// Validates every row against the catalogues. `filas` carries a verdict for each row that
/// held data; `resueltas` is the subset that can be written.
export function leerFilas(
  matriz: Matriz,
  catalogos: Catalogos,
): { filas: FilaLeida[]; resueltas: FilaResuelta[] } {
  const indice = new Map(COLUMNAS_PLANTILLA.map((c, i) => [c.clave, i]));
  const filas: FilaLeida[] = [];
  const resueltas: FilaResuelta[] = [];
  const heredadosEnArchivo = new Map<string, number>();

  // Row 1 is the header; row 2 of a freshly downloaded template is the example.
  for (let i = 1; i < matriz.length; i++) {
    const celdas = matriz[i] ?? [];
    // Sheet row numbers, so an error message points at a line they can find.
    const numero = i + 1;
    const leer = (clave: string): string => (celdas[indice.get(clave) ?? 0] ?? '').trim();

    const nombre = leer('nombre');
    const codigoHeredado = leer('codigoHeredado');

    // A blank line in the middle of a spreadsheet is normal, and the template's own
    // example is not data. Neither is an error worth reporting.
    if (nombre === '' && codigoHeredado === '') continue;
    if (codigoHeredado.toUpperCase().startsWith('EJEMPLO')) continue;

    const errores: string[] = [];
    const lectura: Record<string, string> = {};
    const capturar = (clave: string): string => {
      const v = leer(clave);
      lectura[clave] = v;
      return v;
    };

    lectura.nombre = nombre;
    lectura.codigoHeredado = codigoHeredado;
    if (nombre === '') errores.push('Falta el nombre del activo.');

    const descripcion = capturar('descripcion');

    const textoTipo = capturar('tipo');
    const tipo =
      textoTipo === ''
        ? undefined
        : catalogos.tipos.find((t) => t.codigo === entreCorchetes(textoTipo));
    if (textoTipo === '') errores.push('Falta el tipo MAGERIT.');
    else if (!tipo) errores.push(`Tipo MAGERIT desconocido: «${textoTipo}».`);

    const textoSubtipo = capturar('subtipo');
    let subtipo;
    if (textoSubtipo === '') {
      errores.push('Falta el subtipo.');
    } else if (tipo) {
      subtipo = catalogos.subtipos.find(
        (s) => s.tipoId === tipo.id && s.codigo === entreCorchetes(textoSubtipo),
      );
      // Deliberately not "unknown subtype": the usual mistake is a valid subtype under the
      // wrong type, and saying which type it was checked against is what makes it fixable.
      if (!subtipo) errores.push(`El subtipo «${textoSubtipo}» no pertenece a ${tipo.codigo}.`);
    }

    const textoArea = capturar('area');
    const area =
      textoArea === '' ? undefined : catalogos.areas.find((a) => igual(a.nombre, textoArea));
    if (textoArea === '') errores.push('Falta el proceso o área.');
    else if (!area) errores.push(`Proceso o área desconocido: «${textoArea}».`);

    const buscarCargo = (clave: string, etiqueta: string, obligatorio: boolean) => {
      const v = capturar(clave);
      if (v === '') {
        if (obligatorio) errores.push(`Falta el ${etiqueta}.`);
        return undefined;
      }
      const c = catalogos.cargos.find((x) => igual(x.nombre, v));
      if (!c) errores.push(`El ${etiqueta} «${v}» no está en la lista de cargos.`);
      return c;
    };
    const custodio = buscarCargo('custodio', 'custodio', true);
    const propietario = buscarCargo('propietario', 'propietario', false);

    const buscarCatalogo = (
      clave: string,
      catalogo: { id: number; nombre: string }[],
      etiqueta: string,
    ) => {
      const v = capturar(clave);
      if (v === '') return undefined;
      const c = catalogo.find((x) => igual(x.nombre, v));
      if (!c) errores.push(`${etiqueta} no reconocida: «${v}».`);
      return c;
    };
    const ubicacion = buscarCatalogo('ubicacion', catalogos.ubicaciones, 'Ubicación');
    const entorno = buscarCatalogo('entorno', catalogos.entornos, 'Entorno');
    const proveedor = buscarCatalogo('proveedor', catalogos.proveedores, 'Proveedor');

    // Captured even though they never fail, so the preview can show what was written.
    capturar('datosCliente');
    capturar('datosPersonales');
    capturar('expuestoInternet');

    const buscarValor = (clave: string, dimension: string): number | undefined => {
      const v = capturar(clave);
      if (v === '') {
        errores.push(`Falta el valor en ${dimension}.`);
        return undefined;
      }
      // Both "4 — Alto" and a bare "4" are accepted: the label is what the template
      // offers, but a spreadsheet often turns the cell into a number.
      const e =
        catalogos.escala.find((x) => igual(x.etiqueta, v)) ??
        catalogos.escala.find((x) => String(x.valor) === v);
      if (!e) errores.push(`Valor en ${dimension} fuera de la escala: «${v}».`);
      return e?.valor;
    };
    const valorD = buscarValor('valorD', 'Disponibilidad');
    const valorI = buscarValor('valorI', 'Integridad');
    const valorC = buscarValor('valorC', 'Confidencialidad');

    const clave = codigoHeredado.toLowerCase();
    if (clave !== '') {
      if (catalogos.heredadosExistentes.has(clave)) {
        errores.push(`Ya existe un activo con el código heredado «${codigoHeredado}».`);
      }
      const repetida = heredadosEnArchivo.get(clave);
      if (repetida !== undefined) {
        errores.push(`El código heredado «${codigoHeredado}» ya aparece en la fila ${repetida}.`);
      } else {
        heredadosEnArchivo.set(clave, numero);
      }
    }

    const leida: FilaLeida = { fila: numero, lectura, errores };
    filas.push(leida);

    if (
      errores.length === 0 &&
      area &&
      tipo &&
      subtipo &&
      custodio &&
      valorD !== undefined &&
      valorI !== undefined &&
      valorC !== undefined
    ) {
      resueltas.push({
        ...leida,
        codigoHeredado: codigoHeredado === '' ? null : codigoHeredado,
        nombre,
        descripcion: descripcion === '' ? null : descripcion,
        areaId: area.id,
        tipoId: tipo.id,
        subtipoId: subtipo.id,
        custodioId: custodio.id,
        propietarioId: propietario?.id ?? null,
        ubicacionId: ubicacion?.id ?? null,
        entornoId: entorno?.id ?? null,
        proveedorId: proveedor?.id ?? null,
        datosCliente: aTernario(lectura.datosCliente ?? ''),
        datosPersonales: aTernario(lectura.datosPersonales ?? ''),
        expuestoInternet: aTernario(lectura.expuestoInternet ?? ''),
        valorD,
        valorI,
        valorC,
      });
    }
  }

  return { filas, resueltas };
}
