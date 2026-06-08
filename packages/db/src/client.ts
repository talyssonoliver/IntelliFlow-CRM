import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fieldEncryptionExtension, deriveKey } from './field-encryption.js';
import { instrumentOperation } from './query-budget/extension.js';

// ---------------------------------------------------------------------------
// M4 prompt encryption — ACTIVE via bespoke $extends (AES-256-GCM)
// ---------------------------------------------------------------------------
// `prisma-field-encryption@1.6.x` was incompatible with Prisma 7.x.
// We now ship a bespoke extension in packages/db/src/field-encryption.ts that
// mirrors the AES-256-GCM pattern from DurableAuditLogAdapter.ts.
//
// Key: PRISMA_FIELD_ENCRYPTION_KEY — 32-byte base64 string.
// Encrypted fields: ChainVersion.prompt, ChainVersion.systemPrompt, WebhookEndpoint.secret
// ---------------------------------------------------------------------------
if (process.env['NODE_ENV'] === 'production' && !process.env['PRISMA_FIELD_ENCRYPTION_KEY']) {
  throw new Error(
    '[M4] PRISMA_FIELD_ENCRYPTION_KEY must be set in production — field-level ' +
      'encryption is ACTIVE via the bespoke $extends extension. ' +
      "Generate a key: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
  );
}

// Global instance for development hot-reload
declare global {
  var __prisma: unknown;
}

/**
 * Query performance metrics interface
 * Used for tracking database query performance against KPIs (<20ms target)
 */
export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  params?: unknown;
}

/**
 * Query performance tracker for benchmarking
 */
export class QueryPerformanceTracker {
  private metrics: QueryMetrics[] = [];
  private enabled: boolean;

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  record(query: string, duration: number, params?: unknown): void {
    if (!this.enabled) return;
    this.metrics.push({
      query,
      duration,
      timestamp: new Date(),
      params,
    });
  }

  getMetrics(): QueryMetrics[] {
    return [...this.metrics];
  }

  getAverageQueryTime(): number {
    if (this.metrics.length === 0) return 0;
    const total = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / this.metrics.length;
  }

  getP95QueryTime(): number {
    if (this.metrics.length === 0) return 0;
    const sorted = [...this.metrics].sort((a, b) => a.duration - b.duration);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index]?.duration ?? 0;
  }

  getSlowQueries(thresholdMs = 20): QueryMetrics[] {
    return this.metrics.filter((m) => m.duration > thresholdMs);
  }

  clear(): void {
    this.metrics = [];
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }
}

// Global performance tracker instance
export const queryPerformanceTracker = new QueryPerformanceTracker(
  process.env.TRACK_QUERY_PERFORMANCE === 'true'
);

/**
 * Creates a Prisma client with performance logging and type-safe configuration
 * Prisma 7 requires a driver adapter for database connections
 */
