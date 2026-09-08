// Genera el LIBRO DE REVISIÓN de REQ-SIG-17 · docs/handoff_sig/carga-obligaciones-v1.xlsx
//
// NO es el importador. Esto produce el artefacto que el líder del SIG revisa antes de
// cargar; el importador vive en `prisma/seeds/obligaciones.ts` y lee el .xlsx que sale
// de acá. Ver `docs/handoff_sig/prompt-carga-req-sig-17.md`.
//
// Las 22 filas de contenido y las 27 de obligación están declaradas abajo: son la
// derivación de §4.2 del requerimiento, revisada a mano. La hoja «Fuente», en cambio,
// se LEE del cronograma real en cada corrida y no se retipea nunca: es la trazabilidad
// entre lo que dice el Excel de OneDrive y lo que se derivó de él.
//
//   node scripts/generar-libro-obligaciones.mjs ["ruta/a/09. SISTEMA INTEGRADO DE GESTION"]
//
// Sin argumento usa la ruta de OneDrive del equipo del SIG.
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIG =
  process.argv[2] ??
  'C:/Users/danie/Cuantico/Cuantico - Documents/09. SISTEMA INTEGRADO DE GESTION';
const SALIDA = join(RAIZ, 'docs/handoff_sig/carga-obligaciones-v1.xlsx');

const val = (c) => {
  let v = c.value;
  if (v && typeof v === 'object') v = v.result ?? v.text ?? v.richText?.map((x) => x.text).join('') ?? '';
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
};

