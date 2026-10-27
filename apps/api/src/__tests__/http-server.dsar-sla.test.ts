/**
 * startApiServer starts the PG-203 DSAR deadline alerts through the shared
 * background jobs (API_BACKGROUND_JOBS); createApiServer does not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const sla = vi.hoisted(() => ({
  startDsarSlaScheduler: vi.fn(),
  stopDsarSlaScheduler: vi.fn(async () => undefined),
  dsarSlaIntervalFromEnv: vi.fn(() => 98_765),
  runDsarSlaSweep: vi.fn(),
  createDsarSlaDeps: vi.fn(),
}));

vi.mock('../modules/privacy/dsar-sla-scheduler', () => sla);

import { createApiServer, startApiServer } from '../http-server';

describe('DSAR deadline alert wiring', () => {
  let server: ReturnType<typeof startApiServer> | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    vi.clearAllMocks();
  });

  it('API_BACKGROUND_JOBS=off starts no alerts, so an idle api can sleep', async () => {
    vi.stubEnv('API_BACKGROUND_JOBS', 'off');
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      server = startApiServer({ port: 0 });
      await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
      expect(sla.startDsarSlaScheduler).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('createApiServer never starts the alerts', () => {
    createApiServer();
    expect(sla.startDsarSlaScheduler).not.toHaveBeenCalled();
  });

  it('startApiServer starts them with the env interval and a run that builds deps after the container', async () => {
    sla.dsarSlaIntervalFromEnv.mockReturnValue(98_765);
    sla.createDsarSlaDeps.mockResolvedValue({ marker: 'deps' });
    sla.runDsarSlaSweep.mockResolvedValue({ claimed: 0, alerted: 0, failed: 0, noRecipient: 0 });
    server = startApiServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    expect(sla.dsarSlaIntervalFromEnv).toHaveBeenCalledWith(process.env);
    expect(sla.startDsarSlaScheduler).toHaveBeenCalledTimes(1);
    const options = sla.startDsarSlaScheduler.mock.calls[0]![0] as {
      intervalMs: number;
      run: () => Promise<unknown>;
    };
    expect(options.intervalMs).toBe(98_765);
    await options.run();
    expect(sla.createDsarSlaDeps).toHaveBeenCalledTimes(1);
    expect(sla.runDsarSlaSweep).toHaveBeenCalledWith({ marker: 'deps' });
  });
});
