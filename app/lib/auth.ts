import { AuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { prisma } from '@/lib/db';
import { entradaDesdePerfil } from '@/lib/sig/personas';
import { gruposDePersona } from '@/lib/sgsi/directorio';

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
      // Dos fuentes, en este orden:
      //
      //   1. El claim `groups` del token. Es lo barato y no cuesta una llamada de red, pero
      //      `groupMembershipClaims` lo filtra POR TIPO DE GRUPO: con el valor habitual
      //      `SecurityGroup`, un grupo de Microsoft 365 no aparece nunca.
      //   2. Graph, preguntando la pertenencia real. Ahí el tipo de grupo deja de importar.
      //
      // La segunda solo corre cuando la primera no trajo nada, así que un tenant que ya
      // emite el claim no paga ninguna llamada extra.
      if (profile) {
        const claim = (profile as { groups?: unknown }).groups;
        const delClaim = Array.isArray(claim)
          ? claim.filter((g): g is string => typeof g === 'string')
          : [];

        if (delClaim.length > 0) {
          token.grupos = delClaim;
        } else {
          const oid = (profile as { oid?: unknown }).oid;
          const consultados =
            typeof oid === 'string' && oid ? await gruposDePersona(oid) : null;
          // `null` es «no se pudo preguntar», y ahí conviene dejar lo que ya hubiera antes
          // que sobrescribirlo con vacío: degradar a Colaborador por una falla de red sería
          // convertir un problema pasajero en una pérdida de acceso.
          if (consultados) token.grupos = consultados;
        }
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
