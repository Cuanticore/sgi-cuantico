// lib/sig/vista-enlace-publico.ts
//
// **REQ-SIG-19 · Task 7 · qué ve quien abre `/firmar/<token>`.**
//
// Es la regla P13 hecha función. La página no decide nada: recibe de acá una de tres vistas y la
// dibuja. Vive separada de la página, y es pura, porque **la única forma de demostrar que los
// cuatro casos malos se ven iguales es comparar dos valores en una prueba**, y eso no se puede
// hacer contra un componente que necesita Postgres para existir.
//
// **P13 · un token que no sirve produce siempre la misma página.** Inexistente, expirado,
// revocado y bloqueado devuelven **el mismo objeto congelado**, no cuatro objetos parecidos: dos
// frases equivalentes escritas en dos ramas terminan distinguiéndose en la primera corrección de
// estilo, y ahí vuelve el oráculo que permite saber si un token adivinado existe.
//
// **La excepción que sí informa** es `USADO`, y la decide `elEstadoSeLeCuentaAlPublico`, que ya
// vive en `lib/sig/enlace-firma.ts`. Acá no se vuelve a decidir: se consulta.
//
// **D-5 · abrir no consume nada.** Esta función no escribe, no cuenta aperturas y no cambia de
// respuesta por haberse llamado antes. Lo que se consume una sola vez es la firma.

import {
  FRASE_ENLACE_NO_DISPONIBLE,
  elEstadoSeLeCuentaAlPublico,
  estadoDelEnlace,
  type EnlaceParaEvaluar,
} from '@/lib/sig/enlace-firma';

/// El documento que se firma, con lo mínimo para leerlo y aceptarlo.
///
/// **P11 · no hay lugar para el área, el cargo, otras tareas ni otros documentos.** No están
/// omitidos en la página: no están en el tipo, así que la página no puede mostrarlos aunque
/// alguien quiera.
export interface DocumentoPublico {
  codigo: string;
  version: number;
  titulo: string;
  /// El texto de la versión vigente: lo que la persona tiene delante y sobre lo que se calcula
  /// la huella del documento al firmar (F3).
  descripcion: string;
  /// **F2 · la declaración se muestra COMPLETA**, igual que en `/mi-sig`. Un enlace a los
  /// términos es la forma estándar de conseguir que nadie los lea.
  declaracion: string;
}

/// Lo que hace falta saber del enlace para armar la vista. Son los cuatro campos de estado que
/// `estadoDelEnlace` evalúa, más el mínimo de P11 y la constancia del acta.
export interface EnlacePublico extends EnlaceParaEvaluar {
  /// **El nombre sí va** (P11): sin él nadie sabe si la solicitud es para él.
  nombre: string;
  documento: DocumentoPublico;
  /// El acta que produjo la firma. Nula mientras no se haya firmado, y también en el caso
  /// —anómalo pero posible mientras `actaId` sea anulable— de un enlace usado cuya acta no se
  /// pudo leer: entonces la constancia dice la fecha y calla el código, en vez de inventarlo.
  acta: { codigo: string; aceptadoEn: Date } | null;
}

/// Lo que se le muestra a quien abrió el enlace. Tres vistas y ninguna más.
export type VistaPublica =
  /// Los cuatro casos malos, indistinguibles entre sí. **Sin nombres, sin código y sin decir
  /// cuál de los cuatro es.**
  | { readonly clase: 'NO_DISPONIBLE'; readonly frase: string }
  /// La única excepción de P13: ya se firmó, y quien vuelve necesita la constancia.
  | { clase: 'FIRMADO'; nombre: string; documento: DocumentoPublico; firmadoEn: Date; acta: string | null }
  /// El enlace sirve: se lee, se acepta y se firma.
  | { clase: 'PARA_FIRMAR'; nombre: string; documento: DocumentoPublico };

/// **La misma página para los cuatro casos malos.** Es una constante y no un literal repetido, y
/// está congelada para que nadie le agregue un campo «sólo para depurar» en una de las ramas.
export const NO_DISPONIBLE: VistaPublica = Object.freeze({
  clase: 'NO_DISPONIBLE' as const,
  frase: FRASE_ENLACE_NO_DISPONIBLE,
});

/// **Qué ve quien abrió el enlace.**
///
/// `enlace === null` es el token que no existe —incluido el token con forma inválida, que no se
/// rechaza antes justamente para que no responda distinto que uno bien formado que no está—.
/// Devuelve la misma constante que el expirado, el revocado y el bloqueado.
export function vistaDelEnlace(enlace: EnlacePublico | null, ahora: Date): VistaPublica {
  if (enlace === null) return NO_DISPONIBLE;

  const estado = estadoDelEnlace(enlace, ahora);

  if (estado === 'VIGENTE') {
    return { clase: 'PARA_FIRMAR', nombre: enlace.nombre, documento: enlace.documento };
  }

  if (elEstadoSeLeCuentaAlPublico(estado)) {
    return {
      clase: 'FIRMADO',
      nombre: enlace.nombre,
      documento: enlace.documento,
      // `usadoEn` no es nulo: es lo que hace que el estado sea `USADO`. La fecha del acta sería
      // la misma, pero la del enlace consta aunque el acta no se haya podido leer.
      firmadoEn: enlace.usadoEn as Date,
      acta: enlace.acta?.codigo ?? null,
    };
  }

  // REVOCADO, BLOQUEADO y EXPIRADO. Los tres describen un fin distinto y a quien atiende un
  // reclamo le importa cuál es —lo ve en la pantalla de gestión, con el código del enlace—; a
  // esta página, no.
  return NO_DISPONIBLE;
}
