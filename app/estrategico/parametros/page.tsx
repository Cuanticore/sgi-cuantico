// app/estrategico/parametros/page.tsx
//
// Las seis pestañas del modelo estratégico (MAN-CAL-01) con «Restaurar valores» y el
// aviso de que cambiar una escala recalcula sin tocar datos (D4).

import { prisma } from '@/lib/db';
import ParametrosClient from './Parametros.client';

export const dynamic = 'force-dynamic';

export default async function ParametrosPage() {
  const [
    probabilidad,
    impactoRiesgo,
    impactoOportunidad,
    factores,
    tipos,
    eficacias,
    niveles,
    lineaBase,
    registros,
  ] = await Promise.all([
    prisma.escalaProbabilidad.findMany({ orderBy: { valor: 'asc' } }),
    prisma.escalaImpactoRiesgo.findMany({ orderBy: { valor: 'asc' } }),
    prisma.escalaImpactoOportunidad.findMany({ orderBy: { valor: 'asc' } }),
    prisma.factorRiesgo.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.tipoControlRiesgo.findMany({ orderBy: { id: 'asc' } }),
    prisma.eficaciaControl.findMany({ orderBy: { valor: 'asc' } }),
    prisma.nivelRiesgo.findMany({ orderBy: { minimo: 'asc' } }),
    prisma.lineaBase.findFirst({ orderBy: { fecha: 'desc' }, select: { nombre: true } }),
    // El conteo real. La pantalla decía «los 66 registros» en dos lugares: 66 son los del
    // Excel de referencia, y afirmarlo con la base en otro número es contar de memoria.
    prisma.riesgoOrganizacional.count({ where: { activo: true } }),
  ]);

  return (
    <ParametrosClient
      probabilidad={probabilidad.map((p) => ({ id: p.id, valor: p.valor, etiqueta: p.etiqueta, descripcion: p.descripcion, color: p.color }))}
      impactoRiesgo={impactoRiesgo.map((i) => ({
        id: i.id,
        valor: i.valor,
        etiqueta: i.etiqueta,
        pct: i.porcentajePatrimonio ? Number(i.porcentajePatrimonio) : null,
        cop: i.referenciaCop ? Number(i.referenciaCop) : null,
      }))}
      impactoOportunidad={impactoOportunidad.map((i) => ({ id: i.id, valor: i.valor, etiqueta: i.etiqueta }))}
      factores={factores.map((f) => f.nombre)}
      tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre, reduce: t.reduce, descripcion: t.descripcion }))}
      eficacias={eficacias.map((e) => ({ id: e.id, nombre: e.nombre, valor: Number(e.valor) }))}
      niveles={niveles.map((n) => ({
        id: n.id,
        minimo: n.minimo,
        maximo: n.maximo,
        etiqueta: n.etiqueta,
        color: n.color,
        accionRiesgo: n.accionRiesgo,
        accionOportunidad: n.accionOportunidad,
      }))}
      lineaBase={lineaBase?.nombre ?? null}
      registros={registros}
    />
  );
}