// ── Contenidos · 22 ───────────────────────────────────────────────────────────
// [clave, fila, numeral, tipo, titulo, descripcion, docCodigo, docNombre, nota]
const CONTENIDOS = [
  ['C01', '13', '4.2', 'TAREA', 'Monitoreo de las cuestiones internas y externas de Cuantico', 'Monitoreo de las cuestiones internas y externas de Cuantico. (en caso de que se generen cambios)', '', 'PESTEL', ''],
  ['C02', '14', '4.3', 'TAREA', 'Monitoreo de las necesidades y expectativas de las partes interesadas', 'Monitoreo de las necesidades y expectativas de las partes interesadas (en caso de que se generen cambios)', 'MAT-EST-02', 'Matriz de partes interesadas', ''],
  ['C03', '15', '4.4', 'TAREA', 'Monitorear periódicamente el mapa de procesos', 'Monitorear periodicamente el mapa de procesos', 'MAP-CAL-01', 'Mapa de procesos', 'la fuente escribe «periodicamente» sin tilde'],
  ['C04', '17', '5.1', 'TAREA', 'Actualizar la política HSEQ', 'Actualizar la política HSEQ', 'POL-EST-01', 'Politica, Alcance y Objetivos de Calidad', 'G-3 · la fuente dice POL-CAL-01, código obsoleto'],
  ['C05', '19', '6.1', 'TAREA', 'Monitoreo de las acciones establecidas para abordar riesgos y oportunidades', 'Monitoreo de las acciones establecidas para abordar riesgos y oportunidades', 'MAT-CAL-02', 'Matriz de Riesgos y Oportunidades', ''],
  ['C06', '20', '6.2', 'TAREA', 'Actualización y seguimiento de los objetivos de calidad de la firma', 'Actualización y segumientos de los objetivos de calidad de la firma', 'POL-EST-01', 'Politica, Alcance y Objetivos de Calidad', 'G-3 · código obsoleto en la fuente · y escribe «segumientos»'],
  ['C07', '22', '7.1', 'TAREA', 'Establecer presupuesto del Sistema de gestión de Calidad', 'Establecer presupuesto del Sistema de gestión de Calidad', '', 'Presupuesto', ''],
  ['C08', '23', '7.2', 'TAREA', 'Revisión y actualización de la presentación de inducción de calidad', 'Revisión y actualización de la presentación de inducción de calidad (cuando aplique)', '', 'Presentación Inducción', 'G-8 · sin marca de planeado → NO genera obligación'],
  ['C09', '24', '7.2', 'TAREA', 'Ejecución del plan de comunicaciones', 'Ejecución plan de comunicaciones', 'FOR-CAL-10', 'Plan de comunicaciones', 'G-8 · sin marca de planeado → NO genera obligación'],
  ['C10', '25', '7.2', 'CAPACITACION', 'Inducción y reinducción al personal', 'Inducción y reinducción al personal: Garantizar que los colaboradores conozcan la organización, sus responsabilidades y los lineamientos del SGC.', 'FOR-TAL-01', 'Formato Plan de Formación y Capacitación', ''],
  ['C11', '26', '7.2', 'CAPACITACION', 'Capacitaciones en temas de calidad y mejora continua', 'Capacitaciones en temas de calidad y mejora continua: Fortalecer la cultura de calidad, la comprensión de la norma ISO 9001:2015 y herramientas de mejora.', '', 'Lista de asistencia · Evaluación de Capacitación', 'G-7 · malla irregular; periodicidad provisional (D-3)'],
  ['C12', '27', '7.3', 'TAREA', 'Control de documentos y registros', 'Control de documentos y registros: Asegurar la vigencia y disponibilidad de la información documentada.', '', 'Listado maestro de documentos', ''],
  ['C13', '29', '8.1', 'TAREA', 'Monitoreo de los procedimientos de Cuantico', 'Monitoreo de los procedimientos de Cuantico', '', 'Listado maestro de documentos', ''],
  ['C14', '30', '8.1', 'TAREA', 'Revisión de la identificación de requisitos legales y de otra índole en los proyectos', 'Revisión de la identificación requisitos legales y de otra indole en los proyectos', 'MAT-EST-01', 'Matriz de Requisitos Legales', 'G-8 · sin marca de planeado → NO genera obligación'],
  ['C15', '31', '8.1', 'TAREA', 'Comité de Calidad', 'Comité de Calidad: Reuniones de seguimiento a indicadores, acciones y oportunidades de mejora, planes de acción, entre otros.', 'FOR-FIN-04', 'Formato Acta de Reunión', 'G-3 · la fuente dice FOR-GAF-07 · G-6 · la malla es bimestral (D-3)'],
  ['C16', '33-41', '9.1 a 9.9', 'TAREA', 'Seguimiento de indicadores de gestión del proceso', 'Seguimiento de indicadores de gestión del proceso: Revisar y consolidar resultados.', 'MAT-CAL-03', 'Matriz de Indicadores · Tablero de indicadores', 'UN contenido para las 9 filas; el proceso va en el alcance de cada obligación'],
  ['C17', '42', '9.10', 'TAREA', 'Seguimiento a satisfacción del cliente / quejas y reclamos', 'Seguimiento a satisfacción del cliente / quejas y reclamos: Analizar encuestas y reclamos para identificar mejoras.', '', 'Análisis de encuestas', ''],
  ['C18', '43', '9.11', 'TAREA', 'Evaluación de proveedores', 'Evaluación de proveedores: Verificar cumplimiento en calidad, tiempos y condiciones de servicio.', 'FOR-LCO-04', 'Formato Evaluación de proveedores', 'G-3 · la fuente dice FOR-GAF-04'],
  ['C19', '44', '9.12', 'TAREA', 'Ejecución de la auditoría interna', 'Ejecución auditoria Interna', 'FOR-CAL-07', 'Informe de Auditoría Interna', ''],
  ['C20', '45', '9.13', 'TAREA', 'Revisión por la Dirección', 'Revisión por la Dirección: Realizar informe de revisión por la dirección', '', 'Informe de revisión por la dirección', ''],
  ['C21', '46', '9.14', 'TAREA', 'Ejecución de la auditoría externa', 'Ejecución y atención de la auditoría externa de tercera parte', '', 'Informe auditoría externa', 'G-4 · la fuente dice «Evaluación de proveedores»: texto copiado de la fila 43. El numeral y el soporte dicen auditoría externa'],
  ['C22', '48', '10 (fuente: 4.1.)', 'TAREA', 'Gestión de acciones correctivas y de mejora', 'Gestión de Acciones Correctivas y de Mejora: dar seguimiento al cierre y eficacia de las acciones.', 'FOR-CAL-02', 'Acciones Correctivas y de Mejora · FOR-CAL-03 Control de planes de Acción', 'G-5 · la fuente lleva numeral 4.1. bajo el capítulo 10'],
];

