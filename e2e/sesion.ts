// e2e/sesion.ts
//
// La sesión del recorrido, acuñada en vez de iniciada.
//
// `/tecnologia/:path*` está detrás de `withAuth`, y la única puerta es Azure AD. Automatizar
// un inicio de sesión corporativo real desde un navegador sin cabeza no es viable ni deseable:
// arrastraría MFA, un segundo factor humano y las credenciales de una persona a un archivo.
//
// En cambio se firma un token de sesión con el mismo `NEXTAUTH_SECRET` de la aplicación y se
// pone como cookie. Es la forma estándar de probar detrás de una puerta de autenticación, y no
// debilita nada: sin el secreto —que sólo está en el `.env` de quien corre esto— la cookie no
// vale nada.
//
// **Los grupos son parte del contrato que se está probando.** `Líderes SIG` es lo que la
// puerta del layout exige (`tecnologia:ver`), y `SGI_ROL_DEV` fue retirado a propósito. Si
// mañana alguien cambia el nombre del grupo, este recorrido falla — y tiene que fallar.

import { encode } from 'next-auth/jwt';
import type { BrowserContext } from '@playwright/test';

export const GRUPO_QUE_ABRE_TECNOLOGIA = 'Líderes SIG';

export async function iniciarSesion(contexto: BrowserContext, baseURL: string): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET no está definida: sin ella no se puede firmar la sesión.');

  const token = await encode({
    secret,
    maxAge: 30 * 60,
    token: {
      name: 'Recorrido de verificación',
      // Una identidad propia y no la de una persona: el recorrido no debe quedar atado a
      // quién lo corrió, y esta pantalla no consulta la base por correo.
      email: 'recorrido@verificacion.local',
      sub: 'e2e-recorrido',
      grupos: [GRUPO_QUE_ABRE_TECNOLOGIA],
    },
  });

  await contexto.addCookies([
    {
      // Sin `__Secure-`: el recorrido va por http contra el servidor de desarrollo.
      name: 'next-auth.session-token',
      value: token,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
