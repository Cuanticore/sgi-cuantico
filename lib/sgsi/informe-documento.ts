// lib/sgsi/informe-documento.ts
//
// El informe de valoración, como documento: una función pura que devuelve HTML.
//
// ── POR QUÉ UNA CADENA Y NO UN COMPONENTE DE REACT ──────────────────────────────────────
//
// Nació como componente y no se pudo sostener. El mismo documento se sirve de TRES maneras
// —en pantalla, impreso a PDF por el navegador, y como `.doc` con `application/msword`— y la
// tercera exigía convertir el árbol a HTML con `renderToStaticMarkup`. La App Router de Next
// prohíbe importar `react-dom/server` en su grafo de módulos, y el build lo rechaza:
//
//   «You're importing a component that imports react-dom/server.»
//
// Quedaban dos salidas. Una: describir el documento por segunda vez para el Word, con una
// librería de OOXML o con plantillas aparte. Eso es precisamente lo que no se puede permitir
// — dos descripciones del mismo informe es una que alguien olvida actualizar, y el día que
// difieren, el documento archivado dice algo distinto del que se ve en pantalla, sin manera
// de saber cuál miente.
//
// La otra, ésta: si la representación natural del documento es HTML —y lo es, porque tiene
// que serlo para Word de todas formas—, entonces producir HTML directamente es lo honesto.
// React era el envoltorio raro en esta historia, no la cadena. La página inserta el resultado
// y la ruta lo envuelve en la cáscara que Word necesita. Una fuente, tres salidas, sin
// `react-dom/server`.
//
// Y se gana algo: esto es puro y se puede probar. Un componente de React exigía montar un
// renderizador para afirmar que el informe dice «Sin calcular» donde tiene que decirlo.
//
// ── TODO VA EN ESTILOS EN LÍNEA, Y LOS COLORES SON LITERALES ────────────────────────────
//
// Es feo y es deliberado. El importador de HTML de Word ignora las hojas de estilo y las
// clases —sólo respeta el atributo `style` de cada elemento— y no resuelve propiedades
// personalizadas de CSS. Con clases de Tailwind el Word saldría sin una sola línea de tabla;
// con `var(--hf-risk-*)`, la matriz saldría en blanco y negro.
//
// Los hexadecimales son los de `app/globals.css`. Si la rampa cambia allá, hay que cambiarla
// acá — y la única defensa contra que se olvide es que estén escritos al lado, con su nombre.

import type { ProcesoDelInforme } from './informe-valoracion';
import {
  FUERA_DEL_ANALISIS,
  FUERA_DEL_MAPA,
  SIN_CALCULAR,
  agruparEnBandas,
  etiquetaDeBanda,
} from './informe-valoracion';
import type { ColumnaFrecuencia, FilaImpacto, MatrizClasica } from './matriz-clasica';

/// Los mismos valores que `--hf-risk-*`. Indexados por POSICIÓN de la banda y no por su
/// nombre: así renombrar «Crítico» a «Extremo» no vuelve la matriz gris de golpe.
const RAMPA = [
  { bg: '#a52016', fg: '#ffffff' }, // --hf-risk-critico-bg / -fg
  { bg: '#c25a1e', fg: '#ffffff' }, // --hf-risk-alto-bg / -fg
  { bg: '#e0b93c', fg: '#3a2c05' }, // --hf-risk-medio-bg / -fg
  { bg: '#dfe8e2', fg: '#3d5648' }, // --hf-risk-bajo-bg / -fg
];

const TINTA = '#1f2a37';
const SUAVE = '#5b6875';
const LINEA = '#d7dde3';
const CABECERA = '#f1f4f7';
const TITULO = '#12263f';
/// El azul de marca, `--hf-brand-900`. Es el único color corporativo del documento y marca
/// el nivel superior —las bandas del mapa de procesos— para que se distinga de un capítulo.
const MARCA = '#0c2461';

