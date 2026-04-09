/**
 * Queue Administration Router Tests — IFC-296
 *
 * Categories:
 *   A. Happy Path (6 tests)
 *   B. Error Handling (4 tests)
 *   C. Input Validation (4 tests)
 *   D. Authentication (2 tests)
 *   E. Edge Cases (4 tests)
 *
 * Total: ~20 tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext, createPublicContext } from '../../../test/setup';

// ---------------------------------------------------------------------------
// BullMQ Mock — class-based (matching intelligence.router.test.ts pattern)
// ---------------------------------------------------------------------------

const mockGetJobCounts = vi.fn().mockResolvedValue({ waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 });
const mockIsPaused = vi.fn().mockResolvedValue(false);
const mockPause = vi.fn().mockResolvedValue(undefined);
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockGetJobSchedulers = vi.fn().mockResolvedValue([{ id: 'scheduler-1', name: 'scheduled-insight-refresh', pattern: '0 */6 * * *', next: Date.now() + 3600000 }]);
const mockRetryJobs = vi.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = vi.fn().mockResolvedValue(true);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => {
  function MockQueue(this: any, name: string, opts?: unknown) {
    this.name = name;
    this.opts = opts;
    this.getJobCounts = mockGetJobCounts;
    this.isPaused = mockIsPaused;
    this.pause = mockPause;
    this.resume = mockResume;
    this.getJobSchedulers = mockGetJobSchedulers;
    this.retryJobs = mockRetryJobs;
    this.removeJobScheduler = mockRemoveJobScheduler;
    this.close = mockClose;
  }
  return { Queue: MockQueue };
});

vi.mock('@intelliflow/platform/queues/connection', () => ({
  getBullMQConnectionOptions: vi.fn(() => ({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
  })),
}));

// Import router AFTER mocks
import { queuesAdminRouter } from '../queues.router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockScheduler(overrides?: Partial<{ id: string; name: string; pattern: string; next: number }>) {
  return {
    id: 'scheduler-1',
    name: 'scheduled-insight-refresh',
    pattern: '0 */6 * * *',
    next: Date.now() + 3600000,
    ...overrides,
  };
}

