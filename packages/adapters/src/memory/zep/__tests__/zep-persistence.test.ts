/**
 * Zep Episode Persistence Tests - IFC-086
 *
 * Tests for ZepEpisodeUsage database persistence
 * These tests verify that episode counts survive adapter restarts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ZepMemoryAdapter, type ZepConfig } from '../zep-client';

// Mock PrismaClient for testing
const mockPrisma = {
  zepEpisodeUsage: {
    upsert: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  zepEpisodeAudit: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn((operations) => Promise.all(operations)),
};

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Default config for testing
const testConfig: ZepConfig = {
  apiKey: 'test-api-key',
  projectId: 'test-project',
  maxEpisodes: 1000,
};

// Default fetch mock responses
const setupFetchMock = () => {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/account/usage')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ episodes_used: 0 }),
      });
    }
    if (url.includes('/sessions') && url.includes('/memory')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ messages: [] }),
      });
    }
    if (url.includes('/sessions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session_id: 'test-session' }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
};

describe('ZepEpisodeUsage Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock();

    // Default mock implementations
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

    mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
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

    mockPrisma.zepEpisodeUsage.update.mockResolvedValue({});
    mockPrisma.zepEpisodeAudit.create.mockResolvedValue({});
    mockPrisma.zepEpisodeAudit.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  describe('Episode count persistence', () => {
    it('should persist episode count to database on initialization', async () => {
      // This test will fail until we implement Prisma persistence
      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter.initialize();

      // Should have called upsert to create/fetch initial record
      expect(mockPrisma.zepEpisodeUsage.upsert).toHaveBeenCalledWith({
        where: { tenantId: 'global' },
        create: expect.objectContaining({
          tenantId: 'global',
          episodesUsed: 0,
        }),
        update: {},
      });
    });

    it('should load episode count from database on initialize', async () => {
      // Simulate existing record with 50 episodes used
      // Cloud API also returns 50 to avoid sync override
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/account/usage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ episodes_used: 50 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 50,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter.initialize();

      const budget = await adapter.getEpisodeBudget();
      expect(budget.used).toBe(50);
      expect(budget.remaining).toBe(950);
    });

    it('should survive adapter restart with persisted count', async () => {
      // Cloud API also returns 5 to match DB
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/account/usage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ episodes_used: 5 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      // First adapter instance - simulate adding episodes
      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 5,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      const adapter1 = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter1.initialize();
      const budget1 = await adapter1.getEpisodeBudget();
      expect(budget1.used).toBe(5);

      // Simulate restart - create new adapter instance
      // The DB should still have 5 episodes
      const adapter2 = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter2.initialize();
      const budget2 = await adapter2.getEpisodeBudget();
      expect(budget2.used).toBe(5); // Should load from DB, not reset to 0
    });
  });

  describe('Audit logging', () => {
    it('should create audit log on episode increment', async () => {
      let episodesUsed = 0;

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

      // Mock transaction to track increments
      mockPrisma.$transaction.mockImplementation(async (ops) => {
        // Execute the operations
        for (const op of ops) {
          await op;
        }
        return [];
      });

      mockPrisma.zepEpisodeUsage.update.mockImplementation(async () => {
        episodesUsed++;
        return {};
      });

      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter.initialize();
      await adapter.addMemory('session-1', [{ role: 'user', content: 'hello' }]);

      // Should have created an audit entry
      expect(mockPrisma.zepEpisodeAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'global',
          previousCount: expect.any(Number),
          newCount: expect.any(Number),
          delta: 1,
          operation: 'ADD_MEMORY',
        }),
      });
    });

    it('should track session creation in audit log', async () => {
      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter.initialize();
      await adapter.createSession('session-1', { tenantId: 'global' });

      expect(mockPrisma.zepEpisodeAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'CREATE_SESSION',
          sessionId: 'session-1',
        }),
      });
    });
  });

  describe('Cloud sync', () => {
    it('should sync with Zep Cloud API when available', async () => {
      // Mock Cloud API returning higher count
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/account/usage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ episodes_used: 100 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      mockPrisma.zepEpisodeUsage.upsert.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 50, // Local has 50
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter.initialize();

      // Should have synced to higher cloud count
      expect(mockPrisma.zepEpisodeUsage.update).toHaveBeenCalledWith({
        where: { tenantId: 'global' },
        data: expect.objectContaining({
          episodesUsed: 100,
          lastSyncedAt: expect.any(Date),
          lastSyncSuccess: true,
        }),
      });
    });

    it('should handle Cloud API errors gracefully', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/account/usage')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      // Should not throw
      await expect(adapter.initialize()).resolves.not.toThrow();

      // Should mark sync as failed
      expect(mockPrisma.zepEpisodeUsage.update).toHaveBeenCalledWith({
        where: { tenantId: 'global' },
        data: { lastSyncSuccess: false },
      });
    });
  });

  describe('Budget status with persistence', () => {
    it('should include isPersisted flag in budget response', async () => {
      mockPrisma.zepEpisodeUsage.findUnique.mockResolvedValue({
        id: 'test-id',
        tenantId: 'global',
        episodesUsed: 10,
        maxEpisodes: 1000,
        warningPercent: 80,
        hardLimitPercent: 95,
        lastUpdated: new Date(),
        createdAt: new Date(),
        lastSyncedAt: null,
        lastSyncSuccess: false,
      });

      const adapter = new ZepMemoryAdapter({
        ...testConfig,
        prisma: mockPrisma as unknown,
        tenantId: 'global',
      });

      await adapter.initialize();
      const budget = await adapter.getEpisodeBudget();

      expect(budget).toHaveProperty('isPersisted');
      expect(budget.isPersisted).toBe(true);
    });
  });
});
