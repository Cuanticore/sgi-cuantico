// app/sig/estado/page.tsx
//
// **La pregunta va primero que cualquier porcentaje: ¿el sistema está midiendo?**
//
// Si `generar-asignaciones` no corrió, los indicadores de abajo no son bajos porque la
// gente incumpla: son bajos porque los periodos no se abrieron. Mostrar el porcentaje sin
// esa advertencia arriba convierte un fallo de infraestructura en una acusación al equipo.

import { prisma } from '@/lib/db';
import {
  estadoDeTrabajo,
  saludDelSistema,
  TRABAJOS,
  type EstadoTrabajo,
} from '@/lib/sig/trabajos-catalogo';
import { esVencida } from '@/lib/sig/cierre';
import EstadoClient from './Estado.client';

export const dynamic = 'force-dynamic';

export default async function EstadoPage() {
  const ahora = new Date();

  const [ejecuciones, asignaciones, procesos] = await Promise.all([
    // La última corrida de cada trabajo. Se traen las recientes y se agrupa acá: un
    // `groupBy` con el máximo por trabajo no devuelve el resultado de esa corrida, y sin el
    // resultado no se distingue «corrió» de «corrió y reventó».
    prisma.ejecucionTrabajo.findMany({
      orderBy: { inicio: 'desc' },
      take: 200,
      select: { trabajo: true, inicio: true, resultado: true, creados: true, error: true, invocadoPor: true },
    }),
    prisma.asignacion.findMany({
      select: {
        estado: true,
        fechaLimite: true,
        fechaCierre: true,
        persona: { select: { areaId: true } },
      },
    }),
    prisma.area.findMany({ where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
  ]);

  const ultimaPorTrabajo = new Map<string, (typeof ejecuciones)[number]>();
  for (const e of ejecuciones) if (!ultimaPorTrabajo.has(e.trabajo)) ultimaPorTrabajo.set(e.trabajo, e);

  const estados = TRABAJOS.map((t) => {
    const u = ultimaPorTrabajo.get(t.nombre) ?? null;
    return {
      trabajo: t.nombre,
      descripcion: t.descripcion,
      cuando: t.cuando,
      disponible: t.disponible,
      inicio: u?.inicio.toISOString().slice(0, 16).replace('T', ' ') ?? null,
      creados: u?.creados ?? null,
      invocadoPor: u?.invocadoPor ?? null,
      error: u?.error ?? null,
      estado: estadoDeTrabajo(
        t.cuando,
        u === null ? null : { trabajo: t.nombre, inicio: u.inicio, resultado: u.resultado },
        ahora,
      ) as EstadoTrabajo,
    };
  });

  const salud = saludDelSistema(estados.map((e) => ({ trabajo: e.trabajo, estado: e.estado })));

  // Los cuatro números. Se derivan al leer, como todo lo demás del sistema.
  const abiertas = asignaciones.filter((a) => a.estado === 'PENDIENTE');
  const vencidas = asignaciones.filter((a) => esVencida(a.estado, a.fechaLimite, ahora));
  const cerradas = asignaciones.filter((a) => a.estado === 'REALIZADA');
  const cumplimiento =
    asignaciones.length === 0 ? null : Math.round((cerradas.length / asignaciones.length) * 100);

  // Cumplimiento por área. El lienzo dice «por proceso»: `Proceso` existe como entidad pero
  // los activos y las personas siguen clasificados por `Area` (D16), así que se agrupa por
  // lo que el dato realmente tiene y la pantalla lo dice.
  const porArea = procesos
    .map((p) => {
      const suyas = asignaciones.filter((a) => a.persona.areaId === p.id);
      const suyasCerradas = suyas.filter((a) => a.estado === 'REALIZADA').length;
      return {
        id: p.id,
        nombre: p.nombre,
        total: suyas.length,
        porcentaje: suyas.length === 0 ? null : Math.round((suyasCerradas / suyas.length) * 100),
      };
    })
    .filter((p) => p.total > 0);

  return (
    <EstadoClient
      ahora={ahora.toISOString().slice(0, 16).replace('T', ' ')}
      midiendo={salud.midiendo}
      culpables={salud.culpables}
      trabajos={estados}
      cifras={{
        total: asignaciones.length,
        abiertas: abiertas.length,
        vencidas: vencidas.length,
        cumplimiento,
      }}
      porArea={porArea}
      sinAreas={procesos.length === 0}
    />
  );
}
