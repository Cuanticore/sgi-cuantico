'use server';

// app/sig/acciones/envios.ts
//
// El disparo «enviar los resúmenes pendientes hasta hoy» (N7): se puede correr de nuevo
// si el servidor estuvo caído, sin duplicar.
//
// Acá vivía también `leerItemsVerificacion`, que nadie llamaba: `app/mi-sig/bandeja.query.ts`
// ya trae los ítems con la asignación, en la misma consulta. Se borró en vez de conectarla,
// porque una segunda consulta para lo mismo es una que mañana devuelve otro orden.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { planificarSemanales, planificarMensuales } from '@/lib/sig/resumen';
import { correoMensualHtml, correoSemanalHtml } from '@/lib/sig/correos';
import { enviarNotificacion, type EnvioProgramado } from '@/lib/sig/envios';
import { diasHasta } from '@/lib/sig/cierre';

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
      // `diasHasta` del dominio, NO la resta de `diaDe`. Ese devuelve un entero
      // empaquetado YYYYMMDD, así que `diaDe(3-sep) - diaDe(27-ago)` daba 76 y no 7: el
      // aviso de proximidad NUNCA salía cuando la ventana de siete días cruzaba un fin de
      // mes. Son doce ventanas al año en las que nadie recibía el recordatorio y el
      // sistema no dejaba rastro de la omisión, porque no había nada que registrar.
      const dias = diasHasta(a.fechaLimite, hoy);
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
          texto: armarSemanal(persona.nombre, s),
          // El lienzo del semanal es un correo HTML. Se enviaba en texto plano porque el
          // campo `html` de `EnvioProgramado` existía y nadie lo asignaba nunca. El texto
          // se queda como alternativa para el cliente que no muestra HTML.
          html: correoSemanalHtml({
            nombre: persona.nombre,
            vencidas: s.vencidas,
            porVencer: s.porVencer,
            // La tercera cifra da la escala: dos vencidas sobre veinte pendientes no es lo
            // mismo que dos sobre dos.
            masAdelante: filas.filter(
              (f) =>
                f.correo === correo &&
                f.estado === 'PENDIENTE' &&
                f.fechaLimite > finDeSemana(hoy),
            ).length,
            desde: inicioDeSemana(hoy),
            hasta: finDeSemana(hoy),
            urlMiSig: `${baseUrl()}/mi-sig`,
          }),
        });
      }
    }

    // ── Mensual (día configurado, o el primer día hábil siguiente) ──
    if (diaDelMes(hoy) === diaMensual() || esPrimerHabil(hoy)) {
      // El mes que cerró. En enero eso es DICIEMBRE DEL AÑO ANTERIOR, y antes se calculaba
      // `mes: hoy.getUTCMonth() - 1`, o sea −1 con el año sin cambiar. Ningún mes devuelve
      // −1, así que el filtro no encontraba nada: el resumen del cierre de diciembre —el
      // que cierra el año y el que más se mira— era justo el único que nunca salía. Y el
      // periodo quedaba etiquetado «2026-00».
      const previo = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
      const mesCerrado = { anio: previo.getUTCFullYear(), mes: previo.getUTCMonth() };
      const areaDe = new Map(personas.map((p) => [p.id, p.areaId]));
      const delMes = asignaciones.filter((a) => {
        const limite = a.fechaLimite;
        return limite.getUTCFullYear() === mesCerrado.anio && limite.getUTCMonth() === mesCerrado.mes;
      });
      const filasMensuales = delMes.map((a) => ({
        id: a.id,
        tipo: (a.contenido ?? a.obligacion?.contenido)?.tipo ?? 'TAREA',
        codigo: (a.contenido ?? a.obligacion?.contenido)?.codigo ?? '—',
        titulo: (a.contenido ?? a.obligacion?.contenido)?.titulo ?? a.titulo ?? 'Puntual',
        fechaLimite: a.fechaLimite,
        estado: a.estado,
        correo: correoDe(a.personaId),
        obligacionTitulo: a.obligacion?.contenido.titulo ?? null,
        areaId: areaDe.get(a.personaId) ?? null,
        fechaCierre: a.fechaCierre,
        cerradaPor: a.cerradaPor,
      }));
      const areasConLider = areas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        liderCorreo: liderDeArea(a.liderCargoId, personas)?.correo ?? null,
      }));
      // El mensual del líder del SIG (todas las áreas) se envía a la dirección del
      // entorno: el grupo del Directorio no es un correo (decisión declarada).
      const liderSigCorreo = process.env.SGI_CORREO_LIDER_SIG ?? '';
      const plan = planificarMensuales(filasMensuales, areasConLider, liderSigCorreo, mesCerrado);
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
          // El asunto nombra el MES que cerró, no el año. «Cumplimiento de 2026» en un
          // correo mensual obliga a abrirlo para saber de qué mes habla.
          asunto: `${r.areaNombre} · cumplimiento de ${nombreDelMes(mesCerrado)}: ${r.cumplimiento.porciento ?? '—'} %`,
          texto: armarMensual(r),
          html: correoMensualHtml({
            nombre: persona.nombre,
            areaNombre: r.areaNombre,
            mes: r.mes,
            cumplimiento: r.cumplimiento,
            deuda: r.deuda,
            peorCumplimiento: r.peorCumplimiento,
            cierresAdministrativos: r.cierresAdministrativos,
            // «Vence en <mes siguiente>»: lo único accionable del correo. Se agrupa por
            // título porque una obligación con alcance TODOS produce una asignación por
            // persona, y listarlas una por una daría treinta y cuatro líneas iguales.
            proximoMes: proximasDelArea(asignaciones, personas, persona.areaId, mesCerrado),
            urlOperacion: `${baseUrl()}/sig/obligaciones`,
          }),
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

