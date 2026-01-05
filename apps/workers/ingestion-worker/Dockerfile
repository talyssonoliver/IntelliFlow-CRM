# Ingestion Worker Dockerfile
# @task IFC-163

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY apps/workers/ingestion-worker/package.json ./apps/workers/ingestion-worker/
COPY apps/workers/shared/package.json ./apps/workers/shared/
COPY apps/ai-worker/package.json ./apps/ai-worker/
COPY packages/db/package.json ./packages/db/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY apps/workers/ingestion-worker ./apps/workers/ingestion-worker
COPY apps/workers/shared ./apps/workers/shared
COPY apps/ai-worker ./apps/ai-worker
COPY packages/db ./packages/db
COPY tsconfig*.json ./

# Build
RUN pnpm run build --filter=@intelliflow/ingestion-worker

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install system dependencies for OCR (if enabled)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY --from=builder /app/apps/workers/ingestion-worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/workers/ingestion-worker/package.json ./

# Set environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV ENABLE_TEXT_EXTRACTION=true
ENV ENABLE_OCR=false
ENV ENABLE_EMBEDDINGS=false

# Health check port
EXPOSE 3101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3101/health || exit 1

# Run worker
CMD ["node", "dist/main.js"]
