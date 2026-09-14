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
  ],
};
