// app/sig/procesos/page.tsx
//
// Configuración · Procesos (docs/handoff_sig/proceso-entidad.md §4).
//
// La lista de los nueve procesos del mapa de MAN-SIG-02 y, por cada uno, QUÉ CUELGA DE ÉL:
// cuántas filas del programa de auditoría, cuántos requisitos legales y cuántas celdas de
// plan. Ese último conteo es el que importa — es lo que permite ver de un vistazo un
// proceso que nunca se ha auditado.
//
// La tabla `Proceso` está VACÍA y la pantalla lo dice en vez de disimularlo. Poblarla exige
// dos datos que la fuente no da: el área de cada proceso y la correspondencia de cargos.
// Ver `lib/sig/procesos.ts`, que explica los dos huecos con la evidencia de la base.

import { prisma } from '@/lib/db';
import {
  PROCESOS_DEL_MAPA,
  areaHomonima,
  cargosQueSonAreas,
  resolverCargo,
} from '@/lib/sig/procesos';
import ProcesosClient from './Procesos.client';

export const dynamic = 'force-dynamic';

export default async function ProcesosPage() {
  const [procesos, areas, cargos, programadas, requisitos, celdas] = await Promise.all([
    prisma.proceso.findMany({
      include: { area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
      orderBy: { codigo: 'asc' },
    }),
    prisma.area.findMany({ select: { id: true, nombre: true, prefijo: true }, orderBy: { orden: 'asc' } }),
    prisma.cargoResponsable.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    // Lo que hoy referencia al proceso por TEXTO. Es el dato con el que se va a poder
    // verificar que la migración no perdió filas.
    prisma.auditoriaProgramada.findMany({ select: { procesoRef: true, procesoId: true } }),
    prisma.requisitoLegal.findMany({ select: { procesoEncargado: true, procesoId: true } }),
    prisma.celdaPlan.findMany({ select: { procesoRef: true, procesoId: true } }),
  ]);

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const filas = PROCESOS_DEL_MAPA.map((p) => {
    const enBase = procesos.find((x) => x.codigo === p.codigo) ?? null;
    const area = areaHomonima(p, areas);
    const cargo = resolverCargo(p.cargoDelMapa, cargos);
    // Se cuenta por el TEXTO, que es lo único que hay hasta que la migración corra.
    const cuenta = (lista: { ref: string | null }[]) =>
      lista.filter((x) => x.ref !== null && norm(x.ref) === norm(p.nombre)).length;
    return {
      codigo: p.codigo,
      nombre: p.nombre,
      tipo: p.tipo,
      cargoDelMapa: p.cargoDelMapa,
      ocupaHoy: p.ocupaHoy,
      creado: enBase !== null,
      areaSugerida: area ? { id: area.id, nombre: area.nombre } : null,
      cargo: {
        estado: cargo.estado,
        candidatos: cargo.candidatos,
        cargoId: cargo.cargoId,
      },
      colgando: {
        programadas: cuenta(programadas.map((x) => ({ ref: x.procesoRef }))),
        requisitos: cuenta(requisitos.map((x) => ({ ref: x.procesoEncargado }))),
        celdas: cuenta(celdas.map((x) => ({ ref: x.procesoRef }))),
      },
    };
  });

  // Los valores de texto que NO corresponden a ninguno de los nueve. Son los que la
  // migración va a tener que resolver a mano, y §5.1 avisa que existen.
  const nombresDeProceso = new Set(PROCESOS_DEL_MAPA.map((p) => norm(p.nombre)));
  const huerfanos = [
    ...new Set(
      [
        ...programadas.map((x) => x.procesoRef),
        ...requisitos.map((x) => x.procesoEncargado),
        ...celdas.map((x) => x.procesoRef),
      ].filter((v): v is string => v !== null && v.trim() !== '' && !nombresDeProceso.has(norm(v))),
    ),
  ].sort();

  return (
    <ProcesosClient
      filas={filas}
      areas={areas.map((a) => ({ id: a.id, nombre: a.nombre, prefijo: a.prefijo ?? '—' }))}
      cargosResidualesDeArea={cargosQueSonAreas(cargos, areas)}
      huerfanos={huerfanos}
      totalCargos={cargos.length}
      migradas={{
        programadas: programadas.filter((x) => x.procesoId !== null).length,
        requisitos: requisitos.filter((x) => x.procesoId !== null).length,
        celdas: celdas.filter((x) => x.procesoId !== null).length,
        totalProgramadas: programadas.length,
        totalRequisitos: requisitos.length,
        totalCeldas: celdas.length,
      }}
    />
  );
}
