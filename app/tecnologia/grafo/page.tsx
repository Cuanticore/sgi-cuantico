// app/tecnologia/grafo/page.tsx
//
// El mismo inventario del árbol, visto como lo que es.
//
// **Las columnas no son niveles: son distancia a la dependencia más profunda**, y por eso
// la flecha siempre va hacia la derecha. Un activo de nivel 3 puede quedar a la izquierda
// de uno de nivel 1 sin que nada esté mal: son dos ordenamientos distintos del mismo
// inventario. El filtro por Nivel 1 / 2 / 3 usa el segundo; el acomodo, el primero.
//
// **Esta página no calcula el acomodo.** Manda los datos crudos y deja que el cliente los
// encadene: al filtrar, columnas y orden se recalculan sobre el subgrafo visible, y un número
// de columna calculado acá sería un segundo origen del mismo dato — la forma exacta que
// tuvieron los tres bugs que originaron el harness de este repo.

import { prisma } from '@/lib/db';
import type { Arista } from '@/lib/sig/dependencias';
import GrafoClient from './Grafo.client';

export const dynamic = 'force-dynamic';

export default async function GrafoPage() {
  const [activos, niveles, valores, dependencias, despliegues] = await Promise.all([
    // **Van TODOS los activos vigentes, no sólo los que participan de una relación.** Sin
    // filtro el cliente sigue dibujando únicamente los conectados —llenar la columna 0 de
    // cajas sueltas taparía las pocas cadenas que hay—, pero al filtrar una rama esa razón
    // desaparece y «qué activos de MINTRACE nadie conectó con nada» pasa a ser el hallazgo.
    // No se puede responder eso con los activos que la consulta descartó.
    prisma.activo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, superiorId: true, nivelId: true },
      orderBy: { codigo: 'asc' },
    }),
    // E1 · la jerarquía completa. El activo apunta al nivel 3 y los grados 1 y 2 se derivan
    // subiendo por `padreId`, así que el filtro necesita la tabla entera para poder subir.
    prisma.nivelActivo.findMany({
      select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
      orderBy: [{ grado: 'asc' }, { orden: 'asc' }, { id: 'asc' }],
    }),
    prisma.activoValor.findMany({ select: { activoId: true, valor: { select: { valor: true } } } }),
    prisma.dependenciaActivo.findMany({ select: { activoId: true, dependeDeId: true, tipo: true } }),
    // D-3 · el libro dibuja «se despliega en» y «corre en» y esta vista no. La data está
    // completa en `Despliegue`; lo que faltaba era decidir mostrarla.
    //
    // Un despliegue NO es un nodo acá —el libro sí lo modela así, y por eso cuenta 585 nodos
    // contra 299 activos—, así que la única arista activo↔activo que se puede derivar es
    // «este activo corre en este servidor». Es la proyección fiel de lo que este grafo sabe
    // dibujar.
    prisma.despliegue.findMany({
      where: { activoId: { not: null }, servidorId: { not: null }, activoRegistro: true },
      select: { activoId: true, servidorId: true },
    }),
  ]);

  const criticidad = new Map<number, number>();
  for (const v of valores) {
    const previo = criticidad.get(v.activoId);
    if (previo === undefined || v.valor.valor > previo) criticidad.set(v.activoId, v.valor.valor);
  }

  // D-3 · las aristas de despliegue, sin repetir el par: veinte despliegues del mismo activo
  // en el mismo servidor son UNA relación «corre en», no veinte líneas encimadas.
  const vistas = new Set<string>();
  const aristasDespliegue: { activoId: number; servidorId: number }[] = [];
  for (const d of despliegues) {
    const activoId = d.activoId as number;
    const servidorId = d.servidorId as number;
    if (activoId === servidorId) continue;
    const clave = `${activoId}-${servidorId}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    aristasDespliegue.push({ activoId, servidorId });
  }

  const vigentes = new Set(activos.map((a) => a.id));
  const grafo: Arista[] = dependencias;

  return (
    <GrafoClient
      nodos={activos.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        criticidad: criticidad.get(a.id) ?? null,
        nivelId: a.nivelId,
      }))}
      despliegues={aristasDespliegue}
      dependencias={grafo}
      // La contención se dibuja punteada y aparte: «está dentro de» no es «depende de», y
      // mezclarlas en una sola línea sería exactamente la confusión que el modelo separa.
      // Viajan todos los pares cuyo padre siga vigente: recortarlos acá según si el hijo
      // además tiene una dependencia dejaba al cliente sin poder decir quién está realmente
      // suelto.
      contencion={activos
        .filter((a) => a.superiorId !== null && vigentes.has(a.superiorId))
        .map((a) => ({ hijoId: a.id, padreId: a.superiorId as number }))}
      niveles={niveles}
      totalActivos={activos.length}
    />
  );
}