// ── Obligaciones · 27, en orden de fila del cronograma ────────────────────────
// [clave, contenido, fila, numeral, alcance, destino, periodicidad, plazo, aviso, esProveedor, nota]
const OBLIGACIONES = [
  ['O01', 'C01', 13, '4.2', 'CARGO', 'CEO', 'ANUAL', 60, 15, 'no', ''],
  ['O02', 'C02', 14, '4.3', 'CARGO', 'CEO', 'TRIMESTRAL', 30, 10, 'no', ''],
  ['O03', 'C03', 15, '4.4', 'CARGO', 'CEO', 'SEMESTRAL', 45, 10, 'no', 'marcada en 2025-09 y 2026-02: cinco meses de separación'],
  ['O04', 'C04', 17, '5.1', 'CARGO', 'CEO', 'ANUAL', 60, 15, 'no', ''],
  ['O05', 'C05', 19, '6.1', 'CARGO', 'CEO', 'TRIMESTRAL', 30, 10, 'no', ''],
  ['O06', 'C06', 20, '6.2', 'CARGO', 'CEO', 'ANUAL', 60, 15, 'no', ''],
  ['O07', 'C07', 22, '7.1', 'CARGO', 'CEO', 'ANUAL', 60, 15, 'no', ''],
  ['O08', 'C10', 25, '7.2', 'CARGO', 'Talento Humano', 'MENSUAL', 15, 5, 'no', ''],
  ['O09', 'C11', 26, '7.2', 'CARGO', 'Líder del SIG', 'TRIMESTRAL', 30, 10, 'no', 'D-3 · la malla es irregular (OCT-NOV 2025 · ABR-JUN 2026). TRIMESTRAL es el valor provisional de la prueba'],
  ['O10', 'C12', 27, '7.3', 'CARGO', 'Profesional de Calidad y Procesos', 'MENSUAL', 15, 5, 'no', 'D-4 · cargo que hay que crear'],
  ['O11', 'C13', 29, '8.1', 'CARGO', 'Profesional de Calidad y Procesos', 'MENSUAL', 15, 5, 'no', 'D-4 · cargo que hay que crear'],
  ['O12', 'C15', 31, '8.1', 'CARGO', 'Líder del SIG', 'TRIMESTRAL', 30, 10, 'no', 'D-3 · la fuente planea 6 comités al año (bimestral) y el enum no lo tiene. TRIMESTRAL pide 4'],
  ['O13', 'C16', 33, '9.1', 'AREA', 'EST · Gestión Estratégica', 'MENSUAL', 15, 5, 'no', ''],
  ['O14', 'C16', 34, '9.2', 'AREA', 'COM · Gestión Comercial', 'MENSUAL', 15, 5, 'no', ''],
  ['O15', 'C16', 35, '9.3', 'AREA', 'PRY · Gestión de Proyectos', 'MENSUAL', 15, 5, 'no', 'el prefijo del área es PRY, no PRO'],
  ['O16', 'C16', 36, '9.4', 'AREA', 'SAC · Soporte y Servicio al Cliente', 'MENSUAL', 15, 5, 'no', ''],
  ['O17', 'C16', 37, '9.5', 'AREA', 'TAL · Talento Humano', 'MENSUAL', 15, 5, 'no', ''],
  ['O18', 'C16', 38, '9.6', 'AREA', 'LEG · Gestión Legal y Compras', 'MENSUAL', 15, 5, 'no', ''],
  ['O19', 'C16', 39, '9.7', 'AREA', 'TEC · Gestión Tecnológica', 'MENSUAL', 15, 5, 'no', ''],
  ['O20', 'C16', 40, '9.8', 'AREA', 'SIG · Sistema Integrado de Gestión', 'MENSUAL', 15, 5, 'no', 'la fuente dice «Proceso de Gestión de Calidad»'],
  ['O21', 'C16', 41, '9.9', 'AREA', 'FIN · Gestión Financiera', 'MENSUAL', 15, 5, 'no', ''],
  ['O22', 'C17', 42, '9.10', 'AREA', 'SAC · Soporte y Servicio al Cliente', 'MENSUAL', 15, 5, 'no', 'la fuente nombra dos procesos (Proyectos y SAC); satisfacción y quejas viven en SAC'],
  ['O23', 'C18', 43, '9.11', 'CARGO', 'Chief Legal Officer', 'ANUAL', 60, 15, 'SÍ', 'única con esProveedor=true: es la reevaluación anual de POL-TEC-02'],
  ['O24', 'C19', 44, '9.12', 'CARGO', 'Líder de proceso', 'ANUAL', 60, 15, 'no', 'D-5 · cargo que hay que crear. La alternativa es AREA replicado ×9'],
  ['O25', 'C20', 45, '9.13', 'CARGO', 'CEO', 'ANUAL', 60, 15, 'no', ''],
  ['O26', 'C21', 46, '9.14', 'CARGO', 'Líder de proceso', 'ANUAL', 60, 15, 'no', 'D-5 · cargo que hay que crear'],
  ['O27', 'C22', 48, '10', 'CARGO', 'Líder de proceso', 'MENSUAL', 15, 5, 'no', 'D-5 · cargo que hay que crear'],
];

