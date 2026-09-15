// app/sgsi/valoracion-riesgos/page.tsx
//
// REQ-SIG-20 §5 (P4) · «Análisis de riesgos». El servidor lee y nada más — ni un filtro ni un
// clic en una tarjeta escriben nada, y visitar la página no deja una fila en `Bitacora`
// (tarea 3.13). Toda la lógica vive en `lib/sgsi/analisis-riesgos.ts` (puro, probado) y en la
// pantalla cliente, que reescopa lista y tarjetas juntas.

import PantallaAnalisisRiesgos from '@/app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos';
import { leerAnalisisRiesgos } from '@/app/components/sgsi/valoracion-riesgos/analisis-riesgos.query';

export const dynamic = 'force-dynamic';

export default async function AnalisisRiesgosPage() {
  const { activos, bandas, umbral, procesos, propietarios, personas, accionesParaDeuda, sinPlan } =
    await leerAnalisisRiesgos();

  return (
    <PantallaAnalisisRiesgos
      activos={activos}
      bandas={bandas}
      umbral={umbral}
      procesos={procesos}
      propietarios={propietarios}
      personas={personas}
      accionesParaDeuda={accionesParaDeuda}
      sinPlan={sinPlan}
    />
  );
}
