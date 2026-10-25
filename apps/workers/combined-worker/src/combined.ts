/**
 * Combined worker runtime
 *
 * Starts ai-worker, events-worker and ingestion-worker inside ONE Node process
 * so production can run a single Railway service instead of three. Each worker
 * stays runnable on its own through its own `main`; this module only composes
 * their existing `BaseWorker` instances.
 *
 * What it owns (and the individual workers would otherwise each do for
 * themselves):
 *  - one health endpoint (aggregates every worker's state)
 *  - one graceful-shutdown path (stops every worker, then exits once)
 *
 * What it works around:
 *  - `BaseWorker.start()` opens its own health server on HEALTH_PORT. Three
 *    workers on one fixed port would collide, so the per-worker servers are
 *    moved to an ephemeral port (HEALTH_PORT=0) and only the combined server
 *    listens on the real port.
 *  - `BaseWorker.start()` (and ai-worker's OpenTelemetry module on import)
 *    register their own SIGINT/SIGTERM/uncaught handlers, and each of them calls
 *    `process.exit` as soon as its own cleanup is done, which would cut the
 *    other workers off mid-drain. The combined handlers are installed FIRST,
 *    before any worker is loaded, and registrations of those events by anything
 *    else are dropped while the workers start. ai-worker's OpenTelemetry flush
 *    is therefore run explicitly through the `onShutdown` hook.
 *
 * @module combined-worker/combined
 */

import http from 'node:http';
import pino from 'pino';

// ============================================================================
// Types
// ============================================================================

export const WORKER_NAMES = ['ai-worker', 'events-worker', 'ingestion-worker'] as const;
export type WorkerName = (typeof WORKER_NAMES)[number];

/** The slice of `BaseWorker` the combined runtime depends on. */
export interface ManagedWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): { state: string };
  /** Same dependency checks the standalone health server reports (Redis, ...). */
  checkHealth?(): Promise<Record<string, ComponentCheck>>;
}

export interface ComponentCheck {
  status: 'ok' | 'degraded' | 'error';
  message?: string;
}

export type WorkerLoaders = Record<WorkerName, () => Promise<ManagedWorker>>;

export interface CombinedWorkerConfig {
  workers: WorkerName[];
  /** Real health port (the one Railway / Docker probe). */
  healthPort: number;
  /** Keep running when a worker fails to start (health reports 503). */
  allowPartial: boolean;
  shutdownTimeoutMs: number;
}

export interface CombinedWorkerOptions {
  loaders: WorkerLoaders;
  env?: NodeJS.ProcessEnv;
  logger?: pino.Logger;
  /** Runs after the workers stopped (e.g. flush OpenTelemetry). Errors are logged only. */
  onShutdown?: () => Promise<void>;
  /** Injected so tests do not terminate the runner. */
  exit?: (code: number) => void;
}

export type WorkerHealthState = 'running' | 'failed' | string;

export interface CombinedHealth {
  status: 'ok' | 'degraded' | 'draining';
  workers: Record<
    string,
    { state: WorkerHealthState; error?: string; checks?: Record<string, ComponentCheck> }
  >;
}

export interface CombinedWorkerHandle {
  /** Port the combined health server is listening on. */
  readonly healthPort: number;
  getHealth(): Promise<CombinedHealth>;
  /** The single shutdown path; idempotent. Resolves once the process would exit. */
  shutdown(reason: string): Promise<void>;
}

// ============================================================================
// Config
// ============================================================================

const DEFAULT_HEALTH_PORT = 3100;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

function parsePositiveInt(raw: string | undefined, fallback: number, allowZero = false): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`Invalid numeric value "${raw}"`);
  }
  return value;
}

/**
 * Read the combined-worker settings from the environment.
 *
 * - COMBINED_WORKERS: comma list of workers to run (default: all three)
 * - COMBINED_HEALTH_PORT / HEALTH_PORT / PORT: combined health port (default 3100)
 * - COMBINED_ALLOW_PARTIAL=true: keep running if one worker fails to start
 * - COMBINED_SHUTDOWN_TIMEOUT_MS: hard cap on graceful shutdown (default 30000)
 */
