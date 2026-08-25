// prisma/seeds/escalas.ts
//
// Reference tables. The scales themselves come from the workbook's "Escalas MAGERIT"
// sheet rather than from the methodology's prose: the threat and asset rows reference
// these labels verbatim, so a transcription that reads well but differs by a word
// ("Muy baja — excepcional" against "Muy baja — excepcional, cada muchos años") breaks
// every lookup.
//
// What the workbook does not carry — dimensions, relevance, parameters and the
// acceptance criteria — comes from MET-SIG-01 v3.
//
// All of it is parametrizable on purpose: the organisation reserves the right to return
// to five dimensions or to a 0-10 scale without a deployment.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

const DATA = join(process.cwd(), 'prisma', 'data');

interface EscalasLibro {
  valor: { etiqueta: string; valor: number }[];
  degradacion: { grado: string; fraccion: number; lectura: string }[];
  frecuencia: { etiqueta: string; vecesPorAno: number; lectura: string }[];
  madurez: { nivel: string; eficacia: number; lectura: string }[];
  umbralImpacto: { nivel: string; desde: number; hasta: number }[];
  umbralRiesgo: { nivel: string; desde: number; hasta: number }[];
}

export async function seedEscalas(prisma: PrismaClient): Promise<void> {
  const libro: EscalasLibro = JSON.parse(
    readFileSync(join(DATA, 'escalas.json'), 'utf8'),
  );

  // MAGERIT defines five dimensions; Cuantico declares a deviation and works with the
  // first three. A and T stay modelled but inactive so the decision is reversible.
  const dimensiones = [
    { codigo: 'D', nombre: 'Disponibilidad', activa: true, orden: 1 },
    { codigo: 'I', nombre: 'Integridad', activa: true, orden: 2 },
    { codigo: 'C', nombre: 'Confidencialidad', activa: true, orden: 3 },
    { codigo: 'A', nombre: 'Autenticidad', activa: false, orden: 4 },
    { codigo: 'T', nombre: 'Trazabilidad', activa: false, orden: 5 },
  ];
  for (const d of dimensiones) {
    await prisma.dimension.upsert({ where: { codigo: d.codigo }, update: d, create: d });
  }

  for (const [i, v] of libro.valor.entries()) {
    const datos = { etiqueta: v.etiqueta, valor: v.valor, orden: i + 1 };
    await prisma.escalaValor.upsert({ where: { valor: v.valor }, update: datos, create: datos });
  }

  // Scales are seeded by ORDEN, not by label. The label is the thing most likely to be
  // reworded, and upserting on it creates a NEW row on every rewrite instead of updating
  // the old one — which is exactly how escala_frecuencia ended up with nine rows for five
  // levels, and a duplicate-key crash on the risk matrix.
  for (const [i, d] of libro.degradacion.entries()) {
    const datos = { nombre: d.grado, factor: d.fraccion, lectura: d.lectura, orden: i + 1 };
    await prisma.escalaDegradacion.upsert({ where: { orden: i + 1 }, update: datos, create: datos });
  }

  for (const [i, f] of libro.frecuencia.entries()) {
    const datos = { nombre: f.etiqueta, vecesAno: f.vecesPorAno, orden: i + 1 };
    await prisma.escalaFrecuencia.upsert({ where: { orden: i + 1 }, update: datos, create: datos });
  }

  // The workbook writes the level as "L3 — Proceso definido"; the number is what the
  // arithmetic indexes by, so both are kept.
  for (const m of libro.madurez) {
    const encontrado = /^L(\d)\s*—\s*(.+)$/.exec(m.nivel);
    if (!encontrado) throw new Error(`Nivel de madurez ilegible: ${m.nivel}`);
    const datos = {
      nivel: Number(encontrado[1]),
      nombre: encontrado[2].trim(),
      eficacia: m.eficacia,
      lectura: m.lectura,
    };
    await prisma.escalaMadurez.upsert({ where: { nivel: datos.nivel }, update: datos, create: datos });
  }

  for (const [i, u] of libro.umbralImpacto.entries()) {
    const datos = { nombre: u.nivel, desde: u.desde, hasta: u.hasta, orden: i + 1 };
    await prisma.umbralImpacto.upsert({ where: { orden: i + 1 }, update: datos, create: datos });
  }

  for (const [i, u] of libro.umbralRiesgo.entries()) {
    const datos = { nombre: u.nivel, desde: u.desde, hasta: u.hasta, orden: i + 1 };
    await prisma.umbralRiesgo.upsert({ where: { orden: i + 1 }, update: datos, create: datos });
  }

  // MET-SIG-01 section 7.4. Not in the workbook: today it aggregates with a plain mean,
  // which the methodology replaces with this weighted-and-capped rule.
  const relevancias = [
    {
      nombre: 'Principal',
      peso: 3,
      esPrincipal: true,
      criterio: 'Sin este control la amenaza no se contiene. Cada amenaza tiene exactamente uno.',
      orden: 1,
    },
    {
      nombre: 'Complementario',
      peso: 2,
      esPrincipal: false,
      criterio: 'Reduce la amenaza de forma sustantiva, pero no sustituye al principal.',
      orden: 2,
    },
    {
      nombre: 'De apoyo',
      peso: 1,
      esPrincipal: false,
      criterio: 'Ayuda por vía administrativa o cultural.',
      orden: 3,
    },
  ];
  for (const r of relevancias) {
    await prisma.relevanciaControl.upsert({ where: { nombre: r.nombre }, update: r, create: r });
  }

  const tratamientos = [
    { nombre: 'Mitigar', orden: 1 },
    { nombre: 'Transferir', orden: 2 },
    { nombre: 'Evitar', orden: 3 },
    { nombre: 'Aceptar y monitorear', orden: 4 },
  ];
  for (const t of tratamientos) {
    await prisma.tratamientoRiesgo.upsert({ where: { nombre: t.nombre }, update: t, create: t });
  }

  const estados = [
    { nombre: 'No iniciado', orden: 1 },
    { nombre: 'En ejecución', orden: 2 },
    { nombre: 'Implementado', orden: 3 },
    { nombre: 'Cerrado', orden: 4 },
  ];
  for (const e of estados) {
    await prisma.estadoTratamiento.upsert({ where: { nombre: e.nombre }, update: e, create: e });
  }

  const parametros = [
    { clave: 'umbral_valoracion', valor: '4', descripcion: 'Un activo entra al análisis si su valor lo alcanza' },
    { clave: 'delta_techo_eficacia', valor: '0.05', descripcion: 'Margen δ sobre la eficacia del control principal' },
    { clave: 'metrica_indice', valor: 'media_eficacia', descripcion: 'El índice de madurez es la media de la eficacia, no del nivel' },
    { clave: 'borrado_fisico', valor: 'false', descripcion: 'Toda baja es lógica; la bitácora es inmutable' },
    { clave: 'periodicidad_revision_completa', valor: 'anual', descripcion: null },
    { clave: 'periodicidad_revision_parcial', valor: 'semestral', descripcion: 'La madurez se reevalúa cada seis meses' },
    { clave: 'zona_horaria', valor: 'America/Bogota', descripcion: null },
  ];
  for (const p of parametros) {
    await prisma.parametro.upsert({
      where: { clave: p.clave },
      update: { valor: p.valor, descripcion: p.descripcion },
      create: p,
    });
  }

  // Deadlines are pending ratification by the SIG Committee, so the rows carry
  // ratificado = false rather than being presented as settled.
  const criterios = [
    { umbral: 'Crítico', decision: 'No aceptable — mitigar o evitar', plazoPlan: '15 días', plazoEjecucion: '3 meses', aprueba: 'Comité del SIG' },
    { umbral: 'Alto', decision: 'Mitigar o transferir', plazoPlan: '30 días', plazoEjecucion: '6 meses', aprueba: 'Líder del SIG y Comité' },
    { umbral: 'Medio', decision: 'Mitigar, o aceptar con justificación', plazoPlan: '60 días', plazoEjecucion: '12 meses', aprueba: 'Líder del SIG' },
    { umbral: 'Bajo', decision: 'Aceptar y monitorear', plazoPlan: 'No requiere', plazoEjecucion: 'Revisión anual', aprueba: 'Propietario del activo' },
  ];
  for (const c of criterios) {
    const umbral = await prisma.umbralRiesgo.findUnique({ where: { nombre: c.umbral } });
    if (!umbral) throw new Error(`Umbral de riesgo no encontrado: ${c.umbral}`);
    const datos = {
      decision: c.decision,
      plazoPlan: c.plazoPlan,
      plazoEjecucion: c.plazoEjecucion,
      aprueba: c.aprueba,
      ratificado: false,
    };
    await prisma.criterioAceptacion.upsert({
      where: { umbralRiesgoId: umbral.id },
      update: datos,
      create: { umbralRiesgoId: umbral.id, ...datos },
    });
  }
}
