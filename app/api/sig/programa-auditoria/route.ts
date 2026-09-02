// app/api/sig/programa-auditoria/route.ts
//
// FOR-CAL-04 en Excel: la cabecera del programa y la matriz de procesos por mes.
//
// El lienzo pone «Exportar» y el botón existe porque un auditor externo pide el programa
// del año como documento, no como pantalla. Se genera al pedirlo: exportar una foto
// guardada permitiría entregar un programa que ya no es el que está en el sistema.
//
// La sesión y el permiso se validan acá porque la ruta NO está bajo /sig y el gate del
// layout no la ve. Mismo criterio que la plantilla de normas.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';

const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export async function GET(peticion: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });
  if (!puede(rolDesdeGrupos(session.user?.grupos), 'auditoria:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const anio = Number(new URL(peticion.url).searchParams.get('anio'));
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return NextResponse.json({ error: 'El año no es válido.' }, { status: 400 });
  }

  const programa = await prisma.programaAuditoria.findUnique({
    where: { anio },
    include: {
      aprobadoPor: { select: { nombre: true } },
      programadas: {
        include: {
          responsable: { select: { nombre: true } },
          auditorias: { select: { emitidoEn: true } },
        },
      },
    },
  });
  if (!programa) {
    return NextResponse.json({ error: `No hay programa para ${anio}.` }, { status: 404 });
  }

  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIG Cuántico';

  const hoja = libro.addWorksheet(`Programa ${anio}`);
  hoja.columns = [
    { width: 34 },
    ...MESES.map(() => ({ width: 5 })),
    { width: 12 },
    { width: 26 },
    { width: 14 },
    { width: 10 },
  ];

  hoja.addRow([`FOR-CAL-04 · Programa de auditoría ${anio}`]);
  hoja.getRow(1).font = { bold: true, size: 13 };
  hoja.addRow([]);
  for (const [etiqueta, valor] of [
    ['Alcance del programa', programa.alcance],
    ['Objetivo', programa.objetivo],
    ['Criterios', programa.criterios],
    ['Métodos', programa.metodos],
    [
      'Aprobado por',
      programa.aprobadoPor
        ? `${programa.aprobadoPor.nombre}${
            programa.fechaAprobacion
              ? ` · ${programa.fechaAprobacion.toISOString().slice(0, 10)}`
              : ''
          }`
        : 'sin aprobar',
    ],
  ] as const) {
    const fila = hoja.addRow([etiqueta, valor]);
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  hoja.addRow([]);

  const cabecera = hoja.addRow([
    'Proceso a auditar',
    ...MESES,
    'Tipo',
    'Responsable',
    'Plazo informe',
    'Estado',
  ]);
  cabecera.font = { bold: true };
  cabecera.alignment = { vertical: 'middle', horizontal: 'center' };
  cabecera.getCell(1).alignment = { horizontal: 'left' };

  for (const p of programa.programadas) {
    const meses = new Set(
      p.meses
        .split(/[,;\s]+/)
        .map((m) => Number(m))
        .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12),
    );
    // El estado se calcula igual que en la pantalla: no hay un campo que lo guarde, y
    // dos lugares que lo deduzcan distinto es la forma más rápida de que el Excel y la
    // pantalla se contradigan delante de un auditor.
    const estado = p.auditorias.some((a) => a.emitidoEn !== null)
      ? 'Ejecutada'
      : p.auditorias.length > 0
        ? 'En curso'
        : 'Planeada';
    const marca = estado === 'Ejecutada' ? 'E' : estado === 'En curso' ? 'C' : 'P';

    const fila = hoja.addRow([
      p.procesoRef,
      ...MESES.map((_, n) => (meses.has(n + 1) ? marca : '')),
      p.tipo === 'INTERNA' ? 'Interna' : 'Externa',
      p.responsable.nombre,
      `${p.plazoInformeDias} día(s)`,
      estado,
    ]);
    for (let c = 2; c <= 13; c++) {
      fila.getCell(c).alignment = { horizontal: 'center' };
    }
  }

  hoja.addRow([]);
  const leyenda = hoja.addRow(['P = planeada · C = en curso · E = ejecutada']);
  leyenda.getCell(1).font = { italic: true, size: 9 };

  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="programa-auditoria-${anio}.xlsx"`,
    },
  });
}
