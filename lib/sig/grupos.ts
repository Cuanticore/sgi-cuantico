// lib/sig/grupos.ts
//
// **P10, P13 y P16 · qué se decide sobre los grupos de interés de una persona.**
//
// La pestaña Grupos del popup edita un conjunto de casillas y lo manda entero: se pertenece a
// varios grupos a la vez, así que no hay un campo que cambia sino una lista que llega completa
// y hay que cruzarla con la que está guardada. Ese cruce se decide acá, puro y sin base de
// datos, por lo mismo que `contactos.ts` decide el plan de los contactos de emergencia: la
// regla de qué se abre y qué se cierra es lo que hay que poder leer de un tirón y probar sin
// levantar Postgres. La acción ejecuta el plan y no vuelve a decidir nada.
//
// ── Las tres reglas que sostienen el módulo ──────────────────────────────────────────────
//
// **Desmarcar CIERRA la fila, nunca la borra.** `MiembroGrupoInteres.hasta` existe porque
// «quién estaba en Desarrolladores en marzo» es una pregunta de auditoría, y una fila borrada
// no la contesta. Es lo contrario de lo que hace `contactos.ts`, y la diferencia no es de
// gusto: `ContactoEmergencia` no tiene columna de baja y `MiembroGrupoInteres` sí, puesta
// exactamente para esto. La membresía VIGENTE es `hasta IS NULL`, y es la única que el
// generador mira.
//
// **Un grupo derivado no admite membresías, y rechazarlo es del servidor.** «Todos» tiene
// `derivado: true`: su pertenencia se calcula —«toda persona activa»— y no se guarda. Si
// además tuviera filas habría dos respuestas a «quién pertenece» y ganaría la que consulte
// cada pantalla. La casilla del popup va deshabilitada, pero una validación que sólo vive en
// el cliente se salta llamando a la acción directamente, así que el rechazo se decide acá.
//
// **Lo que ya estaba vigente y sigue marcado no genera escritura.** Un `update` que no cambia
// nada gasta una escritura y, peor, ensucia la bitácora con una fila que no describe ningún
// cambio. Y si re-abriera la membresía moviéndole el `desde`, le correría el piso de periodos
// a alguien que nunca dejó de pertenecer.

/// Una membresía tal como está guardada hoy. Sólo llegan las **vigentes** (`hasta IS NULL`):
/// una cerrada es historia, y volver a cerrarla no significaría nada.
export interface MembresiaVigente {
  id: number;
  grupoId: number;
  desde: Date;
}

/// Lo mínimo que hace falta saber de un grupo del catálogo para decidir. El `nombre` es para
/// la bitácora: un id suelto dentro de un año no lo resuelve nadie.
export interface GrupoConocido {
  id: number;
  nombre: string;
  derivado: boolean;
}

export interface MembresiaACrear {
  grupoId: number;
  /// **P16 · el tercer término del piso.** Desde cuándo pertenece, no cuándo se digitó.
  desde: Date;
}

export interface MembresiaACerrar {
  id: number;
  grupoId: number;
  /// Se cierra, no se borra.
  hasta: Date;
}

/// Una fila de bitácora ya redactada. La acción sólo la escribe: el `campo`, el valor anterior
/// y el nuevo los decide este módulo, para que la frase que describe un alta y la que describe
/// un cierre salgan del mismo lugar y no se contradigan.
export interface AnotacionDeGrupo {
  campo: string;
  /// `null` es «no existía», que la bitácora rinde como «(vacío)».
  anterior: string | null;
  nuevo: string | null;
}

export interface PlanDeGrupos {
  crear: MembresiaACrear[];
  cerrar: MembresiaACerrar[];
  /// **Lo que el generador tiene que mirar después de aplicar el plan.** Es lo que hace que el
  /// número que el popup informa sea un hecho y no una previsión: la generación corre con esta
  /// lista, que es exactamente la que va a quedar guardada, y no con la que estaba antes.
  vigentesResultantes: { grupoId: number; desde: Date }[];
  anotaciones: AnotacionDeGrupo[];
  errores: string[];
}

const CAMPO = 'grupo de interés';

