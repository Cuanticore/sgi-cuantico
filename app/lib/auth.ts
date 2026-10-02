import { AuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { entradaDesdePerfil } from '@/lib/sig/personas';
import { accesoLocalHabilitado, gruposDeCredenciales, gruposDelToken } from './acceso-local';

/// Entrar sin Directorio Activo cuando se trabaja en la propia máquina.
///
/// NO ES `SGI_ROL_DEV` OTRA VEZ. Aquella variable otorgaba el ROL, saltándose el camino
/// grupo → rol → permiso; ésta emite GRUPOS, que es exactamente lo que emite Azure. El
/// camino se recorre entero y `lib/sgsi/permisos.ts` deriva el rol igual que en producción.
///
/// El arreglo de proveedores se arma UNA vez, al cargar el módulo: fuera de las dos
/// condiciones de `accesoLocalHabilitado`, este proveedor no existe — no está deshabilitado,
/// no está en la lista. Ver `app/lib/acceso-local.ts`.
const ACCESO_LOCAL = CredentialsProvider({
  id: 'acceso-local',
  name: 'Acceso local (sin Directorio)',
  credentials: {
    correo: { label: 'Correo', type: 'text', placeholder: 'tu.nombre@cuantico.com' },
    grupos: {
      label: 'Grupos, separados por coma (vacío = Colaborador)',
      type: 'text',
      placeholder: 'Líderes SIG',
    },
  },
  async authorize(credenciales) {
    const correo = credenciales?.correo?.trim();
    if (!correo) return null;
    return {
      id: correo,
      name: correo.split('@')[0],
      email: correo,
      grupos: gruposDeCredenciales(credenciales?.grupos),
    };
  },
});

export const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
    ...(accesoLocalHabilitado() ? [ACCESO_LOCAL] : []),
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
    async jwt({ token, account, profile, user }) {
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
      //
      // Con el acceso local los grupos llegan en `user` y no en `profile`, porque no hay
      // proveedor OAuth que devuelva un perfil. `gruposDelToken` resuelve las dos
      // procedencias y le da prioridad al Directorio.
      const grupos = gruposDelToken(
        profile as { groups?: unknown } | undefined,
        user as { grupos?: unknown } | undefined,
      );
      if (grupos !== undefined) {
        token.grupos = grupos;
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
