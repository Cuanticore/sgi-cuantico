// app/components/sgsi/ShellSig.tsx
//
// The shell of the Sistema Integrado de Gestión: corporate header across the top, sidebar
// beneath it, content to the right.
//
// It wraps BOTH domains, not just the SGSI module. In the prototype the sidebar is always
// present — its first group is Indicadores and Resumen SGSI — and only the main area
// changes. Rendering the menu on one domain and not the other would make them look like
// two applications behind the same login, which is exactly what v2.1 set out to undo.
//
// Counters come from the database, so a figure in the navigation can never disagree with
// the screen it links to — but ONLY for a session that may see the module. The shell wraps
// both the SGSI screens and the «sin acceso» notice, so without that condition the sidebar
// told a denied account how many assets and risks the register holds. Aggregate counts are
// a modest disclosure next to the register itself, and they are still a disclosure: the
// number of assets under management is not something to hand out with a mailbox.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { getIndicatorsData } from '@/app/lib/data';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import EncabezadoSig from './EncabezadoSig';
import SidebarSgsi, { type Contadores } from './SidebarSgsi';

export default async function ShellSig({ children }: { children: React.ReactNode }) {
  const [session, activos, riesgos, controles, planes, amenazas, lineaBase, indicadores] =
    await Promise.all([
      getServerSession(authOptions),
      prisma.activo.count({ where: { activo: true } }),
      prisma.riesgo.count({ where: { obsoleto: false } }),
      prisma.control.count(),
      prisma.accionPlan.count({ where: { activa: true } }),
      prisma.amenaza.count({ where: { activa: true } }),
      prisma.lineaBase.findFirst({ orderBy: { fecha: 'desc' } }),
      // The Indicadores entry carries its own count, and it comes from SharePoint. A
      // failure there must not take the whole shell down: the menu just shows no number.
      getIndicatorsData()
        .then((d) => d.indicadores.length)
        .catch(() => 0),
    ]);

  const rol = rolDesdeGrupos(session?.user?.grupos);
  const usuario = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const cuenta = (session?.user?.email ?? 'usuario').split('@')[0];

  // A denied session gets the menu without the numbers. The links stay, so the person can
  // still reach Indicadores, and the sidebar footer already says in words that the account
  // belongs to no SIG group.
  const veSgsi = puede(rol, 'sgsi:ver');
  const oculto = (n: number) => (veSgsi ? n : 0);

  const contadores: Contadores = {
    activos: oculto(activos),
    riesgos: oculto(riesgos),
    controles: oculto(controles),
    planes: oculto(planes),
    amenazas: oculto(amenazas),
    indicadores,
    lineaBase: veSgsi ? (lineaBase?.nombre ?? 'sin establecer') : 'sin acceso',
    usuario,
    cuenta: `CUANTICO\\${cuenta}`,
    // The methodology role name is deliberately NOT shown. "Líder del SIG" is what the
    // permission table calls the SIG-Seguridad group, not a title this person holds, and
    // printing it beside their own name read as if the application were assigning it.
    rol: '',
    // What the session actually grants, said plainly. An auditor reads this line before
    // anything else on the screen. The fallback is gone: with the floor set to Colaborador
    // (see lib/sgsi/permisos.ts), the note about the server configuration never shows.
    // WHERE the role came from, not only what it grants.
    //
    // Every session that reaches this screen has a recognised Directory group — the
    // Colaborador floor is handled upstream — so this line always reads the group
    // membership, never a server-side fallback.
    permisos: rol.grupos.length
      ? `${
          rol.esPorDefecto
            ? 'Acceso abierto a cualquier cuenta autenticada: el rol NO viene de un grupo del Directorio, viene de la configuración del servidor'
            : `Sesión iniciada con Directorio Activo · grupo ${rol.grupos.join(', ')}`
        } · ${
          puede(rol, 'sgsi:escribir')
            ? 'lectura y escritura'
            : puede(rol, 'activo:valorar')
              ? 'valorar y tratar'
              : 'solo lectura'
        }`
      : 'Sin acceso al SGSI: tu cuenta no pertenece a ningún grupo del SIG.',
  };

  return (
    <div className="min-h-screen bg-app">
      <EncabezadoSig />
      <div className="flex items-start">
        <SidebarSgsi contadores={contadores} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
