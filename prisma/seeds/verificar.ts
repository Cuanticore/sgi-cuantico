// prisma/seeds/verificar.ts
//
// Re-reads the seeded database and checks it against the reference figures published in
// the workbook's "5. Madurez y Progreso" sheet.
//
// These are acceptance criteria, not guidance. The same numbers are asserted a second
// time as a pure unit test over the fixture: one check proves the arithmetic, this one
// proves the arithmetic AND the seed AND the schema agree.

import type { PrismaClient } from '@prisma/client';
import { metricasMadurez, type ControlMadurez } from '../../lib/sgsi/madurez';

interface Esperado {
  etiqueta: string;
  esperado: number;
  obtenido: number;
  tolerancia: number;
}

export async function verificarMetricas(prisma: PrismaClient): Promise<boolean> {
  const filas = await prisma.control.findMany({
    include: { lineaBase: true, actual: true, objetivo: true },
  });

  if (filas.length === 0) {
    console.log('  sin controles sembrados, se omite la verificación');
    return true;
  }

  const controles: ControlMadurez[] = filas.map((c) => ({
    soa: c.soa === 'PARCIAL' ? 'parcial' : c.soa === 'NO' ? 'no' : 'si',
    lineaBase: c.lineaBase?.nivel ?? null,
    actual: c.actual?.nivel ?? null,
    objetivo: c.objetivo?.nivel ?? null,
  }));

  const m = metricasMadurez(controles);

  const checks: Esperado[] = [
    { etiqueta: 'Controles', esperado: 93, obtenido: m.total, tolerancia: 0 },
    { etiqueta: 'Aplicables', esperado: 86, obtenido: m.aplicables, tolerancia: 0 },
    { etiqueta: 'No aplicables', esperado: 7, obtenido: m.noAplicables, tolerancia: 0 },
    { etiqueta: 'Índice de madurez (%)', esperado: 86.7, obtenido: m.indice, tolerancia: 0.05 },
    { etiqueta: 'Nivel típico (mediana)', esperado: 3.0, obtenido: m.nivelTipico, tolerancia: 0.005 },
    { etiqueta: 'Nivel medio (referencia)', esperado: 3.23, obtenido: m.nivelMedio, tolerancia: 0.005 },
    { etiqueta: 'En L3 o superior', esperado: 75, obtenido: m.enL3, tolerancia: 0 },
    { etiqueta: '% en L3 o superior', esperado: 87.2, obtenido: m.pctL3, tolerancia: 0.05 },
    { etiqueta: 'Cumplen objetivo', esperado: 26, obtenido: m.enObjetivo, tolerancia: 0 },
    { etiqueta: 'Brechas (L2 o menos)', esperado: 11, obtenido: m.brechas, tolerancia: 0 },
    { etiqueta: 'Avance medio', esperado: 3.1, obtenido: m.avanceMedio, tolerancia: 0.005 },
    { etiqueta: 'Brecha total', esperado: 64, obtenido: m.brechaTotal, tolerancia: 0 },
  ];

  let todoOk = true;
  for (const c of checks) {
    const ok = Math.abs(c.obtenido - c.esperado) <= c.tolerancia;
    if (!ok) todoOk = false;
    const marca = ok ? '✓' : '✗';
    const obtenido = Number.isInteger(c.obtenido) ? String(c.obtenido) : c.obtenido.toFixed(2);
    console.log(
      `  ${marca} ${c.etiqueta.padEnd(26)} esperado ${String(c.esperado).padStart(6)}   obtenido ${obtenido.padStart(6)}`,
    );
  }

  return todoOk;
}
