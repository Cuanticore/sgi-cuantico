// lib/sgsi/acta-residual-documento.ts
//
// El acta de aprobación del riesgo residual, como documento: una función PURA que devuelve
// HTML.
//
// Misma decisión que `lib/sgsi/informe-documento.ts`, y por las mismas razones que ese archivo
// documenta: la App Router prohíbe `react-dom/server` en su grafo de módulos, y una cadena se
// puede probar sin montar un renderizador. Acá se suma una tercera: este HTML lo consume
// `lib/pdf.ts`, y describir el documento por segunda vez para el PDF sería la copia que
// termina divergiendo del original.
//
// ── TODO VA EN ESTILOS EN LÍNEA, Y LOS COLORES SON LITERALES ────────────────────────────
//
// Es feo y es deliberado. El mismo motivo del informe: el importador de HTML de Word ignora
// las hojas de estilo y no resuelve propiedades personalizadas de CSS. Chromium sí las
// resolvería, pero si mañana este documento también se sirve como `.doc` —y es lo que pasó con
// el informe de valoración— el acta saldría sin una sola línea de tabla.

import type { FilaAlcance, FirmanteProceso } from './alcance-residual';

export interface DatosActaResidual {
  codigo: string;
  periodo: string;
  /// `AAAA-MM-DD`.
  generadaEn: string;
  generadaPor: string;
  alcanceHash: string;
  sinCalcular: number;
  filas: readonly FilaAlcance[];
  firmantes: readonly FirmanteProceso[];
}

const TINTA = '#1f2a37';
const SUAVE = '#5b6875';
const LINEA = '#d7dde3';
const CABECERA = '#f1f4f7';
const TITULO = '#12263f';
/// El mismo `--hf-risk-critico-bg` de `app/globals.css`. Literal, por lo de arriba.
const CRITICO = '#a52016';

const S = {
  cuerpo: `font-family:'Segoe UI',Calibri,Arial,sans-serif;font-size:10.5pt;color:${TINTA};line-height:1.45`,
  h1: `font-size:16pt;font-weight:700;color:${TITULO};margin:0 0 4pt`,
  h2: `font-size:12pt;font-weight:700;color:${TITULO};margin:18pt 0 6pt`,
  tabla: 'border-collapse:collapse;width:100%;font-size:9.5pt;margin:0 0 14pt',
  th: `border:1px solid ${LINEA};background:${CABECERA};padding:4pt 6pt;text-align:left;font-weight:600`,
  td: `border:1px solid ${LINEA};padding:4pt 6pt;vertical-align:top`,
  num: `border:1px solid ${LINEA};padding:4pt 6pt;text-align:right`,
  nota: `font-size:9pt;color:${SUAVE};margin:0 0 10pt`,
};

/// La declaración de lo que se firma.
///
/// **Vive en código y no en la base, a propósito.** Si mañana cambia la redacción, las actas ya
/// emitidas conservan la suya porque su PDF ya está congelado con los bytes de ese día. Es la
/// doctrina de la regla F2 de `ActaAceptacion`: referenciar la declaración en vez de copiarla
/// convertiría cada edición en una falsificación retroactiva de lo que la gente aceptó.
const DECLARACION =
  'Quienes firmamos este documento, en calidad de responsables de los procesos relacionados, ' +
  'declaramos que conocemos el riesgo residual de los activos de información listados a ' +
  'continuación, que comprendemos el nivel de exposición que representan después de los ' +
  'controles aplicados, y que lo aceptamos como riesgo asumido por la organización para el ' +
  'periodo indicado. Esta aprobación no extingue la obligación de tratamiento: los planes ' +
  'citados siguen vigentes, y el riesgo aquí aprobado se revisa al vencimiento de este ' +
  'documento, o antes si las cifras que lo sustentan cambian.';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tablaDeActivos(filas: readonly FilaAlcance[], conJustificacion: boolean): string {
  const p: string[] = [
    `<table style="${S.tabla}"><thead><tr>`,
    `<th style="${S.th}">Código</th><th style="${S.th}">Activo</th>`,
    `<th style="${S.th}">Proceso</th><th style="${S.th}">Banda</th>`,
    `<th style="${S.th};text-align:right">Residual</th>`,
    conJustificacion ? `<th style="${S.th}">Justificación de la excepción</th>` : '',
    '</tr></thead><tbody>',
  ];
  for (const f of filas) {
    p.push(
      `<tr><td style="${S.td};white-space:nowrap;font-family:Consolas,monospace">${esc(f.codigo)}</td>`,
      `<td style="${S.td}">${esc(f.nombre)}</td>`,
      `<td style="${S.td}">${esc(f.proceso)}</td>`,
      `<td style="${S.td};white-space:nowrap">${esc(f.banda)}</td>`,
      `<td style="${S.num}">${esc(f.cifra)}</td>`,
      // La celda va en blanco: se escribe a mano junto a la firma, y se transcribe después.
      conJustificacion ? `<td style="${S.td};min-width:140pt">&nbsp;</td>` : '',
      '</tr>',
    );
  }
  p.push('</tbody></table>');
  return p.join('');
}

