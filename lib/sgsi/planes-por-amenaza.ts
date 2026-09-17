// lib/sgsi/planes-por-amenaza.ts
//
// Qué planes hay que crear cuando alguien pide «plan para estas amenazas» desde la grilla de
// Análisis de riesgos. Puro: sin Prisma y sin React, porque es una decisión y las decisiones
// se prueban.
//
// ── LAS UNIDADES NO COINCIDEN, Y ESE ES TODO EL PROBLEMA ────────────────────────────────
//
// Se eligen AMENAZAS —que es como se ve el riesgo— y se crean PLANES, y un plan es sobre un
// CONTROL (D-4). A.8.12 es el control principal de varias amenazas a la vez: pedir «plan para
// todas las amenazas de este activo» no puede producir un plan por amenaza. Serían planes
// idénticos sobre el mismo control, y la propia acción de servidor los rechazaría uno a uno
// por deduplicación — quien lo pidió vería una ristra de errores en vez de un resultado.
//
// Así que agrupar por control principal no es una optimización: es la traducción entre lo que
// el usuario elige y lo que el modelo guarda. Y tiene que ocurrir ANTES de crear nada, para
// que el popup pueda decir «estas 12 amenazas producen 3 planes» y quien decide vea lo que va
// a pasar antes de que pase.
//
// ── LO QUE NO SE ADIVINA ────────────────────────────────────────────────────────────────
//
// Una amenaza sin control principal designado NO entra a ningún grupo. Elegir «el de menor
// madurez» —como hace el prellenado de un plan puntual— sería registrar una mejora sobre un
// control que nadie declaró como el que contiene esa amenaza, y el plan quedaría diciendo que
// cubre algo que no cubre. Se informa aparte, con su motivo.

export interface AmenazaParaPlan {
  amenazaCodigo: string;
  amenazaNombre: string;
  /// El control PRINCIPAL de la amenaza. `null` cuando no hay ninguno designado.
  principalCodigo: string | null;
  principalNombre: string | null;
  /// Puntos de brecha —lo exigido menos el nivel actual del principal—. `null` cuando no hay
  /// brecha de nivel. ORDENA la lista; no la filtra: un plan preventivo sobre un control que
  /// hoy cumple es una decisión legítima de quien lo registra.
  brecha: number | null;
  /// El código del plan activo que ya cubre esta amenaza, si lo hay.
  planExistente: string | null;
}

/// Por qué una amenaza elegida no produce plan.
export type MotivoSinPlan = 'ya-cubierta' | 'sin-principal';

export interface GrupoDePlan {
  principalCodigo: string;
  principalNombre: string;
  /// Las amenazas que este plan cubre, por código.
  amenazas: AmenazaParaPlan[];
  /// La PEOR brecha del grupo. Es la que fija el objetivo de madurez: un plan que cerrara la
  /// menor dejaría abierta la mayor sobre el mismo control, y el control quedaría marcado
  /// «con plan» sin estarlo de verdad.
  peorBrecha: number | null;
}

export interface AgrupacionPlanes {
  grupos: GrupoDePlan[];
  excluidas: { amenaza: AmenazaParaPlan; motivo: MotivoSinPlan }[];
}

/// Traduce una selección de amenazas a la lista de planes que hay que crear.
///
/// Ninguna amenaza se pierde: lo que no entra a un grupo sale en `excluidas` con su motivo.
/// Es lo que permite decir «estas 12 producen 3 planes; 2 ya están cubiertas y 1 no tiene
/// principal» sin que nadie tenga que cuadrar la resta a mano.
export function agruparAmenazasEnPlanes(
  amenazas: readonly AmenazaParaPlan[],
): AgrupacionPlanes {
  const grupos = new Map<string, GrupoDePlan>();
  const excluidas: AgrupacionPlanes['excluidas'] = [];

  for (const a of amenazas) {
    // «Ya cubierta» va primero a propósito: cuando las dos razones aplican, la útil es que ya
    // existe el plan —hay adónde ir a mirarlo—, no que falte designar un principal.
    if (a.planExistente !== null) {
      excluidas.push({ amenaza: a, motivo: 'ya-cubierta' });
      continue;
    }
    if (a.principalCodigo === null) {
      excluidas.push({ amenaza: a, motivo: 'sin-principal' });
      continue;
    }

    const previo = grupos.get(a.principalCodigo);
    if (previo === undefined) {
      grupos.set(a.principalCodigo, {
        principalCodigo: a.principalCodigo,
        principalNombre: a.principalNombre ?? a.principalCodigo,
        amenazas: [a],
        peorBrecha: a.brecha,
      });
      continue;
    }
    previo.amenazas.push(a);
    if (a.brecha !== null && (previo.peorBrecha === null || a.brecha > previo.peorBrecha)) {
      previo.peorBrecha = a.brecha;
    }
  }

  for (const g of grupos.values()) {
    g.amenazas.sort((x, y) => x.amenazaCodigo.localeCompare(y.amenazaCodigo, 'es'));
  }

  // Peor brecha primero: el plan que más falta se lee arriba. Sin brecha va al final —no es
  // urgente— y el código del control desempata, para que dos corridas den lo mismo.
  const ordenados = [...grupos.values()].sort(
    (a, b) =>
      (b.peorBrecha ?? -1) - (a.peorBrecha ?? -1) ||
      a.principalCodigo.localeCompare(b.principalCodigo, 'es'),
  );

  return { grupos: ordenados, excluidas };
}