const S = {
  cuerpo: `font-family:'Segoe UI',Calibri,Arial,sans-serif;font-size:10.5pt;color:${TINTA};line-height:1.45`,
  tabla: 'border-collapse:collapse;width:100%;font-size:9.5pt;margin:0 0 14pt',
  th: `border:1px solid ${LINEA};background:${CABECERA};padding:4pt 6pt;text-align:left;font-weight:600;font-size:8.5pt;letter-spacing:.03em;text-transform:uppercase;color:${SUAVE}`,
  td: `border:1px solid ${LINEA};padding:4pt 6pt;vertical-align:top`,
  num: `border:1px solid ${LINEA};padding:4pt 6pt;vertical-align:top;text-align:right;white-space:nowrap`,
  // El salto de página por capítulo: un proceso partido a la mitad de una hoja es ilegible en
  // el PDF que se archiva y en el impreso que circula por el comité.
  h2: `font-size:15pt;margin:0 0 2pt;color:${TITULO};page-break-before:always;break-before:page`,
  // El mismo encabezado de capítulo SIN el salto, para el primero de cada banda: el título
  // de la banda solo en una hoja y el capítulo en la siguiente desperdicia una página por
  // bloque y se lee como un error de maquetación.
  h2Seguido: `font-size:15pt;margin:0 0 2pt;color:${TITULO}`,
  // La banda del mapa. Abre hoja, y lleva la franja azul de marca para que se distinga de
  // un capítulo a simple vista: son dos niveles distintos y tienen que verse distintos.
  banda: `font-size:18pt;margin:0 0 3pt;padding:0 0 4pt;color:${MARCA};border-bottom:2px solid ${MARCA};page-break-before:always;break-before:page`,
  h3: `font-size:11pt;margin:16pt 0 6pt;color:${TITULO}`,
  nota: `font-size:8.5pt;color:${SUAVE};margin:0 0 10pt`,
} as const;

export interface DatosDocumento {
  capitulos: readonly ProcesoDelInforme[];
  generadoEn: Date;
  alcance: string;
  filasImpacto: readonly FilaImpacto[];
  columnasFrecuencia: readonly ColumnaFrecuencia[];
  umbralValoracion: number;
  totalActivos: number;
  totalEnAnalisis: number;
  totalAceptaciones: number;
}

/// Escapa un texto para que no pueda salirse de su elemento ni de un atributo.
///
/// TODO lo que viene de la base pasa por acá. Los nombres de activos y las justificaciones de
/// aceptación son texto libre que alguien escribió en un formulario: un `<` sin escapar
/// rompería la tabla, y uno bien elegido convertiría el informe en un vector. Es una sola
/// función y se usa sin excepciones, porque la excepción es el agujero.
export function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/// La fecha en palabras. Escrita a mano y no con `toLocaleDateString`: el mismo texto se
/// produce en el servidor y en el navegador, y dos compilaciones de ICU no siempre coinciden.
/// En un documento que se archiva, la fecha no puede depender de qué máquina lo generó.
export function fechaLarga(d: Date): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function colorDeBanda(nombre: string | null, bandas: readonly string[]) {
  if (nombre === null) return { bg: '#ffffff', fg: SUAVE };
  const i = bandas.indexOf(nombre);
  return RAMPA[Math.min(Math.max(i < 0 ? RAMPA.length - 1 : i, 0), RAMPA.length - 1)];
}

/// El orden de las bandas, del catálogo. Es el que da el color; sin él, todo queda en blanco
/// en vez de pintarse con una escala inventada.
function ordenDeBandas(capitulos: readonly ProcesoDelInforme[]): string[] {
  const c = capitulos.find((x) => x.porBandaResidual.length > 0);
  return (c?.porBandaResidual ?? []).map((b) => b.etiqueta).filter((e) => e !== SIN_CALCULAR);
}