const CARGOS = [
  ['Alta Dirección', 'CEO', 'existe', 'aparece en 7 filas como primer responsable'],
  ['CEO', 'CEO', 'existe', 'coincidencia exacta · fila 45'],
  ['Líder de Calidad · Lider de Gestión de Calidad', 'Líder del SIG', 'existe', 'la persona es Laura Agudelo (acta 22/04/2026)'],
  ['Profesional de Calidad y Procesos', 'Profesional de Calidad y Procesos', 'CREAR (D-4)', 'la persona es Katherine Quiroga. Es el responsable de seguimiento de las 27'],
  ['Gestión de Talento Humano', 'Talento Humano', 'existe', 'coincidencia exacta · fila 25'],
  ['Gestión Legal y Compras', 'Chief Legal Officer', 'existe', 'filas 30 y 43'],
  ['Líderes de Proceso · Lider de Proceso', 'Líder de proceso', 'CREAR (D-5)', 'no es un cargo en la fuente, es un conjunto. Filas 44, 46 y 48'],
];

const AREAS = [
  ['Proceso Estratégico', 'EST', 'Gestión Estratégica', 33, '9.1'],
  ['Proceso de Gestión Comercial', 'COM', 'Gestión Comercial', 34, '9.2'],
  ['Proceso de Gestión de Proyectos', 'PRY', 'Gestión de Proyectos', 35, '9.3'],
  ['Proceso de Soporte y Servicio al Cliente', 'SAC', 'Soporte y Servicio al Cliente', 36, '9.4'],
  ['Proceso de Talento Humano', 'TAL', 'Talento Humano', 37, '9.5'],
  ['Proceso de Gestión Legal y Compras', 'LEG', 'Gestión Legal y Compras', 38, '9.6'],
  ['Proceso de Gestión Tecnológica', 'TEC', 'Gestión Tecnológica', 39, '9.7'],
  ['Proceso de Gestión de Calidad', 'SIG', 'Sistema Integrado de Gestión', 40, '9.8'],
  ['Proceso de Gestión Financiera', 'FIN', 'Gestión Financiera', 41, '9.9'],
];

const SIN_OBLIGACION = [
  ['C08', 23, '7.2', 'Revisión y actualización de la presentación de inducción de calidad', 'La fuente la marca «(cuando aplique)» y no tiene ninguna marca de planeado en 12 meses'],
  ['C09', 24, '7.2', 'Ejecución del plan de comunicaciones', 'Cero marcas de planeado. El plan existe (FOR-CAL-10) pero su ejecución no está agendada'],
  ['C14', 30, '8.1', 'Revisión de la identificación de requisitos legales en los proyectos', 'Cero marcas de planeado. Enlaza con MAT-EST-01, que además está vacía'],
];

