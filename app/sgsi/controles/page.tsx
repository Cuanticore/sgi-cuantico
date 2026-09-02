// app/sgsi/controles/page.tsx
//
// Handoff v2.1 screen 5, "Controles y madurez".
//
// The server reads; the arithmetic lives in lib/sgsi/madurez.ts and runs again in the
// browser, so dragging a maturity select recomputes the header, the six filter cards
// and both analysis cards without a round trip — and both sides use one implementation.

import { prisma } from '@/lib/db';
import ControlesMadurez, {
  type ControlVista,
} from '@/app/components/sgsi/controles/ControlesMadurez';
import { leerDirectorio } from '@/lib/sgsi/directorio';

export const dynamic = 'force-dynamic';

export default async function ControlesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; capacidad?: string; dominio?: string }>;
}) {
  const [{ filtro, capacidad, dominio }, controles, capacidades, dominios, directorio, hallazgosSgsi] =
    await Promise.all([
      searchParams,
      prisma.control.findMany({
        orderBy: { codigo: 'asc' },
        include: {
          dominio: true,
          capacidad: true,
          lineaBase: true,
          actual: true,
          objetivo: true,
          amenazas: { include: { amenaza: true } },
          acciones: { where: { activa: true }, select: { codigo: true, estado: true } },
          evidencias: { orderBy: [{ esBase: 'desc' }, { orden: 'asc' }] },
        },
      }),
      prisma.capacidadOperativa.findMany({ orderBy: { orden: 'asc' } }),
      prisma.dominioAnexoA.findMany({ orderBy: { orden: 'asc' } }),
      leerDirectorio(),
      // B11: los hallazgos abiertos originados en el SGSI, para mostrarlos desde el
      // control que los produjo (el módulo B no es una isla).
      prisma.hallazgo.findMany({
        where: { origen: 'SGSI', fechaCierre: null, anuladoEn: null },
        select: { codigo: true, descripcion: true, origenReferencia: true },
      }),
    ]);

  const vista: ControlVista[] = controles.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    dominio: c.dominio.nombre,
    capacidad: c.capacidad.nombre,
    // The 164px column cannot fit the full ISO name, but the filter still matches on
    // the long one, so the view carries both.
    capacidadCorta: c.capacidad.nombreCorto,
    soa: (c.soa === 'PARCIAL' ? 'parcial' : c.soa === 'NO' ? 'no' : 'si') as ControlVista['soa'],
    lineaBase: c.lineaBase?.nivel ?? null,
    actual: c.actual?.nivel ?? null,
    objetivo: c.objetivo?.nivel ?? null,
    evidencias: c.evidencias.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      texto: e.texto,
      // The base entry is the one that justified the rating; it carries no delete button.
      esBase: e.esBase,
      creadaPor: e.creadaPor,
      creadaEn: e.creadaEn ? e.creadaEn.toISOString() : null,
      activo: e.activo,
      archivoNombre: e.archivoNombre,
      archivoMime: e.archivoMime,
      archivoTamano: e.archivoTamano,
      archivoSha256: e.archivoSha256,
      archivoVersion: e.archivoVersion,
    })),
    amenazas: c.amenazas.map((a) => ({ codigo: a.amenaza.codigo, nombre: a.amenaza.nombre })),
    accion: c.acciones[0] ? { codigo: c.acciones[0].codigo, estado: c.acciones[0].estado } : null,
    justificacionSoa: c.justificacionSoa,
    soaActualizadoPor: c.soaActualizadoPor,
    soaActualizadoEn: c.soaActualizadoEn ? c.soaActualizadoEn.toISOString() : null,
    soaDescripcion: c.soaDescripcion,
    soaDocumento: c.soaDocumento,
    soaVersion: c.soaVersion,
    soaFecha: c.soaFecha ? c.soaFecha.toISOString() : null,
    soaAprobadoPor: c.soaAprobadoPor,
    soaAlcanceAdaptado: c.soaAlcanceAdaptado,
    // B11: hallazgos abiertos originados en este control (origen tipado, no texto).
    hallazgosAbiertos: hallazgosSgsi
      .filter((h) => h.origenReferencia === String(c.id))
      .map((h) => ({ codigo: h.codigo, descripcion: h.descripcion })),
  }));

  return (
    <ControlesMadurez
      controles={vista}
      capacidades={capacidades.map((c) => c.nombre)}
      dominios={dominios.map((d) => d.nombre)}
      filtroInicial={filtro}
      capacidadInicial={capacidad}
      dominioInicial={dominio}
      directorio={directorio}
    />
  );
}
