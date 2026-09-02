// app/estrategico/mapa/page.tsx
//
// El mapa de calor 5×5: probabilidad vertical (5 arriba, como el Excel), impacto
// horizontal; toggle inherente/residual; cada casilla con su conteo y el nivel
// escrito, nunca solo el color. Conteos calculados al leer.

import { prisma } from '@/lib/db';
import { residualDe, nivelDe } from '@/lib/sig/estrategico';
import MapaClient from './Mapa.client';

export const dynamic = 'force-dynamic';

export default async function MapaPage() {
  const [riesgos, niveles] = await Promise.all([
    prisma.riesgoOrganizacional.findMany({
      where: { activo: true },
      include: {
        probabilidad: true,
        impacto: true,
        factor: { select: { nombre: true } },
        controles: { include: { tipo: true, eficacia: true } },
      },
    }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
  ]);

  // La casilla del mapa: la malla es de enteros del 1 al 5, y el residual sale fraccionario
  // —3 × (1 − 0,6) = 1,2—, así que se redondea a la casilla más cercana y se acota al rango.
  const casilla = (v: number) => Math.min(5, Math.max(1, Math.round(v)));

  const inherente: Record<string, { n: number; ids: number[] }> = {};
  const residual: Record<string, { n: number; ids: number[] }> = {};
  const sumar = (mapa: typeof inherente, clave: string, id: number) => {
    mapa[clave] = { n: (mapa[clave]?.n ?? 0) + 1, ids: [...(mapa[clave]?.ids ?? []), id] };
  };

  const porRiesgo = new Map<number, { pRes: number; iRes: number; control: string | null }>();
  for (const r of riesgos) {
    const p = r.probabilidad.valor;
    const i = r.impacto.valor;

    // El control MÁS FUERTE, no el primero de la lista. `residualDe` recibe un control, y
    // el método MAN-CAL-01 no define cómo se componen dos: multiplicar sus eficacias sería
    // inventar aritmética normativa. Se aplica el más eficaz y la pantalla lo dice.
    const control = [...r.controles].sort(
      (a, b) => Number(b.eficacia.valor) - Number(a.eficacia.valor),
    )[0];

    const calculo = control
      ? residualDe(p, i, tipoToken(control.tipo.nombre), medicionDe(control.eficacia.nombre))
      : { pRes: p, iRes: i, residual: p * i };

    sumar(inherente, `${p}-${i}`, r.id);
    // Y ACÁ estaba el defecto: la clave del residual era la misma que la del inherente y el
    // cálculo se descartaba con `void calculo`. Las dos vistas del toggle mostraban la
    // misma malla, o sea: la pantalla afirmaba que los controles no cambian nada.
    sumar(residual, `${casilla(calculo.pRes)}-${casilla(calculo.iRes)}`, r.id);

    porRiesgo.set(r.id, {
      pRes: calculo.pRes,
      iRes: calculo.iRes,
      control: control?.descripcion ?? null,
    });
  }

  const detalle = riesgos.map((r) => {
    const res = porRiesgo.get(r.id)!;
    return {
      id: r.id,
      codigo: r.codigo,
      clase: r.clase,
      descripcion: r.descripcion,
      proceso: r.proceso,
      // El NOMBRE del factor. Antes se pasaba `r.factorId`, el id numérico, donde el lienzo
      // pide «proceso · factor» — y por eso el campo llegaba al cliente sin usarse.
      factor: r.factor.nombre,
      p: r.probabilidad.valor,
      i: r.impacto.valor,
      pRes: res.pRes,
      iRes: res.iRes,
      control: res.control,
      controles: r.controles.length,
    };
  });

  return (
    <MapaClient
      inherente={inherente}
      residual={residual}
      niveles={niveles.map((n) => ({ minimo: n.minimo, etiqueta: n.etiqueta, color: n.color }))}
      total={riesgos.length}
      detalle={detalle}
    />
  );
}

function medicionDe(nombre: string): 'DEBIL' | 'MODERADO' | 'FUERTE' {
  return nombre === 'Débil' ? 'DEBIL' : nombre === 'Moderado' ? 'MODERADO' : 'FUERTE';
}

function tipoToken(nombre: string): string {
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