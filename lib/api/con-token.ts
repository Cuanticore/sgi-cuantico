import 'server-only';

// lib/api/con-token.ts
//
// **D5 · toda ruta de `/api/v1` pasa por esta envoltura, y una prueba lo sostiene.**
//
// `middleware.ts` enumera lo PROTEGIDO: toda ruta que no figure nace pública por omisión, y el
// propio archivo ya narra el caso de `/tecnologia` olvidado. Meter `/api/v1` en esa lista
// tampoco sirve — `withAuth` responde con una redirección a la pantalla de ingreso, que para un
// cliente máquina es un 302 hacia HTML en vez de un 401 con cuerpo. Por eso `/api/v1` queda
// fuera del matcher A PROPÓSITO, y lo que reemplaza al matcher es esta función: todo manejador
// exportado de todo `route.ts` bajo `app/api/v1/` se envuelve en `conToken`, y
// `app/api/v1/__tests__/toda-ruta-usa-con-token.test.ts` falla si alguno no lo está.
//
// Resuelve el token EXACTAMENTE como `validar()` de `lib/api/token-servicio.ts` —búsqueda por
// hash, nunca comparación de secretos—, arma el `Autor` de clase `servicio` que
// `lib/sig/autor.ts` define, y aplica `autorizado(autor, permiso)` antes de dejar correr el
// manejador. Un 401 (sin credencial o credencial inválida) y un 403 (credencial válida, alcance
// insuficiente) son respuestas DISTINTAS a propósito: a diferencia de la validación del secreto
// —donde distinguir casos conviene a quien adivina—, acá quien ya demostró tener un secreto
// vigente no gana nada sabiendo que el permiso le faltó a ÉL, y decírselo es lo que cualquier
// API con alcance hace.

import { autorizado, type Autor } from '@/lib/sig/autor';
import type { Permiso } from '@/lib/sgsi/permisos';
import { validar } from '@/lib/api/token-servicio';

const ESQUEMA = 'bearer';

/// El secreto que trae la cabecera `Authorization: Bearer <secreto>`, o `null` si la cabecera
/// falta o no sigue ese esquema. El esquema se compara sin distinguir mayúsculas porque RFC
/// 7235 no las exige, y un cliente que mande `bearer` en minúscula no debería fallar por eso.
function secretoDesdeEncabezado(valor: string | null): string | null {
  if (valor === null) return null;
  const espacio = valor.indexOf(' ');
  if (espacio === -1) return null;
  const esquema = valor.slice(0, espacio).trim().toLowerCase();
  const secreto = valor.slice(espacio + 1).trim();
  if (esquema !== ESQUEMA || secreto === '') return null;
  return secreto;
}

function problema(status: number, titulo: string, detalle: string): Response {
  // `application/problem+json`, el mismo formato que la Fase 3 generaliza para el resto de
  // `/api/v1` (spec `service-token-auth`, «errores uniformes en problem+json»). Acá sólo hacen
  // falta estos dos códigos; el resto de causas vive en las rutas de lectura y escritura.
  return Response.json(
    { title: titulo, status, detail: detalle },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function sinAutenticar(): Response {
  return problema(
    401,
    'No autenticado',
    'Falta la cabecera Authorization con un token de servicio vigente: ' +
      '"Authorization: Bearer <secreto>".',
  );
}

function sinPermiso(permiso: Permiso): Response {
  return problema(
    403,
    'Sin permiso',
    `El token no tiene el permiso requerido para esta operación: ${permiso}.`,
  );
}

/// **La envoltura obligatoria.** Recibe el permiso que la ruta exige y el manejador que la
/// ruta implementa; devuelve una función con la misma firma que Next.js espera de un
/// exportado `GET`/`POST`/`PUT`/`PATCH`/`DELETE` — `(request, contexto)` —, así que envolver un
/// manejador existente es agregar `conToken('permiso:x', ...)` alrededor y nada más.
///
/// El manejador recibe el `Autor` ya armado: nunca vuelve a resolver el token por su cuenta, ni
/// vuelve a decidir si el permiso alcanza. Eso ya corrió acá.
export function conToken<Contexto = unknown>(
  permiso: Permiso,
  manejador: (request: Request, autor: Autor, contexto: Contexto) => Promise<Response>,
): (request: Request, contexto: Contexto) => Promise<Response> {
  return async (request: Request, contexto: Contexto): Promise<Response> => {
    const secreto = secretoDesdeEncabezado(request.headers.get('authorization'));
    if (secreto === null) return sinAutenticar();

    const resultado = await validar(secreto);
    if (!resultado.ok) return sinAutenticar();

    const autor: Autor = {
      clase: 'servicio',
      tokenId: resultado.token.id,
      nombre: resultado.token.nombre,
      alcance: resultado.token.alcance,
    };

    if (!autorizado(autor, permiso)) return sinPermiso(permiso);

    return manejador(request, autor, contexto);
  };
}
