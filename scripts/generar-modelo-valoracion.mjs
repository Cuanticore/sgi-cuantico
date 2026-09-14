// Genera `docs/handoff_sig/modelo-valoracion-riesgos.xlsx`
//
// El modelo de MET-SIG-01 v3 desarrollado en Excel, sobre los activos del
// Consolidado V19, con la columna de criticidad de REQ-SIG-20 §11 y la regla de
// eficacia de REQ-SIG-21 §4.
//
// LAS FÓRMULAS VAN VIVAS, no calculadas. El punto del libro es que el líder del SIG
// pueda escribir una relevancia o mover una madurez y ver las matrices moverse. Un
// volcado de números sería un informe; esto es un modelo.
//
//   node scripts/generar-modelo-valoracion.mjs ["ruta/al/repositorio documental"]

import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const req = createRequire(import.meta.url);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIG =
  process.argv[2] ??
  'C:/Users/danie/Cuantico/Cuantico - Documents/09. SISTEMA INTEGRADO DE GESTION';
const V19 = `${SIG}/14. Seguridad de la Informacion/2. Gestión de Activos y Protección de Información/0. Formato de Inventario por procesos/FOR-SIG-12 Consolidado de Activos de Información V19.xlsx`;
const SALIDA = join(RAIZ, 'docs/handoff_sig/modelo-valoracion-riesgos.xlsx');

const escalas = req('../prisma/data/escalas.json');
const amenazasJson = req('../prisma/data/amenazas.json');
const isoJson = req('../prisma/data/iso-controles.json');
const paresJson = req('../prisma/data/control-amenaza.json');

const AZUL = 'FF12437F';
const AZUL_SUAVE = 'FFE9F0FB';
const GRIS = 'FFF5F5F4';
const AMBAR = 'FFFFF4E5';

const val = (c) => {
  let v = c.value;
  if (v && typeof v === 'object') v = v.result ?? v.text ?? v.richText?.map((x) => x.text).join('') ?? '';
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
};
const primerDigito = (s) => {
  const m = String(s).match(/^(\d)/);
  return m ? Number(m[1]) : null;
};

// ── 1 · Leer V19 ──────────────────────────────────────────────────────────────
const libroV19 = new ExcelJS.Workbook();
await libroV19.xlsx.readFile(V19);
const hojaV19 = libroV19.getWorksheet('Matriz de Activos');

const activos = [];
for (let r = 8; r <= hojaV19.rowCount; r++) {
  const fila = hojaV19.getRow(r);
  const codigo = val(fila.getCell(2));
  if (!/^[A-Z]{3}-[A-Z]{3}-\d{4}$/.test(codigo)) continue;
  const tipo = val(fila.getCell(9)).match(/\[(\w+)\]/)?.[1];
  activos.push({
    codigo,
    nombre: val(fila.getCell(6)),
    nivel1: val(fila.getCell(3)),
    nivel2: val(fila.getCell(4)),
    nivel3: val(fila.getCell(5)),
    etiquetaV19: val(fila.getCell(25)),
    proceso: val(fila.getCell(11)),
    tipo: tipo ? `[${tipo}]` : '',
    subtipo: val(fila.getCell(10)),
    custodio: val(fila.getCell(12)),
    propietario: val(fila.getCell(13)),
    D: primerDigito(val(fila.getCell(21))),
    I: primerDigito(val(fila.getCell(22))),
    C: primerDigito(val(fila.getCell(23))),
  });
}

// ── 1b · Criticidad de negocio, asignada por regla ────────────────────────────
//
// Instrucción del líder del SIG (2026-09-14): el ambiente de producción de MinTrace
// es el más alto, los demás ambientes productivos el siguiente, y el resto más bajo.
//
// La regla se escribe acá y la columna «Origen» la deja visible en la hoja, para que
// cualquiera pueda discutir una fila sin tener que adivinar por qué le tocó ese nivel.
const criticidadDe = (a) => {
  if (/mintrace/i.test(a.nombre) && /ambiente de producci/i.test(a.nombre)) {
    return ['C1', 'Ambiente de producción de MinTrace · el más alto'];
  }
  if (/ambiente de producci/i.test(a.nombre)) {
    return ['C2', 'Ambiente de producción'];
  }
  return ['C4', 'Resto del inventario'];
};
for (const a of activos) [a.criticidad, a.origenCriticidad] = criticidadDe(a);

