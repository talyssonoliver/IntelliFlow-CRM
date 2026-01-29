/**
 * Base Worker Abstract Class
 *
 * Abstract base class for all IntelliFlow workers providing:
 * - Lifecycle management (start, stop, restart)
 * - Health check HTTP server
 * - BullMQ queue connection
 * - Graceful shutdown handling
 * - Telemetry integration
 *
 * Pattern from:
 * - apps/ai-worker/src/index.ts (lifecycle)
 * - packages/platform/src/queues/queue-factory.ts (queue management)
 *
 * @module worker-shared/base-worker
 * @task IFC-163
 */

import { Job } from 'bullmq';
import pino from 'pino';
import type { WorkerConfig } from './worker-config';
import { loadWorkerConfig } from './worker-config';
import { QueueConnector } from './queue-connector';
import { HealthServer, createDefaultHealthProvider, type HealthProvider } from './health-server';
import { setupGracefulShutdown, createCompositeShutdown, type ShutdownHandler } from './graceful-shutdown';
import type { WorkerState, WorkerStatus, ComponentHealth } from './types';

// ============================================================================
// Types
// ============================================================================

export interface BaseWorkerOptions {
  /** Worker name (used for logging & metrics) */
  name: string;
  /** Configuration override (default: load from env) */
  config?: Partial<WorkerConfig>;
  /** Queue names this worker will process */
  queues: string[];
}

// ============================================================================
// Abstract Base Worker
// ============================================================================

export abstract class BaseWorker<TJobData = unknown, TJobResult = unknown> {
  protected readonly name: string;
  protected readonly config: WorkerConfig;
  protected readonly logger: pino.Logger;
  protected readonly queueConnector: QueueConnector;
  protected readonly queueNames: string[];

  private healthServer: HealthServer | null = null;
  private shutdownHandler: ShutdownHandler | null = null;
  private state: WorkerState = 'stopped';
  private startedAt: Date | null = null;
  private processedJobs = 0;
  private failedJobs = 0;
  private activeJobs = 0;

  constructor(options: BaseWorkerOptions) {
    this.name = options.name;
    this.queueNames = options.queues;

    // Load configuration
    const baseConfig = loadWorkerConfig(options.name);
    this.config = { ...baseConfig, ...options.config };

    // Setup logger
    this.logger = pino({
      name: this.name,
      level: this.config.telemetry.logLevel,
      transport:
        this.config.telemetry.environment === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    });

    // Setup queue connector
    this.queueConnector = new QueueConnector({
      redis: this.config.redis,
      queue: this.config.queue,
      logger: this.logger,
    });
  }

  // ============================================================================
  // Abstract Methods (to be implemented by subclasses)
  // ============================================================================

  /**
   * Called when worker starts, before processing begins
   * Use for initializing resources, registering handlers, etc.
   */
  protected abstract onStart(): Promise<void>;

  /**
   * Called when worker stops, after processing stops
   * Use for cleanup, releasing resources, etc.
   */
  protected abstract onStop(): Promise<void>;

  /**
   * Process a single job
   * This is the main job processing logic
   */
  protected abstract processJob(job: Job<TJobData>): Promise<TJobResult>;

