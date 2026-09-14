// lib/sig/contactos.ts
//
// **P9.2 · qué se decide sobre los contactos de emergencia de una persona.**
//
// La pestaña Contactos del popup edita una lista entera de una vez: quien la usa agrega una
// fila, corrige un teléfono, sube a alguien de segundo a primero y guarda. Eso no es un
// formulario de un registro: es un conjunto que llega completo y hay que cruzarlo con el que
// está guardado para saber qué se crea, qué se actualiza y qué se retira.
//
// Ese cruce se decide acá, puro y sin base de datos, por lo mismo que `contenidos.ts` decide
// el plan de los ítems de verificación: la regla de qué se retira es lo que hay que poder
// leer de un tirón y probar sin levantar Postgres. La acción ejecuta el plan y no vuelve a
// decidir nada.
//
// ── Las tres reglas que sostienen el módulo ──────────────────────────────────────────────
//
// **Una fila en blanco no es un error.** El formulario ofrece filas vacías para que haya
// dónde escribir; guardar con una sin tocar es lo normal, no una equivocación. Se descarta en
// silencio. Una fila a medias sí es un error, porque alguien empezó a escribirla.
//
// **El parentesco se exige aunque sea texto libre.** No es un adorno del formulario: en una
// emergencia lo que se decide con esa lista es a quién se llama y qué se le dice. «Ana Pérez,
// 300 111 2222» sin parentesco no alcanza para decidir si esa persona es quien recibe la
// noticia.
//
// **El orden es la posición en la lista, no un número que manda la pantalla.** «A quién se
// llama primero» es exactamente el orden en que las filas están puestas. Que la pantalla
// mande su propio número invita a dos contactos con el mismo, y entonces el primero deja de
// ser uno solo.
//
// P9.2 también fija lo que este módulo **no** conoce: nombre, parentesco y teléfono, nada
// más. No hay correo, ni dirección, ni documento, porque para llamar en una emergencia no se
// necesitan y son datos de un tercero que nunca autorizó nada.

/// Un contacto tal como está guardado hoy.
export interface ContactoGuardado {
  id: number;
  nombre: string;
  parentesco: string;
  telefono: string;
  orden: number;
}

/// Un contacto tal como lo manda la pantalla. Sin `id` es nuevo.
export interface ContactoPropuesto {
  id?: number;
  nombre: string;
  parentesco: string;
  telefono: string;
}

/// Los campos ya limpios y con su orden resuelto, listos para escribir.
export interface ContactoACrear {
  orden: number;
  nombre: string;
  parentesco: string;
  telefono: string;
}

export interface ContactoAActualizar extends ContactoACrear {
  id: number;
}

/// Una fila de bitácora ya redactada. La acción sólo la escribe: el `campo`, el valor
/// anterior y el nuevo los decide este módulo, para que la frase que describe un retiro y la
/// que describe un alta salgan del mismo lugar y no se contradigan.
export interface AnotacionDeContacto {
  campo: string;
  /// `null` es «no existía», que la bitácora rinde como «(vacío)».
  anterior: string | null;
  nuevo: string | null;
}

export interface PlanDeContactos {
  crear: ContactoACrear[];
  /// Sólo los que de verdad cambian —nombre, parentesco, teléfono u orden—. Un contacto que
  /// llegó igual que como está guardado no entra: un `update` que no cambia nada gasta una
  /// escritura y, peor, ensucia la bitácora con una fila que no describe ningún cambio.
  actualizar: ContactoAActualizar[];
  /// Los que estaban guardados y la pantalla ya no manda.
  retirar: number[];
  anotaciones: AnotacionDeContacto[];
  errores: string[];
}

const CAMPO = 'contacto de emergencia';

/// Cómo se lee un contacto en la bitácora. Lleva el orden adelante porque un reordenamiento
/// es un cambio real —cambia a quién se llama primero— y sin el número no se vería.
function descripcion(c: {
  orden: number;
  nombre: string;
  parentesco: string;
  telefono: string;
}): string {
  return `${c.orden} · ${c.nombre} · ${c.parentesco} · ${c.telefono}`;
}

