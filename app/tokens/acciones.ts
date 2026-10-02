'use server';

// app/tecnologia/tokens/acciones.ts
//
// Las Server Actions de la pantalla de administración de `TokenServicio`. Exigen
// `tokenServicio:administrar` —restringido a `Líderes SIG`— y no reimplementan ninguna regla:
// toda la lógica de emisión, validación y revocación vive en `lib/api/token-servicio.ts`, la
// misma que usará `conToken` para autenticar cada petición de `/api/v1`. Acá sólo se resuelve
// el autor desde la sesión y se traduce el resultado a lo que la pantalla puede mostrar.

import { revalidatePath } from 'next/cache';

import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { emitir, revocar } from '@/lib/api/token-servicio';
import type { Permiso } from '@/lib/sgsi/permisos';

const RUTA = '/tecnologia/tokens';

export interface DatosDeEmisionDesdeLaPantalla {
  nombre: string;
  alcance: Permiso[];
}

/// **El secreto viaja en esta respuesta, y en ninguna otra.** `ResultadoDeEmision` es el único
/// tipo de retorno de todo este módulo que lleva un campo `secreto`: ni `revocarToken` ni
/// ninguna acción de lectura futura lo tienen, porque no hay de dónde volver a sacarlo.
export interface ResultadoDeEmision extends Resultado {
  secreto?: string;
  prefijo?: string;
}

export async function emitirToken(datos: DatosDeEmisionDesdeLaPantalla): Promise<ResultadoDeEmision> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('tokenServicio:administrar');
    const emitido = await emitir({ nombre: datos.nombre, alcance: datos.alcance, creadoPor: autor });
    revalidatePath(RUTA);
    return {
      ok: true,
      mensaje:
        `Token «${emitido.nombre}» emitido. Copia el secreto ahora — no se va a volver a ` +
        'mostrar, ni siquiera a quien lo emitió.',
      secreto: emitido.secreto,
      prefijo: emitido.prefijo,
    };
  });
}

export async function revocarToken(id: number, motivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    await autorConPermiso('tokenServicio:administrar');
    await revocar(id, motivo);
    revalidatePath(RUTA);
    return { ok: true, mensaje: 'Token revocado.' };
  });
}