export function loadCombinedConfig(env: NodeJS.ProcessEnv): CombinedWorkerConfig {
  const rawWorkers = env.COMBINED_WORKERS?.trim();
  const workers = rawWorkers
    ? rawWorkers
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    : [...WORKER_NAMES];

  const unknown = workers.filter((name) => !(WORKER_NAMES as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown worker(s) in COMBINED_WORKERS: ${unknown.join(', ')} (valid: ${WORKER_NAMES.join(', ')})`
    );
  }
  if (workers.length === 0) {
    throw new Error('COMBINED_WORKERS selects no workers');
  }

  const healthPort = parsePositiveInt(
    env.COMBINED_HEALTH_PORT ?? env.HEALTH_PORT ?? env.PORT,
    DEFAULT_HEALTH_PORT,
    true
  );

  return {
    workers: [...new Set(workers)] as WorkerName[],
    healthPort,
    allowPartial: env.COMBINED_ALLOW_PARTIAL === 'true',
    shutdownTimeoutMs: parsePositiveInt(
      env.COMBINED_SHUTDOWN_TIMEOUT_MS,
      DEFAULT_SHUTDOWN_TIMEOUT_MS
    ),
  };
}

// ============================================================================
// Process signal handling
// ============================================================================

const PROCESS_EVENTS = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'] as const;
type ProcessEvent = (typeof PROCESS_EVENTS)[number];
type Listener = (...args: unknown[]) => void;
/** Events only the combined runtime may handle (beforeExit: OTel-style exit hooks). */
const FILTERED_EVENTS: readonly unknown[] = [...PROCESS_EVENTS, 'beforeExit'];

/**
 * Drop every registration of the filtered events made by anyone else until the
 * returned function is called. Call it once the combined handlers are installed
 * and keep it for the whole life of the process: workers import libraries
 * lazily (ingestion-worker loads ai-worker on its first job, which registers
 * OpenTelemetry's SIGTERM handler), so a startup-only filter is not enough.
 */
function suppressProcessHandlers(): () => void {
  const target = process as unknown as Record<string, (...args: unknown[]) => unknown>;
  const methods = ['on', 'addListener', 'once', 'prependListener', 'prependOnceListener'];
  const originals = methods.map((method) => [method, target[method]] as const);
  for (const [method, original] of originals) {
    target[method] = function (event: unknown, ...rest: unknown[]) {
      if (FILTERED_EVENTS.includes(event)) return process;
      return original.call(process, event, ...rest);
    };
  }
  return () => {
    for (const [method, original] of originals) target[method] = original;
  };
}

// ============================================================================
// Health server
// ============================================================================

function statusCode(health: CombinedHealth): number {
  return health.status === 'ok' ? 200 : 503;
}

function createHealthServer(getHealth: () => Promise<CombinedHealth>): http.Server {
  return http.createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (path === '/health/live') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'alive' }));
      return;
    }

    if (path === '/health' || path === '/health/ready' || path === '/health/detailed') {
      const health = await getHealth();
      res.writeHead(statusCode(health), { 'content-type': 'application/json' });
      res.end(JSON.stringify(health));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

// ============================================================================
// Runtime
// ============================================================================

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Start the configured workers and the combined health server.
 *
 * The combined signal handlers are installed before any worker is loaded. A
 * signal during startup stops whatever has started so far. Rejects (after
 * stopping anything already started) when a worker fails to start, unless
 * COMBINED_ALLOW_PARTIAL=true.
 */
export async function startCombinedWorker(
  options: CombinedWorkerOptions
): Promise<CombinedWorkerHandle> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? pino({ name: 'combined-worker' });
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const config = loadCombinedConfig(env);

  // Per-worker health servers move to an ephemeral port; the combined server
  // owns the real one. Must happen before any worker module is loaded because
  // events/ingestion build their config at import time.
  env.HEALTH_PORT = '0';

  const running = new Map<WorkerName, ManagedWorker>();
  const failures = new Map<WorkerName, string>();
  /** The load+start of the worker being started; never rejects. */
  let inflight: Promise<void> | null = null;
  /** Loaded and being started (or failed to start) but not in `running`. */
  let pending: { name: WorkerName; worker: ManagedWorker } | null = null;
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;
  let healthServer: http.Server | null = null;
  let restoreProcessHandlers: (() => void) | null = null;
  const ownListeners: Array<[ProcessEvent, Listener]> = [];

  /** Give the process-level events back; runs on every exit path. */
  const release = () => {
    for (const [event, listener] of ownListeners) process.off(event, listener);
    ownListeners.length = 0;
    restoreProcessHandlers?.();
    restoreProcessHandlers = null;
  };

  const runShutdownHook = async () => {
    try {
      await options.onShutdown?.();
    } catch (error) {
      logger.error({ error: errorMessage(error) }, 'Shutdown hook failed');
    }
  };

  const stopAll = async (): Promise<boolean> => {
    const results = await Promise.allSettled(
      [...running.entries()].map(async ([name, worker]) => {
        try {
          await worker.stop();
        } catch (error) {
          logger.error({ worker: name, error: errorMessage(error) }, 'Worker failed to stop');
          throw error;
        }
      })
    );
    return results.every((result) => result.status === 'fulfilled');
  };

  const checkWorker = async (worker: ManagedWorker): Promise<Record<string, ComponentCheck>> => {
    if (!worker.checkHealth) return {};
    try {
      return await worker.checkHealth();
    } catch (error) {
      return { health: { status: 'error', message: errorMessage(error) } };
    }
  };

  const getHealth = async (): Promise<CombinedHealth> => {
    const workers: CombinedHealth['workers'] = {};
    await Promise.all(
      config.workers.map(async (name) => {
        const failure = failures.get(name);
        if (failure !== undefined) {
          workers[name] = { state: 'failed', error: failure };
          return;
        }
        const worker = running.get(name);
        if (!worker) {
          workers[name] = { state: 'stopped' };
          return;
        }
        const checks = await checkWorker(worker);
        const broken = Object.values(checks).some((check) => check.status === 'error');
        const state = worker.getStatus().state;
        // A worker whose Redis/provider check fails is not healthy even though
        // BaseWorker still reports state 'running'.
        workers[name] = { state: broken && state === 'running' ? 'unhealthy' : state, checks };
      })
    );
    const allRunning = config.workers.every((name) => workers[name]?.state === 'running');
    let status: CombinedHealth['status'] = allRunning ? 'ok' : 'degraded';
    if (shuttingDown) status = 'draining';
    return { status, workers };
  };

  const shutdown = (reason: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    logger.info({ reason }, 'Combined worker shutting down');

    shutdownPromise = (async () => {
      const forceExit = setTimeout(() => {
        logger.error({ timeoutMs: config.shutdownTimeoutMs }, 'Shutdown timeout, forcing exit');
        release();
        exit(1);
      }, config.shutdownTimeoutMs);
      forceExit.unref?.();

      // A signal during startup: let the in-flight load/start finish (it cannot
      // be cancelled, and would otherwise create consumers after we stopped),
      // then stop everything that started, including that worker. The timer
      // above caps the wait.
      await inflight;
      if (pending) {
        // It loaded but did not finish starting; release what it opened.
        await pending.worker.stop().catch(() => undefined);
        pending = null;
      }
      const clean = await stopAll();
      if (healthServer) await closeServer(healthServer);
      await runShutdownHook();
      clearTimeout(forceExit);

      release();
      logger.info({ clean }, 'Combined worker stopped');
      exit(clean ? 0 : 1);
    })();
    return shutdownPromise;
  };

  const abortStartup = async (): Promise<void> => {
    await stopAll();
    if (healthServer) await closeServer(healthServer);
    await runShutdownHook();
    release();
  };

  // Install the combined handlers first, then lock everyone else out of these
  // events while the workers load and start.
  const onSignal = (signal: string) => () => {
    void shutdown(signal);
  };
  const onFatal = (kind: string) => (error: unknown) => {
    logger.error({ kind, error: errorMessage(error) }, 'Fatal process error, exiting');
    exit(1);
  };
  const handlers: Array<[ProcessEvent, Listener]> = [
    ['SIGINT', onSignal('SIGINT')],
    ['SIGTERM', onSignal('SIGTERM')],
    ['uncaughtException', onFatal('uncaughtException')],
    ['unhandledRejection', onFatal('unhandledRejection')],
  ];
  for (const [event, listener] of handlers) {
    process.on(event, listener);
    ownListeners.push([event, listener]);
  }
  restoreProcessHandlers = suppressProcessHandlers();

  for (const name of config.workers) {
    if (shuttingDown) break;
    const outcome: { failed: boolean; error?: unknown } = { failed: false };
    const run = (async () => {
      const worker = await options.loaders[name]();
      // A signal during the load: do not start what would only be torn down.
      if (shuttingDown) return;
      pending = { name, worker };
      await worker.start();
      running.set(name, worker);
      pending = null;
      logger.info({ worker: name }, 'Worker started');
    })();
    inflight = run.then(
      () => undefined,
      (error: unknown) => {
        outcome.failed = true;
        outcome.error = error;
      }
    );
    await inflight;
    if (!outcome.failed) continue;

    // A signal that arrived mid-start: shutdown() releases the half-started
    // worker; the failure is the expected result, not a startup error.
    if (shuttingDown) break;
    const message = errorMessage(outcome.error);
    logger.error({ worker: name, error: message }, 'Worker failed to start');
    failures.set(name, message);
    // BaseWorker leaves its Redis connection and health server open when
    // start() throws part-way; release them (best effort).
    await (pending as { worker: ManagedWorker } | null)?.worker.stop().catch(() => undefined);
    pending = null;

    if (!config.allowPartial) {
      await abortStartup();
      throw new Error(`Worker ${name} failed to start: ${message}`, { cause: outcome.error });
    }
  }

  if (shuttingDown) {
    // Interrupted during startup: shutdown() owns the rest, including the exit.
    await shutdownPromise;
    return { healthPort: 0, getHealth, shutdown };
  }

  healthServer = createHealthServer(getHealth);
  let healthPort: number;
  try {
    healthPort = await listen(healthServer, config.healthPort);
  } catch (error) {
    await abortStartup();
    throw new Error(`Combined health server failed to listen: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  logger.info(
    { healthPort, workers: [...config.workers], failed: [...failures.keys()] },
    'Combined worker ready'
  );

  return { healthPort, getHealth, shutdown };
}
