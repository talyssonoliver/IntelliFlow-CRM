/**
 * Tests for /api/quality-reports/test-run route
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStartTestRun = vi.hoisted(() => vi.fn());
const mockGetActiveRuns = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: (...args: unknown[]) => mockNextResponseJson(...args),
  },
}));

vi.mock('@/lib/test-runner', () => ({
  startTestRun: (...a: unknown[]) => mockStartTestRun(...a),
  getActiveRuns: (...a: unknown[]) => mockGetActiveRuns(...a),
}));

import { GET, POST } from '../route';

function makeReq(body: Record<string, unknown> = {}) {
  return { json: vi.fn().mockResolvedValue(body) } as any;
}

describe('/api/quality-reports/test-run', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation(
      (body: unknown, init?: { status?: number }) => ({
        json: () => Promise.resolve(body),
        body,
        status: init?.status || 200,
        headers: new Map(),
      }),
    );
    mockStartTestRun.mockResolvedValue({
      runId: 'test-123',
      status: 'running',
      startedAt: new Date().toISOString(),
      config: { scope: 'standard', coverage: true },
      progress: { testsRun: 0, testsPassed: 0, testsFailed: 0, testsSkipped: 0, testsTotal: 0 },
      results: [],
      stdout: '',
      stderr: '',
    });
    mockGetActiveRuns.mockReturnValue(new Map());
  });

  describe('POST', () => {
    it('starts a new test run with defaults', async () => {
      const res = await POST(makeReq({}));
      const d = await res.json();
      expect(d.success).toBe(true);
      expect(d.runId).toBeDefined();
      expect(d.statusUrl).toBeDefined();
      expect(d.eventsUrl).toBeDefined();
      expect(mockStartTestRun).toHaveBeenCalled();
    });

    it('validates scope parameter', async () => {
      const res = await POST(makeReq({ scope: 'invalid' }));
      const d = await res.json();
      expect(d.success).toBe(false);
      expect(res.status).toBe(400);
    });

    it('accepts valid scopes', async () => {
      for (const scope of ['quick', 'standard', 'comprehensive']) {
        const res = await POST(makeReq({ scope }));
        const d = await res.json();
        expect(d.success).toBe(true);
      }
    });

    it('passes config to startTestRun', async () => {
      await POST(makeReq({ scope: 'quick', coverage: false, timeout: 60000 }));
      expect(mockStartTestRun).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'quick',
          coverage: false,
          timeout: 60000,
        }),
      );
    });

    it('handles startTestRun failure', async () => {
      mockStartTestRun.mockRejectedValueOnce(new Error('spawn failed'));
      const res = await POST(makeReq({}));
      const d = await res.json();
      expect(d.success).toBe(false);
      expect(res.status).toBe(500);
    });
  });

  describe('GET', () => {
    it('returns empty list when no active runs', async () => {
      mockGetActiveRuns.mockReturnValue(new Map());
      const res = await GET();
      const d = await res.json();
      expect(d.success).toBe(true);
      expect(d.count).toBe(0);
      expect(d.runs).toEqual([]);
    });

    it('returns active runs', async () => {
      const runs = new Map();
      runs.set('run-1', {
        runId: 'run-1',
        status: 'running',
        startedAt: '2026-01-01T00:00:00Z',
        progress: { testsRun: 5, testsPassed: 4, testsFailed: 1, testsSkipped: 0, testsTotal: 10 },
        config: { scope: 'standard', coverage: true },
      });
      mockGetActiveRuns.mockReturnValue(runs);
      const res = await GET();
      const d = await res.json();
      expect(d.success).toBe(true);
      expect(d.count).toBe(1);
      expect(d.runs[0].runId).toBe('run-1');
    });

    it('handles getActiveRuns failure', async () => {
      mockGetActiveRuns.mockImplementation(() => { throw new Error('err'); });
      const res = await GET();
      const d = await res.json();
      expect(d.success).toBe(false);
      expect(res.status).toBe(500);
    });
  });
});
