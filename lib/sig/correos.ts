// lib/sig/correos.ts
//
// El HTML de los correos semanal y mensual (handoff_formularios/Correo*.dc.html).
//
// Hasta ahora los dos se enviaban en TEXTO PLANO: `EnvioProgramado` tiene un campo `html?`
// y nadie lo asignaba nunca. El semanal decía «Hola.» —sin el nombre, aunque la función ya
// recibía el correo de la persona— y tres líneas de conteos. El mensual, dos.
//
// Las notas del lienzo son restricciones de cliente de correo, no gusto:
//
//   · Ancho de 600 px y estilos EN LÍNEA. Ningún cliente aplica hojas externas, y Outlook
//     descarta un `<style>` en el cuerpo. Por eso no hay clases acá: cada elemento carga su
//     `style`, que es feo de leer y es lo único que se ve igual en Outlook y en Gmail.
//   · La pila es 'Segoe UI', Helvetica, Arial — no Libre Franklin. Un cliente de correo no
//     descarga tipografías, y pedirla sólo consigue una caída silenciosa a Times.
//   · UN solo llamado a la acción. Ningún botón por tarea: el correo avisa, la bandeja es
//     donde se cierra.
//   · Sin pendientes no se envía, y el pie lo dice para que quien no reciba nada sepa que
//     no es un fallo.
//
// Puro: recibe datos y devuelve una cadena. Así el HTML se prueba sin SMTP.

const FUENTE = "'Segoe UI', Helvetica, Arial, sans-serif";
const ANCHO = 600;

const AZUL = '#12437f';
const AZUL_OSCURO = '#0c2461';
const ROJO = '#a52016';
const NARANJA = '#c25a1e';
const AMBAR_TEXTO = '#8a4407';
const VERDE = '#0b5c44';

/// Los colores de cada tipo de contenido, los del lienzo.
const TIPO: Record<string, { bg: string; fg: string; etiqueta: string }> = {
  LECTURA: { bg: '#e9f0fb', fg: '#12437f', etiqueta: 'Lectura' },
  VERIFICACION: { bg: '#fff3e6', fg: '#8a4407', etiqueta: 'Verificación' },
  CAPACITACION: { bg: '#e8f4ef', fg: '#0b5c44', etiqueta: 'Capacitación' },
  TAREA: { bg: '#f5f7f6', fg: '#4a544f', etiqueta: 'Tarea' },
};

/// Escapa lo que viene de la base. El título de un contenido es texto que alguien escribió,
/// y un `<` suelto rompe la maqueta en el mejor caso.
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/// El primer nombre. El lienzo escribe «Hola, Lina», no «Hola, Lina Medina Restrepo»: un
/// saludo con el nombre completo suena a carta de cobranza.
export function primerNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio === '') return '';
  return limpio.split(/\s+/)[0];
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/// «31 de agosto». Sin año: el correo es de esta semana y el año sobra.
export function fechaCorta(f: Date): string {
  return `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`;
}

/// «lunes 31 de agosto». Con el día de la semana, que es lo que la gente usa para ubicarse.
export function fechaConDia(f: Date): string {
  return `${DIAS[f.getUTCDay()]} ${fechaCorta(f)}`;
}

/// «Venció hace 6 días · 25 de agosto» / «Vence mañana · martes 1 de septiembre».
///
/// Los días vienen ya calculados por `planificarSemanales`. Acá sólo se redactan, y se
/// distinguen los tres casos que el lienzo nombra: hoy, mañana, y el resto.
export function textoDePlazo(dias: number, fechaLimite: Date): string {
  if (dias < 0) {
    const n = Math.abs(dias);
    return `Venció ${n === 1 ? 'ayer' : `hace ${n} días`} · ${fechaCorta(fechaLimite)}`;
  }
  if (dias === 0) return `Vence hoy · ${fechaConDia(fechaLimite)}`;
  if (dias === 1) return `Vence mañana · ${fechaConDia(fechaLimite)}`;
  return `Vence en ${dias} días · ${fechaConDia(fechaLimite)}`;
}

export interface LineaCorreo {
  tipo: string;
  titulo: string;
  fechaLimite: Date;
  dias: number;
}

