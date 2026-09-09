// lib/sgsi/consolidado-lectura.ts
//
// La «Matriz de Activos» del Consolidado V19 → filas resueltas contra los catálogos
// (REQ-SIG-12 §4.1).
//
// Sin Prisma y sin exceljs, por el mismo motivo que `plantilla-lectura.ts`: la acción
// convierte el libro en texto de celdas y trae los catálogos; decidir qué significa cada
// fila —y qué está mal en ella— pasa acá, donde una prueba lo puede ejercitar sin base de
// datos y sin archivo.
//
// ─── Rechazar y avisar no son lo mismo ─────────────────────────────────────────────────
//
// El §6 es tajante: **ningún caso borde aborta la carga**. Pero «no abortar» no es «cargar
// cualquier cosa», y la diferencia la marca el esquema:
//
//   RECHAZADA · la fila no CABE en el modelo. `Activo.areaId`, `tipoId`, `subtipoId` y
//               `nombre` son NOT NULL, y `ActivoValor` no admite una dimensión sin valor.
//               Sin eso no hay fila que escribir, y se devuelve el motivo.
//
//   AVISO     · la fila cabe, pero algo quedó a medias. `custodioId`, `propietarioId`,
//               `ubicacionId`, `entornoId` y `proveedorId` son nulables: el activo entra y
//               alguien completa el dato en la app.
//
// Un vacío DECLARADO no es ninguna de las dos cosas. El libro tiene dieciocho activos sin
// custodio (H-20) y doce sin ubicación (H-21): el libro no está incompleto ahí, está
// diciendo que no hay dato. Reportarlos sería ahogar los avisos que sí piden acción.

import { aTernario, entreCorchetes, type Ternario } from './plantilla-lectura';
import { esCodigoDeLibro } from './consolidado';

/// Las columnas de la hoja, por su NÚMERO en Excel (1-based), que es el que la persona ve
/// en la barra de columnas cuando le decimos «mirá la columna 11».
///
/// Faltan a propósito la 24 («Valor del activo») y la 25 («Nivel del activo»): las dos son
/// el máximo de D/I/C y su etiqueta. Guardarlas sería guardar dos veces el mismo hecho, y
/// la copia se desincroniza en cuanto alguien corrige una dimensión desde la app.
export const COLUMNAS_MATRIZ = {
  codigo: 2,
  n1: 3,
  n2: 4,
  n3: 5,
  nombre: 6,
  descripcion: 7,
  cantidad: 8,
  tipo: 9,
  subtipo: 10,
  area: 11,
  custodio: 12,
  propietario: 13,
  ubicacion: 14,
  entorno: 15,
  datosCliente: 16,
  datosPersonales: 17,
  expuestoInternet: 18,
  proveedor: 19,
  superior: 20,
  valorD: 21,
  valorI: 22,
  valorC: 23,
} as const;

/// La cabecera de la «Matriz de Activos» vive en la fila 7 y los datos arrancan en la 8.
export const FILA_ENCABEZADO_MATRIZ = 7;

export interface CatalogosConsolidado {
  areas: { id: number; nombre: string; prefijo: string }[];
  tipos: { id: number; codigo: string; abreviatura: string }[];
  subtipos: { id: number; tipoId: number; codigo: string }[];
  cargos: { id: number; nombre: string }[];
  ubicaciones: { id: number; nombre: string }[];
  entornos: { id: number; nombre: string }[];
  proveedores: { id: number; nombre: string }[];
  escala: { valor: number; etiqueta: string }[];
}

/// Una fila que pasó todos los controles, resuelta a ids y lista para escribir.
export interface FilaConsolidado {
  /// Número de fila en Excel, para que un problema apunte a una línea que se puede abrir.
  fila: number;
  /// **Preservado del libro** (§3). Nunca regenerado.
  codigo: string;
  n1: string;
  n2: string;
  n3: string;
  nombre: string;
  descripcion: string | null;
  cantidad: number;
  areaId: number;
  tipoId: number;
  subtipoId: number;
  custodioId: number | null;
  propietarioId: number | null;
  ubicacionId: number | null;
  entornoId: number | null;
  proveedorId: number | null;
  datosCliente: Ternario;
  datosPersonales: Ternario;
  expuestoInternet: Ternario;
  /// §5.4 · se resuelve en la SEGUNDA PASADA, cuando ya existen todos los activos.
  superiorCodigo: string | null;
  valorD: number;
  valorI: number;
  valorC: number;
}

