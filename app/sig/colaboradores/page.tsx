// app/sig/colaboradores/page.tsx
//
// REQ-SIG-09 · la lista única de colaboradores.
//
// «Una sola tabla con activos e inactivos, sincronizada del Directorio Activo. **El estado
// no se almacena**: se calcula de la fecha de retiro, así que el tipo de contrato sobrevive
// al retiro» (lienzo `handoff_colaboradores/design/Colaboradores.dc.html`).
//
// Dos de las cuatro anomalías de §5.1 NO se pueden calcular todavía: `AccesoPersona` es de
// REQ-SIG-07 (fase 3) y `ActaAceptacion` de REQ-SIG-02, y ninguna existe. Se muestran
// marcadas en vez de omitirse — un tablero que enseña dos de cuatro y no dice que faltan
// dos asegura que el sistema está mejor de lo que se sabe.

import { prisma } from '@/lib/db';
import {
  anomalias,
  composicionPorContrato,
  estaActiva,
  type ColaboradorBase,
} from '@/lib/sig/colaboradores';
import ColaboradoresClient from './Colaboradores.client';

export const dynamic = 'force-dynamic';

export default async function ColaboradoresPage() {
  const [personas, tipos] = await Promise.all([
    prisma.persona.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        area: { select: { nombre: true } },
        cargo: { select: { nombre: true } },
        tipoContrato: { select: { nombre: true, esNomina: true } },
        actasBorrado: { select: { id: true } },
      },
    }),
    prisma.tipoContrato.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { orden: 'asc' },
    }),
  ]);

  const base: (ColaboradorBase & { fechaIngreso: Date | null; tipoContrato: string | null })[] =
    personas.map((p) => ({
      id: p.id,
      activa: p.activa,
      retiradoEn: p.retiradoEn,
      origen: p.origen,
      fechaIngreso: p.fechaIngreso,
      tipoContrato: p.tipoContrato?.nombre ?? null,
    }));

  const cuatro = anomalias({
    personas: base,
    conActaDeBorrado: new Set(personas.filter((p) => p.actasBorrado.length > 0).map((p) => p.id)),
    // `null` y no un conjunto vacío: vacío afirmaría que nadie tiene accesos vigentes ni
    // compromisos firmados, y eso es una respuesta, no la ausencia de una.
    conAccesosVigentes: null,
    conLosCuatroCompromisos: null,
  });

  const conAnomalia = new Set(cuatro.flatMap((a) => a.personas));

  const filas = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    correo: p.correo,
    area: p.area?.nombre ?? null,
    cargo: p.cargo?.nombre ?? null,
    tipoContrato: p.tipoContrato?.nombre ?? null,
    esNomina: p.tipoContrato?.esNomina ?? false,
    tipoColaborador: p.tipoColaborador,
    origen: p.origen,
    // Derivado, nunca leído de una columna de estado.
    activa: estaActiva({
      id: p.id,
      activa: p.activa,
      retiradoEn: p.retiradoEn,
      origen: p.origen,
    }),
    fechaIngreso: p.fechaIngreso?.toISOString().slice(0, 10) ?? null,
    retiradoEn: p.retiradoEn?.toISOString().slice(0, 10) ?? null,
    conActa: p.actasBorrado.length > 0,
    tieneAnomalia: conAnomalia.has(p.id),
  }));

  return (
    <ColaboradoresClient
      filas={filas}
      anomalias={cuatro.map((a) => ({
        clave: a.clave,
        etiqueta: a.etiqueta,
        consecuencia: a.consecuencia,
        calculable: a.calculable,
        n: a.personas.length,
      }))}
      composicion={composicionPorContrato(base)}
      tiposDeContrato={tipos}
    />
  );
}
