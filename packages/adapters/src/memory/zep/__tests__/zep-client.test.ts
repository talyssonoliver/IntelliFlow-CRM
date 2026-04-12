/**
 * Zep Memory Adapter Tests - IFC-086
 *
 * Tests for the Zep Cloud SDK integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ZepMemoryAdapter, createZepAdapter, type ZepConfig } from '../zep-client';

// Mock global fetch for HTTP requests
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Default mock responses
const defaultFetchMock = () => {
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
    if (url.includes('/memory/search')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
};

describe('ZepMemoryAdapter', () => {
  let adapter: ZepMemoryAdapter;
  const testConfig: ZepConfig = {
    apiKey: 'test-api-key',
    projectId: 'test-project',
  };

  beforeEach(() => {
    defaultFetchMock();
    adapter = new ZepMemoryAdapter(testConfig);
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      expect(adapter).toBeInstanceOf(ZepMemoryAdapter);
    });

    it('should use default episode limits', async () => {
      const budget = await adapter.getEpisodeBudget();
      // EpisodeBudget has: used, remaining, warningThreshold, limitThreshold, isWarning, isLimited
      expect(budget.used).toBe(0);
      expect(budget.remaining).toBe(1000); // 1000 (default max) - 0 (used)
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it('should mark as initialized', async () => {
      await adapter.initialize();
      expect(adapter.isInitialized).toBe(true);
    });
  });

  describe('createSession', () => {
    it('should create session with metadata', async () => {
      // Update mock to return the input sessionId
      mockFetch.mockImplementation((url: string, options?: { method?: string; body?: string }) => {
        if (url.includes('/account/usage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ episodes_used: 0 }),
          });
        }
        if (url.includes('/sessions') && options?.method === 'POST') {
          // Parse the input to get the session_id from request body
          const body = options?.body ? JSON.parse(options.body) : {};
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                session_id: body.session_id ?? 'test-session',
                metadata: body.metadata ?? {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      await adapter.initialize();

      const session = await adapter.createSession('session-123', {
        userId: 'user-456',
        chainType: 'SCORING',
        tenantId: 'tenant-789',
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe('session-123');
    });

    it('should auto-initialize if not initialized', async () => {
      // The implementation auto-initializes via ensureInitialized()
      // So this test verifies that createSession works even without explicit initialize()
      const session = await adapter.createSession('auto-init-session', {
        userId: 'user-456',
        chainType: 'SCORING',
        tenantId: 'tenant-789',
      });

      expect(session).toBeDefined();
      expect(adapter.isInitialized).toBe(true);
    });
  });

  describe('addMemory', () => {
    it('should add memory messages', async () => {
      await adapter.initialize();

      await adapter.addMemory('session-123', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const budget = await adapter.getEpisodeBudget();
      expect(budget.used).toBe(1); // One episode added
    });

    it('should increment episode count', async () => {
      await adapter.initialize();

      await adapter.addMemory('session-1', [{ role: 'user', content: 'Test 1' }]);
      await adapter.addMemory('session-2', [{ role: 'user', content: 'Test 2' }]);

      const budget = await adapter.getEpisodeBudget();
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
        await limitedAdapter.addMemory(`session-${i}`, [{ role: 'user', content: `Message ${i}` }]);
      }

      // Should be at warning threshold
      const budget = await limitedAdapter.getEpisodeBudget();
      expect(budget.isWarning).toBe(true);
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

      const budget = await adapter.getEpisodeBudget();
      expect(budget.remaining).toBe(999);
      expect(budget.used).toBe(1);
    });

    it('should report warning threshold correctly', async () => {
      // Use a small maxEpisodes value so we hit the threshold quickly
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 10,
        warningThresholdPercent: 50, // 50% of 10 = 5
        hardLimitPercent: 90, // 90% of 10 = 9
      });

      await limitedAdapter.initialize();

      // Add 5 episodes to reach warning threshold
      for (let i = 0; i < 5; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [{ role: 'user', content: `Message ${i}` }]);
      }

      const budget = await limitedAdapter.getEpisodeBudget();
      expect(budget.used).toBe(5);
      expect(budget.isWarning).toBe(true);
      expect(budget.isLimited).toBe(false);
    });

    it('should report hard limit correctly', async () => {
      // Use a small maxEpisodes value so we hit the threshold quickly
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 10,
        warningThresholdPercent: 50,
        hardLimitPercent: 80, // 80% of 10 = 8
      });

      await limitedAdapter.initialize();

      // Add 8 episodes to reach hard limit threshold
      for (let i = 0; i < 8; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [{ role: 'user', content: `Message ${i}` }]);
      }

      const budget = await limitedAdapter.getEpisodeBudget();
      expect(budget.used).toBe(8);
      expect(budget.isLimited).toBe(true);
    });
  });

  describe('searchMemory', () => {
    it('should search memories', async () => {
      await adapter.initialize();

      // searchMemory returns ZepMessage[] directly, not { results: [] }
      const results = await adapter.searchMemory('test query');

      expect(results).toBeDefined();
      expect(results).toBeInstanceOf(Array);
    });

    it('should respect limit parameter', async () => {
      await adapter.initialize();

      const results = await adapter.searchMemory('query', { limit: 5 });

      expect(results).toBeDefined();
    });
  });

  describe('fallback behavior', () => {
    it('should use in-memory storage when at limit', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 5,
        hardLimitPercent: 80, // 80% of 5 = 4
      });

      await limitedAdapter.initialize();

      // Fill up to hard limit (4 episodes)
      for (let i = 0; i < 4; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [{ role: 'user', content: `Message ${i}` }]);
      }

      // After reaching hard limit, should be using fallback
      // The isLimited flag indicates we're at the limit
      const budget = await limitedAdapter.getEpisodeBudget();
      expect(budget.isLimited).toBe(true);

      // This should use fallback (no API call, stored in memory)
      await limitedAdapter.addMemory('session-fallback', [
        { role: 'user', content: 'Fallback message' },
      ]);

      // Verify we can retrieve from fallback
      const memory = await limitedAdapter.getMemory('session-fallback');
      expect(memory.messages.length).toBeGreaterThan(0);
    });

    it('should retrieve from fallback storage', async () => {
      const limitedAdapter = new ZepMemoryAdapter({
        ...testConfig,
        maxEpisodes: 5,
        hardLimitPercent: 80, // 80% of 5 = 4
      });

      await limitedAdapter.initialize();

      // Fill up to hard limit (4 episodes)
      for (let i = 0; i < 4; i++) {
        await limitedAdapter.addMemory(`session-${i}`, [{ role: 'user', content: `Message ${i}` }]);
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

  it('should create adapter with full config', async () => {
    defaultFetchMock();
    const adapter = createZepAdapter({
      apiKey: 'test-key',
      projectId: 'test-project',
      maxEpisodes: 500,
      warningThresholdPercent: 70,
      hardLimitPercent: 90,
    });

    expect(adapter).toBeInstanceOf(ZepMemoryAdapter);

    await adapter.initialize();
    const budget = await adapter.getEpisodeBudget();
    // With 0 used out of 500 max, remaining should be 500
    expect(budget.remaining).toBe(500);
    expect(budget.used).toBe(0);
  });
});