// ── 2 · Catálogos ─────────────────────────────────────────────────────────────
const CRITICIDAD = [
  ['C1', 'Crítica continua', 10, 5, 4, 'Multi-región activo-activo o conmutación automática probada'],
  ['C2', 'Crítica', 240, 60, 4, 'Segunda región en espera tibia, con conmutación probada'],
  ['C3', 'Importante', 1440, 480, 3, 'Respaldo restaurable con prueba de restauración periódica'],
  ['C4', 'Estándar', 4320, 1440, 3, 'Respaldo diario, restauración bajo demanda'],
  ['C5', 'Sin compromiso', null, null, null, 'Esfuerzo razonable. Es un valor, no la ausencia de uno'],
];
const RELEVANCIAS = [
  ['Principal', 0.7, 'Sin este control la amenaza no se contiene. Cada amenaza tiene exactamente uno'],
  ['Complementario', 0.2, 'Reduce la amenaza de forma sustantiva, pero no sustituye al principal'],
  ['De apoyo', 0.1, 'Ayuda por vía administrativa o cultural'],
];
const UMBRAL_VALORACION = 4;
const DELTA = 0.05;

const wb = new ExcelJS.Workbook();
wb.creator = 'REQ-SIG-20 · REQ-SIG-21 · REQ-SIG-23';
wb.created = new Date();

// Se crea primero para que quede como primera pestaña; se llena al final.
const wsLeeme = wb.addWorksheet('Leeme', { properties: { tabColor: { argb: AZUL } } });

// ── Utilidades de formato ─────────────────────────────────────────────────────
const encabezar = (ws, cols, fila = 1) => {
  ws.columns = cols.map((c) => ({ header: c[0], key: c[1], width: c[2] }));
  const f = ws.getRow(fila);
  f.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  f.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  f.alignment = { vertical: 'middle', wrapText: true };
  f.height = 32;
  ws.views = [{ state: 'frozen', ySplit: fila }];
  ws.autoFilter = { from: { row: fila, column: 1 }, to: { row: fila, column: cols.length } };
};
const cuerpo = (ws, desde = 2) => {
  for (let r = desde; r <= ws.rowCount; r++) {
    const f = ws.getRow(r);
    f.font = { size: 10 };
    f.alignment = { vertical: 'top' };
  }
};
const titulo = (ws, celda, texto) => {
  ws.getCell(celda).value = texto;
  ws.getCell(celda).font = { bold: true, size: 10, color: { argb: AZUL } };
};

// ── Hoja · Escalas ────────────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet('Escalas');
  ws.columns = [
    { width: 26 }, { width: 10 }, { width: 3 },
    { width: 14 }, { width: 10 }, { width: 3 },
    { width: 34 }, { width: 12 }, { width: 3 },
    { width: 22 }, { width: 10 }, { width: 3 },
    { width: 14 }, { width: 9 }, { width: 9 }, { width: 3 },
    { width: 14 }, { width: 9 }, { width: 9 },
  ];

  titulo(ws, 'A1', 'VALOR DEL ACTIVO');
  escalas.valor.forEach((v, i) => {
    ws.getCell(`A${2 + i}`).value = v.etiqueta;
    ws.getCell(`B${2 + i}`).value = v.valor;
  });

  titulo(ws, 'D1', 'DEGRADACIÓN');
  escalas.degradacion.forEach((d, i) => {
    ws.getCell(`D${2 + i}`).value = d.grado;
    ws.getCell(`E${2 + i}`).value = d.fraccion;
  });

  titulo(ws, 'G1', 'FRECUENCIA (ARO)');
  escalas.frecuencia.forEach((f, i) => {
    ws.getCell(`G${2 + i}`).value = f.etiqueta;
    ws.getCell(`H${2 + i}`).value = f.vecesPorAno;
  });

  titulo(ws, 'J1', 'MADUREZ → EFICACIA');
  escalas.madurez.forEach((m, i) => {
    ws.getCell(`J${2 + i}`).value = i; // nivel 0..5
    ws.getCell(`K${2 + i}`).value = m.eficacia;
    ws.getCell(`J${2 + i}`).note = m.nivel;
  });

  titulo(ws, 'M1', 'UMBRAL DE RIESGO');
  escalas.umbralRiesgo.forEach((u, i) => {
    ws.getCell(`M${2 + i}`).value = u.nivel;
    ws.getCell(`N${2 + i}`).value = u.desde;
    ws.getCell(`O${2 + i}`).value = u.hasta;
  });

  titulo(ws, 'Q1', 'UMBRAL DE IMPACTO');
  escalas.umbralImpacto.forEach((u, i) => {
    ws.getCell(`Q${2 + i}`).value = u.nivel;
    ws.getCell(`R${2 + i}`).value = u.desde;
    ws.getCell(`S${2 + i}`).value = u.hasta;
  });

  titulo(ws, 'A10', 'CRITICIDAD DE NEGOCIO  ·  nueva en REQ-SIG-20 §11');
  ['Código', 'Nombre', 'RTO (min)', 'RPO (min)', 'Exige nivel', 'Qué exige en arquitectura'].forEach((h, i) => {
    const c = ws.getCell(11, 1 + i);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  });
  CRITICIDAD.forEach((c, i) => c.forEach((v, j) => (ws.getCell(12 + i, 1 + j).value = v)));

  titulo(ws, 'A19', 'RELEVANCIA DEL CONTROL  ·  REQ-SIG-21 §4');
  ['Nombre', 'Presupuesto', 'Criterio'].forEach((h, i) => {
    const c = ws.getCell(20, 1 + i);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  });
  RELEVANCIAS.forEach((r, i) => r.forEach((v, j) => (ws.getCell(21 + i, 1 + j).value = v)));

  titulo(ws, 'A26', 'PARÁMETROS');
  ws.getCell('A27').value = 'umbral_valoracion';
  ws.getCell('B27').value = UMBRAL_VALORACION;
  ws.getCell('A28').value = 'delta_techo_eficacia';
  ws.getCell('B28').value = DELTA;
  ws.getCell('C27').value = 'Un activo entra al análisis si su valor lo alcanza';
  ws.getCell('C28').value = 'Margen δ sobre la eficacia del control principal';
  for (const c of ['C27', 'C28']) ws.getCell(c).font = { size: 9, italic: true, color: { argb: 'FF666660' } };
}

