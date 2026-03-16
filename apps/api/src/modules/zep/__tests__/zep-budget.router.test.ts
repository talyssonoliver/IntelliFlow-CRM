/**
 * Zep Budget Router Tests - IFC-086: Model Versioning with Zep
 *
 * Tests for the zepBudget tRPC router endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zepBudgetRouter } from '../zep-budget.router';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from '../../../context';
import { TEST_UUIDS } from '../../../test/setup';

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
const createTestContext = (overrides: Partial<Context> = {}): Context =>
  ({
    prisma: mockPrisma as any, // test-only mock data
    user: {
      userId: 'test-user-id',
      tenantId: TEST_UUIDS.tenant,
      email: 'test@example.com',
      role: 'ADMIN',
    } as Context['user'],
    session: {
      id: 'test-session-id',
      userId: 'test-user-id',
      tenantId: TEST_UUIDS.tenant,
      email: 'test@example.com',
      role: 'ADMIN',
      permissions: [],
      expiresAt: new Date(Date.now() + 3600000),
    } as Context['session'],
    services: {} as Context['services'],
    ...overrides,
  }) as Context;

// Create tRPC caller for testing - cast to any for test compatibility
const t = initTRPC.context<Context>().create();
const callerFactory = t.createCallerFactory(zepBudgetRouter as any);
const caller = (ctx: Context): any => callerFactory(ctx);

describe('zepBudgetRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return default values when no record exists', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue(null);

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      const result = await trpcCaller.getStatus({});

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

    it('should return persisted values when record exists', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 500,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: new Date('2026-01-30T12:00:00Z'),
        lastSyncSuccess: true,
      });

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      const result = await trpcCaller.getStatus({});

      expect(result.used).toBe(500);
      expect(result.remaining).toBe(500);
      expect(result.isPersisted).toBe(true);
      expect(result.isWarning).toBe(false);
      expect(result.lastSyncSuccess).toBe(true);
    });

    it('should detect warning threshold', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 850,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      const result = await trpcCaller.getStatus({});

      expect(result.used).toBe(850);
      expect(result.isWarning).toBe(true);
      expect(result.isLimited).toBe(false);
    });

    it('should detect hard limit threshold', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 960,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      const result = await trpcCaller.getStatus({});

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
          tenantId: 'global',
          previousCount: 0,
          newCount: 1,
          delta: 1,
          operation: 'CREATE_SESSION',
          sessionId: 'session-1',
          createdAt: new Date('2026-01-30T12:00:00Z'),
        },
        {
          id: 'audit-2',
          tenantId: 'global',
          previousCount: 1,
          newCount: 2,
          delta: 1,
          operation: 'ADD_MEMORY',
          sessionId: 'session-1',
          createdAt: new Date('2026-01-30T12:05:00Z'),
        },
      ];

      mockPrisma.zepEpisodeAudit.findMany.mockResolvedValue(mockAudits);

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      const result = await trpcCaller.getAuditHistory({ limit: 50 });

      expect(result).toHaveLength(2);
      expect(result[0].operation).toBe('CREATE_SESSION');
      expect(result[1].operation).toBe('ADD_MEMORY');
    });

    it('should respect limit parameter', async () => {
      mockPrisma.zepEpisodeAudit.findMany.mockResolvedValue([]);

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      await trpcCaller.getAuditHistory({ limit: 10 });

      expect(mockPrisma.zepEpisodeAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });
  });

  describe('reset', () => {
    it('should reset episode count', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 500,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 0,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      mockPrisma.zepEpisodeAudit.create.mockResolvedValue({
        id: 'audit-reset',
        tenantId: 'global',
        previousCount: 500,
        newCount: 0,
        delta: -500,
        operation: 'RESET: Testing reset functionality',
        sessionId: null,
        createdAt: new Date(),
      });

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      const result = await trpcCaller.reset({
        newCount: 0,
        reason: 'Testing reset functionality',
      });

      expect(result.success).toBe(true);
      expect(result.previousCount).toBe(500);
      expect(result.newCount).toBe(0);
    });

    it('should create audit entry on reset', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
        episodesUsed: 100,
      });

      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue({
        episodesUsed: 50,
      });

      mockPrisma.zepEpisodeAudit.create.mockResolvedValue({});

      const ctx = createTestContext();
      const trpcCaller = caller(ctx);

      await trpcCaller.reset({
        newCount: 50,
        reason: 'Adjusting count',
      });

      expect(mockPrisma.zepEpisodeAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousCount: 100,
          newCount: 50,
          delta: -50,
          operation: 'RESET: Adjusting count',
        }),
      });
    });
  });
});