/// El informe entero, como HTML. Sin `<html>` ni `<head>`: quien llama decide la cáscara — la
/// página deja que lo envuelva el layout de Next, la ruta de Word agrega la suya con el
/// `charset` y el `@page` que Word necesita.
export function documentoInforme(datos: DatosDocumento): string {
  const bandas = ordenDeBandas(datos.capitulos);
  const p: string[] = [];

  p.push(`<div style="${S.cuerpo}">`);

  // ── Portada ─────────────────────────────────────────────────────────────────────────
  p.push(
    `<h1 style="font-size:21pt;margin:0 0 4pt;color:${TITULO}">Informe de valoración de activos de información</h1>`,
    `<p style="${S.nota};font-size:10pt;margin-bottom:16pt">Aceptación del riesgo residual · Sistema de Gestión de Seguridad de la Información</p>`,
    `<table style="${S.tabla};width:auto;margin-bottom:20pt"><tbody>`,
    dato('Alcance', datos.alcance),
    dato('Fecha de generación', fechaLarga(datos.generadoEn)),
    dato(
      'Activos incluidos',
      `${datos.totalActivos} · ${datos.totalEnAnalisis} dentro del análisis de riesgos`,
    ),
    dato(
      'Umbral de valoración',
      `${datos.umbralValoracion} — un activo entra al análisis cuando su valor lo alcanza`,
    ),
    dato(
      'Aceptaciones formales',
      datos.totalAceptaciones === 0
        ? 'Ninguna registrada'
        : `${datos.totalAceptaciones} planes de tipo Aceptar`,
    ),
    '</tbody></table>',
  );

  // ── Resumen del proceso de valoración ───────────────────────────────────────────────
  p.push(
    `<h2 style="${S.h3};margin-top:0;font-size:13pt">Resumen del proceso de valoración</h2>`,
    `<p style="margin:0 0 8pt">Cada activo se valora en las dimensiones de <strong>disponibilidad</strong>, <strong>integridad</strong> y <strong>confidencialidad</strong>. El valor del activo es el <strong>mayor</strong> de las tres, no su promedio: un activo es tan crítico como su dimensión más comprometida, y promediar escondería un secreto absoluto detrás de dos dimensiones irrelevantes.</p>`,
    `<p style="margin:0 0 8pt">Los activos que alcanzan el umbral de ${esc(datos.umbralValoracion)} entran al análisis de riesgos. Sobre cada uno se cruzan las amenazas aplicables a su tipo MAGERIT; para cada par (activo, amenaza) se calcula el <strong>impacto</strong> a partir del valor y de la degradación, y el <strong>riesgo inherente</strong> multiplicándolo por la frecuencia esperada. La eficacia agregada de los controles que mitigan la amenaza reduce esa frecuencia, y de ahí sale el <strong>riesgo residual</strong> (MET-SIG-01 §7).</p>`,
    `<p style="margin:0 0 8pt">Donde este informe dice <strong>«${SIN_CALCULAR}»</strong> no está diciendo «bajo». Es un estado del modelo: la eficacia de los controles de esa amenaza todavía no está establecida, así que el residual es <em>desconocido</em>. Sustituirlo por cero dibujaría un riesgo tratado que nadie trató, y por eso se imprime aparte en cada tabla.</p>`,
    `<p style="margin:0 0 8pt">Distinto es <strong>«${FUERA_DEL_ANALISIS}»</strong>: ese activo no alcanza el umbral de valoración, así que no se le generan riesgos y no hay residual que calcular. No es una deuda del modelo, es el alcance declarado.</p>`,
    `<p style="${S.nota};margin-bottom:20pt">Ninguna cifra de este documento está almacenada: todas se derivan al leer, con las mismas funciones que alimentan las pantallas de Valoración, Análisis de riesgos y Matrices. Un informe y una pantalla que discrepan son un informe que nadie puede firmar.</p>`,
  );

  // ── Tabla de contenido, en los dos niveles del mapa ─────────────────────────────────
  //
  // La banda como renglón propio y enlazable, y sus procesos debajo. Con diez capítulos
  // seguidos el índice es una lista; con las bandas es el mapa de procesos de la compañía,
  // que es la estructura con la que el comité ya piensa.
  const bloques = agruparEnBandas(datos.capitulos);
  p.push(
    `<h2 id="contenido" style="${S.h3};font-size:13pt">Contenido</h2>`,
    `<table style="${S.tabla}"><thead><tr>`,
    `<th style="${S.th}">Proceso</th>`,
    `<th style="${S.th};text-align:right">Activos</th>`,
    `<th style="${S.th};text-align:right">En análisis</th>`,
    `<th style="${S.th};text-align:right">Aceptaciones</th>`,
    '</tr></thead><tbody>',
  );
  for (const b of bloques) {
    const suma = (f: (c: ProcesoDelInforme) => number) =>
      b.capitulos.reduce((a, c) => a + f(c), 0);
    p.push(
      `<tr><td style="${S.td};background:${CABECERA};font-weight:700"><a href="#${esc(b.ancla)}" style="color:${MARCA};text-decoration:none">${esc(b.titulo)}</a></td>`,
      `<td style="${S.num};background:${CABECERA};font-weight:700">${suma((c) => c.activos) || '—'}</td>`,
      `<td style="${S.num};background:${CABECERA};font-weight:700">${suma((c) => c.enAnalisis) || '—'}</td>`,
      `<td style="${S.num};background:${CABECERA};font-weight:700">${suma((c) => c.aceptaciones.length) || '—'}</td></tr>`,
    );
    for (const c of b.capitulos) {
      p.push(
        `<tr><td style="${S.td};padding-left:18pt"><a href="#${esc(c.ancla)}" style="color:${TITULO};text-decoration:none">${esc(c.proceso)}</a></td>`,
        `<td style="${S.num}">${c.activos}</td>`,
        `<td style="${S.num}">${c.enAnalisis}</td>`,
        `<td style="${S.num}">${c.aceptaciones.length || '—'}</td></tr>`,
      );
    }
  }
  p.push(
    '</tbody></table>',
    `<p style="${S.nota}">Las bandas son las del mapa de procesos de MAN-SIG-02. Dentro de cada una, los capítulos van ordenados por cuántos activos pone el proceso en el análisis, de mayor a menor — no alfabéticamente: el que más expone es el que primero hay que mirar.</p>`,
  );

  if (datos.capitulos.length === 0) {
    p.push(
      `<p style="${S.nota};font-size:10pt">El recorte seleccionado no incluye ningún activo. Amplía el alcance desde las opciones del informe.</p>`,
    );
  }

  // ── Una banda por bloque, un capítulo por proceso ───────────────────────────────────
  for (const b of bloques) {
    p.push(
      '<section>',
      `<h2 id="${esc(b.ancla)}" style="${S.banda}">${esc(b.titulo)}</h2>`,
      b.titulo === FUERA_DEL_MAPA
        ? `<p style="${S.nota}">Áreas con activos que el mapa de procesos de MAN-SIG-02 no declara como proceso. Se listan aparte en vez de asignarlas a una banda: darles una que el mapa no respalda sería que este informe afirme una clasificación que nadie aprobó.</p>`
        : `<p style="${S.nota}">${b.capitulos.length} ${b.capitulos.length === 1 ? 'proceso' : 'procesos'} en este informe · <a href="#contenido" style="color:${SUAVE}">volver al contenido</a></p>`,
    );

    if (b.capitulos.length === 0) {
      p.push(
        `<p style="${S.nota};font-size:10pt">Sin activos en el recorte de este informe. La banda se imprime igual: que el mapa tenga tres es del mapa, no de los datos, y una banda que desaparece cuando nadie la ocupa haría creer que el mapa tiene dos.</p>`,
        '</section>',
      );
      continue;
    }
    p.push('</section>');

    b.capitulos.forEach((c, indice) => {
      // El primero de la banda no abre hoja: ya la abrió el título de la banda.
      const estilo = indice === 0 ? S.h2Seguido : S.h2;
      p.push(
        '<section>',
        `<h2 id="${esc(c.ancla)}" style="${estilo}">${esc(c.proceso)}</h2>`,
        `<p style="${S.nota}">${c.activos} ${c.activos === 1 ? 'activo' : 'activos'} · ${c.enAnalisis} dentro del análisis de riesgos · <a href="#contenido" style="color:${SUAVE}">volver al contenido</a></p>`,

      `<h3 style="${S.h3}">1 · Resumen de la valoración</h3>`,
      tablaConteo('Nivel de valor', c.porNivelValor, c.activos),
      `<p style="${S.nota}">Los rangos en cero se imprimen igual: «0» es una afirmación, y una fila ausente obliga a preguntarse si el rango no existe o si nadie lo contó.</p>`,

      `<h3 style="${S.h3}">2 · Frecuencias por tipo de activo</h3>`,
      tablaConteo('Tipo MAGERIT', c.porTipo, c.activos),
    );

    if (c.matrizInherente !== null && c.matrizResidual !== null) {
      p.push(
        `<h3 style="${S.h3}">3 · Matrices de riesgo · impacto × frecuencia</h3>`,
        `<p style="${S.nota}">Estas matrices cuentan <strong>riesgos</strong>, no activos: un activo con doce amenazas aplicables pone doce puntos. Por eso sus totales no coinciden con los ${c.enAnalisis} activos en análisis.</p>`,
        matriz('Riesgo inherente — antes de controles', c.matrizInherente, datos, bandas),
        matriz('Riesgo residual — después de controles', c.matrizResidual, datos, bandas),
      );
    } else {
      p.push(
        `<h3 style="${S.h3}">3 · Matrices de riesgo</h3>`,
        `<p style="${S.nota}">Este proceso no tiene riesgos ubicables, así que no se imprime la matriz. Dos cuadrículas de ceros parecerían un error de cálculo.</p>`,
      );
    }

    p.push(
      `<h3 style="${S.h3}">4 · Riesgo residual</h3>`,
      tablaConteo('Banda residual', c.porBandaResidual, c.enAnalisis),
    );

    if (c.traslado.length > 0) {
      p.push(
        `<h3 style="${S.h3};font-size:10pt;margin-top:10pt">Traslado inherente → residual</h3>`,
        `<table style="${S.tabla}"><thead><tr><th style="${S.th}">Inherente</th><th style="${S.th}">Residual</th><th style="${S.th};text-align:right">Activos</th></tr></thead><tbody>`,
      );
      for (const t of c.traslado) {
        p.push(
          `<tr><td style="${S.td}">${esc(t.inherente)}</td><td style="${S.td}">${esc(t.residual)}</td><td style="${S.num}">${t.n}</td></tr>`,
        );
      }
      p.push(
        '</tbody></table>',
        `<p style="${S.nota}">Es lo que el tratamiento consiguió, dicho en una tabla.</p>`,
      );
    }

    if (c.aceptaciones.length > 0) {
      p.push(
        `<h3 style="${S.h3}">5 · Aceptación del riesgo residual</h3>`,
        `<table style="${S.tabla}"><thead><tr><th style="${S.th}">Plan</th><th style="${S.th}">Activo</th><th style="${S.th}">Justificación</th><th style="${S.th}">Revisión</th></tr></thead><tbody>`,
      );
      for (const a of c.aceptaciones) {
        p.push(
          `<tr><td style="${S.td};white-space:nowrap">${esc(a.planCodigo)}</td>`,
          `<td style="${S.td}">${esc(a.activoCodigo)}<br><span style="color:${SUAVE};font-size:8.5pt">${esc(a.activoNombre)}</span></td>`,
          `<td style="${S.td}">${esc(a.justificacion ?? '—')}</td>`,
          `<td style="${S.td};white-space:nowrap">${
            a.fechaRevision === null
              ? '<strong style="color:#a52016">Sin fecha</strong>'
              : esc(a.fechaRevision)
          }</td></tr>`,
        );
      }
      p.push(
        '</tbody></table>',
        `<p style="${S.nota}">Aceptar es planificar, no dejar de hacerlo. Una aceptación sin fecha de revisión es una que nadie vuelve a mirar, y va marcada a propósito.</p>`,
      );
    }

    p.push(
      `<h3 style="${S.h3}">${c.aceptaciones.length > 0 ? '6' : '5'} · Detalle de activos</h3>`,
      `<table style="${S.tabla}"><thead><tr>`,
      `<th style="${S.th}">Código</th><th style="${S.th}">Activo</th><th style="${S.th}">Tipo</th>`,
      `<th style="${S.th}">Responsable</th><th style="${S.th};text-align:right">Valor</th>`,
      `<th style="${S.th}">Inherente</th><th style="${S.th}">Residual</th>`,
      '</tr></thead><tbody>',
    );
    for (const f of c.filas) {
      const cr = colorDeBanda(f.bandaResidual, bandas);
      const fondo = f.bandaResidual === null ? `background:#ffffff;color:${SUAVE}` : `background:${cr.bg};color:${cr.fg}`;
      const residual = etiquetaDeBanda(f.bandaResidual, f.entraAlAnalisis);
      p.push(
        `<tr><td style="${S.td};white-space:nowrap;font-family:Consolas,monospace">${esc(f.codigo)}</td>`,
        `<td style="${S.td}">${esc(f.nombre)}</td>`,
        `<td style="${S.td}">${esc(f.tipo)}</td>`,
        `<td style="${S.td}">${esc(f.responsable ?? '—')}</td>`,
        `<td style="${S.num}">${f.valor}<br><span style="color:${SUAVE};font-size:8pt">${esc(f.nivelValor)}</span></td>`,
        `<td style="${S.td}">${esc(f.bandaInherente ?? '—')}</td>`,
        `<td style="${S.td};white-space:nowrap;${fondo};font-weight:600">${esc(residual)}</td></tr>`,
      );
    }
      p.push('</tbody></table>', '</section>');
    });
  }

  p.push('</div>');
  return p.join('');
}