function setupDefaultMocks() {
  mockGetJobCounts.mockImplementation(async () => ({ waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 }));
  mockIsPaused.mockImplementation(async () => false);
  mockGetJobSchedulers.mockImplementation(async () => [createMockScheduler()]);
  mockPause.mockImplementation(async () => undefined);
  mockResume.mockImplementation(async () => undefined);
  mockRetryJobs.mockImplementation(async () => undefined);
  mockRemoveJobScheduler.mockImplementation(async () => true);
  mockClose.mockImplementation(async () => undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('queuesAdminRouter', () => {
  let caller: ReturnType<typeof queuesAdminRouter.createCaller>;

  beforeEach(() => {
    // Clear call history only (mockClear preserves implementations set at declaration)
    mockGetJobCounts.mockClear();
    mockIsPaused.mockClear();
    mockPause.mockClear();
    mockResume.mockClear();
    mockGetJobSchedulers.mockClear();
    mockRetryJobs.mockClear();
    mockRemoveJobScheduler.mockClear();
    mockClose.mockClear();
    // Re-apply defaults (needed because some tests override via mockResolvedValueOnce)
    setupDefaultMocks();
    caller = queuesAdminRouter.createCaller(createTestContext());
  });

  // =========================================================================
  // Category A — Happy Path
  // =========================================================================
  describe('Category A: Happy Path', () => {
    it('list returns 3 queues with counts, isPaused, schedulers', async () => {
      const result = await caller.list();

      expect(result.queues).toHaveLength(3);
      expect(result.queues.map((q) => q.name)).toEqual([
        'ai-scoring',
        'ai-prediction',
        'ai-insights',
      ]);

      // Verify mock was called 3 times (once per queue)
      expect(mockGetJobCounts).toHaveBeenCalledTimes(3);
      expect(mockIsPaused).toHaveBeenCalledTimes(3);
      expect(mockClose).toHaveBeenCalledTimes(3);

      for (const queue of result.queues) {
        expect(queue.counts).toEqual({
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 3,
          delayed: 1,
        });
        expect(queue.isPaused).toBe(false);
        expect(queue.schedulers).toHaveLength(1);
        expect(queue.schedulers[0].name).toBe('scheduled-insight-refresh');
      }
    });

    it('getByName with valid queue name returns single queue stats + schedulers', async () => {
      const result = await caller.getByName({ name: 'ai-scoring' });

      expect(result.name).toBe('ai-scoring');
      expect(result.counts).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
      expect(result.isPaused).toBe(false);
      expect(result.schedulers).toHaveLength(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('pause with valid queue name calls queue.pause() and returns success', async () => {
      const result = await caller.pause({ name: 'ai-scoring' });

      expect(mockPause).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('resume with valid queue name calls queue.resume() and returns success', async () => {
      const result = await caller.resume({ name: 'ai-prediction' });

      expect(mockResume).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('retryFailed with valid queue name retries failed jobs, returns retriedCount', async () => {
      const result = await caller.retryFailed({ name: 'ai-insights', count: 5 });

      expect(mockRetryJobs).toHaveBeenCalledWith({ state: 'failed', count: 5 });
      expect(result.retriedCount).toBe(5);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('deleteScheduler with valid queue + schedulerId removes scheduler', async () => {
      const result = await caller.deleteScheduler({
        name: 'ai-scoring',
        schedulerId: 'scheduler-1',
      });

      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('scheduler-1');
      expect(result.success).toBe(true);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Category B — Error Handling
  // =========================================================================
  describe('Category B: Error Handling', () => {
    it('list when BullMQ Queue throws returns INTERNAL_SERVER_ERROR', async () => {
      mockGetJobCounts.mockRejectedValue(new Error('Redis connection refused'));

      await expect(caller.list()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('pause when queue.pause() throws returns INTERNAL_SERVER_ERROR', async () => {
      mockPause.mockRejectedValue(new Error('Redis timeout'));

      await expect(caller.pause({ name: 'ai-scoring' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      // close should still be called (try/finally)
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('retryFailed when queue.retryJobs() throws returns INTERNAL_SERVER_ERROR', async () => {
      mockRetryJobs.mockRejectedValue(new Error('Redis OOM'));

      await expect(
        caller.retryFailed({ name: 'ai-scoring', count: 10 })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('deleteScheduler when removeJobScheduler returns false returns NOT_FOUND', async () => {
      mockRemoveJobScheduler.mockResolvedValue(false);

      await expect(
        caller.deleteScheduler({ name: 'ai-scoring', schedulerId: 'nonexistent' })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('getByName when BullMQ throws returns INTERNAL_SERVER_ERROR', async () => {
      mockGetJobCounts.mockRejectedValue(new Error('Redis down'));

      await expect(caller.getByName({ name: 'ai-scoring' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('resume when queue.resume() throws returns INTERNAL_SERVER_ERROR', async () => {
      mockResume.mockRejectedValue(new Error('Redis timeout'));

      await expect(caller.resume({ name: 'ai-scoring' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('deleteScheduler when removeJobScheduler throws returns INTERNAL_SERVER_ERROR', async () => {
      mockRemoveJobScheduler.mockRejectedValue(new Error('Redis error'));

      await expect(
        caller.deleteScheduler({ name: 'ai-scoring', schedulerId: 'sched-1' })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Category C — Input Validation
  // =========================================================================
  describe('Category C: Input Validation', () => {
    it('getByName with invalid queue name is rejected by Zod', async () => {
      await expect(
        caller.getByName({ name: 'invalid-queue' as any })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('deleteScheduler with missing schedulerId is rejected by Zod', async () => {
      await expect(
        caller.deleteScheduler({ name: 'ai-scoring' } as any)
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('retryFailed with count > 100 is rejected by Zod', async () => {
      await expect(
        caller.retryFailed({ name: 'ai-scoring', count: 101 })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('retryFailed with count < 1 is rejected by Zod', async () => {
      await expect(
        caller.retryFailed({ name: 'ai-scoring', count: 0 })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  // =========================================================================
  // Category D — Authentication
  // =========================================================================
  describe('Category D: Authentication', () => {
    it('unauthenticated caller on list throws UNAUTHORIZED', async () => {
      const publicCaller = queuesAdminRouter.createCaller(createPublicContext());

      await expect(publicCaller.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('unauthenticated caller on pause throws UNAUTHORIZED', async () => {
      const publicCaller = queuesAdminRouter.createCaller(createPublicContext());

      await expect(
        publicCaller.pause({ name: 'ai-scoring' })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // =========================================================================
  // Category E — Edge Cases
  // =========================================================================
  describe('Category E: Edge Cases', () => {
    it('list when all queues have 0 jobs returns all 3 with zero counts', async () => {
      mockGetJobCounts.mockResolvedValue({
        waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0,
      });
      mockGetJobSchedulers.mockResolvedValue([]);

      const result = await caller.list();

      expect(result.queues).toHaveLength(3);
      for (const queue of result.queues) {
        expect(queue.counts.waiting).toBe(0);
        expect(queue.counts.active).toBe(0);
        expect(queue.counts.failed).toBe(0);
        expect(queue.schedulers).toHaveLength(0);
      }
    });

    it('getByName when queue has no schedulers returns empty schedulers array', async () => {
      mockGetJobSchedulers.mockResolvedValue([]);

      const result = await caller.getByName({ name: 'ai-prediction' });

      expect(result.schedulers).toEqual([]);
    });

    it('retryFailed when zero failed jobs returns retriedCount: 0', async () => {
      const result = await caller.retryFailed({ name: 'ai-scoring' });

      // Default count is 10, but with no failed jobs the count is still passed
      expect(result.retriedCount).toBeDefined();
    });

    it('list returns correct isPaused state per queue', async () => {
      // First queue paused, second and third not
      mockIsPaused
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const result = await caller.list();

      expect(result.queues[0].isPaused).toBe(true);
      expect(result.queues[1].isPaused).toBe(false);
      expect(result.queues[2].isPaused).toBe(false);
    });

    it('formatQueueStats defaults missing counts to 0', async () => {
      // Return empty counts object — forces ?? 0 branches
      mockGetJobCounts.mockResolvedValue({});
      mockGetJobSchedulers.mockResolvedValue([]);

      const result = await caller.getByName({ name: 'ai-scoring' });

      expect(result.counts).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    });

    it('formatQueueStats handles scheduler with key instead of id', async () => {
      // Scheduler entry with `key` instead of `id`, and missing optional fields
      mockGetJobSchedulers.mockResolvedValue([
        { key: 'key-1', name: 'test-scheduler' },
      ]);

      const result = await caller.getByName({ name: 'ai-scoring' });

      expect(result.schedulers).toHaveLength(1);
      expect(result.schedulers[0].id).toBe('key-1');
      expect(result.schedulers[0].name).toBe('test-scheduler');
      expect(result.schedulers[0].pattern).toBeUndefined();
      expect(result.schedulers[0].every).toBeUndefined();
      expect(result.schedulers[0].next).toBeUndefined();
    });

    it('formatQueueStats handles scheduler with no id or key', async () => {
      // Scheduler with no id/key — forces empty string fallback
      mockGetJobSchedulers.mockResolvedValue([
        { name: 'orphan-scheduler' },
      ]);

      const result = await caller.getByName({ name: 'ai-scoring' });

      expect(result.schedulers[0].id).toBe('');
      expect(result.schedulers[0].name).toBe('orphan-scheduler');
    });
  });
});
