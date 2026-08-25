// prisma.config.ts
// Prisma 7 configuration. Connection URLs live here, not in schema.prisma.
//
// The Prisma CLI does not read .env on its own, so dotenv is imported
// explicitly. The Next.js runtime loads .env by itself and never uses this
// file — see lib/db.ts for the client-side adapter.

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