/// Si los tres campos están vacíos, la fila nunca se escribió: es el hueco que el formulario
/// ofrece para agregar y nadie usó.
export function estaEnBlanco(c: ContactoPropuesto): boolean {
  return (
    c.nombre.trim() === '' && c.parentesco.trim() === '' && c.telefono.trim() === ''
  );
}

/// Cruza lo guardado con lo propuesto y dice qué hacer con cada contacto.
///
/// Devuelve el plan aunque haya errores: quien llama decide si ejecuta, y tener el plan al
/// lado del error ayuda a redactar el mensaje. La acción no ejecuta nada con `errores` no
/// vacío — guardar la mitad de una lista sería dejarla mintiendo.
export function planificarContactos(
  guardados: readonly ContactoGuardado[],
  propuestos: readonly ContactoPropuesto[],
): PlanDeContactos {
  const plan: PlanDeContactos = {
    crear: [],
    actualizar: [],
    retirar: [],
    anotaciones: [],
    errores: [],
  };

  const porId = new Map(guardados.map((g) => [g.id, g]));
  const vistos = new Set<number>();

  // Las filas en blanco se descartan ANTES de numerar: si contaran, dejar un hueco en el
  // medio correría el orden de todos los de abajo y el segundo contacto pasaría a ser el
  // tercero sin que nadie lo haya pedido.
  const reales = propuestos.filter((p) => !estaEnBlanco(p));

  reales.forEach((p, i) => {
    const orden = i + 1;
    const nombre = p.nombre.trim();
    const parentesco = p.parentesco.trim();
    const telefono = p.telefono.trim();

    // El id se resuelve ANTES de validar los campos. Un contacto que llegó a medias sigue
    // siendo un contacto que está guardado: si no quedara marcado como visto, caería en
    // `retirar` y el plan diría que hay que borrarlo cuando lo que pasa es que falta un dato.
    let guardado: ContactoGuardado | undefined;
    if (p.id !== undefined) {
      guardado = porId.get(p.id);
      if (!guardado) {
        // Un id que no existe no se crea en silencio: la pantalla creyó estar editando algo,
        // y crear otro contacto con lo que mandó es adivinar a quién se llama.
        plan.errores.push(`el contacto de emergencia ${p.id} no pertenece a esta persona`);
        return;
      }
      if (vistos.has(p.id)) {
        plan.errores.push(`el contacto de emergencia ${p.id} viene dos veces`);
        return;
      }
      vistos.add(p.id);
    }

    // Se nombra el contacto por su posición porque puede no tener nombre todavía — es
    // justamente uno de los casos que esto rechaza.
    const faltan: string[] = [];
    if (nombre === '') faltan.push('nombre');
    if (parentesco === '') faltan.push('parentesco');
    if (telefono === '') faltan.push('teléfono');
    if (faltan.length > 0) {
      plan.errores.push(`al contacto de emergencia ${orden} le falta ${faltan.join(' y ')}`);
      return;
    }

    if (guardado === undefined) {
      plan.crear.push({ orden, nombre, parentesco, telefono });
      plan.anotaciones.push({
        campo: CAMPO,
        anterior: null,
        nuevo: descripcion({ orden, nombre, parentesco, telefono }),
      });
      return;
    }

    const cambio =
      guardado.nombre !== nombre ||
      guardado.parentesco !== parentesco ||
      guardado.telefono !== telefono ||
      guardado.orden !== orden;
    if (!cambio) return;

    plan.actualizar.push({ id: guardado.id, orden, nombre, parentesco, telefono });
    plan.anotaciones.push({
      campo: CAMPO,
      anterior: descripcion(guardado),
      nuevo: descripcion({ orden, nombre, parentesco, telefono }),
    });
  });

  for (const g of guardados) {
    if (vistos.has(g.id)) continue;
    plan.retirar.push(g.id);
    plan.anotaciones.push({ campo: CAMPO, anterior: descripcion(g), nuevo: null });
  }

  return plan;
}
