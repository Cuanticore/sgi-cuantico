// lib/sig/aplicar-fusion.ts
//
// EJECUTA el plan que calcula `fusion-niveles.ts`. La decisión vive allá; acá sólo se escribe.
//
// Estaba dentro de `scripts/estandarizar-niveles.ts` y se sacó el 22/09/2026 por una razón
// concreta: **un ejecutor enterrado en un script no se puede ejercer sin correr el script**, y
// eso convertía a producción en el único sitio donde este SQL se ejecutaba de verdad. Es la
// misma forma que la cicatriz del 18/09 —ninguna verificación previa ejecutaba una migración—
// con otro disfraz. Ahora `scripts/verificar-fusion.ts` lo corre contra una base efímera con la
// forma real del árbol.
//
// **Un plan válido como ESTADO FINAL puede ser imposible como SECUENCIA.** Ése fue el defecto
// que costó un intento contra producción, y está explicado en `reparentables`.

import type { Plan } from './fusion-niveles';

/// Lo mínimo que el ejecutor necesita de una transacción de Prisma. Se declara acá en vez de
/// importar `Prisma.TransactionClient` para que el módulo no arrastre el cliente generado: así
/// la prueba puede pasarle una transacción de verdad y nada más.
export interface TxFusion {
  nivelActivo: {
    updateMany(args: { where: { padreId: number }; data: { padreId: number } }): Promise<unknown>;
    update(args: {
      where: { id: number };
      data: { padreId?: number; activo?: boolean; nombre?: string };
    }): Promise<unknown>;
  };
  activo: {
    updateMany(args: { where: { nivelId: number }; data: { nivelId: number } }): Promise<unknown>;
  };
  producto: {
    updateMany(args: { where: { nivelId: number }; data: { nivelId: number } }): Promise<unknown>;
  };
}

/// Los hijos de un nodo absorbido que SÍ hay que mudar al superviviente.
///
/// **Un hijo que a su vez está absorbido en otra fusión NO se muda, y ahí estaba el defecto.**
///
/// El caso real, en producción: `Mintrace` #132 cuelga de la raíz `Productos` #131 y tiene un
/// hijo `DOCUMENTACIÓN PRIVADA` #133. El superviviente `MINTRACE` #6 ya tiene un
/// `DOCUMENTACIÓN PRIVADA` #141, con el MISMO nombre literal. Mudar #133 a #6 deja por un
/// instante dos filas `(3, 'DOCUMENTACIÓN PRIVADA', 6)` y `nivel_activo_identidad` las rechaza
/// con P2002 — aunque el plan sí contempla fundirlas, porque esa fusión viene DESPUÉS.
///
/// El ejecutor creaba la colisión antes de llegar a repararla. El plan era correcto; el orden
/// no. Por eso las tres verificaciones previas —simulación local, simulación en producción y el
/// `diff` entre las dos— dieron «0 conflictos» y las tres tenían razón: ninguna EJECUTA el SQL.
///
/// Dejar al hijo absorbido colgando de su padre viejo no rompe nada: los dos quedan
/// `activo = false` en la misma transacción, `armarArbol` sólo recorre los activos, y su propia
/// fusión se encarga de mudar lo que colgaba de él. Una lápida apuntando a otra lápida es
/// exactamente lo que son.
export function reparentables(hijos: readonly number[], plan: Plan): number[] {
  const absorbidos = new Set(plan.fusiones.flatMap((f) => f.absorbe));
  return hijos.filter((id) => !absorbidos.has(id));
}

/// Aplica el plan completo. El llamador la envuelve en UNA transacción: a medio aplicar, el
/// árbol queda peor que antes.
export async function aplicarPlan(
  tx: TxFusion,
  plan: Plan,
  hijosDe: (padreId: number) => Promise<number[]>,
): Promise<void> {
  // Las fusiones primero, y en el orden del plan (grado 1 → 3): un hijo tiene que mudarse a un
  // padre que ya sobrevivió, no a uno que está por absorberse.
  for (const f of plan.fusiones) {
    for (const absorbido of f.absorbe) {
      for (const hijo of reparentables(await hijosDe(absorbido), plan)) {
        await tx.nivelActivo.update({ where: { id: hijo }, data: { padreId: f.sobrevive } });
      }
      await tx.activo.updateMany({ where: { nivelId: absorbido }, data: { nivelId: f.sobrevive } });
      // `producto.nivel_id` es @unique. El plan ya garantiza que no hay dos Producto en el
      // grupo, así que este movimiento no puede chocar.
      await tx.producto.updateMany({ where: { nivelId: absorbido }, data: { nivelId: f.sobrevive } });
      await tx.nivelActivo.update({ where: { id: absorbido }, data: { activo: false } });
    }
  }

  // Los renombres al final: antes de fundir, dos nombres distintos son lo único que distingue a
  // los dos nodos en los mensajes del plan.
  for (const r of plan.renombres) {
    await tx.nivelActivo.update({ where: { id: r.id }, data: { nombre: r.a } });
  }
}