export interface AvisoFila {
  fila: number;
  /// El código del activo, para que el parte se pueda cruzar con el libro sin contar filas.
  codigo: string;
  mensaje: string;
}

/// La ÚNICA normalización de área, y es explícita a propósito.
///
/// Treinta y cinco activos del libro escriben el área con su sigla, y el catálogo la tiene
/// con el mismo nombre sin ella. Es una diferencia de escritura, no un área distinta.
///
/// La tentación es una regla general —«lo que va entre paréntesis es la sigla»— y es peor:
/// convertiría cualquier paréntesis en una afirmación sobre a qué proceso pertenece un
/// activo, sin que nadie la haya revisado. Una tabla de alias se lee, se audita y crece
/// cuando alguien decide que crezca.
const ALIAS_AREA: Record<string, string> = {
  'Sistema Integrado de Gestión (SIG)': 'Sistema Integrado de Gestión',
};

/// «No aplica» en Proveedor es una RESPUESTA, no una omisión: el libro está diciendo que
/// ese activo no tiene proveedor. Se guarda como nulo y no se reporta, porque no hay nada
/// que corregir.
const PROVEEDOR_NO_APLICA = ['No aplica', 'N.A.', 'No Aplica'];

/// Los DOS activos del V19 cuyo TIPO contradice a su SUBTIPO.
///
///   `TEC-APP-0016` «Key Cloack»   tipo `[SW]`,  subtipo `[dir]`, que pertenece a `[S]`
///   `TEC-AUX-0001` «ChatGPT Pro»  tipo `[AUX]`, subtipo `[std]`, que pertenece a `[SW]`
///
/// Los dos no pueden ser verdaderos a la vez, y se le cree al subtipo: es la afirmación más
/// específica, y el dato lo respalda. Los doce subtipos de `[AUX]` son fuentes de
/// alimentación, UPS, cableado, fibra, mobiliario y cajas fuertes — ninguno describe una
/// suscripción a ChatGPT, así que ahí lo que está mal es el tipo.
///
/// **Es una lista de códigos y no una regla general, y esa es la parte importante.** El tipo
/// MAGERIT determina qué amenazas aplican vía `AmenazaTipo`, y por lo tanto qué riesgos
/// existen. Una regla que le creyera al subtipo SIEMPRE reclasificaría en silencio cualquier
/// discrepancia futura: estaría decidiendo sola sobre el análisis de riesgos. Estos dos
/// códigos los revisó una persona; el tercero que aparezca se rechaza y se reporta.
const TIPO_DESDE_SUBTIPO = new Set(['TEC-APP-0016', 'TEC-AUX-0001']);

