/**
 * Branch coverage for enqueueBestEffort using a fully mocked BullMQ Queue, so the success path,
 * the force-disconnect fallback, and the close-timeout backstop are all exercised deterministically
 * (the sibling best-effort-enqueue.test.ts drives the real ioredis fail-fast timing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addMock = vi.fn();
const closeMock = vi.fn();
const disconnectMock = vi.fn();

class MockQueue {
  constructor(
    public name: string,
    public opts: unknown
  ) {}
  add = addMock;
  close = closeMock;
  disconnect = disconnectMock;
}

vi.mock('../load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({ Queue: MockQueue, QueueEvents: class {} })),
}));

// Imported after the mock so the helper resolves the stubbed loadBullMQ.
import { enqueueBestEffort } from '../best-effort-enqueue';

describe('enqueueBestEffort — branch coverage (mocked BullMQ)', () => {
  beforeEach(() => {
    // The api vitest config resets implementations between tests; re-establish them here.
    vi.clearAllMocks();
    addMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    disconnectMock.mockResolvedValue(undefined);
  });

  it('returns true and gracefully closes the queue when add succeeds', async () => {
    const ok = await enqueueBestEffort('q', 'job', { a: 1 });
    expect(ok).toBe(true);
    expect(addMock).toHaveBeenCalledWith('job', { a: 1 });
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it('force-disconnects when graceful close rejects (enqueue still succeeded)', async () => {
    closeMock.mockRejectedValue(new Error('QUIT hung'));
    const ok = await enqueueBestEffort('q', 'job', { a: 1 });
    expect(ok).toBe(true);
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when both close and disconnect fail', async () => {
    closeMock.mockRejectedValue(new Error('close fail'));
    disconnectMock.mockRejectedValue(new Error('disconnect fail'));
    const ok = await enqueueBestEffort('q', 'job', { a: 1 });
    expect(ok).toBe(true);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when add rejects, still attempting close', async () => {
    addMock.mockRejectedValue(new Error('add fail'));
    const ok = await enqueueBestEffort('q', 'job', { a: 1 });
    expect(ok).toBe(false);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('force-disconnects when close hangs past the timeout backstop', async () => {
    // close() never settles → withTimeout rejects after REDIS_OP_TIMEOUT_MS → disconnect fallback.
    closeMock.mockReturnValue(new Promise<void>(() => {}));
    const ok = await enqueueBestEffort('q', 'job', { a: 1 });
    expect(ok).toBe(true);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  }, 8000);
});
