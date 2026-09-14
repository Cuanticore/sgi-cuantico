// lib/sig/firma.ts
//
// Leer, aceptar y firmar. Tres pasos, un registro, un artefacto congelado.
//
// Un solo mecanismo para todo lo que el sistema documental dice que «se firmará»: acuerdos
// de confidencialidad, autorización de tratamiento de datos, aceptación de las políticas
// del SGSI, lineamientos del puesto remoto, actas de compromiso y la autoevaluación
// FOR-SIG-13.
//
// **F6 · es firma electrónica SIMPLE, y se dice así.** No hay certificado digital ni
// entidad de certificación. La confiabilidad viene de tres cosas y de ninguna más: el
// control de acceso a la cuenta corporativa, la trazabilidad del numeral 4 del acta, y la
// inalterabilidad del registro. Este módulo no promete otra cosa.
//
// **REQ-SIG-19 · y cuando NO hubo cuenta corporativa, el acta lo dice.** Existe una segunda vía
// —un enlace único enviado al correo personal de quien ya salió de la organización— en la que no
// hay sesión y no hay autenticación. Reusar ahí el numeral 5 de arriba produciría un acta que
// invoca como fundamento de su confiabilidad **algo que no ocurrió**, y ese acta es justo el
// documento que se le muestra a un auditor o a un juez: evidencia fabricada, aunque el resto del
// registro sea impecable. Por eso el numeral 5 tiene dos textos y los numerales 1 y 4 dos
// variantes, elegidos por `DatosDelActa.medio`.
//
// **Con sesión corporativa el texto no cambia ni un carácter**, y eso no es una cortesía: la
// huella del acta se calcula sobre este texto, así que un espacio de más en la vía existente
// haría que ninguna acta ya firmada se pudiera reverificar. `firma.test.ts` congela esa salida
// byte por byte.

import { createHash } from 'node:crypto';

export interface EntradaFirma {
  /// F1 · sin lectura no hay firma. Lo pone la pantalla al abrir el documento.
  abrioElDocumento: boolean;
  /// La casilla explícita, con el texto de la declaración a la vista.
  acepto: boolean;
  nombreFirmante: string;
  documentoFirmante: string;
  /// El texto que la persona tenía delante. Se COPIA al acta (F2).
  declaracion: string | null;
}

/// Qué impide firmar. Devuelve la lista completa y no el primer error: quien está firmando
/// merece ver todo lo que falta de una vez, no descubrirlo de a uno.
export function validarFirma(e: EntradaFirma): string[] {
  const errores: string[] = [];

  // F1. El botón de aceptar se habilita sólo después de abrir el documento. No se pide que
  // lea completo —eso no se puede comprobar, y fingirlo enseña a mentirle al sistema— pero
  // sí que el documento haya estado delante.
  if (!e.abrioElDocumento) {
    errores.push('hay que abrir el documento antes de aceptarlo');
  }
  if (!e.acepto) {
    errores.push('falta marcar la casilla de aceptación');
  }
  // Una firma sin declaración es un clic. Si el contenido exige firma y no tiene el texto
  // configurado, el defecto es del contenido y no de quien firma — pero no se puede firmar.
  if (e.declaracion === null || e.declaracion.trim() === '') {
    errores.push('el contenido exige firma y no tiene declaración configurada');
  }
  // El tecleo es el acto deliberado que distingue firmar de hacer clic. Dos caracteres no
  // son un nombre, y aceptar cualquier cosa vaciaría el acto de sentido.
  if (e.nombreFirmante.trim().length < 5) {
    errores.push('escribí tu nombre completo');
  }
  if (e.documentoFirmante.trim().length < 5) {
    errores.push('escribí tu documento de identidad');
  }
  return errores;
}

/// SHA-256 en hexadecimal. La huella del documento mostrado (F3) y la del acta generada.
export function huella(contenido: string | Uint8Array): string {
  return createHash('sha256').update(contenido).digest('hex');
}