export interface DatosSemanal {
  nombre: string;
  vencidas: LineaCorreo[];
  porVencer: LineaCorreo[];
  /// Cuántas tiene más adelante. Es la tercera cifra de la cabecera y da la escala: dos
  /// vencidas sobre veinte pendientes no es lo mismo que dos sobre dos.
  masAdelante: number;
  desde: Date;
  hasta: Date;
  urlMiSig: string;
}

export function correoSemanalHtml(d: DatosSemanal): string {
  const saludo = primerNombre(d.nombre);
  const cifras = [
    { n: d.vencidas.length, etiqueta: 'Vencidas', color: ROJO },
    { n: d.porVencer.length, etiqueta: 'Esta semana', color: NARANJA },
    { n: d.masAdelante, etiqueta: 'Más adelante', color: AZUL },
  ];

  return envolver(
    `${cabecera(
      saludo === ''
        ? 'Esto es lo tuyo de esta semana.'
        : `Hola, ${escapar(saludo)}. Esto es lo tuyo de esta semana.`,
      `Semana del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`,
    )}
    ${filaDeCifras(cifras)}
    ${
      d.vencidas.length > 0
        ? seccion(
            'Vencidas · siguen exigibles',
            ROJO,
            d.vencidas.map((l) => tarjeta(l, ROJO, '#fdeeeb', '#f2cdc6')).join(''),
          )
        : ''
    }
    ${
      d.porVencer.length > 0
        ? seccion(
            'Vencen esta semana',
            AMBAR_TEXTO,
            d.porVencer.map((l) => tarjeta(l, AMBAR_TEXTO, '#ffffff', '#f2b473')).join(''),
          )
        : ''
    }
    ${llamado('Abrir Mi SIG', d.urlMiSig)}
    ${pie(
      'Recibes este correo porque tienes tareas del Sistema Integrado de Gestión asignadas. ' +
        'Si no tuvieras ninguna pendiente, no te llegaría.',
    )}`,
  );
}

export interface DatosMensual {
  nombre: string;
  areaNombre: string;
  mes: { anio: number; mes: number };
  cumplimiento: { asignadas: number; realizadasATiempo: number; realizadasTarde: number; pendientes: number; porciento: number | null };
  deuda: { cantidad: number; masAntiguaDias: number | null };
  peorCumplimiento: { codigo: string; titulo: string; porciento: number | null }[];
  cierresAdministrativos: number;
  urlOperacion: string;
}