// ── Hoja · Activos ────────────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet('Activos');
  encabezar(ws, [
    ['Código', 'codigo', 14], ['Nombre del activo', 'nombre', 46],
    ['Nivel 1', 'n1', 12], ['Nivel 2', 'n2', 17], ['Nivel 3', 'n3', 24],
    ['Proceso o Área', 'proceso', 26],
    ['Tipo', 'tipo', 9], ['Subtipo', 'subtipo', 28],
    ['Propietario (cargo)', 'prop', 28], ['Custodio (cargo)', 'cust', 28],
    ['D', 'D', 5], ['I', 'I', 5], ['C', 'C', 5],
    ['Valor  =MAX(D,I,C)', 'valor', 11],
    ['CRITICIDAD ← editable', 'crit', 15],
    ['Origen de la criticidad', 'orig', 34],
    ['RTO (min)', 'rto', 10],
    ['¿Entra al análisis?', 'entra', 12],
    ['Nivel exigido al principal', 'exige', 13],
    ['Etiqueta V19', 'etq', 12],
  ]);
  activos.forEach((a, i) => {
    const f = i + 2;
    ws.addRow({
      codigo: a.codigo, nombre: a.nombre,
      n1: a.nivel1, n2: a.nivel2, n3: a.nivel3,
      proceso: a.proceso, tipo: a.tipo, subtipo: a.subtipo,
      prop: a.propietario, cust: a.custodio, D: a.D, I: a.I, C: a.C,
      valor: { formula: `MAX(K${f}:M${f})` },
      crit: a.criticidad,
      orig: a.origenCriticidad,
      rto: { formula: `IFERROR(VLOOKUP($O${f},Escalas!$A$12:$F$16,3,FALSE),"")` },
      entra: { formula: `IF($N${f}>=Escalas!$B$27,"SÍ","no")` },
      exige: { formula: `IF($O${f}="","",MAX(IFERROR(VLOOKUP($O${f},Escalas!$A$12:$F$16,5,FALSE),0),IF($K${f}=5,4,IF($K${f}=4,3,0))))` },
      etq: a.etiquetaV19,
    });
  });
  // Desplegable de criticidad, ya asignada por regla pero editable fila a fila
  for (let r = 2; r <= activos.length + 1; r++) {
    ws.getCell(`O${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"C1,C2,C3,C4,C5"'],
      promptTitle: 'Criticidad de negocio',
      prompt: 'C1 RTO≤10min · C2 ≤4h · C3 ≤24h · C4 ≤72h · C5 sin compromiso',
    };
    ws.getCell(`O${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } };
    ws.getCell(`P${r}`).font = { size: 9, italic: true, color: { argb: 'FF666660' } };
  }
  ws.getColumn('N').font = { bold: true };
  ws.getColumn('O').font = { bold: true };
  cuerpo(ws);
}

