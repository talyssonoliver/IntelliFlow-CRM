import { calculateCost, aiConfig } from '../config/ai.config';
import pino from 'pino';

const logger = pino({
  name: 'cost-tracker',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Usage metrics for a single AI operation
 */
export interface UsageMetrics {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: Date;
  operationType: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated cost statistics
 */
export interface CostStatistics {
  totalCost: number;
  totalOperations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costByModel: Record<string, number>;
  costByOperation: Record<string, number>;
  averageCostPerOperation: number;
  startTime: Date;
  endTime: Date;
  /**
   * A ranged query reached past the retained history (older records were evicted), so its
   * totals cover only the records kept. The unranged daily statistics are always exact.
   */
  truncated: boolean;
}

interface DailyTotals {
  cost: number;
  operations: number;
  inputTokens: number;
  outputTokens: number;
  costByModel: Record<string, number>;
  costByOperation: Record<string, number>;
}

function emptyTotals(): DailyTotals {
  return {
    cost: 0,
    operations: 0,
    inputTokens: 0,
    outputTokens: 0,
    costByModel: {},
    costByOperation: {},
  };
}

/**
 * Cost tracking service
 * Tracks AI usage, costs, and enforces limits
 */
export type UsageListener = (usage: UsageMetrics) => void;

/**
 * Most recent usage records kept in memory. Every model and embedding call is metered
 * (PG-199), so an unbounded history would grow the long-lived worker's heap until it is
 * killed. The daily statistics come from running totals, so eviction never changes them.
 */
export const USAGE_HISTORY_LIMIT = 1000;

export class CostTracker {
  private usageHistory: UsageMetrics[] = [];
  private readonly listeners = new Set<UsageListener>();
  private dailyCost: number = 0;
  private dailyTotals: DailyTotals = emptyTotals();
  private evictedRecords = 0;
  private lastResetDate: Date = new Date();

  constructor(
    private readonly warningThreshold: number = aiConfig.costTracking.warningThreshold,
    private readonly dailyLimit?: number
  ) {
    this.resetDailyCounters();
  }

  /**
   * Subscribe to every recorded operation (e.g. to attribute spend to a tenant).
   * A throwing listener never affects the caller. Returns an unsubscribe function.
   */
  addListener(listener: UsageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Record an AI operation with token usage
   */
  recordUsage(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    operationType: string;
    metadata?: Record<string, unknown>;
  }): UsageMetrics {
    this.resetDailyCountersIfNeeded();

    const cost = calculateCost(params.model, params.inputTokens, params.outputTokens);

    const usage: UsageMetrics = {
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cost,
      timestamp: new Date(),
      operationType: params.operationType,
      metadata: params.metadata,
    };

    this.usageHistory.push(usage);
    if (this.usageHistory.length > USAGE_HISTORY_LIMIT) {
      const excess = this.usageHistory.length - USAGE_HISTORY_LIMIT;
      this.usageHistory.splice(0, excess);
      this.evictedRecords += excess;
    }
    this.dailyCost += cost;
    this.addToDailyTotals(usage);

    // Notify before the threshold check: that check can throw, and the spend already happened.
    for (const listener of this.listeners) {
      try {
        listener(usage);
      } catch (error) {
        logger.warn({ error: String(error) }, 'Cost usage listener failed');
      }
    }

    // Log usage
    logger.info(
      {
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        cost: cost.toFixed(4),
        operationType: params.operationType,
        dailyCost: this.dailyCost.toFixed(4),
      },
      'AI operation recorded'
    );

    // Check thresholds
    this.checkThresholds();

    return usage;
  }

  /**
   * Get cost statistics for a time period
   */
  getStatistics(startTime?: Date, endTime?: Date): CostStatistics {
    if (!startTime && !endTime) return this.dailyStatistics();
    const start = startTime || this.lastResetDate;
    const end = endTime || new Date();

    const filteredUsage = this.usageHistory.filter(
      (u) => u.timestamp >= start && u.timestamp <= end
    );

    const totalCost = filteredUsage.reduce((sum, u) => sum + u.cost, 0);
    const totalInputTokens = filteredUsage.reduce((sum, u) => sum + u.inputTokens, 0);
    const totalOutputTokens = filteredUsage.reduce((sum, u) => sum + u.outputTokens, 0);

    // Group by model
    const costByModel: Record<string, number> = {};
    for (const u of filteredUsage) {
      costByModel[u.model] = (costByModel[u.model] || 0) + u.cost;
    }

    // Group by operation type
    const costByOperation: Record<string, number> = {};
    for (const u of filteredUsage) {
      costByOperation[u.operationType] = (costByOperation[u.operationType] || 0) + u.cost;
    }

    return {
      totalCost,
      totalOperations: filteredUsage.length,
      totalInputTokens,
      totalOutputTokens,
      costByModel,
      costByOperation,
      averageCostPerOperation: filteredUsage.length > 0 ? totalCost / filteredUsage.length : 0,
      startTime: start,
      endTime: end,
      truncated: this.evictedRecords > 0 && start < (this.usageHistory[0]?.timestamp ?? end),
    };
  }

  /** Today's statistics from the running totals: exact however many records were evicted. */
  private dailyStatistics(): CostStatistics {
    this.resetDailyCountersIfNeeded();
    const t = this.dailyTotals;
    return {
      totalCost: t.cost,
      totalOperations: t.operations,
      totalInputTokens: t.inputTokens,
      totalOutputTokens: t.outputTokens,
      costByModel: { ...t.costByModel },
      costByOperation: { ...t.costByOperation },
      averageCostPerOperation: t.operations > 0 ? t.cost / t.operations : 0,
      startTime: this.lastResetDate,
      endTime: new Date(),
      truncated: false,
    };
  }

  private addToDailyTotals(usage: UsageMetrics): void {
    const t = this.dailyTotals;
    t.cost += usage.cost;
    t.operations += 1;
    t.inputTokens += usage.inputTokens;
    t.outputTokens += usage.outputTokens;
    t.costByModel[usage.model] = (t.costByModel[usage.model] || 0) + usage.cost;
    t.costByOperation[usage.operationType] =
      (t.costByOperation[usage.operationType] || 0) + usage.cost;
  }

  /**
   * Get current daily cost
   */
  getDailyCost(): number {
    this.resetDailyCountersIfNeeded();
    return this.dailyCost;
  }

  /**
   * Refuse a call before it is made once the daily limit is reached. The call that crossed
   * the limit was already paid for and keeps its answer; this stops the ones after it.
   */
  assertWithinDailyLimit(): void {
    if (this.dailyLimit && this.getDailyCost() >= this.dailyLimit) {
      throw new Error(
        `Daily AI cost limit exceeded: $${this.dailyCost.toFixed(2)} / $${this.dailyLimit.toFixed(2)}`
      );
    }
  }

  /**
   * Check if we're approaching or exceeding limits
   */
  private checkThresholds(): void {
    // Check warning threshold
    if (this.dailyCost >= this.warningThreshold) {
      logger.warn(
        {
          dailyCost: this.dailyCost.toFixed(2),
          warningThreshold: this.warningThreshold.toFixed(2),
        },
        'Daily AI cost warning threshold exceeded'
      );
    }

    // Check daily limit
    if (this.dailyLimit && this.dailyCost >= this.dailyLimit) {
      logger.error(
        {
          dailyCost: this.dailyCost.toFixed(2),
          dailyLimit: this.dailyLimit.toFixed(2),
        },
        'Daily AI cost limit exceeded!'
      );

      throw new Error(
        `Daily AI cost limit exceeded: $${this.dailyCost.toFixed(2)} / $${this.dailyLimit.toFixed(2)}`
      );
    }
  }

  /**
   * Reset daily counters if we've crossed midnight
   */
  private resetDailyCountersIfNeeded(): void {
    const now = new Date();
    const lastResetDay = this.lastResetDate.toDateString();
    const currentDay = now.toDateString();

    if (lastResetDay !== currentDay) {
      this.resetDailyCounters();
    }
  }

  /**
   * Reset daily cost counters
   */
  private resetDailyCounters(): void {
    const previousCost = this.dailyCost;

    if (previousCost > 0) {
      logger.info(
        {
          previousDailyCost: previousCost.toFixed(2),
          date: this.lastResetDate.toDateString(),
        },
        'Resetting daily cost counters'
      );
    }

    this.dailyCost = 0;
    this.dailyTotals = emptyTotals();
    this.lastResetDate = new Date();
  }

  /**
   * Export usage history for analysis
   */
  exportHistory(): UsageMetrics[] {
    return [...this.usageHistory];
  }

  /**
   * Clear usage history (use with caution)
   */
  clearHistory(): void {
    logger.warn('Clearing usage history');
    this.usageHistory = [];
    this.dailyCost = 0;
    this.dailyTotals = emptyTotals();
    this.evictedRecords = 0;
  }

  /**
   * Generate cost report
   */
  generateReport(): string {
    const stats = this.getStatistics();

    let report = '=== AI Cost Report ===\n\n';
    report += `Period: ${stats.startTime.toISOString()} to ${stats.endTime.toISOString()}\n`;
    report += `Total Cost: $${stats.totalCost.toFixed(2)}\n`;
    report += `Total Operations: ${stats.totalOperations}\n`;
    report += `Average Cost per Operation: $${stats.averageCostPerOperation.toFixed(4)}\n`;
    report += `Total Input Tokens: ${stats.totalInputTokens.toLocaleString('en-US')}\n`;
    report += `Total Output Tokens: ${stats.totalOutputTokens.toLocaleString('en-US')}\n\n`;

    report += 'Cost by Model:\n';
    for (const [model, cost] of Object.entries(stats.costByModel)) {
      report += `  ${model}: $${cost.toFixed(4)}\n`;
    }

    report += '\nCost by Operation:\n';
    for (const [op, cost] of Object.entries(stats.costByOperation)) {
      report += `  ${op}: $${cost.toFixed(4)}\n`;
    }

    return report;
  }
}

/**
 * Global cost tracker instance
 */
export const costTracker = new CostTracker(
  aiConfig.costTracking.warningThreshold,
  aiConfig.costTracking.dailyLimit
);