const DECISIONES = [
  ['D-1', 'Alcance del REQ', 'CERRADA', 'Obligaciones, acciones/planes y contexto. Las otras 12 fuentes quedan en §10 del REQ'],
  ['D-2', 'Retroactividad', 'CERRADA', 'fechaInicio = 2026-09-01 en las 27. El cronograma va de AGO-2025 a JUL-2026 y hoy es 2026-09-08: cargar la fecha real generaría 13 meses de vencidos'],
  ['D-3', 'BIMESTRAL en el enum', 'PROVISIONAL', 'Para la prueba, O09 y O12 van TRIMESTRAL. Consecuencia: el sistema pedirá 4 comités al año donde la organización planeó 6'],
  ['D-4', 'Cargo «Profesional de Calidad y Procesos»', 'PROVISIONAL', 'Se crea en CargoResponsable. Sin él, O10 y O11 no tienen alcance y ninguna de las 27 tiene responsable de seguimiento'],
  ['D-5', 'Cargo «Líder de proceso»', 'PROVISIONAL', 'Se crea. Alternativa descartada para la prueba: AREA replicado ×9, que suma 27 asignaciones más por periodo'],
  ['D-6', 'Plazos', 'PROVISIONAL', 'MENSUAL 15/5 · TRIMESTRAL 30/10 · SEMESTRAL 45/10 · ANUAL 60/15. Es una regla razonada, no un dato: la fuente no habla de plazos'],
  ['D-7', 'Bloque de acciones y planes', 'ABIERTA', 'No entra en esta carga. Las 46 filas de FOR-CAL-03 no tienen fecha de detección'],
];

const LEEME = [
  ['REQ-SIG-17 · libro de carga de obligaciones', ''],
  ['', ''],
  ['Generado', '2026-09-08'],
  ['Fuente única', '03. Manuales/1. Cronograma SIG/1. Cronograma SGC.xlsx · 30 actividades · malla AGO-2025 a JUL-2026'],
  ['Requerimiento', 'docs/handoff_sig/carga-obligaciones-planes-contexto.md'],
  ['', ''],
  ['QUÉ REVISAR', ''],
  ['1', 'Hoja «Obligaciones», columna PERIODICIDAD: sale de la malla del cronograma, no de un criterio. La regla está en §4.3 del REQ'],
  ['2', 'Columnas PLAZO_DIAS y DIAS_AVISO: NO están en la fuente. Son la regla D-6, inventada con criterio. Es lo primero que hay que confirmar o cambiar'],
  ['3', 'Hoja «Cargos»: dos cargos hay que crearlos. Ninguna etiqueta del cronograma coincide con el catálogo, salvo CEO'],
  ['4', 'Hoja «Sin obligacion»: tres actividades entran como contenido y NO generan obligación. Si alguna debe generarla, hay que decidirle la frecuencia'],
  ['5', 'Columna NOTA de las dos hojas de datos: cada G-n es un defecto de la fuente documentado en §4.6 del REQ'],
  ['', ''],
  ['CIFRAS', ''],
  ['Contenidos', 22],
  ['Obligaciones', 27],
  ['MENSUAL', 14],
  ['ANUAL', 8],
  ['TRIMESTRAL', 4],
  ['SEMESTRAL', 1],
  ['Actividades sin obligación', 3],
  ['', ''],
  ['LO QUE NO VA EN ESTE LIBRO', ''],
  ['codigo', 'Lo emite el contador atómico por tipo (TAR-001, CAP-001). La columna CLAVE es solo para enlazar hojas durante la carga'],
  ['Asignacion', 'La produce generarAsignaciones(). Cargarla a mano es un error'],
  ['RegistroRealizado', 'Se crea al cerrar una asignación'],
  ['EntradaContexto', 'El DOFA y el PESTEL 2026 cargan cabecera; sus casillas no existen en el repositorio'],
];

// ── Construcción ──────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = 'REQ-SIG-17';
wb.created = new Date('2026-09-08');

const AZUL = 'FF12437F';
const encabezar = (ws, cols) => {
  ws.columns = cols.map((c) => ({ header: c[0], key: String(c[1]), width: c[2] }));
  const f = ws.getRow(1);
  f.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  f.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  f.alignment = { vertical: 'middle', wrapText: true };
  f.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
};
const ajustar = (ws, desde = 2) => {
  for (let r = desde; r <= ws.rowCount; r++) {
    ws.getRow(r).alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).font = { size: 10 };
  }
};

// Leeme
{
  const ws = wb.addWorksheet('Leeme');
  ws.columns = [{ width: 34 }, { width: 118 }];
  for (const fila of LEEME) {
    const r = ws.addRow(fila);
    r.alignment = { vertical: 'top', wrapText: true };
    r.font = { size: 10 };
    const a = String(fila[0]);
    if (a === a.toUpperCase() && a.trim() !== '' && !/^\d+$/.test(a)) {
      r.font = { size: 10, bold: true, color: { argb: AZUL } };
    }
  }
  ws.getRow(1).font = { size: 13, bold: true, color: { argb: AZUL } };
}

