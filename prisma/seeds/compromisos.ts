// prisma/seeds/compromisos.ts
//
// Los documentos que la organización exige firmar (REQ-SIG-02,
// `docs/handoff_a/lectura-aceptacion-firma.md` §5).
//
// ── POR QUÉ ESTO FALTABA, Y QUÉ DESBLOQUEA ──────────────────────────────────────────────
//
// El mecanismo de firma está construido entero: `ContenidoSig.exigeFirma`, `declaracion`,
// `ActaAceptacion` con su PDF, y el panel de tres pasos en Mi SIG. Lo que no existía era un
// solo contenido marcado con `exigeFirma`, así que el mecanismo no tenía sobre qué correr.
//
// Eso tenía una consecuencia silenciosa: la pantalla de Colaboradores deriva «los cuatro
// compromisos» de los contenidos marcados, y con el conjunto vacío la anomalía «con accesos
// sin haber firmado los cuatro compromisos» no podía señalar a nadie — no porque todos
// hubieran firmado, sino porque no había nada que firmar. Un tablero que afirma que no hay
// incumplimientos cuando en realidad no está mirando.
//
// ── LOS CUATRO PRIMEROS SON UNA PUERTA, NO UNA LISTA ────────────────────────────────────
//
// PRO-TAL-01 lo dice con todas las letras: **«Ningún acceso se habilita antes de que estas
// obligaciones estén suscritas»**. Los cuatro primeros de abajo son exactamente esos, y por
// eso `exigeFirma` en ellos no es una preferencia de configuración: es la condición que la
// aplicación tiene que poder comprobar.
//
// ── EL TEXTO DE LA DECLARACIÓN NECESITA RATIFICACIÓN ────────────────────────────────────
//
// `declaracion` es lo que la persona lee y acepta en pantalla, y queda copiado en el acta:
// es la frase que un auditor —o un juez— va a leer. Las de abajo están redactadas para ser
// fieles al documento que declaran y **no sustituyen una revisión legal**. Quien lidera el
// SIG debería ratificarlas antes de que se firme la primera; cambiarlas después obliga a
// subir la versión del contenido, que es justamente lo que `version` existe para registrar.
//
// Idempotente por `upsert` sobre `codigo`, como el resto de `prisma/seeds/`. **No pisa la
// declaración de un contenido que ya se firmó**: ver la nota en `seedCompromisos`.

import type { PrismaClient } from '@prisma/client';

interface Compromiso {
  codigo: string;
  titulo: string;
  descripcion: string;
  /// El procedimiento o política que lo exige. Sale de la tabla §5 del requerimiento, no de
  /// una interpretación: es la referencia con la que se defiende ante un auditor.
  procedimientoOrigen: string;
  documentoCodigo: string | null;
  documentoNombre: string | null;
  declaracion: string;
  /// `true` en los cuatro que PRO-TAL-01 pone como condición de acceso.
  puertaDeAcceso: boolean;
}

