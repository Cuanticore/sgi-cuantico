// app/sig/colaboradores/page.tsx
//
// REQ-SIG-09 · la lista única de colaboradores.
//
// «Una sola tabla con activos e inactivos, sincronizada del Directorio Activo. **El estado
// no se almacena**: se calcula de la fecha de retiro, así que el tipo de contrato sobrevive
// al retiro» (lienzo `handoff_colaboradores/design/Colaboradores.dc.html`).
//
// **Las cuatro anomalías de §5.1 ya se calculan.** Dos salían marcadas como no calculables
// porque `AccesoPersona` (REQ-SIG-07) y `ActaAceptacion` no existían; construidas las dos,
// el panel dejó de mostrar guiones grises.
//
// La distinción que permitió encenderlas sin tocar el módulo puro: recibe `null` cuando el
// dato NO SE PUEDE saber, y un conjunto —aunque esté vacío— cuando sí. Un vacío dice
// «nadie», que es una respuesta; `null` dice «no se sabe», que no lo es. Cambiar `null` por
// el conjunto real fue todo lo que hizo falta.

import { prisma } from '@/lib/db';
import {
  anomalias,
  composicionPorContrato,
  estaActiva,
  type ColaboradorBase,
} from '@/lib/sig/colaboradores';
import { personasConAccesoVigente, type AccesoConVigencia } from '@/lib/sig/accesos';
import ColaboradoresClient from './Colaboradores.client';

export const dynamic = 'force-dynamic';

export default async function ColaboradoresPage() {
  const [personas, tipos, accesos, actas] = await Promise.all([
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
    // REQ-SIG-07 ya existe: las dos anomalias que salian en gris ahora SI se calculan.
    prisma.accesoPersona.findMany({
      select: { id: true, personaId: true, perfilId: true, desde: true, hasta: true, solicitudId: true },
    }),
    // Los cuatro compromisos de C3 se identifican por el codigo del contenido que los
    // declara: el titulo se puede reescribir y el codigo es la referencia con la que
    // PRO-TAL-01 los nombra.
    prisma.actaAceptacion.findMany({
      select: { personaId: true, contenido: { select: { codigo: true } } },
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

  // Los codigos que cuentan como compromiso salen de los contenidos marcados con su
  // control del Anexo A. Mientras ninguno este marcado, el conjunto queda VACIO y no nulo:
  // vacio dice «nadie firmo», que es cierto, y nulo diria «no se sabe», que ya no aplica.
  const codigosCompromiso = await prisma.contenidoSig.findMany({
    where: { exigeFirma: true, activo: true },
    select: { codigo: true },
  });
  const exigidos = new Set(codigosCompromiso.map((c) => c.codigo));
  const firmadoPor = new Map<number, Set<string>>();
  for (const a of actas) {
    const suyos = firmadoPor.get(a.personaId) ?? new Set<string>();
    suyos.add(a.contenido.codigo);
    firmadoPor.set(a.personaId, suyos);
  }
  const personasConLosCompromisos = new Set(
    [...firmadoPor.entries()]
      .filter(([, suyos]) => exigidos.size > 0 && [...exigidos].every((c) => suyos.has(c)))
      .map(([id]) => id),
  );

  const cuatro = anomalias({
    personas: base,
    conActaDeBorrado: new Set(personas.filter((p) => p.actasBorrado.length > 0).map((p) => p.id)),
    // Las dos que salian en gris. Ya no son `null`: REQ-SIG-07 existe y `ActaAceptacion`
    // tambien, asi que las cuatro anomalias se calculan.
    conAccesosVigentes: personasConAccesoVigente(accesos as AccesoConVigencia[], new Date()),
    conLosCuatroCompromisos: personasConLosCompromisos,
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
