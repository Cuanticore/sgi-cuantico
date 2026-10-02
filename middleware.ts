// middleware.ts
import withAuth from 'next-auth/middleware';
import type { NextFetchEvent, NextRequest } from 'next/server';

// Next 16 requires a statically detectable function export here: the previous
// `export { default } from 'next-auth/middleware'` re-export is no longer
// recognised. This wrapper calls the same next-auth entry point with the same
// arguments the framework used to pass, so behaviour is unchanged.
//
// The file is intentionally still named `middleware.ts` rather than `proxy.ts`:
// the rename also switches the runtime from edge to nodejs, which needs its own
// verification pass.
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  return withAuth(req as never, event);
}

// The SIG surfaces guard themselves server-side and scope every read to the session's
// e-mail, so an anonymous visitor never saw another person's data. They were still
// reachable without a session, because `rolDesdeGrupos(undefined)` returns Colaborador and
// nothing upstream asked for a session first. Colaborador is the floor for an
// authenticated tenant account (REQ-SIG-02 §6), not for an anonymous one: without these
// entries `/` redirects to sign-in while `/mi-sig` renders, which is the kind of gap a
// later query that forgets to scope by e-mail turns into a real leak.
// REQ-SIG-19 · P10 · `/firmar/<token>` NO está acá, y es a propósito.
//
// Este `matcher` enumera lo PROTEGIDO, así que toda ruta que no figure nace pública por omisión.
// Cómodo hoy y peligroso el día que alguien agregue `/firmar/panel-interno` y lo dé por protegido
// porque «está bajo /firmar»: no lo estaría.
//
// `/firmar` es deliberadamente pública porque quien la usa YA NO TIENE CUENTA —esa es la
// situación entera del requerimiento— y **su autorización es el token**: 32 bytes de
// `node:crypto`, de un solo uso para firmar, con expiración, revocable y con tope de intentos
// sobre el documento de identidad. No hay otra puerta, y no se crea sesión al usarla (D-9).
//
// Por lo tanto: **si mañana hace falta una pantalla de gestión de enlaces, NO cuelga de
// `/firmar`.** Va bajo `/sig`, que sí está acá abajo. Agregar `/firmar/:path*` a esta lista
// tampoco es la salida: rompería la única ruta pública del requerimiento, que es precisamente la
// que tiene que funcionar sin sesión.
//
// **Fase 2 de `hoja-de-vida-api-servicio` · D5 · `/api/v1` TAMPOCO está acá, y por el mismo
// tipo de razón que `/firmar`, aunque al revés: no es pública, es que su autorización NO es
// `withAuth`.**
//
// `/api/v1` sirve a agentes automatizados con un `TokenServicio` —32 bytes de `node:crypto`,
// con alcance, caducidad y revocación (ver `lib/api/token-servicio.ts`)—, nunca a una sesión de
// Azure AD. Agregarla acá tiene un único efecto: `withAuth` comprueba que exista una sesión y,
// si no la hay, RESPONDE CON UNA REDIRECCIÓN 302 a la pantalla de ingreso. Un cliente máquina
// que manda `Authorization: Bearer sgi_live_...` no sabe qué hacer con un 302 hacia HTML —no es
// un error que pueda interpretar, ni siquiera es JSON—, así que meter `/api/v1` en este matcher
// no protegería la ruta: la dejaría respondiendo mal a quien sí trae credencial válida.
//
// La autorización de `/api/v1` es `lib/api/con-token.ts#conToken`, que cada `route.ts` aplica
// explícitamente y que responde 401/403 con cuerpo JSON — nunca una redirección. Que esto no
// dependa de la memoria de quien agregue la próxima ruta es, precisamente, lo que sostiene
// `app/api/v1/__tests__/toda-ruta-usa-con-token.test.ts`: recorre el árbol completo y falla si
// algún manejador exportado no está envuelto en `conToken`. La red es esa prueba, no este
// comentario.
export const config = {
  matcher: [
    '/',
    '/api/indicators',
    '/api/debug',
    '/sgsi/:path*',
    '/mi-sig/:path*',
    '/sig/:path*',
    '/estrategico/:path*',
    // REQ-SIG-06 y REQ-SIG-08. Faltaba: sin esta línea `/tecnologia` era el único módulo
    // que no redirigía al login, y una cuenta sin sesión llegaba hasta el layout en vez de
    // frenar en el borde. La puerta del layout igual lo cubría —comprueba
    // `tecnologia:ver`— pero apoyarse sólo en ella deja el módulo desalineado con el resto
    // y a merced de que la próxima ruta se olvide de su gate.
    '/tecnologia/:path*',
    // Fase 2 de `hoja-de-vida-api-servicio` · 2.9 · la pantalla de administración de
    // `TokenServicio`. No cuelga de `/tecnologia` ni de `/sig` — ver el comentario de
    // `app/tokens/layout.tsx` para el porqué — así que necesita su propia entrada acá, por la
    // misma razón que `/tecnologia` la necesitó: sin ella, una cuenta sin sesión llegaría
    // hasta el layout en vez de frenar en el borde.
    '/tokens/:path*',
  ],
};
