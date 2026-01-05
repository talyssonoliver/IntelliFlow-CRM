/**
 * Zep Memory Adapter Tests - IFC-086
 *
 * Tests for the Zep Cloud SDK integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZepMemoryAdapter, createZepAdapter, type ZepConfig } from '../zep-client';

// Mock Zep SDK
vi.mock('@getzep/zep-cloud', () => ({
  ZepClient: vi.fn().mockImplementation(() => ({
    memory: {
      add: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ messages: [] }),
      search: vi.fn().mockResolvedValue({ results: [] }),
    },
    user: {
      add: vi.fn().mockResolvedValue({ userId: 'test-user' }),
    },
  })),
}));

describe('ZepMemoryAdapter', () => {
  let adapter: ZepMemoryAdapter;
  const testConfig: ZepConfig = {
    apiKey: 'test-api-key',
    projectId: 'test-project',
  };

  beforeEach(() => {
    adapter = new ZepMemoryAdapter(testConfig);
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      expect(adapter).toBeInstanceOf(ZepMemoryAdapter);
    });

    it('should use default episode limits', () => {
      const budget = adapter.getEpisodeBudget();
      expect(budget.maxEpisodes).toBe(1000);
      expect(budget.used).toBe(0);
      expect(budget.remaining).toBe(1000);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it('should mark as initialized', async () => {
      await adapter.initialize();
      expect(adapter.isInitialized()).toBe(true);
    });
  });

  describe('createSession', () => {
    it('should create session with metadata', async () => {
      await adapter.initialize();

      const session = await adapter.createSession('session-123', {
        userId: 'user-456',
        chainType: 'SCORING',
        tenantId: 'tenant-789',
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe('session-123');
    });

    it('should throw if not initialized', async () => {
      await expect(
        adapter.createSession('session-123', {
          userId: 'user-456',
          chainType: 'SCORING',
          tenantId: 'tenant-789',
        })
      ).rejects.toThrow('Adapter not initialized');
    });
  });

  describe('addMemory', () => {
    it('should add memory messages', async () => {
      await adapter.initialize();

      await adapter.addMemory('session-123', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const budget = adapter.getEpisodeBudget();
      expect(budget.used).toBe(1); // One episode added
    });

    it('should increment episode count', async () => {
      await adapter.initialize();

      await adapter.addMemory('session-1', [{ role: 'user', content: 'Test 1' }]);
      await adapter.addMemory('session-2', [{ role: 'user', content: 'Test 2' }]);

      const budget = adapter.getEpisodeBudget();
      expect(budget.used).toBe(2);
    });

    it('should use fallback when approaching limit', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 10,
        warningThresholdPercent: 80,
      });

      await limitedAdapter.initialize();

      // Add 8 episodes (80% of 10)
      for (let i = 0; i < 8; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [
          { role: 'user', content: `Message ${i}` },
        ]);
      }

      // Should be at warning threshold
      const budget = limitedAdapter.getEpisodeBudget();
      expect(budget.atWarningThreshold).toBe(true);
    });
  });

  describe('getMemory', () => {
    it('should retrieve memory for session', async () => {
      await adapter.initialize();

      const memory = await adapter.getMemory('session-123');

      expect(memory).toBeDefined();
      expect(memory.messages).toBeInstanceOf(Array);
    });

    it('should respect lastN parameter', async () => {
      await adapter.initialize();

      const memory = await adapter.getMemory('session-123', 5);

      expect(memory).toBeDefined();
    });
  });

  describe('getEpisodeBudget', () => {
    it('should calculate remaining correctly', async () => {
      await adapter.initialize();

      await adapter.addMemory('session-1', [{ role: 'user', content: 'Test' }]);

      const budget = adapter.getEpisodeBudget();
      expect(budget.remaining).toBe(999);
      expect(budget.percentUsed).toBeCloseTo(0.1, 1);
    });

    it('should report warning threshold correctly', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 100,
        warningThresholdPercent: 50,
      });

      await limitedAdapter.initialize();

      // Add 50 episodes
      for (let i = 0; i < 50; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [
          { role: 'user', content: `Message ${i}` },
        ]);
      }

      const budget = limitedAdapter.getEpisodeBudget();
      expect(budget.atWarningThreshold).toBe(true);
      expect(budget.atHardLimit).toBe(false);
    });

    it('should report hard limit correctly', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 10,
        hardLimitPercent: 90,
      });

      await limitedAdapter.initialize();

      // Add 9 episodes (90% of 10)
      for (let i = 0; i < 9; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [
          { role: 'user', content: `Message ${i}` },
        ]);
      }

      const budget = limitedAdapter.getEpisodeBudget();
      expect(budget.atHardLimit).toBe(true);
    });
  });

  describe('searchMemory', () => {
    it('should search memories', async () => {
      await adapter.initialize();

      const results = await adapter.searchMemory('session-123', 'test query');

      expect(results).toBeDefined();
      expect(results.results).toBeInstanceOf(Array);
    });

    it('should respect limit parameter', async () => {
      await adapter.initialize();

      const results = await adapter.searchMemory('session-123', 'query', 5);

      expect(results).toBeDefined();
    });
  });

  describe('fallback behavior', () => {
    it('should use in-memory storage when at limit', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 5,
        hardLimitPercent: 80,
      });

      await limitedAdapter.initialize();

      // Fill up to hard limit
      for (let i = 0; i < 4; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [
          { role: 'user', content: `Message ${i}` },
        ]);
      }

      // This should use fallback
      await limitedAdapter.addMemory('session-fallback', [
        { role: 'user', content: 'Fallback message' },
      ]);

      expect(limitedAdapter.isUsingFallback()).toBe(true);
    });

    it('should retrieve from fallback storage', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 5,
        hardLimitPercent: 80,
      });

      await limitedAdapter.initialize();

      // Fill up to hard limit
      for (let i = 0; i < 4; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [
          { role: 'user', content: `Message ${i}` },
        ]);
      }

      // Add to fallback
      await limitedAdapter.addMemory('session-fallback', [
        { role: 'user', content: 'Fallback message' },
      ]);

      const memory = await limitedAdapter.getMemory('session-fallback');
      expect(memory.messages.length).toBeGreaterThan(0);
    });
  });
});

describe('createZepAdapter', () => {
  it('should create adapter with minimal config', () => {
    const adapter = createZepAdapter({
      apiKey: 'test-key',
    });

    expect(adapter).toBeInstanceOf(ZepMemoryAdapter);
  });

  it('should create adapter with full config', () => {
    const adapter = createZepAdapter({
      apiKey: 'test-key',
      projectId: 'test-project',
      maxEpisodes: 500,
      warningThresholdPercent: 70,
      hardLimitPercent: 90,
    });

    expect(adapter).toBeInstanceOf(ZepMemoryAdapter);

    const budget = adapter.getEpisodeBudget();
    expect(budget.maxEpisodes).toBe(500);
  });
});
