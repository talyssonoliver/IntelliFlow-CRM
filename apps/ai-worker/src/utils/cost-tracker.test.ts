import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CostTracker, UsageMetrics } from './cost-tracker';

// Mock the ai.config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    costTracking: {
      enabled: true,
      warningThreshold: 10,
      dailyLimit: 50,
    },
  },
  calculateCost: vi.fn((model: string, inputTokens: number, outputTokens: number) => {
    // Simple mock cost calculation
    return (inputTokens / 1000) * 0.01 + (outputTokens / 1000) * 0.03;
  }),
}));

describe('CostTracker', () => {
  let tracker: CostTracker;
  let originalDate: typeof Date;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save original Date
    originalDate = global.Date;

    // Create fresh tracker
    tracker = new CostTracker(10, 50);
  });

  afterEach(() => {
    // Restore original Date
    global.Date = originalDate;
  });

  describe('constructor', () => {
    it('should initialize with warning threshold and daily limit', () => {
      const customTracker = new CostTracker(5, 25);
      expect(customTracker).toBeDefined();
    });

    it('should initialize with warning threshold only', () => {
      const customTracker = new CostTracker(15);
      expect(customTracker).toBeDefined();
    });
  });

  describe('recordUsage', () => {
    it('should record AI operation usage', () => {
      const usage = tracker.recordUsage({
        model: 'gpt-4-turbo-preview',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'lead_scoring',
      });

      expect(usage).toBeDefined();
      expect(usage.model).toBe('gpt-4-turbo-preview');
      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
      expect(usage.operationType).toBe('lead_scoring');
      expect(usage.cost).toBeGreaterThan(0);
      expect(usage.timestamp).toBeInstanceOf(Date);
    });

    it('should include metadata when provided', () => {
      const usage = tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 500,
        outputTokens: 250,
        operationType: 'qualification',
        metadata: {
          leadId: 'lead-123',
          userId: 'user-456',
        },
      });

      expect(usage.metadata).toBeDefined();
      expect(usage.metadata?.leadId).toBe('lead-123');
      expect(usage.metadata?.userId).toBe('user-456');
    });

    it('should accumulate daily cost', () => {
      expect(tracker.getDailyCost()).toBe(0);

      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 1000,
        operationType: 'test',
      });

      const cost1 = tracker.getDailyCost();
      expect(cost1).toBeGreaterThan(0);

      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 1000,
        operationType: 'test',
      });

      const cost2 = tracker.getDailyCost();
      expect(cost2).toBeGreaterThan(cost1);
    });

    it('should track multiple operations', () => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        operationType: 'scoring',
      });

      tracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 200,
        outputTokens: 100,
        operationType: 'qualification',
      });

      const stats = tracker.getStatistics();
      expect(stats.totalOperations).toBe(2);
    });
  });

  describe('checkThresholds', () => {
    it('should not throw when under warning threshold', () => {
      expect(() => {
        tracker.recordUsage({
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          operationType: 'test',
        });
      }).not.toThrow();
    });

    it('should throw when daily limit is exceeded', () => {
      const strictTracker = new CostTracker(5, 0.05);

      // Record expensive operation to exceed limit
      expect(() => {
        strictTracker.recordUsage({
          model: 'gpt-4',
          inputTokens: 10000,
          outputTokens: 10000,
          operationType: 'expensive',
        });
      }).toThrow('Daily AI cost limit exceeded');
    });

    it('should log warning when threshold exceeded but under limit', () => {
      const warningTracker = new CostTracker(0.01, 1.0);

      // This should log a warning but not throw
      expect(() => {
        warningTracker.recordUsage({
          model: 'gpt-4',
          inputTokens: 1000,
          outputTokens: 1000,
          operationType: 'test',
        });
      }).not.toThrow();
    });
  });

  describe('getStatistics', () => {
    beforeEach(() => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'scoring',
      });

      tracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 2000,
        outputTokens: 1000,
        operationType: 'qualification',
      });

      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 500,
        outputTokens: 250,
        operationType: 'scoring',
      });
    });

    it('should return comprehensive statistics', () => {
      const stats = tracker.getStatistics();

      expect(stats.totalOperations).toBe(3);
      expect(stats.totalCost).toBeGreaterThan(0);
      expect(stats.totalInputTokens).toBe(3500);
      expect(stats.totalOutputTokens).toBe(1750);
      expect(stats.startTime).toBeInstanceOf(Date);
      expect(stats.endTime).toBeInstanceOf(Date);
    });

    it('should group costs by model', () => {
      const stats = tracker.getStatistics();

      expect(stats.costByModel).toBeDefined();
      expect(stats.costByModel['gpt-4']).toBeGreaterThan(0);
      expect(stats.costByModel['gpt-3.5-turbo']).toBeGreaterThan(0);
    });

    it('should group costs by operation type', () => {
      const stats = tracker.getStatistics();

      expect(stats.costByOperation).toBeDefined();
      expect(stats.costByOperation['scoring']).toBeGreaterThan(0);
      expect(stats.costByOperation['qualification']).toBeGreaterThan(0);
    });

    it('should calculate average cost per operation', () => {
      const stats = tracker.getStatistics();

      expect(stats.averageCostPerOperation).toBe(stats.totalCost / stats.totalOperations);
    });

    it('should filter by time range', () => {
      const startTime = new Date(Date.now() - 3600000); // 1 hour ago
      const endTime = new Date();

      const stats = tracker.getStatistics(startTime, endTime);

      expect(stats.totalOperations).toBe(3);
    });

    it('should return zero stats for empty tracker', () => {
      const emptyTracker = new CostTracker(10);
      const stats = emptyTracker.getStatistics();

      expect(stats.totalOperations).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.averageCostPerOperation).toBe(0);
    });
  });

  describe('getDailyCost', () => {
    it('should return current daily cost', () => {
      expect(tracker.getDailyCost()).toBe(0);

      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'test',
      });

      expect(tracker.getDailyCost()).toBeGreaterThan(0);
    });
  });

  describe('exportHistory', () => {
    it('should export usage history', () => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        operationType: 'test1',
      });

      tracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 200,
        outputTokens: 100,
        operationType: 'test2',
      });

      const history = tracker.exportHistory();

      expect(history).toBeInstanceOf(Array);
      expect(history.length).toBe(2);
      expect(history[0].operationType).toBe('test1');
      expect(history[1].operationType).toBe('test2');
    });

    it('should return copy of history array', () => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        operationType: 'test',
      });

      const history1 = tracker.exportHistory();
      const history2 = tracker.exportHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  describe('clearHistory', () => {
    it('should clear usage history and daily cost', () => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'test',
      });

      expect(tracker.getDailyCost()).toBeGreaterThan(0);
      expect(tracker.exportHistory().length).toBe(1);

      tracker.clearHistory();

      expect(tracker.getDailyCost()).toBe(0);
      expect(tracker.exportHistory().length).toBe(0);
    });
  });

  describe('generateReport', () => {
    beforeEach(() => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'scoring',
      });

      tracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 2000,
        outputTokens: 1000,
        operationType: 'qualification',
      });
    });

    it('should generate cost report', () => {
      const report = tracker.generateReport();

      expect(report).toContain('AI Cost Report');
      expect(report).toContain('Total Cost:');
      expect(report).toContain('Total Operations:');
      expect(report).toContain('Average Cost per Operation:');
      expect(report).toContain('Total Input Tokens:');
      expect(report).toContain('Total Output Tokens:');
    });

    it('should include cost breakdown by model', () => {
      const report = tracker.generateReport();

      expect(report).toContain('Cost by Model:');
      expect(report).toContain('gpt-4');
      expect(report).toContain('gpt-3.5-turbo');
    });

    it('should include cost breakdown by operation', () => {
      const report = tracker.generateReport();

      expect(report).toContain('Cost by Operation:');
      expect(report).toContain('scoring');
      expect(report).toContain('qualification');
    });
  });

  describe('daily reset', () => {
    it('should reset daily counters on new day', () => {
      // Mock date to specific time
      const mockDate = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(mockDate);

      const testTracker = new CostTracker(10);

      testTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'test',
      });

      const cost1 = testTracker.getDailyCost();
      expect(cost1).toBeGreaterThan(0);

      // Move to next day
      const nextDay = new Date('2025-01-02T12:00:00Z');
      vi.setSystemTime(nextDay);

      // This should trigger reset
      testTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        operationType: 'test',
      });

      const cost2 = testTracker.getDailyCost();
      expect(cost2).toBeLessThan(cost1);

      vi.useRealTimers();
    });

    it('should not reset on same day', () => {
      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'test1',
      });

      const cost1 = tracker.getDailyCost();

      tracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        operationType: 'test2',
      });

      const cost2 = tracker.getDailyCost();

      expect(cost2).toBeGreaterThan(cost1);
    });
  });
});
