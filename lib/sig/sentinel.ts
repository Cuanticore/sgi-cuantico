// lib/sig/sentinel.ts
//
// El módulo puro del espejo de Microsoft Sentinel: todas las decisiones de qué es un
// incidente, cuándo dos filas son «la misma» y cuándo cambió algo viven acá, sin tocar
// Prisma ni la red — el mismo reparto que `lib/sgsi/graph-fallo.ts`/`graph-consulta.ts`, y
// por la misma razón: lo probable no puede importar `@prisma/client`.
//
// `ResultadoSentinel`/`FalloSentinel` viven en `sentinel-fallo.ts`; este archivo los
// importa en una sola dirección para que no aparezca un ciclo.

import { type FalloSentinel, type ResultadoSentinel } from './sentinel-fallo';

/// Consulta KQL contra `SecurityIncident`.
///
/// `arg_max(TimeGenerated, *) by IncidentNumber` es obligatorio: la tabla es append-only
/// (Sentinel escribe una fila nueva por actualización, nunca muta una existente), y sin el
/// `arg_max` el espejo recibiría el historial completo en vez de solo la última fila por
/// incidente.
///
/// **Sin `ago()` a propósito (D11).** La ventana de tiempo va únicamente en el `timespan`
/// del cuerpo de la petición (ver `ventanaDeSincronizacion` y `sentinel-consulta.ts`). Con
/// un predicado de tiempo acá Y el `timespan` en el cuerpo, la ventana más angosta de las
/// dos gana en silencio, y hay dos sitios distintos donde buscar por qué falta una fila.
export const KQL_INCIDENTES = `
SecurityIncident
| summarize arg_max(TimeGenerated, *) by IncidentNumber
| project IncidentNumber, Title, Description, Severity, Status, Classification,
          ClassificationComment, CreatedTime, FirstActivityTime, LastActivityTime,
          ClosedTime, IncidentUrl, Owner, Labels, AlertIds, ProviderName
`.trim();

/// Ventana de tiempo para la sincronización, en ISO-8601 (`timespan` del cuerpo de la
/// petición a Log Analytics — D11).
///
/// **Por qué `P30D` y no una constante fija sin override:** medido contra el workspace
/// real (`law-sentinel-cuantico`), `P1D` devuelve 3 incidentes, `P7D` y `P30D` devuelven
/// los 19 que existen hoy — la tabla retiene 730 días, así que `P30D` no trunca nada del
/// estado actual. Es override-able porque una primera carga contra un tenant con más
/// historial podría necesitar una ventana mayor, y fijarlo en código habría obligado a un
/// deploy nuevo solo para ese primer llenado.
///
/// Es una función y no una constante para que el override quede cubierto por jest sin
/// tener que mockear `process.env`: el cliente de red (`sentinel-consulta.ts`) le pasa
/// `process.env` explícito, nunca lo lee él mismo.
export function ventanaDeSincronizacion(entorno: Record<string, string | undefined>): string {
  const valor = entorno.SENTINEL_TIMESPAN_SINCRONIZACION;
  if (valor === undefined || valor.trim() === '') return 'P30D';
  return valor.trim();
}

/// La forma cruda que devuelve `POST /v1/workspaces/{id}/query`: columnas con nombre y
/// tipo, filas **posicionales**. Cruzar `columns[i].name` contra `rows[n][i]` es
/// obligación de quien lee esto (`aFilas`), no algo que Azure garantice por orden.
export interface RespuestaLogAnalytics {
  tables: {
    name?: string;
    columns: { name: string; type: string }[];
    rows: unknown[][];
  }[];
}

/// La única columna sin la cual no hay clave de upsert. El resto de los campos puede
/// faltar en una respuesta rara sin que eso sea «la tabla no existe» —`normalizarIncidente`
/// los trata como ausentes—, pero sin `IncidentNumber` no hay forma de saber a qué
/// incidente pertenece la fila, y ESO sí es que Sentinel no está onboardeado como se
/// espera.
const COLUMNAS_REQUERIDAS = ['IncidentNumber'];

/// Un incidente del espejo, tal como lo construye este módulo puro. NO es
/// `Prisma.IncidenteSentinel`: `id` y `sincronizadoEn` son metadatos del espejo, opcionales
/// acá, porque una fila recién normalizada desde Sentinel todavía no los tiene.
export interface IncidenteEspejo {
  id?: number;
  numeroIncidente: string;
  titulo: string;
  descripcion: string | null;
  severidadSentinel: string;
  estadoSentinel: string;
  clasificacion: string | null;
  comentarioClasificacion: string | null;
  creadoEnSentinel: Date;
  primeraActividad: Date | null;
  ultimaActividad: Date | null;
  cerradoEnSentinel: Date | null;
  url: string;
  proveedor: string;
  propietarioCorreo: string | null;
  etiquetas: string | null;
  alertas: string | null;
  sincronizadoEn?: Date;
}

