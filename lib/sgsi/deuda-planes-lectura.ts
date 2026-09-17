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
  const [crudas, bandas, criterioCritico] = await Promise.all([
    // El código del control, no su id: `construirResolverDeuda` compara contra el código del
    // control principal que trae el riesgo, y los ids no cruzan el límite servidor→cliente.
    prisma.accionPlan.findMany({
      select: { activa: true, origen: true, control: { select: { codigo: true } } },
    }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.criterioAceptacion.findFirst({ where: { umbralRiesgo: { nombre: 'Crítico' } } }),
  ]);

  const acciones: AccionPlanParaDeuda[] = crudas.map((a) => ({
    activa: a.activa,
    origen: a.origen,
    controlCodigo: a.control?.codigo ?? null,
  }));

  const resolverDeuda = construirResolverDeuda(acciones);

  const critica = bandas.find((b) => b.nombre === 'Crítico');
  if (!critica || !criterioCritico) return { acciones, filas: [] };

  const [riesgosCriticos, principales] = await Promise.all([
    prisma.riesgo.findMany({
      where: { obsoleto: false, riesgoResidual: { gte: critica.desde } },
      select: {
        activo: { select: { codigo: true, nombre: true } },
        amenaza: { select: { codigo: true, nombre: true } },
        calculos: { select: { calculadoEn: true, riesgoResidual: true } },
      },
    }),
    // El control principal de cada amenaza. Se lee una vez y se indexa, en vez de anidarlo en
    // la consulta de riesgos: son 57 amenazas contra cientos de riesgos, y la relevancia es
    // de la amenaza, no del par.
    prisma.controlAmenaza.findMany({
      where: { relevancia: { esPrincipal: true } },
      select: { amenaza: { select: { codigo: true } }, control: { select: { codigo: true } } },
    }),
  ]);

  const principalDeAmenaza = new Map(
    principales.map((p) => [p.amenaza.codigo, p.control.codigo]),
  );

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
      principalCodigo: principalDeAmenaza.get(r.amenaza.codigo) ?? null,
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
