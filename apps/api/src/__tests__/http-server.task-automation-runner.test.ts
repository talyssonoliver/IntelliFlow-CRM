/**
 * PG-208: startApiServer starts the task-automation runner (and with it the
 * event intake) when the interval is on; createApiServer never does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const automation = vi.hoisted(() => ({
  startTaskAutomationRunner: vi.fn(),
  taskAutomationRunnerIntervalFromEnv: vi.fn(() => 15_000),
  createTaskAutomationRuntime: vi.fn(),
  tick: vi.fn().mockResolvedValue({ drained: 0, scheduled: 0, executed: 0 }),
}));

vi.mock('../modules/task/automation/task-automation-runner', () => ({
  startTaskAutomationRunner: automation.startTaskAutomationRunner,
  taskAutomationRunnerIntervalFromEnv: automation.taskAutomationRunnerIntervalFromEnv,
}));
vi.mock('../modules/task/automation/task-automation-runtime', () => ({
  createTaskAutomationRuntime: automation.createTaskAutomationRuntime,
  getTaskAutomationWebhookDeps: vi.fn(),
}));
vi.mock('../agent/approval-sweep-scheduler', () => ({
  startApprovalSweep: vi.fn(),
  approvalSweepIntervalFromEnv: vi.fn(() => 0),
}));
vi.mock('../container', () => ({ container: {}, containerReady: Promise.resolve() }));

import { createApiServer, startApiServer } from '../http-server';

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('task automation runner wiring', () => {
  let server: ReturnType<typeof startApiServer> | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    vi.clearAllMocks();
  });

  it('createApiServer never builds the runtime or starts the runner', () => {
    createApiServer();
    expect(automation.createTaskAutomationRuntime).not.toHaveBeenCalled();
    expect(automation.startTaskAutomationRunner).not.toHaveBeenCalled();
  });

  it('startApiServer builds the runtime after the container and starts the runner with its tick', async () => {
    automation.taskAutomationRunnerIntervalFromEnv.mockReturnValue(15_000);
    automation.createTaskAutomationRuntime.mockResolvedValue({ tick: automation.tick });
    server = startApiServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    await settle();

    expect(automation.taskAutomationRunnerIntervalFromEnv).toHaveBeenCalledWith(process.env);
    expect(automation.createTaskAutomationRuntime).toHaveBeenCalledTimes(1);
    const options = automation.startTaskAutomationRunner.mock.calls[0]![0];
    expect(options.intervalMs).toBe(15_000);
    await options.run();
    expect(automation.tick).toHaveBeenCalled();
  });

  it('builds nothing (no event intake) when the interval is 0', async () => {
    automation.taskAutomationRunnerIntervalFromEnv.mockReturnValue(0);
    server = startApiServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    await settle();
    expect(automation.createTaskAutomationRuntime).not.toHaveBeenCalled();
    expect(automation.startTaskAutomationRunner).not.toHaveBeenCalled();
  });

  it('logs and keeps serving when the runtime fails to start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    automation.taskAutomationRunnerIntervalFromEnv.mockReturnValue(15_000);
    automation.createTaskAutomationRuntime.mockRejectedValue(new Error('no db'));
    server = startApiServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    await settle();
    expect(error).toHaveBeenCalledWith('[task-automation] runtime failed to start:', 'no db');
    expect(automation.startTaskAutomationRunner).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
