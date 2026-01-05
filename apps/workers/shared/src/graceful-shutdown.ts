/**
 * Graceful Shutdown Handler
 *
 * Handles process signals for graceful worker shutdown.
 * Pattern from: apps/ai-worker/src/index.ts (lines 148-181)
 *
 * @module worker-shared/graceful-shutdown
 * @task IFC-163
 */

import pino from 'pino';

// ============================================================================
// Types
// ============================================================================

export interface GracefulShutdownOptions {
  /** Timeout in milliseconds before forcing exit */
  timeoutMs: number;
  /** Logger instance */
  logger?: pino.Logger;
  /** Callback to run before exit (optional) */
  onShutdownStart?: () => void;
  /** Callback after shutdown completes (optional) */
  onShutdownComplete?: () => void;
}

export interface ShutdownHandler {
  /** Remove signal handlers and cleanup */
  unregister: () => void;
  /** Check if shutdown is in progress */
  isShuttingDown: () => boolean;
  /** Trigger shutdown programmatically */
  triggerShutdown: (reason?: string) => Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Setup graceful shutdown handlers for worker process
 *
 * Handles:
 * - SIGINT (Ctrl+C)
 * - SIGTERM (Docker/Kubernetes shutdown)
 * - uncaughtException (Crash recovery)
 * - unhandledRejection (Promise rejection)
 *
 * @example
 * ```typescript
 * const shutdown = setupGracefulShutdown(
 *   async () => {
 *     await worker.stop();
 *     await database.close();
 *   },
 *   { timeoutMs: 30000, logger }
 * );
 *
 * // Later, if needed:
 * shutdown.unregister();
 * ```
 */
export function setupGracefulShutdown(
  shutdownFn: () => Promise<void>,
  options: GracefulShutdownOptions
): ShutdownHandler {
  const { timeoutMs, onShutdownStart, onShutdownComplete } = options;
  const logger =
    options.logger ||
    pino({
      name: 'graceful-shutdown',
      level: 'info',
    });

  let isShuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  const handleSignal = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received, initiating graceful shutdown');
    onShutdownStart?.();

    // Set timeout for forced exit
    const forceExitTimeout = setTimeout(() => {
      logger.error(
        { timeoutMs },
        'Shutdown timeout exceeded, forcing exit'
      );
      process.exit(1);
    }, timeoutMs);

    try {
      await shutdownFn();
      clearTimeout(forceExitTimeout);

      logger.info('Graceful shutdown completed successfully');
      onShutdownComplete?.();
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimeout);
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error during graceful shutdown'
      );
      process.exit(1);
    }
  };

  const handleUncaughtException = (error: Error): void => {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        type: 'uncaughtException',
      },
      'Uncaught exception, initiating emergency shutdown'
    );

    // Don't wait for graceful shutdown on uncaught exception
    process.exit(1);
  };

  const handleUnhandledRejection = (reason: unknown): void => {
    logger.error(
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        type: 'unhandledRejection',
      },
      'Unhandled promise rejection, initiating emergency shutdown'
    );

    // Don't wait for graceful shutdown on unhandled rejection
    process.exit(1);
  };

  // Signal handlers
  const sigintHandler = () => {
    shutdownPromise = handleSignal('SIGINT');
  };
  const sigtermHandler = () => {
    shutdownPromise = handleSignal('SIGTERM');
  };

  // Register handlers
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);

  logger.debug('Graceful shutdown handlers registered');

  return {
    unregister: () => {
      process.off('SIGINT', sigintHandler);
      process.off('SIGTERM', sigtermHandler);
      process.off('uncaughtException', handleUncaughtException);
      process.off('unhandledRejection', handleUnhandledRejection);
      logger.debug('Graceful shutdown handlers unregistered');
    },
    isShuttingDown: () => isShuttingDown,
    triggerShutdown: async (reason?: string) => {
      if (isShuttingDown) {
        return shutdownPromise || Promise.resolve();
      }
      logger.info({ reason }, 'Programmatic shutdown triggered');
      shutdownPromise = handleSignal('PROGRAMMATIC');
      return shutdownPromise;
    },
  };
}

/**
 * Create a shutdown handler that runs multiple cleanup functions in sequence
 */
export function createCompositeShutdown(
  cleanupFns: Array<{ name: string; fn: () => Promise<void> }>,
  logger?: pino.Logger
): () => Promise<void> {
  const log =
    logger ||
    pino({
      name: 'composite-shutdown',
      level: 'info',
    });

  return async () => {
    for (const { name, fn } of cleanupFns) {
      try {
        log.info({ step: name }, 'Running cleanup step');
        await fn();
        log.info({ step: name }, 'Cleanup step completed');
      } catch (error) {
        log.error(
          {
            step: name,
            error: error instanceof Error ? error.message : String(error),
          },
          'Cleanup step failed, continuing with next step'
        );
      }
    }
  };
}
