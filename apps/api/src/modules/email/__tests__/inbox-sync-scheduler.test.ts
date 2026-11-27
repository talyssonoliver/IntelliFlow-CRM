/**
 * #1177 Outlook inbox sync scheduler: its own timer, never overlapping, stoppable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_INBOX_SYNC_TICK_MS,
  inboxSyncIntervalFromEnv,
  startInboxSync,
  stopInboxSync,
} from '../inbox-sync-scheduler';

const quietLog = () => ({ warn: vi.fn(), info: vi.fn() });

afterEach(async () => {
  await stopInboxSync();
  vi.useRealTimers();
});

describe('inboxSyncIntervalFromEnv', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(inboxSyncIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(inboxSyncIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(inboxSyncIntervalFromEnv({ VERCEL: '1' })).toBe(0);
    expect(inboxSyncIntervalFromEnv({ AWS_LAMBDA_FUNCTION_NAME: 'fn' })).toBe(0);
  });

  it('is off with EMAIL_INBOX_SYNC=off', () => {
    expect(inboxSyncIntervalFromEnv({ EMAIL_INBOX_SYNC: 'off' })).toBe(0);
  });

  it('reads EMAIL_INBOX_SYNC_INTERVAL_MS, defaulting a missing or bad value', () => {
    expect(inboxSyncIntervalFromEnv({})).toBe(DEFAULT_INBOX_SYNC_TICK_MS);
    expect(inboxSyncIntervalFromEnv({ EMAIL_INBOX_SYNC_INTERVAL_MS: ' ' })).toBe(
      DEFAULT_INBOX_SYNC_TICK_MS
    );
    expect(inboxSyncIntervalFromEnv({ EMAIL_INBOX_SYNC_INTERVAL_MS: 'soon' })).toBe(
      DEFAULT_INBOX_SYNC_TICK_MS
    );
    expect(inboxSyncIntervalFromEnv({ EMAIL_INBOX_SYNC_INTERVAL_MS: '-5' })).toBe(
      DEFAULT_INBOX_SYNC_TICK_MS
    );
    expect(inboxSyncIntervalFromEnv({ EMAIL_INBOX_SYNC_INTERVAL_MS: '90000.7' })).toBe(90_000);
    expect(inboxSyncIntervalFromEnv({ EMAIL_INBOX_SYNC_INTERVAL_MS: '0' })).toBe(0);
  });
});

describe('startInboxSync / stopInboxSync', () => {
  it('does not start when disabled, and starts only once', () => {
    const run = vi.fn(async () => undefined);
    expect(startInboxSync({ intervalMs: 0, run, log: quietLog() })).toBe(false);
    expect(startInboxSync({ intervalMs: 1_000, run, log: quietLog() })).toBe(true);
    expect(startInboxSync({ intervalMs: 1_000, run, log: quietLog() })).toBe(false);
  });

  it('runs on each interval and skips a tick while the previous one is running', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    startInboxSync({ intervalMs: 1_000, run, log: quietLog() });

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    finish();
  });

  it('logs a failed tick and keeps running', async () => {
    vi.useFakeTimers();
    const log = quietLog();
    const run = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('graph down'))
      .mockRejectedValueOnce('plain')
      .mockResolvedValue(undefined);
    startInboxSync({ intervalMs: 1_000, run, log });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(run).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledWith('[email-inbox-sync] tick failed: graph down');
    expect(log.warn).toHaveBeenCalledWith('[email-inbox-sync] tick failed: plain');
  });

  it('stop waits for the tick in flight, and no tick starts after it', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    startInboxSync({ intervalMs: 1_000, run, log: quietLog() });
    await vi.advanceTimersByTimeAsync(1_000);

    let stopped = false;
    const stopping = stopInboxSync().then(() => (stopped = true));
    await Promise.resolve();
    expect(stopped).toBe(false);

    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
