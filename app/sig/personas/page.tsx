// app/sig/personas/page.tsx
//
// El censo. La lectura vive en `censo.query.ts` porque `/sig/colaboradores` necesita
// exactamente las mismas filas para abrir el popup de edición: son las mismas personas y
// tienen que salir de la misma lectura.

import { cargarCenso } from './censo.query';
import PersonasClient from './Personas.client';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  const censo = await cargarCenso();
  return (
    <PersonasClient
      filas={censo.filas}
      corrida={censo.corrida}
      administra={censo.administra}
      bloqueoDisponible={censo.bloqueoDisponible}
      rolesConsultables={censo.rolesConsultables}
      motivoSinRoles={censo.motivoSinRoles}
      catalogos={censo.catalogos}
    />
  );
}
