// app/tecnologia/grafo/page.tsx
//
// El mismo inventario del árbol, visto como lo que es.
//
// **Las columnas no son niveles: son distancia a la dependencia más profunda**, y por eso
// la flecha siempre va hacia la derecha. Un activo de nivel 3 puede quedar a la izquierda
// de uno de nivel 1 sin que nada esté mal: son dos ordenamientos distintos del mismo
// inventario.

import { prisma } from '@/lib/db';
import { columnasDelGrafo, type Arista } from '@/lib/sig/dependencias';
import GrafoClient from './Grafo.client';

export const dynamic = 'force-dynamic';

export default async function GrafoPage() {
  const [activos, valores, dependencias] = await Promise.all([
    // Sólo los activos que participan del grafo o de la jerarquía de contención. Dibujar
    // los 247 sin ninguna relación llenaría la columna 0 de cajas sueltas y taparía las
    // pocas cadenas que sí hay.
    prisma.activo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, superiorId: true },
      orderBy: { codigo: 'asc' },
    }),
    prisma.activoValor.findMany({ select: { activoId: true, valor: { select: { valor: true } } } }),
    prisma.dependenciaActivo.findMany({ select: { activoId: true, dependeDeId: true, tipo: true } }),
  ]);

  const criticidad = new Map<number, number>();
  for (const v of valores) {
    const previo = criticidad.get(v.activoId);
    if (previo === undefined || v.valor.valor > previo) criticidad.set(v.activoId, v.valor.valor);
  }

  const grafo: Arista[] = dependencias;
  const conRelacion = new Set<number>();
  for (const d of grafo) {
    conRelacion.add(d.activoId);
    conRelacion.add(d.dependeDeId);
  }
  for (const a of activos) {
    if (a.superiorId !== null && activos.some((x) => x.id === a.superiorId)) {
      conRelacion.add(a.id);
      conRelacion.add(a.superiorId);
    }
  }

  const dibujables = activos.filter((a) => conRelacion.has(a.id));
  const columnas = columnasDelGrafo(
    dibujables.map((a) => a.id),
    grafo,
  );

  return (
    <GrafoClient
      nodos={dibujables.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        columna: columnas.get(a.id) ?? 0,
        criticidad: criticidad.get(a.id) ?? null,
      }))}
      dependencias={grafo}
      // La contención se dibuja punteada y aparte: «está dentro de» no es «depende de», y
      // mezclarlas en una sola línea sería exactamente la confusión que el modelo separa.
      contencion={activos
        .filter((a) => a.superiorId !== null && conRelacion.has(a.id))
        .map((a) => ({ hijoId: a.id, padreId: a.superiorId as number }))}
      totalActivos={activos.length}
    />
  );
}
