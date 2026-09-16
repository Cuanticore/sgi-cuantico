// lib/sgsi/plan-plantilla-libro.ts
//
// FOR-SIG-13 «Plan de Tratamiento y Mejora», versión 02: el formato del cliente con las
// columnas que el modelo exige, y con las listas desplegables pobladas desde los catálogos
// REALES de la base.
//
// Sin Prisma y sin sesión: la ruta comprueba el permiso y carga los catálogos; esta función
// sólo decide cómo es el ARCHIVO. Mismo corte que `inventario-libro.ts`.
//
// ── LAS COLUMNAS DEL CLIENTE NO SE TOCAN ────────────────────────────────────────────────
//
// A–O son las quince de la v01, en su orden y con su nombre. El formato lo llena gente que ya
// lo conoce; mover o renombrar una columna convierte un archivo a medio llenar en uno que
// importa mal sin avisar. Lo que el sistema necesita va de P en adelante, junto y bajo su
// propio rótulo, para que se lea como lo que es.
//
// ── LAS LISTAS SE POBLAN DE LA BASE, NO SE ESCRIBEN A MANO ──────────────────────────────
//
// Los 93 controles y los cargos salen de la hoja «Listas» como rangos con nombre. Una lista
// escrita a mano en la fórmula envejece el día que se agrega un control, y entonces el
// formato ofrece opciones que el importador va a rechazar — que es la peor combinación
// posible: el desplegable promete que el valor es válido.
//
// Excel tiene un tope de ~255 caracteres para una lista literal dentro de la validación, así
// que 93 controles NO caben de todas formas. El rango con nombre es la única forma que
// funciona, no una preferencia.

import ExcelJS from 'exceljs';
import { ENCABEZADOS } from './plan-importacion';

export interface CatalogosPlantilla {
  /// «A.5.15 — Control de acceso». El código primero: es la llave por la que el importador
  /// resuelve, y así lo que se elige es exactamente lo que se busca.
  controles: readonly string[];
  cargos: readonly string[];
  /// Los niveles de la escala vigente, como texto.
  madurez: readonly string[];
}

/// Dónde empieza cada cosa. Nombradas para que el lector y el escritor no puedan discrepar.
export const FILA_ENCABEZADOS = 5;
export const PRIMERA_FILA_DATOS = 6;
/// Hasta dónde llegan las validaciones. Más filas de las que nadie va a llenar, porque una
/// validación que se corta a la mitad de la hoja es peor que ninguna: las primeras filas
/// prometen que se valida y las de abajo no.
const ULTIMA_FILA_VALIDADA = 500;

const AZUL = 'FF12263F';
const GRIS = 'FFF1F4F7';
const AMBAR = 'FFFDF6E3';