/// Traduce la respuesta cruda a un arreglo de objetos, uno por fila, con las claves
/// tomadas de `columns[].name`.
///
/// **Mapea por nombre, no por posición.** Indexar por posición hace que un reordenamiento
/// de columnas en Azure —que no rompe ningún contrato de la API— corra todos los campos un
/// lugar sin que nada falle, ni en jest ni en producción: el defecto sería silencioso.
///
/// Cero filas NO es un fallo: es una respuesta legítima, y el trabajo de sincronización
/// termina exitoso con `creados: 0`.
export function aFilas(
  r: RespuestaLogAnalytics,
): ResultadoSentinel<Record<string, unknown>[]> {
  const tabla = r.tables?.[0];
  if (!tabla || !Array.isArray(tabla.columns) || tabla.columns.length === 0) {
    return {
      ok: false,
      fallo: falloTablaAusente('la respuesta no trae tables ni columnas'),
    };
  }
  const nombresColumnas = tabla.columns.map((c) => c.name);
  const faltantes = COLUMNAS_REQUERIDAS.filter((n) => !nombresColumnas.includes(n));
  if (faltantes.length > 0) {
    return {
      ok: false,
      fallo: falloTablaAusente(`faltan columnas: ${faltantes.join(', ')}`),
    };
  }
  const filas = (tabla.rows ?? []).map((fila) => {
    const objeto: Record<string, unknown> = {};
    tabla.columns.forEach((columna, indice) => {
      objeto[columna.name] = fila[indice];
    });
    return objeto;
  });
  return { ok: true, datos: filas };
}

function falloTablaAusente(detalle: string): FalloSentinel {
  return { causa: 'TABLA_AUSENTE', detalle };
}

/// La clave del upsert. Existe porque Log Analytics devuelve JSON tipado:
/// `IncidentNumber` llega como número (`int`) en la respuesta REST cruda — el CLI de Azure
/// lo muestra entre comillas, pero eso es un espejismo del CLI, no la forma real del dato.
///
/// Si el trabajo normalizara `IncidentNumber` de una forma y la acción de promoción de
/// otra, la clave del upsert se bifurcaría: la misma fila entraría dos veces al espejo con
/// dos identificadores de texto distintos, y los tests seguirían en verde porque cada uno
/// probaría solo su propio lado.
export function claveIncidente(valor: unknown): string {
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'string') return valor.trim();
  return String(valor);
}

/// `Labels` y `AlertIds` son `dynamic` en KQL: la API los devuelve ya parseados —arreglo u
/// objeto—, no como cadena. Este módulo los guarda como texto JSON (`etiquetas`/`alertas`
/// en el espejo), y esta función es el único lugar que decide cómo se convierten, para que
/// el trabajo y cualquier lector futuro coincidan.
///
/// Un arreglo ya parseado y la cadena JSON que lo representa producen el MISMO texto: se
/// re-serializa siempre, en vez de devolver la cadena de entrada tal cual, para que las dos
/// formas de la API no produzcan dos representaciones distintas del mismo dato.
export function aTextoJson(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') {
    try {
      return JSON.stringify(JSON.parse(valor));
    } catch {
      // No era JSON: no debería pasar para Labels/AlertIds, pero se guarda tal cual antes
      // que lanzar por un campo que ya era texto plano.
      return valor;
    }
  }
  return JSON.stringify(valor);
}

/// `Owner` es `dynamic`: puede llegar como objeto ya parseado o como cadena JSON. Las dos
/// formas tienen que dar el mismo correo, y un JSON roto da `null` — nunca lanza — porque
/// el correo del propietario es un dato de conveniencia para la vista, no algo de lo que
/// dependa la sincronización.
export function correoDelPropietario(owner: unknown): string | null {
  if (owner === null || owner === undefined) return null;
  let objeto: unknown = owner;
  if (typeof owner === 'string') {
    try {
      objeto = JSON.parse(owner);
    } catch {
      return null;
    }
  }
  if (typeof objeto !== 'object' || objeto === null) return null;
  const datos = objeto as Record<string, unknown>;
  const correo = datos.email ?? datos.userPrincipalName;
  return typeof correo === 'string' && correo.trim() !== '' ? correo : null;
}

/// O15 · se compone UNA vez, al promover, y nunca se reescribe. Sin descripción, el
/// separador no puede quedar colgando —«Título — »— porque eso se leería como una
/// descripción vacía a propósito, y no lo es: Sentinel simplemente no la trajo.
export function descripcionPromovida(titulo: string, descripcion: string | null): string {
  const desc = descripcion?.trim();
  if (!desc) return titulo.trim();
  return `${titulo.trim()} — ${desc}`;
}

