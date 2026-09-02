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
    historial,
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
    // «Historial de esta tabla» del lienzo. Sale de la bitácora, que ya guarda cada cambio
    // con su autor, su valor anterior y su motivo: no hace falta una tabla nueva, sólo
    // leerla filtrada por las seis tablas del método.
    prisma.bitacora.findMany({
      where: {
        tabla: {
          in: [
            'escala_probabilidad',
            'escala_impacto_riesgo',
            'escala_impacto_oportunidad',
            'tipo_control_riesgo',
            'eficacia_control',
            'nivel_riesgo',
            'factor_riesgo',
          ],
        },
      },
      orderBy: { ocurridoEn: 'desc' },
      take: 120,
      select: {
        tabla: true,
        campo: true,
        valorAnterior: true,
        valorNuevo: true,
        motivo: true,
        usuario: true,
        ocurridoEn: true,
      },
    }),
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
      historial={historial.map((h) => ({
        tabla: h.tabla,
        campo: h.campo,
        anterior: h.valorAnterior,
        nuevo: h.valorNuevo,
        motivo: h.motivo,
        usuario: h.usuario,
        fecha: h.ocurridoEn.toISOString().slice(0, 10),
      }))}
    />
  );
}