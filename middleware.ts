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
export const config = {
  matcher: [
    '/',
    '/api/indicators',
    '/api/debug',
    '/sgsi/:path*',
    '/mi-sig/:path*',
    '/sig/:path*',
    '/estrategico/:path*',
  ],
};