/// Insensible a mayúsculas y acentos. Quien escribió «Direccion» por «Dirección» cometió un
/// error de tipeo, no un error de dato.
function igual(a: string, b: string): boolean {
  return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

function contiene(valores: readonly string[], buscado: string): boolean {
  return valores.some((v) => igual(v, buscado));
}

export interface LecturaMatriz {
  /// Las que se pueden escribir.
  filas: FilaConsolidado[];
  /// Las que NO caben en el modelo, con el motivo.
  rechazadas: AvisoFila[];
  /// Las que se cargan igual, con lo que quedó pendiente de completar.
  avisos: AvisoFila[];
}

/// Lee la hoja entera contra los catálogos.
///
/// `matriz[i]` es la fila `i + 1` de Excel y `matriz[i][c - 1]` su columna `c`, así que los
/// números de `COLUMNAS_MATRIZ` son los mismos que la persona ve en la hoja. Traducir esa
/// correspondencia una sola vez, acá, evita que cada lectura la reinvente con un off-by-one
/// propio.
export function leerMatrizConsolidado(
  matriz: readonly (readonly string[])[],
  catalogos: CatalogosConsolidado,
  filaEncabezado: number = FILA_ENCABEZADO_MATRIZ,
): LecturaMatriz {
  const filas: FilaConsolidado[] = [];
  const rechazadas: AvisoFila[] = [];
  const avisos: AvisoFila[] = [];
  const codigosVistos = new Map<string, number>();

  for (let i = filaEncabezado; i < matriz.length; i++) {
    const celdas = matriz[i] ?? [];
    const numero = i + 1;
    const col = (c: number): string => (celdas[c - 1] ?? '').trim();

    const codigo = col(COLUMNAS_MATRIZ.codigo);
    const nombre = col(COLUMNAS_MATRIZ.nombre);

    // Una fila en blanco en el medio de una hoja de cálculo es normal, no un error.
    if (codigo === '' && nombre === '') continue;

    const rechazar = (mensaje: string) => rechazadas.push({ fila: numero, codigo, mensaje });
    const avisar = (mensaje: string) => avisos.push({ fila: numero, codigo, mensaje });

    // ── El código, antes que nada (§3) ────────────────────────────────────────────────
    //
    // Se comprueba primero porque es la llave con la que las otras tres hojas —
    // Dependencias, Detalle de ambiente y el Grafo— apuntan a este activo. Un código roto
    // no es un campo más que falta: es una fila que nada podrá referenciar.
    if (!esCodigoDeLibro(codigo)) {
      rechazar(
        codigo === ''
          ? 'Falta el código del activo.'
          : `El código «${codigo}» no tiene la forma AAA-TTT-NNNN del libro.`,
      );
      continue;
    }
    const repetido = codigosVistos.get(codigo);
    if (repetido !== undefined) {
      rechazar(`El código «${codigo}» ya apareció en la fila ${repetido}.`);
      continue;
    }
    codigosVistos.set(codigo, numero);

    // ── Lo que la fila necesita para caber en el modelo ───────────────────────────────

    if (nombre === '') rechazar('Falta el nombre del activo.');

    const textoArea = col(COLUMNAS_MATRIZ.area);
    const nombreArea = ALIAS_AREA[textoArea] ?? textoArea;
    const area = catalogos.areas.find((a) => igual(a.nombre, nombreArea));
    if (textoArea === '') rechazar('Falta el proceso o área.');
    else if (!area) rechazar(`Proceso o área desconocido: «${textoArea}».`);

    const textoTipo = col(COLUMNAS_MATRIZ.tipo);
    const tipoDeclarado = catalogos.tipos.find((t) => t.codigo === entreCorchetes(textoTipo));
    if (textoTipo === '') rechazar('Falta el tipo MAGERIT.');
    else if (!tipoDeclarado) rechazar(`Tipo MAGERIT desconocido: «${textoTipo}».`);

    const textoSubtipo = col(COLUMNAS_MATRIZ.subtipo);
    let subtipo;
    let tipo = tipoDeclarado;
    if (textoSubtipo === '') {
      rechazar('Falta el subtipo.');
    } else if (tipoDeclarado) {
      const codigoSubtipo = entreCorchetes(textoSubtipo);
      subtipo = catalogos.subtipos.find(
        (s) => s.tipoId === tipoDeclarado.id && s.codigo === codigoSubtipo,
      );

      if (!subtipo) {
        // El tipo y el subtipo no pueden ser los dos verdaderos. Para los dos códigos que
        // una persona revisó se le cree al SUBTIPO —la afirmación más específica— y el tipo
        // se ajusta al suyo; para cualquier otro, se rechaza.
        const adoptable = TIPO_DESDE_SUBTIPO.has(codigo)
          ? catalogos.subtipos.filter((s) => s.codigo === codigoSubtipo)
          : [];
        const nuevoTipo =
          adoptable.length === 1
            ? catalogos.tipos.find((t) => t.id === adoptable[0].tipoId)
            : undefined;

        if (nuevoTipo) {
          subtipo = adoptable[0];
          tipo = nuevoTipo;
          // El aviso dice los DOS tipos. «Se corrigió el tipo» sin decir de qué a qué no se
          // puede auditar, y esto cambia qué amenazas aplican y por lo tanto qué riesgos
          // existen para este activo.
          avisar(
            `El libro declara el tipo ${tipoDeclarado.codigo} y el subtipo «${textoSubtipo}», que ` +
              `pertenece a ${nuevoTipo.codigo}. Se carga como ${nuevoTipo.codigo}: revisá la ` +
              'clasificación, porque de ella depende qué riesgos se generan.',
          );
        } else {
          // A propósito NO es «subtipo desconocido»: el error habitual es un subtipo válido
          // bajo el tipo equivocado, y decir contra qué tipo se comprobó es lo que lo hace
          // arreglable.
          rechazar(`El subtipo «${textoSubtipo}» no pertenece a ${tipoDeclarado.codigo}.`);
        }
      }
    }

    const valorDe = (clave: 'valorD' | 'valorI' | 'valorC', dimension: string) => {
      const v = col(COLUMNAS_MATRIZ[clave]);
      if (v === '') {
        rechazar(`Falta el valor en ${dimension}.`);
        return undefined;
      }
      // «4 — Alto» es lo que ofrece la plantilla; un «4» pelado es lo que suele quedar
      // cuando la hoja convierte la celda en número. Las dos son la misma respuesta.
      const e =
        catalogos.escala.find((x) => igual(x.etiqueta, v)) ??
        catalogos.escala.find((x) => String(x.valor) === v);
      if (!e) rechazar(`Valor en ${dimension} fuera de la escala: «${v}».`);
      return e?.valor;
    };
    const valorD = valorDe('valorD', 'Disponibilidad');
    const valorI = valorDe('valorI', 'Integridad');
    const valorC = valorDe('valorC', 'Confidencialidad');

    // ── Lo nulable: se carga igual, y se avisa si estaba escrito y no resolvió ────────

    const opcional = (
      clave: 'custodio' | 'propietario' | 'ubicacion' | 'entorno' | 'proveedor',
      catalogo: readonly { id: number; nombre: string }[],
      etiqueta: string,
    ): number | null => {
      const v = col(COLUMNAS_MATRIZ[clave]);
      if (v === '') return null;
      if (clave === 'proveedor' && contiene(PROVEEDOR_NO_APLICA, v)) return null;
      const encontrado = catalogo.find((x) => igual(x.nombre, v));
      if (!encontrado) {
        avisar(`${etiqueta} «${v}» no está en el catálogo: el activo se carga sin ${etiqueta.toLowerCase()}.`);
        return null;
      }
      return encontrado.id;
    };
    const custodioId = opcional('custodio', catalogos.cargos, 'Custodio');
    const propietarioId = opcional('propietario', catalogos.cargos, 'Propietario');
    const ubicacionId = opcional('ubicacion', catalogos.ubicaciones, 'Ubicación');
    const entornoId = opcional('entorno', catalogos.entornos, 'Entorno');
    const proveedorId = opcional('proveedor', catalogos.proveedores, 'Proveedor');

    // Una cantidad ilegible no vale rechazar un activo entero: el esquema ya trae 1 por
    // defecto y el dato que importa —qué activo es— está completo.
    const textoCantidad = col(COLUMNAS_MATRIZ.cantidad);
    let cantidad = 1;
    if (textoCantidad !== '') {
      const n = Number(textoCantidad);
      if (Number.isInteger(n) && n > 0) cantidad = n;
      else avisar(`Cantidad ilegible: «${textoCantidad}». Se carga con 1.`);
    }

    // Se captura sin validar contra nada: en esta pasada los demás activos todavía no
    // existen. La 2ª pasada (§5.4) resuelve el código o lo reporta.
    const superior = col(COLUMNAS_MATRIZ.superior);

    if (
      nombre !== '' &&
      area &&
      tipo &&
      subtipo &&
      valorD !== undefined &&
      valorI !== undefined &&
      valorC !== undefined
    ) {
      filas.push({
        fila: numero,
        codigo,
        n1: col(COLUMNAS_MATRIZ.n1),
        n2: col(COLUMNAS_MATRIZ.n2),
        n3: col(COLUMNAS_MATRIZ.n3),
        nombre,
        descripcion: col(COLUMNAS_MATRIZ.descripcion) || null,
        cantidad,
        areaId: area.id,
        tipoId: tipo.id,
        subtipoId: subtipo.id,
        custodioId,
        propietarioId,
        ubicacionId,
        entornoId,
        proveedorId,
        datosCliente: aTernario(col(COLUMNAS_MATRIZ.datosCliente)),
        datosPersonales: aTernario(col(COLUMNAS_MATRIZ.datosPersonales)),
        expuestoInternet: aTernario(col(COLUMNAS_MATRIZ.expuestoInternet)),
        superiorCodigo: superior === '' ? null : superior,
        valorD,
        valorI,
        valorC,
      });
    }
  }

  return { filas, rechazadas, avisos };
}
