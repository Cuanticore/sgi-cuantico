// app/sig/contenidos/page.tsx
//
// Lista y ficha del contenido: el bloque de su tipo, los ítems de verificación y el
// documento referenciado con su aviso de gestión documental fuera de alcance.

import { prisma } from '@/lib/db';
import ContenidosClient from './Contenidos.client';

export const dynamic = 'force-dynamic';

export default async function ContenidosPage() {
  const contenidos = await prisma.contenidoSig.findMany({
    where: { activo: true },
    orderBy: { codigo: 'asc' },
    include: { items: { orderBy: { orden: 'asc' } }, _count: { select: { obligaciones: true } } },
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
    })),
    asignadoPor: c._count.obligaciones,
  }));

  return <ContenidosClient contenidos={filas} />;
}