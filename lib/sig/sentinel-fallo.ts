// lib/sig/sentinel-fallo.ts
//
// Por qué NO se pudo hablar con Microsoft Sentinel (Log Analytics).
//
// No reusa `lib/sgsi/graph-fallo.ts` a propósito (D4 del diseño): las causas NO coinciden.
// Un 403 de Log Analytics es «al service principal le falta el ROL Log Analytics Reader
// sobre el workspace» — una asignación RBAC en el portal de Azure, nada que ver con
// «agregar un permiso de APLICACIÓN y conceder consentimiento del administrador», que es
// lo que un 403 significa contra Graph. Reusar `graph-fallo.ts` produciría el defecto
// exacto que ese módulo existe para evitar: mandar a alguien a arreglar lo que no está
// roto.
//
// Este módulo es puro y no toca la red: recibe el código de estado (o la forma de la
// respuesta) y dice qué pasó. Por eso se puede probar de verdad.

/// Las cuatro variables del service principal de Log Analytics. Se nombran acá porque el
/// mensaje de la pantalla tiene que decir CUÁL falta, no las cuatro siempre.
export const VARIABLES_SENTINEL = [
  'SENTINEL_TENANT_ID',
  'SENTINEL_CLIENT_ID',
  'SENTINEL_CLIENT_SECRET',
  'SENTINEL_WORKSPACE_ID',
] as const;

export type FalloSentinel =
  /// Ni siquiera se intentó la llamada: falta configuración.
  | { causa: 'SIN_CONFIGURAR'; faltan: string[] }
  /// El tenant rechazó el service principal: secreto vencido, rotado o mal copiado.
  | { causa: 'CREDENCIAL_RECHAZADA'; estado: number; codigo: string }
  /// El token sirve pero al service principal le falta el ROL Log Analytics Reader sobre
  /// el workspace — una asignación de RBAC en el portal, no un permiso de aplicación.
  | { causa: 'SIN_ROL'; estado: number }
  /// El workspace no existe en este tenant. Es `SENTINEL_WORKSPACE_ID` equivocado, y NO un
  /// problema de rol: distinguirlos evita mandar a alguien a asignar un rol sobre un
  /// workspace que nunca existió.
  | { causa: 'WORKSPACE_NO_EXISTE'; estado: number }
  /// 400 en `/query` CON el token ya aceptado: es la consulta KQL o el cuerpo de la
  /// petición, nunca una credencial. Compartir esta causa con `CREDENCIAL_RECHAZADA`
  /// mandaría a rotar un secreto que funciona.
  | { causa: 'CONSULTA_INVALIDA'; estado: number; detalle: string }
  /// La respuesta llegó 200 pero sin `tables` o sin las columnas que `aFilas` espera. No
  /// es un código de error: es que el workspace nunca recibió el conector de Sentinel.
  | { causa: 'TABLA_AUSENTE'; detalle: string }
  /// Azure pidió esperar. Transitorio: se reintenta solo en la próxima corrida del trabajo.
  | { causa: 'DEMASIADAS_CONSULTAS' }
  | { causa: 'RESPUESTA_INESPERADA'; estado: number }
  /// No hubo respuesta: DNS, proxy, salida a internet bloqueada.
  | { causa: 'SIN_RED'; detalle: string };

export type ResultadoSentinel<T> = { ok: true; datos: T } | { ok: false; fallo: FalloSentinel };

/// Cuáles de las cuatro variables no están puestas. Cadena vacía cuenta como ausente: una
/// variable definida en blanco es un error de despliegue, no una configuración válida.
export function variablesSentinelQueFaltan(
  entorno: Record<string, string | undefined>,
): string[] {
  return VARIABLES_SENTINEL.filter((v) => {
    const valor = entorno[v];
    return valor === undefined || valor.trim() === '';
  });
}

/// El endpoint de token de Azure AD contestó mal. Acá, igual que en Graph, un rechazo del
/// tenant es siempre la credencial: no hay rol que negociar todavía.
export function clasificarTokenSentinel(estado: number, codigo: string): FalloSentinel {
  return { causa: 'CREDENCIAL_RECHAZADA', estado, codigo: codigo.trim() || 'sin detalle' };
}

