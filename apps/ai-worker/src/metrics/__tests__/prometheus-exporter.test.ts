/**
 * Prometheus Exporter Tests (IFC-117)
 *
 * Tests for the /metrics endpoint handler:
 * - Authentication (Bearer token)
 * - Prometheus text format response
 * - Status endpoint (health check)
 * - Unauthorized access rejection
 *
 * @module prometheus-exporter-tests
 * @implements IFC-117
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authenticateMetricsRequest,
  buildMetricsResponse,
  buildStatusResponse,
  getMetricsHandler,
  getStatusHandler,
} from '../prometheus-exporter';

// Mock monitoring module
vi.mock('../../monitoring', () => ({
  getAllMetrics: vi.fn(() =>
    [
      '# HELP ai_drift_score Current drift detection score',
      '# TYPE ai_drift_score gauge',
      'ai_drift_score{model="gpt-4o",metric="score_distribution"} 0.12',
      '',
      '# HELP ai_hallucination_rate Hallucination detection rate',
      '# TYPE ai_hallucination_rate gauge',
      'ai_hallucination_rate{model="gpt-4o"} 0.02',
      '',
      '# HELP ai_latency_p95_ms P95 latency in milliseconds',
      '# TYPE ai_latency_p95_ms gauge',
      'ai_latency_p95_ms{operation="chain_execution"} 450',
      '',
      '# HELP ai_roi_percent Current ROI percentage',
      '# TYPE ai_roi_percent gauge',
      'ai_roi_percent 250.5',
    ].join('\n')
  ),
  getMonitoringStatus: vi.fn(() => ({
    drift: { highSeverityCount: 0, totalSamples: 100 },
    hallucination: { hallucinationRate: 0.02, kpiCompliant: true },
    roi: { currentROI: 250.5 },
    latency: {
      sloCompliance: {
        overallCompliant: true,
        p95Actual: 450,
        p95Target: 2000,
      },
    },
    healthy: true,
    issues: [],
  })),
}));

// Mock pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Prometheus Exporter (IFC-117)', () => {
  const originalEnv = process.env.METRICS_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.METRICS_TOKEN = 'test-metrics-token';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.METRICS_TOKEN = originalEnv;
    } else {
      delete process.env.METRICS_TOKEN;
    }
  });

  // ======================================================================
  // Authentication
  // ======================================================================
  describe('authenticateMetricsRequest', () => {
    it('should reject when no auth header provided', () => {
      expect(authenticateMetricsRequest(undefined)).toBe(false);
    });

    it('should reject when token does not match', () => {
      expect(authenticateMetricsRequest('Bearer wrong-token')).toBe(false);
    });

    it('should accept when token matches', () => {
      expect(authenticateMetricsRequest('Bearer test-metrics-token')).toBe(true);
    });

    it('should use default token when env var not set', () => {
      delete process.env.METRICS_TOKEN;
      expect(authenticateMetricsRequest('Bearer default-dev-token')).toBe(true);
      expect(authenticateMetricsRequest('Bearer wrong-token')).toBe(false);
    });
  });

  // ======================================================================
  // Metrics Response
  // ======================================================================
  describe('buildMetricsResponse', () => {
    it('should return Prometheus text format', () => {
      const response = buildMetricsResponse();

      expect(response.contentType).toBe('text/plain; charset=utf-8');
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('ai_drift_score');
      expect(response.body).toContain('ai_hallucination_rate');
      expect(response.body).toContain('ai_latency_p95_ms');
      expect(response.body).toContain('ai_roi_percent');
    });

    it('should include HELP and TYPE annotations', () => {
      const response = buildMetricsResponse();

      expect(response.body).toContain('# HELP');
      expect(response.body).toContain('# TYPE');
    });
  });

  // ======================================================================
  // Status Response
  // ======================================================================
  describe('buildStatusResponse', () => {
    it('should return healthy status with 200', () => {
      const response = buildStatusResponse();

      expect(response.statusCode).toBe(200);
      expect(response.contentType).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body.healthy).toBe(true);
      expect(body.issues).toEqual([]);
    });

    it('should return unhealthy status with 503', async () => {
      const { getMonitoringStatus } = await import('../../monitoring');
      (getMonitoringStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        drift: { highSeverityCount: 3 },
        hallucination: { hallucinationRate: 0.08, kpiCompliant: false },
        roi: { currentROI: -10 },
        latency: {
          sloCompliance: {
            overallCompliant: false,
            p95Actual: 3500,
            p95Target: 2000,
          },
        },
        healthy: false,
        issues: ['High drift', 'SLO violation'],
      });

      const response = buildStatusResponse();

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.healthy).toBe(false);
      expect(body.issues.length).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // Express Handler - /metrics
  // ======================================================================
  describe('getMetricsHandler', () => {
    function createMockRes() {
      return {
        statusCode: 200,
        setHeader: vi.fn(),
        end: vi.fn(),
      };
    }

    it('should return 401 without auth token', () => {
      const handler = getMetricsHandler();
      const req = { headers: {} } as any;
      const res = createMockRes();

      handler(req, res as any);

      expect(res.statusCode).toBe(401);
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Unauthorized' }));
    });

    it('should return 401 with wrong token', () => {
      const handler = getMetricsHandler();
      const req = { headers: { authorization: 'Bearer wrong' } } as any;
      const res = createMockRes();

      handler(req, res as any);

      expect(res.statusCode).toBe(401);
    });

    it('should return 200 with Prometheus metrics on valid token', () => {
      const handler = getMetricsHandler();
      const req = {
        headers: { authorization: 'Bearer test-metrics-token' },
      } as any;
      const res = createMockRes();

      handler(req, res as any);

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('ai_drift_score'));
    });
  });

  // ======================================================================
  // Express Handler - /metrics/status
  // ======================================================================
  describe('getStatusHandler', () => {
    it('should return monitoring status as JSON', () => {
      const handler = getStatusHandler();
      const req = {} as any;
      const res = {
        statusCode: 200,
        setHeader: vi.fn(),
        end: vi.fn(),
      };

      handler(req, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      const body = JSON.parse(res.end.mock.calls[0][0]);
      expect(body.healthy).toBe(true);
    });
  });
});
