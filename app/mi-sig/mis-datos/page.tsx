// app/mi-sig/mis-datos/page.tsx
//
// Mis datos: lo que la persona mantiene sobre sí misma, y los documentos que firmó.
//
// ── POR QUÉ LOS DOCUMENTOS FIRMADOS VIVEN ACÁ Y NO EN LA BANDEJA ────────────────────────
//
// La bandeja responde «qué me falta hacer» y se vacía cuando uno cumple. Un acta firmada no
// es algo que falte: es algo que uno TIENE, y la pregunta que se hace sobre ella —«¿qué
// acepté y cuándo?»— llega meses después, cuando la bandeja ya se vació. Ponerla junto a los
// datos personales la deja donde uno la va a buscar.
//
// Lo que SÍ está pendiente de firma sigue apareciendo en la bandeja, que es donde se actúa.
// Acá se lista con su enlace, para que las dos preguntas se contesten desde el mismo lugar.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import MisDatosClient, { type ActaFirmada, type PendienteDeFirma } from './MisDatos.client';

export const dynamic = 'force-dynamic';

export default async function MisDatosPage() {
  const session = await getServerSession(authOptions);
  const correo = session?.user?.email?.toLowerCase();

  const persona = correo
    ? await prisma.persona.findUnique({
        where: { correo },
        include: {
          area: { select: { nombre: true } },
          cargo: { select: { nombre: true } },
          hijos: { orderBy: { fechaNacimiento: 'asc' } },
        },
      })
    : null;

  if (persona === null) {
    return (
      <main className="mx-auto w-full max-w-[880px] flex-1 px-8 pb-16 pt-8">
        <h1 className="titulo-pagina">Mis datos</h1>
        <p className="mt-2 max-w-[74ch] text-12_5 text-muted [text-wrap:pretty]">
          Tu cuenta no está en el censo del SIG, así que no hay ficha que mostrar. Si acabás
          de entrar a la organización, aparece en la próxima sincronización con el Directorio.
        </p>
      </main>
    );
  }

  const [actas, pendientes] = await Promise.all([
    prisma.actaAceptacion.findMany({
      where: { personaId: persona.id },
      orderBy: { aceptadoEn: 'desc' },
      select: {
        codigo: true,
        aceptadoEn: true,
        contenidoVersion: true,
        contenido: { select: { codigo: true, titulo: true } },
      },
    }),
    // Lo que exige firma y todavía está abierto. Se pregunta por el CONTENIDO —`exigeFirma`—
    // y no por una lista escrita acá: el día que se agregue un documento más, aparece solo.
    prisma.asignacion.findMany({
      where: {
        personaId: persona.id,
        estado: 'PENDIENTE',
        OR: [
          { contenido: { exigeFirma: true } },
          { obligacion: { contenido: { exigeFirma: true } } },
        ],
      },
      orderBy: { fechaLimite: 'asc' },
      select: {
        id: true,
        fechaLimite: true,
        contenido: { select: { codigo: true, titulo: true } },
        obligacion: { select: { contenido: { select: { codigo: true, titulo: true } } } },
      },
    }),
  ]);

  const firmadas: ActaFirmada[] = actas.map((a) => ({
    codigo: a.codigo,
    documento: `${a.contenido.codigo} · ${a.contenido.titulo}`,
    version: a.contenidoVersion,
    firmadaEn: a.aceptadoEn.toISOString().slice(0, 10),
  }));

  const porFirmar: PendienteDeFirma[] = pendientes.map((p) => {
    const c = p.contenido ?? p.obligacion?.contenido ?? null;
    return {
      asignacionId: p.id,
      documento: c ? `${c.codigo} · ${c.titulo}` : 'Documento',
      fechaLimite: p.fechaLimite.toISOString().slice(0, 10),
    };
  });

  return (
    <MisDatosClient
      nombre={persona.nombre}
      correo={persona.correo}
      area={persona.area?.nombre ?? null}
      cargo={persona.cargo?.nombre ?? null}
      datos={{
        telefono: persona.telefono ?? '',
        correoPersonal: persona.correoPersonal ?? '',
        direccion: persona.direccion ?? '',
        ciudad: persona.ciudad ?? '',
        fechaNacimiento: persona.fechaNacimiento?.toISOString().slice(0, 10) ?? '',
        eps: persona.eps ?? '',
        arl: persona.arl ?? '',
      }}
      hijos={persona.hijos.map((h) => ({
        id: h.id,
        nombre: h.nombre,
        fechaNacimiento: h.fechaNacimiento.toISOString().slice(0, 10),
        genero: h.genero,
      }))}
      firmadas={firmadas}
      porFirmar={porFirmar}
    />
  );
}
