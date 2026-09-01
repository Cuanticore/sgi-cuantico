// app/sgsi/layout.tsx
//
// The SGSI module renders inside the shared SIG shell, and THIS IS THE READ GATE.
//
// The middleware only proves a session exists — `withAuth` checks authentication, not
// authorisation — so before this gate every authenticated account in the tenant could read
// the whole asset inventory and risk register: the Ley 1581 personal-data flags, the
// internet-exposure flags, the custodians and the owners. The writes were never exposed
// (every server action goes through `autorConPermiso`), but an ISMS tool leaking its own
// register to anyone with a mailbox is the defect it exists to prevent.
//
// It lives in the LAYOUT, not in the pages, on purpose: eleven screens each remembering to
// check is eleven chances to forget, and the twelfth screen somebody adds would forget by
// default. Here a new page under /sgsi is gated the moment it exists.
//
// It is NOT in `ShellSig`: the Indicadores screen renders that same shell, and gating there
// would lock a dashboard that was open to the whole tenant before this module existed.

import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { GRUPOS, puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import ShellSig from '@/app/components/sgsi/ShellSig';

export const dynamic = 'force-dynamic';

export default async function SgsiLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  if (!puede(rol, 'sgsi:ver')) {
    return (
      <ShellSig>
        <SinAcceso porDefecto={rol.esPorDefecto} />
      </ShellSig>
    );
  }

  return <ShellSig>{children}</ShellSig>;
}

/// Says WHICH group grants access, because "no tenés permiso" without that is a dead end
/// that turns into a support ticket. It names the groups rather than telling the person to
/// ask someone, and it does not reveal anything about the register itself.
function SinAcceso({ porDefecto }: { porDefecto: boolean }) {
  return (
    <main className="px-8 pt-10 pb-14">
      <div
        className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
        style={{
          background: 'var(--hf-warn-100)',
          borderColor: 'var(--hf-warn-border)',
        }}
      >
        <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
          No tenés acceso al SGSI
        </h1>
        <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
          Tu sesión es válida, pero tu cuenta no pertenece al grupo del Directorio Activo que
          da acceso a este módulo. El inventario de activos y el registro de riesgos no se
          muestran sin él.
        </p>
        <p className="text-12" style={{ color: 'var(--hf-warn-text)' }}>
          <span className="font-mono font-semibold">Responsables SIG</span> — acceso completo
          al sistema
        </p>
        <p className="text-11_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text-soft)' }}>
          Pedí a quien administra el Directorio Activo que te agregue a ese grupo. Los permisos
          se derivan de esa pertenencia: la aplicación no los concede por su cuenta. Mientras
          tanto seguís viendo tus propias tareas en Mi SIG.
        </p>
        {porDefecto && (
          <p className="text-11_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text-soft)' }}>
            Nota para quien administra: el token de esta sesión no trae el claim de grupos,
            así que el rol vino del respaldo configurado y no del Directorio. Configurá el
            claim de grupos en el App Registration para que los permisos sean reales.
          </p>
        )}
        <Link
          href="/"
          className="mt-1 w-fit rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          Ir a Indicadores
        </Link>
      </div>
    </main>
  );
}
