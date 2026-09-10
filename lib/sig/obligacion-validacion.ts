// lib/sig/obligacion-validacion.ts
//
// Qué impide guardar una obligación. Puro y sin Prisma, para que lo llamen los dos lados.
//
// **Por qué vive acá y no en `app/sig/acciones/tareas.ts`, que es de donde viene.** Ese
// archivo es `'use server'`: toda exportación suya se vuelve una server action invocable
// desde el navegador, así que la función no se exportaba y **ninguna prueba la tocaba** —
// las guardas más importantes del motor de tareas no tenían una sola aserción encima.
//
// REQ-SIG-17 §3 pide las mismas guardas desde una semilla («si podés, extraé la validación a
// una función y llamala desde los dos lados»). Copiarlas habría producido dos reglas que se
// desincronizan en el primer cambio, y la que se rompe en silencio es la de la semilla,
// porque nadie la mira. Movidas acá: un solo lugar, dos llamadores, y por fin probables.
//
// La extracción no cambió **ni una** regla: el cuerpo era el de `tareas.ts:937-994`, textual.
// Lo único que cambió después fue el TIPO del alcance, y va explicado abajo.

import type { AlcanceObligacion, Periodicidad } from '@prisma/client';

/// El alcance sale del **enum de Prisma**, no de una union escrita a mano.
///
/// **Y se corrigió al agregar `GRUPO_INTERES`, que es cuando la diferencia se paga.** Cuando
/// esta función se extrajo de `tareas.ts` traía la union a mano, y quedó anotado que era la
/// misma trampa que `lib/sig/prevision.ts:26-33` documenta: un tipo propio se ve exhaustivo
/// contra una lista incompleta y **el compilador no avisa**. Con la union a mano, una
/// obligación por grupo de interés habría llegado a Prisma **sin pasar por la guarda de
/// «exactamente un destino»** — la validación se habría visto completa y no lo estaría.
export interface DatosObligacion {
  contenidoId: number;
  alcance: AlcanceObligacion;
  alcancePersonaId?: number;
  alcanceCargoId?: number;
  alcanceAreaId?: number;
  alcanceActivoId?: number;
  alcanceTipoActivoId?: number;
  alcanceNivelActivoId?: number;
  alcanceGrupoInteresId?: number;
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
  diasAviso: number;
  notificar?: boolean;
  responsableSeguimientoId: number;
}

/// El tipo dice que `contenidoId` y `responsableSeguimientoId` son obligatorios, pero eso
/// solo vale en compilación: los datos llegan de un formulario, y un `<select>` sin opciones
/// —porque el catálogo está vacío— manda `undefined`. Sin esta comprobación ese `undefined`
/// viajaba hasta Prisma, que respondía «Argument `id` is missing» con el nombre del módulo
/// empaquetado a cuestas. Un error de base de datos crudo en pantalla no le dice a nadie que
/// primero hay que crear un contenido.
export function validarDatosObligacion(datos: DatosObligacion): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(datos.contenidoId) || datos.contenidoId <= 0) {
    errores.push('elegí el contenido de la obligación');
  }
  if (!Number.isInteger(datos.responsableSeguimientoId) || datos.responsableSeguimientoId <= 0) {
    errores.push('elegí quién responde por el seguimiento');
  }
  if (!(datos.fechaInicio instanceof Date) || Number.isNaN(datos.fechaInicio.getTime())) {
    errores.push('la fecha de inicio no es válida');
  }
  if (!Number.isFinite(datos.plazoDias) || datos.plazoDias <= 0) {
    errores.push('el plazo debe ser positivo');
  }
  if (!Number.isFinite(datos.diasAviso) || datos.diasAviso < 0) {
    errores.push('los días de aviso no pueden ser negativos');
  }
  // R4: exactamente UN destino, y ahora hay seis columnas donde puede estar. Contarlas
  // todas juntas es lo que impide que una obligación quede con dos destinos —por ejemplo,
  // un área Y un tipo de activo— y que la generación tenga que elegir uno en silencio.
  const destinos = [
    datos.alcancePersonaId,
    datos.alcanceCargoId,
    datos.alcanceAreaId,
    datos.alcanceActivoId,
    datos.alcanceTipoActivoId,
    datos.alcanceNivelActivoId,
    datos.alcanceGrupoInteresId,
  ].filter((v) => v !== undefined);
  if (datos.alcance !== 'TODOS' && destinos.length !== 1) {
    errores.push('el alcance exige exactamente un destino');
  }
  if (datos.alcance === 'TODOS' && destinos.length !== 0) {
    errores.push('el alcance TODOS no lleva destino');
  }
  // Y el destino tiene que ser el de SU columna. Sin esto, un alcance `TIPO_ACTIVO` con
  // `alcanceAreaId` puesto pasaba la cuenta de arriba y la generación no encontraba
  // ningún activo: la obligación quedaba creada y sin generar nada, en silencio.
  // `Record<AlcanceObligacion, …>` y no `Record<string, …>`: así el compilador exige que cada
  // valor del enum tenga su columna. Con `string` como llave, un alcance nuevo sin entrada
  // daba `undefined` y caía en el error de abajo — «exige su propio destino» — culpando a
  // quien creaba la obligación de un hueco que era del código.
  const columnaDe: Record<AlcanceObligacion, number | undefined> = {
    PERSONA: datos.alcancePersonaId,
    CARGO: datos.alcanceCargoId,
    AREA: datos.alcanceAreaId,
    TODOS: undefined,
    ACTIVO: datos.alcanceActivoId,
    TIPO_ACTIVO: datos.alcanceTipoActivoId,
    NIVEL_ACTIVO: datos.alcanceNivelActivoId,
    GRUPO_INTERES: datos.alcanceGrupoInteresId,
  };
  if (datos.alcance !== 'TODOS' && columnaDe[datos.alcance] === undefined) {
    errores.push(`el alcance ${datos.alcance} exige su propio destino, no el de otro alcance`);
  }
  // `NivelActivo` es de REQ-SIG-06 y no existe. Se rechaza al CREAR y no sólo al generar:
  // una obligación que nunca va a producir nada no debería poder guardarse.
  if (datos.alcance === 'NIVEL_ACTIVO') {
    errores.push(
      'el alcance por nivel de activo necesita la jerarquía de niveles (REQ-SIG-06), que ' +
        'todavía no está construida',
    );
  }
  return errores;
}
