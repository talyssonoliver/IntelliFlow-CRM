/**
 * API_BACKGROUND_JOBS flag and the shared start/stop for the approval sweep and
 * bounce scanner (idle-sleep: an idle api must make no outbound traffic).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type SchedulerOptions = { intervalMs: number; run: () => Promise<unknown> };

const m = vi.hoisted(() => ({
  startApprovalSweep: vi.fn((_options: SchedulerOptions) => true),
  stopApprovalSweep: vi.fn(),
  approvalSweepIntervalFromEnv: vi.fn(() => 111),
  runApprovalSweep: vi.fn().mockResolvedValue({ locked: true }),
  createDefaultSweepDeps: vi.fn().mockResolvedValue({ marker: 'sweep-deps' }),
  startBounceScanner: vi.fn((_options: SchedulerOptions) => true),
  stopBounceScanner: vi.fn(),
  bounceScanIntervalFromEnv: vi.fn(() => 222),
  runBounceScan: vi.fn().mockResolvedValue({ mailboxesScanned: 0 }),
  createBounceReaderDeps: vi.fn().mockResolvedValue({ marker: 'bounce-deps' }),
}));

vi.mock('../agent/approval-sweep-scheduler', () => ({
  startApprovalSweep: m.startApprovalSweep,
  stopApprovalSweep: m.stopApprovalSweep,
  approvalSweepIntervalFromEnv: m.approvalSweepIntervalFromEnv,
}));
vi.mock('../agent/approval-escalation-sweep', () => ({
  runApprovalSweep: m.runApprovalSweep,
  createDefaultSweepDeps: m.createDefaultSweepDeps,
}));
vi.mock('../modules/email/bounce-scheduler', () => ({
  startBounceScanner: m.startBounceScanner,
  stopBounceScanner: m.stopBounceScanner,
  bounceScanIntervalFromEnv: m.bounceScanIntervalFromEnv,
}));
vi.mock('../modules/email/bounce-reader', () => ({
  runBounceScan: m.runBounceScan,
  createBounceReaderDeps: m.createBounceReaderDeps,
}));
vi.mock('../container', () => ({ containerReady: Promise.resolve('container') }));

import {
  API_BACKGROUND_JOBS_ENV,
  apiBackgroundJobsEnabled,
  backgroundJobsFlagEnabled,
  startBackgroundJobs,
  stopBackgroundJobs,
} from '../background-jobs';

// The project config resets mocks between tests, so (re)install the defaults.
beforeEach(() => {
  m.startApprovalSweep.mockReturnValue(true);
  m.startBounceScanner.mockReturnValue(true);
  m.approvalSweepIntervalFromEnv.mockReturnValue(111);
  m.bounceScanIntervalFromEnv.mockReturnValue(222);
  m.runApprovalSweep.mockResolvedValue({ locked: true });
  m.createDefaultSweepDeps.mockResolvedValue({ marker: 'sweep-deps' });
  m.runBounceScan.mockResolvedValue({ mailboxesScanned: 0 });
  m.createBounceReaderDeps.mockResolvedValue({ marker: 'bounce-deps' });
});

describe('backgroundJobsFlagEnabled', () => {
  it('defaults to on when unset or empty', () => {
    expect(backgroundJobsFlagEnabled(undefined)).toBe(true);
    expect(backgroundJobsFlagEnabled('')).toBe(true);
    expect(backgroundJobsFlagEnabled('   ')).toBe(true);
  });

  it.each(['on', 'true', '1', 'yes', 'anything-else'])('treats %s as on', (value) => {
    expect(backgroundJobsFlagEnabled(value)).toBe(true);
  });

  it.each(['off', 'OFF', ' Off ', 'false', '0', 'no', 'disabled'])('treats %s as off', (value) => {
    expect(backgroundJobsFlagEnabled(value)).toBe(false);
  });
});

describe('apiBackgroundJobsEnabled', () => {
  it('reads API_BACKGROUND_JOBS', () => {
    expect(API_BACKGROUND_JOBS_ENV).toBe('API_BACKGROUND_JOBS');
    expect(apiBackgroundJobsEnabled({})).toBe(true);
    expect(apiBackgroundJobsEnabled({ API_BACKGROUND_JOBS: 'off' })).toBe(false);
    expect(apiBackgroundJobsEnabled({ API_BACKGROUND_JOBS: 'on' })).toBe(true);
  });
});

describe('startBackgroundJobs / stopBackgroundJobs', () => {
  it('starts both jobs with the env intervals and reports what started', () => {
    const env = { MARK: 'x' } as NodeJS.ProcessEnv;
    const result = startBackgroundJobs({ env, ready: async () => undefined });

    expect(result).toEqual({ approvalSweep: true, bounceScan: true });
    expect(m.approvalSweepIntervalFromEnv).toHaveBeenCalledWith(env);
    expect(m.bounceScanIntervalFromEnv).toHaveBeenCalledWith(env);
    expect(m.startApprovalSweep.mock.calls[0]![0]).toMatchObject({ intervalMs: 111 });
    expect(m.startBounceScanner.mock.calls[0]![0]).toMatchObject({ intervalMs: 222 });
  });

  it('reports a job that its scheduler declined to start', () => {
    m.startApprovalSweep.mockReturnValueOnce(false);
    const result = startBackgroundJobs({ env: {}, ready: async () => undefined });
    expect(result).toEqual({ approvalSweep: false, bounceScan: true });
  });

  it('each run waits for readiness, then builds deps and runs the job', async () => {
    const order: string[] = [];
    const ready = vi.fn(async () => {
      order.push('ready');
    });
    m.createDefaultSweepDeps.mockImplementationOnce(async () => {
      order.push('sweep-deps');
      return { marker: 'sweep-deps' };
    });
    m.createBounceReaderDeps.mockImplementationOnce(async () => {
      order.push('bounce-deps');
      return { marker: 'bounce-deps' };
    });
    startBackgroundJobs({ env: {}, ready });

    await expect(m.startApprovalSweep.mock.calls[0]![0].run()).resolves.toEqual({ locked: true });
    expect(m.runApprovalSweep).toHaveBeenCalledWith({ marker: 'sweep-deps' });
    await expect(m.startBounceScanner.mock.calls[0]![0].run()).resolves.toEqual({
      mailboxesScanned: 0,
    });
    expect(m.runBounceScan).toHaveBeenCalledWith({ marker: 'bounce-deps' });
    expect(order).toEqual(['ready', 'sweep-deps', 'ready', 'bounce-deps']);
  });

  it('defaults readiness to the api container', async () => {
    startBackgroundJobs({ env: {} });
    await expect(m.startApprovalSweep.mock.calls[0]![0].run()).resolves.toEqual({ locked: true });
    expect(m.createDefaultSweepDeps).toHaveBeenCalledTimes(1);
  });

  it('stops both schedulers', () => {
    stopBackgroundJobs();
    expect(m.stopApprovalSweep).toHaveBeenCalledTimes(1);
    expect(m.stopBounceScanner).toHaveBeenCalledTimes(1);
  });
});
