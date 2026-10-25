/**
 * Heartbeat for the api's timer jobs (approval sweep, email bounce scan).
 *
 * With API_BACKGROUND_JOBS=off on the api and COMBINED_BACKGROUND_JOBS unset on
 * the combined worker, nobody runs the jobs and nothing notices. Each completed
 * tick therefore writes `now` to a Redis key both processes already reach (no
 * migration), and the health checks read it:
 *  - api GET /health/detailed
 *  - the combined worker's background-jobs health
 * report `degraded` (never 503) when a job has not ticked for 3x its interval.
 *
 * The heartbeat is read only when a health endpoint is requested. Nothing here
 * runs on a timer, so an idle api makes no outbound call because of it.
 *
 * Best effort: a Redis failure never fails a tick.
 */

import { approvalSweepIntervalFromEnv } from './agent/approval-sweep-scheduler';
import { bounceScanIntervalFromEnv } from './modules/email/bounce-scheduler';

export const HEARTBEAT_JOBS = ['approvalSweep', 'bounceScan'] as const;
export type HeartbeatJob = (typeof HEARTBEAT_JOBS)[number];

/** A job is stale once it has not ticked for this many of its intervals. */
export const HEARTBEAT_STALE_FACTOR = 3;

const KEY_PREFIX = 'ifc:background-jobs:heartbeat:';
const KEY_TTL_SECONDS = 7 * 24 * 60 * 60;

export type HeartbeatReads = Record<HeartbeatJob, number | null>;

export interface HeartbeatStore {
  /** Records that `job` finished a tick at `at` (epoch ms). */
  record(job: HeartbeatJob, at: number): Promise<void>;
  /** Last tick per job (epoch ms), null when never recorded. */
  read(): Promise<HeartbeatReads>;
  /** Closes the connection, if one is open. Safe to call twice; a later call reconnects. */
  close(): Promise<void>;
}

/** The slice of ioredis used here. */
export interface HeartbeatRedis {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  mget(...keys: string[]): Promise<Array<string | null>>;
  on(event: 'error' | 'end', listener: (error?: unknown) => void): unknown;
  disconnect(): void;
}

export type CreateHeartbeatRedis = (env: NodeJS.ProcessEnv) => Promise<HeartbeatRedis>;

async function defaultCreateRedis(env: NodeJS.ProcessEnv): Promise<HeartbeatRedis> {
  const IORedis = await import('ioredis');
  const RedisCtor = (IORedis.default ?? IORedis) as unknown as new (
    options: Record<string, unknown>
  ) => HeartbeatRedis;
  const client = new RedisCtor({
    host: env.REDIS_HOST,
    port: Number.parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(env.REDIS_DB || '0', 10),
    ...(env.REDIS_TLS === 'true' ? { tls: {} } : {}),
    lazyConnect: false,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    // connectTimeout stops applying once TCP is up; bound each command too, so a
    // Redis that accepts the connection but never answers cannot hang a write.
    commandTimeout: 2000,
    // Never reconnect on its own: with Redis down, ioredis would otherwise dial
    // forever after a single health request and keep an idle api awake. The
    // store builds a fresh client on the next read or record instead.
    retryStrategy: () => null,
  });
  // Without a listener an ioredis connection error would crash the process.
  client.on('error', () => undefined);
  return client;
}

/**
 * Redis-backed store, or null when Redis is not configured (REDIS_HOST unset),
 * in which case recording is a no-op and the check reports `unknown`. The
 * connection is created on first use, never at startup.
 */
export function createRedisHeartbeatStore(
  env: NodeJS.ProcessEnv,
  createRedis: CreateHeartbeatRedis = defaultCreateRedis
): HeartbeatStore | null {
  if (!env.REDIS_HOST) return null;
  let client: Promise<HeartbeatRedis> | undefined;
  const redis = () => {
    if (!client) {
      const created = createRedis(env);
      client = created;
      // A dropped connection is not revived by ioredis (retryStrategy is null);
      // forget it so the next call builds a fresh one.
      created.then((c) => c.on('end', () => forget(created))).catch(() => forget(created));
    }
    return client;
  };
  const forget = (which: Promise<HeartbeatRedis>) => {
    if (client === which) client = undefined;
  };
  /** Run `op` on the client; on failure drop and disconnect it so nothing keeps dialling. */
  const use = async <T>(op: (c: HeartbeatRedis) => Promise<T>): Promise<T> => {
    const which = redis();
    try {
      return await op(await which);
    } catch (error) {
      forget(which);
      (await which.catch(() => undefined))?.disconnect();
      throw error;
    }
  };

  return {
    async close() {
      const which = client;
      client = undefined;
      (await which?.catch(() => undefined))?.disconnect();
    },
    async record(job, at) {
      await use((c) => c.set(`${KEY_PREFIX}${job}`, String(at), 'EX', KEY_TTL_SECONDS));
    },
    async read() {
      const values = await use((c) => c.mget(...HEARTBEAT_JOBS.map((j) => KEY_PREFIX + j)));
      const reads = {} as HeartbeatReads;
      HEARTBEAT_JOBS.forEach((job, i) => {
        const parsed = Number(values[i]);
        reads[job] = values[i] !== null && Number.isFinite(parsed) ? parsed : null;
      });
      return reads;
    },
  };
}

