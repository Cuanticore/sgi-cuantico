// app/estrategico/layout.tsx
//
// El gate de Estratégico: sin `estrategico:ver` no se alcanza ninguna pantalla del
// módulo. La alta dirección mira esto; un Colaborador no.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos, nombreDelRol } from '@/lib/sgsi/permisos';
import { prisma } from '@/lib/db';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import SidebarEstrategico, { type ContadoresEstrategico } from '@/app/components/sig/SidebarEstrategico';

export const dynamic = 'force-dynamic';

export default async function EstrategicoLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  if (!puede(rol, 'estrategico:ver')) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
        <main className="px-8 pt-10 pb-14">
          <div
            className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
            style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
          >
            <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
              No tenés acceso a Gestión estratégica
            </h1>
            <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
              Tu cuenta no pertenece a un grupo del Directorio con permiso para ver la
              matriz estratégica. Podés ver tus propias tareas en Mi SIG.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const correo = (session?.user?.email ?? '').toLowerCase();
  const [persona, partes, requisitos, riesgos, materializaciones, lineaBase] = await Promise.all([
    prisma.persona.findUnique({ where: { correo }, select: { nombre: true } }),
    prisma.parteInteresada.count({ where: { activa: true } }),
    prisma.requisitoLegal.count({ where: { vigente: true } }),
    prisma.riesgoOrganizacional.count({ where: { activo: true } }),
    prisma.materializacionRiesgo.count(),
    prisma.lineaBase.findFirst({ orderBy: { fecha: 'desc' } }),
  ]);

  const contadores: ContadoresEstrategico = {
    partes,
    requisitos,
    riesgos,
    materializaciones,
    lineaBase: lineaBase?.nombre ?? 'sin congelar',
    usuario: persona?.nombre ?? session?.user?.name ?? 'Usuario',
    cuenta: `CUANTICO\\${(session?.user?.email ?? 'usuario').split('@')[0]} · AD`,
    permisos: `Sesión iniciada con Directorio Activo · grupo ${rol.grupos.join(', ')} · ${nombreDelRol(rol)}`,
  };

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <div className="flex items-start">
        <SidebarEstrategico contadores={contadores} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}