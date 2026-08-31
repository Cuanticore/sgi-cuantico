'use server';

// app/sig/acciones/envios.ts
//
// El disparo «enviar los resúmenes pendientes hasta hoy» (N7): se puede correr de nuevo
// si el servidor estuvo caído, sin duplicar. También la lectura de ítems para el panel
// de cierre de Mi SIG.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { planificarSemanales, planificarMensuales } from '@/lib/sig/resumen';
import { enviarNotificacion, type EnvioProgramado } from '@/lib/sig/envios';

export interface ResultadoEnvios extends Resultado {
  enviados: number;
  omitidos: number;
  avisos: number;
}

const VACIO = { enviados: 0, omitidos: 0, avisos: 0 };

export async function enviarNotificacionesPendientes(): Promise<ResultadoEnvios> {
  return ejecutar<ResultadoEnvios>(async () => {
    const autor = await autorConPermiso('operacion:escribir');

    const hoy = new Date();
    if (!horaDeEnvio(hoy)) {
      return { ok: true, mensaje: 'Fuera de la hora de envío configurada.', ...VACIO };
    }

    const [personas, asignaciones, obligaciones, areas] = await Promise.all([
      prisma.persona.findMany({
        select: { id: true, correo: true, nombre: true, areaId: true, cargoId: true, activa: true },
      }),
      prisma.asignacion.findMany({
        include: {
          persona: { select: { id: true, correo: true } },
          contenido: true,
          obligacion: { include: { contenido: true } },
        },
      }),
      prisma.obligacion.findMany({ include: { contenido: true } }),
      prisma.area.findMany({ select: { id: true, nombre: true, liderCargoId: true } }),
    ]);

    const correoDe = (personaId: number) =>
      personas.find((p) => p.id === personaId)?.correo ?? '';
    const enviados: EnvioProgramado[] = [];
    let omitidos = 0;
    let avisos = 0;

    // ── Avisos por asignación (NUEVA del periodo vigente, PROXIMIDAD, VENCIMIENTO) ──
    for (const a of asignaciones) {
      if (a.estado !== 'PENDIENTE') continue;
      const contenido = a.contenido ?? a.obligacion?.contenido;
      if (!contenido) continue;
      const notificar = a.obligacion?.notificar ?? true;
      if (!notificar) continue;
      const dias = diaDe(a.fechaLimite) - diaDe(hoy);
      const periodo = a.periodo;
      const correo = correoDe(a.personaId);
      if (!correo) continue;

      const pendiente = await prisma.envioNotificacion.findUnique({
        where: { tipo_periodo_personaId: { tipo: 'NUEVA', periodo, personaId: a.personaId } },
      });

      if (!pendiente) {
        enviados.push({
          tipo: 'NUEVA',
          periodo,
          personaId: a.personaId,
          para: correo,
          asunto: `Nueva tarea del SIG: ${contenido.titulo}`,
          texto: `Tenés una tarea nueva: ${contenido.titulo} (${contenido.codigo}), con vencimiento el ${a.fechaLimite.toISOString().slice(0, 10)}.`,
        });
        avisos += 1;
      }
      if (dias === (a.obligacion?.diasAviso ?? 7)) {
        enviados.push({
          tipo: 'PROXIMIDAD',
          periodo,
          personaId: a.personaId,
          para: correo,
          asunto: `Vence pronto: ${contenido.titulo}`,
          texto: `${contenido.titulo} (${contenido.codigo}) vence en ${dias} día(s).`,
        });
        avisos += 1;
      }
      if (dias === 0) {
        enviados.push({
          tipo: 'VENCIMIENTO',
          periodo,
          personaId: a.personaId,
          para: correo,
          asunto: `Vence hoy: ${contenido.titulo}`,
          texto: `${contenido.titulo} (${contenido.codigo}) vence HOY.`,
        });
        avisos += 1;
      }
    }

    // ── Semanal (lunes, o el día configurado) ──
    if (diaDeSemana(hoy) === diaSemanal()) {
      const correoPersona = new Map(personas.map((p) => [p.correo, p]));
      const filas = asignaciones.map((a) => ({
        id: a.id,
        tipo: (a.contenido ?? a.obligacion?.contenido)?.tipo ?? 'TAREA',
        codigo: (a.contenido ?? a.obligacion?.contenido)?.codigo ?? '—',
        titulo: (a.contenido ?? a.obligacion?.contenido)?.titulo ?? a.titulo ?? 'Puntual',
        fechaLimite: a.fechaLimite,
        estado: a.estado,
        correo: correoDe(a.personaId),
        obligacionTitulo: a.obligacion?.contenido.titulo ?? null,
      }));
      const plan = planificarSemanales(filas, hoy);
      const periodo = etiquetaSemana(hoy);
      for (const [correo, s] of plan.paraPersona) {
        const persona = correoPersona.get(correo);
        if (!persona) continue;
        enviados.push({
          tipo: 'SEMANAL',
          periodo,
          personaId: persona.id,
          para: correo,
          asunto: `Tienes ${s.vencidas.length + s.porVencer.length} tareas del SIG esta semana`,
          texto: armarSemanal(correo, s),
        });
      }
    }

    // ── Mensual (día configurado, o el primer día hábil siguiente) ──
    if (diaDelMes(hoy) === diaMensual() || esPrimerHabil(hoy)) {
      const mesCerrado = { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() - 1 };
      const areasConLider = areas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        liderCorreo: liderDeArea(a.liderCargoId, personas)?.correo ?? null,
      }));
      // El mensual del líder del SIG (todas las áreas) se envía a la dirección del
      // entorno: el grupo del Directorio no es un correo (decisión declarada).
      const liderSigCorreo = process.env.SGI_CORREO_LIDER_SIG;
      const plan = liderSigCorreo
        ? planificarMensuales([], areasConLider, liderSigCorreo, mesCerrado)
        : planificarMensuales([], areasConLider, '', mesCerrado);
      const periodo = `${mesCerrado.anio}-${String(mesCerrado.mes + 1).padStart(2, '0')}`;
      for (const [correo, r] of plan) {
        if (!correo) continue;
        const persona = personas.find((p) => p.correo === correo);
        if (!persona) continue;
        enviados.push({
          tipo: 'MENSUAL',
          periodo,
          personaId: persona.id,
          para: correo,
          asunto: `${r.areaNombre} · cumplimiento de ${mesCerrado.anio}: ${r.cumplimiento.porciento ?? '—'} %`,
          texto: armarMensual(r),
        });
      }
    }

    let enviado = 0;
    for (const e of enviados) {
      const r = await enviarNotificacion(e);
      if (r.enviado) enviado += 1;
      else if (r.omitido) omitidos += 1;
    }

    void autor;

    return {
      ok: true,
      mensaje: `Disparo completado: ${enviado} enviado(s), ${omitidos} omitido(s), ${avisos} aviso(s) programado(s).`,
      enviados: enviado,
      omitidos,
      avisos,
    };
  });
}

