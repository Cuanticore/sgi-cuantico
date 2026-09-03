'use server';

// app/sig/acciones/envios.ts
//
// El disparo manual «enviar los resúmenes pendientes hasta hoy» (N7): se puede correr de
// nuevo si el servidor estuvo caído, sin duplicar.
//
// El cuerpo se movió a `lib/sig/trabajos-notificaciones.ts`, que es el mismo núcleo que
// corre el cron. Vivía acá detrás de `autorConPermiso`, y por eso el cron NO podía
// llamarlo: sin sesión la compuerta devuelve `ok: false` y el trabajo parecería haber
// corrido cuando no hizo nada — la falla en silencio que este paquete vino a cerrar.
//
// Acá queda la compuerta de permiso, que es lo que esta capa aporta y lo que el cron no
// necesita porque ya se autenticó con su secreto.

import { autorConPermiso, ejecutar } from '@/app/sgsi/acciones/sesion';
import { correrTrabajo } from '@/lib/sig/trabajos';
import type { ResultadoEnvios } from '@/lib/sig/trabajos-notificaciones';

export type { ResultadoEnvios } from '@/lib/sig/trabajos-notificaciones';

const VACIO = { enviados: 0, omitidos: 0, avisos: 0 };

export async function enviarNotificacionesPendientes(): Promise<ResultadoEnvios> {
  return ejecutar<ResultadoEnvios>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const corrida = await correrTrabajo('enviar-notificaciones', autor, autor);
    if (corrida.resultado !== 'EXITOSO') {
      return {
        ok: false,
        mensaje: `El disparo falló: ${corrida.error ?? 'sin detalle'}`,
        ...VACIO,
      };
    }
    return { ok: true, mensaje: corrida.detalle, ...VACIO, enviados: corrida.creados };
  });
}
