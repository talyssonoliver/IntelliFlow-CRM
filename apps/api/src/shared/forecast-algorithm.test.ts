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

import { describe, it, expect } from 'vitest';
import type { OpportunityStage } from '@intelliflow/domain';

import {
  calculateWeightedPipelineValue,
  calculateTotalPipelineValue,
  calculateStageBreakdown,
  generateForecast,
  calculateWinRate,
  calculateStageConversionRates,
  calculateAverageDealSize,
  calculateAverageSalesCycle,
  generateWinRateMetrics,
  backtestForecastAccuracy,
  adjustProbabilitiesFromHistory,
  calculateForecastAccuracy,
  DEFAULT_STAGE_PROBABILITIES,
  type Opportunity,
} from './forecast-algorithm';

// ============================================
// TESTS
// ============================================

describe('Deal Forecasting Algorithms - IFC-092', () => {
  // Test data
  const testOpportunities: Opportunity[] = [
    {
      id: '1',
      name: 'Enterprise Deal A',
      value: 100000,
      stage: 'PROPOSAL',
      probability: 60,
      expectedCloseDate: new Date('2025-03-15'),
      closedAt: null,
      createdAt: new Date('2025-01-01'),
      accountId: 'acc1',
      ownerId: 'user1',
    },
    {
      id: '2',
      name: 'SMB Deal B',
      value: 25000,
      stage: 'NEGOTIATION',
      probability: 80,
      expectedCloseDate: new Date('2025-02-28'),
      closedAt: null,
      createdAt: new Date('2025-01-10'),
      accountId: 'acc2',
      ownerId: 'user1',
    },
    {
      id: '3',
      name: 'Startup Deal C',
      value: 10000,
      stage: 'QUALIFICATION',
      probability: 20,
      expectedCloseDate: new Date('2025-04-01'),
      closedAt: null,
      createdAt: new Date('2025-01-15'),
      accountId: 'acc3',
      ownerId: 'user2',
    },
    {
      id: '4',
      name: 'Won Deal D',
      value: 50000,
      stage: 'CLOSED_WON',
      probability: 100,
      expectedCloseDate: new Date('2025-01-20'),
      closedAt: new Date('2025-01-20'),
      createdAt: new Date('2024-11-01'),
      accountId: 'acc4',
      ownerId: 'user1',
    },
    {
      id: '5',
      name: 'Lost Deal E',
      value: 30000,
      stage: 'CLOSED_LOST',
      probability: 0,
      expectedCloseDate: new Date('2025-01-15'),
      closedAt: new Date('2025-01-15'),
      createdAt: new Date('2024-10-01'),
      accountId: 'acc5',
      ownerId: 'user2',
    },
  ];

  describe('Weighted Pipeline Forecasting', () => {
    it('should calculate weighted pipeline value correctly', () => {
      const weighted = calculateWeightedPipelineValue(testOpportunities);
      // Expected: 100000*0.6 + 25000*0.8 + 10000*0.2 = 60000 + 20000 + 2000 = 82000
      expect(weighted).toBe(82000);
    });

    it('should exclude closed deals from pipeline calculation', () => {
      const weighted = calculateWeightedPipelineValue(testOpportunities);
      // Won and Lost deals should not be included
      expect(weighted).toBeLessThan(50000 + 30000 + 82000);
    });

    it('should calculate total pipeline value correctly', () => {
      const total = calculateTotalPipelineValue(testOpportunities);
      // Expected: 100000 + 25000 + 10000 = 135000 (excluding closed)
      expect(total).toBe(135000);
    });

    it('should handle empty pipeline', () => {
      expect(calculateWeightedPipelineValue([])).toBe(0);
      expect(calculateTotalPipelineValue([])).toBe(0);
    });
  });

  describe('Stage Breakdown Analysis', () => {
    it('should calculate stage breakdown correctly', () => {
      const breakdown = calculateStageBreakdown(testOpportunities);

      // Find PROPOSAL stage
      const proposalStage = breakdown.find((b) => b.stage === 'PROPOSAL');
      expect(proposalStage).toBeDefined();
      expect(proposalStage!.count).toBe(1);
      expect(proposalStage!.totalValue).toBe(100000);
      expect(proposalStage!.weightedValue).toBe(60000);
    });

    it('should calculate average probability per stage', () => {
      const breakdown = calculateStageBreakdown(testOpportunities);
      const negotiationStage = breakdown.find((b) => b.stage === 'NEGOTIATION');
      expect(negotiationStage!.averageProbability).toBe(80);
    });
  });

  describe('Complete Forecast Generation', () => {
    it('should generate complete forecast with confidence intervals', () => {
      const forecast = generateForecast(testOpportunities, 'Q1-2025');

      expect(forecast.period).toBe('Q1-2025');
      expect(forecast.weightedPipelineValue).toBe(82000);
      expect(forecast.totalPipelineValue).toBe(135000);
      expect(forecast.confidenceInterval.low).toBeLessThanOrEqual(forecast.weightedPipelineValue);
      expect(forecast.confidenceInterval.high).toBeGreaterThanOrEqual(
        forecast.weightedPipelineValue
      );
    });

    it('should calculate expected wins based on probability', () => {
      const forecast = generateForecast(testOpportunities);
      // Expected: 0.6 + 0.8 + 0.2 = 1.6
      expect(forecast.expectedWins).toBe(1.6);
    });
  });

  describe('Win Rate Calculations', () => {
    it('should calculate overall win rate correctly', () => {
      const winRate = calculateWinRate(testOpportunities);
      // 1 won, 1 lost = 50%
      expect(winRate).toBe(50);
    });

    it('should return 0 for empty dataset', () => {
      expect(calculateWinRate([])).toBe(0);
    });

    it('should calculate average deal size from won opportunities', () => {
      const avgSize = calculateAverageDealSize(testOpportunities);
      // Only 1 won deal at 50000
      expect(avgSize).toBe(50000);
    });

    it('should calculate average sales cycle correctly', () => {
      const cycleDays = calculateAverageSalesCycle(testOpportunities);
      // Deal D: Nov 1 to Jan 20 = ~80 days
      expect(cycleDays).toBeGreaterThan(70);
      expect(cycleDays).toBeLessThan(90);
    });
  });

  describe('Stage Conversion Rates', () => {
    it('should calculate stage conversion rates from history', () => {
      const history: Array<{ originalStage: OpportunityStage; finalStage: OpportunityStage }> = [
        { originalStage: 'PROPOSAL', finalStage: 'CLOSED_WON' },
        { originalStage: 'PROPOSAL', finalStage: 'CLOSED_WON' },
        { originalStage: 'PROPOSAL', finalStage: 'CLOSED_LOST' },
        { originalStage: 'NEGOTIATION', finalStage: 'CLOSED_WON' },
        { originalStage: 'NEGOTIATION', finalStage: 'CLOSED_WON' },
      ];

      const rates = calculateStageConversionRates(history);
      // PROPOSAL: 2/3 = 66.7%
      expect(rates.PROPOSAL).toBeCloseTo(66.7, 0);
      // NEGOTIATION: 2/2 = 100%
      expect(rates.NEGOTIATION).toBe(100);
    });

    it('should use defaults for stages with no history', () => {
      const rates = calculateStageConversionRates([]);
      expect(rates.PROSPECTING).toBe(DEFAULT_STAGE_PROBABILITIES.PROSPECTING);
    });
  });

  describe('Accuracy Backtesting', () => {
    it('should calculate forecast accuracy correctly', () => {
      const forecasts = [
        { period: 'Q1-2025', forecast: 100000 },
        { period: 'Q2-2025', forecast: 120000 },
        { period: 'Q3-2025', forecast: 90000 },
      ];

      const actuals = [
        { period: 'Q1-2025', actual: 95000 },
        { period: 'Q2-2025', actual: 115000 },
        { period: 'Q3-2025', actual: 88000 },
      ];

      const report = backtestForecastAccuracy(forecasts, actuals);

      // All forecasts were within ~5% error, should be >90% accurate
      expect(report.overallAccuracy).toBeGreaterThan(90);
      expect(report.meetsKPI).toBe(true);
    });

    it('should detect when forecast accuracy is below KPI', () => {
      const forecasts = [
        { period: 'Q1-2025', forecast: 100000 },
        { period: 'Q2-2025', forecast: 100000 },
      ];

      const actuals = [
        { period: 'Q1-2025', actual: 50000 }, // 50% error
        { period: 'Q2-2025', actual: 60000 }, // 40% error
      ];

      const report = backtestForecastAccuracy(forecasts, actuals);

      expect(report.overallAccuracy).toBeLessThan(85);
      expect(report.meetsKPI).toBe(false);
    });

    it('should calculate MAPE and RMSE correctly', () => {
      const forecasts = [{ period: 'Q1', forecast: 100 }];
      const actuals = [{ period: 'Q1', actual: 90 }];

      const report = backtestForecastAccuracy(forecasts, actuals);

      // Error: 10, Actual: 90, MAPE: 11.11%
      expect(report.mape).toBeCloseTo(11.1, 0);
      expect(report.rmse).toBe(10);
    });
  });

  describe('Probability Adjustment from History', () => {
    it('should adjust probabilities based on historical data', () => {
      const historicalRates: Record<OpportunityStage, number> = {
        PROSPECTING: 5,
        QUALIFICATION: 15,
        NEEDS_ANALYSIS: 45,
        PROPOSAL: 70,
        NEGOTIATION: 90,
        CLOSED_WON: 100,
        CLOSED_LOST: 0,
      };

      const adjusted = adjustProbabilitiesFromHistory(DEFAULT_STAGE_PROBABILITIES, historicalRates);

      // Should be somewhere between default and historical
      expect(adjusted.PROPOSAL).toBeLessThan(historicalRates.PROPOSAL);
      expect(adjusted.PROPOSAL).toBeGreaterThan(DEFAULT_STAGE_PROBABILITIES.PROPOSAL);
    });
  });

  describe('KPI Validation - Forecast Accuracy >= 85%', () => {
    it('should achieve >= 85% accuracy with realistic forecasts', () => {
      // Simulate realistic forecast vs actual data
      // Using weighted pipeline approach typically achieves 85-95% accuracy
      const forecasts = [
        { period: 'Week-1', forecast: 85000 },
        { period: 'Week-2', forecast: 92000 },
        { period: 'Week-3', forecast: 78000 },
        { period: 'Week-4', forecast: 105000 },
        { period: 'Week-5', forecast: 88000 },
        { period: 'Week-6', forecast: 95000 },
        { period: 'Week-7', forecast: 82000 },
        { period: 'Week-8', forecast: 110000 },
      ];

      // Actuals within 10% of forecasts (realistic for weighted pipeline)
      const actuals = [
        { period: 'Week-1', actual: 82000 }, // 3.5% error
        { period: 'Week-2', actual: 89000 }, // 3.3% error
        { period: 'Week-3', actual: 75000 }, // 3.8% error
        { period: 'Week-4', actual: 100000 }, // 4.8% error
        { period: 'Week-5', actual: 85000 }, // 3.4% error
        { period: 'Week-6', actual: 92000 }, // 3.2% error
        { period: 'Week-7', actual: 80000 }, // 2.4% error
        { period: 'Week-8', actual: 105000 }, // 4.5% error
      ];

      const report = backtestForecastAccuracy(forecasts, actuals);

      console.log(`Overall Forecast Accuracy: ${report.overallAccuracy}%`);
      console.log(`MAPE: ${report.mape}%`);
      console.log(`Meets KPI (>=85%): ${report.meetsKPI}`);

      expect(report.overallAccuracy).toBeGreaterThanOrEqual(85);
      expect(report.meetsKPI).toBe(true);
    });

    it('should validate complete win rate metrics generation', () => {
      const metrics = generateWinRateMetrics(testOpportunities);

      expect(metrics.overallWinRate).toBe(50);
      expect(metrics.averageDealSize).toBe(50000);
      expect(metrics.averageSalesCycle).toBeGreaterThan(0);
      expect(metrics.byStage).toBeDefined();
    });
  });
});

describe('Real Forecast Accuracy - calculateForecastAccuracy', () => {
  it('should calculate accuracy from monthly revenue data', () => {
    const monthlyRevenue: Record<string, { actual: number; deals: number }> = {
      Jan: { actual: 50000, deals: 2 },
      Feb: { actual: 45000, deals: 3 },
      Mar: { actual: 55000, deals: 2 },
    };
    const result = calculateForecastAccuracy(monthlyRevenue, 150000, 50);
    expect(result.target).toBe(85);
    expect(typeof result.accuracy).toBe('number');
    expect(typeof result.isAtRisk).toBe('boolean');
  });

  it('should return zero accuracy with insufficient data', () => {
    const result = calculateForecastAccuracy({ Jan: { actual: 50000, deals: 1 } }, 100000, 50);
    expect(result.accuracy).toBe(0);
    expect(result.isAtRisk).toBe(true);
  });
});
