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
    // `--tsconfig tsconfig.scripts.json` mapea `server-only` a un módulo vacío. Sin eso, el
    // seed revienta con `Cannot find module 'server-only'`: la cadena de imports pasa por
    // `lib/sgsi/bitacora.ts`, que empieza con `import 'server-only'`, y ese paquete sólo lo
    // sabe resolver el runtime de Next, no un `tsx` pelado. En un script de Node —servidor por
    // definición— la marca no protege nada. Ver el encabezado de tsconfig.scripts.json.
    seed: 'tsx --tsconfig tsconfig.scripts.json prisma/seed.ts',
  },
});
