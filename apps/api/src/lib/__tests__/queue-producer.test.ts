/**
 * API queue producers connect with the shared options, so they carry the Redis
 * password, and they give up quickly: a refused connection must not retry for ever
 * or leave a handle behind.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Opts = { connection: Record<string, unknown> };

const created = vi.hoisted(() => ({ queues: [] as unknown[], events: [] as unknown[] }));
const addMock = vi.fn();
const closeMock = vi.fn();
const eventsCloseMock = vi.fn();

class MockQueue {
  listeners: Record<string, (e: Error) => void> = {};
  constructor(
    public name: string,
    public opts: Opts
  ) {
    created.queues.push(this);
  }
  add = addMock;
  close = closeMock;
  disconnect = vi.fn().mockResolvedValue(undefined);
  on(event: string, fn: (e: Error) => void) {
    this.listeners[event] = fn;
    return this;
  }
}

class MockQueueEvents extends MockQueue {
  constructor(name: string, opts: Opts) {
    super(name, opts);
    created.queues.pop();
    created.events.push(this);
  }
  override close = eventsCloseMock;
}

vi.mock('../load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({ Queue: MockQueue, QueueEvents: MockQueueEvents })),
}));

import { enqueueOneShot, withQueueReader, withRequestReplyQueue } from '../queue-producer';

const AUTH_VALUE = randomUUID();
const queue = () => created.queues[0] as MockQueue;
const events = () => created.events[0] as MockQueueEvents;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  created.queues.length = 0;
  created.events.length = 0;
  vi.stubEnv('REDIS_HOST', 'redis.example.invalid');
  vi.stubEnv('REDIS_PORT', '6380');
  vi.stubEnv('REDIS_PASSWORD', AUTH_VALUE);
  addMock.mockResolvedValue({ id: 'job-1' });
  closeMock.mockResolvedValue(undefined);
  eventsCloseMock.mockResolvedValue(undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('enqueueOneShot', () => {
  it('connects with the shared host, port and password, and gives up quickly', async () => {
    await enqueueOneShot('q', 'job', { a: 1 });

    expect(queue().opts.connection).toMatchObject({
      host: 'redis.example.invalid',
      port: 6380,
      password: AUTH_VALUE,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    const { retryStrategy } = queue().opts.connection as { retryStrategy: () => unknown };
    expect(retryStrategy()).toBeNull();
    expect(queue().opts.connection.connectTimeout).toBeGreaterThan(0);
    expect(queue().opts.connection.commandTimeout).toBeGreaterThan(0);
  });

  it('carries the username when one is set', async () => {
    vi.stubEnv('REDIS_USERNAME', 'acl-user');

    await enqueueOneShot('q', 'job', { a: 1 });

    expect(queue().opts.connection.username).toBe('acl-user');
  });

  it('passes job options, returns the job and closes the queue', async () => {
    const job = await enqueueOneShot('q', 'job', { a: 1 }, { jobId: 'x', attempts: 3 });

    expect(addMock).toHaveBeenCalledWith('job', { a: 1 }, { jobId: 'x', attempts: 3 });
    expect(job).toEqual({ id: 'job-1' });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('on failure closes the queue, logs without the password and rethrows', async () => {
    addMock.mockRejectedValue(new Error('NOAUTH Authentication required.'));

    await expect(enqueueOneShot('q', 'job', { a: 1 })).rejects.toThrow('NOAUTH');

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NOAUTH'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(AUTH_VALUE);
  });

  it('has an error listener, so a connection error is logged and does not throw', async () => {
    await enqueueOneShot('q', 'job', { a: 1 });

    expect(() => queue().listeners.error?.(new Error('NOAUTH'))).not.toThrow();
    expect(queue().listeners.error).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NOAUTH'));
  });
});

describe('withRequestReplyQueue', () => {
  it('gives both connections the password, and events a blocking-safe connection', async () => {
    const result = await withRequestReplyQueue('q', async () => 'done');

    expect(result).toBe('done');
    expect(queue().opts.connection).toMatchObject({
      password: AUTH_VALUE,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    expect(events().opts.connection).toMatchObject({
      password: AUTH_VALUE,
      maxRetriesPerRequest: null,
    });
    const { retryStrategy } = events().opts.connection as { retryStrategy: () => unknown };
    expect(retryStrategy()).toBeNull();
  });

  it('attaches error listeners and closes both, also when the work throws', async () => {
    await expect(
      withRequestReplyQueue('q', async () => {
        throw new Error('timed out');
      })
    ).rejects.toThrow('timed out');

    expect(queue().listeners.error).toBeDefined();
    expect(events().listeners.error).toBeDefined();
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(eventsCloseMock).toHaveBeenCalledTimes(1);
  });
});

describe('withQueueReader', () => {
  it('connects with the password, allows slower reads and closes on failure', async () => {
    await expect(
      withQueueReader('q', async () => {
        throw new Error('read failed');
      })
    ).rejects.toThrow('read failed');

    expect(queue().opts.connection.password).toBe(AUTH_VALUE);
    expect(queue().opts.connection.commandTimeout).toBeGreaterThan(2_000);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
