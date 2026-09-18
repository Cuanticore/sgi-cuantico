// lib/sgsi/alcance-plan.ts
//
// QUÉ MITIGA UN PLAN DE TRATAMIENTO. Puro: sin Prisma y sin React.
//
// ── POR QUÉ HACE FALTA DECIRLO, Y DECIRLO ASÍ ───────────────────────────────────────────
//
// Un plan se registra sobre un CONTROL (D-4) y se lee en una lista de controles. Eso deja al
// comité sin la respuesta que viene a buscar: a quién protege. El plan sabe el control; el
// control sabe de qué amenazas es principal; la valoración sabe qué riesgos tiene cada
// amenaza sobre qué activos. La cadena existe y nadie la recorría.
//
// ── SÓLO LO DE LA VALORACIÓN, Y SÓLO LO PRINCIPAL ───────────────────────────────────────
//
// Las amenazas que entran son las que tienen riesgos VIGENTES en la valoración y cuyo control
// PRINCIPAL es éste. Ni el catálogo entero de amenazas —habría amenazas que no afectan a
// ningún activo del alcance— ni las que este control acompaña como complementario: un
// complementario no contiene la amenaza, y listarlo haría creer que el plan la cubre. Es el
// mismo eje con el que la exigencia decide si hay brecha, así que la compuerta y su cierre
// hablan del mismo control.
//
// ── LOS ACTIVOS NO SE SUMAN ENTRE AMENAZAS ──────────────────────────────────────────────
//
// Cuatro amenazas sobre el mismo servidor son cuatro riesgos y UN activo. Sumar el conteo por
// amenaza daría cuatro, y «a cuántos activos llega este plan» es justamente la cifra que un
// comité lee. Por eso el total sale de un conjunto de códigos y no de una suma.

export interface ControlDelPlan {
  codigo: string;
  nombre: string;
  /// Madurez actual, en puntos. `null` = designado pero sin evaluar.
  nivel: number | null;
  /// El objetivo que el plan se compromete a alcanzar. `null` = sin declarar.
  objetivo: number | null;
}

/// Un riesgo vigente de la valoración cuya amenaza tiene a este control como principal.
export interface RiesgoDelAlcance {
  amenazaCodigo: string;
  amenazaNombre: string;
  activoCodigo: string;
}

export interface AmenazaContenida {
  codigo: string;
  nombre: string;
  riesgos: number;
  activos: number;
}

/// En qué situación está el alcance de este plan. Son tres hechos distintos y la pantalla
/// los dice distinto; colapsarlos en «0 amenazas» borraría la diferencia entre «no aplica» y
/// «no cubre nada».
export type EstadoAlcance =
  /// El plan no mejora ningún control: un TRANSFERIR o un ACEPTAR.
  | 'sin-control'
  /// Tiene control, y ese control no es principal de ninguna amenaza de la valoración.
  | 'sin-amenazas'
  /// Contiene al menos una amenaza.
  | 'contiene';

export interface AlcancePlan {
  control: ControlDelPlan | null;
  estado: EstadoAlcance;
  amenazas: AmenazaContenida[];
  /// Riesgos vigentes alcanzados por el plan.
  riesgos: number;
  /// Activos distintos alcanzados. Nunca la suma de los de cada amenaza.
  activos: number;
  /// Lo que le falta al control para su objetivo, en puntos. `null` cuando no se puede
  /// calcular —sin control, sin nivel evaluado o sin objetivo declarado—, que NO es cero:
  /// cero diría «ya cumple», y no haber mirado es lo contrario.
  brecha: number | null;
}

export function alcanceDelPlan(
  control: ControlDelPlan | null,
  riesgos: readonly RiesgoDelAlcance[],
): AlcancePlan {
  if (control === null) {
    return { control: null, estado: 'sin-control', amenazas: [], riesgos: 0, activos: 0, brecha: null };
  }

  const porAmenaza = new Map<string, { nombre: string; riesgos: number; activos: Set<string> }>();
  const activosTotales = new Set<string>();

  for (const r of riesgos) {
    activosTotales.add(r.activoCodigo);
    const previo = porAmenaza.get(r.amenazaCodigo);
    if (previo === undefined) {
      porAmenaza.set(r.amenazaCodigo, {
        nombre: r.amenazaNombre,
        riesgos: 1,
        activos: new Set([r.activoCodigo]),
      });
      continue;
    }
    previo.riesgos += 1;
    previo.activos.add(r.activoCodigo);
  }

  const amenazas: AmenazaContenida[] = [...porAmenaza.entries()]
    .map(([codigo, a]) => ({ codigo, nombre: a.nombre, riesgos: a.riesgos, activos: a.activos.size }))
    .sort((a, b) => b.riesgos - a.riesgos || a.codigo.localeCompare(b.codigo, 'es'));

  const brecha =
    control.nivel === null || control.objetivo === null
      ? null
      : Math.max(control.objetivo - control.nivel, 0);

  return {
    control,
    estado: amenazas.length === 0 ? 'sin-amenazas' : 'contiene',
    amenazas,
    riesgos: riesgos.length,
    activos: activosTotales.size,
    brecha,
  };
}
