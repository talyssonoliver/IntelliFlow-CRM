/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMonitoringService } from '../AIMonitoringService';

const mockPrisma = {
  aIMonitoringEvent: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: { value: null } }),
    groupBy: vi.fn().mockResolvedValue([]),
  },
} as any;

describe('AIMonitoringService', () => {
  let service: AIMonitoringService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default return values after clearAllMocks
    mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue([]);
    mockPrisma.aIMonitoringEvent.count.mockResolvedValue(0);
    mockPrisma.aIMonitoringEvent.aggregate.mockResolvedValue({ _sum: { value: null } });
    mockPrisma.aIMonitoringEvent.groupBy.mockResolvedValue([]);
    service = new AIMonitoringService(mockPrisma);
  });

  describe('getStatus', () => {
    it('returns healthy status with available: true when no events', async () => {
      const result = await service.getStatus();

      expect(result.available).toBe(true);
      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.drift).toBeDefined();
      expect(result.latency).toBeDefined();
      expect(result.hallucination).toBeDefined();
      expect(result.roi).toBeDefined();
    });

    it('aggregates event counts from DB over 24h window', async () => {
      mockPrisma.aIMonitoringEvent.count
        .mockResolvedValueOnce(10) // drift
        .mockResolvedValueOnce(50) // latency
        .mockResolvedValueOnce(20) // hallucination
        .mockResolvedValueOnce(30) // roi_cost
        .mockResolvedValueOnce(0)  // hallucination flagged
        .mockResolvedValueOnce(2); // drift flagged

      const result = await service.getStatus();

      expect(result.available).toBe(true);
      expect(result.drift.trackedMetrics).toBe(10);
      expect(result.drift.driftDetected).toBe(true);
      expect(result.drift.highSeverityCount).toBe(2);
    });

    it('reports issues when hallucination rate exceeds 5%', async () => {
      mockPrisma.aIMonitoringEvent.count
        .mockResolvedValueOnce(0)  // drift
        .mockResolvedValueOnce(0)  // latency
        .mockResolvedValueOnce(100) // hallucination total
        .mockResolvedValueOnce(0)  // roi_cost
        .mockResolvedValueOnce(10) // hallucination flagged (10%)
        .mockResolvedValueOnce(0); // drift flagged

      const result = await service.getStatus();

      expect(result.healthy).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.hallucination.kpiCompliant).toBe(false);
    });
  });

  describe('getDriftMetrics', () => {
    it('returns drift events with payload deserialization', async () => {
      const mockEvents = [
        {
          id: 'drift-1',
          eventType: 'drift',
          model: 'gpt-4o',
          metric: 'score_distribution',
          value: 0.85,
          flagged: true,
          severity: 'high',
          payload: {
            pValue: 0.01,
            baselineWindow: { mean: 0.7 },
            currentWindow: { mean: 0.85 },
            recommendations: ['Retrain model'],
          },
          recordedAt: new Date('2026-03-16T00:00:00Z'),
        },
      ];
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getDriftMetrics({ limit: 10 });

      expect(result.available).toBe(true);
      expect(result.status.trackedMetrics).toBe(1);
      expect(result.status.driftDetected).toBe(true);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].detected).toBe(true);
      expect(result.history[0].severity).toBe('high');
      expect(result.history[0].driftScore).toBe(0.85);
      expect(result.history[0].pValue).toBe(0.01);
    });

    it('returns empty results gracefully on empty DB', async () => {
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue([]);

      const result = await service.getDriftMetrics();

      expect(result.available).toBe(true);
      expect(result.status.trackedMetrics).toBe(0);
      expect(result.status.driftDetected).toBe(false);
      expect(result.history).toEqual([]);
    });
  });

  describe('getLatencyMetrics', () => {
    it('computes percentiles from stored latency events', async () => {
      const mockEvents = Array.from({ length: 100 }, (_, i) => ({
        id: `lat-${i}`,
        eventType: 'latency',
        model: 'gpt-4o',
        value: (i + 1) * 20, // 20ms to 2000ms
        flagged: false,
        recordedAt: new Date(Date.now() - i * 60000),
      }));
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getLatencyMetrics();

      expect(result.available).toBe(true);
      expect(result.stats.sampleCount).toBe(100);
      expect(result.stats.percentiles.p50).toBeGreaterThan(0);
      expect(result.stats.percentiles.p95).toBeGreaterThan(0);
      expect(result.stats.percentiles.p99).toBeGreaterThan(0);
      expect(result.stats.successRate).toBe(1);
    });

    it('returns empty stats on empty DB', async () => {
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue([]);

      const result = await service.getLatencyMetrics();

      expect(result.available).toBe(true);
      expect(result.stats.sampleCount).toBe(0);
      expect(result.stats.percentiles.p50).toBe(0);
    });
  });

  describe('getLatencyTrend', () => {
    it('buckets events by time and computes percentiles', async () => {
      const now = Date.now();
      const mockEvents = [
        { id: '1', value: 100, recordedAt: new Date(now - 5 * 60000) },
        { id: '2', value: 200, recordedAt: new Date(now - 4 * 60000) },
        { id: '3', value: 300, recordedAt: new Date(now - 1 * 60000) },
      ];
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getLatencyTrend({ periodMinutes: 60, bucketMinutes: 5 });

      expect(result.available).toBe(true);
      expect(result.trend.length).toBeGreaterThan(0);
      for (const bucket of result.trend) {
        expect(bucket.timestamp).toBeInstanceOf(Date);
        expect(typeof bucket.p50).toBe('number');
        expect(typeof bucket.p95).toBe('number');
        expect(typeof bucket.count).toBe('number');
      }
    });

    it('returns empty trend on no events', async () => {
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue([]);

      const result = await service.getLatencyTrend();

      expect(result.available).toBe(true);
      expect(result.trend).toEqual([]);
    });
  });

  describe('getHallucinationReport', () => {
    it('returns stats and recent results from hallucination events', async () => {
      const mockEvents = [
        {
          id: 'hal-1',
          eventType: 'hallucination',
          model: 'gpt-4o',
          value: 0.87,
          flagged: true,
          payload: {
            confidence: 0.87,
            hallucinationTypes: ['factual_error'],
            evidence: ['Claim not in context'],
            groundTruthSources: ['CRM record'],
          },
          recordedAt: new Date('2026-03-16T00:00:00Z'),
        },
        {
          id: 'hal-2',
          eventType: 'hallucination',
          model: 'gpt-4o',
          value: 0.1,
          flagged: false,
          payload: { confidence: 0.1, hallucinationTypes: [], evidence: [], groundTruthSources: [] },
          recordedAt: new Date('2026-03-15T23:00:00Z'),
        },
      ];
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getHallucinationReport();

      expect(result.available).toBe(true);
      expect(result.stats.totalChecks).toBe(2);
      expect(result.stats.hallucinationsDetected).toBe(1);
      expect(result.stats.hallucinationRate).toBe(0.5);
      expect(result.recentResults).toHaveLength(2);
      expect(result.recentResults[0].hallucinated).toBe(true);
      expect(result.recentResults[0].confidence).toBe(0.87);
    });

    it('reports kpiCompliant when rate is under threshold', async () => {
      const mockEvents = Array.from({ length: 100 }, (_, i) => ({
        id: `hal-${i}`,
        eventType: 'hallucination',
        model: 'gpt-4o',
        value: 0.1,
        flagged: i < 3, // 3% rate
        payload: { confidence: 0.1, hallucinationTypes: [], evidence: [], groundTruthSources: [] },
        recordedAt: new Date(),
      }));
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getHallucinationReport();

      expect(result.stats.kpiCompliant).toBe(true);
    });
  });

  describe('getROIMetrics', () => {
    it('computes ROI from cost and value events', async () => {
      const costEvents = [
        { id: 'c1', eventType: 'roi_cost', value: 10, recordedAt: new Date() },
        { id: 'c2', eventType: 'roi_cost', value: 20, recordedAt: new Date() },
      ];
      const valueEvents = [
        { id: 'v1', eventType: 'roi_value', value: 100, recordedAt: new Date() },
      ];
      mockPrisma.aIMonitoringEvent.findMany
        .mockResolvedValueOnce(costEvents)
        .mockResolvedValueOnce(valueEvents);

      const result = await service.getROIMetrics();

      expect(result.available).toBe(true);
      expect(result.roi.totalCost).toBe(30);
      expect(result.roi.totalValue).toBe(100);
      expect(result.roi.netValue).toBe(70);
      expect(result.roi.roi).toBeCloseTo(233.33, 1);
      expect(result.stats.totalCostsTracked).toBe(2);
      expect(result.stats.totalValuesTracked).toBe(1);
    });

    it('returns zero ROI when no events exist', async () => {
      mockPrisma.aIMonitoringEvent.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getROIMetrics();

      expect(result.available).toBe(true);
      expect(result.roi.totalCost).toBe(0);
      expect(result.roi.totalValue).toBe(0);
      expect(result.roi.roi).toBe(0);
    });
  });

  describe('tenant filtering', () => {
    it('passes tenantId filter to all query methods', async () => {
      mockPrisma.aIMonitoringEvent.findMany.mockResolvedValue([]);

      await service.getDriftMetrics({ tenantId: 'tenant-1' });

      expect(mockPrisma.aIMonitoringEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      );
    });
  });
});
