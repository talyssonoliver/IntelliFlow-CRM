import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_KEPT_LOCATIONS_INTERVAL_MS,
  keptLocationsIntervalFromEnv,
  runKeptLocationsSweep,
  startKeptLocationsScheduler,
  stopKeptLocationsScheduler,
} from '../dsar-kept-locations-scheduler';

describe('keptLocationsIntervalFromEnv (IFC-316)', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(keptLocationsIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(keptLocationsIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(keptLocationsIntervalFromEnv({ VERCEL: '1' })).toBe(0);
  });

  it('defaults to hourly, accepts an override and 0 to disable', () => {
    expect(keptLocationsIntervalFromEnv({})).toBe(3_600_000);
    expect(keptLocationsIntervalFromEnv({})).toBe(DEFAULT_KEPT_LOCATIONS_INTERVAL_MS);
    expect(keptLocationsIntervalFromEnv({ DSAR_KEPT_LOCATIONS_INTERVAL_MS: '5000' })).toBe(5000);
    expect(keptLocationsIntervalFromEnv({ DSAR_KEPT_LOCATIONS_INTERVAL_MS: '0' })).toBe(0);
    expect(keptLocationsIntervalFromEnv({ DSAR_KEPT_LOCATIONS_INTERVAL_MS: 'x' })).toBe(
      DEFAULT_KEPT_LOCATIONS_INTERVAL_MS
    );
  });
});

describe('runKeptLocationsSweep', () => {
  it('clears everything that completed more than 30 days ago, and reports how many', async () => {
    const now = new Date('2026-11-28T12:00:00Z');
    const store = { expireAllLocators: vi.fn(async () => 7) };
    expect(await runKeptLocationsSweep(store, now)).toEqual({ cleared: 7 });
    expect(store.expireAllLocators).toHaveBeenCalledWith(new Date('2026-10-29T12:00:00Z'));
  });
});

describe('startKeptLocationsScheduler', () => {
  afterEach(async () => {
    await stopKeptLocationsScheduler();
    vi.useRealTimers();
  });

  it('does not start with an interval of 0, and starts once otherwise', async () => {
    const run = vi.fn(async () => ({ cleared: 0 }));
    expect(startKeptLocationsScheduler({ intervalMs: 0, run, log: console })).toBe(false);
    vi.useFakeTimers();
    const log = { info: vi.fn(), warn: vi.fn() };
    expect(startKeptLocationsScheduler({ intervalMs: 1000, run, log })).toBe(true);
    // A second start while one runs is declined.
    expect(startKeptLocationsScheduler({ intervalMs: 1000, run, log })).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs soon after start with the default interval, not a day later (a restarted worker still clears)', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => ({ cleared: 0 }));
    const interval = keptLocationsIntervalFromEnv({});
    startKeptLocationsScheduler({
      intervalMs: interval,
      run,
      log: { info: vi.fn(), warn: vi.fn() },
    });
    // A worker that is restarted every few hours still reaches a tick: the first is within the hour.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(1);
    // And it keeps going, through the same single-flight guard.
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('never runs two sweeps at once', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    // Only the first sweep is slow; later ones finish at once, so stopping the timer never hangs.
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ cleared: number }>((resolve) => {
            release = () => resolve({ cleared: 0 });
          })
      )
      .mockResolvedValue({ cleared: 0 });
    startKeptLocationsScheduler({ intervalMs: 1000, run, log: { info: vi.fn(), warn: vi.fn() } });
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);
    release?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('logs a failed tick by error class only, and keeps going', async () => {
    vi.useFakeTimers();
    const log = { info: vi.fn(), warn: vi.fn() };
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('relation for jane@example.invalid is missing'))
      .mockResolvedValue({ cleared: 0 });
    startKeptLocationsScheduler({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith('[kept-locations] tick failed: Error');
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('jane');
  });
});
