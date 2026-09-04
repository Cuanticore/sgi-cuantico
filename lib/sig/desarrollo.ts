// lib/sig/desarrollo.ts
//
// Ciclo de vida de desarrollo seguro (REQ-SIG-08). Módulo PURO.
//
// **Ninguna de estas funciones bloquea nada** (D17, G3). Todas devuelven un veredicto que
// la pantalla muestra: la aplicación registra y señala, pero no impide guardar ni avanzar.
// El control vive en PRO-TEC-04 y en la gerencia de proyectos, y una herramienta que
// bloquea sin conocer el contexto termina obligando a mentirle.
//
// **Ningún umbral ni plazo está en el código** (G6, G7). Entran como parámetros porque
// cambiar el plazo de remediación de severidad alta no debe requerir un despliegue.

export type Puerta = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
export type ResultadoPuerta = 'PENDIENTE' | 'SUPERADA' | 'SUPERADA_CON_EXCEPCION' | 'NO_SUPERADA';
export type Severidad = 'CRITICOS' | 'ALTOS' | 'MEDIOS' | 'BAJOS';

export const PUERTAS: Puerta[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

/// De más grave a menos. El orden importa: «bloquea desde ALTOS» significa altos Y críticos.
const ORDEN_SEVERIDAD: Severidad[] = ['CRITICOS', 'ALTOS', 'MEDIOS', 'BAJOS'];

const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const DIA_MS = 86_400_000;

// ─── G4 · las excepciones ──────────────────────────────────────────────────────────────

export type EstadoExcepcion = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'CERRADA';

export interface MarcasExcepcion {
  fechaCierre: Date;
  cerradaEn: Date | null;
}

/// **Una excepción es la única forma documentada de avanzar sin cumplir**, así que lo que
/// hay que controlar no es que exista sino que se cierre.
///
/// `VENCIDA` es el estado que importa: la fecha de cierre pasó y nadie la cerró. Es un
/// hallazgo automático, no una alerta que se pueda posponer.
///
/// Cerrada tarde sigue siendo `CERRADA`: el hecho es que ya no está abierta. Que se haya
/// cerrado fuera de plazo se ve comparando las dos fechas, y mezclarlo en el estado haría
/// que una excepción resuelta siguiera apareciendo como pendiente para siempre.
export function estadoDeExcepcion(
  m: MarcasExcepcion,
  hoy: Date,
  diasDeAviso: number,
): EstadoExcepcion {
  if (m.cerradaEn !== null) return 'CERRADA';
  if (dia(m.fechaCierre) < dia(hoy)) return 'VENCIDA';
  if (dia(m.fechaCierre) - dia(hoy) <= diasDeAviso * DIA_MS) return 'POR_VENCER';
  return 'VIGENTE';
}

/// Los días que faltan para el cierre, negativos si ya pasó. Es lo que la pantalla pone al
/// lado de cada excepción: «faltan 12 días» y «vencida hace 40» son dos conversaciones
/// distintas y un solo número las dice.
export function diasHastaCierre(fechaCierre: Date, hoy: Date): number {
  return Math.round((dia(fechaCierre) - dia(hoy)) / DIA_MS);
}

export interface DatosExcepcion {
  justificacion: string;
  evaluacionRiesgo: string;
  fechaAprobacion: Date | null;
  fechaCierre: Date | null;
}

/// G4 · **sin fecha de cierre no se guarda.** Una excepción sin fecha de cierre es una
/// exención permanente disfrazada, y ése es exactamente el defecto que esta entidad existe
/// para evitar.
export function validarExcepcion(d: DatosExcepcion): string[] {
  const errores: string[] = [];
  if (d.justificacion.trim().length < 15) {
    errores.push('La justificación es obligatoria: es lo que un auditor va a leer primero');
  }
  if (d.evaluacionRiesgo.trim().length < 15) {
    errores.push('Falta la evaluación de riesgo: avanzar sin cumplir exige decir qué se arriesga');
  }
  if (d.fechaAprobacion === null) errores.push('Falta la fecha de aprobación');
  if (d.fechaCierre === null) {
    errores.push(
      'La fecha de cierre es OBLIGATORIA: una excepción sin ella es una exención permanente disfrazada',
    );
  } else if (d.fechaAprobacion !== null && dia(d.fechaCierre) < dia(d.fechaAprobacion)) {
    errores.push('La excepción cerraría antes de aprobarse');
  }
  return errores;
}

/// `EXC-2026-007`.
export function codigoExcepcion(anio: number, consecutivo: number): string {
  return `EXC-${anio}-${String(consecutivo).padStart(3, '0')}`;
}

// ─── G5 · las puertas ──────────────────────────────────────────────────────────────────

/// G5 · **quien verifica no es quien autoriza.** El procedimiento asigna esas dos
/// autoridades a roles distintos, y una sola persona haciendo las dos cosas deja la puerta
/// sin la separación que le da valor.
///
/// G3 · el resultado `NO_SUPERADA` se acepta sin protestar: **registrar P4 como no superada
/// no impide registrar P5.** La aplicación lo señala y sigue.
export function validarPuerta(d: {
  resultado: ResultadoPuerta;
  verificadoPorId: number | null;
  autorizaId: number | null;
  excepcionId: number | null;
}): string[] {
  const errores: string[] = [];
  if (d.resultado === 'PENDIENTE') return errores;
  if (d.verificadoPorId === null) errores.push('Falta quién verificó');
  if (d.autorizaId === null) errores.push('Falta quién autoriza');
  if (
    d.verificadoPorId !== null &&
    d.autorizaId !== null &&
    d.verificadoPorId === d.autorizaId
  ) {
    errores.push(
      'Quien verifica no puede ser quien autoriza: el procedimiento asigna esas dos autoridades a roles distintos',
    );
  }
  if (d.resultado === 'SUPERADA_CON_EXCEPCION' && d.excepcionId === null) {
    errores.push('«Superada con excepción» necesita la excepción: sin ella es sólo «no superada»');
  }
  return errores;
}

export interface EstadoPuertas {
  superadas: number;
  conExcepcion: number;
  noSuperadas: number;
  pendientes: number;
  /// El texto del tablero: «4 de 6». No cuenta las que tienen excepción como superadas
  /// limpias — se dicen aparte, porque avanzar con excepción y avanzar cumpliendo no son
  /// lo mismo y sumarlas borraría la diferencia.
  resumen: string;
}

export function resumirPuertas(
  puertas: readonly { puerta: Puerta; resultado: ResultadoPuerta }[],
): EstadoPuertas {
  const cuenta = (r: ResultadoPuerta) => puertas.filter((p) => p.resultado === r).length;
  const superadas = cuenta('SUPERADA');
  const conExcepcion = cuenta('SUPERADA_CON_EXCEPCION');
  const noSuperadas = cuenta('NO_SUPERADA');
  return {
    superadas,
    conExcepcion,
    noSuperadas,
    pendientes: PUERTAS.length - superadas - conExcepcion - noSuperadas,
    resumen:
      conExcepcion === 0
        ? `${superadas} de ${PUERTAS.length}`
        : `${superadas} de ${PUERTAS.length} · ${conExcepcion} con excepción`,
  };
}

/// G11 · **cerrar la hoja de vida exige P6.** El retiro no está completo sin migración o
/// eliminación segura, revocación de accesos y credenciales, baja de componentes y salida
/// del inventario, del monitoreo y del respaldo — y P6 es donde eso se verifica.
///
/// Ésta es la ÚNICA regla del módulo que sí impide una operación, y no contradice a D17:
/// D17 dice que una puerta no superada no impide AVANZAR de fase. Cerrar la hoja de vida no
/// es avanzar: es declarar que el sistema salió, y declararlo sin haber verificado la
/// salida es afirmar algo que nadie comprobó.
export function puedeCerrarHojaDeVida(
  puertas: readonly { puerta: Puerta; resultado: ResultadoPuerta }[],
): { puede: true } | { puede: false; motivo: string } {
  const p6 = puertas.find((p) => p.puerta === 'P6');
  if (p6 === undefined || p6.resultado === 'PENDIENTE') {
    return {
      puede: false,
      motivo:
        'P6 no está registrada. Cerrar la hoja de vida sin verificar el retiro es afirmar que el sistema salió sin que nadie lo haya comprobado',
    };
  }
  return { puede: true };
}

// ─── G6 · el veredicto de las pruebas ──────────────────────────────────────────────────

export interface Conteos {
  criticos: number;
  altos: number;
  medios: number;
  bajos: number;
}

export type Veredicto = 'BLOQUEA' | 'BLOQUEA_SALVO_EXCEPCION' | 'NO_BLOQUEA';

/// G6 · **los cuatro conteos se capturan; el veredicto se calcula.**
///
/// `desde` es el parámetro `desarrollo_severidad_bloquea`, no un número en el código: la
/// organización puede endurecerlo o aflojarlo sin desplegar, y la decisión queda con fecha
/// en la tabla de parámetros en vez de enterrada en un commit.
export function veredictoDePrueba(
  c: Conteos,
  desde: Severidad,
  tieneExcepcion: boolean,
): Veredicto {
  const corte = ORDEN_SEVERIDAD.indexOf(desde);
  const cuantos = [c.criticos, c.altos, c.medios, c.bajos];
  // Todo lo de severidad `desde` o PEOR. «Bloquea desde ALTOS» incluye los críticos.
  const bloqueantes = cuantos.slice(0, corte + 1).reduce((a, b) => a + b, 0);
  if (bloqueantes === 0) return 'NO_BLOQUEA';
  return tieneExcepcion ? 'BLOQUEA_SALVO_EXCEPCION' : 'BLOQUEA';
}

export interface PlazosRemediacion {
  criticaHoras: number;
  altaDias: number;
  mediaDias: number;
  /// Cero significa «sin plazo en días»: FOR-LCO-05 dice «siguiente entrega planificada»,
  /// que no es un número. Poner 90 o 180 sería inventar un plazo que el formato no fijó.
  bajaDias: number;
}

/// G7 · la fecha límite de remediación. **Corre desde la NOTIFICACIÓN, no desde el
/// hallazgo**: son dos momentos distintos y contar desde el equivocado regala o roba días.
///
/// Devuelve `null` en las de severidad baja sin plazo fijado, y `null` significa «sin plazo
/// en días», no «vencida»: la pantalla lo dice con palabras.
export function fechaLimiteRemediacion(
  severidad: Severidad,
  notificadaEn: Date,
  plazos: PlazosRemediacion,
): Date | null {
  const r = new Date(notificadaEn);
  switch (severidad) {
    case 'CRITICOS':
      r.setUTCHours(r.getUTCHours() + plazos.criticaHoras);
      return r;
    case 'ALTOS':
      r.setUTCDate(r.getUTCDate() + plazos.altaDias);
      return r;
    case 'MEDIOS':
      r.setUTCDate(r.getUTCDate() + plazos.mediaDias);
      return r;
    default:
      if (plazos.bajaDias <= 0) return null;
      r.setUTCDate(r.getUTCDate() + plazos.bajaDias);
      return r;
  }
}

// ─── Completitud de la hoja de vida ────────────────────────────────────────────────────

export interface HojaDeVida {
  trataDatosPersonales: boolean;
  tratamientos: number;
  requisitos: number;
  pruebas: number;
  componentes: number;
  rtoObjetivo: number | null;
  rpoObjetivo: number | null;
  criticidad: number | null;
  activoId: number | null;
}

/// Lo que le falta a la hoja de vida para estar completa. **Señala; no impide guardar.**
///
/// El primer faltante es el que más pesa: un sistema que declara tratar datos personales y
/// no tiene registro de tratamiento es el bloque con mayor exposición legal del paquete
/// (Ley 1581) incumplido en silencio.
export function faltantesDeHojaDeVida(h: HojaDeVida): string[] {
  const faltantes: string[] = [];
  if (h.trataDatosPersonales && h.tratamientos === 0) {
    faltantes.push(
      'declara que trata datos personales y no tiene registro de tratamiento (Ley 1581)',
    );
  }
  if (h.activoId === null) {
    // El ítem 50 lo exige: un sistema que no está en el inventario no tiene riesgos
    // apreciados, no entra en las verificaciones por activo y no sale en el mapa.
    faltantes.push('no está enlazado a un activo del inventario (ítem 50)');
  }
  if (h.rtoObjetivo === null || h.rpoObjetivo === null) {
    faltantes.push('sin RTO o RPO objetivo, que son el insumo del BIA anual');
  }
  if (h.criticidad === null) faltantes.push('sin criticidad');
  if (h.requisitos === 0) faltantes.push('sin requisitos de seguridad');
  if (h.pruebas === 0) faltantes.push('sin pruebas de seguridad');
  if (h.componentes === 0) faltantes.push('sin componentes de terceros declarados (SBOM)');
  return faltantes;
}

export const ETIQUETA_PUERTA: Record<Puerta, string> = {
  P1: 'P1 · Requisitos',
  P2: 'P2 · Diseño',
  P3: 'P3 · Pre-integración',
  P4: 'P4 · Pruebas de seguridad',
  P5: 'P5 · Paso a producción',
  P6: 'P6 · Retiro',
};

export const ETIQUETA_RESULTADO_PUERTA: Record<ResultadoPuerta, string> = {
  PENDIENTE: 'Pendiente',
  SUPERADA: 'Superada',
  SUPERADA_CON_EXCEPCION: 'Con excepción',
  NO_SUPERADA: 'No superada',
};

export const ETIQUETA_ESTADO_EXCEPCION: Record<EstadoExcepcion, string> = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
  CERRADA: 'Cerrada',
};