function columnaLetra(indice: number): string {
  let n = indice + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/// Cuántas de las columnas son del formato original. De ahí en adelante, las del sistema.
const COLUMNAS_DEL_CLIENTE = 15;

const ANCHOS = [
  26, 8, 16, 26, 26, 38, 44, 30, 15, 38, 15, 26, 22, 38, 16,
  15, 34, 16, 10, 16, 44, 18, 30, 30,
];

export async function construirPlantillaPlanes(
  catalogos: CatalogosPlantilla,
  hoy: Date,
): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIG Cuantico · SGSI';
  libro.created = hoy;

  const h = libro.addWorksheet('Plan de Tratamiento y Mejora', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: FILA_ENCABEZADOS }],
  });

  // ── Cabecera del formato ───────────────────────────────────────────────────────────────
  const ultima = ENCABEZADOS.length;
  h.mergeCells(1, 1, 3, ultima - 2);
  const titulo = h.getCell(1, 1);
  titulo.value = 'MATRIZ DE PLANES IMPLEMENTACIÓN DE CONTROLES, TRATAMIENTO DE RIESGOS Y MEJORA';
  titulo.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  titulo.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };

  const meta: [string, string][] = [
    ['Código:', 'FOR-SIG-13'],
    ['Versión:', '02'],
    ['Fecha:', hoy.toISOString().slice(0, 10)],
  ];
  meta.forEach(([k, v], i) => {
    h.getCell(1 + i, ultima - 1).value = k;
    h.getCell(1 + i, ultima - 1).font = { bold: true, size: 9 };
    h.getCell(1 + i, ultima).value = v;
    h.getCell(1 + i, ultima).font = { size: 9 };
  });

  // Fila 4: el rótulo que separa las columnas del cliente de las del sistema. Sin él, las
  // nueve nuevas parecen parte del formato de siempre y nadie sabe por qué aparecieron.
  h.mergeCells(4, 1, 4, COLUMNAS_DEL_CLIENTE);
  const rotuloCliente = h.getCell(4, 1);
  rotuloCliente.value = 'FORMATO FOR-SIG-13 — sin cambios respecto de la versión 01';
  rotuloCliente.font = { bold: true, size: 8, color: { argb: 'FF5B6875' } };
  rotuloCliente.alignment = { horizontal: 'center' };
  rotuloCliente.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };

  h.mergeCells(4, COLUMNAS_DEL_CLIENTE + 1, 4, ultima);
  const rotuloSistema = h.getCell(4, COLUMNAS_DEL_CLIENTE + 1);
  rotuloSistema.value = 'CAMPOS QUE EXIGE EL SISTEMA — sin estos, la fila no se puede importar';
  rotuloSistema.font = { bold: true, size: 8, color: { argb: 'FF8A3F14' } };
  rotuloSistema.alignment = { horizontal: 'center' };
  rotuloSistema.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } };

  // ── Encabezados ────────────────────────────────────────────────────────────────────────
  const filaEnc = h.getRow(FILA_ENCABEZADOS);
  ENCABEZADOS.forEach((texto, i) => {
    const celda = filaEnc.getCell(i + 1);
    celda.value = texto;
    celda.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: i < COLUMNAS_DEL_CLIENTE ? AZUL : 'FF8A3F14' },
    };
    celda.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
    h.getColumn(i + 1).width = ANCHOS[i] ?? 20;
  });
  filaEnc.height = 34;

  // ── Hoja de listas ─────────────────────────────────────────────────────────────────────
  //
  // Oculta: no es para leerla, es para que las validaciones tengan de dónde sacar sus
  // opciones. Visible, invita a editarla, y editarla rompe los desplegables sin avisar.
  const listas = libro.addWorksheet('Listas', { state: 'hidden' });
  const definir = (columna: number, nombre: string, valores: readonly string[]): void => {
    listas.getCell(1, columna).value = nombre;
    valores.forEach((v, i) => {
      listas.getCell(i + 2, columna).value = v;
    });
    listas.getColumn(columna).width = 44;
    if (valores.length > 0) {
      const L = columnaLetra(columna - 1);
      libro.definedNames.add(`Listas!$${L}$2:$${L}$${valores.length + 1}`, nombre);
    }
  };

  const CLASES = ['Plan de Tratamiento de Riesgos', 'Plan de Mejora'];
  const TIPOS = ['Mitigar', 'Transferir', 'Evitar', 'Aceptar'];
  const ESTADOS = ['No iniciada', 'En ejecución', 'En verificación', 'Cerrada', 'Cancelada'];
  const VERIF = ['Pendiente', 'Verificada — eficaz', 'Verificada — no eficaz', 'No aplica'];

  definir(1, 'LstClasePlan', CLASES);
  definir(2, 'LstTipoAccion', TIPOS);
  definir(3, 'LstControl', catalogos.controles);
  definir(4, 'LstCargo', catalogos.cargos);
  definir(5, 'LstEstadoPlan', ESTADOS);
  definir(6, 'LstVerificacion', VERIF);
  definir(7, 'LstMadurez', catalogos.madurez);

  // ── Validaciones ───────────────────────────────────────────────────────────────────────
  //
  // `allowBlank` en TODAS: una columna que exige valor en las 500 filas impide guardar un
  // archivo a medio llenar, y estos formatos se llenan en varias sesiones. Lo que falte lo
  // reporta el importador, fila por fila y con motivo — que es donde el rechazo sirve para
  // algo, porque ahí se puede explicar.
  const lista = (columna: number, nombre: string): void => {
    const L = columnaLetra(columna);
    for (let f = PRIMERA_FILA_DATOS; f <= ULTIMA_FILA_VALIDADA; f++) {
      h.getCell(`${L}${f}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`=${nombre}`],
        showErrorMessage: true,
        errorTitle: 'Valor fuera de la lista',
        error: 'Elegí una opción de la lista. El importador rechaza cualquier otro valor.',
      };
    }
  };

  lista(0, 'LstClasePlan');        // A · Tipo de Plan
  lista(4, 'LstCargo');            // E · Propietario del riesgo
  lista(7, 'LstCargo');            // H · Responsable de ejecución
  lista(12, 'LstVerificacion');    // M · Verificación de eficacia
  lista(14, 'LstMadurez');         // O · Madurez alcanzada
  lista(15, 'LstTipoAccion');      // P · Tipo de acción
  lista(16, 'LstControl');         // Q · Control
  lista(17, 'LstEstadoPlan');      // R · Estado

  // El avance, numérico y acotado. Es la única validación que no es una lista, y va acotada
  // porque un 150 % se escribe sin querer y el importador lo rechaza: mejor atajarlo acá.
  for (let f = PRIMERA_FILA_DATOS; f <= ULTIMA_FILA_VALIDADA; f++) {
    h.getCell(`S${f}`).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [0, 100],
      showErrorMessage: true,
      errorTitle: 'Avance fuera de rango',
      error: 'El avance va de 0 a 100.',
    };
  }

  // ── Instrucciones ──────────────────────────────────────────────────────────────────────
  //
  // En su propia hoja y no en una fila de comentarios sobre la matriz: una nota dentro de la
  // tabla se borra al filtrar, al ordenar o al pegar un bloque de filas.
  const guia = libro.addWorksheet('Cómo llenarlo');
  guia.getColumn(1).width = 34;
  guia.getColumn(2).width = 104;
  guia.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  const nota = (a: string, b: string): void => {
    const f = guia.addRow([a, b]);
    f.getCell(1).font = { bold: true, size: 9 };
    f.getCell(2).font = { size: 9 };
  };
  guia.addRow(['FOR-SIG-13 versión 02 — cómo se llena']).font = { bold: true, size: 13 };
  guia.addRow([]);
  nota('Qué cambió', 'Las columnas A a O son las de siempre. De P en adelante están las que el sistema necesita para poder crear el plan; sin ellas la fila se lee, pero se rechaza con el motivo escrito.');
  nota('Tipo de Plan (A)', 'Las dos clases entran: «Plan de Tratamiento de Riesgos» nace del análisis de riesgos; «Plan de Mejora» nace de un hallazgo, una auditoría o una oportunidad. Si se deja en blanco se asume tratamiento.');
  nota('Tipo de acción (P)', 'Mitigar, Transferir, Evitar o Aceptar. En blanco se asume Mitigar. Cada una pide lo suyo: ver abajo.');
  nota('Control (Q)', 'Obligatorio cuando la acción es MITIGAR: la unidad de gestión del plan es la mejora de un control, porque al subir su madurez bajan de golpe todos los riesgos que ese control mitiga. Elegilo de la lista — el importador no aproxima al más parecido.');
  nota('Aceptar', 'Pide justificación (U) y fecha de revisión (V). Una aceptación sin vencimiento es una que nadie vuelve a mirar.');
  nota('Transferir', 'Pide el instrumento —póliza, contrato o cláusula— (W) y el riesgo remanente (X): transferir nunca mueve el riesgo completo.');
  nota('Fechas', 'Se aceptan 30/06/2027 y 2027-06-30. Una fecha que no se pueda leer se reporta; no se guarda como «sin fecha».');
  nota('Avance % (S)', 'De 0 a 100. Un plan marcado «Cerrada» con avance 0 se corrige a 100 al importar.');
  nota('Propietario del riesgo (E)', 'Es quien APRUEBA el plan, y por diseño no es quien lo ejecuta: ISO/IEC 27001 6.1.3 pide que el dueño del riesgo apruebe.');
  nota('Filas incompletas', 'Guardá el archivo cuando quieras: ninguna columna obliga a llenarla para poder guardar. Al importar, cada fila sale como plan creado o como rechazo con su número de fila y su motivo. Ninguna se descarta en silencio.');

  return libro;
}
