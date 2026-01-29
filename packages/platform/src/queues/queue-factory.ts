/**
 * Queue Factory for BullMQ
 *
 * Provides factory functions for creating and managing BullMQ queues
 * with consistent configuration and proper lifecycle management.
 */

import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import { getBullMQConnectionOptions } from './connection';
import { QueueConfig, JobMetrics, JobEvent, QUEUE_NAMES, DEFAULT_QUEUE_CONFIGS } from './types';
import { calculateBackoffDelay, BACKOFF_PRESETS } from './retry-strategy';
import { JobMetricsCollector } from './metrics-collector';

// ============================================================================
// Queue Factory
// ============================================================================

/**
 * Queue registry for managing queue instances
 */
class QueueRegistry {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private events: Map<string, QueueEvents> = new Map();
  private metricsCollectors: Map<string, JobMetricsCollector> = new Map();

  /**
   * Create or get an existing queue
   */
  getOrCreateQueue(name: string, connection?: ConnectionOptions): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const config = DEFAULT_QUEUE_CONFIGS[name] || this.createDefaultConfig(name);
    const queue = new Queue(name, {
      connection: connection || getBullMQConnectionOptions(),
      defaultJobOptions: {
        attempts: config.defaultJobOptions.attempts,
        backoff: {
          type: config.defaultJobOptions.backoff.type,
          delay: config.defaultJobOptions.backoff.delay,
        },
        removeOnComplete: config.defaultJobOptions.removeOnComplete,
        removeOnFail: config.defaultJobOptions.removeOnFail,
      },
    });

    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Create a worker for a queue
   */
  createWorker<T = unknown, R = unknown>(
    queueName: string,
    processor: (job: Job<T>) => Promise<R>,
    connection?: ConnectionOptions
  ): Worker<T, R> {
    const config = DEFAULT_QUEUE_CONFIGS[queueName] || this.createDefaultConfig(queueName);

    const worker = new Worker<T, R>(queueName, processor, {
      connection: connection || getBullMQConnectionOptions(),
      concurrency: config.concurrency,
      limiter: config.rateLimiter
        ? {
            max: config.rateLimiter.max,
            duration: config.rateLimiter.duration,
          }
        : undefined,
    });

    this.workers.set(queueName, worker as Worker);
    return worker;
  }

  /**
   * Create queue events listener
   */
  createQueueEvents(queueName: string, connection?: ConnectionOptions): QueueEvents {
    if (this.events.has(queueName)) {
      return this.events.get(queueName)!;
    }

    const queueEvents = new QueueEvents(queueName, {
      connection: connection || getBullMQConnectionOptions(),
    });

    this.events.set(queueName, queueEvents);
    return queueEvents;
  }

  /**
   * Get or create metrics collector for a queue
   */
  getMetricsCollector(queueName: string): JobMetricsCollector {
    if (this.metricsCollectors.has(queueName)) {
      return this.metricsCollectors.get(queueName)!;
    }

    const collector = new JobMetricsCollector(queueName);
    this.metricsCollectors.set(queueName, collector);
    return collector;
  }

  /**
   * Get all registered queues
   */
  getQueues(): Map<string, Queue> {
    return new Map(this.queues);
  }

  /**
   * Get all registered workers
   */
  getWorkers(): Map<string, Worker> {
    return new Map(this.workers);
  }

  /**
   * Graceful shutdown of all queues and workers
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    // Close workers first
    for (const [name, worker] of this.workers) {
      shutdownPromises.push(
        worker.close().catch((err) => {
          console.error(`Error closing worker ${name}:`, err);
        })
      );
    }

    // Close queue events
    for (const [name, events] of this.events) {
      shutdownPromises.push(
        events.close().catch((err) => {
          console.error(`Error closing queue events ${name}:`, err);
        })
      );
    }

    // Close queues
    for (const [name, queue] of this.queues) {
      shutdownPromises.push(
        queue.close().catch((err) => {
          console.error(`Error closing queue ${name}:`, err);
        })
      );
    }

    await Promise.all(shutdownPromises);

    this.queues.clear();
    this.workers.clear();
    this.events.clear();
    this.metricsCollectors.clear();
  }

  /**
   * Create default configuration for unregistered queues
   */
  private createDefaultConfig(name: string): QueueConfig {
    return {
      name,
      defaultJobOptions: {
        attempts: 3,
        backoff: BACKOFF_PRESETS.standard,
        removeOnComplete: 86400000,
        removeOnFail: 604800000,
      },
      concurrency: 5,
    };
  }
}

// Singleton instance
export const queueRegistry = new QueueRegistry();

// ============================================================================
// Queue Factory Functions
// ============================================================================

/**
 * Create the AI Scoring queue
 */
export function createAIScoringQueue(connection?: ConnectionOptions): Queue {
  return queueRegistry.getOrCreateQueue(QUEUE_NAMES.AI_SCORING, connection);
}

/**
 * Create the Email Notifications queue
 */
export function createEmailNotificationsQueue(connection?: ConnectionOptions): Queue {
  return queueRegistry.getOrCreateQueue(QUEUE_NAMES.EMAIL_NOTIFICATIONS, connection);
}

/**
 * Create the Webhook Delivery queue
 */
export function createWebhookDeliveryQueue(connection?: ConnectionOptions): Queue {
  return queueRegistry.getOrCreateQueue(QUEUE_NAMES.WEBHOOK_DELIVERY, connection);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Add a job to the AI scoring queue
 */
export async function enqueueAIScoring(
  leadId: string,
  userId: string,
  options?: {
    priority?: 'low' | 'normal' | 'high' | 'critical';
    delay?: number;
  }
): Promise<Job> {
  const queue = createAIScoringQueue();

  const priorityMap = {
    low: 20,
    normal: 10,
    high: 5,
    critical: 1,
  };

  return queue.add(
    'score-lead',
    {
      leadId,
      userId,
      priority: options?.priority || 'normal',
      metadata: {
        requestedAt: new Date().toISOString(),
        retryCount: 0,
      },
    },
    {
      priority: priorityMap[options?.priority || 'normal'],
      delay: options?.delay,
    }
  );
}

/**
 * Get queue health status
 */
export async function getQueueHealth(queueName: string): Promise<{
  isPaused: boolean;
  activeCount: number;
  waitingCount: number;
  failedCount: number;
  completedCount: number;
}> {
  const queue = queueRegistry.getOrCreateQueue(queueName);

  const [isPaused, jobCounts] = await Promise.all([queue.isPaused(), queue.getJobCounts()]);

  return {
    isPaused,
    activeCount: jobCounts.active,
    waitingCount: jobCounts.waiting,
    failedCount: jobCounts.failed,
    completedCount: jobCounts.completed,
  };
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: string): Promise<void> {
  const queue = queueRegistry.getOrCreateQueue(queueName);
  await queue.pause();
}

/**
 * Resume a paused queue
 */
export async function resumeQueue(queueName: string): Promise<void> {
  const queue = queueRegistry.getOrCreateQueue(queueName);
  await queue.resume();
}

/**
 * Graceful shutdown of all queues
 */
export async function shutdownAllQueues(): Promise<void> {
  await queueRegistry.shutdown();
}