const createPrismaClient = () => {
  // Cap the node-postgres pool size per process. On serverless (Vercel/Lambda)
  // each function instance opens its own pool, so the default (max: 10) lets a
  // handful of concurrent instances exhaust Supabase's pooler (EMAXCONNSESSION,
  // pool_size 15) — which surfaces as 500s on every authenticated DB query and
  // gets users signed out. Keep it tiny on serverless; allow larger pools for
  // long-lived workers via DATABASE_POOL_MAX. See docs/audit/auth-session-db-pool-audit.md.
  //
  // Canonical name is DATABASE_POOL_MAX (unified across validate-env + system.router,
  // issue #316); the legacy DB_POOL_MAX is kept as a backward-compatible fallback so
  // existing worker env keeps working. An explicit value overrides the default.
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const poolMaxEnv = process.env.DATABASE_POOL_MAX || process.env.DB_POOL_MAX;
  let poolMax: number;
  if (poolMaxEnv) {
    poolMax = Number.parseInt(poolMaxEnv, 10);
  } else {
    poolMax = isServerless ? 1 : 10;
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: poolMax,
  });

  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });

  // Attach query performance logging in development
  if (process.env.NODE_ENV === 'development' || process.env.TRACK_QUERY_PERFORMANCE === 'true') {
    client.$on('query' as never, (e: Prisma.QueryEvent) => {
      const duration = Number(e.duration);
      queryPerformanceTracker.record(e.query, duration, e.params);

      // Log slow queries (> 20ms) as warnings
      if (duration > 20) {
        console.warn(`[Prisma Slow Query] ${duration}ms: ${e.query.substring(0, 100)}...`);
      }
    });
  }

  // M4 ENCRYPTION WIRING — ACTIVE via bespoke field-encryption extension.
  // Encrypts ChainVersion.prompt, ChainVersion.systemPrompt, WebhookEndpoint.secret
  // transparently on write; decrypts on read.
  const encKey = process.env['PRISMA_FIELD_ENCRYPTION_KEY'];
  const encrypted = encKey
    ? client.$extends(fieldEncryptionExtension({ key: deriveKey(encKey) }))
    : // In non-production environments without a key, skip encryption so
      // development / test runs continue to function.
      client;

  // ADR-053: N+1 query-budget detector. Composed LAST (outermost) so it counts
  // every logical operation — including those on encrypted models. No-op unless
  // a request/job seeds a budget context (see query-budget/context). Built here
  // (client.ts imports the generated client at the correct `../generated` depth
  // for bundling); the per-op logic lives in query-budget/extension.ts.
  return encrypted.$extends(
    Prisma.defineExtension({
      name: 'query-budget',
      // `as any` on the query value mirrors fieldEncryptionExtension — it keeps
      // the object-literal shape so defineExtension infers a clean extension and
      // the model API on `prisma` is preserved (no degradation to `unknown`).
      query: {
        $allOperations: (params: unknown) => instrumentOperation(params as never),
      } as any,
    })
  );
};

// Type alias capturing the extended client shape.
// Downstream code that already has `as unknown as` casts will continue to work.
export type EncryptedPrismaClient = ReturnType<typeof createPrismaClient>;

// Use global instance in development to prevent connection exhaustion
export const prisma: EncryptedPrismaClient =
  (globalThis.__prisma as EncryptedPrismaClient | undefined) ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

/**
 * Transaction context type - excludes non-transactional methods
 */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Utility for type-safe transactions with automatic rollback on error
 */
export async function withTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  // Cast via `as any` because the $extends() wrapper changes the transaction
  // callback parameter type; at runtime the extended and base clients expose
  // the same model APIs inside a transaction.

  return (prisma as any).$transaction(fn);
}

/**
 * Utility for type-safe transactions with custom options
 */
export async function withTransactionOptions<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  return (prisma as any).$transaction(fn, options);
}

/**
 * Execute a raw SQL query with timing metrics
 * Useful for pgvector operations that aren't natively supported by Prisma
 */
export async function executeRawWithTiming<T>(
  sql: Prisma.Sql
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await prisma.$queryRaw<T>(sql);
  const duration = performance.now() - start;

  queryPerformanceTracker.record('$queryRaw', duration, sql.values);

  return { result, duration };
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latency: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latency: performance.now() - start,
    };
  } catch (error) {
    return {
      connected: false,
      latency: performance.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Graceful shutdown with connection cleanup
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

// Re-export Prisma types and client from generated path
export { PrismaClient, Prisma } from '../generated/prisma/client';

// Type exports for pgvector operations
// These help with type-safe vector embedding queries

/**
 * Vector similarity search result type
 */
export interface VectorSearchResult<T> {
  item: T;
  similarity: number;
}

/**
 * Vector embedding type (1536 dimensions for OpenAI embeddings)
 */
export type VectorEmbedding = number[];

/**
 * Validate embedding dimensions (OpenAI uses 1536)
 */
export function validateEmbedding(embedding: VectorEmbedding, expectedDimensions = 1536): boolean {
  return Array.isArray(embedding) && embedding.length === expectedDimensions;
}

/**
 * Format embedding for pgvector SQL
 */
export function formatEmbeddingForPgVector(embedding: VectorEmbedding): string {
  return `[${embedding.join(',')}]`;
}
