// app/estrategico/riesgos/page.tsx
//
// La matriz de MAT-CAL-02 con el cálculo en vivo: cambiar P, I o el control recalcula
// inherente y residual sin recargar (misma idea que la grilla de madurez del SGSI).

import { prisma } from '@/lib/db';
import { residualDe, nivelDe } from '@/lib/sig/estrategico';
import RiesgosClient from './Riesgos.client';

export const dynamic = 'force-dynamic';

export default async function RiesgosPage() {
  const [riesgos, tipos, eficacias, niveles] = await Promise.all([
    prisma.riesgoOrganizacional.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      include: {
        factor: true,
        probabilidad: true,
        impacto: true,
        responsable: { select: { nombre: true } },
        controles: { include: { tipo: true, eficacia: true } },
      },
    }),
    prisma.tipoControlRiesgo.findMany({ orderBy: { id: 'asc' } }),
    prisma.eficaciaControl.findMany({ orderBy: { valor: 'asc' } }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
  ]);

  const minimos = niveles.map((n) => n.minimo);
  const filas = riesgos.map((r) => {
    const p = r.probabilidad.valor;
    const i = r.impacto.valor;
    // El control MÁS EFICAZ, no el primero de la lista. `residualDe` recibe uno solo y
    // MAN-CAL-01 no define cómo se componen dos: multiplicar sus eficacias sería inventar
    // aritmética normativa. Mismo criterio que el mapa de calor.
    const control = [...r.controles].sort(
      (a, b) => Number(b.eficacia.valor) - Number(a.eficacia.valor),
    )[0];
    const calculo = control
      ? residualDe(p, i, tipoToken(control.tipo.nombre), medicionDe(control.eficacia.nombre))
      : { inherente: p * i, pRes: p, iRes: i, residual: p * i };
    const nivel = nivelDe(calculo.residual, minimos);
    return {
      id: r.id,
      codigo: r.codigo,
      clase: r.clase,
      descripcion: r.descripcion,
      proceso: r.proceso,
      factor: r.factor.nombre,
      p,
      i,
      inherente: calculo.inherente,
      residual: calculo.residual,
      nivel,
      nivelEtiqueta: niveles[nivel]?.etiqueta ?? '—',
      nivelColor: niveles[nivel]?.color ?? '#4a544f',
      control: control
        ? `${control.tipo.nombre} · ${control.eficacia.nombre} ${Number(control.eficacia.valor) * 100} %`
        : null,
      // Los IDS del control, no sólo su texto. El cliente venía adivinando el tipo con
      // `control.startsWith(nombre)` —parseando de vuelta un formato de presentación—, y
      // ese redondeo por string se rompe el día que alguien renombre un tipo de control.
      controlDescripcion: control?.descripcion ?? null,
      controlTipoId: control?.tipoId ?? null,
      controlEficaciaId: control?.eficaciaId ?? null,
      controles: r.controles.length,
    };
  });

  return (
    <RiesgosClient
      filas={filas}
      tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre, reduce: t.reduce }))}
      eficacias={eficacias.map((e) => ({ id: e.id, nombre: e.nombre, valor: Number(e.valor) }))}
      niveles={niveles.map((n) => ({
        minimo: n.minimo,
        etiqueta: n.etiqueta,
        color: n.color,
        accionRiesgo: n.accionRiesgo,
        accionOportunidad: n.accionOportunidad,
      }))}
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