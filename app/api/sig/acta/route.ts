// app/api/sig/acta/route.ts
//
// Descarga del acta de aceptación y firma.
//
// El artefacto se genera AL FIRMAR y se congela con su huella (F5). Esta ruta sólo lo
// entrega: no lo rearma, porque un acta compuesta al consultar puede salir distinta mañana
// y entonces su huella no prueba nada.
//
// Existe aparte de `/api/sgsi/anexo` por dos razones concretas, no por gusto. Esa ruta exige
// `evidencia.archivoKey`, que la firma nunca escribe —guarda los bytes por la relación
// inline `archivo: { create }`—, y pide el permiso `sgsi:ver`, que un colaborador no tiene.
// Apuntándole a mano devolvía «sin archivo» con 500. El resultado era que una persona
// firmaba algo probatorio y no podía recuperarlo por ninguna vía.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { registrar } from '@/lib/sgsi/bitacora';
import { almacenPostgres, ipDesdeSolicitud } from '@/lib/sgsi/anexos';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const correo = session?.user?.email;
  if (!correo) return new NextResponse('sin sesión', { status: 401 });

  const codigo = new URL(req.url).searchParams.get('codigo');
  if (!codigo) return new NextResponse('falta el código del acta', { status: 400 });

  const acta = await prisma.actaAceptacion.findUnique({
    where: { codigo },
    select: {
      codigo: true,
      actaHash: true,
      pdfId: true,
      persona: { select: { correo: true } },
      pdf: { select: { archivoNombre: true, archivoMime: true, texto: true } },
    },
  });
  if (!acta) return new NextResponse('acta no encontrada', { status: 404 });

  // Quien firmó siempre puede bajar la suya: es su constancia, y una constancia que su
  // dueño no puede recuperar no le sirve a nadie. Fuera de eso, sólo quien administra el
  // módulo —el mismo permiso que habilita el cierre administrativo—, porque la ficha del
  // colaborador lista las actas de otras personas.
  const esDuena = acta.persona.correo === correo;
  const rol = rolDesdeGrupos(session.user?.grupos);
  if (!esDuena && !puede(rol, 'operacion:administrar')) {
    return new NextResponse('sin permiso', { status: 403 });
  }

  if (acta.pdfId === null || acta.pdf === null) {
    return new NextResponse('el acta no tiene artefacto guardado', { status: 500 });
  }

  let buffer: Buffer;
  try {
    // `almacenPostgres` y NO `almacenActivo()`. La firma escribe los bytes por la relación
    // inline, que es siempre la tabla de Postgres; con el proveedor puesto en `local`,
    // `almacenActivo()` iría a buscar a disco un archivo que nunca se escribió ahí.
    buffer = await almacenPostgres.leer(String(acta.pdfId));
  } catch {
    return new NextResponse('archivo no disponible', { status: 404 });
  }

  // Quién bajó un acta y cuándo es exactamente lo que una auditoría pregunta sobre un
  // documento probatorio. Se registra la huella, no el contenido.
  const ip = await ipDesdeSolicitud();
  await registrar({ bitacora: prisma.bitacora }, correo, [
    {
      tabla: 'acta_aceptacion',
      registroId: acta.codigo,
      campo: 'descarga',
      anterior: null,
      nuevo: `${acta.actaHash.slice(0, 12)} · ${buffer.length} bytes`,
      motivo: `${esDuena ? 'descarga de la propia acta' : 'descarga administrativa'} · IP ${ip ?? 'no visible'}`,
    },
  ]);

  const nombre = acta.pdf.archivoNombre ?? acta.pdf.texto ?? `${acta.codigo}.txt`;
  return new NextResponse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    {
      headers: {
        'Content-Type': acta.pdf.archivoMime ?? 'text/plain; charset=utf-8',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    },
  );
}
