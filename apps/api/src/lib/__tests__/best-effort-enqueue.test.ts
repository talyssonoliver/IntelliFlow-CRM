import { describe, it, expect, afterEach } from 'vitest';
import { enqueueBestEffort } from '../best-effort-enqueue';

describe('enqueueBestEffort — Redis resilience', () => {
  const origHost = process.env.REDIS_HOST;
  const origPort = process.env.REDIS_PORT;
  afterEach(() => {
    // Restore-or-delete: assigning `undefined` would coerce to the string "undefined" and
    // pollute later tests in the same worker with a bogus Redis host/port.
    if (origHost === undefined) delete process.env.REDIS_HOST;
    else process.env.REDIS_HOST = origHost;
    if (origPort === undefined) delete process.env.REDIS_PORT;
    else process.env.REDIS_PORT = origPort;
  });

  it('returns false promptly (no 30s close() hang) when Redis is unreachable', async () => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6399'; // nothing listening
    const start = Date.now();
    const enqueued = await enqueueBestEffort('best-effort-test-queue', 'noop', { hello: 'world' });
    const elapsedMs = Date.now() - start;
    // A Redis-down enqueue must report failure so contract-bearing callers (generateInsight's
    // {enqueued}) don't claim a job was queued when it wasn't.
    expect(enqueued).toBe(false);
    // The fail-fast connection + finally-close must return well under the old ~30s hang. The
    // process exiting cleanly after this suite (no open handle) is the leak check.
    expect(elapsedMs).toBeLessThan(5000);
  });
});
