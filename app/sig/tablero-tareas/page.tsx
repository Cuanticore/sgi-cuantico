// app/sig/tablero-tareas/page.tsx
//
// «Cumplimiento de tareas del SIG» (handoff_tableros/Main.dc.html). Esta pantalla NO
// existía: durante la revisión de cobertura la di por cubierta comparándola contra `/`,
// que es el tablero de INDICADORES —otro lienzo, otras cifras—. El de cumplimiento de
// tareas no tenía ruta ninguna.
//
// La página lee y agrupa; las cuentas viven en `lib/sig/tablero-tareas.ts` y reusan
// `cumplimientoDePeriodo`, que es la misma regla que usa la barra de Obligaciones y el
// correo mensual. El lienzo lo pide explícitamente: no pueden contradecirse.

import { prisma } from '@/lib/db';
import {
  armarTitular,
  cumplimientoPorArea,
  peoresObligaciones,
  type AsignacionDelTablero,
} from '@/lib/sig/tablero-tareas';
import TableroTareasClient from './TableroTareas.client';

export const dynamic = 'force-dynamic';

export type Alcance = 'mes' | 'trimestre' | 'anio';

/// Desde cuándo cuenta cada alcance, y con qué comparar. El periodo anterior es de la
/// misma longitud: comparar un mes contra un trimestre daría una tendencia inventada.
function ventana(alcance: Alcance, hoy: Date): { desde: Date; hasta: Date; desdeAnterior: Date } {
  const a = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  if (alcance === 'anio') {
    return {
      desde: new Date(Date.UTC(a, 0, 1)),
      hasta: new Date(Date.UTC(a + 1, 0, 1)),
      desdeAnterior: new Date(Date.UTC(a - 1, 0, 1)),
    };
  }
  if (alcance === 'trimestre') {
    const inicio = Math.floor(m / 3) * 3;
    return {
      desde: new Date(Date.UTC(a, inicio, 1)),
      hasta: new Date(Date.UTC(a, inicio + 3, 1)),
      desdeAnterior: new Date(Date.UTC(a, inicio - 3, 1)),
    };
  }
  return {
    desde: new Date(Date.UTC(a, m, 1)),
    hasta: new Date(Date.UTC(a, m + 1, 1)),
    desdeAnterior: new Date(Date.UTC(a, m - 1, 1)),
  };
}

const ETIQUETA_ALCANCE: Record<Alcance, string> = {
  mes: 'Este mes',
  trimestre: 'Trimestre',
  anio: 'Año',
};

export default async function TableroTareasPage({
  searchParams,
}: {
  searchParams: Promise<{ alcance?: string }>;
}) {
  const { alcance: pedido } = await searchParams;
  const alcance: Alcance =
    pedido === 'trimestre' || pedido === 'anio' ? pedido : 'mes';

  const hoy = new Date();
  const { desde, hasta, desdeAnterior } = ventana(alcance, hoy);

  // Una sola consulta que cubre el periodo Y el anterior: son dos rangos contiguos, y
  // partirlo en dos idas a la base para después volver a unirlo no compra nada.
  const [filas, areas, obligaciones, personasAlDia] = await Promise.all([
    prisma.asignacion.findMany({
      where: { fechaLimite: { gte: desdeAnterior, lt: hasta } },
      select: {
        id: true,
        estado: true,
        fechaLimite: true,
        fechaCierre: true,
        personaId: true,
        cerradaPor: true,
        obligacionId: true,
        persona: { select: { areaId: true } },
      },
    }),
    prisma.area.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { orden: 'asc' },
    }),
    prisma.obligacion.findMany({
      where: { activa: true },
      select: { id: true, contenido: { select: { codigo: true, titulo: true } } },
    }),
    capacitacionVigente(),
  ]);

  const todas: AsignacionDelTablero[] = filas.map((f) => ({
    id: f.id,
    estado: f.estado as AsignacionDelTablero['estado'],
    fechaLimite: f.fechaLimite,
    fechaCierre: f.fechaCierre,
    personaId: f.personaId,
    cerradaPor: f.cerradaPor,
    obligacionId: f.obligacionId,
    areaId: f.persona.areaId,
  }));

  const delPeriodo = todas.filter((a) => a.fechaLimite >= desde && a.fechaLimite < hasta);
  const delAnterior = todas.filter((a) => a.fechaLimite >= desdeAnterior && a.fechaLimite < desde);

  const titular = armarTitular(delPeriodo, delAnterior, hoy);

  return (
    <TableroTareasClient
      alcance={alcance}
      etiquetaPeriodo={etiquetaDelPeriodo(alcance, desde)}
      etiquetaAlcance={ETIQUETA_ALCANCE[alcance]}
      titular={{
        porciento: titular.cumplimiento.porciento,
        asignadas: titular.cumplimiento.asignadas,
        realizadasATiempo: titular.cumplimiento.realizadasATiempo,
        segmentos: titular.segmentos,
        variacion: titular.variacion,
        deudaCantidad: titular.deuda.cantidad,
        deudaMasAntiguaDias: titular.deuda.masAntiguaDias,
        antiguedad: titular.antiguedad,
        cierresAdministrativos: titular.cierresAdministrativos,
      }}
      areas={cumplimientoPorArea(delPeriodo, areas)}
      peores={peoresObligaciones(
        delPeriodo,
        obligaciones.map((o) => ({
          id: o.id,
          codigo: o.contenido.codigo,
          titulo: o.contenido.titulo,
        })),
      )}
      capacitacion={personasAlDia}
    />
  );
}

/// «Agosto de 2026», «Tercer trimestre de 2026», «2026». Es el rótulo del lienzo, y dice
/// sobre qué se están mirando las cifras.
function etiquetaDelPeriodo(alcance: Alcance, desde: Date): string {
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const a = desde.getUTCFullYear();
  if (alcance === 'anio') return String(a);
  if (alcance === 'trimestre') {
    const ORDINAL = ['Primer', 'Segundo', 'Tercer', 'Cuarto'];
    return `${ORDINAL[Math.floor(desde.getUTCMonth() / 3)]} trimestre de ${a}`;
  }
  return `${MESES[desde.getUTCMonth()]} de ${a}`;
}

export interface Capacitacion {
  alDia: number;
  total: number;
  /// Cuántas capacitaciones obligatorias hay. El lienzo dice «las cuatro capacitaciones
  /// obligatorias»; el número real sale de los datos, no del texto del lienzo.
  obligatorias: number;
}

/// Cuántas personas activas no tienen ninguna capacitación obligatoria pendiente.
///
/// «Al día» se define por lo que falta, no por lo que se hizo: una persona que entró el mes
/// pasado y todavía no tiene asignada la inducción no está incumpliendo, y contarla como
/// atrasada haría bajar el indicador por contratar gente.
async function capacitacionVigente(): Promise<Capacitacion> {
  const [activas, obligatorias, pendientes] = await Promise.all([
    prisma.persona.count({ where: { activa: true } }),
    prisma.obligacion.count({
      where: { activa: true, contenido: { tipo: 'CAPACITACION' } },
    }),
    prisma.asignacion.findMany({
      where: {
        estado: 'PENDIENTE',
        fechaLimite: { lt: new Date() },
        obligacion: { contenido: { tipo: 'CAPACITACION' } },
        persona: { activa: true },
      },
      select: { personaId: true },
      distinct: ['personaId'],
    }),
  ]);
  return { alDia: activas - pendientes.length, total: activas, obligatorias };
}
