import { AuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { prisma } from '@/lib/db';
import { entradaDesdePerfil } from '@/lib/sig/personas';

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
    // Quien inicia sesión ya se identificó contra el Directorio: existe. Esperar a la
    // próxima sincronización para darle entidad solo produce tareas sin destinatario.
    //
    // Un fallo acá NO impide entrar: la sesión no depende de que la fila exista, y negar el
    // acceso por un problema de base de datos sería una regresión de disponibilidad a
    // cambio de nada.
    async signIn({ profile }) {
      const entrada = entradaDesdePerfil(profile as Record<string, unknown> | undefined);
      if (!entrada) return true;
      try {
        await prisma.persona.upsert({
          where: { oid: entrada.oid },
          update: {
            nombre: entrada.nombre,
            correo: entrada.correo,
            activa: true,
            sincronizadaEn: new Date(),
          },
          create: {
            oid: entrada.oid,
            nombre: entrada.nombre,
            correo: entrada.correo,
            activa: true,
            sincronizadaEn: new Date(),
          },
        });
      } catch (error) {
        console.error('[sig] no se pudo registrar la persona al iniciar sesión', error);
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      // La pertenencia a grupos, de donde sale todo permiso. Se resuelve UNA vez, al
      // iniciar sesión: `profile` solo llega en ese momento y después el token se reutiliza.
      //
      // El claim solo viaja si el registro de la aplicación está configurado para emitirlo,
      // y filtra POR TIPO DE GRUPO: con `groupMembershipClaims: SecurityGroup` un grupo de
      // Microsoft 365 no aparece nunca. Por eso `Líderes SIG` es un grupo de SEGURIDAD.
      // Cuando el claim no llega, el rol es Colaborador — ver lib/sgsi/permisos.ts.
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
