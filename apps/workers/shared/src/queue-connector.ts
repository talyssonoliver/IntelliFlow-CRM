/**
 * Queue Connector
 *
 * BullMQ connection management with health checks and graceful shutdown.
 * Pattern from: packages/platform/src/queues/queue-factory.ts
 *
 * @module worker-shared/queue-connector
 * @task IFC-163
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import type { RedisConfig, QueueConfig } from './worker-config';
import type { ComponentHealth } from './types';

// ============================================================================
// Types
// ============================================================================

export interface QueueConnectionOptions {
  redis: RedisConfig;
  queue: QueueConfig;
  logger?: pino.Logger;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export type JobProcessor<TData = unknown, TResult = unknown> = (
  job: Job<TData>
) => Promise<TResult>;

// ============================================================================
// Implementation
// ============================================================================

export class QueueConnector {
  private connection: IORedis | null = null;
  private readonly queues: Map<string, Queue> = new Map();
  private readonly workers: Map<string, Worker> = new Map();
  private readonly events: Map<string, QueueEvents> = new Map();
  private readonly logger: pino.Logger;
  private readonly redisConfig: RedisConfig;
  private readonly queueConfig: QueueConfig;
  private isConnected = false;

  constructor(options: QueueConnectionOptions) {
    this.redisConfig = options.redis;
    this.queueConfig = options.queue;
    this.logger =
      options.logger ??
      pino({
        name: 'queue-connector',
        level: 'info',
      });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.connection) {
      this.logger.debug('Already connected to Redis');
      return;
    }

    this.logger.info(
      { host: this.redisConfig.host, port: this.redisConfig.port },
      'Connecting to Redis'
    );

    this.connection = new IORedis({
      host: this.redisConfig.host,
      port: this.redisConfig.port,
      password: this.redisConfig.password,
      db: this.redisConfig.db,
      maxRetriesPerRequest: this.redisConfig.maxRetriesPerRequest,
      enableOfflineQueue: this.redisConfig.enableOfflineQueue,
      lazyConnect: this.redisConfig.lazyConnect,
      tls: this.redisConfig.tls ? {} : undefined,
    });

    // Wait for connection
    if (this.redisConfig.lazyConnect) {
      await this.connection.connect();
    }

    // Verify connection
    await this.connection.ping();
    this.isConnected = true;
    this.logger.info('Connected to Redis successfully');
  }

  /**
   * Get or create a queue
   */
  getQueue(name: string): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    if (!this.connection) {
      throw new Error('Not connected to Redis. Call connect() first.');
    }

    const queue = new Queue(name, {
      connection: this.connection.duplicate(),
    });

    this.queues.set(name, queue);
    this.logger.debug({ queue: name }, 'Queue created');

    return queue;
  }

  /**
   * Create a worker for a queue
   */
  createWorker<TData = unknown, TResult = unknown>(
    queueName: string,
    processor: JobProcessor<TData, TResult>
  ): Worker<TData, TResult> {
    if (!this.connection) {
      throw new Error('Not connected to Redis. Call connect() first.');
    }

    const worker = new Worker<TData, TResult>(queueName, processor, {
      connection: this.connection.duplicate(),
      concurrency: this.queueConfig.concurrency,
      lockDuration: this.queueConfig.lockDuration,
      stalledInterval: this.queueConfig.stalledInterval,
      maxStalledCount: this.queueConfig.maxStalledCount,
      limiter: this.queueConfig.rateLimiter
        ? {
            max: this.queueConfig.rateLimiter.max,
            duration: this.queueConfig.rateLimiter.duration,
          }
        : undefined,
    });

    // Setup event handlers
    worker.on('completed', (job) => {
      this.logger.debug({ jobId: job.id, queue: queueName }, 'Job completed');
    });

    worker.on('failed', (job, error) => {
      this.logger.error(
        {
          jobId: job?.id,
          queue: queueName,
          error: error.message,
        },
        'Job failed'
      );
    });

    worker.on('error', (error) => {
      this.logger.error(
        { queue: queueName, error: error.message },
        'Worker error'
      );
    });

    this.workers.set(queueName, worker as Worker);
    this.logger.info({ queue: queueName }, 'Worker created');

    return worker;
  }

  /**
   * Create queue events listener
   */
  createQueueEvents(queueName: string): QueueEvents {
    if (this.events.has(queueName)) {
      return this.events.get(queueName)!;
    }

    if (!this.connection) {
      throw new Error('Not connected to Redis. Call connect() first.');
    }

    const queueEvents = new QueueEvents(queueName, {
      connection: this.connection.duplicate(),
    });

    this.events.set(queueName, queueEvents);
    return queueEvents;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    }

    const counts = await queue.getJobCounts();
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {};

    for (const queueName of this.queues.keys()) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  /**
   * Check Redis health
   */
  async checkHealth(): Promise<ComponentHealth> {
    if (!this.connection || !this.isConnected) {
      return {
        status: 'error',
        message: 'Not connected to Redis',
      };
    }

    const startTime = Date.now();

    try {
      await this.connection.ping();
      const latency = Date.now() - startTime;

      return {
        status: latency < 100 ? 'ok' : 'degraded',
        latency,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString(),
      };
    }
  }

  /**
   * Get all registered queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Pause all workers (stop accepting new jobs)
   */
  async pauseWorkers(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.pause();
    }
    this.logger.info('All workers paused');
  }

  /**
   * Resume all workers
   */
  async resumeWorkers(): Promise<void> {
    for (const worker of this.workers.values()) {
      worker.resume();
    }
    this.logger.info('All workers resumed');
  }

  /**
   * Helper to safely close a resource with error handling
   */
  private async safeClose(
    name: string,
    resourceType: string,
    closeFn: () => Promise<void>
  ): Promise<void> {
    try {
      await closeFn();
      this.logger.debug({ queue: name }, `${resourceType} closed`);
    } catch (error) {
      this.logger.error(
        { queue: name, error: error instanceof Error ? error.message : String(error) },
        `Error closing ${resourceType}`
      );
    }
  }

  /**
   * Graceful shutdown - close all connections
   */
  async shutdown(): Promise<void> {
    this.logger.info('Starting queue connector shutdown');

    // Close workers first (stop processing)
    for (const [name, worker] of this.workers) {
      await this.safeClose(name, 'Worker', () => worker.close());
    }

    // Close queue events
    for (const [name, events] of this.events) {
      await this.safeClose(name, 'Queue events', () => events.close());
    }

    // Close queues
    for (const [name, queue] of this.queues) {
      await this.safeClose(name, 'Queue', () => queue.close());
    }

    // Close Redis connection
    if (this.connection) {
      await this.safeClose('redis', 'Redis connection', async () => {
        await this.connection!.quit();
      });
    }

    // Clear all maps
    this.queues.clear();
    this.workers.clear();
    this.events.clear();
    this.connection = null;
    this.isConnected = false;

    this.logger.info('Queue connector shutdown complete');
  }
}
