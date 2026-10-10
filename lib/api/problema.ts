import 'server-only';

// lib/api/problema.ts
//
// **Tarea 3.5 · errores uniformes en `problem+json`, con códigos estables y sin filtrar
// detalles internos.**
//
// Un cliente máquina no lee prosa: decide con el código. Si cada ruta arma su propio cuerpo,
// quien consume la API termina con un `if` por ruta, y el día que una cambie la forma del
// error el agente falla en silencio — con un 404 que no distingue de un 403.
//
// SOBRE EL TIPO DE MEDIO. `Response.json()` emite `application/json` y no pregunta. Eso dejó
// a `con-token.ts` DOCUMENTANDO que responde `application/problem+json` mientras emitía otra
// cosa; acá se pone explícito, que es lo que RFC 7807 espera que el cliente pueda mirar.
//
// SOBRE `type`. Es un código estable y corto, no una URI. RFC 7807 permite cualquier URI y
// recomienda una que se pueda abrir, pero publicar una URL de documentación que todavía no
// existe es prometer algo que nadie va a sostener. Un identificador estable cumple la función
// que importa —ramificar sin leer prosa— y se puede promover a URI el día que haya página.

/// Los problemas que `/api/v1` sabe devolver, y el estado con el que sale cada uno.
///
/// **Esta tabla es contrato.** El `titulo` se puede corregir o traducir; la CLAVE no se toca,
/// porque es lo que el cliente compara. Agregar un código es ampliar el vocabulario; cambiar
/// uno existente es romper a quien ya ramificaba por él.
export const CODIGOS_DE_PROBLEMA = {
  'no-autenticado': { estado: 401, titulo: 'No autenticado' },
  'sin-permiso': { estado: 403, titulo: 'Sin permiso' },
  'no-encontrado': { estado: 404, titulo: 'No encontrado' },
  'peticion-invalida': { estado: 400, titulo: 'Petición inválida' },
  'error-interno': { estado: 500, titulo: 'Error interno' },
} as const;

export type CodigoProblema = keyof typeof CODIGOS_DE_PROBLEMA;

/// Lo único que un error interno dice hacia afuera.
///
/// El `detalle` que recibe `problema()` se DESCARTA para este código, y no por pudor: el
/// mensaje de una excepción de Prisma trae nombres de tabla, de columna y a veces el SQL, y
/// quien lo recibiría es exactamente quien provocó el fallo. Lo que hace falta para
/// diagnosticar va al registro del servidor, donde lo lee el equipo y nadie más.
const DETALLE_INTERNO =
  'La petición no se pudo completar. Si se repite, contacta al administrador del SIG con la ' +
  'hora aproximada del intento.';

/// Una respuesta de error de `/api/v1`, con la forma de RFC 7807.
///
/// `Cache-Control: no-store` va en todas: un 403 guardado por un intermediario le niega la
/// ruta a quien sí tiene permiso, y un 404 cacheado sobrevive a la creación del recurso que
/// faltaba.
export function problema(codigo: CodigoProblema, detalle: string): Response {
  const { estado, titulo } = CODIGOS_DE_PROBLEMA[codigo];

  return new Response(
    JSON.stringify({
      type: codigo,
      title: titulo,
      status: estado,
      detail: codigo === 'error-interno' ? DETALLE_INTERNO : detalle,
    }),
    {
      status: estado,
      headers: {
        'Content-Type': 'application/problem+json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
