/**
 * startApiServer starts the approval sweep (PG-198, A6); createApiServer does not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

const sweep = vi.hoisted(() => ({
  startApprovalSweep: vi.fn(),
  approvalSweepIntervalFromEnv: vi.fn(() => 12_345),
  runApprovalSweep: vi.fn().mockResolvedValue({ locked: true }),
  createDefaultSweepDeps: vi.fn().mockResolvedValue({ marker: 'deps' }),
}));

vi.mock('../agent/approval-sweep-scheduler', () => ({
  startApprovalSweep: sweep.startApprovalSweep,
  approvalSweepIntervalFromEnv: sweep.approvalSweepIntervalFromEnv,
}));
vi.mock('../agent/approval-escalation-sweep', () => ({
  runApprovalSweep: sweep.runApprovalSweep,
  createDefaultSweepDeps: sweep.createDefaultSweepDeps,
}));

import { createApiServer, startApiServer } from '../http-server';

describe('approval sweep wiring', () => {
  let server: ReturnType<typeof startApiServer> | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    vi.clearAllMocks();
  });

  it('createApiServer never starts the sweep', () => {
    createApiServer();
    expect(sweep.startApprovalSweep).not.toHaveBeenCalled();
  });

  it('startApiServer starts it with the env interval and a run that awaits the container', async () => {
    sweep.approvalSweepIntervalFromEnv.mockReturnValue(12_345);
    sweep.runApprovalSweep.mockResolvedValue({ locked: true });
    sweep.createDefaultSweepDeps.mockResolvedValue({ marker: 'deps' });
    server = startApiServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    expect((server.address() as AddressInfo).port).toBeGreaterThan(0);

    expect(sweep.approvalSweepIntervalFromEnv).toHaveBeenCalledWith(process.env);
    const options = sweep.startApprovalSweep.mock.calls[0]![0];
    expect(options.intervalMs).toBe(12_345);

    await expect(options.run()).resolves.toEqual({ locked: true });
    expect(sweep.runApprovalSweep).toHaveBeenCalledWith({ marker: 'deps' });
  });

  it('API_BACKGROUND_JOBS=off starts no sweep, so the idle api makes no outbound traffic', async () => {
    vi.stubEnv('API_BACKGROUND_JOBS', 'off');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      server = startApiServer({ port: 0 });
      await new Promise<void>((resolve) => server!.once('listening', () => resolve()));

      expect(sweep.startApprovalSweep).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('background jobs disabled'));
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('API_BACKGROUND_JOBS=on keeps the sweep running', async () => {
    vi.stubEnv('API_BACKGROUND_JOBS', 'on');
    try {
      server = startApiServer({ port: 0 });
      await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
      expect(sweep.startApprovalSweep).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
