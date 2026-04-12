/**
 * Deal Forecasting & Reporting - IFC-092
 *
 * Provides comprehensive forecasting algorithms for deal pipeline:
 * - Weighted pipeline forecasting based on probability
 * - Win rate calculations from historical data
 * - Revenue projections with confidence intervals
 * - Accuracy backtesting capabilities
 *
 * Target KPI: Forecast accuracy >= 85%
 */

import type { OpportunityStage } from '@intelliflow/domain';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface Opportunity {
  id: string;
  name: string;
  value: number;
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  accountId: string;
  ownerId: string;
}

export interface ForecastResult {
  period: string;
  weightedPipelineValue: number;
  totalPipelineValue: number;
  expectedWins: number;
  confidenceInterval: {
    low: number;
    high: number;
  };
  breakdown: StageBreakdown[];
}

export interface StageBreakdown {
  stage: OpportunityStage;
  count: number;
  totalValue: number;
  weightedValue: number;
  averageProbability: number;
}

export interface WinRateMetrics {
  overallWinRate: number;
  byStage: Record<OpportunityStage, number>;
  byPeriod: PeriodWinRate[];
  averageDealSize: number;
  averageSalesCycle: number;
}

export interface PeriodWinRate {
  period: string;
  winRate: number;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
}

export interface BacktestResult {
  period: string;
  forecastedValue: number;
  actualValue: number;
  accuracy: number;
  error: number;
  errorPercentage: number;
}

export interface AccuracyReport {
  overallAccuracy: number;
  mape: number; // Mean Absolute Percentage Error
  rmse: number; // Root Mean Square Error
  backtestResults: BacktestResult[];
  meetsKPI: boolean;
}

// ============================================
// STAGE PROBABILITY DEFAULTS
// ============================================

export const DEFAULT_STAGE_PROBABILITIES: Record<OpportunityStage, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

// ============================================
// FORECAST ALGORITHMS
// ============================================

/**
 * Calculate weighted pipeline value for a set of opportunities
 * Uses probability-weighted approach where each deal contributes:
 * value * (probability / 100)
 */
export function calculateWeightedPipelineValue(opportunities: Opportunity[]): number {
  return opportunities.reduce((sum, opp) => {
    // Exclude closed deals from pipeline calculation
    if (opp.stage === 'CLOSED_WON' || opp.stage === 'CLOSED_LOST') {
      return sum;
    }
    return sum + opp.value * (opp.probability / 100);
  }, 0);
}

/**
 * Calculate total unweighted pipeline value
 */
export function calculateTotalPipelineValue(opportunities: Opportunity[]): number {
  return opportunities.reduce((sum, opp) => {
    if (opp.stage === 'CLOSED_WON' || opp.stage === 'CLOSED_LOST') {
      return sum;
    }
    return sum + opp.value;
  }, 0);
}

/**
 * Calculate stage-by-stage breakdown of the pipeline
 */
export function calculateStageBreakdown(opportunities: Opportunity[]): StageBreakdown[] {
  const stages: OpportunityStage[] = [
    'PROSPECTING',
    'QUALIFICATION',
    'NEEDS_ANALYSIS',
    'PROPOSAL',
    'NEGOTIATION',
  ];

  return stages.map((stage) => {
    const stageOpps = opportunities.filter((o) => o.stage === stage);
    const totalValue = stageOpps.reduce((sum, o) => sum + o.value, 0);
    const totalProbability = stageOpps.reduce((sum, o) => sum + o.probability, 0);

    return {
      stage,
      count: stageOpps.length,
      totalValue,
      weightedValue: stageOpps.reduce((sum, o) => sum + o.value * (o.probability / 100), 0),
      averageProbability: stageOpps.length > 0 ? totalProbability / stageOpps.length : 0,
    };
  });
}

/**
 * Generate a complete forecast for a given period
 */
