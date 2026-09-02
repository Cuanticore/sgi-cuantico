// lib/sgsi/graph-fallo.ts
//
// Por qué NO se pudo hablar con Microsoft Graph.
//
// Antes todo el módulo del Directorio devolvía `null`, y `null` significaba cinco cosas
// distintas: faltan las variables, el secreto está vencido, la aplicación no tiene el
// permiso, el object id del grupo no existe, o la red no llegó. La pantalla tenía que
// adivinar — y adivinaba mal: afirmaba «falta GroupMember.Read.All» aunque lo único que
// sabía era que la consulta no había respondido. Alguien podía irse a Azure a conceder un
// permiso que ya estaba concedido, mientras la causa real era una variable sin definir.
//
// Este módulo es puro y no toca la red: recibe lo que Graph contestó y dice qué pasó. Por
// eso se puede probar de verdad, que es justamente lo que faltaba.

/// Las tres variables del app credential. Se nombran acá porque el mensaje de la pantalla
/// tiene que decir CUÁL falta, no las tres siempre.
export const VARIABLES_GRAPH = [
  'SHAREPOINT_TENANT_ID',
  'SHAREPOINT_CLIENT_ID',
  'SHAREPOINT_CLIENT_SECRET',
] as const;

export type FalloGraph =
  /// Ni siquiera se intentó la llamada: falta configuración.
  | { causa: 'SIN_CONFIGURAR'; faltan: string[] }
  /// El tenant rechazó el app credential: secreto vencido, rotado o mal copiado.
  | { causa: 'CREDENCIAL_RECHAZADA'; estado: number; codigo: string }
  /// El token sirve pero la aplicación no tiene el permiso que ese recurso exige.
  | { causa: 'SIN_PERMISO'; permiso: string; recurso: string }
  /// El recurso no existe. Para el grupo del SIG esto es un object id equivocado, y NO un
  /// permiso faltante: distinguirlos evita mandar a alguien a conceder lo que ya concedió.
  | { causa: 'NO_EXISTE'; recurso: string }
  /// Graph pidió esperar. Es transitorio y se reintenta solo la próxima vez.
  | { causa: 'DEMASIADAS_CONSULTAS'; recurso: string }
  | { causa: 'RESPUESTA_INESPERADA'; estado: number; recurso: string }
  /// No hubo respuesta: DNS, proxy, salida a internet bloqueada.
  | { causa: 'SIN_RED'; detalle: string };

export type ResultadoGraph<T> = { ok: true; datos: T } | { ok: false; fallo: FalloGraph };

/// Cuáles de las tres variables no están puestas. Cadena vacía cuenta como ausente: una
/// variable definida en blanco es un error de despliegue, no una configuración válida.
export function variablesQueFaltan(entorno: Record<string, string | undefined>): string[] {
  return VARIABLES_GRAPH.filter((v) => {
    const valor = entorno[v];
    return valor === undefined || valor.trim() === '';
  });
}

/// El endpoint de token contestó mal. Acá un 400 o un 401 es siempre la credencial: no hay
/// permisos que negociar todavía, sólo tenant, cliente y secreto.
export function clasificarToken(estado: number, codigo: string): FalloGraph {
  return { causa: 'CREDENCIAL_RECHAZADA', estado, codigo: codigo.trim() || 'sin detalle' };
}

/// Un recurso de Graph contestó mal, con el token ya obtenido.
///
/// El 403 es el único que significa «falta el permiso», y por eso es el único que lo
/// nombra. El 401 con un token recién emitido apunta a la credencial, no al permiso.
export function clasificarRecurso(estado: number, recurso: string, permiso: string): FalloGraph {
  if (estado === 403) return { causa: 'SIN_PERMISO', permiso, recurso };
  if (estado === 401) return { causa: 'CREDENCIAL_RECHAZADA', estado, codigo: 'token rechazado' };
  if (estado === 404) return { causa: 'NO_EXISTE', recurso };
  if (estado === 429) return { causa: 'DEMASIADAS_CONSULTAS', recurso };
  return { causa: 'RESPUESTA_INESPERADA', estado, recurso };
}

/// La frase que ve una persona. Dice qué pasó y qué hacer, en ese orden, porque quien lee
/// esto está parado frente a una pantalla que no le sirve y necesita el siguiente paso.
export function explicarFallo(fallo: FalloGraph): string {
  switch (fallo.causa) {
    case 'SIN_CONFIGURAR':
      return (
        `Microsoft Graph no está configurado en este entorno: falta ${listar(fallo.faltan)}. ` +
        'No se intentó ninguna consulta.'
      );
    case 'CREDENCIAL_RECHAZADA':
      return (
        `El tenant rechazó las credenciales de la aplicación (${fallo.estado}: ${fallo.codigo}). ` +
        'Suele ser el secreto vencido o rotado: hay que generar uno nuevo en el registro de ' +
        'la aplicación y actualizar SHAREPOINT_CLIENT_SECRET.'
      );
    case 'SIN_PERMISO':
      return (
        `Graph respondió 403 en ${fallo.recurso}: la aplicación no tiene el permiso ` +
        `${fallo.permiso}. Hay que agregarlo como permiso de APLICACIÓN —no delegado— en el ` +
        'registro de la aplicación y después conceder el consentimiento del administrador.'
      );
    case 'NO_EXISTE':
      return (
        `Graph respondió 404: ${fallo.recurso} no existe en este tenant. No es un problema de ` +
        'permisos — el identificador que la aplicación tiene configurado apunta a algo que ya ' +
        'no está o nunca estuvo.'
      );
    case 'DEMASIADAS_CONSULTAS':
      return (
        `Graph pidió esperar antes de volver a consultar ${fallo.recurso}. Es transitorio: ` +
        'se reintenta solo la próxima vez que se abra la pantalla.'
      );
    case 'RESPUESTA_INESPERADA':
      return `Graph respondió ${fallo.estado} en ${fallo.recurso}. No se cambió nada.`;
    case 'SIN_RED':
      return (
        `No hubo respuesta de Microsoft Graph (${fallo.detalle}). El servidor no está saliendo ` +
        'a internet, o hay un proxy o firewall en el medio.'
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
