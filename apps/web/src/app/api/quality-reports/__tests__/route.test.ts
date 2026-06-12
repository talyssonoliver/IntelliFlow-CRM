/**
 * Tests for /api/quality-reports summary route
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
// route.ts imports from 'node:fs' — Vitest 4 treats bare 'fs' and 'node:fs'
// as separate module IDs; mirror the mock for the prefixed specifier.
vi.mock('node:fs', () => ({
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

describe('/api/quality-reports', () => {
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

  it('returns summary with all report types', async () => {
    const res = await GET(makeReq());
    const d = await res.json();
    expect(d.success).toBe(true);
    // Route now returns 6 reports (route.ts:875-883): lighthouse, coverage,
    // performance, tRPC benchmark, debt, sonarqube (tRPC benchmark was added
    // post-baseline).
    expect(d.data.reports).toHaveLength(6);
    expect(d.data.overallHealth).toBeDefined();
    expect(d.data.lastUpdated).toBeDefined();
  });

  it('returns placeholder reports when no data files exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeReq());
    const d = await res.json();
    const placeholders = d.data.reports.filter((r: any) => r.isPlaceholder);
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('returns detail for specific report by id', async () => {
    const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
    const d = await res.json();
    expect(d.success).toBe(true);
    expect(d.data.id).toBe('lighthouse');
  });

  it('returns 400 when detail requested without id', async () => {
    const res = await GET(makeReq({ action: 'detail' }));
    const d = await res.json();
    expect(d.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown report id', async () => {
    const res = await GET(makeReq({ action: 'detail', id: 'nonexistent' }));
    const d = await res.json();
    expect(d.success).toBe(false);
    expect(res.status).toBe(404);
  });

  it('returns 400 for unknown action', async () => {
    const res = await GET(makeReq({ action: 'badaction' }));
    const d = await res.json();
    expect(d.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('returns lighthouse report with real data when file exists', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('lighthouse-summary.json')
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generatedAt: '2026-01-01T00:00:00Z',
        source: 'ci',
        type: 'real',
        scores: { performance: 90, accessibility: 95, bestPractices: 85, seo: 92 },
      })
    );
    const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
    const d = await res.json();
    expect(d.data.score).toBeDefined();
    expect(d.data.isPlaceholder).toBeFalsy();
  });

  it('defaults an empty or invalid lighthouse source to "ci"', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('lighthouse-summary.json')
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generatedAt: '2026-01-01T00:00:00Z',
        // Empty string must NOT leak through — it would violate ReportSource.
        source: '',
        type: 'real',
        scores: { performance: 90, accessibility: 95, bestPractices: 85, seo: 92 },
      })
    );
    const res = await GET(makeReq({ action: 'detail', id: 'lighthouse' }));
    const d = await res.json();
    expect(d.data.source).toBe('ci');
  });

  it('returns coverage report with istanbul format data', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('coverage-summary.json')
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        total: {
          lines: { pct: 85 },
          branches: { pct: 75 },
          functions: { pct: 90 },
          statements: { pct: 88 },
        },
      })
    );
    const res = await GET(makeReq({ action: 'detail', id: 'coverage' }));
    const d = await res.json();
    expect(d.data.score).toBeDefined();
    expect(d.data.type).toBe('coverage');
  });

  it('returns performance report with benchmark data', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('performance-summary.json')
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        score: 85,
        passed: true,
        generatedAt: '2026-01-01T00:00:00Z',
        metrics: { jsonParse_p95: '0.5ms' },
      })
    );
    const res = await GET(makeReq({ action: 'detail', id: 'performance' }));
    const d = await res.json();
    expect(d.data.score).toBe(85);
    expect(d.data.status).toBe('passing');
  });

  it('returns debt report from code analysis', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('latest.json')
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        debt: {
          success: true,
          data: { healthScore: 70, total: 5 },
          summary: { healthScore: 70, total: 5, critical: 1, overdue: 0 },
        },
      })
    );
    const res = await GET(makeReq({ action: 'detail', id: 'debt' }));
    const d = await res.json();
    expect(d.data.id).toBe('debt');
    expect(d.data.score).toBe(70);
  });

  it('returns sonarqube report when server available', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => typeof p === 'string' && p.includes('latest.json')
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        sonarqube: {
          success: true,
          data: { available: true, bugs: 2, vulnerabilities: 1, qualityGate: { status: 'OK' } },
          summary: { gateStatus: 'OK', healthScore: 80, bugs: 2, vulnerabilities: 1, coverage: 85 },
        },
      })
    );
    const res = await GET(makeReq({ action: 'detail', id: 'sonarqube' }));
    const d = await res.json();
    expect(d.data.id).toBe('sonarqube');
    expect(d.data.status).toBe('passing');
  });

  it('overall health is warning when no data', async () => {
    const res = await GET(makeReq());
    const d = await res.json();
    expect(['warning', 'critical']).toContain(d.data.overallHealth);
  });

  it('handles readFileSync errors gracefully', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const res = await GET(makeReq());
    const d = await res.json();
    expect(d.success).toBe(true);
    // Route now returns 6 reports (route.ts:875-883): lighthouse, coverage,
    // performance, tRPC benchmark, debt, sonarqube (tRPC benchmark was added
    // post-baseline).
    expect(d.data.reports).toHaveLength(6);
  });
});
