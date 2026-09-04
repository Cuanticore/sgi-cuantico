// app/sig/plazos/page.tsx
//
// Los días que tiene cada cosa para resolverse. **Ninguno está en el código**: cambiar un
// plazo no debe requerir un despliegue, y hasta ahora los de hallazgo sólo se podían tocar
// entrando a la base a mano.
//
// Dos relojes distintos, y el sistema tiene que saber cuál usa cada cosa:
// el plazo de un hallazgo corre desde que **se clasifica** —hasta entonces no consume plazo
// porque nadie sabe todavía qué es—, y el de una vulnerabilidad desde que **se notifica al
// proveedor**, según FOR-LCO-05. Contarlos con el mismo reloj descuadra los vencimientos
// contra lo que dice el contrato.

import { prisma } from '@/lib/db';
import PlazosClient from './Plazos.client';

export const dynamic = 'force-dynamic';

const CLAVES_VULNERABILIDAD = [
  'desarrollo_plazo_critica_horas',
  'desarrollo_plazo_alta_dias',
  'desarrollo_plazo_media_dias',
  'desarrollo_plazo_baja_dias',
  'desarrollo_severidad_bloquea',
];

export default async function PlazosPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  const [plazos, parametros] = await Promise.all([
    prisma.plazoPorTipoHallazgo.findMany(),
    prisma.parametro.findMany({ where: { clave: { in: CLAVES_VULNERABILIDAD } } }),
  ]);

  // El orden de gravedad, no el alfabético: una lista de plazos ordenada por nombre pone la
  // oportunidad de mejora antes que la no conformidad mayor.
  const ORDEN = ['NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD'] as const;

  return (
    <PlazosClient
      pestana={t ?? 'hallazgos'}
      hallazgos={ORDEN.map((tipo) => {
        const p = plazos.find((x) => x.tipo === tipo) ?? null;
        return {
          tipo,
          diasAnalisis: p?.diasAnalisis ?? null,
          diasEjecucion: p?.diasEjecucion ?? null,
          diasVerificacion: p?.diasVerificacion ?? null,
          actualizado: p?.actualizadoEn.toISOString().slice(0, 10) ?? null,
        };
      })}
      vulnerabilidades={Object.fromEntries(parametros.map((p) => [p.clave, p.valor]))}
    />
  );
}
