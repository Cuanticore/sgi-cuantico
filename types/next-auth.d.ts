// types/next-auth.d.ts
//
// The session carries the Directory groups so every screen and every action derives its
// permissions from one place. Declared here rather than cast at each use site, because a
// cast is a claim the compiler cannot check.

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      /// Group display names from the token's `groups` claim. Undefined when the app
      /// registration does not emit it — which is a different state from "no groups".
      grupos?: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    grupos?: string[];
  }
}
