// app/api/v1/salud/route.ts
//
// **La única ruta de prueba de vida que trae la Fase 2.** Sirve para probar `conToken` de
// punta a punta —emitir un token, llamarla, revocarlo, reintentar— sin anticipar ninguna ruta
// de la hoja de vida, que es trabajo de la Fase 3. Devuelve el nombre y el alcance del token
// que la llamó: lo mínimo que confirma que la identidad de máquina llegó completa al otro
// lado de la envoltura.
//
// `misig:ver` es el permiso más amplio del vocabulario —lo tiene cualquier cuenta
// autenticada— y es el que se le pide a un token de sólo comprobar que está vivo: no hace
// falta nada más para esta ruta.

import { conToken } from '@/lib/api/con-token';
import { operacion } from '@/lib/api/catalogo-rutas';

// El permiso sale del catálogo y no de un literal acá. Es lo que hace que el documento
// OpenAPI no pueda mentir: si alguien cambia el alcance de esta ruta en el catálogo, cambia
// la ruta; si lo cambia acá sin tocar el catálogo, ya no hay dónde — no existe ese «acá».
const OP = operacion('comprobarSalud');

export const GET = conToken(OP.permiso, async (_request, autor) => {
  return Response.json(
    { nombre: autor.clase === 'servicio' ? autor.nombre : autor.correo, alcance: autor.clase === 'servicio' ? autor.alcance : [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