export function generateForecast(
  opportunities: Opportunity[],
  period: string = 'current_quarter'
): ForecastResult {
  const activeOpps = opportunities.filter(
    (o) => o.stage !== 'CLOSED_WON' && o.stage !== 'CLOSED_LOST'
  );

  const weightedValue = calculateWeightedPipelineValue(activeOpps);
  const totalValue = calculateTotalPipelineValue(activeOpps);
  const breakdown = calculateStageBreakdown(activeOpps);

  // Calculate expected wins based on probability
  const expectedWins = activeOpps.reduce((sum, o) => sum + o.probability / 100, 0);

  // Calculate confidence interval (using standard deviation of probabilities)
  const probabilities = activeOpps.map((o) => o.value * (o.probability / 100));
  const mean = probabilities.length > 0 ? probabilities.reduce((a, b) => a + b, 0) : 0;
  const variance =
    probabilities.length > 0
      ? probabilities.reduce((sum, p) => sum + Math.pow(p - mean / probabilities.length, 2), 0) /
        probabilities.length
      : 0;
  const stdDev = Math.sqrt(variance);

  // 90% confidence interval
  const zScore = 1.645;
  const marginOfError = zScore * stdDev;

  return {
    period,
    weightedPipelineValue: Math.round(weightedValue * 100) / 100,
    totalPipelineValue: Math.round(totalValue * 100) / 100,
    expectedWins: Math.round(expectedWins * 10) / 10,
    confidenceInterval: {
      low: Math.max(0, Math.round((weightedValue - marginOfError) * 100) / 100),
      high: Math.round((weightedValue + marginOfError) * 100) / 100,
    },
    breakdown,
  };
}

// ============================================
// WIN RATE CALCULATIONS
// ============================================

/**
 * Calculate overall win rate from historical closed deals
 */
export function calculateWinRate(closedOpportunities: Opportunity[]): number {
  const closed = closedOpportunities.filter(
    (o) => o.stage === 'CLOSED_WON' || o.stage === 'CLOSED_LOST'
  );

  if (closed.length === 0) return 0;

  const won = closed.filter((o) => o.stage === 'CLOSED_WON').length;
  return Math.round((won / closed.length) * 100 * 10) / 10;
}

/**
 * Calculate win rate by original stage (stage conversion rates)
 */
export function calculateStageConversionRates(
  historicalData: Array<{ originalStage: OpportunityStage; finalStage: OpportunityStage }>
): Record<OpportunityStage, number> {
  const stages: OpportunityStage[] = [
    'PROSPECTING',
    'QUALIFICATION',
    'NEEDS_ANALYSIS',
    'PROPOSAL',
    'NEGOTIATION',
  ];

  const rates: Record<OpportunityStage, number> = {
    PROSPECTING: 0,
    QUALIFICATION: 0,
    NEEDS_ANALYSIS: 0,
    PROPOSAL: 0,
    NEGOTIATION: 0,
    CLOSED_WON: 100,
    CLOSED_LOST: 0,
  };

  stages.forEach((stage) => {
    const fromStage = historicalData.filter((h) => h.originalStage === stage);
    if (fromStage.length === 0) {
      rates[stage] = DEFAULT_STAGE_PROBABILITIES[stage];
      return;
    }
    const won = fromStage.filter((h) => h.finalStage === 'CLOSED_WON').length;
    rates[stage] = Math.round((won / fromStage.length) * 100 * 10) / 10;
  });

  return rates;
}

/**
 * Calculate average deal size from won opportunities
 */
export function calculateAverageDealSize(wonOpportunities: Opportunity[]): number {
  const won = wonOpportunities.filter((o) => o.stage === 'CLOSED_WON');
  if (won.length === 0) return 0;

  const totalValue = won.reduce((sum, o) => sum + o.value, 0);
  return Math.round((totalValue / won.length) * 100) / 100;
}

/**
 * Calculate average sales cycle in days
 */
