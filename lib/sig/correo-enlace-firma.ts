// lib/sig/correo-enlace-firma.ts
//
// **REQ-SIG-19 · Task 6 · el correo que entrega el enlace, y la URL que lleva adentro.**
//
// Puro, por la misma razón que `lib/sig/enlace-firma.ts`: no toca la red, no toca Prisma y no
// lee `process.env` por su cuenta. Lo que se decide acá —qué dice el correo y qué forma tiene el
// enlace— es exactamente lo que hay que poder revisar sin levantar SMTP ni Postgres.
//
// ── Las tres reglas que sostienen el módulo ──────────────────────────────────────────────────
//
// **P9 · la URL no lleva nada más que el token.** Ni el id de la persona, ni el correo, ni el id
// de la asignación. Esa URL viaja por servidores de correo que no son nuestros, se pega en chats
// y queda en el historial del navegador: el correo de alguien en una URL es una fuga sin
// necesidad, y un id secuencial en una URL es una invitación a probar el siguiente. Por eso
// `urlDeFirma` recibe la base y el token, y ningún otro dato: lo que no conoce no lo puede
// filtrar.
//
// **Sin `PUBLIC_URL` no hay enlace.** `basePublica` devuelve `null` en vez de caer a
// `http://localhost:3004`, que es el valor por defecto del resto de los correos del proyecto
// (`lib/sgsi/notificaciones.ts:66`, `lib/sig/trabajos-notificaciones.ts:341`). Ahí la caída es
// inofensiva —el correo avisa de algo que igual está en la bandeja—; acá el enlace **es** el
// correo, y uno que apunta a `localhost` es un correo perdido: la persona no tiene cómo firmar,
// nadie se entera de que no pudo, y el enlace queda emitido consumiendo su plazo.
//
// **Sin adjunto y sin ningún dato personal más que el nombre.** El documento se lee en la
// página, detrás del token. Adjuntarlo pondría el contenido en un buzón personal sobre el que la
// organización no tiene control, y el nombre es el único dato que hace falta para que quien
// recibe sepa si la solicitud es para él.

import { escapar, fechaCorta, primerNombre } from '@/lib/sig/correos';

/// La variable de entorno que da la base del enlace. Ya existe en el proyecto; este
/// requerimiento no agrega ninguna credencial ni ninguna variable nueva.
export const VARIABLE_DE_BASE = 'PUBLIC_URL';

/// La única ruta pública del requerimiento (D-9). Vive acá como constante para que el correo y
/// la página no puedan desalinearse.
export const RUTA_DE_FIRMA = '/firmar';

/// Lo que hay que decirle a quien intenta emitir cuando la base no está configurada. Es un
/// mensaje para la pantalla de gestión, no para quien firma.
export const MOTIVO_SIN_BASE_PUBLICA =
  'PUBLIC_URL no está configurada, así que el enlace apuntaría a localhost y nadie podría ' +
  'firmarlo. El enlace no se emite hasta que la variable exista.';

/// **La base de la que cuelga el enlace, o `null` si no se puede armar uno que sirva.**
///
/// Recibe el entorno por parámetro —igual que `diasDeValidez`— para que la regla se pueda probar
/// sin ensuciar el entorno del proceso de pruebas. Una base vacía o con sólo espacios es lo
/// mismo que no tenerla: cae al mismo `null`, y no a una URL que empieza en `/firmar`.
export function basePublica(entorno: Record<string, string | undefined>): string | null {
  const crudo = entorno[VARIABLE_DE_BASE]?.trim();
  if (crudo === undefined || crudo === '') return null;
  // Se quitan las barras finales para que la concatenación no produzca `//firmar`, que un proxy
  // normaliza y otro responde con 404.
  const base = crudo.replace(/\/+$/, '');
  return base === '' ? null : base;
}

/// **P9 · el enlace, y nada más que el token.**
export function urlDeFirma(base: string, token: string): string {
  return `${base}${RUTA_DE_FIRMA}/${token}`;
}

