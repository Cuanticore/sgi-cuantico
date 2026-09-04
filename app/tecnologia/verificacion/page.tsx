// app/tecnologia/verificacion/page.tsx
//
// Los 73 ítems de PTR-TEC-03 aplicados a un sistema.
//
// **No es un motor nuevo.** El catálogo es un `ContenidoSig` de tipo `VERIFICACION`, cada
// ejecución es una `Asignacion` del módulo A y el resultado por ítem es la `RespuestaItem`
// que ya existe. Esta consulta no toca ninguna tabla que no existiera antes de REQ-SIG-08
// salvo las cuatro columnas que `ItemVerificacion` ganó.
//
// Construir un segundo motor habría duplicado el calendario, los vencimientos, los avisos y
// el cierre — todo ya construido y probado.

import { prisma } from '@/lib/db';
import { cumplimientoDeVerificacion, itemAplica, type ItemVerificado } from '@/lib/sig/desarrollo';
import VerificacionClient from './Verificacion.client';

export const dynamic = 'force-dynamic';

export default async function VerificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; p?: string }>;
}) {
  const { s, p } = await searchParams;

  const [sistemas, contenidos] = await Promise.all([
    prisma.sistema.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, contratado: true },
      orderBy: { codigo: 'asc' },
    }),
    // El catálogo: los contenidos de tipo verificación que traen ítems con puerta. Es lo
    // que distingue a los 73 ítems de cualquier otra lista de verificación del módulo A.
    prisma.contenidoSig.findMany({
      where: { tipo: 'VERIFICACION', activo: true, items: { some: { puerta: { not: null } } } },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        items: {
          orderBy: { orden: 'asc' },
          select: {
            id: true,
            orden: true,
            texto: true,
            puerta: true,
            controlAnexoA: true,
            evidenciaEsperada: true,
            aplicaA: true,
          },
        },
      },
    }),
  ]);

  const sistema = sistemas.find((x) => x.codigo === s) ?? sistemas[0] ?? null;
  const catalogo = contenidos.flatMap((c) => c.items);

  // Las respuestas del sistema elegido: la última respuesta por ítem, siguiendo la cadena
  // asignación → registro → respuesta del módulo A. Se toma la MÁS RECIENTE porque un ítem
  // puede haberse verificado varias veces y lo que vale es el estado de hoy.
  const respuestas = new Map<number, { respuesta: string; nota: string | null }>();
  if (sistema !== null && catalogo.length > 0) {
    const filas = await prisma.respuestaItem.findMany({
      where: {
        itemId: { in: catalogo.map((i) => i.id) },
        // Las asignaciones de este sistema. El vínculo es por el activo del sistema, que es
        // lo que el ítem 50 exige que exista; sin activo enlazado no hay verificaciones que
        // mostrar, y eso la pantalla lo dice.
        registro: { asignacion: { activo: { sistemas: { some: { id: sistema.id } } } } },
      },
      include: { registro: { select: { id: true } } },
      orderBy: { registroId: 'desc' },
    });
    for (const f of filas) {
      // La primera que aparece por cada ítem es la del registro más alto: la más reciente.
      if (!respuestas.has(f.itemId)) respuestas.set(f.itemId, { respuesta: f.respuesta, nota: f.nota });
    }
  }

  const aplicables = catalogo.filter((i) => itemAplica(i.aplicaA, sistema?.contratado ?? false));

  const items = aplicables.map((i) => {
    const r = respuestas.get(i.id);
    return {
      id: i.id,
      orden: i.orden,
      texto: i.texto,
      puerta: i.puerta,
      controlAnexoA: i.controlAnexoA,
      evidenciaEsperada: i.evidenciaEsperada,
      aplicaA: i.aplicaA,
      respuesta: (r?.respuesta ?? null) as ItemVerificado['respuesta'],
      nota: r?.nota ?? null,
    };
  });

  const puertaElegida = p ?? 'todas';
  const visibles = puertaElegida === 'todas' ? items : items.filter((i) => i.puerta === puertaElegida);

  return (
    <VerificacionClient
      sistemas={sistemas.map((x) => ({ codigo: x.codigo, nombre: x.nombre, contratado: x.contratado }))}
      sistemaCodigo={sistema?.codigo ?? null}
      contratado={sistema?.contratado ?? false}
      puertaElegida={puertaElegida}
      items={visibles}
      // El cumplimiento se calcula sobre TODO lo aplicable, no sobre lo filtrado: un
      // porcentaje que cambia al elegir una puerta no es el cumplimiento del sistema.
      cumplimiento={cumplimientoDeVerificacion(items)}
      conteoPorPuerta={Object.fromEntries(
        ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((x) => [x, items.filter((i) => i.puerta === x).length]),
      )}
      totalCatalogo={catalogo.length}
      hayCatalogo={catalogo.length > 0}
    />
  );
}
