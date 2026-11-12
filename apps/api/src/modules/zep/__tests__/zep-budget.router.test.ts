/**
 * Zep Budget Router Tests - IFC-086: Model Versioning with Zep
 *
 * Tests for the zepBudget tRPC router endpoints, including tenant scoping: tenant users read
 * only their own tenant's budget; the platform budget ('global'), other tenants and resets
 * are for platform operators.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { zepBudgetRouter } from '../zep-budget.router';
import { initTRPC } from '@trpc/server';
import type { Context } from '../../../context';
import { TEST_UUIDS } from '../../../test/setup';

const OPERATOR = 'ops@example.invalid';
const OTHER_TENANT = '00000000-0000-4000-8000-0000000000ff';

// Mock Prisma client
const mockPrisma = {
  zepEpisodeUsage: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  zepEpisodeAudit: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

// Create a minimal context for testing
const createTestContext = (email = 'test@example.invalid'): Context =>
  ({
    prisma: mockPrisma as any, // test-only mock data
    user: {
      userId: 'test-user-id',
      tenantId: TEST_UUIDS.tenant,
      email,
      emailVerified: true,
      role: 'ADMIN',
    } as Context['user'],
    session: {
      id: 'test-session-id',
      userId: 'test-user-id',
      tenantId: TEST_UUIDS.tenant,
      email,
      role: 'ADMIN',
      permissions: [],
      expiresAt: new Date(Date.now() + 3600000),
    } as Context['session'],
    services: {} as Context['services'],
  }) as Context;

const createOperatorContext = () => createTestContext(OPERATOR);

// Create tRPC caller for testing - cast to any for test compatibility
const t = initTRPC.context<Context>().create();
const callerFactory = t.createCallerFactory(zepBudgetRouter as any);
const caller = (ctx: Context): any => callerFactory(ctx);

const usageRow = (episodesUsed: number, extra: Record<string, unknown> = {}) => ({
  id: 'test-id',
  tenantId: TEST_UUIDS.tenant,
  episodesUsed,
  maxEpisodes: 1000,
  warningPercent: 80,
  hardLimitPercent: 95,
  lastUpdated: new Date(),
  createdAt: new Date(),
  lastSyncedAt: null,
  lastSyncSuccess: false,
  ...extra,
});

describe('zepBudgetRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', OPERATOR);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getStatus', () => {
    it('should return default values when no record exists', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(null);

      const result = await caller(createTestContext()).getStatus({});

      expect(result).toEqual({
        used: 0,
        remaining: 1000,
        maxEpisodes: 1000,
        warningThreshold: 800,
        limitThreshold: 950,
        isWarning: false,
        isLimited: false,
        isPersisted: false,
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });
    });

    it("reads the caller's own tenant", async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(null);

      await caller(createTestContext()).getStatus();
      await caller(createTestContext()).getStatus({ tenantId: TEST_UUIDS.tenant });

      for (const [args] of mockPrisma.zepEpisodeUsage.findUnique.mock.calls) {
        expect(args).toEqual({ where: { tenantId: TEST_UUIDS.tenant } });
      }
      expect(mockPrisma.zepEpisodeUsage.findUnique).toHaveBeenCalledTimes(2);
    });

    it.each([['global'], [OTHER_TENANT]])(
      'refuses another budget (%s) for a tenant user',
      async (tenantId) => {
        await expect(caller(createTestContext()).getStatus({ tenantId })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        expect(mockPrisma.zepEpisodeUsage.findUnique).not.toHaveBeenCalled();
      }
    );

    it('should return persisted values when record exists', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(
        usageRow(500, { lastSyncedAt: new Date('2026-01-30T12:00:00Z'), lastSyncSuccess: true })
      );

      const result = await caller(createTestContext()).getStatus({});

      expect(result.used).toBe(500);
      expect(result.remaining).toBe(500);
      expect(result.isPersisted).toBe(true);
      expect(result.isWarning).toBe(false);
      expect(result.lastSyncSuccess).toBe(true);
    });

    it('should detect warning threshold', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(usageRow(850));

      const result = await caller(createTestContext()).getStatus({});

      expect(result.used).toBe(850);
      expect(result.isWarning).toBe(true);
      expect(result.isLimited).toBe(false);
    });

    it('should detect hard limit threshold', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(usageRow(960));

      const result = await caller(createTestContext()).getStatus({});

      expect(result.used).toBe(960);
      expect(result.isWarning).toBe(true);
      expect(result.isLimited).toBe(true);
    });
  });

  describe('getAuditHistory', () => {
    it('should return audit history', async () => {
      const mockAudits = [
        {
          id: 'audit-1',
          tenantId: TEST_UUIDS.tenant,
          previousCount: 0,
          newCount: 1,
          delta: 1,
          operation: 'CREATE_SESSION',
          sessionId: 'session-1',
          createdAt: new Date('2026-01-30T12:00:00Z'),
        },
        {
          id: 'audit-2',
          tenantId: TEST_UUIDS.tenant,
          previousCount: 1,
          newCount: 2,
          delta: 1,
          operation: 'ADD_MEMORY',
          sessionId: 'session-1',
          createdAt: new Date('2026-01-30T12:05:00Z'),
        },
      ];

      mockPrisma.zepEpisodeAudit.findMany.mockResolvedValue(mockAudits);

      const result = await caller(createTestContext()).getAuditHistory({ limit: 50 });

      expect(result).toHaveLength(2);
      expect(result[0].operation).toBe('CREATE_SESSION');
      expect(result[1].operation).toBe('ADD_MEMORY');
    });

    it("reads the caller's own tenant and respects the limit", async () => {
      mockPrisma.zepEpisodeAudit.findMany.mockResolvedValue([]);

      await caller(createTestContext()).getAuditHistory({ limit: 10 });

      expect(mockPrisma.zepEpisodeAudit.findMany).toHaveBeenCalledWith({
        where: { tenantId: TEST_UUIDS.tenant },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });

    it.each([['global'], [OTHER_TENANT]])(
      'refuses another tenant (%s) for a tenant user',
      async (tenantId) => {
        await expect(
          caller(createTestContext()).getAuditHistory({ tenantId, limit: 10 })
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(mockPrisma.zepEpisodeAudit.findMany).not.toHaveBeenCalled();
      }
    );
  });

  describe('platform routes', () => {
    it('getPlatformStatus reads the platform budget by default, or a named tenant', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(null);

      await caller(createOperatorContext()).getPlatformStatus();
      await caller(createOperatorContext()).getPlatformStatus({ tenantId: OTHER_TENANT });

      expect(mockPrisma.zepEpisodeUsage.findUnique.mock.calls.map(([a]) => a)).toEqual([
        { where: { tenantId: 'global' } },
        { where: { tenantId: OTHER_TENANT } },
      ]);
    });

    it('getPlatformAuditHistory reads the platform history by default', async () => {
      mockPrisma.zepEpisodeAudit.findMany.mockResolvedValue([]);

      await caller(createOperatorContext()).getPlatformAuditHistory({ limit: 5 });

      expect(mockPrisma.zepEpisodeAudit.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'global' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    });

    it.each([
      ['getPlatformStatus', (c: any) => c.getPlatformStatus()],
      ['getPlatformAuditHistory', (c: any) => c.getPlatformAuditHistory({})],
      ['reset', (c: any) => c.reset({ reason: 'x' })],
    ])('%s is FORBIDDEN for a tenant admin', async (_name, call) => {
      await expect(call(caller(createTestContext()))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(mockPrisma.zepEpisodeUsage.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.zepEpisodeUsage.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.zepEpisodeAudit.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.zepEpisodeAudit.create).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset episode count', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(usageRow(500));
      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue(usageRow(0));
      mockPrisma.zepEpisodeAudit.create.mockResolvedValue({});

      const result = await caller(createOperatorContext()).reset({
        newCount: 0,
        reason: 'Testing reset functionality',
      });

      expect(result.success).toBe(true);
      expect(result.previousCount).toBe(500);
      expect(result.newCount).toBe(0);
      expect(mockPrisma.zepEpisodeUsage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'global' } })
      );
    });

    it('should create audit entry on reset', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({ episodesUsed: 100 });
      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue({ episodesUsed: 50 });
      mockPrisma.zepEpisodeAudit.create.mockResolvedValue({});

      await caller(createOperatorContext()).reset({
        tenantId: OTHER_TENANT,
        newCount: 50,
        reason: 'Adjusting count',
      });

      expect(mockPrisma.zepEpisodeAudit.create).toHaveBeenCalledWith({
        data: {
          tenantId: OTHER_TENANT,
          previousCount: 100,
          newCount: 50,
          delta: -50,
          operation: 'RESET: Adjusting count',
        },
      });
    });
  });
});