// ── Hoja · Amenazas ───────────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet('Amenazas');
  encabezar(ws, [
    ['Código', 'cod', 9], ['Amenaza', 'nom', 42], ['Grupo', 'gru', 26],
    ['Frecuencia', 'fre', 34], ['ARO', 'aro', 8],
    ['Degrad. D', 'dgD', 12], ['fD', 'fD', 6],
    ['Degrad. I', 'dgI', 12], ['fI', 'fI', 6],
    ['Degrad. C', 'dgC', 12], ['fC', 'fC', 6],
    ['Tipos a los que aplica', 'tip', 34], ['Controles', 'nc', 9],
  ]);
  amenazasJson.forEach((a, i) => {
    const f = i + 2;
    const nc = paresJson.filter((p) => p.amenaza === a.codigo).length;
    ws.addRow({
      cod: a.codigo, nom: a.nombre, gru: a.grupo, fre: a.frecuencia,
      aro: { formula: `IFERROR(VLOOKUP($D${f},Escalas!$G$2:$H$6,2,FALSE),0)` },
      dgD: a.degradacion?.D ?? 'No aplica',
      fD: { formula: `IFERROR(VLOOKUP($F${f},Escalas!$D$2:$E$7,2,FALSE),0)` },
      dgI: a.degradacion?.I ?? 'No aplica',
      fI: { formula: `IFERROR(VLOOKUP($H${f},Escalas!$D$2:$E$7,2,FALSE),0)` },
      dgC: a.degradacion?.C ?? 'No aplica',
      fC: { formula: `IFERROR(VLOOKUP($J${f},Escalas!$D$2:$E$7,2,FALSE),0)` },
      tip: (a.tipos ?? []).join(' '), nc,
    });
  });
  cuerpo(ws);
}

