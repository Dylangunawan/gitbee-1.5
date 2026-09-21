# syntax=docker.io/docker/dockerfile:1

FROM node:24-alpine AS base
# pnpm via corepack, version pinned by packageManager in package.json
RUN corepack enable

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN pnpm install --frozen-lockfile


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/frontend/node_modules ./apps/frontend/node_modules
COPY . .

ARG NEXT_PUBLIC_BACKEND_API
ENV NEXT_PUBLIC_BACKEND_API=$NEXT_PUBLIC_BACKEND_API

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter gitbee-frontend build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# In a workspace the standalone server keeps repo-relative paths:
# server at apps/frontend/server.js needs .next/static + public beside it.
COPY --from=builder /repo/apps/frontend/public ./apps/frontend/public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /repo/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/frontend/.next/static ./apps/frontend/.next/static

USER nextjs

EXPOSE 8000

ENV PORT=8000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/frontend/server.js"]