const COMPROMISOS: readonly Compromiso[] = [
  {
    codigo: 'ACU-SIG-01',
    titulo: 'Acuerdo de confidencialidad',
    descripcion:
      'Compromiso de reserva sobre la información de la organización, sus clientes y sus ' +
      'terceros, durante la relación y después de terminada.',
    procedimientoOrigen: 'PRO-TAL-01',
    documentoCodigo: 'FOR-TAL-02',
    documentoNombre: 'Acuerdo de confidencialidad',
    declaracion:
      'Declaro que conozco y acepto el acuerdo de confidencialidad de Cuántico. Me obligo a ' +
      'mantener reserva sobre la información de la organización, de sus clientes y de sus ' +
      'terceros a la que acceda por razón de mi vinculación; a usarla únicamente para las ' +
      'funciones que me fueron asignadas; y a no divulgarla, copiarla ni conservarla fuera de ' +
      'los medios autorizados. Entiendo que esta obligación continúa vigente después de ' +
      'terminada la relación.',
    puertaDeAcceso: true,
  },
  {
    codigo: 'AUT-SIG-01',
    titulo: 'Autorización de tratamiento de datos personales',
    descripcion:
      'Autorización para el tratamiento de los datos personales del colaborador, en los ' +
      'términos de la Ley 1581 de 2012 y de la política de tratamiento de la organización.',
    procedimientoOrigen: 'PRO-TAL-01',
    documentoCodigo: 'POL-SIG-03',
    documentoNombre: 'Política de tratamiento de datos personales',
    declaracion:
      'Autorizo de manera libre, previa, expresa e informada a Cuántico para recolectar, ' +
      'almacenar, usar, circular y suprimir mis datos personales con las finalidades ' +
      'descritas en la política de tratamiento. Declaro que conozco mi derecho a conocer, ' +
      'actualizar, rectificar y suprimir mis datos, y a revocar esta autorización en los ' +
      'términos de la Ley 1581 de 2012.',
    puertaDeAcceso: true,
  },
  {
    codigo: 'ACE-SIG-01',
    titulo: 'Aceptación de las políticas del SGSI y del uso aceptable',
    descripcion:
      'Aceptación de las políticas de seguridad de la información y de las reglas de uso ' +
      'aceptable de los recursos de la organización.',
    procedimientoOrigen: 'PRO-TAL-01',
    documentoCodigo: 'POL-SIG-02',
    documentoNombre: 'Política de seguridad de la información y uso aceptable',
    declaracion:
      'Declaro que leí y acepto las políticas del Sistema de Gestión de Seguridad de la ' +
      'Información y las reglas de uso aceptable de los recursos de Cuántico. Entiendo que ' +
      'los equipos, las cuentas y la información que se me entregan son de la organización y ' +
      'se usan para fines laborales; que debo reportar cualquier incidente o sospecha de ' +
      'incidente; y que el incumplimiento de estas políticas tiene consecuencias ' +
      'disciplinarias.',
    puertaDeAcceso: true,
  },
  {
    codigo: 'PTR-SIG-01',
    titulo: 'Lineamientos del puesto de trabajo remoto',
    descripcion:
      'Condiciones de seguridad que debe cumplir el puesto de trabajo fuera de las ' +
      'instalaciones de la organización.',
    procedimientoOrigen: 'PRO-TAL-01 · PTR-TEC-02',
    documentoCodigo: 'PTR-TEC-02',
    documentoNombre: 'Lineamientos del puesto de trabajo remoto',
    declaracion:
      'Declaro que conozco y me comprometo a cumplir los lineamientos del puesto de trabajo ' +
      'remoto: mantener el equipo bajo mi custodia y bloqueado cuando no lo use, conectarme ' +
      'desde redes de confianza, no permitir el uso del equipo por terceros, y proteger la ' +
      'información en pantalla y en papel frente a personas no autorizadas.',
    puertaDeAcceso: true,
  },
  {
    codigo: 'COM-SIG-01',
    titulo: 'Acta de compromiso',
    descripcion: 'Compromiso general del colaborador al vincularse a la organización.',
    procedimientoOrigen: 'FOR-TAL-01',
    documentoCodigo: 'FOR-TAL-01',
    documentoNombre: 'Acta de compromiso',
    declaracion:
      'Declaro que conozco mis funciones, los procedimientos que me aplican y los canales ' +
      'para reportar incidentes y hallazgos, y me comprometo a cumplirlos.',
    puertaDeAcceso: false,
  },
];

export interface ResultadoCompromisos {
  creados: number;
  actualizados: number;
  /// Los que NO se tocaron porque ya tienen actas firmadas. Ver la nota de abajo.
  intactos: number;
}

/// Siembra los compromisos.
///
/// **UN CONTENIDO CON ACTAS FIRMADAS NO SE PISA.** El acta guarda la versión leída y la fila
/// de esa versión precisamente porque «el número solo no prueba nada si el texto se
/// sobreescribió». Reescribir la `declaracion` de un contenido ya firmado cambiaría, con un
/// `npm run seed`, la frase que alguien aceptó — y eso es exactamente lo que la evidencia
/// ante un auditor no puede permitir. Si hay que corregir el texto de uno ya firmado, se
/// hace desde la pantalla de Contenidos, que sube la versión.
export async function seedCompromisos(prisma: PrismaClient): Promise<ResultadoCompromisos> {
  let creados = 0;
  let actualizados = 0;
  let intactos = 0;

  for (const c of COMPROMISOS) {
    const existente = await prisma.contenidoSig.findUnique({
      where: { codigo: c.codigo },
      select: { id: true, _count: { select: { actas: true } } },
    });

    const datos = {
      // LECTURA: el documento se referencia, no se gestiona acá. La firma es un atributo
      // aparte y puede acompañar a cualquier tipo.
      tipo: 'LECTURA' as const,
      titulo: c.titulo,
      descripcion: c.descripcion,
      procedimientoOrigen: c.procedimientoOrigen,
      documentoCodigo: c.documentoCodigo,
      documentoNombre: c.documentoNombre,
      exigeFirma: true,
      declaracion: c.declaracion,
      activo: true,
    };

    if (existente === null) {
      await prisma.contenidoSig.create({ data: { codigo: c.codigo, ...datos } });
      creados++;
      continue;
    }

    if (existente._count.actas > 0) {
      intactos++;
      continue;
    }

    await prisma.contenidoSig.update({ where: { codigo: c.codigo }, data: datos });
    actualizados++;
  }

  return { creados, actualizados, intactos };
}
