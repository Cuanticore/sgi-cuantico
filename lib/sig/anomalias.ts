// lib/sig/anomalias.ts
//
// **Lo que nadie está mirando**: los cruces entre módulos que no aparecen en ningún
// indicador porque no son de nadie.
//
// Cada uno vive en la frontera entre dos módulos —un activo del inventario y un cargo del
// organigrama, un acceso de Tecnología y una solicitud del SIG, una salida de Talento
// Humano y un acta de borrado— y por eso ninguno tiene dueño: la pantalla de cada módulo
// muestra su mitad y ninguna muestra el hueco. Se calculan solos justamente para que nadie
// tenga que acordarse de mirarlos.
//
// Puro a propósito, como el resto de `lib/sig/`: son reglas que un auditor lee, y se
// prueban sin base de datos. Las consultas viven en `app/sig/estado/page.tsx`.
//
// **`cantidad: null` no es `cantidad: 0`.** Es la regla más fuerte del repositorio y acá es
// la que sostiene el tablero entero: un cero que en realidad era «no se midió» convence de
// que no hay problema justo donde nadie miró. Cuando una fuente no se puede consultar la
// fila se muestra igual, con el motivo escrito, en vez de desaparecer o mentir un cero.
// Es el mismo criterio que `calculable` en `lib/sig/colaboradores.ts`.

import { esDiaPosterior, esDiaPosteriorOIgual } from './fechas';
import {
  activaSinCuenta,
  salioSinActa,
  type ColaboradorBase,
} from './colaboradores';
import { ultimaEvaluacion, type EvaluacionRegistrada } from './organizaciones';

export type ClaveAnomalia =
  | 'ACTIVO_SIN_PROPIETARIO'
  | 'COLABORADOR_SIN_CUENTA'
  | 'ACCESO_SIN_SOLICITUD'
  | 'EXCEPCION_VENCIDA_ABIERTA'
  | 'PROVEEDOR_SIN_EVALUACION'
  | 'SALIDA_SIN_ACTA';

export interface Anomalia {
  clave: ClaveAnomalia;
  /// Cuántos casos hay. `null` cuando NO se pudo medir: ver la cabecera.
  cantidad: number | null;
  /// El hecho, redactado para que se lea pegado al número: «5 activos sin propietario
  /// asignado». Concuerda en número con `cantidad`.
  texto: string;
  /// Dónde vive el problema, con el vocabulario de la navegación.
  donde: string;
  /// Y dónde se resuelve. Ruta real de la aplicación, no del lienzo.
  ruta: string;
  /// Por qué no se pudo medir. `null` cuando sí se midió. Nunca las dos cosas a la vez.
  porQueNo: string | null;
}

// ── Las seis reglas, una función por cruce ────────────────────────────────────────────

export interface ActivoInventariado {
  /// La baja lógica del inventario. Un activo dado de baja no necesita propietario.
  activo: boolean;
  /// El CARGO que responde por el activo. Nulo contra la especificación a propósito: el
  /// libro de origen trae la columna vacía en los 234 activos, y exigirlo en el esquema
  /// habría obligado a inventar un propietario por cada fila en la migración. El hueco es
  /// real y se cuenta acá en vez de taparse.
  propietarioId: number | null;
}

export function activosSinPropietario(activos: readonly ActivoInventariado[]): number {
  return activos.filter((a) => a.activo && a.propietarioId === null).length;
}

export interface AccesoVigencia {
  /// Nulo significa VIGENTE: no hay columna «vigente», se deriva de esta fecha y de hoy.
  hasta: Date | null;
  /// O13 · un acceso vigente sin solicitud que lo respalde es un hallazgo. El esquema lo
  /// permite nulo a propósito: prohibirlo haría invisible el problema en vez de resolverlo.
  solicitudId: number | null;
}

export function accesosVigentesSinSolicitud(
  accesos: readonly AccesoVigencia[],
  hoy: Date,
): number {
  return accesos.filter((a) => estaVigente(a.hasta, hoy) && a.solicitudId === null).length;
}

export interface ExcepcionConCierre {
  /// La fecha en que la excepción DEBÍA cerrarse. Obligatoria en el esquema: una excepción
  /// sin fecha de cierre es una excepción permanente, que es lo que la política prohíbe.
  fechaCierre: Date;
  /// Cuándo se cerró de verdad. Nulo es la excepción que sigue abierta.
  cerradaEn: Date | null;
}

