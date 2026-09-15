// app/sgsi/inventario/[codigo]/page.tsx
//
// Handoff v2.1 screen 4, "Ficha del activo" — edit mode.
//
// The asset is resolved by its CODE and not by its id. The code is the identifier the
// organisation actually uses: it is on the documents already issued, it is immutable and
// it is never reused, so a URL built from it keeps meaning after any edit. Only the
// numeric id would be shorter, and it means nothing to anyone reading the address bar.
//
// Next 16: `params` and `searchParams` are Promises and must be awaited.

import { notFound } from 'next/navigation';
import FichaActivo, { type Pestana } from '@/app/components/sgsi/activos/FichaActivo';
import {
  cargarActivo,
  cargarAmenazas,
  cargarCatalogos,
  cargarNavegacion,
} from '@/app/components/sgsi/activos/ficha.query';
import { pestanaInternaDesdeUrl } from '@/app/components/sgsi/activos/overlay-tabs';

export const dynamic = 'force-dynamic';

// REQ-SIG-20 §6 (D1, tarea 3.5): la página completa acepta las DOS grafías del parámetro
// `tab` — la interna (`valoracion|amenazas|resumen|ecuacion`) y la del overlay
// (`general|amenazas|matrices|ecuacion`) — con la misma función que usa `OverlayActivo`,
// para que un enlace armado con cualquiera de las dos aterrice en la pestaña correcta.
// Antes de esta tarea la lista local ni siquiera incluía `ecuacion`: un `?tab=ecuacion` a
// esta ruta caía en Valoración sin avisar.
function pestanaDe(valor: string | string[] | undefined): Pestana {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return pestanaInternaDesdeUrl(v);
}

export default async function FichaActivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ codigo }, consulta] = await Promise.all([params, searchParams]);

  // The code travels URL-encoded; AAA-TTT-NNNN has no reserved characters, but a code
  // typed by hand might.
  const activo = await cargarActivo(decodeURIComponent(codigo));
  if (activo === null) notFound();

  const [catalogos, amenazas, navegacion] = await Promise.all([
    cargarCatalogos(),
    cargarAmenazas(),
    cargarNavegacion(),
  ]);

  // The drill-down of the matrices links to a specific threat of a specific asset, so the
  // sheet can open on the Amenazas tab with that row already expanded.
  const amenaza = consulta.amenaza;

  return (
    <FichaActivo
      activo={activo}
      catalogos={catalogos}
      amenazas={amenazas}
      navegacion={navegacion}
      pestanaInicial={pestanaDe(consulta.tab)}
      amenazaInicial={Array.isArray(amenaza) ? (amenaza[0] ?? null) : (amenaza ?? null)}
    />
  );
}
