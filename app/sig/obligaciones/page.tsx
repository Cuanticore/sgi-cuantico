// app/sig/obligaciones/page.tsx
//
// La lista maestra del numeral 8. La página lee y prepara; los chips por tipo, el buscador
// y la tabla viven en `Obligaciones.client.tsx`, porque filtrar y buscar es estado del
// cliente y no vale una ida al servidor por cada tecla.

import { prisma } from '@/lib/db';
import { cumplimientoDePeriodo } from '@/lib/sig/cumplimiento';
import NuevaObligacion from './NuevaObligacion';
import GenerarAsignaciones from './GenerarAsignaciones';
import ObligacionesClient, { type ObligacionFila, type TipoObligacion } from './Obligaciones.client';

export const dynamic = 'force-dynamic';

/// Las etiquetas del lienzo. `UNICA` va con tilde: es una palabra, no una constante.
const PERIODICIDAD: Record<string, string> = {
  UNICA: 'Única',
  DIARIA: 'Diaria',
  SEMANAL: 'Semanal',
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

export default async function ObligacionesPage() {
  const filas = await prisma.obligacion.findMany({
    where: { activa: true },
    orderBy: { id: 'asc' },
    include: {
      contenido: true,
      alcanceArea: { select: { nombre: true } },
      alcanceCargo: { select: { nombre: true } },
      alcancePersona: { select: { nombre: true } },
      responsableSeguimiento: { select: { nombre: true } },
    },
  });

  // El cumplimiento del último periodo de cada obligación, calculado al leer: la barra
  // de la pantalla y el correo mensual nunca pueden contradecirse (nota del lienzo).
  const asignaciones = await prisma.asignacion.findMany({
    where: { estado: { in: ['PENDIENTE', 'REALIZADA'] } },
    select: {
      id: true,
      obligacionId: true,
      estado: true,
      fechaLimite: true,
      fechaCierre: true,
      personaId: true,
      cerradaPor: true,
    },
  });
  // ÚLTIMO periodo, no el histórico. `cumplimientoDePeriodo` calcula sobre la lista que
  // recibe y no filtra nada, así que el recorte es responsabilidad de quien la llama. Acá
  // se le pasaban TODAS las asignaciones de la obligación: una obligación mensual con un
  // año de historia mostraba el promedio de doce meses bajo un rótulo que dice «último
  // periodo», y es el número que un líder mira para decidir a quién le escribe este mes.
  const porObligacion = new Map<number, number | null>();
  for (const obligacionId of [...new Set(asignaciones.map((a) => a.obligacionId).filter(Boolean))]) {
    const deLaObligacion = asignaciones.filter((a) => a.obligacionId === obligacionId);
    const ultimoPeriodo = deLaObligacion
      .map((a) => a.fechaLimite.toISOString().slice(0, 7))
      .sort()
      .at(-1);
    if (!ultimoPeriodo) continue;
    const delPeriodo = deLaObligacion.filter(
      (a) => a.fechaLimite.toISOString().slice(0, 7) === ultimoPeriodo,
    );
    porObligacion.set(obligacionId as number, cumplimientoDePeriodo(delPeriodo).porciento);
  }

  const datos: ObligacionFila[] = filas.map((o) => ({
    id: o.id,
    codigo: o.contenido.codigo,
    titulo: o.contenido.titulo,
    procedimientoOrigen: o.contenido.procedimientoOrigen ?? null,
    tipo: o.contenido.tipo as TipoObligacion,
    alcance: textoAlcance(
      o.alcance,
      o.alcancePersona?.nombre,
      o.alcanceCargo?.nombre,
      o.alcanceArea?.nombre,
    ),
    periodicidad: PERIODICIDAD[o.periodicidad] ?? o.periodicidad,
    plazoDias: o.plazoDias,
    seguimiento: o.responsableSeguimiento.nombre,
    cumplimiento: porObligacion.get(o.id) ?? null,
  }));

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Obligaciones del SIG</h1>
          <p className="max-w-[70ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            El registro del numeral 8. Cada obligación declara qué contenido, a quién alcanza,
            cada cuánto y con qué plazo; de ahí salen las asignaciones que la gente ve en Mi SIG.
          </p>
        </div>
        <div className="ml-auto flex flex-none items-start gap-2">
          <GenerarAsignaciones />
          <NuevaObligacion />
        </div>
      </div>

      <ObligacionesClient filas={datos} />
    </main>
  );
}

/// El prefijo NO es adorno: dice de qué dimensión es el alcance. Sin él, «Gestión
/// Tecnológica» podría ser un área o el nombre de un cargo, y el lienzo lo escribe
/// «Área · Gestión Tecnológica» justamente por eso.
function textoAlcance(
  alcance: string,
  persona: string | undefined,
  cargo: string | undefined,
  area: string | undefined,
): string {
  if (alcance === 'TODOS') return 'Todas las personas';
  if (persona) return `Persona · ${persona}`;
  if (cargo) return `Cargo · ${cargo}`;
  if (area) return `Área · ${area}`;
  return alcance;
}
