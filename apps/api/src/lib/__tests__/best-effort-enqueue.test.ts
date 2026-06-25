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

  it('returns false promptly (no 30s close() hang) when Redis refuses the connection', async () => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6399'; // nothing listening → connection refused
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

  it('returns false promptly when the host blackholes packets (no connection refusal)', async () => {
    // 192.0.2.0/24 (TEST-NET-1, RFC 5737) is reserved and routed nowhere, so the TCP connect
    // neither completes nor is refused — the case where ioredis's 10s connectTimeout (and worse,
    // OS SYN retransmits) would otherwise stall the request. connectTimeout + withTimeout bound it.
    process.env.REDIS_HOST = '192.0.2.1';
    process.env.REDIS_PORT = '6379';
    const start = Date.now();
    const enqueued = await enqueueBestEffort('best-effort-test-queue', 'noop', { hello: 'world' });
    const elapsedMs = Date.now() - start;
    expect(enqueued).toBe(false);
    // Bounded by REDIS_OP_TIMEOUT_MS (2s) per op, not the 10s+ default connect/SYN-retransmit.
    expect(elapsedMs).toBeLessThan(6000);
  });
});
