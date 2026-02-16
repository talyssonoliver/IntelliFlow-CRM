/**
 * Test Run [runId] Route - B11 coverage tests
 *
 * Targets ~17 uncovered lines (0% coverage).
 * Tests GET and DELETE handlers for specific test run status/cancellation.
 *
 * GET: returns run state or 404/500
 * DELETE: cancels run or 404/500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetRunState = vi.hoisted(() => vi.fn());
const mockCancelTestRun = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: (...args: unknown[]) => mockNextResponseJson(...args),
  },
}));

vi.mock('@/lib/test-runner', () => ({
  getRunState: (...a: unknown[]) => mockGetRunState(...a),
  cancelTestRun: (...a: unknown[]) => mockCancelTestRun(...a),
}));

import { GET, DELETE } from '../route';

function makeRequest() {
  return {} as any;
}

function makeParams(runId: string) {
  return { params: Promise.resolve({ runId }) } as any;
}

describe('/api/quality-reports/test-run/[runId]', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation((body: unknown, init?: { status?: number }) => ({
      json: () => Promise.resolve(body),
      body,
      status: init?.status || 200,
      headers: new Map(),
    }));
    mockGetRunState.mockReset();
    mockCancelTestRun.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('GET', () => {
    it('returns run state when found', async () => {
      const mockState = {
        runId: 'run-123',
        status: 'running',
        startedAt: '2026-01-15T12:00:00Z',
        completedAt: null,
        progress: { testsRun: 5, testsPassed: 4, testsFailed: 1, testsSkipped: 0, testsTotal: 10 },
        coverage: null,
        error: null,
        config: { scope: 'standard', coverage: true },
      };

      mockGetRunState.mockReturnValue(mockState);

      const res = await GET(makeRequest(), makeParams('run-123'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.runId).toBe('run-123');
      expect(data.data.status).toBe('running');
      expect(data.data.startedAt).toBe('2026-01-15T12:00:00Z');
      expect(data.data.completedAt).toBeNull();
      expect(data.data.progress).toEqual(mockState.progress);
      expect(data.data.coverage).toBeNull();
      expect(data.data.error).toBeNull();
      expect(data.data.config.scope).toBe('standard');
      expect(data.data.config.coverage).toBe(true);
      expect(mockGetRunState).toHaveBeenCalledWith('run-123');
    });

    it('returns completed run state with coverage', async () => {
      const mockState = {
        runId: 'run-456',
        status: 'completed',
        startedAt: '2026-01-15T12:00:00Z',
        completedAt: '2026-01-15T12:05:00Z',
        progress: {
          testsRun: 100,
          testsPassed: 95,
          testsFailed: 5,
          testsSkipped: 0,
          testsTotal: 100,
        },
        coverage: { lines: 85, branches: 78, functions: 90, statements: 84 },
        error: null,
        config: { scope: 'comprehensive', coverage: true },
      };

      mockGetRunState.mockReturnValue(mockState);

      const res = await GET(makeRequest(), makeParams('run-456'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.status).toBe('completed');
      expect(data.data.completedAt).toBe('2026-01-15T12:05:00Z');
      expect(data.data.coverage).toEqual(mockState.coverage);
    });

    it('returns failed run state with error', async () => {
      const mockState = {
        runId: 'run-789',
        status: 'failed',
        startedAt: '2026-01-15T12:00:00Z',
        completedAt: '2026-01-15T12:01:00Z',
        progress: { testsRun: 10, testsPassed: 8, testsFailed: 2, testsSkipped: 0, testsTotal: 50 },
        coverage: null,
        error: 'Process exited with code 1',
        config: { scope: 'quick', coverage: false },
      };

      mockGetRunState.mockReturnValue(mockState);

      const res = await GET(makeRequest(), makeParams('run-789'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.error).toBe('Process exited with code 1');
      expect(data.data.config.coverage).toBe(false);
    });

    it('returns 404 when run is not found', async () => {
      mockGetRunState.mockReturnValue(undefined);

      const res = await GET(makeRequest(), makeParams('nonexistent'));
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Test run not found');
      expect(res.status).toBe(404);
    });

    it('returns 404 when getRunState returns null', async () => {
      mockGetRunState.mockReturnValue(null);

      const res = await GET(makeRequest(), makeParams('null-run'));
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Test run not found');
      expect(res.status).toBe(404);
    });

    it('returns 500 when getRunState throws', async () => {
      mockGetRunState.mockImplementation(() => {
        throw new Error('Internal error');
      });

      const res = await GET(makeRequest(), makeParams('error-run'));
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to get test run status');
      expect(res.status).toBe(500);
    });

    it('logs error to console when exception occurs', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Unexpected error');
      mockGetRunState.mockImplementation(() => {
        throw error;
      });

      await GET(makeRequest(), makeParams('err-run'));

      expect(consoleSpy).toHaveBeenCalledWith('Failed to get test run status:', error);
    });
  });

  describe('DELETE', () => {
    it('cancels a running test successfully', async () => {
      mockCancelTestRun.mockReturnValue(true);

      const res = await DELETE(makeRequest(), makeParams('run-cancel'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.message).toBe('Test run cancelled');
      expect(data.runId).toBe('run-cancel');
      expect(mockCancelTestRun).toHaveBeenCalledWith('run-cancel');
    });

    it('returns 404 when run is not found or already completed', async () => {
      mockCancelTestRun.mockReturnValue(false);

      const res = await DELETE(makeRequest(), makeParams('already-done'));
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Test run not found or already completed');
      expect(res.status).toBe(404);
    });

    it('returns 500 when cancelTestRun throws', async () => {
      mockCancelTestRun.mockImplementation(() => {
        throw new Error('Cancel failed');
      });

      const res = await DELETE(makeRequest(), makeParams('err-cancel'));
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to cancel test run');
      expect(res.status).toBe(500);
    });

    it('logs error to console when exception occurs on cancel', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Cancel crash');
      mockCancelTestRun.mockImplementation(() => {
        throw error;
      });

      await DELETE(makeRequest(), makeParams('crash-cancel'));

      expect(consoleSpy).toHaveBeenCalledWith('Failed to cancel test run:', error);
    });

    it('passes correct runId from params', async () => {
      mockCancelTestRun.mockReturnValue(true);

      await DELETE(makeRequest(), makeParams('specific-id-123'));

      expect(mockCancelTestRun).toHaveBeenCalledWith('specific-id-123');
    });
  });

  describe('dynamic export', () => {
    it('exports dynamic as force-dynamic', async () => {
      const mod = await import('../route.js');
      expect(mod.dynamic).toBe('force-dynamic');
    });
  });
});