// ── Utilidades de fecha (America/Bogotá = UTC, sin DST) ──
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

/// La URL pública. Es la que va en el único botón del correo, así que un valor equivocado
/// convierte el correo en un aviso sin salida.
function baseUrl(): string {
  return (process.env.PUBLIC_URL ?? 'http://localhost:3004').replace(/\/+$/, '');
}

/// El lunes de la semana de `fecha`, en UTC. La semana del correo va de lunes a domingo,
/// que es la que el lienzo rotula «Semana del 31 de agosto al 6 de septiembre».
function inicioDeSemana(fecha: Date): Date {
  const dia = (fecha.getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() - dia));
}

function finDeSemana(fecha: Date): Date {
  const inicio = inicioDeSemana(fecha);
  return new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + 6));
}

/// La alternativa en texto plano. Ahora saluda por el nombre: recibía el correo de la
/// persona y escribía «Hola.» a secas.
function armarSemanal(nombre: string, s: { vencidas: unknown[]; porVencer: unknown[] }): string {
  const primero = nombre.trim().split(/\s+/)[0] ?? '';
  return [
    primero === '' ? 'Esto es lo tuyo de esta semana.' : `Hola, ${primero}. Esto es lo tuyo de esta semana.`,
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
/// «septiembre de 2026». Vive acá porque sólo lo usa el asunto del mensual.
function nombreDelMes({ anio, mes }: { anio: number; mes: number }): string {
  const nombres = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${nombres[mes] ?? mes + 1} de ${anio}`;
}

/// Lo que vence el mes SIGUIENTE al que cerró, en el área del destinatario.
///
/// Agrupado por título: una obligación con alcance TODOS produce una asignación por
/// persona, y listarlas sueltas daría treinta y cuatro líneas idénticas donde el lienzo
/// pone una con «34 personas». La fecha que se muestra es la más temprana del grupo —es la
/// que manda para llegar a tiempo.
function proximasDelArea(
  asignaciones: readonly {
    fechaLimite: Date;
    estado: string;
    personaId: number;
    titulo: string | null;
    contenido: { titulo: string } | null;
    obligacion: { contenido: { titulo: string } } | null;
  }[],
  personas: readonly { id: number; areaId: number | null }[],
  areaId: number | null,
  mesCerrado: { anio: number; mes: number },
): { fecha: Date; titulo: string; personas: number }[] {
  const desde = new Date(Date.UTC(mesCerrado.anio, mesCerrado.mes + 1, 1));
  const hasta = new Date(Date.UTC(mesCerrado.anio, mesCerrado.mes + 2, 1));
  const areaDe = new Map(personas.map((p) => [p.id, p.areaId]));

  const grupos = new Map<string, { fecha: Date; personas: Set<number> }>();
  for (const a of asignaciones) {
    if (a.estado !== 'PENDIENTE') continue;
    if (a.fechaLimite < desde || a.fechaLimite >= hasta) continue;
    // `areaId` nulo es el líder del SIG: ve todas las áreas, no ninguna.
    if (areaId !== null && areaDe.get(a.personaId) !== areaId) continue;
    const titulo = (a.contenido ?? a.obligacion?.contenido)?.titulo ?? a.titulo ?? 'Puntual';
    const g = grupos.get(titulo) ?? { fecha: a.fechaLimite, personas: new Set<number>() };
    if (a.fechaLimite < g.fecha) g.fecha = a.fechaLimite;
    g.personas.add(a.personaId);
    grupos.set(titulo, g);
  }

  return [...grupos.entries()]
    .map(([titulo, g]) => ({ titulo, fecha: g.fecha, personas: g.personas.size }))
    .sort((x, y) => x.fecha.getTime() - y.fecha.getTime())
    // Cinco es lo que cabe sin empujar el botón fuera de la primera pantalla del correo.
    .slice(0, 5);
}
