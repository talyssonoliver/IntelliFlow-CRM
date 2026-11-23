import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPLIANCE_SNAPSHOT_BATCH,
  DEFAULT_COMPLIANCE_SNAPSHOT_INTERVAL_MS,
  complianceSnapshotIntervalFromEnv,
  resetComplianceSnapshotDeferrals,
  runComplianceSnapshots,
  startComplianceSnapshotScheduler,
  stopComplianceSnapshotScheduler,
  type ComplianceSnapshotJobDb,
} from '../compliance-snapshot-scheduler';

function db(tenants: string[], failFor?: string): ComplianceSnapshotJobDb {
  const zero = vi.fn(async () => 0);
  return {
    tenant: { findMany: vi.fn(async () => tenants.map((id) => ({ id }))) },
    user: { count: zero },
    auditLogEntry: { count: zero },
    lead: { count: zero },
    aPIKey: { count: zero },
    dsarRequest: { count: zero },
    processingRestriction: { count: zero },
    appointment: { count: zero },
    termsAcceptance: { count: zero, findFirst: vi.fn(async () => null) },
    documentRetentionPolicy: { count: zero },
    tenantMemoryPolicy: { findUnique: vi.fn(async () => null) },
    aIMonitoringEvent: { count: zero },
    complianceSnapshot: {
      upsert: vi.fn(async (args: unknown) => {
        if (failFor && JSON.stringify(args).includes(failFor)) throw new Error('write failed');
        return {};
      }),
      findMany: vi.fn(async () => []),
    },
  };
}

describe('complianceSnapshotIntervalFromEnv', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(complianceSnapshotIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(complianceSnapshotIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(complianceSnapshotIntervalFromEnv({ VERCEL: '1' })).toBe(0);
  });

  it('defaults to hourly, accepts an override and 0 to disable', () => {
    expect(complianceSnapshotIntervalFromEnv({})).toBe(DEFAULT_COMPLIANCE_SNAPSHOT_INTERVAL_MS);
    expect(complianceSnapshotIntervalFromEnv({ COMPLIANCE_SNAPSHOT_INTERVAL_MS: '5000' })).toBe(
      5000
    );
    expect(complianceSnapshotIntervalFromEnv({ COMPLIANCE_SNAPSHOT_INTERVAL_MS: '0' })).toBe(0);
    expect(complianceSnapshotIntervalFromEnv({ COMPLIANCE_SNAPSHOT_INTERVAL_MS: 'x' })).toBe(
      DEFAULT_COMPLIANCE_SNAPSHOT_INTERVAL_MS
    );
  });
});

describe('runComplianceSnapshots', () => {
  beforeEach(() => resetComplianceSnapshotDeferrals());

  it('asks only for active firms without a snapshot today, in a bounded batch', async () => {
    const d = db([]);
    await runComplianceSnapshots(d, new Date('2026-11-23T10:00:00Z'));
    const args = (d.tenant.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(args.take).toBe(COMPLIANCE_SNAPSHOT_BATCH);
    expect(JSON.stringify(args.where)).toContain('TRIAL');
    expect(JSON.stringify(args.where)).toContain('2026-11-23T00:00:00.000Z');
  });

  it('treats a day as done only when the last framework row (the marker) is stored', async () => {
    const d = db([]);
    await runComplianceSnapshots(d, new Date('2026-11-23T10:00:00Z'));
    const args = (d.tenant.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(args.where)).toContain('adr-registry');
  });

  it('writes the marker row last', async () => {
    const d = db(['t1']);
    await runComplianceSnapshots(d);
    const order = (d.complianceSnapshot.upsert as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { create: { frameworkId: string } }).create.frameworkId
    );
    expect(order).toHaveLength(5);
    expect(order[4]).toBe('adr-registry');
  });

  it('puts a failing firm aside so it cannot starve the others on later ticks', async () => {
    const warn = vi.fn();
    const now = new Date('2026-11-23T10:00:00Z');
    const d = db(['t1'], 't1');
    await runComplianceSnapshots(d, now, { warn });
    await runComplianceSnapshots(d, new Date(now.getTime() + 60_000), { warn });
    const second = (d.tenant.findMany as ReturnType<typeof vi.fn>).mock.calls[1]![0] as {
      where: { id?: { notIn: string[] } };
    };
    expect(second.where.id).toEqual({ notIn: ['t1'] });
    // after the retry delay it is tried again
    await runComplianceSnapshots(d, new Date(now.getTime() + 7 * 3_600_000), { warn });
    const third = (d.tenant.findMany as ReturnType<typeof vi.fn>).mock.calls[2]![0] as {
      where: { id?: unknown };
    };
    expect(third.where.id).toBeUndefined();
  });

  it('stores nothing, and counts a failure, when some evidence could not be read', async () => {
    const d = db(['t1']);
    (d.dsarRequest.count as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('read failed'));
    const report = await runComplianceSnapshots(d);
    expect(report).toEqual({ tenants: 1, failed: 1 });
    expect(d.complianceSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('stores five framework rows per firm', async () => {
    const d = db(['t1', 't2']);
    const report = await runComplianceSnapshots(d);
    expect(report).toEqual({ tenants: 2, failed: 0 });
    expect(d.complianceSnapshot.upsert).toHaveBeenCalledTimes(10);
  });

  it('logs a failing firm and carries on with the rest', async () => {
    const warn = vi.fn();
    const d = db(['t1', 't2'], 't1');
    const report = await runComplianceSnapshots(d, new Date(), { warn });
    expect(report).toEqual({ tenants: 2, failed: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('tenant t1 failed'));
  });
});

describe('startComplianceSnapshotScheduler', () => {
  afterEach(async () => {
    vi.useRealTimers();
    await stopComplianceSnapshotScheduler();
  });

  it('does not start when disabled, and starts once', async () => {
    const log = { warn: vi.fn(), info: vi.fn() };
    expect(startComplianceSnapshotScheduler({ intervalMs: 0, run: async () => 1, log })).toBe(
      false
    );
    expect(startComplianceSnapshotScheduler({ intervalMs: 1000, run: async () => 1, log })).toBe(
      true
    );
    expect(startComplianceSnapshotScheduler({ intervalMs: 1000, run: async () => 1, log })).toBe(
      false
    );
  });

  it('runs a tick, skips while one is in flight, and logs a failed tick', async () => {
    vi.useFakeTimers();
    const log = { warn: vi.fn(), info: vi.fn() };
    let release: () => void = () => undefined;
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockRejectedValueOnce(new Error('tick boom'));
    startComplianceSnapshotScheduler({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000); // first still running: skipped
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('tick boom'));
  });
});
