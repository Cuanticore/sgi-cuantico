// app/sgsi/valoracion/page.tsx
//
// REQ-SIG-18 · la pantalla de Valoración de activos.
//
// El servidor lee y nada más. La agregación entera —el reparto por nivel, la escala compartida de
// las cuatro pilas, las dos tablas— se calcula en el navegador desde `lib/sgsi/valoracion-agregada.ts`,
// porque la selección de dimensión reescopa la Tabla A sin viaje de ida y vuelta (§6.2) y porque
// así hay UNA implementación de cada cuenta en vez de una del lado del servidor y otra del lado
// del cliente.
//
// La lectura no crea ninguna tabla ni ninguna columna: el valor sigue siendo derivado y el umbral
// sigue en `Parametro`. Y no escribe: visitar esta pantalla no deja una fila en `Bitacora`.

import PantallaValoracion from '@/app/components/sgsi/valoracion/PantallaValoracion';
import { leerValoracion } from '@/app/components/sgsi/valoracion/valoracion.query';

export const dynamic = 'force-dynamic';

export default async function ValoracionPage() {
  const { activos, dimensiones, escala, umbral, conPersona } = await leerValoracion();

  return (
    <PantallaValoracion
      activos={activos}
      dimensiones={dimensiones}
      escala={escala}
      umbral={umbral}
      conPersona={conPersona}
    />
  );
}
