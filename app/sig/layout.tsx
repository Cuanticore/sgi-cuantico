// app/sig/layout.tsx
//
// El gate de Operación: sin `operacion:ver` no se alcanza ninguna pantalla del numeral
// 8, por llamada directa o por navegación. Igual criterio que el layout del SGSI: una
// sola compuerta, no once recuerdos.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos, nombreDelRol } from '@/lib/sgsi/permisos';
import { prisma } from '@/lib/db';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import SidebarOperacion, { type ContadoresOperacion } from '@/app/components/sig/SidebarOperacion';

export const dynamic = 'force-dynamic';

export default async function SigLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos, session?.user?.email);

  if (!puede(rol, 'operacion:ver')) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
        <main className="px-8 pt-10 pb-14">
          <div
            className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
            style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
          >
            <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
              No tenés acceso a Operación
            </h1>
            <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
              Tu cuenta no pertenece a un grupo del Directorio con permiso para administrar
              las obligaciones del SIG. Podés ver tus propias tareas en Mi SIG.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const correo = (session?.user?.email ?? '').toLowerCase();
  const [persona, obligaciones, asignaciones, contenidos, personas] = await Promise.all([
    prisma.persona.findUnique({ where: { correo }, select: { nombre: true } }),
    prisma.obligacion.count({ where: { activa: true } }),
    prisma.asignacion.count(),
    prisma.contenidoSig.count({ where: { activo: true } }),
    prisma.persona.count({ where: { activa: true } }),
  ]);

  const contadores: ContadoresOperacion = {
    obligaciones,
    tareas: asignaciones,
    contenidos,
    personas,
    periodo: periodoActual(),
    usuario: persona?.nombre ?? session?.user?.name ?? 'Usuario',
    cuenta: `CUANTICO\\${(session?.user?.email ?? 'usuario').split('@')[0]} · AD`,
    permisos: `Sesión iniciada con Directorio Activo · grupo ${rol.grupos.join(', ')} · ${nombreDelRol(rol)}`,
  };

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <div className="flex items-start">
        <SidebarOperacion contadores={contadores} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function periodoActual(): string {
  const hoy = new Date();
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const mes = meses[hoy.getUTCMonth()];
  return `${mes[0].toUpperCase()}${mes.slice(1)} de ${hoy.getUTCFullYear()}`;
}