function dato(etiqueta: string, valor: string): string {
  return `<tr><th style="${S.th};white-space:nowrap">${esc(etiqueta)}</th><td style="${S.td}">${esc(valor)}</td></tr>`;
}

function tablaConteo(
  titulo: string,
  filas: readonly { etiqueta: string; n: number }[],
  total: number,
): string {
  if (filas.length === 0) return `<p style="${S.nota}">Sin datos para esta tabla.</p>`;
  const p: string[] = [
    `<table style="${S.tabla}"><thead><tr><th style="${S.th}">${esc(titulo)}</th><th style="${S.th};text-align:right">Activos</th><th style="${S.th};text-align:right">%</th></tr></thead><tbody>`,
  ];
  for (const f of filas) {
    // Con total cero el porcentaje no es 0 %, es indefinido: una división por cero impresa
    // como «0 %» afirma algo que nadie calculó.
    const pct = total > 0 ? `${Math.round((f.n / total) * 100)} %` : '—';
    p.push(
      `<tr><td style="${S.td}">${esc(f.etiqueta)}</td><td style="${S.num}">${f.n}</td><td style="${S.num}">${pct}</td></tr>`,
    );
  }
  p.push(
    `<tr><td style="${S.td};font-weight:600">Total</td><td style="${S.num};font-weight:600">${total}</td><td style="${S.num}">—</td></tr>`,
    '</tbody></table>',
  );
  return p.join('');
}

