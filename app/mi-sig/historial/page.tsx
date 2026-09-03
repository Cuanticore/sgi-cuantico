// app/mi-sig/historial/page.tsx
//
// «Todo lo que has hecho en el sistema, con su registro. Es lo que te piden mostrar
// cuando una auditoría llega a tu proceso.» Agrupado por mes; cada registro con su
// estado: a tiempo, extemporánea o cierre administrativo (R5, R8).

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import HistorialClient from './Historial.client';

export const dynamic = 'force-dynamic';

export default async function HistorialPage() {
  const session = await getServerSession(authOptions);
  const correo = (session?.user?.email ?? '').toLowerCase();

  const persona = await prisma.persona.findUnique({
    where: { correo },
    select: {
      id: true,
      nombre: true,
      correo: true,
      area: { select: { nombre: true } },
      cargo: { select: { nombre: true } },
    },
  });
  if (!persona) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
      </div>
    );
  }

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
      // D6 · la version que la persona LEYO, con su texto congelado. Sin esto la fila
      // mostraba el titulo ACTUAL del contenido: el historial decia «acuse de la version
      // 1» encabezado por el titulo de la version 3, que es precisamente la confusion que
      // el versionado viene a cerrar.
      versionContenido: true,
      respuestas: { include: { item: true } },
    },
  });

  const filas = registros.map((r) => {
    const a = r.asignacion;
    const contenido = a.contenido ?? a.obligacion?.contenido;
    const administrativo = a.cerradaPor !== null && a.cerradaPor !== a.personaId;
    const extemporanea = a.fechaCierre !== null && a.fechaCierre > a.fechaLimite;
    // El titulo que la persona TENIA DELANTE. Sin version guardada se cae al actual, y la
    // fila lo dice: es la diferencia entre un acuse verificable y uno que solo afirma.
    const tituloLeido = r.versionContenido?.titulo ?? contenido?.titulo ?? 'Puntual';
    const texto =
      contenido?.tipo === 'LECTURA'
        ? r.versionContenido !== null
          ? `Acuse de la versión ${r.versionContenido.version}, con su texto guardado`
          : `Acuse de la versión ${r.versionLeida ?? contenido.version} · el texto de esa versión no se conservó`
        : contenido?.tipo === 'CAPACITACION'
          ? `${r.asistio ? 'Asistió' : 'No asistió'}${r.calificacion !== null ? ` · ${r.calificacion}` : ''}`
          : contenido?.tipo === 'VERIFICACION'
            ? `${r.respuestas.length} ítem(s) respondido(s)`
            : (r.nota ?? 'Registrado');
    return {
      id: r.id,
      tipo: contenido?.tipo ?? 'TAREA',
      codigo: contenido?.codigo ?? '—',
      titulo: tituloLeido,
      fechaHora: r.fechaHora,
      texto,
      nota: r.nota,
      aTiempo: !extemporanea && !administrativo,
      extemporanea,
      administrativo,
      cerradaPor: administrativo ? (a.cerradaPorPersona?.nombre ?? 'Otra persona') : null,
      motivo: a.motivo,
      periodo: a.periodo,
      versionLeida: r.versionLeida,
      /// Si el acuse se puede verificar contra el texto que se leyo. `false` en los
      /// registros anteriores al versionado: ese texto se sobreescribio y no vuelve.
      textoVerificable: r.versionContenido !== null,
    };
  });

  const resumen = {
    registros: filas.length,
    aTiempo: filas.filter((f) => f.aTiempo).length,
    cierresAdministrativos: filas.filter((f) => f.administrativo).length,
  };

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <HistorialClient
        persona={{
          nombre: persona.nombre,
          correo: persona.correo,
          area: persona.area?.nombre ?? null,
          cargo: persona.cargo?.nombre ?? null,
        }}
        resumen={resumen}
        filas={filas}
      />
    </div>
  );
}