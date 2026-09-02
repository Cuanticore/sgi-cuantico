// app/mi-sig/reportar/page.tsx
//
// B3: cualquiera reporta. El hallazgo nace sin clasificar y no consume plazos; el líder del
// SIG lo clasifica después.
//
// Vive bajo /mi-sig y no bajo /sig porque reportar es un acto personal, no una tarea de
// Operación. Estuvo en `/sig/hallazgos/nuevo`, y ahí el layout de Operación la cerraba con
// `operacion:ver` — un permiso que el Colaborador no tiene. El resultado era que
// `mejora:reportar` existía en el modelo y ninguna ruta lo honraba: la acción de servidor
// aceptaba a cualquiera con sesión, y la pantalla para invocarla era inalcanzable.
//
// La grilla de hallazgos SÍ es de Operación y se queda donde está.

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