export function excepcionesVencidasSinCerrar(
  excepciones: readonly ExcepcionConCierre[],
  hoy: Date,
): number {
  // Vence al día siguiente, igual que `esVencida` en `lib/sig/cierre.ts`: el día del
  // plazo todavía está en plazo. Dos criterios distintos de «vencido» en la misma
  // aplicación es cómo dos pantallas terminan contando lo mismo distinto.
  return excepciones.filter((e) => e.cerradaEn === null && esDiaPosterior(hoy, e.fechaCierre))
    .length;
}

export interface OrganizacionConActivos {
  /// Sólo las organizaciones que son proveedores: el modelo `Proveedor` guarda también
  /// clientes, entes de control y aliados, y a un cliente no se le exige la reevaluación
  /// de POL-TEC-02.
  esProveedor: boolean;
  activa: boolean;
  /// Cuántos activos del inventario cuelgan de ella. Es lo que convierte la falta de
  /// evaluación en un riesgo y no en un trámite pendiente.
  activosACargo: number;
  evaluaciones: readonly EvaluacionRegistrada[];
}

/// «Sin evaluación» es NUNCA evaluada, no «con la evaluación vencida».
///
/// `lib/sig/organizaciones.ts` distingue `SIN_EVALUAR` de `VENCIDA` justamente porque no
/// son el mismo hecho, y el lienzo pide el primero. Colapsarlas acá inflaría el número con
/// proveedores que sí se evaluaron y se dejaron caducar —que ya tienen su propia alerta en
/// Partes interesadas— y escondería a los que nunca entraron al proceso.
export function proveedoresConActivosSinEvaluacion(
  organizaciones: readonly OrganizacionConActivos[],
): number {
  return organizaciones.filter(
    (o) =>
      o.esProveedor &&
      o.activa &&
      o.activosACargo > 0 &&
      ultimaEvaluacion(o.evaluaciones) === null,
  ).length;
}

/// C1 · toda persona activa tiene cuenta del Directorio; `MANUAL` es la anomalía.
export function colaboradoresActivosSinCuenta(
  personas: readonly ColaboradorBase[],
): number {
  return personas.filter(activaSinCuenta).length;
}

/// FOR-SIG-18 · sin acta, la desvinculación no está completa aunque la persona ya no tenga
/// cuenta. Se reusa el predicado de `colaboradores.ts` en vez de reescribirlo: la lista de
/// colaboradores muestra las mismas salidas, y dos copias de la regla es cómo las dos
/// pantallas terminan dando números distintos del mismo hecho.
export function salidasSinActaDeBorrado(
  personas: readonly ColaboradorBase[],
  conActaDeBorrado: ReadonlySet<number>,
): number {
  return personas.filter((p) => salioSinActa(p, conActaDeBorrado)).length;
}

// ── El tablero ────────────────────────────────────────────────────────────────────────

/// Cada fuente puede llegar en `null`, y eso significa «no se pudo consultar», nunca
/// «está vacía». El tipo obliga a decidirlo en el sitio de la consulta, que es el único
/// lugar que sabe la diferencia.
export interface FuentesDeAnomalias {
  activos: readonly ActivoInventariado[] | null;
  personas: readonly ColaboradorBase[] | null;
  /// Ids con al menos un acta de borrado seguro. `null` si `personas` no se pudo traer:
  /// un conjunto vacío afirmaría que nadie tiene acta.
  conActaDeBorrado: ReadonlySet<number> | null;
  accesos: readonly AccesoVigencia[] | null;
  excepciones: readonly ExcepcionConCierre[] | null;
  organizaciones: readonly OrganizacionConActivos[] | null;
}

interface Declaracion {
  clave: ClaveAnomalia;
  singular: string;
  plural: string;
  donde: string;
  ruta: string;
}

