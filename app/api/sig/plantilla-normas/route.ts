// app/api/sig/plantilla-normas/route.ts
//
// Descarga la plantilla de numerales, con la norma elegida ya escrita en la hoja de ayuda y
// sus numerales actuales precargados. Mismo criterio que la plantilla de activos: la sesión
// y el permiso se validan acá porque la ruta NO está bajo /sig y el gate del layout no la ve.
//
// La plantilla llega con lo que ya está en el catálogo, no vacía. Así el importador se usa
// para CORREGIR y COMPLETAR una norma, que es el caso real —los 54 requisitos sembrados no
// son la norma entera—, y no sólo para cargar una desde cero.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';

export async function GET(peticion: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  // 403 y no 404: quien llama está autenticado, y esconderle la existencia de la ruta no
  // compra nada.
  if (!puede(rolDesdeGrupos(session.user?.grupos), 'auditoria:administrar')) {
    return new NextResponse(null, { status: 403 });
  }

  const normaId = Number(new URL(peticion.url).searchParams.get('normaId'));
  if (!Number.isInteger(normaId) || normaId <= 0) {
    return NextResponse.json({ error: 'Falta la norma.' }, { status: 400 });
  }

  const norma = await prisma.normaAuditable.findUnique({
    where: { id: normaId },
    select: { codigo: true, nombre: true, version: true },
  });
  if (!norma) return NextResponse.json({ error: 'La norma no existe.' }, { status: 404 });

  const requisitos = await prisma.requisitoNorma.findMany({
    where: { normaId },
    orderBy: { orden: 'asc' },
    select: { numeral: true, titulo: true, auditable: true },
  });

  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIG Cuántico';

  const hoja = libro.addWorksheet('Numerales');
  hoja.columns = [
    { header: 'Numeral', key: 'numeral', width: 12 },
    { header: 'Título', key: 'titulo', width: 62 },
    { header: 'Auditable', key: 'auditable', width: 12 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).alignment = { vertical: 'middle' };

  for (const r of requisitos) {
    hoja.addRow({ numeral: r.numeral, titulo: r.titulo, auditable: r.auditable ? 'Sí' : 'No' });
  }

  // La validación de la columna Auditable se aplica sobre un rango generoso para que las
  // filas que la persona agregue debajo también la tengan.
  const hasta = Math.max(requisitos.length + 1, 200);
  for (let f = 2; f <= hasta; f++) {
    hoja.getCell(`C${f}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Sí,No"'],
      showErrorMessage: true,
      errorTitle: 'Valor no admitido',
      error: 'Sólo Sí o No. El importador no adivina: una fila con otro valor se rechaza.',
    };
  }

  const ayuda = libro.addWorksheet('Cómo se usa');
  ayuda.columns = [{ width: 108 }];
  for (const linea of [
    `${norma.codigo} — ${norma.nombre} (versión ${norma.version})`,
    '',
    'La hoja «Numerales» llega con los numerales que la norma YA tiene en el sistema.',
    'Agregá los que falten al final, corregí los títulos que estén mal, y subila.',
    '',
    'Antes de importar, el sistema muestra qué va a pasar con cada fila:',
    '   AGREGAR      el numeral no está en el catálogo',
    '   ACTUALIZAR   está, y el título o la auditabilidad cambian',
    '   SIN CAMBIO   está igual — no se toca, y no deja entrada en la bitácora',
    '',
    'Reglas de las columnas:',
    '   Numeral     dígitos separados por puntos: 4, 6.1, 8.5.1. Con coma se rechaza.',
    '   Título      obligatorio.',
    '   Auditable   Sí o No. Vacío se toma como Sí, que es el valor por defecto.',
    '',
    'El ORDEN de las filas es el orden en que la norma enumera sus numerales, y así se',
    'guarda: mover una fila en el Excel cambia el orden en la matriz del plan de auditoría.',
    '',
    'Un numeral repetido dentro del mismo archivo se rechaza, y el error dice en qué fila',
    'apareció antes. Cambiar el título de un numeral ya auditado reescribe la referencia',
    'que citan las notas de esa auditoría: por eso ACTUALIZAR se muestra aparte de AGREGAR.',
  ]) {
    ayuda.addRow([linea]);
  }
  ayuda.getRow(1).font = { bold: true, size: 12 };

  const buffer = await libro.xlsx.writeBuffer();
  const nombre = `plantilla-numerales-${norma.codigo.replace(/[^\w.-]+/g, '-')}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    },
  });
}
