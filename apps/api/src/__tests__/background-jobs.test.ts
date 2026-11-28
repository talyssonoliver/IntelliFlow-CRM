/**
 * API_BACKGROUND_JOBS flag and the shared start/stop for the approval sweep, the
 * bounce scanner, the Outlook inbox sync (idle-sleep: an idle api must make no outbound traffic).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type SchedulerOptions = { intervalMs: number; run: () => Promise<unknown> };

const m = vi.hoisted(() => ({
  startApprovalSweep: vi.fn((_options: SchedulerOptions) => true),
  stopApprovalSweep: vi.fn<() => Promise<void>>(async () => undefined),
  approvalSweepIntervalFromEnv: vi.fn(() => 111),
  runApprovalSweep: vi.fn().mockResolvedValue({ locked: true }),
  createDefaultSweepDeps: vi.fn().mockResolvedValue({ marker: 'sweep-deps' }),
  startBounceScanner: vi.fn((_options: SchedulerOptions) => true),
  stopBounceScanner: vi.fn<() => Promise<void>>(async () => undefined),
  checkBackgroundJobsHeartbeat: vi.fn(async () => ({ status: 'ok' })),
  closeHeartbeatStore: vi.fn<() => Promise<void>>(async () => undefined),
  markJobsRunningHere: vi.fn(),
  bounceScanIntervalFromEnv: vi.fn(() => 222),
  runBounceScan: vi.fn().mockResolvedValue({ mailboxesScanned: 0 }),
  createBounceReaderDeps: vi.fn().mockResolvedValue({ marker: 'bounce-deps' }),
  startDsarSlaScheduler: vi.fn((_options: SchedulerOptions) => true),
  stopDsarSlaScheduler: vi.fn<() => Promise<void>>(async () => undefined),
  dsarSlaIntervalFromEnv: vi.fn(() => 333),
  runDsarSlaSweep: vi.fn().mockResolvedValue({ alerted: 0 }),
  createDsarSlaDeps: vi.fn().mockResolvedValue({ marker: 'dsar-deps' }),
  startComplianceSnapshotScheduler: vi.fn((_options: SchedulerOptions) => true),
  stopComplianceSnapshotScheduler: vi.fn<() => Promise<void>>(async () => undefined),
  complianceSnapshotIntervalFromEnv: vi.fn(() => 555),
  runComplianceSnapshots: vi.fn().mockResolvedValue({ tenants: 0, failed: 0 }),
  createComplianceSnapshotDb: vi.fn().mockResolvedValue({ marker: 'compliance-db' }),
  startKeptLocationsScheduler: vi.fn((_options: SchedulerOptions) => true),
  stopKeptLocationsScheduler: vi.fn<() => Promise<void>>(async () => undefined),
  keptLocationsIntervalFromEnv: vi.fn(() => 666),
  runKeptLocationsSweep: vi.fn().mockResolvedValue({ cleared: 0 }),
  createKeptLocationsStore: vi.fn().mockResolvedValue({ marker: 'kept-store' }),
  runInboxSync: vi.fn().mockResolvedValue({ mailboxesSynced: 0 }),
  createInboxSyncDeps: vi.fn().mockResolvedValue({ marker: 'sync-deps' }),
  startInboxSync: vi.fn((_options: SchedulerOptions) => true),
  stopInboxSync: vi.fn<() => Promise<void>>(async () => undefined),
  inboxSyncIntervalFromEnv: vi.fn(() => 444),
  runCalendarSyncTick: vi.fn().mockResolvedValue(undefined),
  calendarSyncEnabled: vi.fn(() => true),
}));

vi.mock('../modules/calendar/google-calendar-sync', () => ({
  runCalendarSyncTick: m.runCalendarSyncTick,
  calendarSyncEnabled: m.calendarSyncEnabled,
}));
vi.mock('../modules/email/outlook-inbox-sync', () => ({
  runInboxSync: m.runInboxSync,
  createInboxSyncDeps: m.createInboxSyncDeps,
}));
vi.mock('../modules/email/inbox-sync-scheduler', () => ({
  startInboxSync: m.startInboxSync,
  stopInboxSync: m.stopInboxSync,
  inboxSyncIntervalFromEnv: m.inboxSyncIntervalFromEnv,
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
vi.mock('../modules/privacy/dsar-sla-scheduler', () => ({
  startDsarSlaScheduler: m.startDsarSlaScheduler,
  stopDsarSlaScheduler: m.stopDsarSlaScheduler,
  dsarSlaIntervalFromEnv: m.dsarSlaIntervalFromEnv,
  runDsarSlaSweep: m.runDsarSlaSweep,
  createDsarSlaDeps: m.createDsarSlaDeps,
}));
vi.mock('../modules/compliance/compliance-snapshot-scheduler', () => ({
  startComplianceSnapshotScheduler: m.startComplianceSnapshotScheduler,
  stopComplianceSnapshotScheduler: m.stopComplianceSnapshotScheduler,
  complianceSnapshotIntervalFromEnv: m.complianceSnapshotIntervalFromEnv,
  runComplianceSnapshots: m.runComplianceSnapshots,
  createComplianceSnapshotDb: m.createComplianceSnapshotDb,
}));
vi.mock('../modules/privacy/dsar-kept-locations-scheduler', () => ({
  startKeptLocationsScheduler: m.startKeptLocationsScheduler,
  stopKeptLocationsScheduler: m.stopKeptLocationsScheduler,
  keptLocationsIntervalFromEnv: m.keptLocationsIntervalFromEnv,
  runKeptLocationsSweep: m.runKeptLocationsSweep,
  createKeptLocationsStore: m.createKeptLocationsStore,
}));
vi.mock('../background-jobs-heartbeat', () => ({
  checkBackgroundJobsHeartbeat: m.checkBackgroundJobsHeartbeat,
  closeHeartbeatStore: m.closeHeartbeatStore,
  getHeartbeatStore: () => null,
  markJobsRunningHere: m.markJobsRunningHere,
}));
vi.mock('../container', () => ({ containerReady: Promise.resolve('container') }));

import {
  API_BACKGROUND_JOBS_ENV,
  apiBackgroundJobsEnabled,
  backgroundJobsFlagEnabled,
  checkBackgroundJobsHealth,
  HEARTBEAT_WRITE_TIMEOUT_MS,
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
  m.stopApprovalSweep.mockResolvedValue(undefined);
  m.stopBounceScanner.mockResolvedValue(undefined);
  m.checkBackgroundJobsHeartbeat.mockResolvedValue({ status: 'ok' });
  m.closeHeartbeatStore.mockResolvedValue(undefined);
  m.startDsarSlaScheduler.mockReturnValue(true);
  m.stopDsarSlaScheduler.mockResolvedValue(undefined);
  m.dsarSlaIntervalFromEnv.mockReturnValue(333);
  m.runDsarSlaSweep.mockResolvedValue({ alerted: 0 });
  m.createDsarSlaDeps.mockResolvedValue({ marker: 'dsar-deps' });
  m.startComplianceSnapshotScheduler.mockReturnValue(true);
  m.stopComplianceSnapshotScheduler.mockResolvedValue(undefined);
  m.complianceSnapshotIntervalFromEnv.mockReturnValue(555);
  m.runComplianceSnapshots.mockResolvedValue({ tenants: 0, failed: 0 });
  m.createComplianceSnapshotDb.mockResolvedValue({ marker: 'compliance-db' });
  m.startKeptLocationsScheduler.mockReturnValue(true);
  m.stopKeptLocationsScheduler.mockResolvedValue(undefined);
  m.keptLocationsIntervalFromEnv.mockReturnValue(666);
  m.runKeptLocationsSweep.mockResolvedValue({ cleared: 0 });
  m.createKeptLocationsStore.mockResolvedValue({ marker: 'kept-store' });
  m.runInboxSync.mockResolvedValue({ mailboxesSynced: 0 });
  m.runCalendarSyncTick.mockResolvedValue(undefined);
  m.calendarSyncEnabled.mockReturnValue(true);
  m.createInboxSyncDeps.mockResolvedValue({ marker: 'sync-deps' });
  m.startInboxSync.mockReturnValue(true);
  m.stopInboxSync.mockResolvedValue(undefined);
  m.inboxSyncIntervalFromEnv.mockReturnValue(444);
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

    expect(result).toEqual({
      approvalSweep: true,
      bounceScan: true,
      inboxSync: true,
      dsarSla: true,
      complianceSnapshot: true,
      keptLocations: true,
    });
    expect(m.approvalSweepIntervalFromEnv).toHaveBeenCalledWith(env);
    expect(m.bounceScanIntervalFromEnv).toHaveBeenCalledWith(env);
    expect(m.startApprovalSweep.mock.calls[0]![0]).toMatchObject({ intervalMs: 111 });
    expect(m.startBounceScanner.mock.calls[0]![0]).toMatchObject({ intervalMs: 222 });
  });

  it('reports a job that its scheduler declined to start', () => {
    m.startApprovalSweep.mockReturnValueOnce(false);
    const result = startBackgroundJobs({ env: {}, ready: async () => undefined });
    expect(result).toEqual({
      approvalSweep: false,
      bounceScan: true,
      inboxSync: true,
      dsarSla: true,
      complianceSnapshot: true,
      keptLocations: true,
    });
  });

  // IFC-316: the daily clearing of kept file locations.
  it('starts the kept-locations clearing with its env interval; a run builds the store and sweeps', async () => {
    const env = { MARK: 'k' } as NodeJS.ProcessEnv;
    startBackgroundJobs({ env, ready: async () => undefined });
    expect(m.keptLocationsIntervalFromEnv).toHaveBeenCalledWith(env);
    const options = m.startKeptLocationsScheduler.mock.calls[0]![0] as SchedulerOptions;
    expect(options.intervalMs).toBe(666);
    await options.run();
    expect(m.runKeptLocationsSweep).toHaveBeenCalledWith({ marker: 'kept-store' });
  });

  it('stops the kept-locations clearing with the other timers', async () => {
    await stopBackgroundJobs();
    expect(m.stopKeptLocationsScheduler).toHaveBeenCalled();
  });

  // PG-194: the daily compliance snapshots start with their env interval and run against the db.
  it('starts the compliance snapshots with their env interval; a run builds the db', async () => {
    const env = { MARK: 'c' } as NodeJS.ProcessEnv;
    startBackgroundJobs({ env, ready: async () => undefined });
    expect(m.complianceSnapshotIntervalFromEnv).toHaveBeenCalledWith(env);
    const options = m.startComplianceSnapshotScheduler.mock.calls[0]![0] as SchedulerOptions;
    expect(options.intervalMs).toBe(555);
    await options.run();
    expect(m.runComplianceSnapshots).toHaveBeenCalledWith(
      { marker: 'compliance-db' },
      expect.any(Date),
      expect.anything()
    );
  });

  // PG-203 D8: the DSAR deadline alerts follow the same flag, so an api with
  // API_BACKGROUND_JOBS=off makes no outbound traffic for them either.
  it('starts the DSAR deadline alerts with their env interval; a run builds deps and beats', async () => {
    const env = { MARK: 'x' } as NodeJS.ProcessEnv;
    const heartbeat = {
      record: vi.fn(async (_job: string, _at: number) => undefined),
      read: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const order: string[] = [];
    const ready = vi.fn(async () => {
      order.push('ready');
    });
    m.createDsarSlaDeps.mockImplementationOnce(async () => {
      order.push('dsar-deps');
      return { marker: 'dsar-deps' };
    });
    startBackgroundJobs({ env, ready, heartbeat });

    expect(m.dsarSlaIntervalFromEnv).toHaveBeenCalledWith(env);
    expect(m.startDsarSlaScheduler.mock.calls[0]![0]).toMatchObject({ intervalMs: 333 });
    await expect(m.startDsarSlaScheduler.mock.calls[0]![0].run()).resolves.toEqual({
      alerted: 0,
    });
    expect(m.runDsarSlaSweep).toHaveBeenCalledWith({ marker: 'dsar-deps' });
    expect(order).toEqual(['ready', 'dsar-deps']);
    expect(heartbeat.record).toHaveBeenCalledWith('dsarSla', expect.any(Number));
  });

  it('counts the DSAR alerts as jobs running here even when the others are off', () => {
    m.startApprovalSweep.mockReturnValueOnce(false);
    m.startBounceScanner.mockReturnValueOnce(false);
    startBackgroundJobs({ env: {}, ready: async () => undefined });
    expect(m.markJobsRunningHere).toHaveBeenLastCalledWith(true);
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

  describe('Outlook inbox sync on its own timer (#1177)', () => {
    it('starts with its env interval; a run waits for readiness, then builds deps and syncs', async () => {
      const env = { MARK: 'x' } as NodeJS.ProcessEnv;
      const order: string[] = [];
      const ready = vi.fn(async () => {
        order.push('ready');
      });
      m.createInboxSyncDeps.mockImplementationOnce(async () => {
        order.push('sync-deps');
        return { marker: 'sync-deps' };
      });
      startBackgroundJobs({ env, ready });

      expect(m.inboxSyncIntervalFromEnv).toHaveBeenCalledWith(env);
      expect(m.startInboxSync.mock.calls[0]![0]).toMatchObject({ intervalMs: 444 });
      await expect(m.startInboxSync.mock.calls[0]![0].run()).resolves.toEqual({
        mailboxesSynced: 0,
      });
      expect(m.runInboxSync).toHaveBeenCalledWith({ marker: 'sync-deps' });
      expect(order).toEqual(['ready', 'sync-deps']);
    });

    it('is not part of the bounce tick: a bounce tick never runs the sync', async () => {
      startBackgroundJobs({ env: {}, ready: async () => undefined });

      await expect(m.startBounceScanner.mock.calls[0]![0].run()).resolves.toEqual({
        mailboxesScanned: 0,
      });
      expect(m.createInboxSyncDeps).not.toHaveBeenCalled();
      expect(m.runInboxSync).not.toHaveBeenCalled();
    });

    it('runs the Google Calendar sync in the same tick, after the inbox sync, with the same env and log', async () => {
      const env = { GOOGLE_CALENDAR_SYNC: 'on' } as NodeJS.ProcessEnv;
      const log = { warn: vi.fn(), info: vi.fn() };
      const order: string[] = [];
      m.runInboxSync.mockImplementationOnce(async () => {
        order.push('inbox');
        return { mailboxesSynced: 0 };
      });
      m.runCalendarSyncTick.mockImplementationOnce(async () => {
        order.push('calendar');
      });
      startBackgroundJobs({ env, log, ready: async () => undefined });

      await m.startInboxSync.mock.calls[0]![0].run();

      expect(order).toEqual(['inbox', 'calendar']);
      expect(m.runCalendarSyncTick).toHaveBeenCalledWith(env, log);
    });

    it('still runs the calendar sync when the inbox sync fails, and the failure still shows', async () => {
      m.runInboxSync.mockRejectedValueOnce(new Error('graph down'));
      startBackgroundJobs({ env: {}, ready: async () => undefined });

      await expect(m.startInboxSync.mock.calls[0]![0].run()).rejects.toThrow('graph down');
      expect(m.runCalendarSyncTick).toHaveBeenCalledTimes(1);
    });

    it('says so once when the inbox timer is off, because the calendar sync rides on it', () => {
      const log = { warn: vi.fn(), info: vi.fn() };
      m.startInboxSync.mockReturnValueOnce(false);
      startBackgroundJobs({ env: {}, log, ready: async () => undefined });

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('[calendar-sync] not running'));

      log.info.mockClear();
      m.calendarSyncEnabled.mockReturnValueOnce(false);
      m.startInboxSync.mockReturnValueOnce(false);
      startBackgroundJobs({ env: {}, log, ready: async () => undefined });
      expect(log.info).not.toHaveBeenCalled();
    });
    it('a sync failure stays in its own tick (the scheduler logs it)', async () => {
      m.runInboxSync.mockRejectedValueOnce(new Error('graph down'));
      startBackgroundJobs({ env: {}, ready: async () => undefined });

      await expect(m.startInboxSync.mock.calls[0]![0].run()).rejects.toThrow('graph down');
    });
  });

  it('defaults readiness to the api container', async () => {
    startBackgroundJobs({ env: {} });
    await expect(m.startApprovalSweep.mock.calls[0]![0].run()).resolves.toEqual({ locked: true });
    expect(m.createDefaultSweepDeps).toHaveBeenCalledTimes(1);
  });

  it('stops both schedulers and waits for both in-flight ticks', async () => {
    let finishSweep!: () => void;
    m.stopApprovalSweep.mockImplementation(() => new Promise<void>((r) => (finishSweep = r)));
    let done = false;

    const stopping = stopBackgroundJobs().then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(m.stopApprovalSweep).toHaveBeenCalledTimes(1);
    expect(m.stopBounceScanner).toHaveBeenCalledTimes(1);
    expect(m.stopInboxSync).toHaveBeenCalledTimes(1);
    expect(m.stopDsarSlaScheduler).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    expect(m.closeHeartbeatStore).not.toHaveBeenCalled(); // only after the ticks drained

    finishSweep();
    await stopping;
    expect(done).toBe(true);
    expect(m.closeHeartbeatStore).toHaveBeenCalledTimes(1);
  });

  it('waits for a DSAR alert tick in flight before closing the heartbeat', async () => {
    let finishDsar!: () => void;
    m.stopDsarSlaScheduler.mockImplementation(() => new Promise<void>((r) => (finishDsar = r)));
    let done = false;

    const stopping = stopBackgroundJobs().then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(done).toBe(false);
    expect(m.closeHeartbeatStore).not.toHaveBeenCalled();

    finishDsar();
    await stopping;
    expect(m.closeHeartbeatStore).toHaveBeenCalledTimes(1);
  });

  it('still resolves when closing the heartbeat connection fails', async () => {
    m.closeHeartbeatStore.mockRejectedValue(new Error('boom'));
    await expect(stopBackgroundJobs()).resolves.toBeUndefined();
  });
});

describe('heartbeat', () => {
  const store = () => ({
    record: vi.fn(async (_job: string, _at: number) => undefined),
    read: vi.fn(),
    close: vi.fn(async () => undefined),
  });

  it('each finished tick records its own heartbeat, after the job completed', async () => {
    const heartbeat = store();
    const order: string[] = [];
    m.runApprovalSweep.mockImplementation(async () => {
      order.push('sweep');
      return { locked: true };
    });
    heartbeat.record.mockImplementation(async (job: string) => {
      order.push(`beat:${job}`);
    });
    startBackgroundJobs({ env: {}, ready: async () => undefined, heartbeat });

    await m.startApprovalSweep.mock.calls[0]![0].run();
    await m.startBounceScanner.mock.calls[0]![0].run();

    expect(order).toEqual(['sweep', 'beat:approvalSweep', 'beat:bounceScan']);
    expect(heartbeat.record).toHaveBeenCalledWith('approvalSweep', expect.any(Number));
  });

  it('does not record a heartbeat for a tick that failed', async () => {
    const heartbeat = store();
    m.runApprovalSweep.mockRejectedValue(new Error('db down'));
    startBackgroundJobs({ env: {}, ready: async () => undefined, heartbeat });

    await expect(m.startApprovalSweep.mock.calls[0]![0].run()).rejects.toThrow('db down');
    expect(heartbeat.record).not.toHaveBeenCalled();
  });

  it('a heartbeat write failure never fails the tick; it is logged', async () => {
    const heartbeat = store();
    heartbeat.record.mockRejectedValueOnce(new Error('redis down'));
    heartbeat.record.mockRejectedValueOnce('plain');
    const log = { warn: vi.fn(), info: vi.fn() };
    startBackgroundJobs({ env: {}, ready: async () => undefined, heartbeat, log });

    await expect(m.startApprovalSweep.mock.calls[0]![0].run()).resolves.toEqual({ locked: true });
    await expect(m.startBounceScanner.mock.calls[0]![0].run()).resolves.toEqual({
      mailboxesScanned: 0,
    });
    expect(log.warn).toHaveBeenCalledWith('[background-jobs] heartbeat write failed: redis down');
    expect(log.warn).toHaveBeenCalledWith('[background-jobs] heartbeat write failed: plain');
  });

  it('a heartbeat write that never settles cannot hold the tick past the cap', async () => {
    vi.useFakeTimers();
    try {
      const heartbeat = store();
      heartbeat.record.mockImplementation(() => new Promise<undefined>(() => undefined));
      const log = { warn: vi.fn(), info: vi.fn() };
      startBackgroundJobs({ env: {}, ready: async () => undefined, heartbeat, log });

      const tick = m.startApprovalSweep.mock.calls[0]![0].run();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_WRITE_TIMEOUT_MS);

      await expect(tick).resolves.toEqual({ locked: true });
      expect(log.warn).toHaveBeenCalledWith(
        `[background-jobs] heartbeat write failed: timed out after ${HEARTBEAT_WRITE_TIMEOUT_MS}ms`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs fine with no heartbeat store (no Redis configured)', async () => {
    startBackgroundJobs({ env: {}, ready: async () => undefined, heartbeat: null });
    await expect(m.startApprovalSweep.mock.calls[0]![0].run()).resolves.toEqual({ locked: true });
  });

  it('checkBackgroundJobsHealth reads the heartbeat only when called', async () => {
    expect(m.checkBackgroundJobsHeartbeat).not.toHaveBeenCalled();
    await expect(checkBackgroundJobsHealth({ MARK: 'x' } as never)).resolves.toEqual({
      status: 'ok',
    });
    expect(m.checkBackgroundJobsHeartbeat).toHaveBeenCalledWith({ env: { MARK: 'x' } });
  });
});
