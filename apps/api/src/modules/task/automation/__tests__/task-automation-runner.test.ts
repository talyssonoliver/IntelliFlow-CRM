/**
 * Task automation runner (PG-208).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_TASK_AUTOMATION_INTERVAL_MS,
  taskAutomationRunnerIntervalFromEnv,
  startTaskAutomationRunner,
  stopTaskAutomationRunner,
} from '../task-automation-runner';

const quiet = () => ({ warn: vi.fn(), info: vi.fn() });

afterEach(() => {
  stopTaskAutomationRunner();
  vi.useRealTimers();
});

describe('taskAutomationRunnerIntervalFromEnv', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(taskAutomationRunnerIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(taskAutomationRunnerIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(taskAutomationRunnerIntervalFromEnv({ VERCEL: '1' })).toBe(0);
    expect(taskAutomationRunnerIntervalFromEnv({ AWS_LAMBDA_FUNCTION_NAME: 'fn' })).toBe(0);
  });

  it('defaults to fifteen seconds', () => {
    expect(taskAutomationRunnerIntervalFromEnv({})).toBe(DEFAULT_TASK_AUTOMATION_INTERVAL_MS);
    expect(taskAutomationRunnerIntervalFromEnv({ TASK_AUTOMATION_INTERVAL_MS: ' ' })).toBe(15_000);
  });

  it('honours an explicit value, 0 disabling it', () => {
    expect(taskAutomationRunnerIntervalFromEnv({ TASK_AUTOMATION_INTERVAL_MS: '0' })).toBe(0);
    expect(taskAutomationRunnerIntervalFromEnv({ TASK_AUTOMATION_INTERVAL_MS: '30000.7' })).toBe(
      30_000
    );
  });

  it('ignores an invalid value', () => {
    expect(taskAutomationRunnerIntervalFromEnv({ TASK_AUTOMATION_INTERVAL_MS: 'soon' })).toBe(
      15_000
    );
    expect(taskAutomationRunnerIntervalFromEnv({ TASK_AUTOMATION_INTERVAL_MS: '-5' })).toBe(15_000);
  });
});

describe('startTaskAutomationRunner / stopTaskAutomationRunner', () => {
  it('does not start when disabled', () => {
    const run = vi.fn();
    expect(startTaskAutomationRunner({ intervalMs: 0, run, log: quiet() })).toBe(false);
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

    expect(startTaskAutomationRunner({ intervalMs: 1000, run, log })).toBe(true);
    expect(startTaskAutomationRunner({ intervalMs: 1000, run, log })).toBe(false);
    expect(log.info).toHaveBeenCalledWith('[task-automation] runner started (every 1000 ms)');

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
      expect(startTaskAutomationRunner({ intervalMs: 1000, run: vi.fn(), log: quiet() })).toBe(
        true
      );
      expect(unref).toHaveBeenCalledTimes(1);
    } finally {
      stopTaskAutomationRunner();
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
    startTaskAutomationRunner({ intervalMs: 500, run, log });

    await vi.advanceTimersByTimeAsync(1500);

    expect(log.warn).toHaveBeenCalledWith('[task-automation] tick failed: db down');
    expect(log.warn).toHaveBeenCalledWith('[task-automation] tick failed: plain');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('stops cleanly and can start again', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);
    startTaskAutomationRunner({ intervalMs: 100, run, log: quiet() });
    stopTaskAutomationRunner();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).not.toHaveBeenCalled();
    stopTaskAutomationRunner(); // idempotent
    expect(startTaskAutomationRunner({ intervalMs: 100, run, log: quiet() })).toBe(true);
  });
});
