// lib/sig/correo-constancia-firma.ts
//
// **REQ-SIG-19 · Task 9 · la constancia que se le manda a quien firmó por enlace.**
//
// Puro, por la misma razón que `lib/sig/correo-enlace-firma.ts`: no toca la red, no toca Prisma y
// no lee `process.env`. Lo que se decide acá —qué dice la constancia— es exactamente lo que hay
// que poder revisar sin levantar SMTP.
//
// ── Las cuatro reglas que sostienen el módulo ────────────────────────────────────────────────
//
// **P18 · el código del acta, su huella y su fecha.** Los tres, porque los tres juntos son la
// constancia: el código la identifica, la fecha la ubica y la huella la vuelve verificable. Quien
// firmó por esta vía **ya no tiene dónde consultar su historial** —`/mi-sig` le está cerrado
// porque su cuenta corporativa ya no existe—, así que este correo es el único registro que queda
// en sus manos. Y es, además, la evidencia de que la notificación llegó a la dirección que el
// acta declara en su numeral 1.
//
// **D-9 · el correo no lleva enlaces, y no lleva ninguno a propósito.** No hay ruta pública para
// «ver mi historial» ni para «descargar mi acta», y no se agrega una: cada ruta pública nueva es
// superficie de ataque sobre la aplicación que gobierna el SGSI. Lo que se necesite del acta se
// pide por correo a quien emitió el enlace, y para eso va el contacto.
//
// **P3 · el token no se nombra.** Ni acá ni en ninguna parte. Este módulo ni siquiera lo recibe:
// lo que se nombra es el código del acta, y el del enlace cuando hace falta citarlo.
//
// **Sin adjunto.** El acta ya está guardada como evidencia y se publica en SharePoint por la cola
// de REQ-SIG-13. Adjuntarla pondría el documento completo —con el número de documento de
// identidad adentro— en un buzón personal sobre el que la organización no tiene control.

import { escapar, fechaCorta, primerNombre } from '@/lib/sig/correos';
import type { CorreoArmado } from '@/lib/sig/correo-enlace-firma';

/// El pie. Nombra a la organización y al sistema, y a nadie más. Es el mismo de
/// `correo-enlace-firma.ts`: los dos correos de esta vía se firman igual, porque quien recibe el
/// segundo tiene que reconocer al mismo remitente del primero.
const FIRMA_DEL_CORREO = 'Cuantico · Sistema de Gestión de Seguridad de la Información';

export interface DatosDeLaConstancia {
  /// El nombre de la persona. **El único dato personal del correo**, además de la dirección a la
  /// que se envía. Ni el cargo, ni el área, ni el número de documento.
  nombre: string;
  /// El documento que se firmó, como la persona lo reconoce.
  documento: { codigo: string; titulo: string; version: number };
  /// **P18 · las tres piezas de la constancia.**
  acta: { codigo: string; huella: string; aceptadoEn: Date };
  /// `ENL-2026-0007`. Se cita para que un reclamo por correo se pueda atender sin pedirle a la
  /// persona nada más. **Es el código, nunca el token** (P3).
  enlaceCodigo: string;
  /// A quién escribirle. Es `EnlaceFirma.emitidoPor`: quien habilitó el canal es el único que
  /// puede atender un pedido sobre el acta, ahora que la persona no tiene cómo entrar.
  contacto: string;
}

/// «17 de septiembre de 2026». Un acta se consulta años después, así que la fecha lleva el año:
/// «17 de septiembre», solo, es ambiguo en un correo que alguien guarda para siempre.
function fechaConAnio(f: Date): string {
  return `${fechaCorta(f)} de ${f.getUTCFullYear()}`;
}

