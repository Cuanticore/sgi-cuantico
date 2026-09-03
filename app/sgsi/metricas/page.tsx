// app/sgsi/metricas/page.tsx
//
// Métricas del SGSI (cláusula 9.1). Lista y ficha en una ruta.
//
// **No se consulta ninguna tabla de alertas porque no existe.** Una medición está en alerta
// cuando cruza el umbral en el sentido malo, y eso se calcula acá al leer. Lo que sí se lee
// de la base es la reacción: la asignación que se abrió cuando cruzó.

import { prisma } from '@/lib/db';
import { estadoDeMetrica, rachaDeAlerta, type Medicion } from '@/lib/sig/metricas';
import MetricasClient from './Metricas.client';

export const dynamic = 'force-dynamic';

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  const [metricas, personas] = await Promise.all([
    prisma.metrica.findMany({
      where: { activa: true },
      include: {
        responsable: { select: { nombre: true } },
        mediciones: {
          // Cronológico, del más viejo al más reciente: es el orden en que se lee un
          // gráfico y el que `rachaDeAlerta` espera. La etiqueta de periodo ordena bien
          // dentro de una misma periodicidad (`2026-08` < `2026-09`, `2026-T2` < `2026-T3`).
          orderBy: { periodo: 'asc' },
          include: { asignacion: { select: { id: true, periodo: true, titulo: true } } },
        },
      },
      orderBy: { codigo: 'asc' },
    }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  const conSerie = metricas.map((x) => {
    const definicion = { umbral: Number(x.umbral), sentido: x.sentido };
    const serie: Medicion[] = x.mediciones.map((d) => ({ periodo: d.periodo, valor: Number(d.valor) }));
    return { fila: x, definicion, serie };
  });

  const elegidoCodigo = m ?? conSerie[0]?.fila.codigo ?? null;
  const elegida = conSerie.find((x) => x.fila.codigo === elegidoCodigo) ?? conSerie[0] ?? null;

  return (
    <MetricasClient
      lista={conSerie.map(({ fila, definicion, serie }) => ({
        codigo: fila.codigo,
        titulo: fila.titulo,
        periodicidad: fila.periodicidad,
        umbral: definicion.umbral,
        sentido: definicion.sentido,
        ultimo: serie.length === 0 ? null : serie[serie.length - 1].valor,
        estado: estadoDeMetrica(serie, definicion),
      }))}
      elegidoCodigo={elegida?.fila.codigo ?? null}
      personas={personas}
      ficha={
        elegida === null
          ? null
          : {
              codigo: elegida.fila.codigo,
              control: elegida.fila.controlAnexoA,
              titulo: elegida.fila.titulo,
              unidad: elegida.fila.unidad,
              umbral: elegida.definicion.umbral,
              sentido: elegida.definicion.sentido,
              periodicidad: elegida.fila.periodicidad,
              responsable: elegida.fila.responsable.nombre,
              serie: elegida.serie,
              // La racha viaja calculada: la pantalla la muestra, no la decide.
              racha: rachaDeAlerta(elegida.serie, elegida.definicion),
              // La tarea de cada medición, para poder enlazarla desde su alerta.
              tareas: Object.fromEntries(
                elegida.fila.mediciones
                  .filter((d) => d.asignacion !== null)
                  .map((d) => [d.periodo, { id: d.asignacion!.id, etiqueta: d.asignacion!.titulo ?? d.asignacion!.periodo }]),
              ),
            }
      }
    />
  );
}