export function calculateAverageSalesCycle(closedOpportunities: Opportunity[]): number {
  const won = closedOpportunities.filter((o) => o.stage === 'CLOSED_WON' && o.closedAt);

  if (won.length === 0) return 0;

  const totalDays = won.reduce((sum, o) => {
    const created = new Date(o.createdAt);
    const closed = new Date(o.closedAt!);
    const days = Math.floor((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return sum + days;
  }, 0);

  return Math.round(totalDays / won.length);
}

/**
 * Generate comprehensive win rate metrics
 */
export function generateWinRateMetrics(
  opportunities: Opportunity[],
  stageHistory?: Array<{ originalStage: OpportunityStage; finalStage: OpportunityStage }>
): WinRateMetrics {
  const closedOpps = opportunities.filter(
    (o) => o.stage === 'CLOSED_WON' || o.stage === 'CLOSED_LOST'
  );

  return {
    overallWinRate: calculateWinRate(closedOpps),
    byStage: stageHistory
      ? calculateStageConversionRates(stageHistory)
      : DEFAULT_STAGE_PROBABILITIES,
    byPeriod: [], // Would be populated with time-series data
    averageDealSize: calculateAverageDealSize(opportunities),
    averageSalesCycle: calculateAverageSalesCycle(opportunities),
  };
}

// ============================================
// ACCURACY BACKTESTING
// ============================================

/**
 * Backtest forecast accuracy against actual results
 * Compares weighted pipeline forecasts to actual closed-won values
 */
export function backtestForecastAccuracy(
  forecasts: Array<{ period: string; forecast: number }>,
  actuals: Array<{ period: string; actual: number }>
): AccuracyReport {
  const results: BacktestResult[] = [];
  let totalSquaredError = 0;
  let totalAbsolutePercentageError = 0;
  let validComparisons = 0;

  forecasts.forEach((f) => {
    const actual = actuals.find((a) => a.period === f.period);
    if (!actual) return;

    const error = Math.abs(f.forecast - actual.actual);
    const errorPercentage = actual.actual > 0 ? (error / actual.actual) * 100 : 0;
    const accuracy = Math.max(0, 100 - errorPercentage);

    results.push({
      period: f.period,
      forecastedValue: f.forecast,
      actualValue: actual.actual,
      accuracy: Math.round(accuracy * 10) / 10,
      error: Math.round(error * 100) / 100,
      errorPercentage: Math.round(errorPercentage * 10) / 10,
    });

    totalSquaredError += Math.pow(error, 2);
    totalAbsolutePercentageError += errorPercentage;
    validComparisons++;
  });

  const mape = validComparisons > 0 ? totalAbsolutePercentageError / validComparisons : 0;
  const rmse = validComparisons > 0 ? Math.sqrt(totalSquaredError / validComparisons) : 0;
  const overallAccuracy = Math.max(0, 100 - mape);

  return {
    overallAccuracy: Math.round(overallAccuracy * 10) / 10,
    mape: Math.round(mape * 10) / 10,
    rmse: Math.round(rmse * 100) / 100,
    backtestResults: results,
    meetsKPI: overallAccuracy >= 85,
  };
}

/**
 * Adjust probabilities based on historical accuracy
 * Uses Bayesian updating to improve probability estimates
 */
export function adjustProbabilitiesFromHistory(
  defaultProbabilities: Record<OpportunityStage, number>,
  historicalWinRates: Record<OpportunityStage, number>
): Record<OpportunityStage, number> {
  const adjusted: Record<OpportunityStage, number> = { ...defaultProbabilities };
  const alpha = 0.3; // Learning rate for Bayesian update

  const stages: OpportunityStage[] = [
    'PROSPECTING',
    'QUALIFICATION',
    'NEEDS_ANALYSIS',
    'PROPOSAL',
    'NEGOTIATION',
  ];

  stages.forEach((stage) => {
    const historical = historicalWinRates[stage] ?? defaultProbabilities[stage];
    // Bayesian update: weighted average of default and historical
    adjusted[stage] = Math.round((1 - alpha) * defaultProbabilities[stage] + alpha * historical);
  });

  return adjusted;
}

/**
 * Calculate real forecast accuracy by comparing monthly weighted pipeline
 * predictions to actual closed revenue using MAPE.
 */
export function calculateForecastAccuracy(
  monthlyRevenue: Record<string, { actual: number; deals: number }>,
  weightedPipelineValue: number,
  winRate: number
): { accuracy: number; target: number; isAtRisk: boolean } {
  const TARGET = 85;

  const months = Object.entries(monthlyRevenue);
  if (months.length < 2) {
    // Not enough historical data to compute accuracy
    return { accuracy: 0, target: TARGET, isAtRisk: true };
  }

  // Build forecast vs actual pairs from monthly data.
  // For each month with known actuals, the "forecast" is the weighted pipeline
  // value scaled by the ratio of that month's deal count to total deals.
  const totalDeals = months.reduce((s, [, d]) => s + d.deals, 0);

  const forecasts: Array<{ period: string; forecast: number }> = [];
  const actuals: Array<{ period: string; actual: number }> = [];

  for (const [month, data] of months) {
    if (data.actual <= 0 || data.deals <= 0) continue;
    // Proportional share of weighted pipeline for this month
    const monthShare = data.deals / totalDeals;
    forecasts.push({ period: month, forecast: weightedPipelineValue * monthShare });
    actuals.push({ period: month, actual: data.actual });
  }

  if (forecasts.length === 0) {
    return { accuracy: 0, target: TARGET, isAtRisk: true };
  }

  const report = backtestForecastAccuracy(forecasts, actuals);

  return {
    accuracy: Math.round(report.overallAccuracy * 10) / 10,
    target: TARGET,
    isAtRisk: report.overallAccuracy < TARGET,
  };
}
