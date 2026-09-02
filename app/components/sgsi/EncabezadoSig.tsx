// app/components/sgsi/EncabezadoSig.tsx
//
// The corporate bar spans the whole Sistema Integrado de Gestión, not just the SGSI
// module: its tabs are the five domains. Both the Indicadores screen and the SIG shells
// render this, so the identity, the role and the tabs come from one place.
//
// It is not in the root layout because the sign-in screen must not carry it.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos, type Permiso } from '@/lib/sgsi/permisos';
import HeaderCorporativo, { type Pestana } from './HeaderCorporativo';

/// Cada pestaña con el permiso que la habilita. `null` es abierta a toda la organización:
/// Mi SIG son las tareas propias, e Indicadores es el tablero del SGC, que existía antes de
/// que hubiera módulos con permisos y no se cierra ahora.
///
/// Se filtra por PERMISO y no por cantidad de grupos. Con el filtro anterior —«¿tiene algún
/// grupo?»— bastaba con que alguien quedara sin grupo para esconderle todo, y con que
/// tuviera uno para mostrarle todo, incluidas pestañas que solo llevan a «no tenés acceso».
/// Una pestaña que no lleva a ninguna parte no informa: frustra.
const TODAS: { pestana: Pestana; permiso: Permiso | null }[] = [
  { pestana: { etiqueta: 'Mi SIG', href: '/mi-sig' }, permiso: null },
  { pestana: { etiqueta: 'Indicadores', href: '/' }, permiso: null },
  { pestana: { etiqueta: 'Estratégico', href: '/estrategico/riesgos' }, permiso: 'estrategico:ver' },
  { pestana: { etiqueta: 'SGSI', href: '/sgsi' }, permiso: 'sgsi:ver' },
  { pestana: { etiqueta: 'Operación', href: '/sig/obligaciones' }, permiso: 'operacion:ver' },
];

export default async function EncabezadoSig() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  const usuario = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const cuenta = (session?.user?.email ?? 'usuario').split('@')[0];

  const pestanas = TODAS.filter(({ permiso }) => permiso === null || puede(rol, permiso)).map(
    ({ pestana }) => pestana,
  );

  return (
    <HeaderCorporativo
      usuario={usuario}
      rol=""
      cuenta={`CUANTICO\\${cuenta} · AD`}
      pestanas={pestanas}
    />
  );
}