// app/components/sgsi/EncabezadoSig.tsx
//
// The corporate bar spans the whole Sistema Integrado de Gestión, not just the SGSI
// module: its tabs are the two domains. Both the Indicadores screen and the SGSI shell
// render this, so the identity, the role and the tabs come from one place.
//
// It is not in the root layout because the sign-in screen must not carry it.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import HeaderCorporativo from './HeaderCorporativo';

export default async function EncabezadoSig() {
  const session = await getServerSession(authOptions);

  const usuario = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const cuenta = (session?.user?.email ?? 'usuario').split('@')[0];

  // The methodology role name is not shown in the bar.
  //
  // "Líder del SIG" is what the permission table calls the SIG-Seguridad group — a row in
  // MET-SIG-01, not a title the person signed in holds. Printed next to their own account
  // it read as if the application were granting them the position. What the session
  // actually permits is still stated in words, in the sidebar footer, where an auditor
  // looks for it.
  return (
    <HeaderCorporativo
      usuario={usuario}
      rol=""
      cuenta={`CUANTICO\\${cuenta} · AD`}
    />
  );
}
