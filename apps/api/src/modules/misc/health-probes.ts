/**
 * Live dependency probes for /health/ready and /health/detailed (#789).
 *
 * One dedicated Redis client (lazy, no offline queue, one retry) so a dead
 * Redis fails the probe fast instead of hanging it. Queue consumer counts use
 * BullMQ's worker registry: a queue the API produces to with zero consumers
 * means jobs pile up unprocessed, which is how ai-worker and the workers sat
 * dead from June to October 2026 without anything noticing.
 */

import { QUEUE_NAMES } from '@intelliflow/platform/queues';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { loadBullMQ } from '../../lib/load-bullmq';
import type { HealthProbes } from './health.service';

/** Queues the API enqueues to, each of which needs a running consumer. */
export const API_PRODUCED_QUEUES = [
  QUEUE_NAMES.AI_SCORING,
  QUEUE_NAMES.AI_PREDICTION,
  QUEUE_NAMES.AI_ENRICHMENT,
  QUEUE_NAMES.AI_ENTITY_INSIGHT,
  QUEUE_NAMES.AI_REPLY_DRAFT,
  QUEUE_NAMES.AI_ACCOUNT_SCORING,
  QUEUE_NAMES.AI_TAG_SUGGESTION,
  QUEUE_NAMES.EMAIL_NOTIFICATIONS,
  'intelliflow-contact-embed',
] as const;

type RedisClient = { status: string; connect(): Promise<unknown>; ping(): Promise<string> };
type ConsumerCounter = { getWorkersCount(): Promise<number> };

export type HealthProbeDeps = {
  createRedis: (options: Record<string, unknown>) => Promise<RedisClient>;
  createQueue: (name: string, options: Record<string, unknown>) => Promise<ConsumerCounter>;
  env: NodeJS.ProcessEnv;
};

function connectionOptions(env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    host: requiredProdEnv('REDIS_HOST', env.REDIS_HOST, 'localhost'),
    port: Number.parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(env.REDIS_DB || '0', 10),
    ...(env.REDIS_TLS === 'true' ? { tls: {} } : {}),
  };
}

/**
 * Build the probes, or none when Redis is not configured outside production
 * (local dev and tests keep the database-only checks).
 */
export function buildHealthProbes(deps: HealthProbeDeps): HealthProbes {
  const { env } = deps;
  if (!env.REDIS_HOST && env.NODE_ENV !== 'production') return {};

  const base = connectionOptions(env);
  let redis: Promise<RedisClient> | undefined;
  const queues = new Map<string, Promise<ConsumerCounter>>();

  return {
    redisPing: async () => {
      redis ??= deps.createRedis({
        ...base,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      // Without an offline queue a command on a closed stream fails at once,
      // so open (or reopen) the connection before pinging.
      const client = await redis;
      if (client.status === 'wait' || client.status === 'end') await client.connect();
      return client.ping();
    },
    queueConsumers: async () => {
      const counts = await Promise.all(
        API_PRODUCED_QUEUES.map(async (name) => {
          if (!queues.has(name)) {
            queues.set(name, deps.createQueue(name, { connection: base }));
          }
          const queue = await queues.get(name)!;
          return [name, await queue.getWorkersCount()] as const;
        })
      );
      return Object.fromEntries(counts);
    },
  };
}

let probes: HealthProbes | undefined;

/** Log a probe client's connection errors at most once a minute per client. */
function throttledErrorLog(label: string): (err: unknown) => void {
  let last = 0;
  return (err) => {
    const now = Date.now();
    if (now - last < 60_000) return;
    last = now;
    console.warn(`[health] ${label} error:`, err instanceof Error ? err.message : err);
  };
}

/** Process-wide probes for the HTTP server. */
export function getHealthProbes(): HealthProbes {
  probes ??= buildHealthProbes({
    createRedis: async (options) => {
      const IORedis = await import('ioredis');
      const RedisCtor = IORedis.default ?? IORedis;
      const client = new (RedisCtor as unknown as new (
        o: Record<string, unknown>
      ) => RedisClient & {
        on(event: 'error', fn: (err: unknown) => void): void;
      })(options);
      client.on('error', throttledErrorLog('redis probe'));
      return client as RedisClient;
    },
    createQueue: async (name, options) => {
      const { Queue } = await loadBullMQ();
      const queue = new Queue(name, options as unknown as import('bullmq').QueueOptions);
      queue.on('error', throttledErrorLog(`queue probe ${name}`));
      return queue;
    },
    env: process.env,
  });
  return probes;
}
