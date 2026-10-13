/**
 * Approval sweep scheduler (PG-198, A6).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_APPROVAL_SWEEP_INTERVAL_MS,
  approvalSweepIntervalFromEnv,
  startApprovalSweep,
  stopApprovalSweep,
} from '../approval-sweep-scheduler';

const quiet = () => ({ warn: vi.fn(), info: vi.fn() });

afterEach(() => {
  stopApprovalSweep();
  vi.useRealTimers();
});

describe('approvalSweepIntervalFromEnv', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(approvalSweepIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(approvalSweepIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(approvalSweepIntervalFromEnv({ VERCEL: '1' })).toBe(0);
    expect(approvalSweepIntervalFromEnv({ AWS_LAMBDA_FUNCTION_NAME: 'fn' })).toBe(0);
  });

  it('defaults to one minute', () => {
    expect(approvalSweepIntervalFromEnv({})).toBe(DEFAULT_APPROVAL_SWEEP_INTERVAL_MS);
    expect(approvalSweepIntervalFromEnv({ APPROVAL_SWEEP_INTERVAL_MS: ' ' })).toBe(60_000);
  });

  it('honours an explicit value, 0 disabling it', () => {
    expect(approvalSweepIntervalFromEnv({ APPROVAL_SWEEP_INTERVAL_MS: '0' })).toBe(0);
    expect(approvalSweepIntervalFromEnv({ APPROVAL_SWEEP_INTERVAL_MS: '30000.7' })).toBe(30_000);
  });

  it('ignores an invalid value', () => {
    expect(approvalSweepIntervalFromEnv({ APPROVAL_SWEEP_INTERVAL_MS: 'soon' })).toBe(60_000);
    expect(approvalSweepIntervalFromEnv({ APPROVAL_SWEEP_INTERVAL_MS: '-5' })).toBe(60_000);
  });
});

describe('startApprovalSweep / stopApprovalSweep', () => {
  it('does not start when disabled', () => {
    const run = vi.fn();
    expect(startApprovalSweep({ intervalMs: 0, run, log: quiet() })).toBe(false);
  });

  it('runs on the interval, unref-ed, and only once at a time', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const log = quiet();

    expect(startApprovalSweep({ intervalMs: 1000, run, log })).toBe(true);
    expect(startApprovalSweep({ intervalMs: 1000, run, log })).toBe(false);
    expect(log.info).toHaveBeenCalledWith('[approval-sweep] started (every 1000 ms)');

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000); // still running: tick skipped
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('unrefs its timer so it never keeps the process alive', () => {
    const unref = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
    const clear = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    try {
      expect(startApprovalSweep({ intervalMs: 1000, run: vi.fn(), log: quiet() })).toBe(true);
      expect(unref).toHaveBeenCalledTimes(1);
    } finally {
      stopApprovalSweep();
      spy.mockRestore();
      clear.mockRestore();
    }
  });

  it('logs a failed tick and keeps going', async () => {
    vi.useFakeTimers();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockRejectedValueOnce('plain')
      .mockResolvedValue(undefined);
    const log = quiet();
    startApprovalSweep({ intervalMs: 500, run, log });

    await vi.advanceTimersByTimeAsync(1500);

    expect(log.warn).toHaveBeenCalledWith('[approval-sweep] tick failed: db down');
    expect(log.warn).toHaveBeenCalledWith('[approval-sweep] tick failed: plain');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('stops cleanly and can start again', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    startApprovalSweep({ intervalMs: 100, run, log: quiet() });
    stopApprovalSweep();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).not.toHaveBeenCalled();
    stopApprovalSweep(); // idempotent
    expect(startApprovalSweep({ intervalMs: 100, run, log: quiet() })).toBe(true);
  });
});
