# Events Worker Dockerfile
# @task IFC-163

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY apps/workers/events-worker/package.json ./apps/workers/events-worker/
COPY apps/workers/shared/package.json ./apps/workers/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY apps/workers/events-worker ./apps/workers/events-worker
COPY apps/workers/shared ./apps/workers/shared
COPY packages/db ./packages/db
COPY packages/domain ./packages/domain
COPY tsconfig*.json ./

# Build
RUN pnpm run build --filter=@intelliflow/events-worker

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/apps/workers/events-worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/workers/events-worker/package.json ./

# Set environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Health check port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

# Run worker
CMD ["node", "dist/main.js"]
