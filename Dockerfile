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

# `output: standalone` traces the application's imports but not the schema or the engine,
# and both are needed at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# The CLI tree, kept OUT of /app on purpose.
#
# This used to hand-pick `prisma`, `@prisma` and `dotenv` into /app/node_modules, and it
# did not work. Two failures, in order:
#
#   sh: prisma: not found          — npx resolves through node_modules/.bin, which was
#                                    never copied, so the binary did not exist.
#   Cannot find module 'effect'    — and once invoked directly, the CLI still died: in
#                                    Prisma 7 `@prisma/config` pulls c12, deepmerge-ts,
#                                    effect and empathic, and `prisma` pulls @prisma/dev,
#                                    @prisma/studio-core, mysql2 and postgres. Each has
#                                    its own tree.
#
# Adding those by hand is rebuilding, by hand, a dependency graph npm already resolved in
# package-lock.json — and every miss is a deploy that fails on the server. So the whole
# resolved tree is copied from `deps` instead. It costs image size; it cannot be
# incomplete.
#
# It lives in /opt/cli rather than /app so the runtime keeps the lean standalone tree and
# the application can never accidentally import a devDependency that is absent in a
# future build.
#
# `lib` is here because prisma/seed.ts imports ../lib/sgsi/riesgos — `generarRiesgos` is
# the single writer of the four derived decimals, so the seed cannot run without it. That
# is why the seed had to be run from a throwaway container the first time.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules /opt/cli/node_modules
# Overlaid on top of the deps tree, and the order matters. `deps` runs npm ci WITHOUT
# prisma.config.ts, so the @prisma/client postinstall never produces a client — which is
# the same silent skip the deps stage comment warns about, and why `builder` runs
# `prisma generate` explicitly. Without this line the seed dies on
# `Cannot find module '.prisma/client/default'`.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma /opt/cli/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma /opt/cli/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts /opt/cli/prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/lib /opt/cli/lib
COPY --from=builder --chown=nextjs:nodejs /app/package.json /opt/cli/package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json /opt/cli/tsconfig.json

USER nextjs
EXPOSE 3004

CMD ["node", "server.js"]
