// lib/sgsi/licencias.ts
//
// **Qué decir de las licencias de una persona y de las del tenant** (REQ-SIG-15 §3.2).
//
// Puro y sin red, por la misma razón que `graph-usuario.ts` y `graph-fallo.ts`: acá viven las
// decisiones —cómo se nombra un SKU, cuándo una licencia es una anomalía, cuántos puestos
// quedan libres— y una decisión que sólo se puede comprobar saliendo a internet termina sin
// comprobarse. `graph-licencias.ts` hace las dos llamadas y no decide nada.
//
// ── Las tres reglas que este módulo sostiene ──────────────────────────────────────────────
//
// **P6 · el nombre comercial no se inventa en el código.** Ni `SPE_E3` ni `ENTERPRISEPACK` le
// dicen nada a quien abre el popup, pero un `Record<string, string>` en el fuente obliga a
// desplegar el día que la organización compre un producto nuevo — y hasta ese día la pantalla
// muestra el código crudo igual. El nombre entra por la tabla de parámetros, editable sin
// despliegue. **Y el código crudo se sigue mostrando al lado**: es lo que hay que teclear en el
// portal de Microsoft, y es la única forma de reconocer un SKU que todavía no está
// parametrizado.
//
// **P7 · los tres cruces que el portal de Microsoft no puede hacer.** El portal sabe qué
// licencia tiene cada cuenta; no sabe quién salió de la organización ni a quién se le está
// exigiendo una tarea. Ese cruce es todo lo que esta pestaña aporta sin escribir nada.
//
// **P8 · una lista vacía y un 403 no se ven igual nunca.** Por eso cada consulta conserva su
// `ResultadoGraph` hasta la pantalla y nunca se colapsa en un arreglo: un arreglo vacío
// respondería «no tiene licencias» a una pregunta que no se pudo hacer. `estadoDeConsulta`
// existe para que la pantalla tenga que elegir entre los tres casos, y no entre dos.

import type { ResultadoGraph } from '@/lib/sgsi/graph-fallo';

// ── Lo que Graph devuelve ─────────────────────────────────────────────────────────────────
//
// Todo opcional, como en `UsuarioDeGraph`: Graph omite campos en varios escenarios y un tipo
// que los exige convierte una respuesta incompleta en una excepción en vez de en un renglón
// que se puede mostrar.

export interface PlanDeServicioDeGraph {
  servicePlanId?: string;
  servicePlanName?: string;
  /// `Success`, `Disabled`, `PendingInput`, `PendingActivation`, `PendingProvisioning`.
  provisioningStatus?: string;
  appliesTo?: string;
}

/// Una entrada de `GET /users/{oid}/licenseDetails`.
///
/// **P5 · `licenseDetails` y NO `assignedLicenses`.** Los dos responden «qué licencia tiene»,
/// y `assignedLicenses` viene gratis en el objeto del usuario, pero devuelve sólo `skuId` en
/// forma de GUID. La diferencia práctica es entre una pantalla que dice `SPE_E3` y una que
/// dice `6fd2c87f-b296-42f0-b197-1e91e994b900`, y entre mantener una tabla de GUID que
/// envejece en silencio o no tener que mantenerla.
export interface LicenciaDeGraph {
  id?: string;
  skuId?: string;
  skuPartNumber?: string;
  servicePlans?: PlanDeServicioDeGraph[];
}

/// Una entrada de `GET /subscribedSkus`.
export interface SkuDeGraph {
  skuId?: string;
  skuPartNumber?: string;
  capabilityStatus?: string;
  consumedUnits?: number;
  prepaidUnits?: { enabled?: number; suspended?: number; warning?: number };
}

// ── P6 · el nombre comercial, desde la tabla de parámetros ────────────────────────────────

