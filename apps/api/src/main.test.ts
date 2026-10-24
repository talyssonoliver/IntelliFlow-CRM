import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startTracing: vi.fn(),
  initializeSentry: vi.fn(),
  startApiServer: vi.fn(),
  disconnectPrisma: vi.fn(),
  shutdownAllQueues: vi.fn(),
  stopApprovalSweep: vi.fn(),
  stopDsarSlaScheduler: vi.fn(),
}));

vi.mock('./tracing/otel', () => ({ startTracing: mocks.startTracing }));
vi.mock('./tracing/sentry', () => ({ initializeSentry: mocks.initializeSentry }));
vi.mock('@intelliflow/db', () => ({ disconnectPrisma: mocks.disconnectPrisma }));
vi.mock('@intelliflow/platform/queues', () => ({ shutdownAllQueues: mocks.shutdownAllQueues }));
vi.mock('./http-server', () => ({ startApiServer: mocks.startApiServer }));
vi.mock('./agent/approval-sweep-scheduler', () => ({
  stopApprovalSweep: mocks.stopApprovalSweep,
}));
vi.mock('./modules/privacy/dsar-sla-scheduler', () => ({
  stopDsarSlaScheduler: mocks.stopDsarSlaScheduler,
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

    expect(mocks.stopApprovalSweep).toHaveBeenCalledTimes(1);
    // PG-203 D8: the DSAR deadline alerts stop before the queues and the database.
    expect(mocks.stopDsarSlaScheduler).toHaveBeenCalledTimes(1);
    expect(mocks.stopDsarSlaScheduler.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shutdownAllQueues.mock.invocationCallOrder[0]!
    );
    expect(mocks.stopApprovalSweep.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shutdownAllQueues.mock.invocationCallOrder[0]!
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