// Contenidos
{
  const ws = wb.addWorksheet('Contenidos');
  encabezar(ws, [
    ['CLAVE', 'clave', 8], ['FILA CRON.', 'fila', 11], ['NUMERAL ISO', 'num', 13],
    ['TIPO', 'tipo', 15], ['TITULO', 'titulo', 46], ['DESCRIPCION', 'desc', 62],
    ['PROCEDIMIENTO_ORIGEN', 'origen', 40], ['DOCUMENTO_CODIGO', 'dcod', 17],
    ['DOCUMENTO_NOMBRE', 'dnom', 34], ['EXIGE_FIRMA', 'firma', 12],
    ['EXIGE_EVALUACION', 'eval', 15], ['NOTA / DEFECTO DE LA FUENTE', 'nota', 52],
  ]);
  for (const [clave, fila, num, tipo, titulo, desc, dcod, dnom, nota] of CONTENIDOS) {
    ws.addRow({
      clave, fila, num, tipo, titulo, desc,
      origen: `FOR-CAL-11 Cronograma SGC · numeral ISO 9001 ${num}`,
      dcod, dnom, firma: 'no', eval: 'no', nota,
    });
  }
  ajustar(ws);
}

// Obligaciones
{
  const ws = wb.addWorksheet('Obligaciones');
  encabezar(ws, [
    ['CLAVE', 'clave', 8], ['CONTENIDO', 'cont', 11], ['FILA CRON.', 'fila', 11],
    ['NUMERAL ISO', 'num', 12], ['ALCANCE', 'alcance', 10], ['DESTINO DEL ALCANCE', 'destino', 36],
    ['PERIODICIDAD', 'per', 14], ['FECHA_INICIO', 'inicio', 13], ['PLAZO_DIAS', 'plazo', 11],
    ['DIAS_AVISO', 'aviso', 11], ['ANCLAJE', 'ancla', 11],
    ['RESPONSABLE_SEGUIMIENTO', 'resp', 30], ['CONTROL_ANEXO_A', 'anexo', 15],
    ['ES_PROVEEDOR', 'prov', 13], ['NOTIFICAR', 'notif', 10], ['ACTIVA', 'activa', 9],
    ['NOTA', 'nota', 62],
  ]);
  for (const [clave, cont, fila, num, alcance, destino, per, plazo, aviso, prov, nota] of OBLIGACIONES) {
    ws.addRow({
      clave, cont, fila, num, alcance, destino, per,
      inicio: '2026-09-01', plazo, aviso, ancla: 'ANCLADA',
      resp: 'Profesional de Calidad y Procesos', anexo: '—',
      prov, notif: 'sí', activa: 'sí', nota,
    });
  }
  ajustar(ws);
}

// Cargos
{
  const ws = wb.addWorksheet('Cargos');
  encabezar(ws, [
    ['ETIQUETA EN EL CRONOGRAMA', 'e', 44], ['CargoResponsable DESTINO', 'd', 34],
    ['ESTADO EN EL CATALOGO', 's', 17], ['NOTA', 'n', 62],
  ]);
  for (const f of CARGOS) ws.addRow({ e: f[0], d: f[1], s: f[2], n: f[3] });
  ajustar(ws);
}

// Areas
{
  const ws = wb.addWorksheet('Areas');
  encabezar(ws, [
    ['PROCESO EN EL CRONOGRAMA', 'p', 42], ['PREFIJO', 'x', 9],
    ['Area.nombre', 'a', 34], ['FILA CRON.', 'f', 11], ['NUMERAL ISO', 'n', 12],
  ]);
  for (const f of AREAS) ws.addRow({ p: f[0], x: f[1], a: f[2], f: f[3], n: f[4] });
  ajustar(ws);
}

// Sin obligacion
{
  const ws = wb.addWorksheet('Sin obligacion');
  encabezar(ws, [
    ['CLAVE', 'c', 8], ['FILA CRON.', 'f', 11], ['NUMERAL ISO', 'n', 12],
    ['ACTIVIDAD', 'a', 56], ['POR QUE NO GENERA OBLIGACION', 'p', 76],
  ]);
  for (const f of SIN_OBLIGACION) ws.addRow({ c: f[0], f: f[1], n: f[2], a: f[3], p: f[4] });
  ajustar(ws);
}

