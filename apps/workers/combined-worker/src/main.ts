/**
 * Combined worker entrypoint
 *
 * Runs ai-worker, events-worker and ingestion-worker in a single Node process.
 * See ./combined.ts for the lifecycle rules; each worker is still runnable on
 * its own through its own package.
 *
 * Environment: the union of the three workers' variables, plus
 * COMBINED_WORKERS, COMBINED_HEALTH_PORT, COMBINED_ALLOW_PARTIAL and
 * COMBINED_SHUTDOWN_TIMEOUT_MS (see loadCombinedConfig).
 *
 * @module combined-worker/main
 */

import pino from 'pino';
import { startCombinedWorker, type ManagedWorker, type WorkerLoaders } from './combined';

export { startCombinedWorker, loadCombinedConfig, WORKER_NAMES } from './combined';
export type {
  CombinedWorkerHandle,
  CombinedHealth,
  ManagedWorker,
  WorkerLoaders,
} from './combined';

/**
 * Loaders import each worker lazily. ai-worker must be imported before the
 * others: its entry loads env files and the OpenTelemetry auto-instrumentation,
 * which have to run before BullMQ and the other libraries are required.
 */
let aiWorkerLoaded = false;

export const defaultLoaders: WorkerLoaders = {
  'ai-worker': async () => {
    const { AIWorker } = await import('@intelliflow/ai-worker');
    aiWorkerLoaded = true;
    return new AIWorker() as ManagedWorker;
  },
  'events-worker': async () => {
    const { eventsWorker } = await import('@intelliflow/events-worker');
    return eventsWorker as ManagedWorker;
  },
  'ingestion-worker': async () => {
    const { ingestionWorker } = await import('@intelliflow/ingestion-worker');
    return ingestionWorker as ManagedWorker;
  },
};

/**
 * ai-worker's own SIGTERM handler flushes OpenTelemetry before exiting. The
 * combined runtime owns the signal handlers, so the flush runs here instead.
 */
export async function flushOpenTelemetry(
  isLoaded: () => boolean = isAiWorkerLoaded
): Promise<void> {
  // Importing ai-worker only to find out whether it ran would start OpenTelemetry
  // just to shut it down, so check the module cache first.
  if (!isLoaded()) return;
  const { getSDKInstance, shutdownOpenTelemetry } = await import('@intelliflow/ai-worker');
  // Whenever an SDK exists, however ai-worker got loaded (ingestion-worker
  // imports it lazily on its first job, even without the ai-worker loader).
  if (getSDKInstance()) await shutdownOpenTelemetry(getSDKInstance());
}

/** True when ai-worker was loaded by our loader or by another worker's lazy import. */
export function isAiWorkerLoaded(): boolean {
  if (aiWorkerLoaded) return true;
  if (typeof require === 'undefined') return false;
  try {
    return require.resolve('@intelliflow/ai-worker') in require.cache;
  } catch {
    return false;
  }
}

export async function main(): Promise<void> {
  const logger = pino({ name: 'combined-worker-main' });
  try {
    await startCombinedWorker({ loaders: defaultLoaders, onShutdown: flushOpenTelemetry });
    logger.info('Combined worker is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start combined worker'
    );
    process.exit(1);
  }
}

// Run if executed directly (CommonJS modules cannot use top-level await - TS error 1309)
if (require.main === module) {
  void main();
}