/// Un documento del correo, con el enlace que le corresponde.
///
/// **D-4 · un enlace, una asignación**, y por lo tanto un token por documento. **P7 · un correo
/// por persona**, y por eso esto es una lista: cuatro correos por cuatro documentos es hostil sin
/// ganar nada, mientras que cuatro actos de firma por cuatro declaraciones sí importa.
export interface DocumentoEnElCorreo {
  /// El token en claro. Existe sólo en memoria, entre la emisión y el envío: en la base vive su
  /// hash (P2) y en la bitácora vive el código (P3).
  token: string;
  /// El código del contenido —`POL-001`—, que es lo que la persona reconoce.
  codigo: string;
  titulo: string;
}

export interface DatosDelCorreoDeEnlace {
  /// El nombre de la persona. **El único dato personal que lleva el correo**, además de la
  /// dirección a la que se envía.
  nombre: string;
  documentos: DocumentoEnElCorreo[];
  /// Hasta cuándo sirven los enlaces. Es un dato del enlace, calculado al emitir.
  expiraEn: Date;
  /// A quién escribirle si no reconoce la solicitud. Es `EnlaceFirma.emitidoPor`: quien habilitó
  /// el canal tiene nombre, y es el único que puede explicar por qué llegó ese correo.
  contacto: string;
}

export interface CorreoArmado {
  asunto: string;
  texto: string;
  html: string;
}

/// El pie. Nombra a la organización y al sistema, y a nadie más.
const FIRMA_DEL_CORREO = 'Cuantico · Sistema de Gestión de Seguridad de la Información';

/// «17 de septiembre de 2026». `fechaCorta` no lleva el año porque el correo semanal es de esta
/// semana; un plazo de vencimiento sí lo necesita, y sin él «17 de septiembre» es ambiguo en un
/// correo que alguien puede abrir un año después.
function fechaConAnio(f: Date): string {
  return `${fechaCorta(f)} de ${f.getUTCFullYear()}`;
}

