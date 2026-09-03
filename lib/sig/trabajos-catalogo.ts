// lib/sig/trabajos-catalogo.ts
//
// QUÉ trabajos existen, cuándo corren y cuáles están construidos.
// El CÓMO vive en `trabajos.ts`, que sí toca la base.
//
// Está separado porque es la parte que se puede probar: `trabajos.ts` importa Prisma, y un
// módulo que importa Prisma no se carga en jest. Mismo criterio que el resto de `lib/sig/`:
// si una decisión se puede probar, vive en un módulo puro.

export interface DefinicionTrabajo {
  nombre: string;
  descripcion: string;
  /// Cuándo lo llama el cron. Es documentación: la programación real vive en el crontab del
  /// servidor, igual que `deploy/respaldo-postgres.sh`.
  cuando: string;
  /// `false` cuando el trabajo está declarado pero su implementación todavía no existe. Se
  /// declara igual para que la ruta responda «no construido» (501) en vez de «no existe»
  /// (404): un 404 haría creer que el nombre está mal escrito, y alguien saldría a buscar
  /// el error en el crontab.
  disponible: boolean;
}

/// Los trabajos del documento (docs/handoff_sig/trabajos-programados.md §3).
export const TRABAJOS: DefinicionTrabajo[] = [
  {
    nombre: 'generar-asignaciones',
    descripcion:
      'Abre los periodos que corresponda según cada obligación. T1: es idempotente por ' +
      'diseño —`Asignacion` tiene `@@unique([obligacionId, personaId, periodo])`— así que ' +
      'el cron puede reintentar sin duplicar nada.',
    cuando: 'Diario, 05:00',
    disponible: true,
  },
  {
    nombre: 'marcar-vencidas',
    descripcion:
      'Nada que escribir: el vencimiento es DERIVADO. `esVencida()` lo calcula al leer ' +
      'contra la fecha límite, así que no hay columna que actualizar (invariante 1). La ' +
      'asignación sigue abierta y exigible, que es lo que el documento pide.',
    cuando: 'Diario, 05:10',
    disponible: false,
  },
  {
    // El documento pide TRES trabajos —`avisos-por-vencer`, `correo-semanal` y
    // `correo-mensual`— a tres horas distintas. Van en uno solo, y no por pereza: el núcleo
    // YA decide qué toca hoy con sus propias compuertas de calendario (`horaDeEnvio`,
    // `diaDeSemana === diaSemanal()`, `diaDelMes === diaMensual()`), y esas compuertas son
    // datos parametrizables (invariante 4). Partirlo en tres obligaría a duplicar los
    // mismos gates en tres sitios, y a que el crontab y la base pudieran discrepar sobre
    // qué día es lunes.
    //
    // Consecuencia que hay que aceptar: la hora exacta de cada resumen la manda la
    // configuración, no el crontab. El cron sólo tiene que llamar una vez al día.
    nombre: 'enviar-notificaciones',
    descripcion:
      'Los cinco tipos: NUEVA, PROXIMIDAD y VENCIMIENTO por asignación, más el resumen ' +
      'semanal y el mensual. Cada uno sale sólo el día y la hora que su configuración diga.',
    cuando: 'Diario, 06:00 — el núcleo decide qué toca hoy',
    disponible: true,
  },
  {
    nombre: 'sincronizar-directorio',
    descripcion:
      'Trae altas y bajas de Azure AD. El núcleo está en `sincronizarDirectorio`, todavía ' +
      'detrás de su compuerta de permiso: hay que extraerlo como se hizo con los envíos.',
    cuando: 'Diario, 04:30',
    disponible: false,
  },
  {
    nombre: 'excepciones-vencidas',
    descripcion:
      'Levanta hallazgo por cada excepción que pasó su fecha de cierre sin cerrarse ' +
      '(REQ-SIG-08 · G4). El módulo de desarrollo seguro no está construido.',
    cuando: 'Diario, 05:20',
    disponible: false,
  },
  {
    nombre: 'permisos-temporales-vencidos',
    descripcion:
      'Cierra los accesos temporales cuya vigencia expiró (REQ-SIG-07 · O14). El módulo ' +
      'de Operación del SGSI no está construido.',
    cuando: 'Cada hora',
    disponible: false,
  },
];

export function trabajoPorNombre(nombre: string): DefinicionTrabajo | null {
  return TRABAJOS.find((t) => t.nombre === nombre) ?? null;
}

/// Quién figura en la bitácora cuando corre el cron. No es una persona y no debe parecerlo:
/// un registro firmado por alguien que estaba durmiendo es peor que uno firmado por el
/// sistema, porque el autor de la bitácora es evidencia de auditoría.
export const AUTOR_SISTEMA = 'sistema@cron';
