// app/api/sig/trabajos/[nombre]/route.ts
//
// La ruta que el cron del servidor invoca (docs/handoff_sig/trabajos-programados.md §2).
//
//   POST /api/sig/trabajos/generar-asignaciones
//   Authorization: Bearer <SIG_TRABAJOS_SECRET>
//
// No es una idea nueva: el servidor ya tiene cron y ya lo usamos en
// `deploy/respaldo-postgres.sh` para el respaldo diario de Postgres. Esto sigue el mismo
// camino, y corre en el mismo proceso Next que ya tiene Prisma y la sesión de SMTP.
//
// La ruta verifica el secreto y NADA más: no usa la sesión de NextAuth, porque detrás del
// cron no hay una persona. Por eso el núcleo de cada trabajo vive en `lib/sig/trabajos.ts`
// con `server-only` y no en un archivo de acciones — ahí toda exportación se volvería una
// server action invocable desde el navegador sin compuerta de permiso.

import { NextResponse } from 'next/server';
import { correrTrabajo } from '@/lib/sig/trabajos';
import { AUTOR_SISTEMA, TRABAJOS, trabajoPorNombre } from '@/lib/sig/trabajos-catalogo';

export const dynamic = 'force-dynamic';

/// Comparación en tiempo constante. Con `===` la respuesta tarda distinto según cuántos
/// caracteres coincidan, y sobre un secreto expuesto a internet eso es información.
function secretoCoincide(recibido: string, esperado: string): boolean {
  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < recibido.length; i += 1) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}

export async function POST(
  peticion: Request,
  { params }: { params: Promise<{ nombre: string }> },
) {
  const esperado = process.env.SIG_TRABAJOS_SECRET;
  // Sin secreto configurado la ruta NO se abre. Un fallback permisivo acá dejaría el
  // motor de tareas expuesto a cualquiera que adivine la URL, y el día que alguien
  // olvidara la variable en producción nadie se enteraría.
  if (!esperado || esperado.trim() === '') {
    return NextResponse.json(
      {
        ok: false,
        mensaje:
          'SIG_TRABAJOS_SECRET no está configurado en este entorno. La ruta no se abre sin él.',
      },
      { status: 503 },
    );
  }

  const cabecera = peticion.headers.get('authorization') ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  if (!secretoCoincide(recibido, esperado)) {
    // Sin detalle: decir «el secreto está mal» y «falta la cabecera» por separado ayuda a
    // quien está probando la puerta.
    return NextResponse.json({ ok: false, mensaje: 'No autorizado.' }, { status: 401 });
  }

  const { nombre } = await params;
  const definicion = trabajoPorNombre(nombre);
  if (!definicion) {
    return NextResponse.json(
      { ok: false, mensaje: `No existe un trabajo llamado «${nombre}».` },
      { status: 404 },
    );
  }
  // Declarado pero sin construir. 501 y no 404: el nombre está bien y el crontab no tiene
  // que cambiar — un 404 mandaría a alguien a buscar un error de escritura que no existe.
  if (!definicion.disponible) {
    return NextResponse.json(
      { ok: false, mensaje: `El trabajo «${nombre}» todavía no está construido.`, razon: definicion.descripcion },
      { status: 501 },
    );
  }

  const corrida = await correrTrabajo(nombre, 'cron', AUTOR_SISTEMA);

  // El código HTTP dice si funcionó, porque es lo único que el cron mira. Un 200 sobre un
  // trabajo que falló es la falla en silencio que `EjecucionTrabajo` vino a impedir.
  return NextResponse.json(
    {
      ok: corrida.resultado === 'EXITOSO',
      trabajo: nombre,
      ejecucionId: corrida.ejecucionId,
      resultado: corrida.resultado,
      creados: corrida.creados,
      detalle: corrida.detalle,
      error: corrida.error,
    },
    { status: corrida.resultado === 'EXITOSO' ? 200 : 500 },
  );
}

/// GET lista los trabajos y su última corrida. Sirve para verificar el secreto y el
/// cableado desde el propio servidor sin disparar nada.
export async function GET(peticion: Request) {
  const esperado = process.env.SIG_TRABAJOS_SECRET;
  if (!esperado || esperado.trim() === '') {
    return NextResponse.json({ ok: false, mensaje: 'SIG_TRABAJOS_SECRET no está configurado.' }, { status: 503 });
  }
  const cabecera = peticion.headers.get('authorization') ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  if (!secretoCoincide(recibido, esperado)) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado.' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    trabajos: TRABAJOS.map((t) => ({
      nombre: t.nombre,
      cuando: t.cuando,
      disponible: t.disponible,
      descripcion: t.descripcion,
    })),
  });
}