/// El endpoint de consulta de Log Analytics contestó mal, con el token ya obtenido.
///
/// El 403 es el único que significa «falta el rol», y el 404 es el único que significa
/// «el workspace no existe» — los dos se resuelven en el portal de Azure, no en el código,
/// y por eso ninguno de los dos comparte mensaje con el otro.
export function clasificarConsultaSentinel(estado: number, detalle: string): FalloSentinel {
  if (estado === 403) return { causa: 'SIN_ROL', estado };
  if (estado === 404) return { causa: 'WORKSPACE_NO_EXISTE', estado };
  if (estado === 400) {
    return { causa: 'CONSULTA_INVALIDA', estado, detalle: detalle.trim() || 'sin detalle' };
  }
  if (estado === 429) return { causa: 'DEMASIADAS_CONSULTAS' };
  return { causa: 'RESPUESTA_INESPERADA', estado };
}

/// La frase que ve una persona. Dice qué pasó y qué hacer, en ese orden, porque quien lee
/// esto está parado frente a una pantalla que no le sirve y necesita el siguiente paso.
export function explicarFalloSentinel(fallo: FalloSentinel): string {
  switch (fallo.causa) {
    case 'SIN_CONFIGURAR':
      return (
        `Microsoft Sentinel no está configurado en este entorno: falta ${listar(fallo.faltan)}. ` +
        'No se intentó ninguna consulta.'
      );
    case 'CREDENCIAL_RECHAZADA':
      return (
        `El tenant rechazó las credenciales del service principal (${fallo.estado}: ${fallo.codigo}). ` +
        'Suele ser el secreto vencido o rotado: hay que generar uno nuevo en el registro de ' +
        'la aplicación y actualizar SENTINEL_CLIENT_SECRET.'
      );
    case 'SIN_ROL':
      return (
        `Log Analytics respondió ${fallo.estado}: al service principal le falta el rol ` +
        '**Log Analytics Reader** sobre el workspace. Se asigna en el portal de Azure, en ' +
        'el control de acceso (IAM) del workspace — nada que registrar en Graph.'
      );
    case 'WORKSPACE_NO_EXISTE':
      return (
        `Log Analytics respondió ${fallo.estado}: el workspace no existe en este tenant. ` +
        'No es un problema de acceso: SENTINEL_WORKSPACE_ID apunta a un identificador que ' +
        'ya no está o nunca estuvo.'
      );
    case 'CONSULTA_INVALIDA':
      return (
        `Log Analytics respondió ${fallo.estado} con el token aceptado: la consulta KQL o ` +
        `el cuerpo de la petición está mal formado (${fallo.detalle}). No es una credencial: ` +
        'no hay que tocar ninguna variable de entorno.'
      );
    case 'TABLA_AUSENTE':
      return (
        `La respuesta de Log Analytics no tiene la forma esperada (${fallo.detalle}). Suele ` +
        'significar que el workspace nunca recibió el conector de Sentinel, o que se ' +
        'onboardeó bajo otro nombre de tabla.'
      );
    case 'DEMASIADAS_CONSULTAS':
      return (
        'Log Analytics pidió esperar antes de volver a consultar. Es transitorio: se ' +
        'reintenta solo en la próxima corrida del trabajo.'
      );
    case 'RESPUESTA_INESPERADA':
      return `Log Analytics respondió ${fallo.estado}. No se cambió nada.`;
    case 'SIN_RED':
      return (
        `No hubo respuesta de Microsoft Sentinel (${fallo.detalle}). El servidor no está ` +
        'saliendo a internet, o hay un proxy o firewall en el medio.'
      );
  }
}

/// «A», «A y B», «A, B y C». Enumerar con comas hasta el final hace que la última variable
/// se lea como parte de la anterior.
function listar(nombres: string[]): string {
  if (nombres.length === 0) return 'nada';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}
