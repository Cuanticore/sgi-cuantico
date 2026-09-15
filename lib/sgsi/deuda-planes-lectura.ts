import 'server-only';

// lib/sgsi/deuda-planes-lectura.ts
//
// REQ-SIG-20 §7 (P2, D4) · la lectura detrás de `lib/sgsi/deuda-planes.ts` (puro, sin
// Prisma, y probado en `__tests__/deuda-planes.test.ts`). Las TRES pantallas que necesitan
// la deuda de planes —`/sgsi/planes`, el inventario y la página de análisis— llaman a esta
// ÚNICA función en vez de repetir la consulta cada una a su manera: dos consultas
// independientes de la misma cosa es exactamente el defecto que este cambio persigue en
// cada corte.
//
// `acciones` viaja crudo (activa + origen) porque la página de análisis reescopa sus seis
// filtros y sus cinco tarjetas del lado del cliente, sin ida y vuelta al servidor
// (REQ-SIG-18 §7.1) — y una función no cruza el límite servidor→cliente. Esa pantalla
// reconstruye el MISMO `ResolverDeudaPlan` con `construirResolverDeuda(acciones)`, la misma
// función pura, nunca una segunda derivación.
//
// `filas` viaja ya resuelto (antigüedad incluida) porque es exactamente lo que
// `FranjaSinPlan.tsx` y el punto ámbar necesitan, y caminar la racha de `RiesgoCalculo` no
// es algo que la pantalla deba repetir por su cuenta.

import { prisma } from '@/lib/db';
import {
  activosSinPlan,
  construirResolverDeuda,
  type AccionPlanParaDeuda,
  type FilaSinPlan,
} from './deuda-planes';

export interface DeudaPlanesLeida {
  acciones: AccionPlanParaDeuda[];
  /// Ordenadas por antigüedad descendente (`activosSinPlan`). Vacío cuando no hay banda
  /// Crítico parametrizada o ningún riesgo alcanza esa banda — nunca un error.
  filas: FilaSinPlan[];
}

export async function leerDeudaPlanes(): Promise<DeudaPlanesLeida> {
  const [acciones, bandas, criterioCritico] = await Promise.all([
    prisma.accionPlan.findMany({ select: { activa: true, origen: true } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.criterioAceptacion.findFirst({ where: { umbralRiesgo: { nombre: 'Crítico' } } }),
  ]);

  const resolverDeuda = construirResolverDeuda(acciones);

  const critica = bandas.find((b) => b.nombre === 'Crítico');
  if (!critica || !criterioCritico) return { acciones, filas: [] };

  const riesgosCriticos = await prisma.riesgo.findMany({
    where: { obsoleto: false, riesgoResidual: { gte: critica.desde } },
    select: {
      activo: { select: { codigo: true, nombre: true } },
      amenaza: { select: { codigo: true, nombre: true } },
      calculos: { select: { calculadoEn: true, riesgoResidual: true } },
    },
  });

  const bandasPuras = bandas.map((b) => ({
    nombre: b.nombre,
    desde: b.desde.toString(),
    hasta: b.hasta.toString(),
    orden: b.orden,
  }));

  const riesgosParaDeuda = riesgosCriticos
    .filter((r) => r.activo.codigo !== null)
    .map((r) => ({
      activoCodigo: r.activo.codigo as string,
      activoNombre: r.activo.nombre,
      amenazaCodigo: r.amenaza.codigo,
      amenazaNombre: r.amenaza.nombre,
      calculos: r.calculos.map((c) => ({
        calculadoEn: c.calculadoEn,
        riesgoResidual: c.riesgoResidual.toString(),
      })),
    }));

  const filas = activosSinPlan(
    riesgosParaDeuda,
    bandasPuras,
    resolverDeuda,
    criterioCritico.plazoPlan,
    new Date(),
  );

  return { acciones, filas };
}
