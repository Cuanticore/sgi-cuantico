import 'server-only';

// app/estrategico/trazabilidad.ts
//
// Los riesgos que originó cada entrada del contexto, con su nivel calculado al leer.
//
// Es el camino INVERSO al de «+ Originar un riesgo desde aquí»: entrar por la debilidad y
// ver qué salió de ella. El lienzo lo dice mejor que yo — «el riesgo guarda
// `entradaContextoId`, no el texto "DOFA". Por eso se puede entrar por la debilidad y ver
// qué salió de ella, que es lo que el Excel nunca pudo hacer».
//
// Y es la razón por la que D2 exige la referencia tipada en vez de copiar el texto: con el
// texto copiado este recorrido no existe. Se puede ir del riesgo al análisis leyendo la
// descripción, pero no del análisis al riesgo — y ése es el que un auditor pide cuando
// pregunta qué produjo el DOFA del año pasado.

import { prisma } from '@/lib/db';
import { residualDe, nivelDe } from '@/lib/sig/estrategico';

export interface RiesgoOriginado {
  id: number;
  codigo: string;
  clase: string;
  texto: string;
  nivel: string;
  nivelColor: string;
  residual: string;
}

/// Indexado por `entradaContextoId`. Las entradas sin riesgos no aparecen: quien consulta
/// pregunta por una entrada concreta y `?? []` es más honesto que una clave vacía.
export async function riesgosPorEntrada(
  tipo: 'DOFA' | 'PESTEL',
): Promise<Map<number, RiesgoOriginado[]>> {
  const [riesgos, niveles] = await Promise.all([
    prisma.riesgoOrganizacional.findMany({
      where: { activo: true, fuente: tipo, entradaContextoId: { not: null } },
      include: {
        probabilidad: { select: { valor: true } },
        impacto: { select: { valor: true } },
        controles: { include: { tipo: true, eficacia: true } },
      },
    }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
  ]);

  const minimos = niveles.map((n) => n.minimo);
  const porEntrada = new Map<number, RiesgoOriginado[]>();

  for (const r of riesgos) {
    if (r.entradaContextoId === null) continue;

    // El control más eficaz, igual que en el mapa y en la matriz: `residualDe` recibe uno
    // solo y MAN-CAL-01 no define cómo se componen dos.
    const control = [...r.controles].sort(
      (a, b) => Number(b.eficacia.valor) - Number(a.eficacia.valor),
    )[0];
    const p = r.probabilidad.valor;
    const i = r.impacto.valor;
    const calculo = control
      ? residualDe(p, i, tokenDeTipo(control.tipo.nombre), medicionDe(control.eficacia.nombre))
      : { residual: p * i };
    const indice = nivelDe(calculo.residual, minimos);

    const lista = porEntrada.get(r.entradaContextoId) ?? [];
    lista.push({
      id: r.id,
      codigo: r.codigo,
      clase: r.clase,
      texto: r.descripcion,
      nivel: niveles[indice]?.etiqueta ?? '—',
      nivelColor: niveles[indice]?.color ?? '#4a544f',
      residual: Number.isInteger(calculo.residual)
        ? String(calculo.residual)
        : calculo.residual.toFixed(1).replace('.', ','),
    });
    porEntrada.set(r.entradaContextoId, lista);
  }

  for (const lista of porEntrada.values()) {
    lista.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }
  return porEntrada;
}

function medicionDe(nombre: string): 'DEBIL' | 'MODERADO' | 'FUERTE' {
  return nombre === 'Débil' ? 'DEBIL' : nombre === 'Moderado' ? 'MODERADO' : 'FUERTE';
}

function tokenDeTipo(nombre: string): string {
  switch (nombre) {
    case 'Preventivo':
      return 'PREVENTIVO';
    case 'Correctivo':
      return 'CORRECTIVO';
    case 'Preventivo y correctivo':
      return 'PREVENTIVO_Y_CORRECTIVO';
    case 'Reforzador':
      return 'REFORZADOR';
    case 'Reactivo':
      return 'REACTIVO';
    default:
      return 'PROACTIVO';
  }
}
