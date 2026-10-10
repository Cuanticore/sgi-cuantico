// app/api/v1/sistemas/[codigo]/route.ts
//
// **Tarea 3.2 · la hoja de vida completa de un sistema, con sus siete colecciones hijas.**
//
// Se busca por `codigo` y no por `id`: es la clave natural, es inmutable —el schema lo dice con
// todas las letras— y es lo que un repositorio declara en su archivo de vínculo. Un agente que
// genera el FOR-TEC-04 conoce «SIS-001»; no tiene por qué conocer el autoincremental de nadie.
//
// CADA COLECCIÓN SE ORDENA POR SU CLAVE NATURAL, la misma que el `@@unique` del schema declara:
// la letra de la puerta, el código del requisito, la versión de la liberación. Un orden
// implícito —el que la base devuelva— cambia entre consultas y haría que dos lecturas del mismo
// expediente produjeran dos libros distintos sin que nada hubiera cambiado.

import { conToken } from '@/lib/api/con-token';
import { operacion } from '@/lib/api/catalogo-rutas';
import { problema } from '@/lib/api/problema';
import { hojaDeVidaCompleta } from '@/lib/sig/hoja-de-vida-json';
import { prisma } from '@/lib/db';

const OP = operacion('obtenerSistema');

const PERSONA = { select: { nombre: true } } as const;

export const GET = conToken(
  OP.permiso,
  async (_request, _autor, contexto: { params: Promise<{ codigo: string }> }) => {
    const { codigo } = await contexto.params;

    const sistema = await prisma.sistema.findUnique({
      where: { codigo },
      include: {
        producto: { select: { nombre: true } },
        propietario: PERSONA,
        responsableTecnico: PERSONA,
        puertas: {
          orderBy: { puerta: 'asc' },
          include: {
            verificadoPor: PERSONA,
            autoriza: PERSONA,
            excepcion: { select: { codigo: true } },
          },
        },
        excepciones: {
          orderBy: { codigo: 'asc' },
          include: { aprobadaPor: PERSONA, cerradaPor: PERSONA },
        },
        requisitos: { orderBy: { codigo: 'asc' } },
        pruebas: { orderBy: { codigo: 'asc' }, include: { ejecutor: PERSONA } },
        tratamientos: { orderBy: { codigo: 'asc' }, include: { responsable: PERSONA } },
        liberaciones: {
          orderBy: { version: 'asc' },
          include: { autoriza: PERSONA, ejecuta: PERSONA },
        },
        componentes: { orderBy: { codigo: 'asc' } },
      },
    });

    if (sistema === null) {
      // Devolver el código que preguntaron no revela nada: lo escribió quien pregunta. Sin eso
      // no puede distinguir un código mal escrito de un sistema que todavía no existe.
      return problema('no-encontrado', `No existe ningún sistema con el código «${codigo}».`);
    }

    return Response.json(hojaDeVidaCompleta(sistema), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
