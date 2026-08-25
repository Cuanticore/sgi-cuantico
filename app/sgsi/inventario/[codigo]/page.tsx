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
import FichaActivo from '@/app/components/sgsi/activos/FichaActivo';
import {
  cargarActivo,
  cargarAmenazas,
  cargarCatalogos,
  cargarNavegacion,
} from '@/app/components/sgsi/activos/ficha.query';

export const dynamic = 'force-dynamic';

const PESTANAS = ['valoracion', 'amenazas', 'resumen'] as const;
type Pestana = (typeof PESTANAS)[number];

function pestanaDe(valor: string | string[] | undefined): Pestana {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return PESTANAS.includes(v as Pestana) ? (v as Pestana) : 'valoracion';
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