export function actaResidualHtml(d: DatosActaResidual): string {
  const criticos = d.filas.filter((f) => f.banda === 'Crítico');
  const altos = d.filas.filter((f) => f.banda !== 'Crítico');

  const p: string[] = [
    `<div style="${S.cuerpo}">`,
    `<h1 style="${S.h1}">Acta de aprobación del riesgo residual</h1>`,
    `<p style="${S.nota}">${esc(d.codigo)} · Periodo ${esc(d.periodo)} · Generada el ${esc(d.generadaEn)} por ${esc(d.generadaPor)}</p>`,

    `<h2 style="${S.h2}">1 · Declaración</h2>`,
    `<p style="margin:0 0 12pt">${esc(DECLARACION)}</p>`,

    `<h2 style="${S.h2}">2 · Resumen</h2>`,
    `<table style="${S.tabla}"><tbody>`,
    `<tr><td style="${S.td}">Activos en banda Crítica (excepciones al criterio)</td><td style="${S.num}">${criticos.length}</td></tr>`,
    `<tr><td style="${S.td}">Activos en banda Alta</td><td style="${S.num}">${altos.length}</td></tr>`,
    `<tr><td style="${S.td}">Procesos que firman</td><td style="${S.num}">${d.firmantes.length}</td></tr>`,
    `<tr><td style="${S.td}">Activos excluidos por residual <strong>sin calcular</strong></td><td style="${S.num}">${d.sinCalcular}</td></tr>`,
    '</tbody></table>',
    // Va en el ACTA y no sólo en la pantalla: quien firma tiene que saber qué NO está firmando.
    `<p style="${S.nota}">Los activos con residual <strong>sin calcular</strong> quedan fuera de esta acta y no se aprueban. Basta con que un riesgo del activo no tenga residual calculado para que su peor cifra sea desconocida, y firmar un techo que nadie midió no aprueba nada: eficacia desconocida no es riesgo bajo.</p>`,
  ];

  if (altos.length > 0) {
    p.push(`<h2 style="${S.h2}">3 · Activos en banda Alta</h2>`, tablaDeActivos(altos, false));
  }

  if (criticos.length > 0) {
    p.push(
      `<h2 style="${S.h2}">4 · Excepciones al criterio de aceptación</h2>`,
      `<p style="${S.nota}">El criterio de aceptación vigente declara la banda Crítica como <strong style="color:${CRITICO}">no aceptable — mitigar o evitar</strong>. Aprobar estos activos no es aceptarlos dentro del criterio: es una excepción a él, y cada una exige justificación escrita.</p>`,
      tablaDeActivos(criticos, true),
    );
  }

  p.push(
    `<h2 style="${S.h2}">5 · Hoja de firmas</h2>`,
    `<table style="${S.tabla}"><thead><tr>`,
    `<th style="${S.th}">Proceso</th><th style="${S.th}">Cargo</th><th style="${S.th}">Nombre</th>`,
    `<th style="${S.th};text-align:right">Activos</th><th style="${S.th}">Firma</th><th style="${S.th}">Fecha</th>`,
    '</tr></thead><tbody>',
  );
  for (const f of d.firmantes) {
    // Nunca una celda vacía: no distingue «nadie puede firmar esto» de «se nos olvidó».
    const nombre = f.resoluble
      ? esc(f.candidatos.map((c) => c.nombre).join(' / '))
      : `<strong style="color:${CRITICO}">Sin firmante resoluble</strong>`;
    p.push(
      `<tr><td style="${S.td}">${esc(f.proceso)}</td>`,
      `<td style="${S.td}">${esc(f.cargoNombre ?? '—')}</td>`,
      `<td style="${S.td}">${nombre}</td>`,
      `<td style="${S.num}">${f.activos}</td>`,
      `<td style="${S.td};height:34pt;min-width:110pt">&nbsp;</td>`,
      `<td style="${S.td};min-width:70pt">&nbsp;</td></tr>`,
    );
  }
  p.push('</tbody></table>');

  p.push(
    `<h2 style="${S.h2}">6 · Constancia</h2>`,
    `<p style="${S.nota}">Huella SHA-256 del alcance aprobado:<br><span style="font-family:Consolas,monospace;font-size:8.5pt;color:${TINTA}">${esc(d.alcanceHash)}</span></p>`,
    `<p style="${S.nota}">La huella se calcula sobre el código, la banda y la cifra residual de cada activo listado. Si alguna de esas cifras cambia, esta acta deja de describir el riesgo vigente y el sistema la marca como desactualizada.</p>`,
    '</div>',
  );

  return p.join('');
}
