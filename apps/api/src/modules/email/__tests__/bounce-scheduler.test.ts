import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BOUNCE_SCAN_INTERVAL_MS,
  bounceScanIntervalFromEnv,
  startBounceScanner,
  stopBounceScanner,
} from '../bounce-scheduler';

afterEach(() => {
  stopBounceScanner();
  vi.useRealTimers();
});

describe('bounceScanIntervalFromEnv', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(bounceScanIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(bounceScanIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(bounceScanIntervalFromEnv({ VERCEL: '1' })).toBe(0);
    expect(bounceScanIntervalFromEnv({ AWS_LAMBDA_FUNCTION_NAME: 'f' })).toBe(0);
  });

  it('defaults to one minute and honours a valid override (0 disables)', () => {
    expect(DEFAULT_BOUNCE_SCAN_INTERVAL_MS).toBe(60_000);
    expect(bounceScanIntervalFromEnv({})).toBe(60_000);
    expect(bounceScanIntervalFromEnv({ EMAIL_BOUNCE_SCAN_INTERVAL_MS: '' })).toBe(60_000);
    expect(bounceScanIntervalFromEnv({ EMAIL_BOUNCE_SCAN_INTERVAL_MS: '120000' })).toBe(120_000);
    expect(bounceScanIntervalFromEnv({ EMAIL_BOUNCE_SCAN_INTERVAL_MS: '0' })).toBe(0);
    expect(bounceScanIntervalFromEnv({ EMAIL_BOUNCE_SCAN_INTERVAL_MS: 'nope' })).toBe(60_000);
    expect(bounceScanIntervalFromEnv({ EMAIL_BOUNCE_SCAN_INTERVAL_MS: '-5' })).toBe(60_000);
  });
});

describe('startBounceScanner', () => {
  const log = { info: vi.fn(), warn: vi.fn() };

  it('does not start when disabled or twice', () => {
    expect(startBounceScanner({ intervalMs: 0, run: vi.fn(), log })).toBe(false);
    expect(startBounceScanner({ intervalMs: 1000, run: vi.fn(async () => undefined), log })).toBe(
      true
    );
    expect(startBounceScanner({ intervalMs: 1000, run: vi.fn(), log })).toBe(false);
  });

  it('runs on the interval, skips an overlapping tick and logs failures without the error object', async () => {
    vi.useFakeTimers();
    let resolveFirst: () => void = () => undefined;
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (resolveFirst = r)))
      .mockRejectedValueOnce(new Error('boom'));
    startBounceScanner({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000); // still running → skipped
    expect(run).toHaveBeenCalledTimes(1);
    resolveFirst();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith('[email-bounce-scan] tick failed: boom');
  });
});
