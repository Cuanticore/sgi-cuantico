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

export const config = {
  matcher: ['/', '/api/indicators', '/api/debug', '/sgsi/:path*'],
};