/// El día, sin hora. La bitácora la leen personas y «2026-09-14» es lo que significa el dato:
/// `desde` y `hasta` son columnas de fecha, no instantes.
function dia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/// Cruza las membresías vigentes con las casillas marcadas y dice qué se abre y qué se cierra.
///
/// Devuelve el plan aunque haya errores: quien llama decide si ejecuta, y tener el plan al lado
/// del error ayuda a redactar el mensaje. La acción no ejecuta nada con `errores` no vacío.
export function planificarGrupos(
  vigentes: readonly MembresiaVigente[],
  propuestos: readonly number[],
  conocidos: readonly GrupoConocido[],
  hoy: Date,
): PlanDeGrupos {
  const plan: PlanDeGrupos = {
    crear: [],
    cerrar: [],
    vigentesResultantes: [],
    anotaciones: [],
    errores: [],
  };

  const catalogo = new Map(conocidos.map((g) => [g.id, g]));
  const nombreDe = (grupoId: number) => catalogo.get(grupoId)?.nombre ?? `grupo ${grupoId}`;

  // Las casillas son un conjunto: marcar dos veces la misma no es un caso, es la misma marca.
  // Se ordena para que dos guardados con las mismas casillas produzcan el mismo plan y la
  // bitácora no dependa del orden en que la pantalla recorrió la lista.
  const marcados = [...new Set(propuestos)].sort((a, b) => a - b);

  for (const grupoId of marcados) {
    const grupo = catalogo.get(grupoId);
    if (grupo === undefined) {
      // Un id que el catálogo no tiene no se crea en silencio: quedaría una membresía en un
      // grupo que nadie puede abrir, y el generador no le dirigiría nada.
      plan.errores.push(`el grupo de interés ${grupoId} no existe o está inactivo`);
      continue;
    }
    if (grupo.derivado) {
      // P10 · el rechazo del derivado. Va en el servidor a propósito: la casilla del popup
      // está deshabilitada, pero eso no impide llamar a la acción con el id puesto.
      plan.errores.push(
        `«${grupo.nombre}» es un grupo derivado: su pertenencia se calcula —toda persona ` +
          'activa— y no se guarda como membresía',
      );
    }
  }

  const marcadosSet = new Set(marcados);
  const yaVigente = new Map(vigentes.map((m) => [m.grupoId, m]));

  // Lo que se cierra: estaba vigente y la pantalla ya no lo manda.
  for (const m of vigentes) {
    if (marcadosSet.has(m.grupoId)) {
      // Sigue marcado: no se toca. Reabrirlo le movería el `desde` a alguien que nunca dejó
      // de pertenecer, y con él el piso de periodos.
      plan.vigentesResultantes.push({ grupoId: m.grupoId, desde: m.desde });
      continue;
    }
    plan.cerrar.push({ id: m.id, grupoId: m.grupoId, hasta: hoy });
    plan.anotaciones.push({
      campo: CAMPO,
      anterior: `${nombreDe(m.grupoId)} · desde ${dia(m.desde)}`,
      // No es `null`: la fila sigue existiendo, cerrada. Decir «(vacío)» haría leer un borrado
      // donde hubo una baja con fecha, que es justo lo que `hasta` viene a distinguir.
      nuevo: `retirado el ${dia(hoy)}`,
    });
  }

  // Lo que se abre: la pantalla lo manda y no estaba vigente. Los derivados y los desconocidos
  // ya quedaron anotados como error y no llegan acá.
  for (const grupoId of marcados) {
    const grupo = catalogo.get(grupoId);
    if (grupo === undefined || grupo.derivado) continue;
    if (yaVigente.has(grupoId)) continue;

    // **P16 · desde hoy, que es lo más conservador.** Marcar Desarrolladores a alguien en
    // septiembre no le cobra el curso del primer trimestre: el piso arranca cuando la
    // pertenencia arranca, y la aplicación no puede afirmar que arrancó antes.
    plan.crear.push({ grupoId, desde: hoy });
    plan.vigentesResultantes.push({ grupoId, desde: hoy });
    plan.anotaciones.push({
      campo: CAMPO,
      anterior: null,
      nuevo: `${grupo.nombre} · desde ${dia(hoy)}`,
    });
  }

  plan.vigentesResultantes.sort((a, b) => a.grupoId - b.grupoId);

  return plan;
}
