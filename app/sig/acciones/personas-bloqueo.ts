'use server';

// app/sig/acciones/personas-bloqueo.ts
//
// **Bloquear y desbloquear una cuenta del Directorio** (REQ-SIG-15 §6, P19 a P25).
//
// Es la acción más destructiva que la aplicación tiene: deja a una persona sin poder trabajar.
//
// ── Por qué vive en su propio archivo y no en `personas-edicion.ts` ───────────────────────
//
// Aquél se declara «el único camino de escritura de la PERTENENCIA de una persona», y el
// bloqueo no es pertenencia: exige otro permiso (`personas:bloquear`, no
// `personas:administrar`), sale a Microsoft Graph antes de tocar la base, y su transacción no
// genera ni una asignación. Meterlo ahí habría mezclado en un mismo archivo la única acción
// que sale a la red con la única que no puede salir, que es justo la distinción que la regla
// de oro del repositorio protege.
//
// ── La red y la transacción, en ese orden y separadas ─────────────────────────────────────
//
// **Ninguna llamada a Graph va dentro de una transacción de Prisma** (P10 de REQ-SIG-13). Una
// transacción abierta mientras se espera a un servicio externo mantiene tomados los candados
// de las filas todo lo que dure la latencia, y cuando el servicio no responde, el pool se
// termina. Acá además hay una segunda razón: Graph no participa del rollback. Si se anidaran,
// un fallo de la base «desharía» sólo la mitad que puede deshacer.
//
// El orden es: se decide → se llama a Graph → se comprueba que los DOS pasos quedaron hechos
// → recién entonces se abre la transacción. Si Graph falla, la base no se toca. Si la
// transacción falla después de que Graph respondió bien, eso **se reporta con esas palabras**:
// la cuenta quedó bloqueada en Azure y el censo no lo refleja, y quien mira la pantalla tiene
// que enterarse ahora, no mañana.
//
// ── Lo que este bloqueo NO hace ───────────────────────────────────────────────────────────
//
// **P22 · no cierra, no anula y no reasigna ninguna tarea.** Cuenta los pendientes abiertos y
// los dice; reasignarlos es `reasignarPendientesDe`, que exige motivo y la llama quien decide.
// Cerrarlas automáticamente inventaría cumplimiento; anularlas en silencio borraría carga real
// que alguien tiene que asumir. Es la regla R9, ya escrita y probada.
//
// **P23 · no es la desvinculación.** El bloqueo contiene hoy (A.5.11, A.8.3); la desvinculación
// es el trámite de REQ-SIG-09 (`lib/sig/ciclos.ts`) con revocación de accesos, paz y salvo y
// obligaciones subsistentes. Fundirlos haría que un bloqueo preventivo por sospecha —del que
// la persona puede volver limpia el lunes— arrancara una desvinculación que nadie pidió.

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import {
  bloqueoHabilitado,
  decidirBloqueo,
  decidirDesbloqueo,
  fraseDeDesincronizacion,
  fraseDeRedIncompleta,
  laRedQuedoCompleta,
  VARIABLE_DE_BLOQUEO,
  type Operacion,
} from '@/lib/sgsi/bloqueo';
import { oidsDelGrupoSig } from '@/lib/sgsi/directorio';
import { aplicarEnGraph, leerCuenta } from '@/lib/sgsi/graph-bloqueo';
import { explicarFallo } from '@/lib/sgsi/graph-fallo';
import {
  autorConPermiso,
  DatoInvalidoError,
  ejecutar,
  exigirId,
  type Resultado,
} from '@/app/sgsi/acciones/sesion';

export interface ResultadoBloqueo extends Resultado {
  /// **Graph hizo su parte y la base no.** No es un `ok: false` cualquiera: la cuenta cambió
  /// de verdad en el Directorio. La pantalla lo pinta distinto porque exige una acción
  /// distinta —reintentar o corregir a mano—, y sobre todo porque el estado del mundo ya
  /// cambió aunque el mensaje empiece diciendo que algo falló.
  desincronizado: boolean;
  /// Los pendientes abiertos que quedaron. **No se tocaron** (P22): se cuentan y se dicen.
  pendientes: number;
}

const NADA = { desincronizado: false, pendientes: 0 };

