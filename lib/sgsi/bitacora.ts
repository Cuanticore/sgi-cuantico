import 'server-only';

// lib/sgsi/bitacora.ts
//
// Every change records author, date, previous value and REASON. Nothing is physically
// deleted; a baja is logical and leaves its trace here.
//
// The log is append-only and `registroId` is text so one table spans every entity. It is
// written inside the same transaction as the change itself: an audit trail that can be
// written separately is an audit trail that can be missing.

import type { Prisma } from '@prisma/client';

/// The subset of the client both `prisma` and a transaction expose. Actions pass the
/// transaction so the entry cannot survive a rolled-back change.
type Escritor = Pick<Prisma.TransactionClient, 'bitacora'>;

export interface Cambio {
  tabla: string;
  registroId: string;
  campo: string;
  anterior: unknown;
  nuevo: unknown;
  /// Required for exceptions: a degradation or frequency off the parameterisation, a
  /// threat added or removed, an overridden treatment. Optional for ordinary edits.
  motivo?: string | null;
}

/// Renders a value for the log. Nulls become the word, so a blank cell in the trail is
/// never ambiguous between "was empty" and "was not recorded".
function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '(vacío)';
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/// Writes one row per field that actually changed. Unchanged fields are skipped: a log
/// full of no-ops is a log nobody reads.
export async function registrar(
  escritor: Escritor,
  usuario: string,
  cambios: Cambio[],
): Promise<number> {
  const reales = cambios.filter((c) => texto(c.anterior) !== texto(c.nuevo));
  if (reales.length === 0) return 0;

  await escritor.bitacora.createMany({
    data: reales.map((c) => ({
      tabla: c.tabla,
      registroId: c.registroId,
      campo: c.campo,
      valorAnterior: texto(c.anterior),
      valorNuevo: texto(c.nuevo),
      motivo: c.motivo ?? null,
      usuario,
    })),
  });

  return reales.length;
}

/// A logical delete: the row stays, its flag flips, and the reason is mandatory because
/// "why is this asset gone" is the question an auditor always asks.
export async function registrarBaja(
  escritor: Escritor,
  usuario: string,
  tabla: string,
  registroId: string,
  motivo: string,
): Promise<void> {
  await escritor.bitacora.create({
    data: {
      tabla,
      registroId,
      campo: 'baja lógica',
      valorAnterior: 'vigente',
      valorNuevo: 'dado de baja',
      motivo,
      usuario,
    },
  });
}

export async function registrarAlta(
  escritor: Escritor,
  usuario: string,
  tabla: string,
  registroId: string,
): Promise<void> {
  await escritor.bitacora.create({
    data: {
      tabla,
      registroId,
      campo: 'alta',
      valorAnterior: null,
      valorNuevo: 'creado',
      usuario,
    },
  });
}
