/**
 * Memory Retention Job — unit tests
 *
 * Covers: schema validation, skip-tenant logic, scrub vs delete branches,
 * error isolation per tenant, dry-run counting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Prisma mock — resolved via a shared reference so tests can rewire deleteMany
// / updateMany / findMany / count return values.
// ---------------------------------------------------------------------------

const mockPrisma = {
  tenantMemoryPolicy: { findMany: vi.fn() },
  messageRecord: { deleteMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  conversationRecord: { deleteMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  chainVersion: { deleteMany: vi.fn(), count: vi.fn() },
  aIMonitoringEvent: { deleteMany: vi.fn(), count: vi.fn() },
};

vi.mock('@intelliflow/db', () => ({
  prisma: mockPrisma,
}));

import {
  processMemoryRetentionJob,
  MemoryRetentionJobDataSchema,
  MEMORY_RETENTION_QUEUE,
  MEMORY_RETENTION_CRON,
  type MemoryRetentionJobData,
} from '../memory-retention.job';

function makeJob(overrides: Partial<MemoryRetentionJobData> = {}): Job<MemoryRetentionJobData> {
  return {
    id: 'retention-job-1',
    name: 'scheduled-memory-retention',
    data: { dryRun: false, ...overrides } as MemoryRetentionJobData,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<MemoryRetentionJobData>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.messageRecord.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.messageRecord.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.messageRecord.count.mockResolvedValue(0);
  mockPrisma.conversationRecord.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.conversationRecord.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.conversationRecord.count.mockResolvedValue(0);
  mockPrisma.chainVersion.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.chainVersion.count.mockResolvedValue(0);
  mockPrisma.aIMonitoringEvent.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.aIMonitoringEvent.count.mockResolvedValue(0);
});

describe('MemoryRetentionJob — constants', () => {
  it('queue name is stable', () => {
    expect(MEMORY_RETENTION_QUEUE).toBe('ai-memory-retention');
  });
  it('cron runs daily at 03:00 UTC', () => {
    expect(MEMORY_RETENTION_CRON).toBe('0 3 * * *');
  });
});

describe('MemoryRetentionJobDataSchema', () => {
  it('accepts an empty object (dryRun defaults false)', () => {
    const r = MemoryRetentionJobDataSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dryRun).toBe(false);
  });
  it('rejects a non-uuid tenantId', () => {
    const r = MemoryRetentionJobDataSchema.safeParse({ tenantId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });
});

describe('processMemoryRetentionJob — no policies', () => {
  it('returns zero stats when no TenantMemoryPolicy rows exist', async () => {
    mockPrisma.tenantMemoryPolicy.findMany.mockResolvedValue([]);
    const result = await processMemoryRetentionJob(makeJob());
    expect(result.tenantsProcessed).toBe(0);
    expect(result.tenantsSkipped).toBe(0);
    expect(result.perTenant).toHaveLength(0);
    expect(result.dryRun).toBe(false);
  });
});

describe('processMemoryRetentionJob — all-null policy', () => {
  it('counts a policy with every retention field null as "skipped"', async () => {
    mockPrisma.tenantMemoryPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        conversationRetentionDays: null,
        chainVersionRetentionDays: null,
        monitoringEventRetentionDays: null,
        scrubRatherThanDelete: false,
      },
    ]);
    const result = await processMemoryRetentionJob(makeJob());
    expect(result.tenantsProcessed).toBe(0);
    expect(result.tenantsSkipped).toBe(1);
    // No prune calls should have fired
    expect(mockPrisma.messageRecord.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.chainVersion.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.aIMonitoringEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe('processMemoryRetentionJob — delete branch', () => {
  it('deletes conversations + messages + chain versions + events when scrubRatherThanDelete=false', async () => {
    mockPrisma.tenantMemoryPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        conversationRetentionDays: 30,
        chainVersionRetentionDays: 90,
        monitoringEventRetentionDays: 14,
        scrubRatherThanDelete: false,
      },
    ]);
    mockPrisma.messageRecord.deleteMany.mockResolvedValue({ count: 42 });
    mockPrisma.conversationRecord.deleteMany.mockResolvedValue({ count: 7 });
    mockPrisma.chainVersion.deleteMany.mockResolvedValue({ count: 3 });
    mockPrisma.aIMonitoringEvent.deleteMany.mockResolvedValue({ count: 100 });

    const result = await processMemoryRetentionJob(makeJob());

    expect(result.tenantsProcessed).toBe(1);
    const stats = result.perTenant[0]!;
    expect(stats.tenantId).toBe('tenant-1');
    expect(stats.messagesRemoved).toBe(42);
    expect(stats.conversationsRemoved).toBe(7);
    expect(stats.conversationsScrubbed).toBe(0);
    expect(stats.chainVersionsRemoved).toBe(3);
    expect(stats.monitoringEventsRemoved).toBe(100);
    expect(stats.errors).toBe(0);

    // All delete paths were invoked with tenantId guard
    expect(mockPrisma.messageRecord.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1' }),
      })
    );
    expect(mockPrisma.chainVersion.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', status: 'ARCHIVED' }),
      })
    );
  });
});

describe('processMemoryRetentionJob — scrub branch', () => {
  it('scrubs (updateMany) instead of deleting when scrubRatherThanDelete=true', async () => {
    mockPrisma.tenantMemoryPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-2',
        conversationRetentionDays: 30,
        chainVersionRetentionDays: null,
        monitoringEventRetentionDays: null,
        scrubRatherThanDelete: true,
      },
    ]);
    mockPrisma.messageRecord.updateMany.mockResolvedValue({ count: 10 });
    mockPrisma.conversationRecord.updateMany.mockResolvedValue({ count: 2 });

    const result = await processMemoryRetentionJob(makeJob());

    const stats = result.perTenant[0]!;
    expect(stats.messagesRemoved).toBe(10); // semantic: scrubbed rows reported in messagesRemoved
    expect(stats.conversationsScrubbed).toBe(2);
    expect(stats.conversationsRemoved).toBe(0);

    // delete paths must NOT have fired on this tenant
    expect(mockPrisma.messageRecord.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.conversationRecord.deleteMany).not.toHaveBeenCalled();

    // updateMany scrubs content
    expect(mockPrisma.messageRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '[scrubbed:retention-policy]' }),
      })
    );
  });
});

describe('processMemoryRetentionJob — dry run', () => {
  it('counts without mutating the DB', async () => {
    mockPrisma.tenantMemoryPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-3',
        conversationRetentionDays: 30,
        chainVersionRetentionDays: 90,
        monitoringEventRetentionDays: 14,
        scrubRatherThanDelete: false,
      },
    ]);
    mockPrisma.messageRecord.count.mockResolvedValue(5);
    mockPrisma.conversationRecord.count.mockResolvedValue(1);
    mockPrisma.chainVersion.count.mockResolvedValue(2);
    mockPrisma.aIMonitoringEvent.count.mockResolvedValue(20);

    const result = await processMemoryRetentionJob(makeJob({ dryRun: true }));

    expect(result.dryRun).toBe(true);
    expect(result.perTenant[0]!.messagesRemoved).toBe(5);
    expect(result.perTenant[0]!.conversationsRemoved).toBe(1);
    expect(result.perTenant[0]!.chainVersionsRemoved).toBe(2);
    expect(result.perTenant[0]!.monitoringEventsRemoved).toBe(20);

    // deleteMany/updateMany must NOT fire under dryRun
    expect(mockPrisma.messageRecord.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.messageRecord.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.chainVersion.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.aIMonitoringEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe('processMemoryRetentionJob — error isolation', () => {
  it("one tenant's failure does not abort the sweep for other tenants", async () => {
    mockPrisma.tenantMemoryPolicy.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-err',
        conversationRetentionDays: 30,
        chainVersionRetentionDays: null,
        monitoringEventRetentionDays: null,
        scrubRatherThanDelete: false,
      },
      {
        tenantId: 'tenant-ok',
        conversationRetentionDays: 30,
        chainVersionRetentionDays: null,
        monitoringEventRetentionDays: null,
        scrubRatherThanDelete: false,
      },
    ]);
    // First tenant's messageRecord.deleteMany throws; second succeeds.
    mockPrisma.messageRecord.deleteMany
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ count: 3 });
    mockPrisma.conversationRecord.deleteMany.mockResolvedValue({ count: 1 });

    const result = await processMemoryRetentionJob(makeJob());

    expect(result.tenantsProcessed).toBe(2);
    expect(result.perTenant).toHaveLength(2);
    const errTenant = result.perTenant.find((t) => t.tenantId === 'tenant-err')!;
    expect(errTenant.errors).toBe(1);
    const okTenant = result.perTenant.find((t) => t.tenantId === 'tenant-ok')!;
    expect(okTenant.messagesRemoved).toBe(3);
    expect(okTenant.errors).toBe(0);
  });
});
