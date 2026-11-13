/**
 * Chain Version Router Tests
 *
 * Tests for apps/api/src/modules/chain-version/chain-version.router.ts
 *
 * IFC-086: Model Versioning with Zep
 *
 * Validates:
 * - All CRUD operations (create, update, activate, deprecate, archive, rollback)
 * - Query operations (getById, getActive, getConfig, list, getHistory, getAuditLog)
 * - Statistics and comparison endpoints
 * - Error handling when chainVersion service is unavailable
 * - Tenant context enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { chainVersionRouter } from '../chain-version.router';
import { createTRPCRouter } from '../../../trpc';
import { createTestContext, createAdminContext, prismaMock, TEST_UUIDS } from '../../../test/setup';

// Mock the tenant-context module
vi.mock('../../../security/tenant-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../security/tenant-context')>();
  return {
    ...actual,
    getTenantContext: vi.fn((ctx: any) => {
      if (!ctx.tenant) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant context required' });
      }
      return ctx as any;
    }),
    tenantContextMiddleware: actual.tenantContextMiddleware,
  };
});

// Mock validator schemas
vi.mock('@intelliflow/validators', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { z } = require('zod');
  return {
    createChainVersionSchema: z.object({
      chainType: z.string(),
      name: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    updateChainVersionSchema: z.object({
      name: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    activateVersionSchema: z.object({
      versionId: z.string().uuid(),
    }),
    rollbackVersionSchema: z.object({
      versionId: z.string().uuid(),
      reason: z.string(),
    }),
    chainTypeSchema: z.string(),
    chainVersionStatusSchema: z.string(),
  };
});

// Test UUIDs
const TEST_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const TEST_VERSION_ID_B = '22222222-2222-4222-8222-222222222222';

// Mock chain version service - use vi.fn() without mockResolvedValue here
// Return values are set in beforeEach to survive vitest mockReset
const mockChainVersionService = {
  createVersion: vi.fn(),
  updateVersion: vi.fn(),
  activateVersion: vi.fn(),
  deprecateVersion: vi.fn(),
  archiveVersion: vi.fn(),
  rollbackToVersion: vi.fn(),
  getVersion: vi.fn(),
  getActiveVersion: vi.fn(),
  findActiveVersion: vi.fn(),
  getChainConfig: vi.fn(),
  listVersions: vi.fn(),
  getVersionHistory: vi.fn(),
  getVersionAuditLog: vi.fn(),
  getVersionStats: vi.fn(),
  compareVersions: vi.fn(),
};

// Create test router to get caller
const testRouter = createTRPCRouter({
  chainVersion: chainVersionRouter,
});

describe('Chain Version Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock return values AFTER clearAllMocks
    mockChainVersionService.createVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'DRAFT',
    });
    mockChainVersionService.updateVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'DRAFT',
    });
    mockChainVersionService.activateVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'ACTIVE',
    });
    mockChainVersionService.deprecateVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'DEPRECATED',
    });
    mockChainVersionService.archiveVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'ARCHIVED',
    });
    mockChainVersionService.rollbackToVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'ACTIVE',
    });
    mockChainVersionService.getVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      chainType: 'SCORING',
    });
    mockChainVersionService.getActiveVersion.mockResolvedValue({
      id: TEST_VERSION_ID,
      status: 'ACTIVE',
    });
    mockChainVersionService.findActiveVersion.mockResolvedValue({
      version: { id: TEST_VERSION_ID, status: 'ACTIVE' },
      selectedBy: 'direct',
    });
    mockChainVersionService.getChainConfig.mockResolvedValue({ model: 'gpt-4', temperature: 0.7 });
    mockChainVersionService.listVersions.mockResolvedValue({ items: [], total: 0 });
    mockChainVersionService.getVersionHistory.mockResolvedValue([]);
    mockChainVersionService.getVersionAuditLog.mockResolvedValue([]);
    mockChainVersionService.getVersionStats.mockResolvedValue({ total: 0, active: 0 });
    mockChainVersionService.compareVersions.mockResolvedValue({ differences: [] });
  });

  const createTenantCtx = (overrides: Record<string, unknown> = {}) => {
    return createTestContext({
      services: {
        chainVersion: mockChainVersionService as any,
      } as any,
      ...overrides,
    });
  };

  const createAdminCtx = (overrides: Record<string, unknown> = {}) => {
    return createAdminContext({
      services: {
        chainVersion: mockChainVersionService as any,
      } as any,
      ...overrides,
    });
  };

  describe('getChainVersionService helper', () => {
    it('should throw INTERNAL_SERVER_ERROR when chainVersion service is not available', async () => {
      const caller = testRouter.createCaller(
        createTestContext({
          services: {} as any,
        })
      );

      await expect(caller.chainVersion.getById({ versionId: TEST_VERSION_ID })).rejects.toThrow(
        'ChainVersion service not initialized'
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when services is undefined', async () => {
      const caller = testRouter.createCaller(
        createTestContext({
          services: undefined as any,
        })
      );

      await expect(caller.chainVersion.getById({ versionId: TEST_VERSION_ID })).rejects.toThrow(
        'ChainVersion service not initialized'
      );
    });
  });

  describe('Version Lifecycle', () => {
    describe('create', () => {
      it('should create a new chain version', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.create({
          chainType: 'SCORING',
          prompt: 'Score this lead',
          name: 'v1.0.0',
        } as any);

        expect(result).toBeDefined();
        expect(result.id).toBe(TEST_VERSION_ID);
        expect(mockChainVersionService.createVersion).toHaveBeenCalledWith(
          expect.objectContaining({
            chainType: 'SCORING',
            name: 'v1.0.0',
          }),
          expect.any(String), // userId
          TEST_UUIDS.tenant // tenantId
        );
      });
    });

    describe('update', () => {
      it('should update a chain version', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.update({
          versionId: TEST_VERSION_ID,
          data: { name: 'v1.1.0' } as any,
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.updateVersion).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant,
          { name: 'v1.1.0' },
          expect.any(String) // userId
        );
      });
    });

    describe('activate', () => {
      it('should activate a chain version (admin only)', async () => {
        const caller = testRouter.createCaller(createAdminCtx());

        const result = await caller.chainVersion.activate({
          versionId: TEST_VERSION_ID,
        });

        expect(result).toBeDefined();
        expect(result.status).toBe('ACTIVE');
        expect(mockChainVersionService.activateVersion).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant,
          expect.any(String)
        );
      });

      it('should reject non-admin users', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        await expect(
          caller.chainVersion.activate({ versionId: TEST_VERSION_ID })
        ).rejects.toThrow();
      });
    });

    describe('deprecate', () => {
      it('should deprecate a chain version (admin only)', async () => {
        const caller = testRouter.createCaller(createAdminCtx());

        const result = await caller.chainVersion.deprecate({
          versionId: TEST_VERSION_ID,
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.deprecateVersion).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant,
          expect.any(String)
        );
      });
    });

    describe('archive', () => {
      it('should archive a chain version (admin only)', async () => {
        const caller = testRouter.createCaller(createAdminCtx());

        const result = await caller.chainVersion.archive({
          versionId: TEST_VERSION_ID,
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.archiveVersion).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant,
          expect.any(String)
        );
      });
    });

    describe('rollback', () => {
      it('should rollback to a previous version (admin only)', async () => {
        const caller = testRouter.createCaller(createAdminCtx());

        const result = await caller.chainVersion.rollback({
          versionId: TEST_VERSION_ID,
          reason: 'Performance regression',
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.rollbackToVersion).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant,
          'Performance regression',
          expect.any(String)
        );
      });
    });
  });

  describe('Queries', () => {
    describe('getById', () => {
      it('should get chain version by ID', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getById({
          versionId: TEST_VERSION_ID,
        });

        expect(result).toBeDefined();
        expect(result!.id).toBe(TEST_VERSION_ID);
        expect(mockChainVersionService.getVersion).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant
        );
      });
    });

    describe('getActive', () => {
      it('should get the active version for a chain type', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getActive({
          chainType: 'SCORING',
        });

        expect(result).toEqual({
          version: { id: TEST_VERSION_ID, status: 'ACTIVE' },
          selectedBy: 'direct',
        });
        expect(mockChainVersionService.findActiveVersion).toHaveBeenCalledWith(
          'SCORING',
          expect.objectContaining({ tenantId: expect.any(String) })
        );
      });

      it('should pass optional context parameters', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        await caller.chainVersion.getActive({
          chainType: 'SCORING',
          context: { userId: 'user-1', experimentId: 'exp-1' },
        });

        expect(mockChainVersionService.findActiveVersion).toHaveBeenCalledWith(
          'SCORING',
          expect.objectContaining({
            userId: 'user-1',
            experimentId: 'exp-1',
          })
        );
      });

      it('returns null, not an error, when the tenant has no active version', async () => {
        mockChainVersionService.findActiveVersion.mockResolvedValueOnce(null);
        const caller = testRouter.createCaller(createTenantCtx());

        await expect(caller.chainVersion.getActive({ chainType: 'FOLLOWUP' })).resolves.toBeNull();
        expect(mockChainVersionService.getActiveVersion).not.toHaveBeenCalled();
      });
    });

    describe('getEffective', () => {
      it('returns every chain type, built-in when nothing is saved, looked up by the caller tenant', async () => {
        mockChainVersionService.findActiveVersion.mockResolvedValue(null);
        (prismaMock.tenantAIConfig.findUnique as any).mockResolvedValue(null);
        const ctx = createTenantCtx();
        const caller = testRouter.createCaller(ctx);

        const result = await caller.chainVersion.getEffective();

        expect(Object.keys(result).sort()).toEqual([
          'EMAIL_WRITER',
          'FOLLOWUP',
          'QUALIFICATION',
          'SCORING',
        ]);
        expect(result.SCORING).toMatchObject({ source: 'builtin', label: 'Built-in v1' });
        const tenantId = (ctx as any).user.tenantId;
        for (const [, context] of mockChainVersionService.findActiveVersion.mock.calls) {
          expect(context).toEqual({ tenantId });
        }
        for (const [args] of (prismaMock.tenantAIConfig.findUnique as any).mock.calls) {
          expect(args.where.tenantId_purpose.tenantId).toBe(tenantId);
        }
      });

      it('shows a saved version, with the model the worker runs rather than the saved one', async () => {
        mockChainVersionService.findActiveVersion.mockImplementation(async (type: string) =>
          type === 'SCORING'
            ? {
                version: {
                  id: TEST_VERSION_ID,
                  prompt: 'Score:\n{lead_info}',
                  model: 'claude-haiku-5-5',
                  temperature: 0.2,
                  maxTokens: 800,
                  description: null,
                },
                selectedBy: 'direct',
              }
            : null
        );
        (prismaMock.tenantAIConfig.findUnique as any).mockResolvedValue(null);
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getEffective();

        expect(result.SCORING).toMatchObject({
          source: 'saved',
          label: 'Saved version',
          savedVersionId: TEST_VERSION_ID,
          temperature: null,
        });
        expect(result.SCORING.modelSource).not.toBe('saved');
        expect(result.SCORING.model).not.toBe('claude-haiku-5-5');
        expect(result.SCORING.chains[0]).toMatchObject({ promptSource: 'saved' });
      });
    });

    describe('getUsageStats', () => {
      it("reads only the caller tenant's runs and labels derived scoring counts", async () => {
        (prismaMock.chainRun.groupBy as any).mockResolvedValue([]);
        (prismaMock.leadActivity.count as any).mockResolvedValue(7);
        (prismaMock.leadActivity.findFirst as any).mockResolvedValue({
          timestamp: new Date('2026-11-10T10:00:00Z'),
        });
        const ctx = createTenantCtx();
        const caller = testRouter.createCaller(ctx);

        const result = await caller.chainVersion.getUsageStats({ days: 7 });

        const tenantId = (ctx as any).user.tenantId;
        for (const [args] of (prismaMock.chainRun.groupBy as any).mock.calls) {
          expect(args.where.tenantId).toBe(tenantId);
        }
        expect((prismaMock.leadActivity.count as any).mock.calls[0][0].where).toMatchObject({
          tenantId,
          title: 'Lead Scored by AI',
        });
        expect(result.SCORING).toMatchObject({
          runs: 7,
          source: 'derived',
          derivedFrom: 'Lead Scored by AI activities',
        });
        expect(result.FOLLOWUP.source).toBe('none');
      });

      it('reports recorded runs per chain type', async () => {
        (prismaMock.chainRun.groupBy as any).mockImplementation(async (args: any) =>
          args.where.success
            ? [{ chainType: 'FOLLOWUP', _count: { _all: 1 } }]
            : [
                {
                  chainType: 'FOLLOWUP',
                  _count: { _all: 2 },
                  _min: { createdAt: new Date('2026-11-10T00:00:00Z') },
                  _max: { createdAt: new Date('2026-11-11T00:00:00Z') },
                  _avg: { latencyMs: 500 },
                  _sum: { costUsd: '0.004', inputTokens: 300, outputTokens: 40 },
                },
              ]
        );
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getUsageStats();

        expect(result.FOLLOWUP).toMatchObject({
          runs: 2,
          successRate: 0.5,
          avgLatencyMs: 500,
          spend: { amount: 0.004, currency: 'USD' },
          inputTokens: 300,
          outputTokens: 40,
          source: 'recorded',
        });
      });

      it('counts since the tenant first recorded the type, read without the window filter', async () => {
        const firstEver = new Date('2026-01-01T00:00:00Z');
        (prismaMock.chainRun.groupBy as any).mockImplementation(async (args: any) => {
          if (!args.where.createdAt) {
            return [{ chainType: 'FOLLOWUP', _min: { createdAt: firstEver } }];
          }
          return args.where.success
            ? [{ chainType: 'FOLLOWUP', _count: { _all: 1 } }]
            : [
                {
                  chainType: 'FOLLOWUP',
                  _count: { _all: 1 },
                  _min: { createdAt: new Date() },
                  _max: { createdAt: new Date() },
                  _avg: { latencyMs: 5 },
                  _sum: { costUsd: '0', inputTokens: 1, outputTokens: 1 },
                },
              ];
        });
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getUsageStats({ days: 7 });

        const unfiltered = (prismaMock.chainRun.groupBy as any).mock.calls.find(
          ([args]: [any]) => !args.where.createdAt
        );
        expect(unfiltered[0].where).toEqual({ tenantId: expect.any(String) });
        // Recording started long before the 7-day window, so the whole window is counted.
        const windowStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
        expect(
          Math.abs(new Date(result.FOLLOWUP.countedSince).getTime() - windowStart)
        ).toBeLessThan(60_000);
      });
    });

    describe('getConfig', () => {
      it('should get chain config for a chain type', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getConfig({
          chainType: 'SCORING',
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.getChainConfig).toHaveBeenCalled();
      });
    });

    describe('list', () => {
      it('should list versions with default pagination', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.list({});

        expect(result).toBeDefined();
        expect(mockChainVersionService.listVersions).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            limit: 50,
            offset: 0,
          })
        );
      });

      it('should list versions with filters', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        await caller.chainVersion.list({
          chainType: 'SCORING',
          status: 'ACTIVE',
          limit: 10,
          offset: 5,
        });

        expect(mockChainVersionService.listVersions).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            chainType: 'SCORING',
            status: 'ACTIVE',
            limit: 10,
            offset: 5,
          })
        );
      });
    });

    describe('getHistory', () => {
      it('should get version history', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getHistory({
          chainType: 'SCORING',
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.getVersionHistory).toHaveBeenCalledWith(
          'SCORING',
          expect.any(String),
          20 // default limit
        );
      });

      it('should support custom limit', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        await caller.chainVersion.getHistory({
          chainType: 'SCORING',
          limit: 50,
        });

        expect(mockChainVersionService.getVersionHistory).toHaveBeenCalledWith(
          'SCORING',
          expect.any(String),
          50
        );
      });
    });

    describe('getAuditLog', () => {
      it('should get audit log for a version (admin only)', async () => {
        const caller = testRouter.createCaller(createAdminCtx());

        const result = await caller.chainVersion.getAuditLog({
          versionId: TEST_VERSION_ID,
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.getVersionAuditLog).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_UUIDS.tenant,
          50 // default limit
        );
      });
    });
  });

  describe('Statistics & Monitoring', () => {
    describe('getStats', () => {
      it('should get version statistics', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getStats({});

        expect(result).toBeDefined();
        expect(mockChainVersionService.getVersionStats).toHaveBeenCalled();
      });

      it('should filter stats by chain type', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        await caller.chainVersion.getStats({ chainType: 'SCORING' });

        expect(mockChainVersionService.getVersionStats).toHaveBeenCalledWith(
          expect.any(String),
          'SCORING'
        );
      });
    });

    describe('compare', () => {
      it('should compare two versions', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.compare({
          versionIdA: TEST_VERSION_ID,
          versionIdB: TEST_VERSION_ID_B,
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.compareVersions).toHaveBeenCalledWith(
          TEST_VERSION_ID,
          TEST_VERSION_ID_B,
          TEST_UUIDS.tenant
        );
      });
    });
  });
});
