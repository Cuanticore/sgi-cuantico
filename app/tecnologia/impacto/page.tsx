// app/tecnologia/impacto/page.tsx
//
// La lectura del grafo. **Es una pantalla y no una pestaña de «Dependencias»** porque una
// dependencia se declara una vez y se consulta muchas, y quien consulta no es quien
// declara: el que registra la arista es Tecnología, el que pregunta «¿qué se cae si cae
// esto?» es el comité de continuidad.
//
// Responde tres cosas que la lista de edición no puede: la dirección inversa —que hoy no
// contesta nadie y alimenta el BIA anual—, la cadena completa —cortar en el primer salto
// oculta la mitad del riesgo— y la asimetría.

import { prisma } from '@/lib/db';
import {
  aguasAbajo,
  aguasArriba,
  asimetrias,
  type Arista,
  type CriticidadDeActivo,
} from '@/lib/sig/dependencias';
import ImpactoClient from './Impacto.client';

export const dynamic = 'force-dynamic';

/// El umbral desde el que un activo se considera crítico para efectos de la asimetría. Sale
/// de la escala (`EscalaValor.valor` va de 0 a 5) y no de una constante inventada: 4 es
/// «alto» en la misma escala con la que se valora todo lo demás.
const UMBRAL_ALTO = 4;

export default async function ImpactoPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string; cadena?: string }>;
}) {
  const { base, cadena } = await searchParams;
  // Por defecto se muestra la CADENA COMPLETA, no las directas. Las dependencias son
  // transitivas y cortar en el primer salto oculta la mitad del riesgo; quien quiera sólo
  // el primer salto lo pide.
  const soloDirectas = cadena === '0';

  const [activos, valores, dependencias] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: [{ codigo: 'asc' }],
    }),
    prisma.activoValor.findMany({ select: { activoId: true, valor: { select: { valor: true } } } }),
    prisma.dependenciaActivo.findMany({ select: { activoId: true, dependeDeId: true, tipo: true } }),
  ]);

  const criticidad = new Map<number, number>();
  for (const v of valores) {
    const previo = criticidad.get(v.activoId);
    if (previo === undefined || v.valor.valor > previo) criticidad.set(v.activoId, v.valor.valor);
  }

  const grafo: Arista[] = dependencias;
  const baseId =
    base !== undefined && /^\d+$/.test(base) ? Number(base) : (activos[0]?.id ?? null);

  const porId = new Map(activos.map((a) => [a.id, a]));
  const decorar = (n: { activoId: number; distancia: number; tipo: string; viaId: number | null }) => ({
    activoId: n.activoId,
    codigo: porId.get(n.activoId)?.codigo ?? null,
    nombre: porId.get(n.activoId)?.nombre ?? `#${n.activoId}`,
    distancia: n.distancia,
    tipo: n.tipo,
    via: n.viaId === null ? null : (porId.get(n.viaId)?.nombre ?? `#${n.viaId}`),
    criticidad: criticidad.get(n.activoId) ?? null,
  });

  const arriba = baseId === null ? [] : aguasArriba(baseId, grafo, soloDirectas).map(decorar);
  const abajo = baseId === null ? [] : aguasAbajo(baseId, grafo, soloDirectas).map(decorar);

  // La asimetría se calcula sólo sobre las aristas DIRECTAS del activo base: «el CRM
  // depende de algo peor valorado» es una afirmación sobre su dependencia inmediata. En
  // cadena la culpa se diluye y la frase deja de señalar a nadie.
  const soloDelBase = grafo.filter((g) => g.activoId === baseId);
  // Todos los activos entran a la lista, valorados o no: el que NO tiene criticidad es
  // justamente el caso que la asimetría existe para señalar, y dejarlo fuera lo silenciaría.
  const criticidades: CriticidadDeActivo[] = activos.map((a) => ({
    activoId: a.id,
    criticidad: criticidad.get(a.id) ?? null,
  }));
  const flojos = baseId === null ? [] : asimetrias(soloDelBase, criticidades, UMBRAL_ALTO);

  return (
    <ImpactoClient
      baseId={baseId}
      soloDirectas={soloDirectas}
      activos={activos.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        nombre: a.nombre,
        criticidad: criticidad.get(a.id) ?? null,
      }))}
      arriba={arriba}
      abajo={abajo}
      asimetricos={flojos.map((f) => ({
        dependeDeId: f.dependeDeId,
        nombre: porId.get(f.dependeDeId)?.nombre ?? `#${f.dependeDeId}`,
        motivo: f.motivo,
      }))}
    />
  );
}