/// Todas las claves de `Parametro` que nombran un SKU empiezan así. Un prefijo y no una tabla
/// propia: son pares clave/valor y el módulo de parámetros ya los edita sin despliegue, que es
/// exactamente lo que P6 pide.
export const PREFIJO_PARAMETRO_SKU = 'licencia_sku_';

/// El código del SKU, normalizado. Microsoft los publica en mayúsculas (`SPE_E3`), pero la
/// respuesta de Graph es la que manda y compararla sin normalizar haría que `spe_e3` y
/// `SPE_E3` fueran dos productos distintos en la misma pantalla.
function normalizar(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/// La clave de parámetro que nombra a un SKU. En minúsculas, como el resto de las claves de
/// la tabla (`umbral_valoracion`, `zona_horaria`).
export function claveDeSku(codigo: string): string {
  return PREFIJO_PARAMETRO_SKU + normalizar(codigo).toLowerCase();
}

/// Las filas de `Parametro` convertidas en la tabla de consulta. Las que no llevan el prefijo
/// se ignoran: la tabla es un almacén compartido y `zona_horaria` no es un SKU.
///
/// Un valor en blanco se descarta en vez de guardarse como nombre: un parámetro que alguien
/// vació por error mostraría un renglón sin nombre y sin código, y el código es el dato que
/// nunca se puede perder.
export function nombresComerciales(
  filas: readonly { clave: string; valor: string }[],
): Map<string, string> {
  const tabla = new Map<string, string>();
  for (const f of filas) {
    if (!f.clave.startsWith(PREFIJO_PARAMETRO_SKU)) continue;
    const codigo = normalizar(f.clave.slice(PREFIJO_PARAMETRO_SKU.length));
    const nombre = f.valor.trim();
    if (codigo === '' || nombre === '') continue;
    tabla.set(codigo, nombre);
  }
  return tabla;
}

/// El nombre de un SKU tal como se muestra: el comercial si está parametrizado, y **siempre**
/// el código crudo.
export interface NombreDeSku {
  codigo: string;
  /// `null` cuando nadie lo parametrizó todavía. No se rellena con el código: la pantalla
  /// tiene que poder distinguir «se llama así» de «nadie le puso nombre», que es la señal de
  /// que la organización compró un producto nuevo.
  comercial: string | null;
}

export function nombreDeSku(codigo: string, comerciales: ReadonlyMap<string, string>): NombreDeSku {
  const normalizado = normalizar(codigo);
  return { codigo: normalizado, comercial: comerciales.get(normalizado) ?? null };
}

/// «Microsoft 365 E3 · SPE_E3», o «SPE_E3» a secas. El código nunca se va.
export function etiquetaDeSku(n: NombreDeSku): string {
  return n.comercial === null ? n.codigo : `${n.comercial} · ${n.codigo}`;
}

// ── P7.1 · el inventario de software por persona (A.5.9) ──────────────────────────────────

/// Una licencia de la persona, lista para mostrar.
///
/// Los servicios se parten en dos listas y no en una con una marca: la pregunta que A.5.9
/// contesta es «qué software usa esta persona», y un servicio deshabilitado no es software que
/// use. Mezclados en una sola lista, el inventario incluiría lo que la licencia trae apagado.
export interface RenglonInventario {
  codigo: string;
  comercial: string | null;
  serviciosHabilitados: string[];
  serviciosDeshabilitados: string[];
}

/// Un plan cuenta como habilitado salvo que Graph diga explícitamente `Disabled`.
///
/// Los ausentes se aceptan, igual que en `esColaboradorDeLaOrganizacion`: un
/// `provisioningStatus` que no vino no es un «no», y el error caro acá es dejar fuera del
/// inventario software que la persona sí tiene.
function estaHabilitado(p: PlanDeServicioDeGraph): boolean {
  return p.provisioningStatus !== 'Disabled';
}

export function inventarioDeSoftware(
  licencias: readonly LicenciaDeGraph[],
  comerciales: ReadonlyMap<string, string>,
): RenglonInventario[] {
  return licencias
    .filter((l) => (l.skuPartNumber ?? '').trim() !== '')
    .map((l) => {
      const nombre = nombreDeSku(l.skuPartNumber as string, comerciales);
      const planes = l.servicePlans ?? [];
      const nombrar = (p: PlanDeServicioDeGraph) => (p.servicePlanName ?? '').trim();
      return {
        codigo: nombre.codigo,
        comercial: nombre.comercial,
        serviciosHabilitados: planes.filter(estaHabilitado).map(nombrar).filter(Boolean).sort(),
        serviciosDeshabilitados: planes
          .filter((p) => !estaHabilitado(p))
          .map(nombrar)
          .filter(Boolean)
          .sort(),
      };
    })
    .sort((a, b) => etiquetaDeSku(a).localeCompare(etiquetaDeSku(b), 'es'));
}

// ── P7.2 y P7.3 · los dos cruces que el portal no puede hacer ─────────────────────────────

export type Anomalia =
  /// Plata quemada, y a la vez el indicio de una cuenta que debía estar cerrada y sigue
  /// ocupando un puesto. El portal no lo puede ver: no sabe quién salió de la organización.
  | { clase: 'LICENCIA_EN_CUENTA_INACTIVA'; codigos: string[] }
  /// Alguien a quien se le está exigiendo algo que no puede cumplir.
  | { clase: 'SIN_LICENCIA_CON_TAREAS'; pendientes: number };

export interface EstadoDeLaPersona {
  /// Espejo del Directorio: `false` es cuenta bloqueada o persona que salió.
  activa: boolean;
  /// Asignaciones en estado PENDIENTE.
  pendientes: number;
}

/// Los dos cruces, sobre el inventario ya armado.
///
/// **«Sin licencia con tareas» sólo se levanta para una cuenta activa.** A una persona inactiva
/// no tener licencia es lo esperado; lo que ahí hay que mirar son los pendientes que le
/// quedaron abiertos, y de eso responde el panel de reasignación, no esta pestaña. Levantarlo
/// igual pondría un renglón rojo en cada persona que salió de la organización, y una lista de
/// anomalías que siempre tiene renglones es una lista que nadie lee.
export function anomaliasDeLicencia(
  renglones: readonly RenglonInventario[],
  estado: EstadoDeLaPersona,
): Anomalia[] {
  const anomalias: Anomalia[] = [];
  if (!estado.activa && renglones.length > 0) {
    anomalias.push({
      clase: 'LICENCIA_EN_CUENTA_INACTIVA',
      codigos: renglones.map((r) => r.codigo),
    });
  }
  if (estado.activa && renglones.length === 0 && estado.pendientes > 0) {
    anomalias.push({ clase: 'SIN_LICENCIA_CON_TAREAS', pendientes: estado.pendientes });
  }
  return anomalias;
}

/// La frase que ve una persona: qué se encontró y qué hacer, en ese orden.
export function explicarAnomalia(a: Anomalia): string {
  switch (a.clase) {
    case 'LICENCIA_EN_CUENTA_INACTIVA':
      return (
        `La cuenta está inactiva y conserva ${a.codigos.length} licencia(s): ` +
        `${a.codigos.join(', ')}. Es costo que se sigue pagando, y también el indicio de una ` +
        'cuenta que debía estar cerrada. Se retiran en el portal de Microsoft.'
      );
    case 'SIN_LICENCIA_CON_TAREAS':
      return (
        `No tiene ninguna licencia y tiene ${a.pendientes} tarea(s) pendiente(s): se le está ` +
        'exigiendo algo que no puede cumplir. O se le asigna la licencia en el portal, o las ' +
        'tareas se reasignan.'
      );
  }
}

// ── El resumen del tenant ─────────────────────────────────────────────────────────────────

export interface ResumenSku {
  codigo: string;
  comercial: string | null;
  /// `prepaidUnits.enabled`: los puestos que la organización paga.
  contratadas: number;
  /// `consumedUnits`: los puestos asignados.
  enUso: number;
  /// Nunca negativo. Cuando hay más asignadas que contratadas, «libres» no es un número
  /// negativo: es cero, y lo que hay que decir es el sobrante.
  libres: number;
  sobreasignado: boolean;
}

function entero(v: number | undefined): number {
  return Number.isFinite(v) && (v as number) > 0 ? Math.trunc(v as number) : 0;
}

export function resumirSkus(
  skus: readonly SkuDeGraph[],
  comerciales: ReadonlyMap<string, string>,
): ResumenSku[] {
  return skus
    .filter((s) => (s.skuPartNumber ?? '').trim() !== '')
    .map((s) => {
      const nombre = nombreDeSku(s.skuPartNumber as string, comerciales);
      const contratadas = entero(s.prepaidUnits?.enabled);
      const enUso = entero(s.consumedUnits);
      return {
        codigo: nombre.codigo,
        comercial: nombre.comercial,
        contratadas,
        enUso,
        libres: Math.max(0, contratadas - enUso),
        sobreasignado: enUso > contratadas,
      };
    })
    .sort((a, b) => etiquetaDeSku(a).localeCompare(etiquetaDeSku(b), 'es'));
}

/// «12 de 25 en uso · 13 libres».
///
/// Sobreasignado se dice distinto y no con un negativo: «−2 libres» es una resta que quien lee
/// tiene que interpretar, y lo que hay que hacer con ese renglón —comprar puestos o liberar
/// asignaciones— no se deduce de un signo menos.
export function fraseDelSku(r: ResumenSku): string {
  if (r.sobreasignado) {
    return `${r.enUso} de ${r.contratadas} en uso · ${r.enUso - r.contratadas} por encima de lo contratado`;
  }
  return `${r.enUso} de ${r.contratadas} en uso · ${r.libres} libres`;
}

// ── P8 · lo que la pantalla recibe, con las dos consultas separadas ───────────────────────

/// El resultado de la consulta de la persona. Va junto porque las anomalías **sólo se pueden
/// afirmar si la lista se pudo leer**: sin ella, «no tiene licencia y tiene tareas» sería una
/// conclusión sacada de una pregunta sin responder. Que vivan dentro del mismo `datos` es lo
/// que impide calcularlas en la rama equivocada.
export interface InventarioDePersona {
  renglones: RenglonInventario[];
  anomalias: Anomalia[];
}

/// **Las dos consultas, cada una con su propio resultado.**
///
/// No hay un `ok` único ni un `fallo` único, y es deliberado: si `/subscribedSkus` responde 403
/// y `/users/{oid}/licenseDetails` responde bien, la lista de la persona se muestra igual y lo
/// único que falta es el contexto del tenant, dicho con el nombre del recurso y del permiso.
/// Degradar las dos porque una falló pierde información que sí se tiene.
export interface LicenciasDeLaPantalla {
  persona: ResultadoGraph<InventarioDePersona>;
  tenant: ResultadoGraph<ResumenSku[]>;
}

/// Los tres estados en los que puede estar una consulta, que es lo que la pantalla tiene que
/// distinguir. Existe para que no se pueda escribir `if (lista.length === 0)`: ese `if`
/// contesta «no tiene licencias» a una pregunta que quizá nunca se pudo hacer.
export type EstadoDeConsulta = 'CON_DATOS' | 'VACIA' | 'NO_SE_PUDO_PREGUNTAR';

export function estadoDeConsulta<T>(
  r: ResultadoGraph<T>,
  cuantos: (datos: T) => number,
): EstadoDeConsulta {
  if (!r.ok) return 'NO_SE_PUDO_PREGUNTAR';
  return cuantos(r.datos) === 0 ? 'VACIA' : 'CON_DATOS';
}