/// `ACT-2026-0001`. El año va en el código porque la numeración se reinicia con él, y sin
/// el año dos actas de años distintos podrían chocar.
export function codigoActa(anio: number, consecutivo: number): string {
  return `ACT-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

/// **P1 · el medio de identificación es un dato, no una deducción del texto.**
///
/// Deducirlo mañana leyendo el acta —«¿dice cuenta corporativa o dice enlace?»— es la clase de
/// consulta que nadie puede escribir para un informe. Es un enum y no un booleano
/// `firmadoConEnlace` porque el día que aparezca un tercer medio —firma en sitio ante el líder
/// del SIG, certificado digital— un booleano obliga a migrar la columna y a reinterpretar `false`.
export type MedioDelActa = 'SESION_CORPORATIVA' | 'ENLACE_CORREO_PERSONAL';

/// El canal por el que se identificó a quien firma cuando no hubo sesión. Sólo la vía por enlace.
export interface CanalDelActa {
  /// La dirección a la que se envió el enlace, **copiada al emitir**. Si la persona cambia su
  /// correo personal después, el acta tiene que seguir diciendo a dónde fue: es la misma doctrina
  /// que F2 aplica a la declaración.
  correoPersonal: string;
  /// `ENL-2026-0007`. El código y nunca el token (P3). Un token en el acta es un token en manos
  /// de todo el que puede leer el acta.
  enlaceCodigo: string;
  enviadoEn: Date;
  /// **P19 · `null` cuando no consta.** Si la fecha en que se registró el correo personal no
  /// existe —porque el valor entró por una carga inicial y no por una edición con bitácora—, el
  /// acta lo dice. Un auditor va a pedir ese dato para evaluar la atribución, y afirmar
  /// «registrada por RRHH el 3 de marzo» sin poder probarlo es peor que decir que no consta.
  registradoEn: Date | null;
}

export interface DatosDelActa {
  codigo: string;
  /// Numeral 1 · identificación de quien firma.
  firmante: {
    nombre: string;
    documento: string;
    cargo: string | null;
    area: string | null;
    correo: string;
    vinculacion: string | null;
  };
  /// Numeral 2 · documento aceptado.
  documento: {
    codigo: string;
    nombre: string;
    version: number;
    hash: string;
    ubicacion: string | null;
  };
  /// Numeral 3 · declaración aceptada, el texto literal.
  declaracion: string;
  /// Numeral 4 · constancia de la aceptación.
  constancia: {
    aceptadoEn: Date;
    ip: string | null;
    agente: string | null;
    sesionId: string | null;
    asignacionId: number;
  };
  /// **Ausente se lee como `SESION_CORPORATIVA`**, que es lo que había antes de que este campo
  /// existiera: agregarlo no cambia la conducta de nada que ya estuviera llamando a esta función.
  medio?: MedioDelActa;
  /// Obligatorio en la vía por enlace y sin sentido en la otra. La coherencia entre los dos
  /// campos la comprueba `textoDelActa`.
  canal?: CanalDelActa;
}

/// **El numeral 5 de la vía de siempre.** Palabra por palabra el que se viene firmando.
///
/// Está en una constante y no en una plantilla con huecos, y las dos variantes están separadas y
/// no unificadas: cualquier intento de fabricar los dos textos desde uno solo —un `${}` en el
/// medio, un párrafo reacomodado para que quepan los dos— cambia algún carácter de éste, y con él
/// la huella de todas las actas futuras de la vía corporativa. Duplicar aquí es lo barato;
/// unificar es lo que rompe la evidencia.
const NUMERAL_5_SESION: readonly string[] = [
  '   Esta es una firma electrónica SIMPLE. No interviene un certificado digital ni una',
  '   entidad de certificación. Su confiabilidad se sustenta en el control de acceso a la',
  '   cuenta corporativa con la que se autenticó quien firma, en la trazabilidad del',
  '   numeral 4, y en la inalterabilidad de este registro.',
];

/// **El numeral 5 de la vía por enlace** (REQ-SIG-19 §7), que dice lo que de verdad pasó.
///
/// No invoca una autenticación que no existió: nombra los tres hechos que sí son verificables —la
/// posesión del enlace, el conocimiento del documento verificado contra el registrado, y la
/// trazabilidad del numeral 4—. Es el texto que se lleva a la revisión jurídica de D-3, y
/// cambiarlo no es una corrección de estilo.
const NUMERAL_5_ENLACE: readonly string[] = [
  '   Esta es una firma electrónica SIMPLE. No interviene un certificado digital ni una',
  '   entidad de certificación. Quien firma NO se autenticó con una cuenta corporativa:',
  '   su cuenta ya estaba deshabilitada al momento de la firma. La confiabilidad se',
  '   sustenta en tres hechos verificables: la posesión de un enlace único de un solo uso',
  '   enviado exclusivamente a la dirección de correo personal registrada en su ficha; el',
  '   conocimiento del número de documento de identidad, que fue verificado contra el',
  '   registrado; y la trazabilidad del numeral 4.',
];

/// El artefacto del acta, en texto canónico y determinista.
///
/// **F5 · se genera al aceptar, no al consultar.** Uno que se arma cada vez que alguien lo
/// abre puede salir distinto mañana, y entonces su huella no prueba nada.
///
/// Es TEXTO y no un PDF, y eso es una limitación consciente: el proyecto no tiene librería
/// de PDF ni de plantillas `.docx`, y agregar una dependencia es una decisión que no se toma
/// de paso. Lo probatorio —el contenido exacto, congelado, con su huella y guardado como
/// evidencia— está completo; lo que falta es el FORMATO. El documento base
/// `plantillas/Acta de aceptacion y firma - base.docx` tiene los cinco numerales con sus
/// campos `{{...}}`, y este texto los produce en el mismo orden para que rellenarlo sea
/// mecánico cuando se decida la librería.
///
/// El orden de los campos es fijo. Reordenarlo cambiaría la huella de todas las actas
/// futuras sin cambiar su contenido, y dos actas iguales dejarían de tener la misma huella.
export function textoDelActa(d: DatosDelActa): string {
  const f = d.firmante;
  const doc = d.documento;
  const c = d.constancia;
  const oNo = (v: string | null) => v ?? 'no registrado';

  // Ausente es `SESION_CORPORATIVA`: es lo que había antes de que el campo existiera, y todas las
  // actas ya firmadas se firmaron así.
  const porEnlace = (d.medio ?? 'SESION_CORPORATIVA') === 'ENLACE_CORREO_PERSONAL';
  const canal = d.canal;

  // Un acta por enlace SIN su canal no se genera a medias: se niega. Las tres líneas que faltarían
  // —a qué dirección se envió, con qué código, cuándo— son exactamente la trazabilidad en la que
  // su numeral 5 dice sustentarse, así que un acta que las omite afirma un fundamento que no
  // muestra. Es preferible que la transacción falle a que quede guardada una evidencia incompleta
  // con su huella calculada, que ya no se puede corregir (F4).
  if (porEnlace && canal === undefined) {
    throw new Error(
      'el acta declara identificación por enlace y no trae el canal: sin la dirección, el código ' +
        'del enlace y la fecha de envío, el numeral 5 afirmaría una trazabilidad que el acta no ' +
        'muestra',
    );
  }
  // Y al revés, que es la mitad que protege la vía existente: un canal colado en una firma con
  // sesión agregaría dos líneas al acta corporativa y le cambiaría la huella a todas las que
  // vinieran después. Se rechaza en vez de ignorarse en silencio — ignorarlo escondería el
  // defecto de quien llama justo donde no se puede permitir un dato perdido.
  if (!porEnlace && canal !== undefined) {
    throw new Error(
      'el acta declara identificación con sesión corporativa y trae un canal de notificación: ' +
        'son dos afirmaciones que no pueden ser ciertas a la vez',
    );
  }

  // **P19 · lo que el acta no puede afirmar, no lo afirma.** Decir «registrada por RRHH el 3 de
  // marzo» sin poder probarlo es peor que decir que no consta.
  const origenDelCorreo =
    canal === undefined
      ? ''
      : canal.registradoEn === null
        ? 'dirección registrada en la ficha; sin registro de origen'
        : `dirección registrada en la ficha el ${canal.registradoEn.toISOString()}`;

  return [
    `ACTA DE ACEPTACIÓN Y FIRMA · ${d.codigo}`,
    '',
    '1. IDENTIFICACIÓN DE QUIEN FIRMA',
    `   Nombre: ${f.nombre}`,
    `   Documento de identidad: ${f.documento}`,
    `   Cargo: ${oNo(f.cargo)}`,
    `   Área: ${oNo(f.area)}`,
    `   Correo corporativo: ${f.correo}`,
    `   Tipo de vinculación: ${oNo(f.vinculacion)}`,
    // La línea del canal se AGREGA al final del numeral 1, y no se intercala junto al correo
    // corporativo: así los seis campos de siempre conservan sus posiciones y la diferencia entre
    // las dos variantes es un sufijo, no un reordenamiento (P20).
    ...(canal !== undefined
      ? [`   Correo personal (canal de notificación): ${canal.correoPersonal} · ${origenDelCorreo}`]
      : []),
    '',
    '2. DOCUMENTO ACEPTADO',
    `   Código: ${doc.codigo}`,
    `   Nombre: ${doc.nombre}`,
    `   Versión leída: ${doc.version}`,
    `   Huella SHA-256 del documento: ${doc.hash}`,
    `   Ubicación: ${oNo(doc.ubicacion)}`,
    '',
    '3. DECLARACIÓN ACEPTADA',
    ...d.declaracion.split('\n').map((l) => `   ${l}`),
    '',
    '4. CONSTANCIA DE LA ACEPTACIÓN',
    `   Fecha y hora (UTC): ${c.aceptadoEn.toISOString()}`,
    `   Dirección IP: ${oNo(c.ip)}`,
    `   Navegador: ${oNo(c.agente)}`,
    `   Sesión: ${oNo(c.sesionId)}`,
    `   Asignación asociada: ${c.asignacionId}`,
    // Las dos líneas del medio se agregan al final del numeral 4, por lo mismo que la del canal
    // al final del numeral 1. El token NO aparece: lo que se nombra es el código (P3).
    ...(canal !== undefined
      ? [
          `   Medio de identificación: enlace único de un solo uso (${canal.enlaceCodigo})`,
          `   Enviado a: ${canal.correoPersonal} el ${canal.enviadoEn.toISOString()}`,
        ]
      : []),
    '',
    '5. FIRMA ELECTRÓNICA',
    ...(porEnlace ? NUMERAL_5_ENLACE : NUMERAL_5_SESION),
    '',
    `   Firma de quien acepta: ${f.nombre} · ${f.documento}`,
    '   Constancia del sistema: la huella de esta acta se calcula sobre el texto anterior y',
    '   se almacena junto al registro. Cualquier cambio en el contenido produce otra huella.',
    '',
  ].join('\n');
}

/// El acta completa, lista para guardar: su texto y su huella.
export function generarActa(d: DatosDelActa): { texto: string; hash: string } {
  const texto = textoDelActa(d);
  return { texto, hash: huella(texto) };
}

/// Los cuatro compromisos que PRO-TAL-01 exige antes de habilitar CUALQUIER acceso.
///
/// Se identifican por el código del contenido y no por su título: el título se puede
/// reescribir y el código es la referencia con la que el procedimiento los nombra.
export const COMPROMISOS_EXIGIDOS = 4;

/// Si esta persona ya suscribió los cuatro. `codigosFirmados` son los códigos de contenido
/// con acta; `codigosExigidos`, los que la configuración marque como compromiso.
export function suscribioLosCompromisos(
  codigosFirmados: readonly string[],
  codigosExigidos: readonly string[],
): { suscritos: number; faltan: string[] } {
  const firmados = new Set(codigosFirmados);
  const faltan = codigosExigidos.filter((c) => !firmados.has(c));
  return { suscritos: codigosExigidos.length - faltan.length, faltan };
}
