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
/// Las SEIS del lienzo `handoff_a/design/Navegacion.dc.html`, en su orden.
///
/// «Operación» pasó a llamarse **Actividades** el 02/09/2026. El motivo es que «operación»
/// estaba tomada tres veces —el numeral 8 de las normas, la pestaña, y el módulo del SGSI
/// que agrupa eventos, verificaciones y solicitudes— y tres cosas con el mismo nombre en la
/// misma barra no se distinguen al hablar. Con la pestaña renombrada, «Operación del SGSI»
/// conserva su nombre porque ya no colisiona: es una sección dentro de SGSI.
///
/// **El cambio es de nombre visible, no de vocabulario interno.** Las claves de permiso
/// siguen siendo `operacion:*` y las rutas siguen siendo `/sig/...`. Renombrarlas obligaría
/// a tocar todos los archivos de acciones sin ganar nada funcional, y una clave a medio
/// renombrar es un permiso que no concede nada.
///
/// «SGSI» pasa a llamarse **SIG** y absorbe Indicadores: el lienzo mete el tablero del SGC
/// dentro de esta pestaña, no como pestaña propia.
///
/// Dos pestañas nuevas —Tecnología y Personas— apuntan a su primera pantalla construida.
/// Tecnología estuvo deshabilitada hasta que REQ-SIG-06 tuvo su primera ruta: una pestaña
/// que no lleva a ninguna parte no informa, frustra. Ahora lleva al mapa tecnológico y usa
/// su propio permiso, `tecnologia:ver`, en vez de pedir prestado el del SGSI.
const TODAS: { pestana: Pestana; permiso: Permiso | null }[] = [
  { pestana: { etiqueta: 'Mi SIG', href: '/mi-sig' }, permiso: null },
  { pestana: { etiqueta: 'SIG', href: '/sgsi' }, permiso: 'sgsi:ver' },
  { pestana: { etiqueta: 'Actividades', href: '/sig/obligaciones' }, permiso: 'operacion:ver' },
  { pestana: { etiqueta: 'Estratégico', href: '/estrategico/mapa' }, permiso: 'estrategico:ver' },
  { pestana: { etiqueta: 'Tecnología', href: '/tecnologia/mapa' }, permiso: 'tecnologia:ver' },
  { pestana: { etiqueta: 'Personas', href: '/sig/personas' }, permiso: 'operacion:administrar' },
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