// app/api/sig/historial/route.ts
//
// Exporta el histórico personal a .xlsx con exceljs. Igual que la pantalla: solo lo
// propio, con el cierre administrativo señalado (R5) y el estado escrito.

import { getServerSession } from 'next-auth';
import ExcelJS from 'exceljs';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const correo = (session?.user?.email ?? '').toLowerCase();
  const persona = await prisma.persona.findUnique({ where: { correo } });
  if (!persona) return new Response('Sin sesión', { status: 401 });

  const registros = await prisma.registroRealizado.findMany({
    where: { asignacion: { personaId: persona.id } },
    orderBy: { fechaHora: 'desc' },
    include: {
      asignacion: {
        include: {
          contenido: true,
          obligacion: { include: { contenido: true } },
          cerradaPorPersona: { select: { nombre: true } },
        },
      },
    },
  });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Historial');
  hoja.columns = [
    { header: 'Periodo', key: 'periodo', width: 12 },
    { header: 'Fecha', key: 'fecha', width: 22 },
    { header: 'Código', key: 'codigo', width: 10 },
    { header: 'Contenido', key: 'titulo', width: 40 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Registro', key: 'texto', width: 60 },
    { header: 'Estado', key: 'estado', width: 20 },
    { header: 'Cerrada por', key: 'cerradaPor', width: 22 },
  ];
  for (const r of registros) {
    const a = r.asignacion;
    const contenido = a.contenido ?? a.obligacion?.contenido;
    const administrativo = a.cerradaPor !== null && a.cerradaPor !== a.personaId;
    const extemporanea = a.fechaCierre !== null && a.fechaCierre > a.fechaLimite;
    hoja.addRow({
      periodo: a.periodo,
      fecha: r.fechaHora.toISOString(),
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? 'Puntual',
      tipo: contenido?.tipo ?? 'TAREA',
      texto: r.nota ?? `Acuse ${r.versionLeida ? `de la versión ${r.versionLeida}` : ''}`,
      estado: administrativo
        ? 'CIERRE ADMINISTRATIVO'
        : extemporanea
          ? 'EXTEMPORANEA'
          : 'A TIEMPO',
      cerradaPor: administrativo ? (a.cerradaPorPersona?.nombre ?? 'Otra persona') : '',
    });
  }

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="historial-${persona.correo.split('@')[0]}.xlsx"`,
    },
  });
}