/// **P19 y P24 · el bloqueo.** Cuatro pasos y ninguno es opcional.
export async function bloquearCuenta(
  personaId: number,
  motivo: string,
  correoEscrito: string,
): Promise<ResultadoBloqueo> {
  return operar('BLOQUEO', personaId, motivo, correoEscrito);
}

/// **P24 · el desbloqueo, por el mismo camino.** Mismo permiso y mismo motivo obligatorio.
/// Sin esto, el clic equivocado no tiene remedio dentro de la aplicación y hay que salir a
/// buscar a quien administre Azure.
export async function desbloquearCuenta(
  personaId: number,
  motivo: string,
  correoEscrito: string,
): Promise<ResultadoBloqueo> {
  return operar('DESBLOQUEO', personaId, motivo, correoEscrito);
}

async function operar(
  operacion: Operacion,
  personaId: number,
  motivo: string,
  correoEscrito: string,
): Promise<ResultadoBloqueo> {
  return ejecutar<ResultadoBloqueo>(async () => {
    // **`personas:bloquear`, no `personas:administrar`.** Hoy los concede el mismo grupo, y el
    // vocabulario los separa igual: bloquear una cuenta no es lo mismo que editar un teléfono.
    const autor = await autorConPermiso('personas:bloquear');
    exigirId(personaId, 'la persona');

    // **P25 · sin la variable no se intenta nada.** El botón no se dibuja, pero la acción es
    // invocable directamente, y sin los dos permisos concedidos en Azure lo que vendría sería
    // un 403 que se lee como que la aplicación está rota.
    if (!bloqueoHabilitado(process.env as Record<string, string | undefined>)) {
      return {
        ok: false,
        mensaje:
          `El bloqueo de cuentas está deshabilitado en este entorno (${VARIABLE_DE_BLOQUEO} no ` +
          'está en «true»). Se habilita cuando el registro de la aplicación tenga concedidos ' +
          'los permisos User.EnableDisableAccount.All y User.RevokeSessions.All, de APLICACIÓN ' +
          'y con consentimiento de administrador. No se cambió nada.',
        ...NADA,
      };
    }

    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, oid: true, nombre: true, correo: true, activa: true },
    });
    if (!persona) throw new DatoInvalidoError('Esa persona no está en el censo.');

    // Las dos consultas de contexto, **antes de escribir nada y fuera de toda transacción**.
    // En paralelo porque no dependen una de la otra, y con `Promise.all` seguro porque las dos
    // devuelven `ResultadoGraph` en vez de rechazar: un 403 en una no aborta la otra.
    //
    // El grupo del SIG sólo se pregunta al bloquear: habilitar una cuenta nunca deja el grupo
    // en cero, y una consulta que no cambia ninguna decisión es una consulta que no se hace.
    const [cuenta, miembros] = await Promise.all([
      leerCuenta(persona.oid),
      operacion === 'BLOQUEO' ? oidsDelGrupoSig() : Promise.resolve(null),
    ]);

    const decidir = operacion === 'BLOQUEO' ? decidirBloqueo : decidirDesbloqueo;
    const decision = decidir(
      persona,
      {
        autor,
        cuenta: cuenta.ok ? cuenta.datos : null,
        miembrosDelGrupoSig: miembros === null ? null : miembros.ok ? miembros.datos : null,
      },
      motivo,
      correoEscrito,
    );
    if (!decision.ok) {
      // Cuando la negativa vino de una consulta que falló, se dice **por qué falló**: la
      // frase de la decisión explica la regla, y `explicarFallo` explica la causa real —una
      // variable sin definir, un secreto vencido, un permiso faltante— que es lo que alguien
      // necesita para arreglarlo. Sin esto se volvería a la época en que la pantalla adivinaba.
      const causa = !cuenta.ok
        ? explicarFallo(cuenta.fallo)
        : miembros !== null && !miembros.ok
          ? explicarFallo(miembros.fallo)
          : null;
      return {
        ok: false,
        mensaje: causa === null ? decision.mensaje : `${decision.mensaje} ${causa}`,
        ...NADA,
      };
    }

    // ── La RED. Fuera de la transacción, y completa o nada ──────────────────────────────
    const red = await aplicarEnGraph(operacion, persona.oid);
    if (!laRedQuedoCompleta(operacion, red.hechos)) {
      return {
        ok: false,
        mensaje: `${fraseDeRedIncompleta(operacion, red.hechos)} ${
          red.fallo === null ? '' : explicarFallo(red.fallo)
        }`.trim(),
        // **Un paso hecho ya es una desincronización.** Si la cuenta quedó deshabilitada y las
        // sesiones no se revocaron, en Azure cambió algo y en el censo no: la pantalla tiene
        // que pintarlo como lo que exige atención, no como un error del que no quedó rastro.
        // Con cero pasos hechos no cambió nada en ninguna parte, y ahí sí es un error a secas.
        desincronizado: red.hechos.length > 0,
        pendientes: 0,
      };
    }

    const activa = operacion === 'DESBLOQUEO';

    // ── La TRANSACCIÓN. Ya sin red adentro ──────────────────────────────────────────────
    try {
      await prisma.$transaction(async (tx) => {
        await tx.persona.update({ where: { id: persona.id }, data: { activa } });
        await registrar(tx, autor, [
          {
            tabla: 'persona',
            // El CORREO, como el resto de los campos de la persona: es la llave con la que la
            // aplicación la identifica, y una sola consulta a la bitácora cuenta su historia
            // completa.
            registroId: persona.correo,
            // **No es «baja lógica».** Ese campo lo escribe la sincronización y es uno de los
            // que `resumirCorrida` cuenta (P28): usarlo acá haría que un bloqueo a mano se
            // leyera en la franja como una inactivación de la última corrida del Directorio.
            campo: 'cuenta del Directorio',
            anterior: activa ? 'bloqueada' : 'habilitada',
            nuevo: activa ? 'habilitada' : 'bloqueada · sesiones revocadas',
            motivo: motivo.trim(),
          },
        ]);
      });
    } catch (error) {
      // **El estado que no se puede deshacer.** Revertir el bloqueo automáticamente sería
      // volver a habilitar una cuenta que alguien acaba de decidir bloquear, quizá por un
      // incidente en curso. Así que se dice entero y se deja la decisión donde corresponde.
      console.error('[sig] Graph aplicó el cambio y la transacción falló', error);
      return {
        ok: false,
        desincronizado: true,
        pendientes: 0,
        mensaje: fraseDeDesincronizacion(operacion, persona.correo),
      };
    }

    // **P22 · se cuentan DESPUÉS y no se tocan.** Después, porque el número que se informa
    // tiene que ser el que queda; y no se tocan, porque cerrarlas inventaría cumplimiento y
    // anularlas borraría carga real que alguien tiene que asumir (R9).
    const pendientes = await prisma.asignacion.count({
      where: { personaId: persona.id, estado: 'PENDIENTE' },
    });

    revalidatePath('/sig/personas');
    revalidatePath('/sig/tablero-tareas');

    const partes: string[] = [];
    if (operacion === 'BLOQUEO') {
      partes.push(
        `Se bloqueó la cuenta de ${persona.nombre}: se deshabilitó en el Directorio y se le ` +
          'revocaron las sesiones abiertas, así que el acceso se cortó ya y no dentro de una hora.',
      );
      if (pendientes > 0) {
        partes.push(
          `Quedan ${pendientes} pendiente(s) abierto(s) a su nombre. El bloqueo no los cierra, ` +
            'no los anula y no los reasigna: hay que reasignarlos con motivo, o siguen exigidos ' +
            'a alguien que no puede entrar.',
        );
      } else {
        partes.push('No tenía pendientes abiertos: no hay carga que reasignar.');
      }
      partes.push(
        'El bloqueo NO es la desvinculación: si la persona se va de la organización, el ' +
          'trámite con revocación de accesos, paz y salvo y obligaciones subsistentes sigue ' +
          'pendiente.',
      );
    } else {
      partes.push(
        `Se desbloqueó la cuenta de ${persona.nombre}: quedó habilitada en el Directorio y ` +
          'activa en el censo.',
      );
      if (pendientes > 0) {
        partes.push(`Vuelve con ${pendientes} pendiente(s) abierto(s) a su nombre.`);
      }
    }

    return { ok: true, mensaje: partes.join(' '), desincronizado: false, pendientes };
  });
}
