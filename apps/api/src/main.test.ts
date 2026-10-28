import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startTracing: vi.fn(),
  initializeSentry: vi.fn(),
  startApiServer: vi.fn(),
  disconnectPrisma: vi.fn(),
  shutdownAllQueues: vi.fn(),
  stopBackgroundJobs: vi.fn(),
  stopTaskAutomationRunner: vi.fn(),
}));

vi.mock('./tracing/otel', () => ({ startTracing: mocks.startTracing }));
vi.mock('./tracing/sentry', () => ({ initializeSentry: mocks.initializeSentry }));
vi.mock('@intelliflow/db', () => ({ disconnectPrisma: mocks.disconnectPrisma }));
vi.mock('@intelliflow/platform/queues', () => ({ shutdownAllQueues: mocks.shutdownAllQueues }));
vi.mock('./http-server', () => ({ startApiServer: mocks.startApiServer }));
vi.mock('./background-jobs', () => ({
  stopBackgroundJobs: mocks.stopBackgroundJobs,
}));
vi.mock('./modules/task/automation/task-automation-runner', () => ({
  stopTaskAutomationRunner: mocks.stopTaskAutomationRunner,
}));

describe('api main entry point', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let onSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    mocks.startTracing.mockReset();
    mocks.initializeSentry.mockReset().mockResolvedValue(undefined);
    mocks.startApiServer.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Keep the SIGTERM handler from leaking onto the real process.
    onSpy = vi.spyOn(process, 'on').mockImplementation((() => process) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the server and does not exit when startup succeeds', async () => {
    mocks.startApiServer.mockResolvedValue(undefined);

    await import('./main.js');
    await vi.waitFor(() => expect(mocks.startApiServer).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('logs and exits with code 1 when the server fails to start', async () => {
    const failure = new Error('port in use');
    mocks.startApiServer.mockRejectedValue(failure);

    await import('./main.js');
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));

    expect(errorSpy).toHaveBeenCalledWith('[API] Failed to start API server:', failure);
  });

  it('keeps starting the server when Sentry initialization fails', async () => {
    const sentryError = new Error('sentry down');
    mocks.initializeSentry.mockRejectedValue(sentryError);
    mocks.startApiServer.mockResolvedValue(undefined);

    await import('./main.js');
    await vi.waitFor(() => expect(mocks.startApiServer).toHaveBeenCalledTimes(1));

    expect(errorSpy).toHaveBeenCalledWith('[API] Sentry initialization failed:', sentryError);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('stops the approval sweep on SIGTERM before shutting down (PG-198)', async () => {
    mocks.startApiServer.mockResolvedValue(undefined);
    mocks.shutdownAllQueues.mockResolvedValue(undefined);
    mocks.disconnectPrisma.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('./main.js');
    const handler = onSpy.mock.calls.find(
      (c: unknown[]) => c[0] === 'SIGTERM'
    )![1] as () => Promise<void>;
    await handler();

    // PG-208: the task-automation runner stops before queues and Prisma close.
    expect(mocks.stopTaskAutomationRunner).toHaveBeenCalledTimes(1);
    expect(mocks.stopTaskAutomationRunner.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shutdownAllQueues.mock.invocationCallOrder[0]!
    );
    expect(mocks.stopBackgroundJobs).toHaveBeenCalledTimes(1);
    expect(mocks.stopBackgroundJobs.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shutdownAllQueues.mock.invocationCallOrder[0]!
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  describe('a job tick that never finishes', () => {
    async function sigterm(): Promise<() => Promise<void>> {
      mocks.startApiServer.mockResolvedValue(undefined);
      mocks.shutdownAllQueues.mockResolvedValue(undefined);
      mocks.disconnectPrisma.mockResolvedValue(undefined);
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await import('./main.js');
      return onSpy.mock.calls.find((c: unknown[]) => c[0] === 'SIGTERM')![1] as () => Promise<void>;
    }

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('does not block the queues, Prisma or the exit past the default 10s cap', async () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mocks.stopBackgroundJobs.mockReturnValue(new Promise<void>(() => undefined));
      const handler = await sigterm();

      const done = handler();
      await vi.advanceTimersByTimeAsync(9_999);
      expect(mocks.shutdownAllQueues).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await done;

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('still running after 10000ms'));
      expect(mocks.shutdownAllQueues).toHaveBeenCalledTimes(1);
      expect(mocks.disconnectPrisma).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('honours API_SHUTDOWN_JOBS_TIMEOUT_MS and ignores an invalid value', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mocks.stopBackgroundJobs.mockReturnValue(new Promise<void>(() => undefined));
      vi.stubEnv('API_SHUTDOWN_JOBS_TIMEOUT_MS', '250');
      const handler = await sigterm();

      const done = handler();
      await vi.advanceTimersByTimeAsync(250);
      await done;
      expect(mocks.shutdownAllQueues).toHaveBeenCalledTimes(1);
    });

    it('falls back to 10s for a non-numeric timeout', async () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mocks.stopBackgroundJobs.mockReturnValue(new Promise<void>(() => undefined));
      vi.stubEnv('API_SHUTDOWN_JOBS_TIMEOUT_MS', 'soon');
      const handler = await sigterm();

      const done = handler();
      await vi.advanceTimersByTimeAsync(10_000);
      await done;
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('10000ms'));
    });

    it('a tick that finishes in time wins the race and logs no warning', async () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mocks.stopBackgroundJobs.mockResolvedValue(undefined);
      const handler = await sigterm();

      await handler();

      expect(warn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0); // the cap timer was cleared
    });
  });
});