/// D8 · esto SUGIERE, no decide. Un incidente abierto en la bandeja de triage no es lo
/// mismo que un ataque en curso; quien promueve declara `enCurso`, y esta función solo
/// marca la casilla por default para que no empiece en blanco.
export function sugerirEnCurso(estadoSentinel: string): boolean {
  return estadoSentinel !== 'Closed';
}

/// Los campos que decide Sentinel y que el espejo refleja. Deliberadamente NO incluye
/// `numeroIncidente` (es la clave, no un campo que “cambie”) ni `id`/`sincronizadoEn`
/// (metadatos del espejo, no de Sentinel).
function camposDeSentinel(i: IncidenteEspejo) {
  return {
    titulo: i.titulo,
    descripcion: i.descripcion,
    severidadSentinel: i.severidadSentinel,
    estadoSentinel: i.estadoSentinel,
    clasificacion: i.clasificacion,
    comentarioClasificacion: i.comentarioClasificacion,
    creadoEnSentinel: i.creadoEnSentinel.getTime(),
    primeraActividad: i.primeraActividad?.getTime() ?? null,
    ultimaActividad: i.ultimaActividad?.getTime() ?? null,
    cerradoEnSentinel: i.cerradoEnSentinel?.getTime() ?? null,
    url: i.url,
    proveedor: i.proveedor,
    propietarioCorreo: i.propietarioCorreo,
    etiquetas: i.etiquetas,
    alertas: i.alertas,
  };
}

/// Compara el espejo existente contra lo que acaba de llegar de Sentinel y clasifica cada
/// `IncidentNumber` en exactamente uno de tres grupos.
///
/// La comparación es sobre una PROYECCIÓN que excluye `id` y `sincronizadoEn` (ver
/// `camposDeSentinel`): sin excluirlos, toda fila se reportaría «actualizada» para siempre
/// —`sincronizadoEn` cambia en cada corrida por definición— y el criterio de éxito «una
/// corrida sin cambios reporta 0 actualizados» dejaría de poder verificarse nunca.
///
/// Devuelve CLAVES en `sinCambios`, no un conteo: D9 exige refrescar `sincronizadoEn`
/// también en las filas sin cambios, y quien llama necesita saber cuáles son para incluirlas
/// en el `updateMany` final.
export function clasificarSincronizacion(
  existentes: readonly IncidenteEspejo[],
  entrantes: readonly IncidenteEspejo[],
): { nuevos: IncidenteEspejo[]; actualizados: IncidenteEspejo[]; sinCambios: string[] } {
  const porClave = new Map(existentes.map((i) => [i.numeroIncidente, i]));
  const nuevos: IncidenteEspejo[] = [];
  const actualizados: IncidenteEspejo[] = [];
  const sinCambios: string[] = [];

  for (const entrante of entrantes) {
    const previo = porClave.get(entrante.numeroIncidente);
    if (!previo) {
      nuevos.push(entrante);
      continue;
    }
    const igual =
      JSON.stringify(camposDeSentinel(previo)) === JSON.stringify(camposDeSentinel(entrante));
    if (igual) sinCambios.push(entrante.numeroIncidente);
    else actualizados.push(entrante);
  }

  return { nuevos, actualizados, sinCambios };
}

/// Arma un `IncidenteEspejo` a partir de una fila ya mapeada por `aFilas`. `proveedor` es
/// siempre `'Microsoft Sentinel'`: este espejo solo tiene un origen posible, y fijarlo acá
/// evita que un campo ausente en una respuesta futura lo deje en blanco.
export function normalizarIncidente(fila: Record<string, unknown>): IncidenteEspejo {
  return {
    numeroIncidente: claveIncidente(fila.IncidentNumber),
    titulo: String(fila.Title ?? ''),
    descripcion: fila.Description === null || fila.Description === undefined ? null : String(fila.Description),
    severidadSentinel: String(fila.Severity ?? ''),
    estadoSentinel: String(fila.Status ?? ''),
    clasificacion: fila.Classification === null || fila.Classification === undefined ? null : String(fila.Classification),
    comentarioClasificacion:
      fila.ClassificationComment === null || fila.ClassificationComment === undefined
        ? null
        : String(fila.ClassificationComment),
    creadoEnSentinel: aFecha(fila.CreatedTime) ?? new Date(0),
    primeraActividad: aFecha(fila.FirstActivityTime),
    ultimaActividad: aFecha(fila.LastActivityTime),
    cerradoEnSentinel: aFecha(fila.ClosedTime),
    url: String(fila.IncidentUrl ?? ''),
    proveedor: 'Microsoft Sentinel',
    propietarioCorreo: correoDelPropietario(fila.Owner),
    etiquetas: aTextoJson(fila.Labels),
    alertas: aTextoJson(fila.AlertIds),
  };
}

function aFecha(valor: unknown): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const fecha = new Date(valor as string | number | Date);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
