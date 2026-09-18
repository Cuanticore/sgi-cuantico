// app/api/sig/exportar-pendientes/route.ts
//
// Los pendientes, como hoja de cálculo. Sesión, permiso, consulta y descarga; cómo se ve el
// archivo vive en `lib/sig/pendientes-libro.ts`, que no tiene sesión ni Prisma para que una
// prueba pueda construir el libro y leerlo de vuelta.
//
// **La ruta NO está bajo `/sig`**, así que la puerta de lectura del layout nunca la ve:
// `operacion:ver` se comprueba acá de forma explícita, igual que hace `exportar-activos`.
// Con sesión buena y sin permiso la respuesta es **403 y no 404**: el archivo lleva la carga
// de trabajo de toda la organización, y quien tiene cuenta merece saber que existe y que no
// le corresponde, en vez de quedarse pensando que la ruta está rota.
//
// ── UNA RUTA, DOS ENTRADAS ───────────────────────────────────────────────────────────────
//
// Sin parámetros exporta los pendientes de todo el censo. Con `?persona=<id>` exporta los de
// una, que es lo que usa el botón de la pestaña. Dos rutas para dos vistas de la misma lista
// es el mismo error que la pestaña evita adentro al no duplicar la lista: el día que una
// cuente distinto de la otra, nadie va a poder decir cuál tiene razón.
//
// `?estado=activas|inactivas|todas` acompaña al chip de la pantalla. Por omisión es `todas`:
// un archivo llamado «pendientes del censo» que se haya comido en silencio a las personas
// inactivas —que son justo las que tienen carga sin dueño— mentiría por omisión.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { diasHasta, esVencida } from '@/lib/sig/cierre';
import { avanceDelCurso } from '@/lib/sig/formacion';
import { construirLibroPendientes, type FilaPendienteExport } from '@/lib/sig/pendientes-libro';

const SELECT_CONTENIDO = { codigo: true, titulo: true, tipo: true, claseCurso: true } as const;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  if (!puede(rolDesdeGrupos(session.user?.grupos), 'operacion:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const url = new URL(request.url);
  const personaParam = url.searchParams.get('persona');
  const estado = url.searchParams.get('estado');

  // Un `?persona=abc` no es «todo el censo»: es una petición mal formada, y contestar con el
  // censo entero entregaría muchísimo más de lo que se pidió.
  let personaId: number | null = null;
  if (personaParam !== null) {
    const n = Number(personaParam);
    if (!Number.isInteger(n) || n <= 0) {
      return new NextResponse(null, { status: 400 });
    }
    personaId = n;
  }

  const filtroDePersona =
    personaId !== null
      ? { id: personaId }
      : estado === 'activas'
        ? { activa: true }
        : estado === 'inactivas'
          ? { activa: false }
          : {};

  const filas = await prisma.asignacion.findMany({
    // **El mismo predicado que la columna y que la pestaña**: `estado: 'PENDIENTE'`, sin
    // filtros de fecha ni de tipo. Tres lugares que cuentan lo mismo tienen que contarlo
    // igual, y ésta es la lista que alguien va a pegar en un correo.
    where: { estado: 'PENDIENTE', persona: filtroDePersona },
    orderBy: [{ persona: { nombre: 'asc' } }, { fechaLimite: 'asc' }],
    select: {
      titulo: true,
      periodo: true,
      fechaLimite: true,
      persona: {
        select: {
          nombre: true,
          correo: true,
          area: { select: { nombre: true } },
          cargo: { select: { nombre: true } },
        },
      },
      contenido: { select: SELECT_CONTENIDO },
      obligacion: { select: { contenido: { select: SELECT_CONTENIDO } } },
      intentosScorm: {
        select: { numero: true, estado: true, progressMeasure: true, ultimaActividadEn: true },
      },
    },
  });

  const hoy = new Date();
  const exportables: FilaPendienteExport[] = filas.map((f) => {
    const contenido = f.contenido ?? f.obligacion?.contenido ?? null;
    const tipo = contenido?.tipo ?? 'TAREA';
    const { progreso } = avanceDelCurso(
      tipo,
      contenido?.claseCurso ?? null,
      f.intentosScorm.map((i) => ({
        numero: i.numero,
        estado: i.estado,
        // Preguntar por el nulo ANTES de convertir: `Number(null)` es 0, y ahí se perdería
        // entera la distinción entre «el paquete no reportó» y «reportó cero».
        progressMeasure: i.progressMeasure === null ? null : Number(i.progressMeasure),
        ultimaActividadEn: i.ultimaActividadEn,
      })),
    );

    return {
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? f.titulo ?? 'Asignación puntual',
      tipo,
      persona: f.persona.nombre,
      correo: f.persona.correo,
      area: f.persona.area?.nombre ?? null,
      cargo: f.persona.cargo?.nombre ?? null,
      periodo: f.periodo,
      fechaLimite: f.fechaLimite.toISOString().slice(0, 10),
      // `diasHasta` cuenta hacia el futuro; en la hoja los vencidos van en negativo para que
      // ordenar por esta columna deje arriba lo que más urge sin leer la de al lado.
      dias: diasHasta(f.fechaLimite, hoy),
      vencida: esVencida('PENDIENTE', f.fechaLimite, hoy),
      // `null` cuando no hay avance conocido. El libro deja la celda vacía; poner 0 acá
      // haría que la columna se sume y se promedie como si fuera un dato.
      avance: progreso?.porcentaje ?? null,
      intentos: f.intentosScorm.length,
    };
  });

  const dia = hoy.toISOString().slice(0, 10);
  const quien = personaId !== null ? (filas[0]?.persona.nombre ?? 'persona') : 'censo';
  const buffer = await construirLibroPendientes(
    exportables,
    personaId !== null ? `Pendientes de ${quien}` : 'Pendientes del censo',
  );

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pendientes-${archivo(quien)}-${dia}.xlsx"`,
      // El archivo lleva nombres, correos y la carga de trabajo de personas reales: no se
      // cachea en ningún intermediario.
      'Cache-Control': 'no-store',
    },
  });
}

/// El nombre de la persona, apto para un nombre de archivo: sin acentos, sin espacios y sin
/// los signos que Windows rechaza. Un `Content-Disposition` con una tilde cruda llega
/// distinto según el navegador.
function archivo(nombre: string): string {
  return (
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'censo'
  );
}
