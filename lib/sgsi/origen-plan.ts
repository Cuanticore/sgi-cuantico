// lib/sgsi/origen-plan.ts
//
// REQ-SIG-20 §7.2 (D-4, D4, tarea 4.9) · el prefijo verificable de `AccionPlan.origen`.
//
// La unidad del plan sigue siendo el CONTROL — `AccionPlan.controlId` no cambia —, pero un
// plan nacido del popup de residual crítico (tarea 4.12) tiene que poder responder «¿este
// plan cubre este riesgo?» sin volver a pedirle el dato a nadie. `origen` ya es texto libre
// en el esquema (la 6.1.3 lo exige como justificación) y no se agrega ninguna columna — el
// diseño lo prohíbe explícitamente («no new tables/columns allowed», D4) —, así que el
// origen NACE con un prefijo máquina-verificable seguido de la narrativa humana:
//
//   origen:v1|R-0123|TEC-GEN-0004|A.24 · <justificación legible>
//
// `lib/sgsi/deuda-planes.ts` (tarea 4.10-4.11) es el único consumidor de `parsearOrigen`:
// compara `activoCodigo`/`amenazaCodigo` contra los del riesgo en banda Crítico para decidir
// si ya existe un plan que lo cubre. Un `AccionPlan.origen` SIN el prefijo — como los
// generados por `crearAccionDesdeControl`, «Agregada desde Controles y madurez…» — no es un
// error: es simplemente un plan cuyo origen no se puede verificar por máquina, y
// `parsearOrigen` devuelve `null` para que el llamador lo trate como «no es un match»,
// nunca como un dato roto.

/// El campo `riesgoCodigo` viaja en el prefijo aunque `deuda-planes.ts` compare por
/// `activoCodigo`/`amenazaCodigo`: es la referencia más específica para un auditor que lee
/// el campo `origen` tal cual, y sobrevive aunque el par (activo, amenaza) se reescriba en
/// una futura versión del formato.
export interface OrigenPlan {
  version: 'v1';
  riesgoCodigo: string;
  activoCodigo: string;
  amenazaCodigo: string;
  /// La narrativa humana después del « · ». Nunca vacía: `formatearOrigen` la exige.
  justificacion: string;
}

const PREFIJO = 'origen:v1';
const SEPARADOR_CAMPO = '|';
const SEPARADOR_NARRATIVA = ' · ';

/// Arma el prefijo verificable + la narrativa humana. `justificacion` es obligatoria: un
/// origen sin texto legible sería un prefijo que nadie sabe leer sin volver a la base.
export function formatearOrigen(
  riesgoCodigo: string,
  activoCodigo: string,
  amenazaCodigo: string,
  justificacion: string,
): string {
  const texto = justificacion.trim();
  if (texto === '') {
    throw new Error('El origen necesita una justificación legible después del prefijo.');
  }
  return [PREFIJO, riesgoCodigo, activoCodigo, amenazaCodigo].join(SEPARADOR_CAMPO) +
    SEPARADOR_NARRATIVA +
    texto;
}

/// Separa `texto` en como máximo `n` partes usando `sep`, sin perder ningún `sep` que
/// aparezca DENTRO de la última parte — a diferencia de `String.prototype.split(sep, limit)`,
/// que primero parte en TODAS las ocurrencias y recién después trunca, perdiendo lo que
/// quedaba después del límite. La narrativa humana puede contener `|` o ` · ` sin romper el
/// round-trip porque solo los primeros `n - 1` separadores importan.
function partirN(texto: string, sep: string, n: number): string[] | null {
  const partes: string[] = [];
  let resto = texto;
  for (let i = 0; i < n - 1; i++) {
    const idx = resto.indexOf(sep);
    if (idx < 0) return null;
    partes.push(resto.slice(0, idx));
    resto = resto.slice(idx + sep.length);
  }
  partes.push(resto);
  return partes;
}

/// Round-trip de `formatearOrigen`. `null` — nunca una excepción — para un `origen` que no
/// trae el prefijo: es el caso normal de un plan preexistente o creado por otro camino
/// (`crearAccionDesdeControl`), no un dato corrupto.
export function parsearOrigen(texto: string): OrigenPlan | null {
  if (!texto.startsWith(`${PREFIJO}${SEPARADOR_CAMPO}`)) return null;

  const resto = texto.slice(PREFIJO.length + SEPARADOR_CAMPO.length);
  const campos = partirN(resto, SEPARADOR_CAMPO, 3);
  if (!campos) return null;
  const [riesgoCodigo, activoCodigo, cola] = campos;

  const narrativa = partirN(cola, SEPARADOR_NARRATIVA, 2);
  if (!narrativa) return null;
  const [amenazaCodigo, justificacion] = narrativa;

  if (riesgoCodigo === '' || activoCodigo === '' || amenazaCodigo === '' || justificacion === '') {
    return null;
  }

  return { version: 'v1', riesgoCodigo, activoCodigo, amenazaCodigo, justificacion };
}

/// Si un `AccionPlan.origen` ya parseado cubre el riesgo dado. `lib/sgsi/deuda-planes.ts` es
/// quien la usa para decidir si un plan activo ya responde por un riesgo en banda Crítico.
export function origenCubreRiesgo(
  origen: OrigenPlan,
  riesgo: { activoCodigo: string; amenazaCodigo: string },
): boolean {
  return origen.activoCodigo === riesgo.activoCodigo && origen.amenazaCodigo === riesgo.amenazaCodigo;
}

/// La narrativa humana del origen de un plan nacido desde la ficha del activo.
///
/// ── POR QUÉ DEJÓ DE SER UNA CADENA FIJA ─────────────────────────────────────────────────
///
/// Decía «Residual crítico de …» siempre, porque el plan sólo se podía crear desde un
/// residual en banda Crítico. Al abrir el registro a cualquier banda, esa frase se convierte
/// en una afirmación falsa escrita en el campo que un auditor lee tal cual — y `origen` es
/// justamente el campo que ISO/IEC 27001 6.1.3 pide para justificar por qué existe la acción.
/// Un plan sobre un riesgo Bajo que dice «Residual crítico» es peor que uno sin narrativa.
///
/// `null` es «sin calcular», y se dice así en vez de omitirse: un plan creado sobre un riesgo
/// cuyo residual nadie calculó es una decisión tomada a ciegas, y eso es exactamente lo que
/// el origen tiene que dejar registrado.
export function narrativaOrigenPlan(
  banda: string | null,
  activoCodigo: string,
  amenazaNombre: string,
): string {
  const estado = banda === null ? 'Residual sin calcular' : `Residual ${banda.toLowerCase()}`;
  return `${estado} de ${activoCodigo} — ${amenazaNombre}.`;
}
