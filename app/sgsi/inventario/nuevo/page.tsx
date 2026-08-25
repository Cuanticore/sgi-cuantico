// app/sgsi/inventario/nuevo/page.tsx
//
// Handoff v2.1 screen 3, "Ficha del activo" — creation mode.
//
// There is NO separate creation screen in v2.1: the sheet itself has a creation mode, and
// this route is that mode. It renders the same component with `activo = null`, which is
// what makes the name and the description start empty, the code chip show the live
// AAA-TTT-NNNN preview instead of an assigned code, the valuation start at 0 — so no
// orange band appears until the asset is actually valued — and the primary button read
// "Crear activo".
//
// This static segment resolves before the sibling `[codigo]` dynamic segment, so
// /sgsi/inventario/nuevo can never be read as an asset whose code is "nuevo". Codes are
// AAA-TTT-NNNN anyway, so the two sets could not collide even if the order were reversed.

import FichaActivo from '@/app/components/sgsi/activos/FichaActivo';
import {
  cargarAmenazas,
  cargarCatalogos,
  cargarNavegacion,
} from '@/app/components/sgsi/activos/ficha.query';

export const dynamic = 'force-dynamic';

export default async function NuevoActivoPage() {
  const [catalogos, amenazas, navegacion] = await Promise.all([
    cargarCatalogos(),
    cargarAmenazas(),
    cargarNavegacion(),
  ]);

  return (
    <FichaActivo
      activo={null}
      catalogos={catalogos}
      amenazas={amenazas}
      navegacion={navegacion}
      pestanaInicial="valoracion"
    />
  );
}
