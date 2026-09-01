// app/sig/hallazgos/nuevo/page.tsx
//
// B3: cualquiera reporta. El hallazgo nace sin clasificar y no consume plazos;
// el líder del SIG lo clasifica después. La pantalla de reporte vive fuera del
// gate de la grilla porque hasta el Colaborador puede reportar.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import ReportarHallazgoClient from './Reportar.client';

export const dynamic = 'force-dynamic';

export default async function ReportarHallazgoPage() {
  const session = await getServerSession(authOptions);
  const areas = await prisma.area.findMany({
    where: { activa: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
  const correo = (session?.user?.email ?? '').toLowerCase();

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-8 pb-16 pt-8">
        <h1 className="text-23 font-bold text-primary">Reportar hallazgo</h1>
        <p className="mt-1 text-12_5 text-muted">
          Cualquiera reporta; el líder del SIG clasifica (B3). Un reporte sin clasificar
          existe y es visible, pero no consume plazos.
        </p>
        <ReportarHallazgoClient
          correo={correo}
          areas={areas.map((a) => ({ id: a.id, nombre: a.nombre }))}
        />
      </main>
    </div>
  );
}