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
export const defaultLoaders: WorkerLoaders = {
  'ai-worker': async () => {
    const { AIWorker } = await import('@intelliflow/ai-worker');
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

export async function main(): Promise<void> {
  const logger = pino({ name: 'combined-worker-main' });
  try {
    await startCombinedWorker({ loaders: defaultLoaders });
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
