// app/sgsi/riesgo-residual/page.tsx
//
// Aprobación del riesgo residual. ISO/IEC 27001:2022 6.1.3 e): «debe conservarse información
// documentada del proceso de apreciación y del plan de tratamiento del riesgo, incluida la
// aceptación de los riesgos residuales por sus propietarios».
//
// El SGSI ya registraba la DECISIÓN —`AccionPlan` de tipo `ACEPTAR`— y no registraba el ACTO
// de aprobar. Esta pantalla es ese acto: genera el acta, la entrega firmable, y guarda quién
// la firmó cuando vuelve.
//
// No hay pantalla equivalente en Mi SIG porque el acta se firma en papel: no queda nada que
// una persona sin acceso al SGSI tenga que hacer dentro de la aplicación.

import { puede } from '@/lib/sgsi/permisos';
import { rolActual } from '@/app/sgsi/acciones/sesion';
import PantallaRiesgoResidual from '@/app/components/sgsi/riesgo-residual/PantallaRiesgoResidual';
import { leerRiesgoResidual } from './acta.query';

export const dynamic = 'force-dynamic';

export default async function RiesgoResidualPage() {
  // El periodo es el año en curso. Va acá y no en la consulta para que la pantalla siga
  // sirviendo el día que haya que abrir un periodo distinto desde la URL.
  const periodo = String(new Date().getFullYear());
  const [datos, rol] = await Promise.all([leerRiesgoResidual(periodo), rolActual()]);

  return <PantallaRiesgoResidual datos={datos} puedeEscribir={puede(rol, 'sgsi:escribir')} />;
}
