'use server';

// app/sig/acciones/colaborador-alta.ts
//
// El alta MANUAL de un colaborador, desde la pantalla de Colaboradores.
//
// ── `MANUAL` NO ES UNA CATEGORÍA, ES UNA EXCEPCIÓN QUE SE DECLARA ───────────────────────
//
// El modelo ya lo dice: `OrigenPersona.MANUAL` es «excepción transitoria, NO una categoría
// válida», y la lista de Colaboradores la cuenta como anomalía porque una persona activa sin
// cuenta del Directorio no puede recibir asignaciones por los caminos normales.
//
// Esta acción NO cambia esa regla — la respeta y la hace visible. Existe porque la realidad
// llega antes que el Directorio: un contratista que empieza el lunes y cuya cuenta se crea el
// jueves es alguien de quien hay que poder registrar el contrato, el correo de contacto y las
// obligaciones desde el lunes. Lo que esta acción NO hace es disimular esa situación: la
// persona nace marcada como anomalía y se queda así hasta que la sincronización la encuentre
// en el Directorio y la convierta en `DIRECTORIO`.
//
// ── EL `oid` SINTÉTICO, Y POR QUÉ LLEVA PREFIJO ─────────────────────────────────────────
//
// `Persona.oid` es el object id de Azure AD, obligatorio y único. Una persona que todavía no
// existe en el Directorio no tiene uno, y dejarlo vacío no es opción: la columna es NOT NULL
// porque es la identidad estable que sobrevive a un cambio de correo.
//
// Se genera uno con el prefijo `manual:`, que un oid de Azure nunca puede tener —son UUID—,
// así que las dos poblaciones son distinguibles con una consulta y nunca colisionan. Cuando
// la sincronización encuentre a esta persona por correo, reemplazará el oid sintético por el
// real: ese es el momento en que la excepción se cierra.

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';

/// El prefijo que distingue un oid inventado por nosotros de uno de Azure AD.
export const PREFIJO_OID_MANUAL = 'manual:';

export interface ColaboradorNuevo {
  nombre: string;
  /// La cuenta del dominio si existe, o un correo externo si no. Es lo mismo para el modelo
  /// —`Persona.correo` es único y es por donde se notifica— y distinto para la realidad: con
  /// un correo externo, la persona no va a poder entrar a la aplicación hasta que tenga
  /// cuenta. La pantalla lo advierte; acá no se rechaza, porque registrar a alguien que
  /// todavía no tiene cuenta es exactamente para lo que esto existe.
  correo: string;
  tipoContratoId?: number | null;
  /// `BASE`, `RECURRENTE` o `TEMPORAL` — los tres del catálogo, no una invención de esta
  /// pantalla.
  tipoColaborador?: 'BASE' | 'RECURRENTE' | 'TEMPORAL' | null;
  fechaIngreso?: string | null;
  areaId?: number | null;
  cargoId?: number | null;
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function crearColaborador(datos: ColaboradorNuevo): Promise<Resultado & { id?: number }> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('personas:administrar');

    const nombre = datos.nombre.trim();
    const correo = datos.correo.trim().toLowerCase();
    if (nombre === '') return { ok: false, mensaje: 'El colaborador necesita un nombre.' };
    if (!RE_CORREO.test(correo)) {
      return { ok: false, mensaje: `«${datos.correo}» no tiene forma de correo.` };
    }

    // El correo es la llave por la que la sincronización va a reconocer a esta persona más
    // adelante. Si ya existe, no hay alta que hacer: hay una persona a la que ir a editar, y
    // decir cuál es más útil que decir que el correo está repetido.
    const existente = await prisma.persona.findUnique({
      where: { correo },
      select: { id: true, nombre: true, activa: true },
    });
    if (existente) {
      return {
        ok: false,
        mensaje:
          `Ya existe una persona con ${correo}: «${existente.nombre}»` +
          (existente.activa ? '.' : ', hoy inactiva. Reactivarla es mejor que crear una segunda.'),
      };
    }

    const creada = await prisma.$transaction(async (tx) => {
      const p = await tx.persona.create({
        data: {
          oid: `${PREFIJO_OID_MANUAL}${randomUUID()}`,
          correo,
          nombre,
          activa: true,
          origen: 'MANUAL',
          areaId: datos.areaId ?? null,
          cargoId: datos.cargoId ?? null,
          tipoContratoId: datos.tipoContratoId ?? null,
          tipoColaborador: datos.tipoColaborador ?? null,
          fechaIngreso: datos.fechaIngreso ? new Date(`${datos.fechaIngreso}T00:00:00.000Z`) : null,
        },
      });
      await registrarAlta(tx, autor, 'persona', correo);
      return p;
    });

    revalidatePath('/sig/colaboradores');
    revalidatePath('/sig/personas');

    return {
      ok: true,
      id: creada.id,
      mensaje:
        `Se creó «${nombre}» con ${correo}. Queda marcada como ALTA MANUAL —una anomalía— ` +
        'hasta que la sincronización la encuentre en el Directorio: sin cuenta corporativa no ' +
        'puede entrar a la aplicación ni recibir asignaciones por los caminos normales.',
    };
  });
}
