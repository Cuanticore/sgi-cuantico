// app/sig/programa/page.tsx
//
// FOR-CAL-04: la grilla proceso × mes con el estado de cada casilla (ejecutada,
// programada o vencida) calculado contra las fechas (C7).

import { prisma } from '@/lib/db';
import ProgramaClient from './Programa.client';

export const dynamic = 'force-dynamic';

export default async function ProgramaPage() {
  const programas = await prisma.programaAuditoria.findMany({
    orderBy: { anio: 'desc' },
    include: {
      programadas: {
        include: {
          responsable: { select: { nombre: true } },
          auditorias: { select: { fechaInicio: true, emitidoEn: true, cerradaEn: true } },
        },
      },
    },
  });

  const programa = programas[0] ?? null;
  const filas = (programa?.programadas ?? []).map((p) => {
    const auditorias = p.auditorias;
    const ejecutadas = auditorias.filter((a) => a.cerradaEn || a.emitidoEn);
    const meses = p.meses.split(',').map(Number);
    return {
      id: p.id,
      proceso: p.procesoRef,
      meses,
      ejecutadas: ejecutadas.length,
      total: auditorias.length,
      tipo: p.tipo,
      responsable: p.responsable.nombre,
      plazo: p.plazoInformeDias,
      vencida: auditorias.length === 0,
    };
  });

  return (
    <ProgramaClient
      anio={programa?.anio ?? null}
      alcance={programa?.alcance ?? null}
      objetivo={programa?.objetivo ?? null}
      criterios={programa?.criterios ?? null}
      metodos={programa?.metodos ?? null}
      filas={filas}
    />
  );
}