export function correoMensualHtml(d: DatosMensual): string {
  const saludo = primerNombre(d.nombre);
  const nombreMes = MESES[d.mes.mes];
  const ultimoDia = new Date(Date.UTC(d.mes.anio, d.mes.mes + 1, 0)).getUTCDate();
  const c = d.cumplimiento;

  const segmentos = [
    { n: c.realizadasATiempo, etiqueta: 'A tiempo', color: '#0f7a5a' },
    { n: c.realizadasTarde, etiqueta: 'Tarde', color: '#b8791a' },
    { n: c.pendientes, etiqueta: 'Sin hacer', color: ROJO },
  ].filter((s) => s.n > 0);

  return envolver(
    `${cabecera(
      saludo === ''
        ? `Así cerró ${nombreMes} en ${escapar(d.areaNombre)}`
        : `${escapar(saludo)}, así cerró ${nombreMes} en ${escapar(d.areaNombre)}`,
      `Resumen del 1 al ${ultimoDia} de ${nombreMes} de ${d.mes.anio} · tu área`,
    )}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:20px 26px 4px">
        ${etiquetaSeccion('Cumplimiento del mes', AZUL)}
        <div style="font:600 40px/1 ${FUENTE};color:${colorDePorciento(c.porciento)};margin:10px 0 4px">
          ${c.porciento === null ? '—' : `${c.porciento} %`}
        </div>
        <div style="font:400 12px/1.5 ${FUENTE};color:#6b7570">
          ${c.realizadasATiempo} de ${c.asignadas} realizadas a tiempo
        </div>
        ${barraApilada(segmentos, c.asignadas)}
      </td></tr>
    </table>

    ${
      d.deuda.cantidad > 0
        ? seccion(
            `Deuda vencida · ${d.deuda.cantidad}`,
            ROJO,
            `<div style="font:400 12px/1.6 ${FUENTE};color:#4a544f;padding:0 0 4px">
               ${
                 d.deuda.masAntiguaDias === null
                   ? ''
                   : `La más antigua lleva <strong style="color:${ROJO}">${d.deuda.masAntiguaDias} ${
                       d.deuda.masAntiguaDias === 1 ? 'día' : 'días'
                     }</strong> abierta.`
               }
             </div>`,
          )
        : ''
    }

    ${
      d.peorCumplimiento.length > 0
        ? seccion(
            'Obligaciones con peor cumplimiento',
            AZUL,
            d.peorCumplimiento.map((p) => filaObligacion(p)).join(''),
          )
        : ''
    }

    ${
      d.cierresAdministrativos > 0
        ? seccion(
            `Cierres administrativos · ${d.cierresAdministrativos}`,
            '#6b5410',
            `<div style="font:400 12px/1.6 ${FUENTE};color:#6b5410;background:#fdfaf0;border:1px solid #e0b93c;border-radius:8px;padding:11px 13px">
               Se cuentan aparte del cumplimiento, porque el auditor pregunta quién
               <em>hizo</em> la tarea, no quién la marcó.
             </div>`,
          )
        : ''
    }

    ${llamado('Ver el detalle en Operación', d.urlOperacion)}
    ${pie(
      `Recibes este correo porque eres responsable de ${escapar(d.areaNombre)} en el Sistema ` +
        'Integrado de Gestión.',
    )}`,
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────────────────

function colorDePorciento(p: number | null): string {
  if (p === null) return '#6b7570';
  if (p >= 90) return VERDE;
  if (p >= 75) return AMBAR_TEXTO;
  return ROJO;
}

/// La estructura externa: una tabla, no un div. Outlook usa el motor de Word y no entiende
/// `max-width` ni flex; una tabla con ancho fijo es lo único que centra igual en todos.
function envolver(contenido: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#eceeed">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceeed">
  <tr><td align="center" style="padding:22px 12px">
    <table role="presentation" width="${ANCHO}" cellpadding="0" cellspacing="0" border="0" style="width:${ANCHO}px;max-width:100%;background:#ffffff;border:1px solid #e2e6e3;border-radius:12px;overflow:hidden">
      <tr><td>${contenido}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function cabecera(titular: string, subtitulo: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:${AZUL_OSCURO};background-image:linear-gradient(96deg,${AZUL_OSCURO} 0%,#1b3a8a 46%,#2b52b8 100%)">
    <tr><td style="padding:22px 26px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
        <tr>
          <td width="30" style="background:#ffffff;border-radius:6px;text-align:center;font:700 10px/30px ${FUENTE};color:#1b3a8a">CQ</td>
          <td style="padding-left:11px;font:700 14px/1.1 ${FUENTE};letter-spacing:0.06em;color:#ffffff">
            CUANTICO<br><span style="font:400 9px/1.4 ${FUENTE};letter-spacing:0.16em;color:#7fb0f0">SIG</span>
          </td>
        </tr>
      </table>
      <div style="font:600 19px/1.35 ${FUENTE};color:#ffffff;margin-bottom:6px">${titular}</div>
      <div style="font:400 12.5px/1.4 ${FUENTE};color:#bcd4f5">${subtitulo}</div>
    </td></tr>
  </table>`;
}

function filaDeCifras(cifras: { n: number; etiqueta: string; color: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #eceeed">
    <tr>${cifras
      .map(
        (c) => `<td align="center" width="33%" style="padding:16px 8px;border-right:1px solid #eceeed">
          <div style="font:600 26px/1 ${FUENTE};color:${c.color}">${c.n}</div>
          <div style="font:400 9px/1.4 ${FUENTE};letter-spacing:0.07em;text-transform:uppercase;color:#a3aca7;padding-top:5px">${c.etiqueta}</div>
        </td>`,
      )
      .join('')}</tr>
  </table>`;
}

function etiquetaSeccion(texto: string, color: string): string {
  return `<div style="font:600 9.5px/1.4 ${FUENTE};letter-spacing:0.07em;text-transform:uppercase;color:${color}">${texto}</div>`;
}

function seccion(titulo: string, color: string, cuerpo: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:18px 26px 4px">
      <div style="margin-bottom:12px">${etiquetaSeccion(titulo, color)}</div>
      ${cuerpo}
    </td></tr>
  </table>`;
}

function tarjeta(l: LineaCorreo, colorPlazo: string, fondo: string, borde: string): string {
  const t = TIPO[l.tipo] ?? TIPO.TAREA;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:${fondo};border:1px solid ${borde};border-radius:10px;margin-bottom:9px">
    <tr>
      <td width="74" valign="top" style="padding:13px 0 13px 15px">
        <div style="font:500 8.5px/1.6 ${FUENTE};letter-spacing:0.07em;text-transform:uppercase;text-align:center;border-radius:4px;background:${t.bg};color:${t.fg};padding:4px 0">${t.etiqueta}</div>
      </td>
      <td valign="top" style="padding:13px 15px 13px 13px">
        <div style="font:500 13.5px/1.4 ${FUENTE};color:#1a211e">${escapar(l.titulo)}</div>
        <div style="font:500 11.5px/1.5 ${FUENTE};color:${colorPlazo};padding-top:4px">${textoDePlazo(l.dias, l.fechaLimite)}</div>
      </td>
    </tr>
  </table>`;
}

function barraApilada(
  segmentos: { n: number; etiqueta: string; color: string }[],
  total: number,
): string {
  if (total === 0 || segmentos.length === 0) return '';
  // Una tabla de una fila con celdas de ancho porcentual: es la única barra apilada que
  // Outlook dibuja. Un div con `width:%` dentro de otro div no se renderiza ahí.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 8px">
    <tr>${segmentos
      .map(
        (s) =>
          `<td width="${((s.n / total) * 100).toFixed(1)}%" height="12" style="background:${s.color};font-size:0;line-height:0">&nbsp;</td>`,
      )
      .join('')}</tr>
  </table>
  <div style="font:400 11px/1.6 ${FUENTE};color:#4a544f">${segmentos
    .map((s) => `<span style="padding-right:14px">■ <span style="color:${s.color}">${s.etiqueta}</span> <strong>${s.n}</strong></span>`)
    .join('')}</div>`;
}

function filaObligacion(p: { codigo: string; titulo: string; porciento: number | null }): string {
  const pct = p.porciento ?? 0;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
    <tr>
      <td width="70" valign="middle" style="font:500 10.5px/1.4 ${FUENTE};color:${AZUL}">${escapar(p.codigo)}</td>
      <td valign="middle" style="font:400 12px/1.4 ${FUENTE};color:#3a443f;padding-right:10px">${escapar(p.titulo)}</td>
      <td width="90" valign="middle">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f3">
          <tr><td width="${pct}%" height="10" style="background:${AZUL};font-size:0;line-height:0">&nbsp;</td><td height="10" style="font-size:0;line-height:0">&nbsp;</td></tr>
        </table>
      </td>
      <td width="42" align="right" valign="middle" style="font:600 12px/1.4 ${FUENTE};color:${AZUL}">${p.porciento === null ? '—' : `${p.porciento} %`}</td>
    </tr>
  </table>`;
}

/// UN solo botón. El lienzo lo subraya: ningún llamado por tarea, porque el correo avisa y
/// la bandeja es donde se cierra.
function llamado(texto: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:22px 26px 24px">
      <a href="${escapar(url)}" style="display:inline-block;background:${AZUL};color:#ffffff;font:600 13.5px/1 ${FUENTE};text-decoration:none;padding:13px 28px;border-radius:8px">${texto}</a>
    </td></tr>
  </table>`;
}

function pie(explicacion: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eceeed;background:#fbfcfb">
    <tr><td style="padding:16px 26px 18px">
      <div style="font:400 11px/1.6 ${FUENTE};color:#8a938e">${explicacion}</div>
      <div style="font:400 11px/1.6 ${FUENTE};color:#a3aca7;padding-top:8px">Cuántico · Sistema Integrado de Gestión</div>
    </td></tr>
  </table>`;
}