/// El orden es el de la declaración y no el del conteo: una lista que se reordena sola
/// cada vez que un número sube obliga a releerla entera para encontrar la fila de ayer.
const DECLARADAS: readonly Declaracion[] = [
  {
    clave: 'ACTIVO_SIN_PROPIETARIO',
    singular: 'activo sin propietario asignado',
    plural: 'activos sin propietario asignado',
    donde: 'SIG · Activos y Riesgos',
    ruta: '/sgsi/inventario',
  },
  {
    clave: 'COLABORADOR_SIN_CUENTA',
    singular: 'colaborador activo sin cuenta del Directorio',
    plural: 'colaboradores activos sin cuenta del Directorio',
    donde: 'Personas · Colaboradores',
    ruta: '/sig/colaboradores',
  },
  {
    clave: 'ACCESO_SIN_SOLICITUD',
    singular: 'acceso vigente sin solicitud que lo respalde',
    plural: 'accesos vigentes sin solicitud que los respalde',
    donde: 'SIG · Accesos y perfiles',
    ruta: '/sgsi/accesos',
  },
  {
    clave: 'EXCEPCION_VENCIDA_ABIERTA',
    singular: 'excepción de seguridad vencida sin cerrarse',
    plural: 'excepciones de seguridad vencidas sin cerrarse',
    donde: 'Tecnología · Excepciones',
    ruta: '/tecnologia/excepciones',
  },
  {
    clave: 'PROVEEDOR_SIN_EVALUACION',
    singular: 'proveedor con activos a cargo y sin evaluación',
    plural: 'proveedores con activos a cargo y sin evaluación',
    donde: 'Estratégico · Partes interesadas',
    ruta: '/estrategico/partes',
  },
  {
    clave: 'SALIDA_SIN_ACTA',
    singular: 'salida sin acta de borrado seguro FOR-SIG-18',
    plural: 'salidas sin acta de borrado seguro FOR-SIG-18',
    donde: 'Personas · Desvinculación',
    ruta: '/sig/colaboradores',
  },
];

/// Las seis, siempre las seis. Ninguna se omite por no poder medirse: un tablero que
/// muestra cuatro cruces de seis y no dice que faltan dos asegura que el sistema está
/// mejor de lo que se sabe.
export function anomaliasDelSistema(f: FuentesDeAnomalias, hoy: Date): Anomalia[] {
  const medido = new Map<ClaveAnomalia, number | null>([
    [
      'ACTIVO_SIN_PROPIETARIO',
      f.activos === null ? null : activosSinPropietario(f.activos),
    ],
    [
      'COLABORADOR_SIN_CUENTA',
      f.personas === null ? null : colaboradoresActivosSinCuenta(f.personas),
    ],
    [
      'ACCESO_SIN_SOLICITUD',
      f.accesos === null ? null : accesosVigentesSinSolicitud(f.accesos, hoy),
    ],
    [
      'EXCEPCION_VENCIDA_ABIERTA',
      f.excepciones === null ? null : excepcionesVencidasSinCerrar(f.excepciones, hoy),
    ],
    [
      'PROVEEDOR_SIN_EVALUACION',
      f.organizaciones === null ? null : proveedoresConActivosSinEvaluacion(f.organizaciones),
    ],
    [
      'SALIDA_SIN_ACTA',
      // Hacen falta las DOS fuentes: con las personas y sin las actas todo el mundo
      // parecería haber salido sin acta.
      f.personas === null || f.conActaDeBorrado === null
        ? null
        : salidasSinActaDeBorrado(f.personas, f.conActaDeBorrado),
    ],
  ]);

  return DECLARADAS.map((d) => {
    const cantidad = medido.get(d.clave) ?? null;
    return {
      clave: d.clave,
      cantidad,
      texto: cantidad === 1 ? d.singular : d.plural,
      donde: d.donde,
      ruta: d.ruta,
      porQueNo: cantidad === null ? 'la consulta de este cruce no devolvió datos' : null,
    };
  });
}

export interface TotalAnomalias {
  /// La suma de lo que SÍ se midió.
  total: number;
  /// Cuántos cruces no se pudieron medir. El total de arriba no los incluye, y por eso
  /// hay que decirlo: «7 en total» con dos cruces ciegos no es «7 en total».
  sinMedir: number;
}

export function totalDeAnomalias(filas: readonly Anomalia[]): TotalAnomalias {
  return {
    total: filas.reduce((suma, a) => suma + (a.cantidad ?? 0), 0),
    sinMedir: filas.filter((a) => a.cantidad === null).length,
  };
}

// ── Fechas ────────────────────────────────────────────────────────────────────────────

/// Vigente hoy: sin fecha de fin, o con una que todavía no pasó. El día del vencimiento
/// cuenta como vigente, igual que el día del plazo cuenta como en plazo en `cierre.ts`.
function estaVigente(hasta: Date | null, hoy: Date): boolean {
  return hasta === null || esDiaPosteriorOIgual(hasta, hoy);
}
