import { PrismaClient, Prisma } from '@prisma/client';

// Global instance for development hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
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
 */
const createPrismaClient = () => {
  const client = new PrismaClient({
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

  return client;
};

// Use global instance in development to prevent connection exhaustion
export const prisma = globalThis.__prisma ?? createPrismaClient();

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
  return prisma.$transaction(fn);
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
  return prisma.$transaction(fn, options);
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

// Re-export Prisma types and client
export { PrismaClient, Prisma };

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
export function validateEmbedding(
  embedding: VectorEmbedding,
  expectedDimensions = 1536
): boolean {
  return Array.isArray(embedding) && embedding.length === expectedDimensions;
}

/**
 * Format embedding for pgvector SQL
 */
export function formatEmbeddingForPgVector(embedding: VectorEmbedding): string {
  return `[${embedding.join(',')}]`;
}
