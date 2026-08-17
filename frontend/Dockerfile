FROM node:22-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
ARG RAG_API_URL=http://localhost:8000
ENV RAG_API_URL=$RAG_API_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Next's file tracer currently omits the ESM helpers from pnpm's virtual store,
# even though the standalone server loads them at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/esm ./node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/esm
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
