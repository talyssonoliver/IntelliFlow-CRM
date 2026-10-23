/**
 * startApiServer starts the PG-207 bounce scanner; createApiServer does not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const scan = vi.hoisted(() => ({
  startBounceScanner: vi.fn(),
  bounceScanIntervalFromEnv: vi.fn(() => 54_321),
  runBounceScan: vi.fn().mockResolvedValue({ mailboxesScanned: 0 }),
  createBounceReaderDeps: vi.fn().mockResolvedValue({ marker: 'deps' }),
}));

vi.mock('../modules/email/bounce-scheduler', () => ({
  startBounceScanner: scan.startBounceScanner,
  bounceScanIntervalFromEnv: scan.bounceScanIntervalFromEnv,
}));
vi.mock('../modules/email/bounce-reader', () => ({
  runBounceScan: scan.runBounceScan,
  createBounceReaderDeps: scan.createBounceReaderDeps,
}));

import { createApiServer, startApiServer } from '../http-server';

describe('bounce scanner wiring', () => {
  let server: ReturnType<typeof startApiServer> | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    vi.clearAllMocks();
  });

  it('createApiServer never starts the scanner', () => {
    createApiServer();
    expect(scan.startBounceScanner).not.toHaveBeenCalled();
  });

  it('startApiServer starts it with the env interval and a run that builds deps after the container', async () => {
    scan.bounceScanIntervalFromEnv.mockReturnValue(54_321);
    scan.runBounceScan.mockResolvedValue({ mailboxesScanned: 0 });
    scan.createBounceReaderDeps.mockResolvedValue({ marker: 'deps' });
    server = startApiServer({ port: 0 });
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    expect(scan.bounceScanIntervalFromEnv).toHaveBeenCalledWith(process.env);
    expect(scan.startBounceScanner).toHaveBeenCalledTimes(1);
    const options = scan.startBounceScanner.mock.calls[0]![0] as {
      intervalMs: number;
      run: () => Promise<unknown>;
    };
    expect(options.intervalMs).toBe(54_321);
    await options.run();
    expect(scan.createBounceReaderDeps).toHaveBeenCalledTimes(1);
    expect(scan.runBounceScan).toHaveBeenCalledWith({ marker: 'deps' });
  });
});
