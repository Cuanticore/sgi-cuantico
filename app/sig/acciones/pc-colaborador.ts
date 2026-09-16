'use server';

// app/sig/acciones/pc-colaborador.ts
//
// El equipo de cómputo de un colaborador: asociarle uno que ya existe, o crearlo.
//
// ── ES CUSTODIA, NO ENCARNACIÓN ─────────────────────────────────────────────────────────
//
// Un PC se ASOCIA por `Activo.personaId` —el custodio persona, quién lo tiene en la mano— y
// no por `ActivoPersona`, que es para los activos de tipo `[P] Personal` cuya sustancia SON
// personas. Confundirlas diría que el portátil es la persona.
//
// ── QUÉ SE PROYECTA AL CREAR, Y QUÉ NO SE INVENTA ───────────────────────────────────────
//
// Se proyecta lo que se deduce sin ambigüedad: el proceso es el de la persona, el custodio
// persona es ella, el tipo es `[HW]` y el subtipo `[pc] Informática personal`, la ubicación
// es «Equipo Colaborador» —que el catálogo tiene exactamente para esto— y el entorno «No
// aplica», porque un portátil no es producción ni staging.
//
// **No se inventa el área ni el cargo cuando faltan.** El prefijo del área forma el código
// del activo, y aunque desde esta tanda un código se puede reemitir al cambiar de proceso,
// un activo emitido bajo un área adivinada arranca diciendo algo que nadie afirmó. Si la
// persona no tiene área o cargo, se rechaza y se dice cuál falta.
//
// ── CUÁNTICO O BYOD ─────────────────────────────────────────────────────────────────────
//
// La diferencia va en la DESCRIPCIÓN y no en un campo propio, porque no existe uno. Es una
// distinción que importa para el riesgo —un equipo del colaborador no lo administra la
// organización— y el día que haga falta filtrarla, merece su columna: parsear texto para
// decidir a quién se le puede exigir cifrado de disco sería peor que no tener el dato.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { crearActivo } from '@/app/sgsi/acciones/activos';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';

/// El subtipo MAGERIT del equipo personal. Por CÓDIGO y no por id: el id es un detalle de la
/// base y el código es el contrato con el catálogo.
const SUBTIPO_PC = '[pc]';
/// La ubicación que el catálogo ya tiene para un equipo que vive con su persona.
const UBICACION_EQUIPO = 'Equipo Colaborador';
/// Un portátil no es producción ni staging: «No aplica» es la respuesta, no un hueco.
const ENTORNO_PC = 'No aplica';

/// La valoración con la que nace. **3 en las tres dimensiones** por decisión del líder del
/// SIG: es un punto de partida declarado, no una medición — y con valor 3 el activo NO
/// alcanza el umbral de 4, así que no genera riesgos hasta que alguien lo valore de verdad.
const VALOR_INICIAL = { D: 3, I: 3, C: 3 } as const;

export type PropiedadDelEquipo = 'CUANTICO' | 'BYOD';

const DESCRIPCION: Record<PropiedadDelEquipo, string> = {
  CUANTICO: 'Equipo de cómputo propiedad de Cuántico, entregado al colaborador.',
  BYOD: 'Equipo de cómputo propio del colaborador (BYOD). No lo administra la organización.',
};

export interface PcDisponible {
  id: number;
  codigo: string;
  nombre: string;
}

export interface ResultadoPcs extends Resultado {
  pcs: PcDisponible[];
}

/// Los equipos personales que hoy no tienen custodio persona.
///
/// Sólo los LIBRES: ofrecer uno que ya está con alguien invitaría a quitárselo sin que la
/// pantalla diga que eso es lo que va a pasar. Reasignar un equipo es una acción distinta y
/// merece decirlo.
export async function pcsDisponibles(): Promise<ResultadoPcs> {
  const r = await ejecutar(async () => {
    await autorConPermiso('personas:administrar');
    const pcs = await prisma.activo.findMany({
      where: {
        activo: true,
        personaId: null,
        codigo: { not: null },
        subtipo: { codigo: SUBTIPO_PC },
      },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    });
    return {
      ok: true,
      mensaje: 'ok',
      pcs: pcs.map((a) => ({ id: a.id, codigo: a.codigo as string, nombre: a.nombre })),
    };
  });
  const con = r as ResultadoPcs;
  return { ...r, pcs: r.ok ? (con.pcs ?? []) : [] };
}

