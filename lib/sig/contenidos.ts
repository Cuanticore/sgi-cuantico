// lib/sig/contenidos.ts
//
// Qué se le puede hacer a los ítems de una lista de verificación que ya se respondió.
//
// El lienzo de Contenidos pone «+ Agregar ítem» y las flechas ▲▼ para reordenar, así que
// los ítems se editan después de creado el contenido. Pero un ítem que alguien ya
// respondió sostiene una `RespuestaItem`, y esa respuesta es la evidencia de que la
// verificación se hizo. Borrarlo no deja un hueco: deja una lista de verificación que ya
// no explica qué se verificó.
//
// Por eso el plan se calcula acá, puro y sin base de datos: la regla de qué se puede
// borrar es lo que hay que poder leer de un tirón y probar sin levantar Postgres.
//
// El ORDEN sí se puede cambiar siempre. Reordenar no cambia lo que se preguntó, y el
// número de un ítem no es su identidad —la identidad es el `id`—, así que las respuestas
// viejas siguen apuntando a la pregunta correcta.

/// Un ítem tal como está guardado hoy.
export interface ItemGuardado {
  id: number;
  orden: number;
  texto: string;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  /// Cuántas veces se respondió. Cero significa que el ítem todavía no es evidencia.
  respuestas: number;
}

/// Un ítem tal como lo manda la pantalla. Sin `id` es nuevo.
export interface ItemPropuesto {
  id?: number;
  texto: string;
  obligatorio: boolean;
  permiteNoAplica: boolean;
}

export interface PlanDeItems {
  crear: { orden: number; texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
  actualizar: {
    id: number;
    orden: number;
    texto: string;
    obligatorio: boolean;
    permiteNoAplica: boolean;
  }[];
  borrar: number[];
  /// Ítems que se pidió borrar y NO se pueden: ya son evidencia de una verificación hecha.
  /// Se devuelven con su texto porque el mensaje de error tiene que decir CUÁL.
  bloqueados: { id: number; texto: string; respuestas: number }[];
  errores: string[];
}

/// Cruza lo guardado con lo propuesto y dice qué hacer con cada ítem.
///
/// El `orden` NO viene de la pantalla: sale de la posición en el arreglo. Que la lista
/// mande su propio orden invita a dos ítems con el mismo número, y hay una unique
/// `(contenidoId, orden)` esperando para fallar con un error de Prisma en la cara.
export function planificarItems(
  guardados: readonly ItemGuardado[],
  propuestos: readonly ItemPropuesto[],
): PlanDeItems {
  const plan: PlanDeItems = {
    crear: [],
    actualizar: [],
    borrar: [],
    bloqueados: [],
    errores: [],
  };

  if (propuestos.length === 0) {
    plan.errores.push('una lista de verificación necesita al menos un ítem');
    return plan;
  }

  const porId = new Map(guardados.map((g) => [g.id, g]));
  const vistos = new Set<number>();

  propuestos.forEach((p, i) => {
    const orden = i + 1;
    const texto = p.texto.trim();
    if (texto === '') {
      plan.errores.push(`el ítem ${orden} no tiene texto`);
      return;
    }

    if (p.id === undefined) {
      plan.crear.push({
        orden,
        texto,
        obligatorio: p.obligatorio,
        permiteNoAplica: p.permiteNoAplica,
      });
      return;
    }

    const guardado = porId.get(p.id);
    if (!guardado) {
      // Un id que no existe no se crea en silencio: la pantalla creyó estar editando algo,
      // y crear otra cosa con el texto que mandó es adivinar.
      plan.errores.push(`el ítem ${p.id} no pertenece a este contenido`);
      return;
    }
    if (vistos.has(p.id)) {
      plan.errores.push(`el ítem ${p.id} viene dos veces`);
      return;
    }
    vistos.add(p.id);

    plan.actualizar.push({
      id: p.id,
      orden,
      texto,
      obligatorio: p.obligatorio,
      permiteNoAplica: p.permiteNoAplica,
    });
  });

  for (const g of guardados) {
    if (vistos.has(g.id)) continue;
    if (g.respuestas > 0) {
      plan.bloqueados.push({ id: g.id, texto: g.texto, respuestas: g.respuestas });
    } else {
      plan.borrar.push(g.id);
    }
  }

  if (plan.bloqueados.length > 0) {
    plan.errores.push(
      plan.bloqueados
        .map(
          (b) =>
            `«${b.texto}» ya fue respondido ${b.respuestas} vez(ces) y no se puede quitar` +
            ' (marcalo como opcional si dejó de aplicar)',
        )
        .join('; '),
    );
  }

  return plan;
}

/// R10, la regla de versionado. Editar un contenido que YA generó obligaciones sube su
/// versión; sin obligaciones, no.
///
/// Vale la pena tenerla escrita aparte aunque sea una línea: es la razón por la que un
/// acuse de lectura de hace seis meses sigue siendo verificable contra el texto que esa
/// persona leyó, y no contra el que el contenido dice hoy.
export function versionTrasEditar(versionActual: number, tieneObligaciones: boolean): number {
  return tieneObligaciones ? versionActual + 1 : versionActual;
}
