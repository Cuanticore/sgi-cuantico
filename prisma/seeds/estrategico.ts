// prisma/seeds/estrategico.ts
//
// Catálogos del módulo D según MAN-CAL-01. Idempotente: se puede correr varias veces.
// npx tsx prisma/seeds/estrategico.ts

import { prisma } from '@/lib/db';

async function main() {
  for (const [valor, etiqueta, descripcion, color] of [
    [1, 'Muy baja', 'Casi nunca', '#e6efe9'],
    [2, 'Baja', 'Ocasionalmente', '#eef7f1'],
    [3, 'Media', 'Con cierta frecuencia', '#faf1d3'],
    [4, 'Alta', 'Frecuentemente', '#fbe6d2'],
    [5, 'Muy alta', 'Casi siempre', '#f7dcd9'],
  ] as const) {
    await prisma.escalaProbabilidad.upsert({
      where: { valor },
      update: { etiqueta, descripcion, color },
      create: { valor, etiqueta, descripcion, color },
    });
  }
  for (const [valor, etiqueta, pct, cop] of [
    [1, 'Insignificante', '1', '70000000'],
    [2, 'Menor', '3', '210000000'],
    [3, 'Moderado', '7', '490000000'],
    [4, 'Mayor', '12', '840000000'],
    [5, 'Catastrófico', '20', '1400000000'],
  ] as const) {
    await prisma.escalaImpactoRiesgo.upsert({
      where: { valor },
      update: { etiqueta, porcentajePatrimonio: pct, referenciaCop: cop },
      create: { valor, etiqueta, porcentajePatrimonio: pct, referenciaCop: cop },
    });
  }
  for (const [valor, etiqueta] of [
    [1, 'Menor'],
    [2, 'Moderada'],
    [3, 'Significativa'],
    [4, 'Importante'],
    [5, 'Excepcional'],
  ] as const) {
    await prisma.escalaImpactoOportunidad.upsert({
      where: { valor },
      update: { etiqueta },
      create: { valor, etiqueta },
    });
  }
  for (const nombre of ['Legal', 'Operacional', 'Personal', 'Tecnológico', 'Reputacional', 'Externo']) {
    await prisma.factorRiesgo.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  for (const [nombre, reduce, descripcion] of [
    ['Preventivo', 'PROBABILIDAD', 'Evita que el riesgo ocurra'],
    ['Correctivo', 'IMPACTO', 'Reduce el daño cuando ocurre'],
    ['Preventivo y correctivo', 'AMBOS', 'Actúa antes y después'],
    ['Reforzador', 'PROBABILIDAD', 'Hace más probable la oportunidad'],
    ['Reactivo', 'IMPACTO', 'Definido en el manual; la matriz no lo usa'],
    ['Proactivo', 'AMBOS', 'Refuerza y amplía la oportunidad'],
  ] as const) {
    await prisma.tipoControlRiesgo.upsert({
      where: { nombre },
      update: { reduce, descripcion },
      create: { nombre, reduce, descripcion },
    });
  }
  for (const [nombre, valor, descripcion] of [
    ['Débil', '0.100', 'Reduce el 10 %'],
    ['Moderado', '0.400', 'Reduce el 40 %'],
    ['Fuerte', '0.800', 'Reduce el 80 %'],
  ] as const) {
    await prisma.eficaciaControl.upsert({
      where: { nombre },
      update: { valor, descripcion },
      create: { nombre, valor, descripcion },
    });
  }
  for (const [minimo, maximo, etiqueta, color, accionRiesgo, accionOportunidad] of [
    [0, 4, 'Aceptable', '#0b5c44', 'Aceptar', 'Esperar'],
    [5, 12, 'Moderado', '#c25a1e', 'Mitigar o reducir', 'Mejorar'],
    [13, 25, 'Inaceptable', '#a52016', 'Evitar', 'Explotar'],
  ] as const) {
    await prisma.nivelRiesgo.upsert({
      where: { minimo },
      update: { maximo, etiqueta, color, accionRiesgo, accionOportunidad },
      create: { minimo, maximo, etiqueta, color, accionRiesgo, accionOportunidad },
    });
  }
  console.log('Catálogos de gestión estratégica listos.');
}

main().finally(() => prisma.$disconnect());