  /**
   * Get additional health check dependencies
   * Override to add custom dependency checks
   */
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    return {};
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the worker
   *
   * 1. Initialize observability
   * 2. Connect to Redis
   * 3. Start health check server
   * 4. Setup graceful shutdown
   * 5. Call onStart()
   * 6. Start processing jobs
   */
  async start(): Promise<void> {
    if (this.state === 'running') {
      this.logger.warn('Worker is already running');
      return;
    }

    this.state = 'starting';
    this.logger.info({ worker: this.name }, 'Starting worker');

    try {
      // 1. Connect to Redis
      await this.queueConnector.connect();

      // 2. Create workers for each queue
      for (const queueName of this.queueNames) {
        this.queueConnector.createWorker<TJobData, TJobResult>(
          queueName,
          async (job) => {
            const result = await this.handleJob(job);
            return result;
          }
        );
      }

      // 3. Start health server
      await this.startHealthServer();

      // 4. Setup graceful shutdown
      this.setupShutdown();

      // 5. Call subclass initialization
      await this.onStart();

      // 6. Update state
      this.state = 'running';
      this.startedAt = new Date();

      this.logger.info(
        {
          worker: this.name,
          queues: this.queueNames,
          healthPort: this.config.healthCheck.port,
        },
        'Worker started successfully'
      );
    } catch (error) {
      this.state = 'error';
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to start worker'
      );
      throw error;
    }
  }

  /**
   * Stop the worker gracefully
   *
   * 1. Stop accepting new jobs
   * 2. Wait for in-flight jobs (with timeout)
   * 3. Call onStop()
   * 4. Close connections
   * 5. Stop health server
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'draining') {
      this.logger.warn({ state: this.state }, 'Worker is already stopping or stopped');
      return;
    }

    this.state = 'draining';
    this.logger.info({ worker: this.name }, 'Stopping worker');

    try {
      // 1. Pause workers (stop accepting new jobs)
      await this.queueConnector.pauseWorkers();

      // 2. Call subclass cleanup
      await this.onStop();

      // 3. Close queue connections
      await this.queueConnector.shutdown();

      // 4. Stop health server
      await this.healthServer?.stop();

      // 5. Unregister shutdown handler
      this.shutdownHandler?.unregister();

      this.state = 'stopped';
      this.logger.info({ worker: this.name }, 'Worker stopped successfully');
    } catch (error) {
      this.state = 'error';
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error stopping worker'
      );
      throw error;
    }
  }

  /**
   * Get current worker status
   */
  getStatus(): WorkerStatus {
    const uptime = this.startedAt ? Date.now() - this.startedAt.getTime() : undefined;

    return {
      name: this.name,
      state: this.state,
      startedAt: this.startedAt || undefined,
      uptime,
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs,
      activeJobs: this.activeJobs,
      queues: this.queueNames,
    };
  }

  // ============================================================================
  // Protected Helpers
  // ============================================================================

  /**
   * Get a queue by name
   */
  protected getQueue(name: string) {
    return this.queueConnector.getQueue(name);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async handleJob(job: Job<TJobData>): Promise<TJobResult> {
    const startTime = Date.now();
    const jobLogger = this.logger.child({ jobId: job.id, queue: job.queueName });

    this.activeJobs++;
    jobLogger.debug({ data: job.data, activeJobs: this.activeJobs }, 'Processing job');

    try {
      const result = await this.processJob(job);

      this.processedJobs++;
      const duration = Date.now() - startTime;

      jobLogger.info({ duration, attempt: job.attemptsMade + 1 }, 'Job completed');

      return result;
    } catch (error) {
      this.failedJobs++;
      const duration = Date.now() - startTime;

      jobLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          duration,
          attempt: job.attemptsMade + 1,
        },
        'Job failed'
      );

      throw error;
    } finally {
      this.activeJobs--;
    }
  }

  private async startHealthServer(): Promise<void> {
    const healthProvider = this.createHealthProvider();

    this.healthServer = new HealthServer({
      config: this.config.healthCheck,
      provider: healthProvider,
      logger: this.logger,
      version: this.config.version,
    });

    await this.healthServer.start();
  }

  private createHealthProvider(): HealthProvider {
    return createDefaultHealthProvider(
      this.name,
      this.config.version,
      async () => {
        const redisHealth = await this.queueConnector.checkHealth();
        const customHealth = await this.getDependencyHealth();

        return {
          redis: redisHealth,
          ...customHealth,
        };
      },
      async () => {
        return this.queueConnector.getAllQueueStats();
      }
    );
  }

  private setupShutdown(): void {
    const shutdownFn = createCompositeShutdown(
      [
        { name: 'pause-workers', fn: () => this.queueConnector.pauseWorkers() },
        { name: 'subclass-cleanup', fn: () => this.onStop() },
        { name: 'close-queues', fn: () => this.queueConnector.shutdown() },
        { name: 'stop-health-server', fn: () => this.healthServer?.stop() || Promise.resolve() },
      ],
      this.logger
    );

    this.shutdownHandler = setupGracefulShutdown(shutdownFn, {
      timeoutMs: this.config.shutdownTimeoutMs,
      logger: this.logger,
    });
  }
}
