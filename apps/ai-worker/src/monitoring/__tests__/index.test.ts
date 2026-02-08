import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to declare mock variables that vi.mock factories can reference
const mocks = vi.hoisted(() => ({
  getDriftMetrics: vi.fn().mockReturnValue('# drift\n'),
  getHallucinationMetrics: vi.fn().mockReturnValue('# hallucination\n'),
  getROIMetrics: vi.fn().mockReturnValue('# roi\n'),
  getLatencyMetrics: vi.fn().mockReturnValue('# latency\n'),
  driftDetector: { getStatus: vi.fn().mockReturnValue({ totalWindows: 10, highSeverityCount: 0, activeDriftMetrics: [] }) },
  hallucinationChecker: { getStats: vi.fn().mockReturnValue({ totalChecks: 100, hallucinationsDetected: 3, hallucinationRate: 0.03, byType: {}, byModel: {}, averageConfidence: 0.85, periodStart: new Date(), periodEnd: new Date(), kpiCompliant: true }) },
  roiTracker: { getStats: vi.fn().mockReturnValue({ totalCosts: 50, totalValue: 150, currentROI: 200, costsByModel: {}, valueByType: {} }) },
  latencyMonitor: { getStats: vi.fn().mockReturnValue({ totalMeasurements: 500, percentiles: { p50: 50, p75: 100, p90: 150, p95: 180, p99: 250, max: 500, min: 10, mean: 80, stdDev: 30 }, sloCompliance: { overallCompliant: true, p95Actual: 180, p95Target: 200 }, byModel: {}, byOperation: {} }) },
}));

vi.mock('../drift-detector', () => ({ DriftDetector: vi.fn(), driftDetector: mocks.driftDetector, defaultDriftConfig: {}, getDriftMetrics: mocks.getDriftMetrics }));
vi.mock('../hallucination-checker', () => ({ HallucinationChecker: vi.fn(), hallucinationChecker: mocks.hallucinationChecker, defaultHallucinationConfig: {}, getHallucinationMetrics: mocks.getHallucinationMetrics }));
vi.mock('../roi-tracker', () => ({ ROITracker: vi.fn(), roiTracker: mocks.roiTracker, defaultROIConfig: {}, getROIMetrics: mocks.getROIMetrics }));
vi.mock('../latency-monitor', () => ({ LatencyMonitor: vi.fn(), latencyMonitor: mocks.latencyMonitor, defaultLatencyConfig: {}, getLatencyMetrics: mocks.getLatencyMetrics, withLatencyTracking: vi.fn() }));
vi.mock('../chain-monitor', () => ({ ChainMonitor: vi.fn(), chainMonitor: {}, createChainMonitor: vi.fn(), withMonitoring: vi.fn(), sanitizeMetricLabel: vi.fn((s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64)) }));

import { getAllMetrics, getMonitoringStatus } from '../index';

