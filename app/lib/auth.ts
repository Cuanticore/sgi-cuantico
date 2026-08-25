import { AuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

export const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      // Directory group membership, from which every permission derives. The claim only
      // arrives if the app registration is configured to emit it; when it is absent the
      // role falls back to SGI_ROL_POR_DEFECTO and the interface says so, rather than
      // silently behaving as if nobody had permissions.
      const grupos = (profile as { groups?: unknown } | undefined)?.groups;
      if (Array.isArray(grupos)) {
        token.grupos = grupos.filter((g): g is string => typeof g === 'string');
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.grupos = (token.grupos as string[] | undefined) ?? undefined;
      }
      return session;
    },
  },
};
