// app/api/sgsi/anexo/route.ts
//
// Alta y descarga de anexos (evidencia tipo ARCHIVO). El almacenamiento va detras de la
// interfaz de lib/sgsi/anexos.ts: hoy disco local fuera de la raíz web, mañana S3 con
// URLs firmadas — misma autorización, misma bitácora.
//
// El POST es un FormData multipart para poder reportar progreso por archivo con XHR en
// el cliente; el GET devuelve el contenido con el tipo MIME verificado por contenido.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import {
  ANEXOS_ACEPTADOS,
  clavePara,
  esExtension,
  type DuenoAnexo,
  formatoTamano,
  mimePorContenido,
  sha256De,
} from '@/lib/sgsi/anexo-archivo';
import { almacenActivo, escanearAntivirus, ipDesdeSolicitud, limitesAnexos } from '@/lib/sgsi/anexos';

export const dynamic = 'force-dynamic';

const EXTENSIÓN = /\.([a-z0-9]+)$/i;
const NOMBRE_ORIGINAL = /^[^/\\]{1,180}$/;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse('sin sesión', { status: 401 });

  const autor = session.user?.email ?? 'desconocido';
  const rol = rolDesdeGrupos(session.user?.grupos);
  const ip = await ipDesdeSolicitud();

  const form = await req.formData();
  const archivo = form.get('file');
  const codigoControl = (form.get('codigoControl') as string | null)?.trim();
  const codigoEvento = (form.get('codigoEvento') as string | null)?.trim();
  const codigoHallazgo = (form.get('codigoHallazgo') as string | null)?.trim();
  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, mensaje: 'Falta el archivo.' }, { status: 400 });
  }
  if ([codigoControl, codigoEvento, codigoHallazgo].filter(Boolean).length !== 1) {
    // Exactamente uno. El CHECK `evidencia_un_solo_origen` diría lo mismo al final, pero
    // acá el mensaje puede explicar qué pasó en vez de reventar contra la base.
    return NextResponse.json(
      { ok: false, mensaje: 'Indicá un control, un evento o un hallazgo: exactamente uno.' },
      { status: 400 },
    );
  }

  // El dueño decide la autorización, la cuota, la clave y el renglón de la bitácora. Todo
  // lo demás —lista blanca, MIME por contenido, macros, tamaño, antivirus— es idéntico
  // para los dos, y por eso vive una sola vez.
  let dueno: DuenoAnexo;
  let duenoId: number;
  let duenoCodigo: string;
  if (codigoControl) {
    if (!puede(rol, 'evidencia:escribir')) return new NextResponse('sin permiso', { status: 403 });
    const control = await prisma.control.findUnique({ where: { codigo: codigoControl } });
    if (!control) {
      return NextResponse.json({ ok: false, mensaje: `No existe el control ${codigoControl}.` }, { status: 404 });
    }
    dueno = 'control';
    duenoId = control.id;
    duenoCodigo = control.codigo;
  } else if (codigoHallazgo) {
    const hallazgo = await prisma.hallazgo.findUnique({
      where: { codigo: codigoHallazgo },
      select: { id: true, codigo: true, detectadoPor: { select: { correo: true } } },
    });
    if (!hallazgo) {
      return NextResponse.json({ ok: false, mensaje: `No existe el hallazgo ${codigoHallazgo}.` }, { status: 404 });
    }
    // B3 · cualquiera reporta. Misma razón que en el evento: la evidencia la tiene quien
    // reportó, y si sólo el líder puede adjuntarla, se pierde.
    const esQuienReporto = hallazgo.detectadoPor?.correo === autor;
    if (!esQuienReporto && !puede(rol, 'mejora:escribir')) {
      return new NextResponse('sin permiso', { status: 403 });
    }
    dueno = 'hallazgo';
    duenoId = hallazgo.id;
    duenoCodigo = hallazgo.codigo;
  } else {
    const evento = await prisma.eventoSeguridad.findUnique({
      where: { codigo: codigoEvento as string },
      select: { id: true, codigo: true, reportadoPor: { select: { correo: true } } },
    });
    if (!evento) {
      return NextResponse.json({ ok: false, mensaje: `No existe el evento ${codigoEvento}.` }, { status: 404 });
    }
    // **O1 se extiende al adjunto.** Reportar está abierto sin permiso previo, y una
    // evidencia que quien reporta no puede adjuntar es una evidencia que se pierde: la
    // captura de pantalla la tiene esa persona, no el equipo de seguridad. Por eso quien
    // reportó puede adjuntar sobre su propio evento aunque no tenga `evidencia:escribir`.
    // Sobre eventos ajenos sí se exige el permiso del SGSI.
    const esQuienReporto = evento.reportadoPor.correo === autor;
    if (!esQuienReporto && !puede(rol, 'sgsi:escribir')) {
      return new NextResponse('sin permiso', { status: 403 });
    }
    dueno = 'evento';
    duenoId = evento.id;
    duenoCodigo = evento.codigo;
  }

  const nombre = archivo.name.trim();
  if (!NOMBRE_ORIGINAL.test(nombre)) {
    return NextResponse.json({ ok: false, mensaje: 'Nombre de archivo inválido.' }, { status: 400 });
  }
  const match = EXTENSIÓN.exec(nombre);
  const extension = match ? match[1].toLowerCase() : '';
  if (!esExtension(extension)) {
    return NextResponse.json(
      { ok: false, mensaje: `Tipo no permitido «${extension || 'sin extensión'}». Lista blanca: ${Object.keys(ANEXOS_ACEPTADOS).join(', ')}.` },
      { status: 415 },
    );
  }
  if (/\.(docm|xlsm|pptm|exe|msi|jar|vbs|scr|bat|cmd)$/i.test(nombre)) {
    return NextResponse.json({ ok: false, mensaje: 'Macros y ejecutables no se admiten como evidencia.' }, { status: 415 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const mime = mimePorContenido(buffer);
  if (!mime || mime === 'application/zip') {
    // ZIP es el contenedor de docx/xlsx/pptx; el contenedor se acepta solo con las
    // extensiones ofimáticas correspondientes.
    const ofimatico = extension === 'docx' || extension === 'xlsx' || extension === 'pptx';
    if (mime !== 'application/zip' || !ofimatico) {
      return NextResponse.json(
        { ok: false, mensaje: 'El contenido no corresponde al tipo declarado: el MIME se verifica por contenido, no por extensión.' },
        { status: 415 },
      );
    }
  } else if (mime !== ANEXOS_ACEPTADOS[extension] && !(extension === 'jpg' && mime === 'image/jpeg')) {
    return NextResponse.json(
      { ok: false, mensaje: `El contenido no corresponde al tipo declarado (${mime}).` },
      { status: 415 },
    );
  }

  const limites = await limitesAnexos();
  if (buffer.length > limites.porArchivo) {
    return NextResponse.json(
      { ok: false, mensaje: `El archivo supera el límite de ${formatoTamano(limites.porArchivo)}.` },
      { status: 413 },
    );
  }

  // Antivirus antes de dejar el archivo disponible. Sin motor configurado queda
  // constancia en la bitácora (motivo de la subida) y la validación estática ya pasó.
  const antivirus = await escanearAntivirus(buffer);
  if (antivirus.infectado) {
    return NextResponse.json(
      { ok: false, mensaje: 'El archivo fue rechazado por el análisis antivirus.' },
      { status: 415 },
    );
  }
  // La cuota es por dueño: el parámetro se llama `anexo_total_max_mb` y siempre midió el
  // acumulado de un dueño, no el de la instalación.
  const deEsteDueno =
    dueno === 'control'
      ? { controlId: duenoId }
      : dueno === 'hallazgo'
        ? { hallazgoId: duenoId }
        : { eventoId: duenoId };
  const ocupa = await prisma.evidencia.aggregate({
    where: { ...deEsteDueno, tipo: 'ARCHIVO', activo: true },
    _sum: { archivoTamano: true },
  });
  const totalActual = Number(ocupa._sum.archivoTamano ?? 0);
  if (totalActual + buffer.length > limites.porControl) {
    return NextResponse.json(
      { ok: false, mensaje: `El ${dueno} ya acumuló ${formatoTamano(totalActual)} en anexos: se supera el límite de ${formatoTamano(limites.porControl)}.` },
      { status: 413 },
    );
  }

  const versionesPrevias = await prisma.evidencia.findMany({
    where: { ...deEsteDueno, tipo: 'ARCHIVO', archivoNombre: nombre },
    select: { archivoVersion: true },
  });
  const version = versionesPrevias.reduce((m, v) => Math.max(m, v.archivoVersion), 0) + 1;
  const hash = sha256De(buffer);
  const key = clavePara(dueno, duenoId, extension);

  // 1) Se crea la fila de evidencia (metadata); 2) se guardan los bytes en la base;
  // 3) solo si ambos andan, la bitácora. Si el blob falla, la fila se revierte — nunca
  // queda metadata huérfana ni un blob sin rastro auditado.
  const creada = await prisma.evidencia.create({
    data: {
      ...deEsteDueno,
      tipo: 'ARCHIVO',
      texto: nombre,
      esBase: false,
      orden: 0,
      creadaPor: autor,
      archivoKey: key,
      archivoNombre: nombre,
      archivoMime: mime,
      archivoTamano: buffer.length,
      archivoSha256: hash,
      archivoVersion: version,
    },
  });

  try {
    await almacenActivo().guardar(String(creada.id), buffer);
  } catch {
    await prisma.evidencia.delete({ where: { id: creada.id } });
    return NextResponse.json({ ok: false, mensaje: 'No se pudo almacenar el archivo.' }, { status: 500 });
  }

  await prisma.$transaction(async (tx) => {
    await registrarAlta(tx, autor, 'evidencia', String(creada.id));
    await registrar(tx, autor, [
      {
        tabla: 'anexo',
        registroId: duenoCodigo,
        campo: 'anexo subido',
        anterior: null,
        nuevo: `${nombre} · ${formatoTamano(buffer.length)} · sha256 ${hash.slice(0, 12)}… · v${version} · almacenamiento en base de datos`,
        motivo: `IP ${ip ?? 'no visible'} · ${antivirus.motivo}`,
      },
    ]);
  });

  return NextResponse.json({
    ok: true,
    mensaje: `Se subió ${nombre} (v${version}).`,
    version,
  });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse('sin sesión', { status: 401 });
  const rol = rolDesdeGrupos(session.user?.grupos);
  if (!puede(rol, 'sgsi:ver')) return new NextResponse('sin permiso', { status: 403 });

  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  const inline = url.searchParams.get('inline') === '1';
  if (!Number.isInteger(id)) return new NextResponse('id inválido', { status: 400 });

  const evidencia = await prisma.evidencia.findUnique({
    where: { id },
    include: { control: true, evento: { select: { codigo: true } } },
  });
  if (!evidencia || evidencia.tipo !== 'ARCHIVO') {
    return new NextResponse('anexo no encontrado', { status: 404 });
  }
  if (!evidencia.activo) return new NextResponse('anexo retirado', { status: 410 });
  if (!evidencia.archivoKey) return new NextResponse('sin archivo', { status: 500 });

  let buffer: Buffer;
  try {
    buffer = await almacenActivo().leer(String(evidencia.id));
  } catch {
    return new NextResponse('archivo no disponible', { status: 404 });
  }

  const autor = session.user?.email ?? 'desconocido';
  const ip = await ipDesdeSolicitud();
  // `Evidencia.hallazgoId` es una columna sin relación declarada en el esquema, así que
  // el código se busca aparte —y sólo cuando el dueño es un hallazgo.
  const codigoDelHallazgo =
    evidencia.hallazgoId === null
      ? null
      : ((
          await prisma.hallazgo.findUnique({
            where: { id: evidencia.hallazgoId },
            select: { codigo: true },
          })
        )?.codigo ?? null);
  await registrar(
    { bitacora: prisma.bitacora },
    autor,
    [
      {
        tabla: 'anexo',
        // El código del dueño, no su id: la bitácora la lee un auditor. Sin la rama del
        // evento, una descarga de evidencia de incidente quedaba registrada con el
        // renglón en blanco.
        registroId:
          evidencia.control?.codigo ??
          evidencia.evento?.codigo ??
          codigoDelHallazgo ??
          String(evidencia.registroId ?? ''),
        campo: `anexo ${inline ? 'previsualizado' : 'descargado'}`,
        anterior: null,
        nuevo: `${evidencia.archivoNombre} · ${formatoTamano(buffer.length)}`,
        motivo: `IP ${ip ?? 'no visible'}`,
      },
    ],
  );

  const nombre = evidencia.archivoNombre ?? evidencia.texto;
  return new NextResponse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, {
    headers: {
      'Content-Type': evidencia.archivoMime ?? 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
