// app/mi-sig/bandeja.query.ts
//
// La bandeja de la persona, agrupada tal como la dibuja el lienzo: vencidas arriba,
// luego por vencer, luego pendientes, y las realizadas colapsadas al final. Vencida,
// por vencer y «hace N días» se CALCULAN al leer (R3); el estado guardado nunca cambia.

import { prisma } from '@/lib/db';
import { esVencida } from '@/lib/sig/cierre';

export type EstadoBandeja = 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';

export interface TarjetaBandeja {
  id: number;
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA';
  codigo: string;
  titulo: string;
  descripcion: string;
  procedimientoOrigen: string | null;
  version: number;
  periodo: string;
  fechaLimite: Date;
  estado: EstadoBandeja;
  vencida: boolean;
  /// Días desde la fecha límite si está vencida; negativos si faltan.
  dias: number;
  exigeEvaluacion: boolean;
  notaMinima: number | null;
  documentoVersion: string | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
  /// Cierre administrativo (R5): visible en la bandeja.
  cierreAdministrativo: boolean;
}

export interface Bandeja {
  persona: { nombre: string; area: string | null; cargo: string | null } | null;
  contadores: { vencidas: number; porVencer: number; realizadasPeriodo: number };
  vencidas: TarjetaBandeja[];
  porVencer: TarjetaBandeja[];
  pendientes: TarjetaBandeja[];
  realizadas: TarjetaBandeja[];
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}

export async function leerBandeja(correo: string): Promise<Bandeja> {
  const persona = await prisma.persona.findUnique({
    where: { correo },
    select: { nombre: true, area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
  });
  if (!persona) {
    return {
      persona: null,
      contadores: { vencidas: 0, porVencer: 0, realizadasPeriodo: 0 },
      vencidas: [],
      porVencer: [],
      pendientes: [],
      realizadas: [],
    };
  }

  const filas = await prisma.asignacion.findMany({
    where: { persona: { correo } },
    orderBy: [{ fechaLimite: 'asc' }],
    include: {
      contenido: true,
      obligacion: { include: { contenido: true } },
      cerradaPorPersona: { select: { nombre: true } },
    },
  });

  const hoy = new Date();
  const hoyNum = diaDe(hoy);

  const tarjetas: TarjetaBandeja[] = filas.map((f) => {
    const contenido = f.contenido ?? f.obligacion?.contenido;
    const fechaLimite = f.fechaLimite;
    const vencida = esVencida(f.estado, fechaLimite, hoy);
    const dias = diaDe(fechaLimite) - hoyNum;
    return {
      id: f.id,
      tipo: contenido?.tipo ?? 'TAREA',
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? f.titulo ?? 'Asignación puntual',
      descripcion: contenido?.descripcion ?? f.descripcion ?? '',
      procedimientoOrigen: contenido?.procedimientoOrigen ?? null,
      version: contenido?.version ?? 1,
      periodo: f.periodo,
      fechaLimite,
      estado: f.estado as EstadoBandeja,
      vencida,
      dias,
      exigeEvaluacion: contenido?.exigeEvaluacion ?? false,
      notaMinima: contenido?.notaMinima ? Number(contenido.notaMinima) : null,
      documentoVersion: contenido?.documentoVersion ?? null,
      documentoUrl: contenido?.documentoUrl ?? null,
      documentoNombre: contenido?.documentoNombre ?? null,
      cierreAdministrativo: f.cerradaPor !== null && f.cerradaPor !== f.personaId,
    };
  });

  const exigibles = tarjetas.filter((t) => t.estado === 'PENDIENTE');
  const realizadas = tarjetas.filter((t) => t.estado === 'REALIZADA');

  const dentroDe = (dias: number) =>
    exigibles.filter((t) => !t.vencida && t.dias >= 0 && t.dias <= dias);
  const fueraDe = (dias: number) => exigibles.filter((t) => !t.vencida && t.dias > dias);

  return {
    persona: { nombre: persona.nombre, area: persona.area?.nombre ?? null, cargo: persona.cargo?.nombre ?? null },
    contadores: {
      vencidas: exigibles.filter((t) => t.vencida).length,
      porVencer: exigibles.filter((t) => !t.vencida && t.dias <= 7).length,
      realizadasPeriodo: realizadas.length,
    },
    vencidas: exigibles.filter((t) => t.vencida),
    porVencer: dentroDe(7),
    pendientes: fueraDe(7),
    realizadas,
  };
}