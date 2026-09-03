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
}

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
    '',
    '5. FIRMA ELECTRÓNICA',
    '   Esta es una firma electrónica SIMPLE. No interviene un certificado digital ni una',
    '   entidad de certificación. Su confiabilidad se sustenta en el control de acceso a la',
    '   cuenta corporativa con la que se autenticó quien firma, en la trazabilidad del',
    '   numeral 4, y en la inalterabilidad de este registro.',
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
