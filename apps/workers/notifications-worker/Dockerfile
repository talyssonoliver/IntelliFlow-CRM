# Notifications Worker Dockerfile
# @task IFC-163

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY apps/workers/notifications-worker/package.json ./apps/workers/notifications-worker/
COPY apps/workers/shared/package.json ./apps/workers/shared/
COPY packages/domain/package.json ./packages/domain/
COPY packages/adapters/package.json ./packages/adapters/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY apps/workers/notifications-worker ./apps/workers/notifications-worker
COPY apps/workers/shared ./apps/workers/shared
COPY packages/domain ./packages/domain
COPY packages/adapters ./packages/adapters
COPY tsconfig*.json ./

# Build
RUN pnpm run build --filter=@intelliflow/notifications-worker

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/apps/workers/notifications-worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/workers/notifications-worker/package.json ./

# Set environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV ENABLE_EMAIL=true
ENV ENABLE_SMS=false
ENV ENABLE_WEBHOOK=false
ENV ENABLE_PUSH=false

# Health check port
EXPOSE 3102

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3102/health || exit 1

# Run worker
CMD ["node", "dist/main.js"]