// ── Hoja · Controles ──────────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet('Controles');
  encabezar(ws, [
    ['Código', 'c', 10], ['Control', 'n', 54], ['Dominio', 'd', 18], ['Capacidad', 'cap', 20],
    ['SoA', 'soa', 9], ['Base (GAP)', 'base', 10], ['ACTUAL ← editable', 'act', 12], ['Objetivo', 'obj', 9],
    ['Eficacia actual', 'efi', 12], ['Evidencia registrada', 'ev', 70],
  ]);
  isoJson.controles.forEach((c, i) => {
    const f = i + 2;
    ws.addRow({
      c: c.c, n: c.n, d: c.dom, cap: c.cap, soa: c.soa,
      base: c.base, act: c.act, obj: c.obj,
      efi: { formula: `IF($G${f}="","",IFERROR(VLOOKUP($G${f},Escalas!$J$2:$K$7,2,FALSE),""))` },
      ev: c.ev,
    });
    ws.getCell(`G${f}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } };
    ws.getCell(`I${f}`).numFmt = '0.0%';
  });
  cuerpo(ws);
}

// ── Hoja · ControlAmenaza ─────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet('ControlAmenaza');
  encabezar(ws, [
    ['Amenaza', 'a', 10], ['Control', 'c', 10], ['Nombre del control', 'n', 56],
    ['Nivel actual', 'niv', 11], ['Eficacia', 'efi', 10],
    ['RELEVANCIA ← diligenciar', 'rel', 18], ['Presupuesto', 'pre', 11],
    ['# controles de la amenaza', 'nc', 12],
  ]);
  const mapaCtrl = new Map(isoJson.controles.map((c) => [c.c, c]));
  paresJson.forEach((p, i) => {
    const f = i + 2;
    const c = mapaCtrl.get(p.control);
    ws.addRow({
      a: p.amenaza, c: p.control, n: c?.n ?? '(control no encontrado)',
      niv: { formula: `IFERROR(VLOOKUP($B${f},Controles!$A:$G,7,FALSE),"")` },
      efi: { formula: `IF($D${f}="","",IFERROR(VLOOKUP($D${f},Escalas!$J$2:$K$7,2,FALSE),""))` },
      rel: null,
      pre: { formula: `IF($F${f}="","",IFERROR(VLOOKUP($F${f},Escalas!$A$21:$B$23,2,FALSE),""))` },
      nc: { formula: `COUNTIF($A:$A,$A${f})` },
    });
    ws.getCell(`E${f}`).numFmt = '0.0%';
    ws.getCell(`F${f}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBAR } };
    ws.getCell(`F${f}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Principal,Complementario,De apoyo"'],
      promptTitle: 'Relevancia del control',
      prompt: 'Principal: sin él la amenaza no se contiene. Exactamente uno por amenaza.',
    };
  });
  cuerpo(ws);
}

// ── Hoja · EficaciaAmenaza ────────────────────────────────────────────────────
{
  const ws = wb.addWorksheet('EficaciaAmenaza');
  encabezar(ws, [
    ['Amenaza', 'a', 10], ['Amenaza (nombre)', 'n', 40], ['# ctrl', 'nc', 8],
    ['# con relevancia', 'ncr', 12], ['# principales', 'np', 11],
    ['Media simple (v2)', 'v2', 13],
    ['e principal', 'ep', 11], ['e secundarios', 'es', 12], ['e de apoyo', 'ea', 11],
    ['Suma presupuesto', 'sp', 13], ['Ponderada', 'pond', 11],
    ['Techo = eP + δ', 'techo', 12],
    ['EFICACIA APLICADA', 'efi', 15], ['Regla', 'regla', 9], ['Aviso', 'aviso', 44],
  ]);
  const CA = 'ControlAmenaza';
  amenazasJson.forEach((a, i) => {
    const f = i + 2;
    ws.addRow({
      a: a.codigo, n: a.nombre,
      nc: { formula: `COUNTIF(${CA}!$A:$A,$A${f})` },
      ncr: { formula: `COUNTIFS(${CA}!$A:$A,$A${f},${CA}!$F:$F,"<>")` },
      np: { formula: `COUNTIFS(${CA}!$A:$A,$A${f},${CA}!$F:$F,"Principal")` },
      v2: { formula: `IFERROR(AVERAGEIFS(${CA}!$E:$E,${CA}!$A:$A,$A${f},${CA}!$E:$E,"<>"),"")` },
      ep: { formula: `IFERROR(AVERAGEIFS(${CA}!$E:$E,${CA}!$A:$A,$A${f},${CA}!$F:$F,"Principal"),"")` },
      es: { formula: `IFERROR(AVERAGEIFS(${CA}!$E:$E,${CA}!$A:$A,$A${f},${CA}!$F:$F,"Complementario"),"")` },
      ea: { formula: `IFERROR(AVERAGEIFS(${CA}!$E:$E,${CA}!$A:$A,$A${f},${CA}!$F:$F,"De apoyo"),"")` },
      // El presupuesto se renormaliza sobre las clases presentes (REQ-SIG-21 §4)
      sp: { formula: `IF($G${f}="",0,0.7)+IF($H${f}="",0,0.2)+IF($I${f}="",0,0.1)` },
      pond: { formula: `IF($J${f}=0,"",(IF($G${f}="",0,0.7*$G${f})+IF($H${f}="",0,0.2*$H${f})+IF($I${f}="",0,0.1*$I${f}))/$J${f})` },
      techo: { formula: `IF($G${f}="","",$G${f}+Escalas!$B$28)` },
      efi: { formula: `IF($E${f}=1,MIN($K${f},$L${f}),$F${f})` },
      regla: { formula: `IF($E${f}=1,"v3","v2")` },
      aviso: {
        formula: `IF($E${f}=0,"Sin principal designado · media simple, el techo no opera",IF($E${f}>1,"ERROR: "&$E${f}&" principales; debe haber exactamente uno",IF($D${f}<$C${f},"Clasificación a medias: "&$D${f}&" de "&$C${f}&" pares","")))`,
      },
    });
    for (const col of ['F', 'G', 'H', 'I', 'K', 'L', 'M']) ws.getCell(`${col}${f}`).numFmt = '0.0%';
    ws.getCell(`M${f}`).font = { bold: true };
  });
  cuerpo(ws);
}

// ── Hoja · Riesgos ────────────────────────────────────────────────────────────
const riesgos = [];
{
  const porTipo = {};
  for (const a of amenazasJson) for (const t of a.tipos ?? []) (porTipo[t] ??= []).push(a);
  for (const act of activos) {
    const v = Math.max(act.D ?? 0, act.I ?? 0, act.C ?? 0);
    if (v < UMBRAL_VALORACION) continue;
    for (const am of porTipo[act.tipo] ?? []) riesgos.push({ act, am });
  }

  const ws = wb.addWorksheet('Riesgos');
  encabezar(ws, [
    ['Activo', 'ac', 14], ['Nombre del activo', 'an', 38], ['Proceso', 'pr', 22],
    ['Propietario', 'po', 26], ['Crit.', 'cr', 7],
    ['D', 'D', 5], ['I', 'I', 5], ['C', 'C', 5],
    ['Amenaza', 'am', 9], ['Amenaza (nombre)', 'nm', 36],
    ['fD', 'fD', 6], ['fI', 'fI', 6], ['fC', 'fC', 6],
    ['imp D', 'iD', 7], ['imp I', 'iI', 7], ['imp C', 'iC', 7],
    ['IMPACTO', 'imp', 9], ['Nivel impacto', 'ni', 12],
    ['ARO', 'aro', 8],
    ['INHERENTE', 'inh', 11], ['Banda inherente', 'bi', 13],
    ['Eficacia', 'efi', 10], ['Regla', 'rg', 7],
    ['ARO residual', 'ar', 11], ['RESIDUAL', 'res', 11], ['Banda residual', 'br', 13],
  ]);

  riesgos.forEach((r, i) => {
    const f = i + 2;
    const A = `"${r.act.codigo}"`;
    ws.addRow({
      ac: r.act.codigo, an: r.act.nombre, pr: r.act.proceso, po: r.act.propietario,
      cr: { formula: `IFERROR(VLOOKUP($A${f},Activos!$A:$O,15,FALSE),"")` },
      D: r.act.D, I: r.act.I, C: r.act.C,
      am: r.am.codigo, nm: r.am.nombre,
      fD: { formula: `IFERROR(VLOOKUP($I${f},Amenazas!$A:$G,7,FALSE),0)` },
      fI: { formula: `IFERROR(VLOOKUP($I${f},Amenazas!$A:$I,9,FALSE),0)` },
      fC: { formula: `IFERROR(VLOOKUP($I${f},Amenazas!$A:$K,11,FALSE),0)` },
      iD: { formula: `ROUND($F${f}*$K${f},4)` },
      iI: { formula: `ROUND($G${f}*$L${f},4)` },
      iC: { formula: `ROUND($H${f}*$M${f},4)` },
      imp: { formula: `MAX($N${f}:$P${f})` },
      ni: { formula: `IFERROR(INDEX(Escalas!$Q$2:$Q$6,MATCH(1,INDEX((Escalas!$R$2:$R$6<=$Q${f})*(Escalas!$S$2:$S$6>=$Q${f}),0),0)),"")` },
      aro: { formula: `IFERROR(VLOOKUP($I${f},Amenazas!$A:$E,5,FALSE),0)` },
      inh: { formula: `ROUND($Q${f}*$S${f},4)` },
      bi: { formula: `IFERROR(INDEX(Escalas!$M$2:$M$5,MATCH(1,INDEX((Escalas!$N$2:$N$5<=$T${f})*(Escalas!$O$2:$O$5>=$T${f}),0),0)),"")` },
      efi: { formula: `IFERROR(VLOOKUP($I${f},EficaciaAmenaza!$A:$M,13,FALSE),"")` },
      rg: { formula: `IFERROR(VLOOKUP($I${f},EficaciaAmenaza!$A:$N,14,FALSE),"")` },
      ar: { formula: `IF($V${f}="","",ROUND($S${f}*(1-$V${f}),4))` },
      res: { formula: `IF($X${f}="","",ROUND($Q${f}*$X${f},4))` },
      br: { formula: `IF($Y${f}="","sin calcular",IFERROR(INDEX(Escalas!$M$2:$M$5,MATCH(1,INDEX((Escalas!$N$2:$N$5<=$Y${f})*(Escalas!$O$2:$O$5>=$Y${f}),0),0)),""))` },
    });
    ws.getCell(`V${f}`).numFmt = '0.0%';
    for (const col of ['T', 'Y']) ws.getCell(`${col}${f}`).font = { bold: true };
  });
  cuerpo(ws);
}

// ── Matrices ──────────────────────────────────────────────────────────────────
const nivelesImpacto = escalas.umbralImpacto.map((u) => u.nivel);
const frecuencias = escalas.frecuencia.map((f) => ({ et: f.etiqueta.split('—')[0].trim(), aro: f.vecesPorAno }));

const matriz = (nombre, colBanda, colAro, leyenda) => {
  const ws = wb.addWorksheet(nombre);
  ws.columns = [{ width: 18 }, ...frecuencias.map(() => ({ width: 15 })), { width: 11 }];
  ws.getCell('A1').value = leyenda;
  ws.getCell('A1').font = { bold: true, size: 11, color: { argb: AZUL } };
  ws.mergeCells('A1:G1');

  ws.getCell('A3').value = 'Impacto \\ Frecuencia';
  frecuencias.forEach((f, j) => {
    const c = ws.getCell(3, 2 + j);
    c.value = `${f.et}\n(${f.aro}/año)`;
    c.alignment = { wrapText: true, horizontal: 'center' };
  });
  ws.getCell(3, 2 + frecuencias.length).value = 'Total';
  for (let j = 1; j <= frecuencias.length + 2; j++) {
    const c = ws.getCell(3, j);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  }

  nivelesImpacto.forEach((n, i) => {
    const fila = 4 + i;
    const c0 = ws.getCell(fila, 1);
    c0.value = n;
    c0.font = { bold: true, size: 9 };
    c0.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_SUAVE } };
    frecuencias.forEach((fr, j) => {
      // Las bandas de frecuencia se cortan en la media geométrica entre escalones
      // vecinos: el ARO residual es continuo y la escala tiene cinco escalones.
      const lo = j === frecuencias.length - 1 ? 0 : Math.sqrt(fr.aro * frecuencias[j + 1].aro);
      const hi = j === 0 ? 1e9 : Math.sqrt(fr.aro * frecuencias[j - 1].aro);
      const cel = ws.getCell(fila, 2 + j);
      cel.value = {
        formula: `COUNTIFS(Riesgos!$R:$R,"${n}",Riesgos!${colAro}:${colAro},">="&${lo},Riesgos!${colAro}:${colAro},"<"&${hi})`,
      };
      cel.alignment = { horizontal: 'center' };
    });
    ws.getCell(fila, 2 + frecuencias.length).value = {
      formula: `SUM(B${fila}:${String.fromCharCode(65 + frecuencias.length)}${fila})`,
    };
    ws.getCell(fila, 2 + frecuencias.length).font = { bold: true };
  });

  const filaTot = 4 + nivelesImpacto.length;
  ws.getCell(filaTot, 1).value = 'Total';
  ws.getCell(filaTot, 1).font = { bold: true };
  for (let j = 0; j <= frecuencias.length; j++) {
    const col = String.fromCharCode(66 + j);
    ws.getCell(filaTot, 2 + j).value = { formula: `SUM(${col}4:${col}${filaTot - 1})` };
    ws.getCell(filaTot, 2 + j).font = { bold: true };
  }

  // Resumen por banda de riesgo
  ws.getCell(filaTot + 2, 1).value = 'POR BANDA DE RIESGO';
  ws.getCell(filaTot + 2, 1).font = { bold: true, size: 10, color: { argb: AZUL } };
  escalas.umbralRiesgo.forEach((u, i) => {
    ws.getCell(filaTot + 3 + i, 1).value = u.nivel;
    ws.getCell(filaTot + 3 + i, 2).value = { formula: `COUNTIF(Riesgos!${colBanda}:${colBanda},"${u.nivel}")` };
  });
  ws.getCell(filaTot + 3 + escalas.umbralRiesgo.length, 1).value = 'Sin calcular';
  ws.getCell(filaTot + 3 + escalas.umbralRiesgo.length, 2).value = {
    formula: `COUNTIF(Riesgos!${colBanda}:${colBanda},"sin calcular")`,
  };
  return ws;
};

matriz('MatrizInherente', '$U', '$S',
  'MATRIZ DE RIESGO INHERENTE  ·  antes de los controles  ·  cuenta de riesgos por impacto y frecuencia');
matriz('MatrizResidual', '$Z', '$X',
  'MATRIZ DE RIESGO RESIDUAL  ·  con la frecuencia ya reducida por la eficacia de los controles');

// ── Hoja · Léeme ──────────────────────────────────────────────────────────────
{
  const ws = wsLeeme;
  ws.columns = [{ width: 30 }, { width: 112 }];
  const L = [
    ['MODELO DE VALORACIÓN DE RIESGOS', ''],
    ['', ''],
    ['Qué es', 'La metodología MET-SIG-01 v3 desarrollada en Excel, sobre los activos del Consolidado V19.'],
    ['', 'Las fórmulas están VIVAS: cambiá una madurez o escribí una relevancia y las matrices se mueven.'],
    ['Generado', new Date().toISOString().slice(0, 10)],
    ['Fuente de activos', 'FOR-SIG-12 Consolidado de Activos de Información V19.xlsx'],
    ['Requerimientos', 'REQ-SIG-20 §11 (criticidad) · REQ-SIG-21 §4 (eficacia) · REQ-SIG-23 (exigencia)'],
    ['', ''],
    ['LAS COLUMNAS EDITABLES — están en ámbar', ''],
    ['1 · Activos!O', 'CRITICIDAD de negocio. Viene ASIGNADA por la regla del 14/09: el ambiente de'],
    ['', 'producción de MinTrace en C1, los otros ocho ambientes productivos en C2, y el'],
    ['', 'resto del inventario en C4. La columna P dice de dónde salió cada una, para que'],
    ['', 'puedas discutir una fila sin adivinar. Se edita con el desplegable.'],
    ['2 · ControlAmenaza!F', 'RELEVANCIA de cada par. **Esto sigue vacío y es el trabajo pendiente.**'],
    ['', 'Exactamente UN «Principal» por amenaza. Mientras esté vacía, esa amenaza se'],
    ['', 'calcula por la media simple de MET-SIG-01 v2 y el techo del principal no opera.'],
    ['3 · Controles!G', 'MADUREZ actual de cada control. Editable para tantear escenarios.'],
    ['', ''],
    ['LA JERARQUÍA DEL ACTIVO', ''],
    ['Activos!C, D, E', 'Nivel 1 / 2 / 3 del Consolidado V19. El Nivel 2 es el producto o servicio'],
    ['', '—MINTRACE, ILC, SIG, SERVICIOS BASE— y es por donde conviene agrupar al revisar'],
    ['', 'la criticidad: los activos de un mismo producto suelen compartir compromiso.'],
    ['Activos!S', 'La etiqueta que V19 trae en su columna 25. Se incluye para trazabilidad y'],
    ['', 'porque discrepa en un activo: LCO-DAT-0013 «RNBD - SIC» calcula valor 3 (Medio)'],
    ['', 'y V19 lo rotula «Bajo». Uno de los dos está mal y hay que mirarlo.'],
    ['', ''],
    ['CÓMO LEER EL RESULTADO', ''],
    ['EficaciaAmenaza!N', 'Dice «v2» o «v3»: con qué regla se calculó esa amenaza. Hoy son todas v2.'],
    ['EficaciaAmenaza!O', 'Los avisos: sin principal, dos principales, clasificación a medias.'],
    ['Riesgos!T y Riesgos!Y', 'Riesgo inherente y residual. La columna W dice con qué regla salió el residual.'],
    ['MatrizInherente', 'Cuenta de riesgos por nivel de impacto y frecuencia, antes de controles.'],
    ['MatrizResidual', 'Lo mismo con la frecuencia ya reducida. Si las dos son iguales, la eficacia es 0.'],
    ['', ''],
    ['LO QUE EL MODELO NO HACE', ''],
    ['No hay impacto residual', 'La eficacia reduce la FRECUENCIA, nunca el daño. Si ves un impacto residual,'],
    ['', 'es un error. El efecto de un control que limita el daño se refleja bajando la'],
    ['', 'degradación de la amenaza, no inventando un segundo impacto.'],
    ['No suma dimensiones', 'El impacto es el MÁXIMO de D, I y C, no la suma: así se mantiene en la escala 0–5.'],
    ['No compone probabilidades', 'Descartado por MET-SIG-01: cuatro controles en L3 darían 99,995 % de eficacia.'],
    ['', ''],
    ['UNA ADVERTENCIA SOBRE LAS BANDAS DE FRECUENCIA DE LA MATRIZ RESIDUAL', ''],
    ['', 'El ARO residual es continuo y la escala tiene cinco escalones. Para contar cada'],
    ['', 'riesgo en una casilla se usan los cortes en la media geométrica entre escalones'],
    ['', 'vecinos. Es una decisión de presentación de este libro, no de la metodología.'],
  ];
  L.forEach((f) => {
    const r = ws.addRow(f);
    r.font = { size: 10 };
    r.alignment = { vertical: 'top', wrapText: true };
    const a = String(f[0]);
    if (a === a.toUpperCase() && a.trim() !== '' && a.length > 3) {
      r.font = { size: 10, bold: true, color: { argb: AZUL } };
    }
  });
  ws.getRow(1).font = { size: 14, bold: true, color: { argb: AZUL } };
}

await wb.xlsx.writeFile(SALIDA);

// ── Verificación ──────────────────────────────────────────────────────────────
const chk = new ExcelJS.Workbook();
await chk.xlsx.readFile(SALIDA);
console.log('ESCRITO:', SALIDA);
console.log('hojas:', chk.worksheets.map((w) => w.name).join(' · '));
for (const n of ['Activos', 'Amenazas', 'Controles', 'ControlAmenaza', 'EficaciaAmenaza', 'Riesgos']) {
  console.log(`  ${n.padEnd(16)} ${chk.getWorksheet(n).rowCount - 1} filas`);
}
console.log('activos en análisis:', activos.filter((a) => Math.max(a.D ?? 0, a.I ?? 0, a.C ?? 0) >= UMBRAL_VALORACION).length);
console.log('riesgos generados  :', riesgos.length);

console.log('\n=== CRITICIDAD ASIGNADA ===');
const porCrit = {};
for (const a of activos) porCrit[a.criticidad] = (porCrit[a.criticidad] ?? 0) + 1;
for (const [k, n] of Object.entries(porCrit).sort()) console.log(`  ${k}  ${String(n).padStart(3)} activos`);
console.log('\n  C1 y C2:');
for (const a of activos.filter((x) => x.criticidad !== 'C4')) {
  console.log(`    ${a.criticidad}  ${a.codigo.padEnd(14)}v${Math.max(a.D ?? 0, a.I ?? 0, a.C ?? 0)}  ${a.nivel2.padEnd(15)}${a.nombre.slice(0, 40)}`);
}

// Coherencia: infraestructura bajo un producto cuyo ambiente es C1/C2 y que quedó en C4.
const n2Criticos = new Set(activos.filter((a) => a.criticidad === 'C1' || a.criticidad === 'C2').map((a) => a.nivel2));
const sospechosos = activos.filter(
  (a) => a.criticidad === 'C4' && n2Criticos.has(a.nivel2) &&
    ['[HW]', '[COM]', '[S]', '[SW]'].includes(a.tipo) &&
    Math.max(a.D ?? 0, a.I ?? 0, a.C ?? 0) >= UMBRAL_VALORACION,
);
console.log(`\n  ⚠ en C4 pero sostienen un producto C1/C2 y entran al análisis: ${sospechosos.length}`);
for (const a of sospechosos) {
  console.log(`      ${a.codigo.padEnd(14)}v${Math.max(a.D ?? 0, a.I ?? 0, a.C ?? 0)}  ${a.tipo.padEnd(7)}${a.nivel2.padEnd(15)}${a.nombre.slice(0, 40)}`);
}
