/**
 * BaseWorker Unit Tests
 *
 * @module @intelliflow/worker-shared/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Job } from 'bullmq';
import pino from 'pino';
import { BaseWorker, type ComponentHealth } from '../base-worker';

// Mock ioredis to prevent actual Redis connections
vi.mock('ioredis', async () => {
  const { vi: vitest } = await import('vitest');

  class MockIORedis {
    ping = vitest.fn().mockResolvedValue('PONG');
    quit = vitest.fn().mockResolvedValue(undefined);
    connect = vitest.fn().mockResolvedValue(undefined);
    disconnect = vitest.fn().mockResolvedValue(undefined);
    on = vitest.fn();
    off = vitest.fn();
    status = 'ready';

    duplicate() {
      return new MockIORedis();
    }
  }

  return {
    default: MockIORedis,
  };
});

// Mock BullMQ with proper class constructors
vi.mock('bullmq', async () => {
  const { vi: vitest } = await import('vitest');

  class MockWorker {
    on = vitest.fn();
    close = vitest.fn().mockResolvedValue(undefined);
    pause = vitest.fn().mockResolvedValue(undefined);
    resume = vitest.fn().mockResolvedValue(undefined);
  }

  class MockQueue {
    close = vitest.fn().mockResolvedValue(undefined);
  }

  class MockQueueEvents {
    on = vitest.fn();
    close = vitest.fn().mockResolvedValue(undefined);
  }

  return {
    Worker: MockWorker,
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
  };
});

// Concrete implementation for testing
class TestWorker extends BaseWorker<{ data: string }, { result: string }> {
  public onStartCalled = false;
  public onStopCalled = false;
  public processedJobs: Job[] = [];

  constructor(queues: string[] = ['test-queue']) {
    super({ name: 'test-worker', queues });
  }

  protected async onStart(): Promise<void> {
    this.onStartCalled = true;
  }

  protected async onStop(): Promise<void> {
    this.onStopCalled = true;
  }

  protected async processJob(job: Job<{ data: string }>): Promise<{ result: string }> {
    this.processedJobs.push(job);
    return { result: `processed-${job.data.data}` };
  }

  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    return {
      testDependency: {
        status: 'ok',
        message: 'Test dependency healthy',
        lastCheck: new Date().toISOString(),
      },
    };
  }

  // Expose protected members for testing
  public getLogger(): pino.Logger {
    return this.logger;
  }

  public getQueueNames(): string[] {
    return this.queueNames;
  }
}

describe('BaseWorker', () => {
  let worker: TestWorker;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set valid environment for config validation
    process.env.NODE_ENV = 'development';
    worker = new TestWorker();
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    if (worker) {
      await worker.stop().catch(() => {});
    }
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(worker.getQueueNames()).toEqual(['test-queue']);
    });

    it('should create a logger with worker name', () => {
      const logger = worker.getLogger();
      expect(logger).toBeDefined();
    });

    it('should accept multiple queues', () => {
      const multiQueueWorker = new TestWorker(['queue-1', 'queue-2', 'queue-3']);
      expect(multiQueueWorker.getQueueNames()).toEqual(['queue-1', 'queue-2', 'queue-3']);
    });
  });

  describe('start()', () => {
    it('should call onStart hook', async () => {
      await worker.start();
      expect(worker.onStartCalled).toBe(true);
    });

    it('should not start twice', async () => {
      await worker.start();
      const startPromise = worker.start();
      // Should resolve without error (idempotent)
      await expect(startPromise).resolves.toBeUndefined();
    });
  });

  describe('stop()', () => {
    it('should call onStop hook', async () => {
      await worker.start();
      await worker.stop();
      expect(worker.onStopCalled).toBe(true);
    });

    it('should be idempotent', async () => {
      await worker.start();
      await worker.stop();
      await worker.stop(); // Second stop should not throw
      expect(worker.onStopCalled).toBe(true);
    });
  });

  describe('processJob()', () => {
    it('should process job and return result', async () => {
      const mockJob = {
        id: 'job-1',
        data: { data: 'test-input' },
        queueName: 'test-queue',
      } as Job<{ data: string }>;

      const result = await worker['processJob'](mockJob);

      expect(result).toEqual({ result: 'processed-test-input' });
      expect(worker.processedJobs).toHaveLength(1);
      expect(worker.processedJobs[0]).toBe(mockJob);
    });
  });

  describe('getDependencyHealth()', () => {
    it('should return dependency health status', async () => {
      const health = await worker['getDependencyHealth']();

      expect(health.testDependency).toBeDefined();
      expect(health.testDependency.status).toBe('ok');
      expect(health.testDependency.message).toBe('Test dependency healthy');
    });
  });
});

describe('BaseWorker - Error Handling', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let testWorker: TestWorker | null = null;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    if (testWorker) {
      await testWorker.stop().catch(() => {});
      testWorker = null;
    }
  });

  it('should handle onStart errors gracefully', async () => {
    class FailingStartWorker extends TestWorker {
      protected async onStart(): Promise<void> {
        throw new Error('Start failed');
      }
    }

    testWorker = new FailingStartWorker();
    await expect(testWorker.start()).rejects.toThrow('Start failed');
  });

  it('should handle processJob errors', async () => {
    class FailingProcessWorker extends TestWorker {
      protected async processJob(): Promise<{ result: string }> {
        throw new Error('Process failed');
      }
    }

    testWorker = new FailingProcessWorker();
    const mockJob = { id: 'job-1', data: { data: 'test' } } as Job<{ data: string }>;

    await expect(testWorker['processJob'](mockJob)).rejects.toThrow('Process failed');
  });
});