/// **La constancia de la firma.**
///
/// Dice las cuatro cosas que tiene que decir: **qué** se firmó, **cuándo**, **con qué acta y qué
/// huella**, y **a quién escribirle** si hace falta una copia. La huella va en su propia línea y
/// completa —sesenta y cuatro caracteres— porque sirve para comparar, y una huella cortada no
/// compara nada.
export function correoDeConstanciaDeFirma(d: DatosDeLaConstancia): CorreoArmado {
  const saludo = primerNombre(d.nombre);
  const cuando = fechaConAnio(d.acta.aceptadoEn);

  const asunto = `Constancia de firma · ${d.acta.codigo} · Cuantico`;

  const parrafos = [
    saludo === '' ? 'Hola.' : `Hola, ${saludo}.`,
    `Su firma quedó registrada el ${cuando}. Este correo es la constancia: guárdelo, porque su ` +
      'cuenta corporativa ya no está habilitada y no tiene cómo consultar el acta desde la ' +
      'aplicación.',
  ];

  const datos: [string, string][] = [
    ['Documento firmado', `${d.documento.codigo} v${d.documento.version} — ${d.documento.titulo}`],
    ['Acta', d.acta.codigo],
    ['Fecha y hora (UTC)', d.acta.aceptadoEn.toISOString()],
    ['Huella SHA-256 del acta', d.acta.huella],
    ['Enlace de firma', d.enlaceCodigo],
  ];

  const cierre = [
    'La huella identifica el contenido exacto del acta: si el texto cambiara en un solo ' +
      'carácter, la huella sería otra. Por eso sirve para verificar, años después, que el acta ' +
      'que se le muestre es la misma que usted firmó.',
    `Si necesita una copia del acta, escriba a ${d.contacto} citando el código de arriba. Este ` +
      'correo no lleva archivos adjuntos y no es necesario responderlo.',
    'El enlace con el que firmó ya se consumió: la firma se hace una sola vez.',
  ];

  // En texto plano los párrafos se separan con una línea en blanco. Sin ella el correo llega como
  // un bloque, y un bloque es lo que nadie lee.
  const conAire = (xs: string[]) => xs.flatMap((t, i) => (i === 0 ? [t] : ['', t]));

  const texto = [
    ...conAire(parrafos),
    '',
    ...datos.map(([k, v]) => `  ${k}: ${v}`),
    '',
    ...conAire(cierre),
    '',
    FIRMA_DEL_CORREO,
  ].join('\n');

  // Estilos EN LÍNEA y pila de fuentes del sistema, por lo mismo que documenta `correos.ts`:
  // ningún cliente de correo aplica hojas externas y ninguno descarga tipografías.
  const fuente = "'Segoe UI', Helvetica, Arial, sans-serif";
  const parrafo = 'margin:0 0 14px;font-size:14px;line-height:1.55;color:#20262b';
  const celdaClave = 'padding:4px 12px 4px 0;font-size:13px;color:#5b666e;vertical-align:top';
  // La huella se parte donde haga falta: sesenta y cuatro caracteres sin `word-break` desbordan
  // la tabla en el teléfono y se ven a medias, que para una huella es lo mismo que no verse.
  const celdaValor =
    'padding:4px 0;font-size:13px;color:#20262b;font-family:Consolas,monospace;word-break:break-all';

  const filas = datos
    .map(
      ([k, v]) =>
        `<tr><td style="${celdaClave}">${escapar(k)}</td>` +
        `<td style="${celdaValor}">${escapar(v)}</td></tr>`,
    )
    .join('');

  const html = [
    `<div style="font-family:${fuente};max-width:600px;margin:0 auto;padding:24px 20px">`,
    ...parrafos.map((t) => `<p style="${parrafo}">${escapar(t)}</p>`),
    `<table style="border-collapse:collapse;margin:0 0 14px">${filas}</table>`,
    ...cierre.map((t) => `<p style="${parrafo}">${escapar(t)}</p>`),
    '<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#5b666e">' +
      `${escapar(FIRMA_DEL_CORREO)}</p>`,
    '</div>',
  ].join('');

  return { asunto, texto, html };
}
