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
  options?: { includeDatabaseStats?: boolean }
) {
  const startTime = Date.now();
  const database = await getDatabaseConnectivity(prisma);
  const totalLatency = Date.now() - startTime;

  const result = {
    status: database.status === 'ok' ? ('healthy' as const) : ('degraded' as const),
    latency: totalLatency,
    checks: {
      database,
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

export async function getReadinessHealth({ prisma }: HealthContext) {
  const database = await getDatabaseConnectivity(prisma);

  if (database.status === 'ok') {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    ready: false,
    timestamp: new Date().toISOString(),
    error: database.error ?? 'Readiness check failed',
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