// Decisiones
{
  const ws = wb.addWorksheet('Decisiones');
  encabezar(ws, [
    ['ID', 'i', 7], ['DECISION', 'd', 40], ['ESTADO', 'e', 14], ['VALOR APLICADO EN ESTA CARGA', 'v', 96],
  ]);
  for (const f of DECISIONES) ws.addRow({ i: f[0], d: f[1], e: f[2], v: f[3] });
  ajustar(ws);
}

// Fuente · leída del cronograma real
{
  const src = new ExcelJS.Workbook();
  await src.xlsx.readFile(`${SIG}/03. Manuales/1. Cronograma SIG/1. Cronograma SGC.xlsx`);
  const s = src.worksheets[0];
  const cab = {};
  for (const fila of [8, 9, 10, 11]) {
    const row = s.getRow(fila);
    let ult = '';
    cab[fila] = [];
    for (let c = 1; c <= s.columnCount; c++) {
      const v = val(row.getCell(c));
      if (v) ult = v;
      cab[fila][c] = fila === 11 ? v : ult;
    }
  }
  const MES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };
  const cols = [];
  for (let c = 8; c <= s.columnCount; c++) {
    if (cab[11][c] === 'P' || cab[11][c] === 'E') {
      cols.push({ c, pe: cab[11][c], mes: `${cab[8][c]}-${String(MES[cab[9][c]]).padStart(2, '0')}` });
    }
  }

  const ws = wb.addWorksheet('Fuente');
  encabezar(ws, [
    ['FILA', 'f', 7], ['NUMERAL', 'n', 10], ['ACTIVIDAD (textual)', 'a', 70],
    ['RESPONSABLE (textual)', 'r', 46], ['DOCUMENTO SOPORTE (textual)', 'd', 40],
    ['MESES PLANEADO', 'p', 62], ['# P', 'np', 6], ['MESES EJECUTADO', 'e', 62], ['# E', 'ne', 6],
  ]);
  for (let r = 12; r <= 48; r++) {
    const row = s.getRow(r);
    const num = val(row.getCell(2));
    const item = val(row.getCell(3));
    const act = val(row.getCell(4));
    if ((!num && !act) || act === item) continue;
    const marca = (pe) => [...new Set(cols.filter((x) => x.pe === pe)
      .filter((k) => { const v = val(row.getCell(k.c)); return v && v !== '0'; })
      .map((k) => k.mes))].sort();
    const P = marca('P'); const E = marca('E');
    ws.addRow({
      f: r, n: num, a: act, r: val(row.getCell(6)), d: val(row.getCell(7)),
      p: P.join(' '), np: P.length, e: E.join(' '), ne: E.length,
    });
  }
  ajustar(ws);
}

await wb.xlsx.writeFile(SALIDA);

// ── Verificación de lo escrito ────────────────────────────────────────────────
const chk = new ExcelJS.Workbook();
await chk.xlsx.readFile(SALIDA);
const cuenta = (h) => chk.getWorksheet(h).rowCount - 1;
const obl = chk.getWorksheet('Obligaciones');
const porPer = {};
for (let r = 2; r <= obl.rowCount; r++) {
  const p = val(obl.getRow(r).getCell(7));
  porPer[p] = (porPer[p] ?? 0) + 1;
}
console.log('ESCRITO:', SALIDA);
console.log('hojas          :', chk.worksheets.map((w) => w.name).join(' · '));
console.log('Contenidos     :', cuenta('Contenidos'));
console.log('Obligaciones   :', cuenta('Obligaciones'));
console.log('Sin obligacion :', cuenta('Sin obligacion'));
console.log('Cargos         :', cuenta('Cargos'), '· Areas:', cuenta('Areas'), '· Decisiones:', cuenta('Decisiones'));
console.log('Fuente         :', cuenta('Fuente'));
console.log('periodicidad   :', JSON.stringify(porPer));
const claves = new Set(CONTENIDOS.map((c) => c[0]));
const usadas = new Set(OBLIGACIONES.map((o) => o[1]));
console.log('contenidos sin obligación:', [...claves].filter((k) => !usadas.has(k)).join(' '));
console.log('obligaciones huérfanas   :', [...usadas].filter((k) => !claves.has(k)).join(' ') || 'ninguna');