function matriz(
  titulo: string,
  m: MatrizClasica,
  datos: DatosDocumento,
  bandas: readonly string[],
): string {
  const p: string[] = [
    `<h3 style="${S.h3};font-size:10pt;margin-top:10pt">${esc(titulo)}</h3>`,
    `<table style="${S.tabla};margin-bottom:6pt"><thead><tr><th style="${S.th}">Impacto ↓ · Frecuencia →</th>`,
  ];
  for (const col of datos.columnasFrecuencia) {
    p.push(
      `<th style="${S.th};text-align:center" title="${esc(col.lectura)}">${esc(col.nombre)}</th>`,
    );
  }
  p.push('</tr></thead><tbody>');

  datos.filasImpacto.forEach((f, i) => {
    p.push(`<tr><th style="${S.th};text-transform:none;font-size:9pt">${esc(f.nombre)}</th>`);
    datos.columnasFrecuencia.forEach((col, j) => {
      const n = m.conteos[i]?.[j] ?? 0;
      const banda = m.bandas[i]?.[j] ?? null;
      const c = colorDeBanda(banda, bandas);
      // El conteo va ESCRITO dentro de la casilla y no sólo codificado en el color: el color
      // es un apoyo, y en una impresión a blanco y negro —o para quien no distingue el rojo
      // del verde— sería el único portador de la información.
      p.push(
        `<td style="${S.td};text-align:center;background:${c.bg};color:${c.fg};font-weight:${n > 0 ? 700 : 400};opacity:${n > 0 ? 1 : 0.55}" title="${esc(f.nombre)} · ${esc(col.lectura)} · ${esc(banda ?? 'sin banda')}">${n === 0 ? '·' : n}</td>`,
      );
    });
    p.push('</tr>');
  });

  p.push(
    '</tbody></table>',
    `<p style="${S.nota}">${m.total} ${m.total === 1 ? 'riesgo ubicado' : 'riesgos ubicados'}`,
    m.sinImpacto > 0 ? ` · ${m.sinImpacto} sin impacto calculado` : '',
    m.sinResidual > 0 ? ` · ${m.sinResidual} sin residual calculado` : '',
    '. Una casilla vacía lleva el color de su propia zona —el punto medio de la banda de impacto por la frecuencia de la columna—, de modo que una zona crítica sigue leyéndose como crítica aunque hoy no haya nada ahí. Una casilla ocupada lleva el color del peor riesgo que contiene. La diferencia sólo aparece en la matriz residual, donde la frecuencia después de los controles es continua y no cae sobre el punto nominal de su columna: pintar esas casillas por la zona dejaba riesgos altos dibujados como medios.</p>',
  );
  return p.join('');
}
