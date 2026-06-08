# Notifications Worker Dockerfile
# @task IFC-163
# syntax=docker/dockerfile:1.7-labs

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# One COPY --parents per glob: empty glob fails with a clear error, not a hash miss
COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents apps/*/package.json           ./
COPY --parents apps/workers/*/package.json   ./
COPY --parents packages/*/package.json       ./
COPY --parents tools/*/package.json          ./

# Install all dependencies (populates virtual store, skip lifecycle scripts)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Builder
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy full virtual store + per-app/per-pkg symlink layer from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages

# Copy full source tree (.dockerignore excludes node_modules, dist, etc.)
COPY . .

# Re-link workspace symlinks against the copied virtual store
RUN pnpm install --frozen-lockfile --offline --ignore-scripts

# Generate Prisma client (adapters depends on @prisma/client at runtime)
RUN pnpm --filter db db:generate

# Build workspace packages in dependency order
RUN pnpm --filter domain build
RUN pnpm --filter validators build
RUN pnpm --filter webhooks build
RUN pnpm --filter platform build
RUN pnpm --filter db build
RUN pnpm --filter observability build
RUN pnpm --filter worker-shared build
RUN pnpm --filter application build
RUN pnpm --filter adapters build

# Build the notifications worker
RUN pnpm --filter notifications-worker build

# Stage 3: Runner
FROM node:22-alpine AS production

# Set environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV ENABLE_EMAIL=true
ENV ENABLE_SMS=false
ENV ENABLE_WEBHOOK=false
ENV ENABLE_PUSH=false

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/packages ./packages
COPY --from=builder --chown=worker:nodejs /app/apps/workers ./apps/workers
COPY --from=builder --chown=worker:nodejs /app/apps/workers/notifications-worker/dist ./apps/workers/notifications-worker/dist
COPY --from=builder --chown=worker:nodejs /app/apps/workers/notifications-worker/node_modules ./apps/workers/notifications-worker/node_modules
COPY --from=builder --chown=worker:nodejs /app/apps/workers/notifications-worker/package.json ./apps/workers/notifications-worker/
COPY --from=builder --chown=worker:nodejs /app/package.json ./

# Switch to non-root user
USER worker

# Health check port
EXPOSE 3102

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3102/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run worker
CMD ["node", "apps/workers/notifications-worker/dist/main.js"]
