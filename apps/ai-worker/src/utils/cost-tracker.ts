import { calculateCost, ModelName, aiConfig } from '../config/ai.config';
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
}

/**
 * Cost tracking service
 * Tracks AI usage, costs, and enforces limits
 */
export class CostTracker {
  private usageHistory: UsageMetrics[] = [];
  private dailyCost: number = 0;
  private lastResetDate: Date = new Date();

  constructor(
    private warningThreshold: number = aiConfig.costTracking.warningThreshold,
    private dailyLimit?: number
  ) {
    this.resetDailyCounters();
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
    this.dailyCost += cost;

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
    filteredUsage.forEach((u) => {
      costByModel[u.model] = (costByModel[u.model] || 0) + u.cost;
    });

    // Group by operation type
    const costByOperation: Record<string, number> = {};
    filteredUsage.forEach((u) => {
      costByOperation[u.operationType] = (costByOperation[u.operationType] || 0) + u.cost;
    });

    return {
      totalCost,
      totalOperations: filteredUsage.length,
      totalInputTokens,
      totalOutputTokens,
      costByModel,
      costByOperation,
      averageCostPerOperation:
        filteredUsage.length > 0 ? totalCost / filteredUsage.length : 0,
      startTime: start,
      endTime: end,
    };
  }

  /**
   * Get current daily cost
   */
  getDailyCost(): number {
    this.resetDailyCountersIfNeeded();
    return this.dailyCost;
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
    report += `Total Input Tokens: ${stats.totalInputTokens.toLocaleString()}\n`;
    report += `Total Output Tokens: ${stats.totalOutputTokens.toLocaleString()}\n\n`;

    report += 'Cost by Model:\n';
    Object.entries(stats.costByModel).forEach(([model, cost]) => {
      report += `  ${model}: $${cost.toFixed(4)}\n`;
    });

    report += '\nCost by Operation:\n';
    Object.entries(stats.costByOperation).forEach(([op, cost]) => {
      report += `  ${op}: $${cost.toFixed(4)}\n`;
    });

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
