// app/api/sig/hallazgos/[codigo]/acta/route.ts
//
// El acta del hallazgo a .xlsx, con el patrón de la Declaración de Aplicabilidad.

import { getServerSession } from 'next-auth';
import ExcelJS from 'exceljs';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Sin sesión', { status: 401 });
  const { codigo } = await params;
  const h = await prisma.hallazgo.findUnique({
    where: { codigo },
    include: {
      area: true,
      responsable: true,
      detectadoPor: true,
      analisis: true,
      extension: true,
      acciones: { include: { asignacion: true } },
      verificaciones: true,
    },
  });
  if (!h) return new Response('No existe', { status: 404 });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Acta');
  hoja.columns = [
    { header: 'Campo', key: 'campo', width: 26 },
    { header: 'Valor', key: 'valor', width: 70 },
  ];
  hoja.addRows([
    { campo: 'Código', valor: h.codigo },
    { campo: 'Tipo', valor: h.tipo },
    { campo: 'Origen', valor: `${h.origen} · ${h.origenReferencia}` },
    { campo: 'Descripción', valor: h.descripcion },
    { campo: 'Requisito incumplido', valor: h.requisitoIncumplido },
    { campo: 'Evidencia objetiva', valor: h.evidenciaObjetiva },
    { campo: 'Área', valor: h.area?.nombre ?? '' },
    { campo: 'Detectado por', valor: h.detectadoPor?.nombre ?? '' },
    { campo: 'Fecha de detección', valor: h.fechaDeteccion.toISOString().slice(0, 10) },
    { campo: 'Responsable', valor: h.responsable?.nombre ?? '' },
    { campo: 'Fecha compromiso', valor: h.fechaCompromiso?.toISOString().slice(0, 10) ?? '' },
    { campo: 'Causa raíz', valor: h.analisis?.causaRaiz ?? '' },
    { campo: 'Método', valor: h.analisis?.metodo ?? '' },
    {
      campo: '¿Existe en otra parte?',
      valor: h.extension ? (h.extension.existeEnOtraParte ? 'Sí' : 'No') : '',
    },
    { campo: 'Análisis de extensión', valor: h.extension?.analisis ?? '' },
    {
      campo: 'Acciones',
      valor: h.acciones.map((a) => `${a.papel}: ${a.asignacion.titulo}`).join('\n'),
    },
    {
      campo: 'Verificaciones',
      valor: h.verificaciones.map((v) => `${v.resultado} · ${v.nota ?? ''}`).join('\n'),
    },
    {
      campo: 'Cerrado',
      valor: h.fechaCierre ? `${h.fechaCierre.toISOString()} · por ${h.cerradoPorId ?? ''}` : 'Abierto',
    },
  ]);

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="acta-${codigo}.xlsx"`,
    },
  });
}