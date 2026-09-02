// app/components/sgsi/EncabezadoSig.tsx
//
// The corporate bar spans the whole Sistema Integrado de Gestión, not just the SGSI
// module: its tabs are the five domains. Both the Indicadores screen and the SIG shells
// render this, so the identity, the role and the tabs come from one place.
//
// It is not in the root layout because the sign-in screen must not carry it.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { rolDesdeGrupos } from '@/lib/sgsi/permisos';
import HeaderCorporativo, { type Pestana } from './HeaderCorporativo';

const TODAS: Pestana[] = [
  { etiqueta: 'Mi SIG', href: '/mi-sig' },
  { etiqueta: 'Indicadores', href: '/' },
  { etiqueta: 'Estratégico', href: '/estrategico/riesgos' },
  { etiqueta: 'SGSI', href: '/sgsi' },
  { etiqueta: 'Operación', href: '/sig/obligaciones' },
];

export default async function EncabezadoSig() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  const usuario = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const cuenta = (session?.user?.email ?? 'usuario').split('@')[0];

  // Un Colaborador ve lo que puede usar y nada más: sus tareas e Indicadores, que es
  // información del SGC abierta a la organización. Estratégico, SGSI y Operación no se
  // renderizan — una pestaña que solo lleva a «no tenés acceso» no informa, frustra.
  const pestanas = rol.grupos.length === 0 ? [TODAS[0], TODAS[1]] : TODAS;

  return (
    <HeaderCorporativo
      usuario={usuario}
      rol=""
      cuenta={`CUANTICO\\${cuenta} · AD`}
      pestanas={pestanas}
    />
  );
}