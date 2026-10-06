import type { PrismaClient } from '@intelliflow/db';
import { getCorrelationId } from '../../tracing/correlation';

type DatabaseCheck = {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
};

type HealthContext = {
  prisma: PrismaClient;
};

type DependencyCheck = {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
};

/**
 * Probes for dependencies outside the database. Optional: when absent (local
 * dev and tests without Redis) the checks are skipped, so behaviour is unchanged.
 */
export type HealthProbes = {
  /** Resolves to 'PONG' when Redis is reachable and authenticated. */
  redisPing?: () => Promise<string>;
  /** Number of workers consuming each queue the API produces to. */
  queueConsumers?: () => Promise<Record<string, number>>;
};

const PROBE_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)),
      PROBE_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getRedisConnectivity(redisPing: () => Promise<string>): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const reply = await withTimeout(redisPing(), 'Redis ping');
    if (reply !== 'PONG') {
      return {
        status: 'error',
        latency: Date.now() - start,
        error: `Unexpected ping reply: ${reply}`,
      };
    }
    return { status: 'ok', latency: Date.now() - start };
  } catch (error) {
    return {
      status: 'error',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

type QueueConsumersCheck = {
  status: 'ok' | 'degraded' | 'error';
  consumers?: Record<string, number>;
  withoutConsumers?: string[];
  error?: string;
};

async function getQueueConsumers(
  queueConsumers: () => Promise<Record<string, number>>
): Promise<QueueConsumersCheck> {
  try {
    const consumers = await withTimeout(queueConsumers(), 'Queue consumer count');
    const withoutConsumers = Object.entries(consumers)
      .filter(([, count]) => count === 0)
      .map(([name]) => name);
    return { status: withoutConsumers.length ? 'degraded' : 'ok', consumers, withoutConsumers };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown queue error',
    };
  }
}

function getRuntimeMetadata() {
  return {
    timestamp: new Date().toISOString(),
    correlationId: getCorrelationId(),
    version: process.env.npm_package_version ?? '0.1.0',
    environment: process.env.NODE_ENV ?? 'development',
  };
}

async function getDatabaseConnectivity(prisma: PrismaClient): Promise<DatabaseCheck> {
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    if (dbLatency > 20) {
      console.warn(`[Health] Database latency high: ${dbLatency}ms (target: <20ms)`);
    }

    return {
      status: 'ok',
      latency: dbLatency,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

export function getPingHealth() {
  return {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    correlationId: getCorrelationId(),
  };
}

export async function getDetailedHealth(
  { prisma }: HealthContext,
  options?: { includeDatabaseStats?: boolean },
  probes: HealthProbes = {}
) {
  const startTime = Date.now();
  const [database, redis, queues] = await Promise.all([
    getDatabaseConnectivity(prisma),
    probes.redisPing ? getRedisConnectivity(probes.redisPing) : undefined,
    probes.queueConsumers ? getQueueConsumers(probes.queueConsumers) : undefined,
  ]);
  const totalLatency = Date.now() - startTime;

  // A queue with no consumer is "degraded": jobs pile up and nothing reports it.
  const healthy =
    database.status === 'ok' && redis?.status !== 'error' && (!queues || queues.status === 'ok');

  const result = {
    status: healthy ? ('healthy' as const) : ('degraded' as const),
    latency: totalLatency,
    checks: {
      database,
      ...(redis ? { redis } : {}),
      ...(queues ? { queues } : {}),
    },
    ...getRuntimeMetadata(),
  };

  if (!options?.includeDatabaseStats) {
    return result;
  }

  return {
    ...result,
    databaseStats: await getDatabaseStats({ prisma }),
  };
}

/**
 * Ready only when the API can serve: the database answers AND Redis (queues,
 * rate limiter, cache) answers. Until 2026-10-05 this checked only the
 * database, so the API reported ready for months with Redis gone (#789).
 */
export async function getReadinessHealth({ prisma }: HealthContext, probes: HealthProbes = {}) {
  const [database, redis] = await Promise.all([
    getDatabaseConnectivity(prisma),
    probes.redisPing ? getRedisConnectivity(probes.redisPing) : undefined,
  ]);

  if (database.status === 'ok' && redis?.status !== 'error') {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }

  const errors = [
    database.status === 'error' ? (database.error ?? 'Database check failed') : undefined,
    redis?.status === 'error' ? `Redis: ${redis.error}` : undefined,
  ].filter(Boolean);

  return {
    ready: false,
    timestamp: new Date().toISOString(),
    error: errors.join('; ') || 'Readiness check failed',
  };
}

export function getLivenessHealth() {
  return {
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    correlationId: getCorrelationId(),
    pid: process.pid,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
  };
}

export async function getDatabaseStats({ prisma }: HealthContext) {
  try {
    const prismaWithMetrics = prisma as PrismaClient & {
      $metrics?: { json: () => Promise<unknown> };
    };
    const metricsProvider = prismaWithMetrics.$metrics;
    if (!metricsProvider?.json) {
      return {
        status: 'unsupported' as const,
        timestamp: new Date().toISOString(),
        error:
          'Prisma metrics are not available in this Prisma client build. Enable Prisma metrics and regenerate.',
      };
    }

    const metrics = await metricsProvider.json();

    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      metrics,
    };
  } catch (error) {
    return {
      status: 'error' as const,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Failed to fetch database metrics',
    };
  }
}
