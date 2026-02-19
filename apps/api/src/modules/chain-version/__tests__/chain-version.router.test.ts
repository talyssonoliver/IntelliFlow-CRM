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
import { createTestContext, createAdminContext } from '../../../test/setup';

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
          'test-tenant-id' // tenantId
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
        expect(mockChainVersionService.activateVersion).toHaveBeenCalled();
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
        expect(mockChainVersionService.deprecateVersion).toHaveBeenCalled();
      });
    });

    describe('archive', () => {
      it('should archive a chain version (admin only)', async () => {
        const caller = testRouter.createCaller(createAdminCtx());

        const result = await caller.chainVersion.archive({
          versionId: TEST_VERSION_ID,
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.archiveVersion).toHaveBeenCalled();
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
        expect(mockChainVersionService.getVersion).toHaveBeenCalledWith(TEST_VERSION_ID);
      });
    });

    describe('getActive', () => {
      it('should get the active version for a chain type', async () => {
        const caller = testRouter.createCaller(createTenantCtx());

        const result = await caller.chainVersion.getActive({
          chainType: 'SCORING',
        });

        expect(result).toBeDefined();
        expect(mockChainVersionService.getActiveVersion).toHaveBeenCalledWith(
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

        expect(mockChainVersionService.getActiveVersion).toHaveBeenCalledWith(
          'SCORING',
          expect.objectContaining({
            userId: 'user-1',
            experimentId: 'exp-1',
          })
        );
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
          TEST_VERSION_ID_B
        );
      });
    });
  });
});
