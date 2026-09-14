// app/firmar/[token]/enlace.query.ts
//
// **REQ-SIG-19 · Task 7 · la lectura del enlace, desde el token que llegó en la ruta.**
//
// **P2 · la verificación es una búsqueda por hash.** `where: { tokenHash: hashDeToken(recibido) }`
// y no una comparación de secretos: no se compara nada, así que no hay nada que proteger contra
// tiempos. El token en claro no existe en la base y no se puede reconstruir desde ella.
//
// **D-5 · abrir no consume nada.** Esto lee y no escribe. Ni un contador de aperturas, ni una
// marca de «visto»: lo que se consume una sola vez es la firma, y una escritura acá convertiría
// recargar la página en gastar el enlace.
//
// **P3 · el token no se nombra.** Esta función no lo registra, no lo devuelve y no lo mete en
// ningún mensaje. Entra, se convierte en hash y se olvida.
//
// **Lo que se trae es el mínimo de P11** —el nombre y el documento— porque es lo único que la
// página puede mostrar. No se traen el área, el cargo, las otras asignaciones ni los otros
// documentos: lo que no se lee no se puede filtrar por descuido en una interpolación.

import { prisma } from '@/lib/db';
import { hashDeToken } from '@/lib/sig/enlace-firma';
import type { EnlacePublico } from '@/lib/sig/vista-enlace-publico';

/// **El enlace que corresponde a este token, o `null`.**
///
/// `null` es la respuesta para un token que no existe **y** para uno que existe pero cuyo
/// documento no se puede mostrar. Las dos producen la misma página (P13), que es justamente lo
/// que impide usar la ruta como oráculo: quien prueba tokens al azar no puede distinguir «no
/// existe» de «existe pero no sirve».
///
/// **El token no se valida antes de buscarlo.** Rechazar por longitud o por forma respondería
/// distinto —y más rápido— para una cadena mal formada que para una bien formada que no está, y
/// esa diferencia ya es información.
export async function leerEnlacePublico(token: string): Promise<EnlacePublico | null> {
  const fila = await prisma.enlaceFirma.findUnique({
    where: { tokenHash: hashDeToken(token) },
    select: {
      expiraEn: true,
      usadoEn: true,
      revocadoEn: true,
      bloqueadoEn: true,
      acta: { select: { codigo: true, aceptadoEn: true } },
      asignacion: {
        select: {
          persona: { select: { nombre: true } },
          contenido: true,
          obligacion: { select: { contenido: true } },
        },
      },
    },
  });
  if (fila === null) return null;

  // El contenido cuelga de la asignación directa o de la obligación que la generó, igual que en
  // la bandeja: traerlo por un solo camino haría que la misma capacitación se viera o no según
  // de dónde colgara.
  const contenido = fila.asignacion.contenido ?? fila.asignacion.obligacion?.contenido ?? null;
  if (contenido === null) return null;

  // La versión vigente con su TEXTO: es lo que la persona tiene delante y de donde sale la huella
  // del documento al firmar (F3). El número de versión solo no prueba nada si el texto se
  // sobreescribió — la lección de D6.
  const version = await prisma.versionContenido.findUnique({
    where: { contenidoId_version: { contenidoId: contenido.id, version: contenido.version } },
    select: { titulo: true, descripcion: true },
  });

  const sePuedeLeer =
    version !== null && contenido.declaracion !== null && contenido.exigeFirma === true;

  // Sin texto, sin declaración o sin `exigeFirma` no hay nada que firmar, y firmar contra un
  // documento cuyo texto no existe es el defecto que D6 cerró. **Salvo que el enlace ya se haya
  // usado**: entonces la firma ya ocurrió y la constancia se muestra igual, porque negarle a
  // alguien la prueba de que firmó es peor que mostrársela con el título del contenido en vez
  // del de la versión congelada.
  if (!sePuedeLeer && fila.usadoEn === null) return null;

  return {
    nombre: fila.asignacion.persona.nombre,
    documento: {
      codigo: contenido.codigo,
      version: contenido.version,
      titulo: version?.titulo ?? contenido.titulo,
      descripcion: version?.descripcion ?? contenido.descripcion,
      declaracion: contenido.declaracion ?? '',
    },
    acta: fila.acta,
    expiraEn: fila.expiraEn,
    usadoEn: fila.usadoEn,
    revocadoEn: fila.revocadoEn,
    bloqueadoEn: fila.bloqueadoEn,
  };
}
