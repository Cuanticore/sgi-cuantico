// app/tecnologia/excepciones/page.tsx
//
// **La pantalla que más importa del módulo.** Una excepción es la única forma documentada
// de avanzar sin cumplir una puerta, así que lo que hay que vigilar no es que existan, sino
// que se cierren.
//
// El estado no se almacena: sale de la fecha de cierre contra hoy. Una columna «vencida»
// estaría al día sólo hasta la medianoche siguiente.

import { prisma } from '@/lib/db';
import { diasHastaCierre, estadoDeExcepcion } from '@/lib/sig/desarrollo';
import ExcepcionesClient from './Excepciones.client';

export const dynamic = 'force-dynamic';

/// Los días de aviso antes del vencimiento. Sale de un parámetro y no de una constante:
/// cuánto antes hay que avisar es una decisión de la organización.
const CLAVE_AVISO = 'desarrollo_excepcion_dias_aviso';

export default async function ExcepcionesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; f?: string }>;
}) {
  const { e, f } = await searchParams;
  const hoy = new Date();

  const [excepciones, parametro, personas] = await Promise.all([
    prisma.excepcionSeguridad.findMany({
      include: {
        sistema: { select: { id: true, codigo: true, nombre: true } },
        aprobadaPor: { select: { nombre: true } },
        cerradaPor: { select: { nombre: true } },
      },
      orderBy: { fechaCierre: 'asc' },
    }),
    prisma.parametro.findUnique({ where: { clave: CLAVE_AVISO } }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  const diasAviso = Number(parametro?.valor ?? 30);

  const filas = excepciones.map((x) => ({
    codigo: x.codigo,
    sistemaId: x.sistema.id,
    sistema: `${x.sistema.codigo} · ${x.sistema.nombre}`,
    puerta: x.puerta,
    justificacion: x.justificacion,
    evaluacionRiesgo: x.evaluacionRiesgo,
    aprobadaPor: x.aprobadaPor?.nombre ?? null,
    fechaAprobacion: x.fechaAprobacion.toISOString().slice(0, 10),
    fechaCierre: x.fechaCierre.toISOString().slice(0, 10),
    cerradaEn: x.cerradaEn?.toISOString().slice(0, 10) ?? null,
    cerradaPor: x.cerradaPor?.nombre ?? null,
    notaCierre: x.notaCierre,
    estado: estadoDeExcepcion(
      { fechaCierre: x.fechaCierre, cerradaEn: x.cerradaEn },
      hoy,
      diasAviso,
    ),
    dias: diasHastaCierre(x.fechaCierre, hoy),
    // Cerrada FUERA de plazo. No cambia el estado —cerrada es cerrada— pero la ficha lo
    // dice: es el dato que un auditor busca cuando pregunta si el compromiso se cumplió.
    cerradaTarde:
      x.cerradaEn !== null && x.cerradaEn.toISOString().slice(0, 10) > x.fechaCierre.toISOString().slice(0, 10),
  }));

  const sistemas = await prisma.sistema.findMany({
    where: { activo: true },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { codigo: 'asc' },
  });

  return (
    <ExcepcionesClient
      filas={filas}
      filtro={f ?? 'abiertas'}
      elegidoCodigo={e ?? null}
      diasAviso={diasAviso}
      sistemas={sistemas.map((s) => ({ id: s.id, etiqueta: `${s.codigo} · ${s.nombre}` }))}
      personas={personas}
    />
  );
}
