// app/sig/contenidos/page.tsx
//
// El catálogo del numeral 8: se define una vez y se asigna N veces.
//
// La pantalla era de sólo lectura. `crearContenido` y `editarContenido` existían en
// `app/sig/acciones/tareas.ts` desde el primer día y NADA las llamaba, igual que
// `generarAsignaciones()`. Sin forma de crear un contenido, la única manera de tener uno
// era la siembra — y sin contenido no hay obligación, y sin obligación no hay tareas.

import { prisma } from '@/lib/db';
import ContenidosClient from './Contenidos.client';

export const dynamic = 'force-dynamic';

/// Las etiquetas del lienzo para la periodicidad de cada uso.
const PERIODICIDAD: Record<string, string> = {
  UNICA: 'Única',
  DIARIA: 'Diaria',
  SEMANAL: 'Semanal',
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

export default async function ContenidosPage() {
  const contenidos = await prisma.contenidoSig.findMany({
    where: { activo: true },
    orderBy: { codigo: 'asc' },
    include: {
      // El conteo de respuestas por ítem es lo que deja a la pantalla decir CUÁL ítem no
      // se puede quitar antes de que alguien lo intente. La regla la aplica igual el
      // servidor; esto sólo evita el viaje.
      items: {
        orderBy: { orden: 'asc' },
        include: { _count: { select: { respuestas: true } } },
      },
      // `editarContenido` viene escribiendo el historial desde que existe el versionado y
      // nadie lo veía: la fila se guardaba y la ficha no la pedía. El conteo de registros
      // es lo que vuelve verificable un acuse viejo — dice cuánta gente cerró contra ESE
      // texto, no contra el que se está editando ahora.
      versiones: {
        orderBy: { version: 'desc' },
        select: {
          version: true,
          titulo: true,
          publicadaEn: true,
          publicadaPor: { select: { nombre: true } },
          _count: { select: { registros: true } },
        },
      },
      obligaciones: {
        where: { activa: true },
        select: {
          id: true,
          alcance: true,
          periodicidad: true,
          alcanceArea: { select: { nombre: true } },
          alcanceCargo: { select: { nombre: true } },
          alcancePersona: { select: { nombre: true } },
        },
      },
    },
  });

  const filas = contenidos.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    titulo: c.titulo,
    descripcion: c.descripcion,
    procedimientoOrigen: c.procedimientoOrigen,
    version: c.version,
    documentoCodigo: c.documentoCodigo,
    documentoNombre: c.documentoNombre,
    documentoVersion: c.documentoVersion,
    documentoUrl: c.documentoUrl,
    modalidad: c.modalidad,
    duracionHoras: c.duracionHoras ? Number(c.duracionHoras) : null,
    exigeEvaluacion: c.exigeEvaluacion,
    notaMinima: c.notaMinima ? Number(c.notaMinima) : null,
    items: c.items.map((i) => ({
      id: i.id,
      orden: i.orden,
      texto: i.texto,
      obligatorio: i.obligatorio,
      permiteNoAplica: i.permiteNoAplica,
      respuestas: i._count.respuestas,
    })),
    versiones: c.versiones.map((v) => ({
      version: v.version,
      // El título congelado de esa versión. No es «qué cambió» —el modelo no guarda esa
      // nota— pero sí es el texto exacto que leyó quien cerró contra ella.
      titulo: v.titulo,
      publicadaEn: v.publicadaEn.toISOString(),
      publicadaPor: v.publicadaPor?.nombre ?? null,
      registros: v._count.registros,
    })),
    usos: c.obligaciones.map((o) => ({
      id: o.id,
      codigo: c.codigo,
      alcance: textoAlcance(
        o.alcance,
        o.alcancePersona?.nombre,
        o.alcanceCargo?.nombre,
        o.alcanceArea?.nombre,
      ),
      periodicidad: PERIODICIDAD[o.periodicidad] ?? o.periodicidad,
    })),
  }));

  return <ContenidosClient contenidos={filas} />;
}

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