// ── Lectura de ítems para el panel de cierre (verificación) ──
export async function leerItemsVerificacion(contenidoId: number) {
  return prisma.itemVerificacion.findMany({
    where: { contenidoId },
    orderBy: { orden: 'asc' },
    select: { id: true, orden: true, texto: true, obligatorio: true, permiteNoAplica: true },
  });
}

// ── Utilidades de fecha (America/Bogotá = UTC, sin DST) ──
function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}

function diaDeSemana(fecha: Date): number {
  return (fecha.getUTCDay() + 6) % 7; // 0 = lunes
}

function diaDelMes(fecha: Date): number {
  return fecha.getUTCDate();
}

function horaDeEnvio(fecha: Date): boolean {
  const hora = Number(process.env.SGI_CORREO_HORA ?? '7');
  return fecha.getUTCHours() >= hora;
}

function diaSemanal(): number {
  return Number(process.env.SGI_CORREO_DIA_SEMANAL ?? '1'); // 1 = lunes
}

function diaMensual(): number {
  return Number(process.env.SGI_CORREO_DIA_MENSUAL ?? '1');
}

function esPrimerHabil(fecha: Date): boolean {
  const dia = fecha.getUTCDate();
  const semana = (fecha.getUTCDay() + 6) % 7;
  if (dia !== 1) return false;
  if (semana === 5 || semana === 6) return false; // sábado/domingo: se envía el lunes
  return true;
}

function etiquetaSemana(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-S${String(semanaIso(fecha)).padStart(2, '0')}`;
}

function semanaIso(fecha: Date): number {
  const copia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = (copia.getUTCDay() + 6) % 7;
  copia.setUTCDate(copia.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(copia.getUTCFullYear(), 0, 4));
  const diaPrimero = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - diaPrimero + 3);
  return 1 + Math.round((copia.getTime() - primerJueves.getTime()) / (7 * 24 * 3600 * 1000));
}

function liderDeArea(
  cargoId: number | null,
  personas: { id: number; cargoId: number | null; activa: boolean; correo: string }[],
) {
  if (!cargoId) return null;
  return personas.find((p) => p.cargoId === cargoId && p.activa);
}

function armarSemanal(correo: string, s: { vencidas: unknown[]; porVencer: unknown[] }): string {
  return [
    `Hola. Esto es lo tuyo de esta semana.`,
    '',
    `Vencidas · siguen exigibles: ${s.vencidas.length}`,
    `Vencen esta semana: ${s.porVencer.length}`,
    '',
    `Abrí Mi SIG: ${process.env.PUBLIC_URL ?? 'http://localhost:3004'}/mi-sig`,
  ].join('\n');
}

function armarMensual(r: { cumplimiento: { porciento: number | null }; deuda: { cantidad: number } }): string {
  return [
    `Cumplimiento del mes: ${r.cumplimiento.porciento ?? '—'} %`,
    `Deuda vencida: ${r.deuda.cantidad}`,
    `Ver el detalle en Operación: ${process.env.PUBLIC_URL ?? 'http://localhost:3004'}/sig/obligaciones`,
  ].join('\n');
}