describe('monitoring/index.ts', () => {
  beforeEach(() => {
    mocks.getDriftMetrics.mockReturnValue('# drift\n');
    mocks.getHallucinationMetrics.mockReturnValue('# hallucination\n');
    mocks.getROIMetrics.mockReturnValue('# roi\n');
    mocks.getLatencyMetrics.mockReturnValue('# latency\n');
    mocks.driftDetector.getStatus.mockReturnValue({ totalWindows: 10, highSeverityCount: 0, activeDriftMetrics: [] });
    mocks.hallucinationChecker.getStats.mockReturnValue({ totalChecks: 100, hallucinationsDetected: 3, hallucinationRate: 0.03, byType: {}, byModel: {}, averageConfidence: 0.85, periodStart: new Date(), periodEnd: new Date(), kpiCompliant: true });
    mocks.roiTracker.getStats.mockReturnValue({ totalCosts: 50, totalValue: 150, currentROI: 200, costsByModel: {}, valueByType: {} });
    mocks.latencyMonitor.getStats.mockReturnValue({ totalMeasurements: 500, percentiles: { p50: 50, p75: 100, p90: 150, p95: 180, p99: 250, max: 500, min: 10, mean: 80, stdDev: 30 }, sloCompliance: { overallCompliant: true, p95Actual: 180, p95Target: 200 }, byModel: {}, byOperation: {} });
  });

  describe('getAllMetrics', () => {
    it('aggregates all sub-module metrics', () => { const m = getAllMetrics(); expect(m).toContain('drift'); expect(m).toContain('hallucination'); expect(m).toContain('roi'); expect(m).toContain('latency'); });
    it('calls each getMetrics function', () => { getAllMetrics(); expect(mocks.getDriftMetrics).toHaveBeenCalled(); expect(mocks.getHallucinationMetrics).toHaveBeenCalled(); expect(mocks.getROIMetrics).toHaveBeenCalled(); expect(mocks.getLatencyMetrics).toHaveBeenCalled(); });
  });

  describe('getMonitoringStatus', () => {
    it('returns healthy when all pass', () => { const s = getMonitoringStatus(); expect(s.healthy).toBe(true); expect(s.issues).toHaveLength(0); });
    it('detects high-severity drift', () => { mocks.driftDetector.getStatus.mockReturnValue({ totalWindows: 10, highSeverityCount: 2, activeDriftMetrics: ['x'] }); const s = getMonitoringStatus(); expect(s.healthy).toBe(false); expect(s.issues.some(i => i.includes('drift'))).toBe(true); });
    it('detects hallucination rate exceeding target', () => { mocks.hallucinationChecker.getStats.mockReturnValue({ totalChecks: 100, hallucinationsDetected: 8, hallucinationRate: 0.08, byType: {}, byModel: {}, averageConfidence: 0.7, periodStart: new Date(), periodEnd: new Date(), kpiCompliant: false }); const s = getMonitoringStatus(); expect(s.healthy).toBe(false); expect(s.issues.some(i => i.includes('Hallucination'))).toBe(true); });
    it('detects negative ROI', () => { mocks.roiTracker.getStats.mockReturnValue({ totalCosts: 200, totalValue: 50, currentROI: -75, costsByModel: {}, valueByType: {} }); const s = getMonitoringStatus(); expect(s.healthy).toBe(false); expect(s.issues.some(i => i.includes('Negative ROI'))).toBe(true); });
    it('detects latency SLO violations', () => { mocks.latencyMonitor.getStats.mockReturnValue({ totalMeasurements: 500, percentiles: { p50: 100, p75: 200, p90: 300, p95: 350, p99: 500, max: 800, min: 20, mean: 150, stdDev: 80 }, sloCompliance: { overallCompliant: false, p95Actual: 350, p95Target: 200 }, byModel: {}, byOperation: {} }); const s = getMonitoringStatus(); expect(s.healthy).toBe(false); expect(s.issues.some(i => i.includes('Latency SLO'))).toBe(true); });
    it('reports multiple issues', () => { mocks.driftDetector.getStatus.mockReturnValue({ totalWindows: 10, highSeverityCount: 1, activeDriftMetrics: ['x'] }); mocks.hallucinationChecker.getStats.mockReturnValue({ totalChecks: 100, hallucinationsDetected: 10, hallucinationRate: 0.10, byType: {}, byModel: {}, averageConfidence: 0.5, periodStart: new Date(), periodEnd: new Date(), kpiCompliant: false }); mocks.roiTracker.getStats.mockReturnValue({ totalCosts: 100, totalValue: 10, currentROI: -90, costsByModel: {}, valueByType: {} }); mocks.latencyMonitor.getStats.mockReturnValue({ totalMeasurements: 100, percentiles: { p50: 200, p75: 300, p90: 400, p95: 500, p99: 600, max: 800, min: 50, mean: 250, stdDev: 100 }, sloCompliance: { overallCompliant: false, p95Actual: 500, p95Target: 200 }, byModel: {}, byOperation: {} }); const s = getMonitoringStatus(); expect(s.healthy).toBe(false); expect(s.issues.length).toBe(4); });
  });
});