let sharedStore: HeartbeatStore | null | undefined;

/** Process-wide store, created lazily on first use. */
export function getHeartbeatStore(env: NodeJS.ProcessEnv = process.env): HeartbeatStore | null {
  if (sharedStore === undefined) sharedStore = createRedisHeartbeatStore(env);
  return sharedStore;
}

/** Closes the shared store's connection (shutdown). A later use reconnects. */
export async function closeHeartbeatStore(): Promise<void> {
  await sharedStore?.close();
}

/** Test hook: forget the shared store. */
export function resetHeartbeatStore(): void {
  sharedStore = undefined;
}

export interface JobHeartbeatStatus {
  status: 'ok' | 'stale' | 'disabled';
  lastRunAt: string | null;
  intervalMs: number;
}

export interface BackgroundJobsHeartbeatCheck {
  /** `unknown`: nothing to judge by (no Redis, or Redis unreadable). Never degrades health. */
  status: 'ok' | 'degraded' | 'unknown';
  jobs?: Record<HeartbeatJob, JobHeartbeatStatus>;
  message?: string;
}

/** Interval per job; 0 when that job is disabled in this environment. */
export function heartbeatIntervals(env: NodeJS.ProcessEnv): Record<HeartbeatJob, number> {
  return {
    approvalSweep: approvalSweepIntervalFromEnv(env),
    bounceScan: bounceScanIntervalFromEnv(env),
  };
}

export interface EvaluateInput {
  now: number;
  reads: HeartbeatReads;
  intervals: Record<HeartbeatJob, number>;
  /** How long this process has been up; a job that never ticked gets this long to start. */
  uptimeMs: number;
}

/** Pure staleness rule: no tick within 3x the interval means degraded. */
export function evaluateHeartbeats({
  now,
  reads,
  intervals,
  uptimeMs,
}: EvaluateInput): BackgroundJobsHeartbeatCheck {
  const jobs = {} as Record<HeartbeatJob, JobHeartbeatStatus>;
  const stale: string[] = [];
  for (const job of HEARTBEAT_JOBS) {
    const intervalMs = intervals[job];
    const last = reads[job];
    const lastRunAt = last === null ? null : new Date(last).toISOString();
    if (intervalMs <= 0) {
      jobs[job] = { status: 'disabled', lastRunAt, intervalMs };
      continue;
    }
    const limit = intervalMs * HEARTBEAT_STALE_FACTOR;
    const silentFor = last === null ? uptimeMs : now - last;
    const isStale = silentFor > limit;
    jobs[job] = { status: isStale ? 'stale' : 'ok', lastRunAt, intervalMs };
    if (isStale) stale.push(job);
  }
  if (stale.length === 0) return { status: 'ok', jobs };
  return {
    status: 'degraded',
    jobs,
    message:
      `No tick from ${stale.join(', ')} for more than ${HEARTBEAT_STALE_FACTOR}x its interval: ` +
      'set COMBINED_BACKGROUND_JOBS=on on the combined worker, or API_BACKGROUND_JOBS=on on the api',
  };
}

export interface CheckOptions {
  env?: NodeJS.ProcessEnv;
  store?: HeartbeatStore | null;
  now?: () => number;
  uptimeMs?: () => number;
}

/** Reads the heartbeat and judges it. Called only from a health request. */
export async function checkBackgroundJobsHeartbeat({
  env = process.env,
  store = getHeartbeatStore(env),
  now = Date.now,
  uptimeMs = () => process.uptime() * 1000,
}: CheckOptions = {}): Promise<BackgroundJobsHeartbeatCheck> {
  if (!store) return { status: 'unknown', message: 'REDIS_HOST is not set; no heartbeat store' };
  let reads: HeartbeatReads;
  try {
    reads = await store.read();
  } catch (error) {
    return {
      status: 'unknown',
      message: `heartbeat unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return evaluateHeartbeats({
    now: now(),
    reads,
    intervals: heartbeatIntervals(env),
    uptimeMs: uptimeMs(),
  });
}
