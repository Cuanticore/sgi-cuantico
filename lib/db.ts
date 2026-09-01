// lib/db.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Lazy on purpose: the client is built on first property access, not at import time.
// `next build` collects page configuration without a database, so throwing for a missing
// DATABASE_URL at module load would fail the build on a machine that never needed to
// connect. The error still surfaces on the first real query.
function crearCliente(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está configurada. Añadila a .env: ' +
        'postgresql://sgi:...@localhost:5437/sgi_sgsi?schema=public',
    );
  }
  const cliente = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  blindarTransacciones(cliente);
  return cliente;
}

/// Reprise única, transparente, de una transacción que Prisma declaró perdida
/// (P2028: "Transaction not found / closed / obtained before disconnecting").
///
/// En desarrollo el módulo del servidor se recompila con cada cambio y una petición que
/// cayó en el instante del HMR puede ejecutarse sobre una transacción de la generación
/// anterior. La transacción aborted — nunca parcialmente aplicada — así que reintentar
/// la misma función es seguro, y una sola vez basta. En producción no interfiere: la
/// misma causa no existe y el reintento se dispara solo si P2028 aparece de todas formas.
function blindarTransacciones(cliente: PrismaClient): void {
  const original = cliente.$transaction.bind(cliente);
  cliente.$transaction = (async (ops: unknown, ...rest: unknown[]) => {
    try {
      // `typeof ops === 'function'` es la variante con callback; la variante con
      // array de PrismaPromise no es re-ejecutable (son sentencias preparadas), y ahí
      // sí se re-lanza.
      return await original(ops as never, ...(rest as never[]));
    } catch (error) {
      const esP2028 =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2028';
      if (!esP2028 || typeof ops !== 'function') throw error;
      console.warn('[sgi] P2028 — transacción perdida; se reintenta una vez.');
      await new Promise((r) => setTimeout(r, 250));
      return await original(ops as never, ...(rest as never[]));
    }
  }) as typeof cliente.$transaction;
}

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every reload. Cache the client on globalThis instead.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The singleton lives in the module binding, and `globalThis` is only how it survives a
// hot reload. That order matters: the previous version returned a fresh client instead of
// caching whenever NODE_ENV was 'production', and since `prisma` below is a Proxy that
// calls this from its `get` trap, production built one PrismaClient — one pg pool — per
// property access. Measured against the production build: ~16 connections per request,
// none released, so `max_connections` was exhausted by the fourth page load and every
// screen answered P2037 TooManyConnections. Development never showed it, because there
// the globalThis branch did cache.
let instancia: PrismaClient | undefined;

function obtener(): PrismaClient {
  if (instancia) return instancia;
  instancia = globalForPrisma.prisma ?? crearCliente();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = instancia;
  return instancia;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_destino, propiedad: string | symbol) {
    return obtener()[propiedad as keyof PrismaClient];
  },
  has(_destino, propiedad: string | symbol) {
    return propiedad in obtener();
  },
});