/// **El correo de entrega del enlace.**
///
/// Dice las cuatro cosas que tiene que decir: **qué** hay que firmar, **por qué** se le escribe a
/// una dirección personal, **hasta cuándo** sirve el enlace, y **a quién escribirle** si no
/// reconoce la solicitud. Ninguna de las cuatro es adorno: sin la segunda el correo parece una
/// suplantación, y sin la cuarta quien sospecha no tiene a dónde ir más que a ignorarlo.
///
/// No lleva adjunto, no lleva imágenes, no lleva más enlaces que los de firma —ni al sitio, ni a
/// una baja de suscripción— y no nombra el área, el cargo ni ningún otro dato de la ficha.
export function correoDeEnlaceDeFirma(base: string, datos: DatosDelCorreoDeEnlace): CorreoArmado {
  const n = datos.documentos.length;
  const uno = n === 1;
  const saludo = primerNombre(datos.nombre);
  const hasta = fechaConAnio(datos.expiraEn);
  const enlaces = datos.documentos.map((d) => ({ ...d, url: urlDeFirma(base, d.token) }));

  const asunto = uno
    ? 'Documento pendiente de firma · Cuantico'
    : `${n} documentos pendientes de firma · Cuantico`;

  const parrafos = [
    saludo === '' ? 'Hola.' : `Hola, ${saludo}.`,
    uno
      ? 'Quedó pendiente de firma un documento del Sistema de Gestión de Seguridad de la ' +
        'Información de Cuantico.'
      : `Quedaron pendientes de firma ${n} documentos del Sistema de Gestión de Seguridad de la ` +
        'Información de Cuantico.',
    'Le escribimos a esta dirección personal porque su cuenta corporativa ya no está habilitada ' +
      'y sin ella no es posible entrar a la aplicación. Es la dirección registrada en su ficha, ' +
      'y se usa únicamente para los compromisos que siguen vigentes después de la terminación ' +
      'del contrato.',
  ];

  const titulo = uno ? 'Documento por firmar:' : 'Documentos por firmar:';

  const instrucciones = [
    uno
      ? 'El enlace abre una página donde puede leer el documento, aceptarlo y firmarlo.'
      : 'Cada enlace abre una página donde puede leer el documento, aceptarlo y firmarlo.',
    'Al firmar se le pedirá su número de documento de identidad: es lo que confirma que la firma ' +
      'es suya y no de alguien que haya recibido este correo por error.',
    uno
      ? `El enlace sirve hasta el ${hasta}. Después de esa fecha deja de funcionar y hay que ` +
        'emitir uno nuevo.'
      : `Los enlaces sirven hasta el ${hasta}. Después de esa fecha dejan de funcionar y hay que ` +
        'emitir unos nuevos.',
    uno
      ? 'Puede abrir el enlace las veces que necesite. Lo que se hace una sola vez es la firma.'
      : 'Puede abrir los enlaces las veces que necesite. Lo que se hace una sola vez es la firma.',
    'Este correo no lleva archivos adjuntos y no es necesario responderlo.',
    `Si no reconoce esta solicitud, no abra el enlace y escriba a ${datos.contacto}.`,
  ];

  const lineas = enlaces.flatMap((e, i) => {
    const bloque = uno
      ? [`  ${e.codigo} — ${e.titulo}`, `  ${e.url}`]
      : [`  ${i + 1}. ${e.codigo} — ${e.titulo}`, `     ${e.url}`];
    // Una línea en blanco entre documentos: pegados, dos URL de 43 caracteres se leen como una
    // sola y alguien copia media.
    return i === enlaces.length - 1 ? bloque : [...bloque, ''];
  });

  // En texto plano los párrafos se separan con una línea en blanco. Sin ella el correo llega
  // como un bloque, y un bloque es lo que nadie lee.
  const conAire = (xs: string[]) => xs.flatMap((t, i) => (i === 0 ? [t] : ['', t]));

  const texto = [
    ...conAire(parrafos),
    '',
    titulo,
    '',
    ...lineas,
    '',
    ...conAire(instrucciones),
    '',
    FIRMA_DEL_CORREO,
  ].join('\n');

  // Estilos EN LÍNEA y pila de fuentes del sistema, por lo mismo que documenta `correos.ts`:
  // ningún cliente de correo aplica hojas externas y ninguno descarga tipografías.
  const fuente = "'Segoe UI', Helvetica, Arial, sans-serif";
  const parrafo = 'margin:0 0 14px;font-size:14px;line-height:1.55;color:#20262b';

  const itemsHtml = enlaces
    .map(
      (e) =>
        '<li style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#20262b">' +
        `<strong>${escapar(e.codigo)}</strong> — ${escapar(e.titulo)}<br />` +
        // La URL se muestra completa y es su propio texto: quien recibe un correo que le pide
        // abrir un enlace merece ver a dónde va antes de tocarlo.
        `<a href="${escapar(e.url)}" style="color:#12437f;word-break:break-all">${escapar(e.url)}</a>` +
        '</li>',
    )
    .join('');

  const html = [
    `<div style="font-family:${fuente};max-width:600px;margin:0 auto;padding:24px 20px">`,
    ...parrafos.map((t) => `<p style="${parrafo}">${escapar(t)}</p>`),
    `<p style="${parrafo};font-weight:600">${escapar(titulo)}</p>`,
    `<ul style="margin:0 0 14px;padding-left:20px">${itemsHtml}</ul>`,
    ...instrucciones.map((t) => `<p style="${parrafo}">${escapar(t)}</p>`),
    '<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#5b666e">' +
      `${escapar(FIRMA_DEL_CORREO)}</p>`,
    '</div>',
  ].join('');

  return { asunto, texto, html };
}
