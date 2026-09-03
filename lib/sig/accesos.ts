// lib/sig/accesos.ts
//
// Accesos y solicitudes del SGSI (REQ-SIG-07 §3.5 y §3.6).
//
// **O12 · un acceso es una relación con vigencia, nunca una casilla que se sobrescribe.**
// La matriz del consultor pone una columna por empleado, así que cada ingreso altera la
// estructura de la tabla y el histórico se pierde al sobrescribir la celda. Acá es una fila
// por relación con fecha de inicio y de fin: dar de alta es insertar, dar de baja es cerrar.
//
// Es la diferencia entre poder responder «quién tenía acceso al CRM el 31 de diciembre» y
// no poder. Y eso es exactamente lo que un auditor pregunta.
//
// Nada de estado se almacena. Ni el de la solicitud ni la vigencia del acceso.

export type EstadoSolicitud = 'POR_AUTORIZAR' | 'AUTORIZADA' | 'EJECUTADA' | 'RECHAZADA';

export interface SolicitudMarcas {
  rechazada: boolean;
  fechaAutorizacion: Date | null;
  fechaEjecucion: Date | null;
}

/// El estado sale de qué marcas están puestas, en este orden.
///
/// El rechazo manda sobre todo lo demás: una solicitud rechazada que además tenga fecha de
/// ejecución es un defecto de datos, y mostrarla como «ejecutada» lo esconde justo donde
/// más importa.
export function estadoDeSolicitud(s: SolicitudMarcas): EstadoSolicitud {
  if (s.rechazada) return 'RECHAZADA';
  if (s.fechaEjecucion !== null) return 'EJECUTADA';
  if (s.fechaAutorizacion !== null) return 'AUTORIZADA';
  return 'POR_AUTORIZAR';
}

export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  POR_AUTORIZAR: 'Por autorizar',
  AUTORIZADA: 'Autorizada',
  EJECUTADA: 'Ejecutada',
  RECHAZADA: 'Rechazada',
};

/// O11 · separación de funciones: **quien autoriza no puede ser quien pide.**
///
/// La única excepción es el cambio de EMERGENCIA, que se autoriza y ejecuta de inmediato
/// para contener un incidente y se documenta después. Devuelve el motivo del rechazo, no un
/// booleano: «no podés autorizar» sin decir por qué manda a alguien a adivinar.
export function puedeAutorizar(
  solicitud: { solicitanteId: number; esEmergencia: boolean; rechazada: boolean; fechaAutorizacion: Date | null },
  quienAutorizaId: number,
): { puede: true } | { puede: false; motivo: string } {
  if (solicitud.rechazada) {
    return { puede: false, motivo: 'la solicitud está rechazada' };
  }
  if (solicitud.fechaAutorizacion !== null) {
    return { puede: false, motivo: 'ya está autorizada' };
  }
  if (solicitud.solicitanteId === quienAutorizaId && !solicitud.esEmergencia) {
    return {
      puede: false,
      motivo:
        'quien autoriza no puede ser quien pide (O11). La única excepción es el cambio de ' +
        'emergencia, y hay que marcarlo como tal',
    };
  }
  return { puede: true };
}

export interface AccesoConVigencia {
  id: number;
  personaId: number;
  perfilId: number;
  desde: Date;
  /// Nulo significa vigente.
  hasta: Date | null;
  solicitudId: number | null;
}

const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/// Si el acceso estaba vigente en una FECHA. La consulta que la matriz de columnas no podía
/// responder.
///
/// El día `hasta` todavía cuenta: el acceso se retira al terminar ese día. Mismo criterio
/// que el retiro de una persona, y por la misma razón — ese día se pudo usar.
export function vigenteEn(a: AccesoConVigencia, fecha: Date): boolean {
  if (dia(a.desde) > dia(fecha)) return false;
  if (a.hasta === null) return true;
  return dia(a.hasta) >= dia(fecha);
}

/// Quién tenía qué acceso ese día.
export function accesosALaFecha(
  accesos: readonly AccesoConVigencia[],
  fecha: Date,
): AccesoConVigencia[] {
  return accesos.filter((a) => vigenteEn(a, fecha));
}

/// O13 · **un acceso vigente sin solicitud que lo respalde es un hallazgo.**
///
/// La revisión trimestral debe explicar por qué existe o retirarlo. Se calcula sobre los
/// VIGENTES: uno ya cerrado sin sustento es historia, y acusarlo hoy no cambia nada — lo
/// que importa es lo que sigue abierto.
export function accesosSinSustento(
  accesos: readonly AccesoConVigencia[],
  hoy: Date,
): AccesoConVigencia[] {
  return accesos.filter((a) => vigenteEn(a, hoy) && a.solicitudId === null);
}

/// O14 · **un permiso temporal se retira solo al vencer.** Los que ya pasaron su fecha y
/// siguen abiertos: son los que el trabajo por hora tiene que cerrar.
///
/// Un acceso con `hasta` en el pasado y sin cerrar NO es lo mismo que uno sin `hasta`: el
/// primero tenía fecha de vencimiento y se pasó, el segundo es permanente por diseño.
export function temporalesVencidos(
  accesos: readonly AccesoConVigencia[],
  hoy: Date,
): AccesoConVigencia[] {
  return accesos.filter((a) => a.hasta !== null && dia(a.hasta) < dia(hoy));
}

/// Los ids de persona con al menos un acceso vigente. Es lo que la lista de Colaboradores
/// necesita para dos de sus cuatro anomalías, que hasta ahora salían en gris.
export function personasConAccesoVigente(
  accesos: readonly AccesoConVigencia[],
  hoy: Date,
): Set<number> {
  return new Set(accesos.filter((a) => vigenteEn(a, hoy)).map((a) => a.personaId));
}

/// `SOL-2026-0088`. El año va en el código porque la numeración se reinicia con él.
export function codigoSolicitud(anio: number, consecutivo: number): string {
  return `SOL-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

export const ETIQUETA_TIPO_SOLICITUD: Record<string, { etiqueta: string; control: string }> = {
  CAMBIO_TI: { etiqueta: 'Cambio de TI', control: 'A.8.32' },
  ACCESO: { etiqueta: 'Alta de acceso', control: 'A.8.2' },
  DEVOLUCION: { etiqueta: 'Devolución de activos', control: 'A.5.11' },
  UTILITARIO: { etiqueta: 'Utilitario', control: 'A.8.18' },
};
