// lib/sgsi/aviso-sin-guardar.ts
//
// Qué dice el panel de una amenaza cuando la ficha tiene cambios sin guardar.
//
// POR QUÉ EXISTE. El panel es un modal: mientras está abierto tapa el pie de la ficha, donde
// vive «Guardar N cambios». Eso es comportamiento normal de un modal —el panel tiene su propio
// cierre y el cambio sobrevive a cerrarlo—, pero deja un hueco de información: quien cambia la
// madurez de un control ve moverse el residual y **no tiene forma de saber que eso está
// pendiente de guardar** hasta que cierra el panel.
//
// El 29/09/2026, sobre producción, alguien cambió una madurez, vio el residual bajar y
// preguntó si guardaba solo. Aquel día la respuesta era «no se guarda de ninguna forma»; hoy
// se guarda, y la pregunta que queda es la siguiente: «¿ya quedó?». Esto la contesta sin que
// haya que cerrar el panel para averiguarlo.
//
// ES UNA FUNCIÓN Y NO UN TERNARIO EN EL JSX porque el plural, el cero y el caso de «guardando»
// son tres decisiones, y las decisiones de esta pantalla se prueban sin montar nada.

export interface AvisoSinGuardar {
  texto: string;
  /// `true` mientras la acción está en vuelo: el aviso deja de pedir algo y pasa a informar.
  enVuelo: boolean;
}

/// `null` cuando no hay nada que decir. Un aviso que diga «0 cambios» es ruido permanente, y
/// un panel que siempre muestra una insignia enseña a no mirarla.
export function avisoSinGuardar(pendientes: number, guardando: boolean): AvisoSinGuardar | null {
  if (guardando) return { texto: 'Guardando…', enVuelo: true };
  if (pendientes <= 0) return null;
  return {
    // «Cierra este panel» y no «pulsa Guardar»: el botón está detrás del modal, así que decir
    // que lo pulse sería mandar a alguien a un sitio al que no puede llegar desde donde está.
    texto:
      pendientes === 1
        ? '1 cambio sin guardar · cierra este panel para guardarlo'
        : `${pendientes} cambios sin guardar · cierra este panel para guardarlos`,
    enVuelo: false,
  };
}
