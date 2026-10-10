// app/api/v1/openapi/route.ts
//
// **Tarea 3.6 · el contrato de la API, servido por la propia aplicación.**
//
// No hay archivo que mantener: el documento se arma desde `lib/api/catalogo-rutas.ts`, que es
// el mismo sitio del que cada ruta lee el permiso que le pasa a `conToken`. Un catálogo
// desactualizado no produce un documento equivocado — produce una ruta que no autoriza lo que
// debe, y eso se nota.
//
// Detrás del token como todo lo demás. `/api/v1` no tiene rutas públicas: el contrato de una
// API privada enumera su superficie entera, que es justo lo que uno no publica por comodidad.

import { conToken } from '@/lib/api/con-token';
import { documentoOpenApi, operacion } from '@/lib/api/catalogo-rutas';

const OP = operacion('obtenerOpenApi');

export const GET = conToken(OP.permiso, async () => {
  return Response.json(documentoOpenApi(), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