/// Le asocia a la persona un equipo que ya existe.
export async function asociarPc(personaId: number, activoId: number): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');
    exigirId(activoId, 'el activo');

    const [persona, activo] = await Promise.all([
      prisma.persona.findUnique({ where: { id: personaId }, select: { nombre: true } }),
      prisma.activo.findUnique({
        where: { id: activoId },
        select: { codigo: true, nombre: true, personaId: true, persona: { select: { nombre: true } } },
      }),
    ]);
    if (!persona) return { ok: false, mensaje: 'La persona no existe.' };
    if (!activo) return { ok: false, mensaje: 'El activo no existe.' };

    // Un equipo que ya está con alguien no se reasigna en silencio: se dice con quién está.
    if (activo.personaId !== null && activo.personaId !== personaId) {
      return {
        ok: false,
        mensaje: `${activo.codigo} ya está a cargo de ${activo.persona?.nombre ?? 'otra persona'}. Quitáselo primero desde su ficha.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.activo.update({ where: { id: activoId }, data: { personaId } });
      await registrar(tx, autor, [
        {
          tabla: 'activo',
          registroId: activo.codigo ?? String(activoId),
          campo: 'personaId',
          anterior: null,
          nuevo: persona.nombre,
        },
      ]);
    });

    revalidarPersonaYActivos();
    return { ok: true, mensaje: `${activo.codigo} quedó a cargo de ${persona.nombre}.` };
  });
}

export interface ResultadoPcCreado extends Resultado {
  codigo?: string;
}

/// Crea el equipo del colaborador y se lo asocia, en un solo paso.
///
/// El código lo emite `crearActivo` contra `ContadorCodigo` — el mismo mecanismo de siempre,
/// así que no hay una segunda forma de numerar activos en el sistema.
export async function crearPcParaPersona(
  personaId: number,
  propiedad: PropiedadDelEquipo,
): Promise<ResultadoPcCreado> {
  return ejecutar(async () => {
    await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { nombre: true, areaId: true, cargoId: true },
    });
    if (!persona) return { ok: false, mensaje: 'La persona no existe.' };

    // No se inventa lo que falta, y se dice exactamente qué falta.
    if (persona.areaId === null) {
      return {
        ok: false,
        mensaje: `${persona.nombre} no tiene proceso asignado, y el proceso forma el código del activo. Asignáselo en Datos base y volvé.`,
      };
    }
    if (persona.cargoId === null) {
      return {
        ok: false,
        mensaje: `${persona.nombre} no tiene cargo asignado, y el cargo es el custodio que responde por el activo en el organigrama. Asignáselo en Datos base y volvé.`,
      };
    }

    const [subtipo, ubicacion, entorno] = await Promise.all([
      prisma.subtipoMagerit.findFirst({
        where: { codigo: SUBTIPO_PC },
        select: { id: true, tipoId: true },
      }),
      prisma.ubicacion.findFirst({ where: { nombre: UBICACION_EQUIPO }, select: { id: true } }),
      prisma.entorno.findFirst({ where: { nombre: ENTORNO_PC }, select: { id: true } }),
    ]);
    if (!subtipo) {
      return {
        ok: false,
        mensaje: `El catálogo MAGERIT no tiene el subtipo ${SUBTIPO_PC} «Informática personal». Sin él no hay cómo clasificar un equipo.`,
      };
    }

    const r = await crearActivo({
      nombre: `PC de ${persona.nombre}`,
      descripcion: DESCRIPCION[propiedad],
      areaId: persona.areaId,
      tipoId: subtipo.tipoId,
      subtipoId: subtipo.id,
      custodioId: persona.cargoId,
      propietarioId: persona.cargoId,
      ubicacionId: ubicacion?.id ?? null,
      entornoId: entorno?.id ?? null,
      personaId,
      cantidad: 1,
      valores: { ...VALOR_INICIAL },
    });
    if (!r.ok) return r;

    revalidarPersonaYActivos();
    return {
      ok: true,
      codigo: r.codigo,
      mensaje:
        `Se creó ${r.codigo} «PC de ${persona.nombre}» y quedó a su cargo. ` +
        'Nace valorado en 3/3/3, que es un punto de partida declarado y no una medición: con ' +
        'valor 3 no alcanza el umbral y todavía no genera riesgos.',
    };
  });
}

function revalidarPersonaYActivos(): void {
  revalidatePath('/sig/colaboradores');
  revalidatePath('/sig/personas');
  revalidatePath('/sgsi/inventario');
}
