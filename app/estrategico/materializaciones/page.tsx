// app/estrategico/materializaciones/page.tsx
//
// FOR-CAL-08: los riesgos que dejaron de ser hipótesis, con su hallazgo en Mejora.
//
// El catálogo de riesgos viaja completo, no sólo su conteo. Antes se consultaba
// `select: { id: true }` únicamente para contar, y el formulario resolvía el riesgo
// buscando el código dentro de la lista de MATERIALIZACIONES: un riesgo que nunca se había
// materializado no estaba ahí y no se podía reportar —que es justo para lo que existe la
// pantalla—, y uno que sí, devolvía el id de la materialización en lugar del id del
// riesgo. Ver la nota de `Materializaciones.client.tsx`.

import { prisma } from '@/lib/db';
import { residualDe, nivelDe } from '@/lib/sig/estrategico';
import MaterializacionesClient from './Materializaciones.client';

export const dynamic = 'force-dynamic';

/// Los mismos tokens que usa la pantalla de Riesgos. Están duplicados ahí y acá porque
/// `residualDe` los pide tipados y el nombre del control es texto libre del catálogo.
function tipoToken(nombre: string): 'PREVENTIVO' | 'DETECTIVO' | 'CORRECTIVO' {
  const n = nombre.toUpperCase();
  if (n.startsWith('PREV')) return 'PREVENTIVO';
  if (n.startsWith('DETEC')) return 'DETECTIVO';
  return 'CORRECTIVO';
}

function medicionDe(nombre: string): 'FUERTE' | 'MODERADO' | 'DEBIL' {
  const n = nombre.toUpperCase();
  if (n.startsWith('FUER')) return 'FUERTE';
  if (n.startsWith('MODER')) return 'MODERADO';
  return 'DEBIL';
}

export default async function MaterializacionesPage() {
  const [materializaciones, riesgos, niveles] = await Promise.all([
    prisma.materializacionRiesgo.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        riesgo: { select: { codigo: true, descripcion: true, proceso: true } },
        reportante: { select: { nombre: true } },
        hallazgo: { select: { codigo: true, fechaCierre: true } },
      },
    }),
    prisma.riesgoOrganizacional.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      include: {
        factor: { select: { nombre: true } },
        probabilidad: { select: { valor: true } },
        impacto: { select: { valor: true } },
        controles: { include: { tipo: true, eficacia: true } },
      },
    }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
  ]);

  const filas = materializaciones.map((m) => ({
    id: m.id,
    riesgoCodigo: m.riesgo.codigo,
    riesgoDescripcion: m.riesgo.descripcion,
    proceso: m.riesgo.proceso,
    fecha: m.fecha.toISOString().slice(0, 10),
    evento: m.descripcionEvento,
    impacto: m.impactoGenerado,
    causaRaiz: m.causaRaiz,
    reportante: m.reportante.nombre,
    hallazgo: m.hallazgo
      ? { codigo: m.hallazgo.codigo, cerrado: m.hallazgo.fechaCierre !== null }
      : null,
  }));

  // «Lo que dice la matriz · no se captura, se lee» (nota del lienzo). El inherente y el
  // residual se calculan con el MISMO módulo que la pantalla de Riesgos y el mapa de calor:
  // si acá salieran otros números, el formulario estaría mostrando una matriz que no es la
  // que la organización aprobó.
  const minimos = niveles.map((n) => n.minimo);
  const catalogo = riesgos.map((r) => {
    const p = r.probabilidad.valor;
    const i = r.impacto.valor;
    // El control MÁS EFICAZ, no el primero: mismo criterio que Riesgos y el mapa.
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
      descripcion: r.descripcion,
      proceso: r.proceso,
      factor: r.factor.nombre,
      inherente: calculo.inherente,
      residual: calculo.residual,
      nivelEtiqueta: niveles[nivel]?.etiqueta ?? '—',
      nivelColor: niveles[nivel]?.color ?? '#4a544f',
    };
  });

  const conHallazgoAbierto = filas.filter((f) => f.hallazgo && !f.hallazgo.cerrado).length;
  const reincidentes = new Set(
    materializaciones.map((m) => m.riesgo.codigo).filter((c, i, arr) => arr.indexOf(c) !== i),
  );

  return (
    <MaterializacionesClient
      filas={filas}
      catalogo={catalogo}
      totalRiesgos={riesgos.length}
      conHallazgoAbierto={conHallazgoAbierto}
      reincidentes={[...reincidentes]}
    />
  );
}
