# Dockerfile
#
# Three things here exist because of Prisma, and each one was a real failure mode:
#
# 1. `prisma/` is copied BEFORE `npm ci`. The @prisma/client postinstall runs
#    `prisma generate`, and with no schema in the image it skips SILENTLY — the builder
#    then reuses that node_modules and the build imports a client that was never
#    generated.
# 2. `openssl` and `libc6-compat` are installed. The Prisma query engine is linked
#    against them and alpine ships neither; without them the engine does not start, and
#    the failure surfaces at the first query rather than at build time.
# 3. `prisma generate` runs explicitly in the builder anyway. Depending on a postinstall
#    hook to produce a build artefact is depending on npm's script policy staying the
#    same.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3004

RUN apk add --no-cache openssl libc6-compat
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# `output: standalone` traces the application's imports but not the schema, the
# migrations or the Prisma CLI. All three are needed on the server: the schema and the
# engine at runtime, and the migrations because the deploy applies them before the
# container starts serving.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# prisma.config.ts imports `dotenv/config`, and dotenv is a devDependency. In the
# container the variables already come from the compose env_file, but the import is
# evaluated all the same when the CLI loads the config — without this the migration step
# fails on a missing module, at deploy time, on the server.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv

USER nextjs
EXPOSE 3004

CMD ["node", "server.js"]
