// lib/db.ts
import { PrismaClient } from '@prisma/client';
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
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every reload. Cache the client on globalThis instead.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function obtener(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const cliente = crearCliente();
    if (process.env.NODE_ENV === 'production') return cliente;
    globalForPrisma.prisma = cliente;
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_destino, propiedad: string | symbol) {
    return obtener()[propiedad as keyof PrismaClient];
  },
  has(_destino, propiedad: string | symbol) {
    return propiedad in obtener();
  },
});
