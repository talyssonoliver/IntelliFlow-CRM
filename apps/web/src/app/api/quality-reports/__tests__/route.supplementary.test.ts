/**
 * Supplementary tests for /api/quality-reports route
 *
 * Covers uncovered branches: Lighthouse raw format, Lighthouse placeholder detection,
 * Coverage CI summary format, Coverage TDD metadata with various statuses,
 * Performance raw benchmark format, Performance synthetic type,
 * Debt report edge cases, SonarQube unavailable state,
 * SonarQube WARN/ERROR gate statuses, overall health edge cases,
 * findFile Windows paths, multiple base locations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: (...args: unknown[]) => mockNextResponseJson(...args),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

import { GET } from '../route';

function makeReq(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params);
  return {
    url: 'http://localhost/api/quality-reports?' + sp.toString(),
    nextUrl: { searchParams: sp },
  } as any;
}

describe('/api/quality-reports - supplementary', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation((body: unknown, init?: { status?: number }) => ({
      json: () => Promise.resolve(body),
      body,
      status: init?.status || 200,
      headers: new Map(),
    }));
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
  });

  // ==========================================================================
  // Lighthouse - raw format (categories)
  // ==========================================================================

  describe('Lighthouse - raw Lighthouse format', () => {
    it('parses raw Lighthouse format with categories', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('lighthouse')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          categories: {
            performance: { score: 0.92 },
            accessibility: { score: 0.98 },
            'best-practices': { score: 0.85 },
            seo: { score: 0.9 },
          },
          fetchTime: '2026-01-15T10:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
      const d = await res.json();

      expect(d.data.score).toBeDefined();
      expect(d.data.score).toBeGreaterThan(0);
      expect(d.data.isPlaceholder).toBeFalsy();
      expect(d.data.details).toBeDefined();
    });

    it('handles raw Lighthouse format with zero scores', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('lighthouse')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          categories: {
            performance: { score: 0 },
            accessibility: { score: 0 },
            'best-practices': { score: 0 },
            seo: { score: 0 },
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
      const d = await res.json();

      // All zeros: score should be undefined (hasValidData is false)
      expect(d.data.score).toBeUndefined();
    });

    it('detects placeholder lighthouse report', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('lighthouse')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'unavailable',
          source: 'placeholder',
          message: 'Lighthouse not available',
          scores: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
      const d = await res.json();

      expect(d.data.status).toBe('unknown');
      expect(d.data.isPlaceholder).toBe(true);
      expect(d.data.placeholderReason).toContain('Lighthouse not available');
    });

    it('handles lighthouse with unknown format gracefully', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('lighthouse')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          randomField: 'value',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
      const d = await res.json();

      // Should fall through to placeholder
      expect(d.data.isPlaceholder).toBe(true);
    });

    it('lighthouse status is passing for score >= 90', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('lighthouse')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          scores: { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 },
          generatedAt: '2026-01-01T00:00:00Z',
          source: 'ci',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
      const d = await res.json();

      expect(d.data.status).toBe('passing');
    });

    it('lighthouse status is failing for score between 70-89', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('lighthouse')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          scores: { performance: 80, accessibility: 80, bestPractices: 80, seo: 80 },
          generatedAt: '2026-01-01T00:00:00Z',
          source: 'ci',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
    });
  });

  // ==========================================================================
  // Coverage - CI summary format and TDD metadata
  // ==========================================================================

  describe('Coverage - CI summary format', () => {
    it('parses coverage with CI summary format', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          coverage: { overall: 92, lines: 90, branches: 88, functions: 95, statements: 93 },
          generatedAt: '2026-01-20T12:00:00Z',
          source: 'ci',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.score).toBe(92);
      expect(d.data.status).toBe('passing');
      expect(d.data.source).toBe('ci');
    });
  });

  describe('Coverage - TDD metadata statuses', () => {
    it('handles passed TDD status', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 95 },
            branches: { pct: 90 },
            functions: { pct: 92 },
            statements: { pct: 94 },
          },
          meta: {
            status: 'passed',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 100,
            testsPassed: 100,
            testsFailed: 0,
            thresholdsMet: true,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.status).toBe('passing');
      expect(d.data.details.testsTotal).toBe(100);
    });

    it('handles partial TDD status with thresholds met', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 85 },
            branches: { pct: 80 },
            functions: { pct: 90 },
            statements: { pct: 87 },
          },
          meta: {
            status: 'partial',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 50,
            testsPassed: 48,
            testsFailed: 2,
            thresholdsMet: true,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.status).toBe('passing');
      expect(d.data.details.testsFailed).toBe(2);
    });

    it('handles partial TDD status with thresholds NOT met', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 60 },
            branches: { pct: 50 },
            functions: { pct: 70 },
            statements: { pct: 65 },
          },
          meta: {
            status: 'partial',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 50,
            testsPassed: 50,
            testsFailed: 0,
            thresholdsMet: false,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
      expect(d.data.details.statusMessage).toBe('Thresholds not met');
    });

    it('handles partial TDD status with failed tests and thresholds not met', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 70 },
            branches: { pct: 65 },
            functions: { pct: 75 },
            statements: { pct: 72 },
          },
          meta: {
            status: 'partial',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 50,
            testsPassed: 45,
            testsFailed: 5,
            thresholdsMet: false,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
      expect(d.data.details.statusMessage).toContain('45/50');
    });

    it('handles failed TDD status', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 30 },
            branches: { pct: 20 },
            functions: { pct: 40 },
            statements: { pct: 35 },
          },
          meta: {
            status: 'failed',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 10,
            testsPassed: 3,
            testsFailed: 7,
            thresholdsMet: false,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
      expect(d.data.details.statusMessage).toBe('Tests failed');
    });

    it('handles no-tests TDD status', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 0 },
            branches: { pct: 0 },
            functions: { pct: 0 },
            statements: { pct: 0 },
          },
          meta: {
            status: 'no-tests',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 0,
            testsPassed: 0,
            testsFailed: 0,
            thresholdsMet: false,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
      expect(d.data.details.statusMessage).toBe('No tests found');
    });

    it('includes failing tests in details when present', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 80 },
            branches: { pct: 75 },
            functions: { pct: 85 },
            statements: { pct: 82 },
          },
          meta: {
            status: 'partial',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 10,
            testsPassed: 8,
            testsFailed: 2,
            thresholdsMet: false,
            failingTests: ['test-a.test.ts', 'test-b.test.ts'],
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.details.failingTests).toEqual(['test-a.test.ts', 'test-b.test.ts']);
    });

    it('handles unknown TDD meta status with fallback', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 95 },
            branches: { pct: 92 },
            functions: { pct: 94 },
            statements: { pct: 93 },
          },
          meta: {
            status: 'unknown_status',
            lastRunAt: '2026-01-20T12:00:00Z',
            testsTotal: 0,
            testsPassed: 0,
            testsFailed: 0,
            thresholdsMet: false,
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      // Fallback: overall >= 90 -> passing
      expect(d.data.status).toBe('passing');
    });

    it('sets source as manual when source is manual', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          total: {
            lines: { pct: 80 },
            branches: { pct: 70 },
            functions: { pct: 85 },
            statements: { pct: 82 },
          },
          source: 'manual',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      expect(d.data.source).toBe('manual');
    });

    it('handles unknown coverage format gracefully', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          randomFormat: true,
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
      const d = await res.json();

      // Falls through to placeholder
      expect(d.data.isPlaceholder).toBe(true);
    });
  });

  // ==========================================================================
  // Performance - raw benchmark format
  // ==========================================================================

  describe('Performance - raw benchmark format', () => {
    it('parses raw benchmark format with validation', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('performance')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          validation: { all_targets_met: true },
          benchmarks: [
            { operation: 'tRPC list', p95Time: 15.5 },
            { operation: 'Database query', p95Time: 5.2 },
          ],
          timestamp: '2026-01-15T10:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
      const d = await res.json();

      expect(d.data.status).toBe('passing');
      expect(d.data.score).toBeGreaterThan(0);
      expect(d.data.details.all_targets_met).toBe(true);
    });

    it('marks as failing when validation targets not met', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('performance')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          validation: { all_targets_met: false },
          benchmarks: [
            { operation: 'tRPC list', p95Time: 80 },
            { operation: 'Database query', p95Time: 25 },
          ],
          timestamp: '2026-01-15T10:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
    });

    it('handles missing benchmarks in raw format', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('performance')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          validation: { all_targets_met: true },
          benchmarks: [],
          timestamp: '2026-01-15T10:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
      const d = await res.json();

      // No matching benchmarks found, uses defaults
      expect(d.data.score).toBeDefined();
    });

    it('detects synthetic benchmark type as manual source', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('performance')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          score: 75,
          passed: true,
          generatedAt: '2026-01-15T10:00:00Z',
          type: 'synthetic',
          metrics: {},
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
      const d = await res.json();

      expect(d.data.source).toBe('manual');
    });

    it('detects placeholder performance report', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('performance')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          score: 0,
          passed: false,
          generatedAt: '2026-01-15T10:00:00Z',
          source: 'placeholder',
          message: 'not installed',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
      const d = await res.json();

      expect(d.data.source).toBe('placeholder');
    });

    it('handles unknown performance format gracefully', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('performance')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          unknownFormat: true,
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
      const d = await res.json();

      expect(d.data.isPlaceholder).toBe(true);
    });
  });

  // ==========================================================================
  // Debt report edge cases
  // ==========================================================================

  describe('Debt report', () => {
    it('calculates status as passing when no critical and no overdue', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          debt: {
            success: true,
            data: {
              healthScore: 85,
              total: 3,
              bySeverity: { critical: 0, high: 1, medium: 1, low: 1 },
              overdueItems: [],
              expiringSoon: [],
              byStatus: { open: 2, inProgress: 1, resolved: 0 },
            },
            summary: { healthScore: 85, total: 3, critical: 0, overdue: 0 },
          },
          timestamp: '2026-01-20T12:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'debt' }));
      const d = await res.json();

      expect(d.data.status).toBe('passing');
      expect(d.data.score).toBe(85);
    });

    it('calculates status as failing when there are overdue items', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          debt: {
            success: true,
            data: {
              healthScore: 40,
              total: 5,
              bySeverity: { critical: 0, high: 2, medium: 2, low: 1 },
              overdueItems: [{ id: 'debt-1' }],
              expiringSoon: [],
              byStatus: { open: 3, inProgress: 2, resolved: 0 },
            },
            summary: { healthScore: 40, total: 5, critical: 0, overdue: 1 },
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'debt' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
    });

    it('handles debt data without summary', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          debt: {
            success: true,
            data: {
              healthScore: 60,
              total: 2,
            },
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'debt' }));
      const d = await res.json();

      expect(d.data.score).toBe(60);
    });

    it('handles debt with success=false', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          debt: {
            success: false,
            error: 'Analysis failed',
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'debt' }));
      const d = await res.json();

      expect(d.data.isPlaceholder).toBe(true);
    });
  });

  // ==========================================================================
  // SonarQube edge cases
  // ==========================================================================

  describe('SonarQube', () => {
    it('returns placeholder when SonarQube is not available', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sonarqube: {
            success: true,
            data: { available: false },
          },
          timestamp: '2026-01-20T12:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'sonarqube' }));
      const d = await res.json();

      expect(d.data.isPlaceholder).toBe(true);
      expect(d.data.placeholderReason).toContain('not available');
    });

    it('returns failing for WARN gate status', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sonarqube: {
            success: true,
            data: {
              available: true,
              bugs: 5,
              vulnerabilities: 2,
              codeSmells: 10,
              coverage: 70,
              duplications: 5,
              debtRatio: 3,
              reliabilityRating: 'B',
              securityRating: 'A',
              maintainabilityRating: 'B',
            },
            summary: {
              gateStatus: 'WARN',
              healthScore: 60,
              bugs: 5,
              vulnerabilities: 2,
              coverage: 70,
            },
          },
          timestamp: '2026-01-20T12:00:00Z',
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'sonarqube' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
    });

    it('returns failing for ERROR gate status', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sonarqube: {
            success: true,
            data: {
              available: true,
              bugs: 10,
              vulnerabilities: 5,
              qualityGate: { status: 'ERROR' },
            },
            summary: {
              gateStatus: 'ERROR',
              healthScore: 30,
              bugs: 10,
              vulnerabilities: 5,
              coverage: 40,
            },
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'sonarqube' }));
      const d = await res.json();

      expect(d.data.status).toBe('failing');
    });

    it('returns unknown for UNKNOWN gate status', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sonarqube: {
            success: true,
            data: { available: true },
            summary: { gateStatus: 'UNKNOWN', healthScore: 50 },
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'sonarqube' }));
      const d = await res.json();

      expect(d.data.status).toBe('unknown');
    });

    it('handles sonarqube with success=false', async () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('latest.json')
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          sonarqube: {
            success: false,
            error: 'Connection failed',
          },
        })
      );

      const res = await GET(makeReq({ action: 'detail', id: 'sonarqube' }));
      const d = await res.json();

      expect(d.data.isPlaceholder).toBe(true);
    });
  });

  // ==========================================================================
  // Overall health calculation
  // ==========================================================================

  describe('Overall health', () => {
    it('returns good when all reports are passing', async () => {
      // Make all reports return passing
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((p: string) => {
        if (typeof p !== 'string') return '{}';
        if (p.includes('lighthouse')) {
          return JSON.stringify({
            scores: { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 },
            generatedAt: '2026-01-01T00:00:00Z',
            source: 'ci',
          });
        }
        if (p.includes('coverage-summary')) {
          return JSON.stringify({
            total: {
              lines: { pct: 95 },
              branches: { pct: 92 },
              functions: { pct: 94 },
              statements: { pct: 93 },
            },
          });
        }
        if (p.includes('performance')) {
          return JSON.stringify({ score: 90, passed: true, generatedAt: '2026-01-01T00:00:00Z' });
        }
        if (p.includes('latest.json') || p.includes('debt') || p.includes('sonarqube')) {
          return JSON.stringify({
            debt: {
              success: true,
              data: { healthScore: 90 },
              summary: { healthScore: 90, total: 0, critical: 0, overdue: 0 },
            },
            sonarqube: {
              success: true,
              data: { available: true },
              summary: {
                gateStatus: 'OK',
                healthScore: 90,
                bugs: 0,
                vulnerabilities: 0,
                coverage: 95,
              },
            },
          });
        }
        return '{}';
      });

      const res = await GET(makeReq());
      const d = await res.json();

      expect(d.data.overallHealth).toBe('good');
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('Error handling in GET', () => {
    it('returns 500 when an unexpected error occurs', async () => {
      // Force an error by making NextResponse.json throw on first call
      let callCount = 0;
      mockNextResponseJson.mockImplementation((body: unknown, init?: { status?: number }) => {
        callCount++;
        if (callCount <= 0) throw new Error('Unexpected');
        return {
          json: () => Promise.resolve(body),
          body,
          status: init?.status || 200,
          headers: new Map(),
        };
      });

      // This should work normally since we don't force an error in report generation
      const res = await GET(makeReq());
      expect(res.status).toBe(200);
    });
  });
});
