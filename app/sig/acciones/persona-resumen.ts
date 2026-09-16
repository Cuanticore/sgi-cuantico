'use server';

// app/sig/acciones/persona-resumen.ts
//
// Todo lo que el sistema sabe de una persona, en una sola respuesta.
//
// ── POR QUÉ ESTO NO ES UN DUPLICADO DE LA FICHA ─────────────────────────────────────────
//
// La ficha del colaborador (`/sig/colaboradores/[id]`) ya muestra el expediente completo:
// accesos vigentes, activos a cargo, formación, actas firmadas, intentos de curso y los
// últimos registros de bitácora. Esto NO la reemplaza ni la copia — devuelve las CIFRAS, no
// las filas, y el popup las enseña con el enlace al expediente.
//
// La diferencia importa porque las dos preguntas son distintas. «¿Qué tiene esta persona?»
// se contesta con seis números y se hace mientras se le edita el contrato. «¿Qué pasó con el
// acta que firmó en marzo?» se contesta con el expediente y se hace sentado. Meter el
// expediente entero dentro del popup haría que la primera pregunta costara lo que cuesta la
// segunda.
//
// ── LOS ACTIVOS SON DOS COSAS DISTINTAS Y SE CUENTAN APARTE ─────────────────────────────
//
// Una persona puede CUSTODIAR activos —`Activo.personaId`, el portátil que carga— y puede
// ser la sustancia de un activo `[P] Personal` —`ActivoPersona`, «Personal de soporte»—. Son
// relaciones distintas y sumarlas en un solo número diría algo que no es cierto de ninguna
// de las dos.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';

export interface ActivoDeLaPersona {
  codigo: string;
  nombre: string;
  /// `custodia` = lo tiene en la mano; `encarna` = el activo ES esta persona.
  vinculo: 'custodia' | 'encarna';
}

export interface ResumenDePersona {
  activos: ActivoDeLaPersona[];
  /// Asignaciones abiertas, y cuántas de ellas ya vencieron.
  tareasAbiertas: number;
  tareasVencidas: number;
  /// Asignaciones cerradas: lo que ya cumplió.
  tareasCerradas: number;
  /// Actas de aceptación firmadas.
  actasFirmadas: number;
  /// Accesos a sistemas con vigencia abierta.
  accesosVigentes: number;
  /// Grupos de interés a los que pertenece hoy. No incluye los derivados —«Todos»— porque
  /// esos no tienen filas: contarlos exigiría repetir acá la regla que los calcula.
  gruposVigentes: number;
}

export interface ResultadoResumen extends Resultado {
  resumen: ResumenDePersona | null;
}

const VACIO: ResumenDePersona = {
  activos: [],
  tareasAbiertas: 0,
  tareasVencidas: 0,
  tareasCerradas: 0,
  actasFirmadas: 0,
  accesosVigentes: 0,
  gruposVigentes: 0,
};

export async function resumenDePersona(personaId: number): Promise<ResultadoResumen> {
  const r = await ejecutar(async () => {
    await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const hoy = new Date();

    const [custodia, encarna, abiertas, cerradas, actas, accesos, grupos] = await Promise.all([
      prisma.activo.findMany({
        where: { personaId, activo: true },
        orderBy: { codigo: 'asc' },
        select: { codigo: true, nombre: true },
      }),
      prisma.activoPersona.findMany({
        where: { personaId, activo: { activo: true } },
        orderBy: { activo: { codigo: 'asc' } },
        select: { activo: { select: { codigo: true, nombre: true } } },
      }),
      prisma.asignacion.findMany({
        where: { personaId, estado: 'PENDIENTE' },
        select: { fechaLimite: true },
      }),
      prisma.asignacion.count({ where: { personaId, estado: { not: 'PENDIENTE' } } }),
      prisma.actaAceptacion.count({ where: { personaId } }),
      prisma.accesoPersona.count({ where: { personaId, hasta: null } }),
      prisma.miembroGrupoInteres.count({ where: { personaId, hasta: null } }),
    ]);

    const activos: ActivoDeLaPersona[] = [
      // Un activo sin código todavía no tiene ficha propia, así que no se lista: enlazar a
      // una URL que no existe es peor que no enlazar.
      ...custodia
        .filter((a) => a.codigo !== null)
        .map((a) => ({ codigo: a.codigo as string, nombre: a.nombre, vinculo: 'custodia' as const })),
      ...encarna
        .filter((v) => v.activo.codigo !== null)
        .map((v) => ({
          codigo: v.activo.codigo as string,
          nombre: v.activo.nombre,
          vinculo: 'encarna' as const,
        })),
    ];

    return {
      ok: true,
      mensaje: 'ok',
      resumen: {
        activos,
        tareasAbiertas: abiertas.length,
        // Vencida es «la fecha límite ya pasó y sigue abierta». Se cuenta acá y no en el
        // cliente para que la cifra no dependa del reloj del navegador de quien mira.
        tareasVencidas: abiertas.filter((a) => a.fechaLimite < hoy).length,
        tareasCerradas: cerradas,
        actasFirmadas: actas,
        accesosVigentes: accesos,
        gruposVigentes: grupos,
      },
    };
  });

  // `ejecutar` devuelve `Resultado`; el resumen viaja aparte para que un fallo de permiso no
  // se confunda con «esta persona no tiene nada».
  const conResumen = r as ResultadoResumen;
  return { ...r, resumen: r.ok ? (conResumen.resumen ?? VACIO) : null };
}
