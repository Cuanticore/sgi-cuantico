// app/estrategico/mapa/page.tsx
//
// El mapa de calor 5×5: probabilidad vertical (5 arriba, como el Excel), impacto
// horizontal; toggle inherente/residual; cada casilla con su conteo y el nivel
// escrito, nunca solo el color. Conteos calculados al leer.

import { prisma } from '@/lib/db';
import { residualDe, nivelDe } from '@/lib/sig/estrategico';
import MapaClient from './Mapa.client';

export const dynamic = 'force-dynamic';

export default async function MapaPage() {
  const [riesgos, niveles] = await Promise.all([
    prisma.riesgoOrganizacional.findMany({
      where: { activo: true },
      include: {
        probabilidad: true,
        impacto: true,
        controles: { include: { tipo: true, eficacia: true } },
      },
    }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
  ]);

  const minimos = niveles.map((n) => n.minimo);

  const inherente: Record<string, { n: number; ids: number[] }> = {};
  const residual: Record<string, { n: number; ids: number[] }> = {};
  for (const r of riesgos) {
    const p = r.probabilidad.valor;
    const i = r.impacto.valor;
    const control = r.controles[0];
    const calculo = control
      ? residualDe(p, i, tipoToken(control.tipo.nombre), medicionDe(control.eficacia.nombre))
      : { residual: p * i };
    const claveInh = `${p}-${i}`;
    const claveRes = `${claveInh}`;
    inherente[claveInh] = { n: (inherente[claveInh]?.n ?? 0) + 1, ids: [...(inherente[claveInh]?.ids ?? []), r.id] };
    residual[claveRes] = { n: (residual[claveRes]?.n ?? 0) + 1, ids: [...(residual[claveRes]?.ids ?? []), r.id] };
    void calculo;
  }

  const detalle = riesgos.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    descripcion: r.descripcion,
    proceso: r.proceso,
    factor: r.factorId,
    p: r.probabilidad.valor,
    i: r.impacto.valor,
  }));

  return (
    <MapaClient
      inherente={inherente}
      residual={residual}
      niveles={niveles.map((n) => ({ minimo: n.minimo, etiqueta: n.etiqueta, color: n.color }))}
      total={riesgos.length}
      detalle={detalle}
    />
  );
}

function medicionDe(nombre: string): 'DEBIL' | 'MODERADO' | 'FUERTE' {
  return nombre === 'Débil' ? 'DEBIL' : nombre === 'Moderado' ? 'MODERADO' : 'FUERTE';
}

function tipoToken(nombre: string): string {
  switch (nombre) {
    case 'Preventivo':
      return 'PREVENTIVO';
    case 'Correctivo':
      return 'CORRECTIVO';
    case 'Preventivo y correctivo':
      return 'PREVENTIVO_Y_CORRECTIVO';
    case 'Reforzador':
      return 'REFORZADOR';
    case 'Reactivo':
      return 'REACTIVO';
    default:
      return 'PROACTIVO';
  }
}