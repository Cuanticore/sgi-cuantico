// app/tecnologia/dependencias/page.tsx
//
// **Esta pantalla DECLARA la arista; no la interpreta.** Para leerla en las dos direcciones
// y en cadena está «Impacto», que es otra pantalla porque son dos públicos y dos momentos:
// quien registra la dependencia es Tecnología, quien pregunta «¿qué se cae si cae esto?»
// es el comité de continuidad.
//
// La criticidad de cada candidato viaja a la lista porque **la pregunta interesante de una
// dependencia es la asimetría**: un activo crítico que depende de uno sin valorar.

import { prisma } from '@/lib/db';
import DependenciasClient from './Dependencias.client';

export const dynamic = 'force-dynamic';

export default async function DependenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string }>;
}) {
  const { base } = await searchParams;
  const baseId = base !== undefined && /^\d+$/.test(base) ? Number(base) : null;

  const [activos, valores, dependencias, niveles] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, nivelId: true },
      orderBy: [{ codigo: 'asc' }],
    }),
    // La criticidad es el MAYOR de las dimensiones del activo. Se deriva al leer, como en
    // el resto del sistema: no hay columna que pueda quedar vieja.
    //
    // El número vive en `EscalaValor.valor`, no en la tabla puente, así que hay que traer
    // la escala: agrupar por `valorId` daría el id más alto, que no es el valor más alto.
    prisma.activoValor.findMany({ select: { activoId: true, valor: { select: { valor: true } } } }),
    prisma.dependenciaActivo.findMany({
      include: {
        dependeDe: { select: { id: true, codigo: true, nombre: true } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.nivelActivo.findMany({ select: { id: true, nombre: true, grado: true } }),
  ]);

  const criticidadPorActivo = new Map<number, number>();
  for (const v of valores) {
    const previo = criticidadPorActivo.get(v.activoId);
    if (previo === undefined || v.valor.valor > previo) criticidadPorActivo.set(v.activoId, v.valor.valor);
  }
  const nivel3 = new Map(niveles.filter((n) => n.grado === 3).map((n) => [n.id, n.nombre]));

  const elegido = baseId ?? activos[0]?.id ?? null;

  return (
    <DependenciasClient
      baseId={elegido}
      activos={activos.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        nivel3: a.nivelId === null ? null : (nivel3.get(a.nivelId) ?? null),
        criticidad: criticidadPorActivo.get(a.id) ?? null,
      }))}
      relacionados={dependencias
        .filter((d) => d.activoId === elegido)
        .map((d) => ({
          id: d.id,
          activoId: d.dependeDe.id,
          codigo: d.dependeDe.codigo,
          nombre: d.dependeDe.nombre,
          tipo: d.tipo,
          criticidad: criticidadPorActivo.get(d.dependeDe.id) ?? null,
        }))}
      // El grafo completo viaja al cliente para que la pantalla pueda avisar ANTES de
      // enviar. No reemplaza la validación del servidor: la adelanta.
      grafo={dependencias.map((d) => ({
        activoId: d.activoId,
        dependeDeId: d.dependeDeId,
        tipo: d.tipo,
      }))}
    />
  );
}
