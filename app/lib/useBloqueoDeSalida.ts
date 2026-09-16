'use client';

// app/lib/useBloqueoDeSalida.ts
//
// Pide confirmación antes de abandonar la pestaña mientras hay trabajo en curso.
//
// POR QUÉ. Recargar en medio de una importación no cancela nada: la server action sigue
// corriendo del lado del servidor, sólo que ya no queda nadie leyendo el resultado. La
// persona se va sin saber si los activos entraron, y la salida obvia —volver a importar el
// mismo archivo— crea un SEGUNDO juego de activos con códigos nuevos. El mismo riesgo que
// `importarPlantilla` ya se cuida de no provocar con sus mensajes.
//
// LO QUE EL NAVEGADOR NO DEJA HACER. Desde 2017 ningún navegador muestra un texto propio en
// este diálogo: se ignora lo que se ponga en `returnValue` y se muestra el genérico. Y sólo
// aparece si hubo interacción previa con la página — cargar un archivo y darle a un botón
// alcanza de sobra. Por eso el aviso con palabras nuestras vive en el botón de cerrar del
// popup, donde sí controlamos el mensaje completo.

import { useEffect } from 'react';

/// Bloquea recargar y cerrar la pestaña mientras `enCurso` sea verdadero.
export function useBloqueoDeSalida(enCurso: boolean): void {
  useEffect(() => {
    if (!enCurso) return;

    const alSalir = (evento: BeforeUnloadEvent): void => {
      // `preventDefault` es lo que la especificación pide hoy; `returnValue` sigue ahí
      // porque algunos navegadores todavía se guían por él. Ninguno de los dos elige el
      // texto: eso lo decide el navegador.
      evento.preventDefault();
      evento.returnValue = '';
    };

    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [enCurso]);
}
