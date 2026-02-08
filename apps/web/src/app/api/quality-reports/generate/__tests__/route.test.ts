import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecAsync = vi.hoisted(() => vi.fn());
const mockSetJob = vi.hoisted(() => vi.fn());
const mockUpdateJobProgress = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockRenameSync = vi.hoisted(() => vi.fn());
const mockNextResponseJson = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: (...args: unknown[]) => mockNextResponseJson(...args),
  },
}));

vi.mock('child_process', () => ({ default: { exec: vi.fn() }, exec: vi.fn() }));

vi.mock('util', () => ({
  default: { promisify: () => mockExecAsync },
  promisify: () => mockExecAsync,
}));

vi.mock('../../job-storage', () => ({
  setJob: (...args: unknown[]) => mockSetJob(...args),
  updateJobProgress: (...args: unknown[]) => mockUpdateJobProgress(...args),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    renameSync: (...a: unknown[]) => mockRenameSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  renameSync: (...a: unknown[]) => mockRenameSync(...a),
}));

import { GET, POST } from '../route';

function makeReq(body: Record<string, unknown> = {}) {
  return { json: vi.fn().mockResolvedValue(body) } as any;
}

describe('/api/quality-reports/generate', () => {
  beforeEach(() => {
    mockNextResponseJson.mockImplementation(
      (body: unknown, init?: { status?: number }) => ({
        json: () => Promise.resolve(body),
        body,
        status: init?.status || 200,
        headers: new Map(),
      }),
    );
    mockExecAsync.mockResolvedValue({ stdout: '/root\n' });
    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockReturnValue(undefined);
    mockReadFileSync.mockReturnValue('{}');
    mockWriteFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);
    mockSetJob.mockReturnValue(undefined);
    mockUpdateJobProgress.mockReturnValue(undefined);
  });

  describe('GET', () => {
    it('returns available reports and usage info', async () => {
      const res = await GET();
      const d = await res.json();
      expect(d.success).toBe(true);
      expect(d.data.availableReports).toEqual(['coverage', 'lighthouse', 'performance']);
      expect(d.data.usage.method).toBe('POST');
    });
  });

  describe('POST', () => {
    it('defaults to coverage', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: 'All files |  85 |  70 |  90 |  85' });
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary.json'),
      );
      const d = await (await POST(makeReq({}))).json();
      expect(d.data.results).toHaveLength(1);
      expect(d.data.results[0].report).toBe('coverage');
    });

    it('parses coverage percentages', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: 'All files  |  92.5 |  80.1 |  95.3 |  91.2' });
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary.json'),
      );
      const d = await (
        await POST(makeReq({ reports: ['coverage'], scope: 'standard' }))
      ).json();
      expect(d.data.results[0].message).toContain('92.5');
      expect(d.data.scope).toBe('standard');
    });

    it('tests fail but coverage exists', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('Tests failed'));
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary.json'),
      );
      const d = await (await POST(makeReq({ reports: ['coverage'] }))).json();
      expect(d.data.results[0].message).toContain('some test failures');
    });

    it('cached data fallback', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('f'));
      mockExistsSync.mockImplementation(
        (p: string) =>
          typeof p === 'string' &&
          p.includes('misc') &&
          p.includes('coverage-summary.json'),
      );
      const d = await (await POST(makeReq({ reports: ['coverage'] }))).json();
      expect(d.data.results[0].message).toContain('cached data');
    });

    it('no coverage data', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('f'));
      const d = await (await POST(makeReq({ reports: ['coverage'] }))).json();
      expect(d.data.results[0].message).toContain('Coverage generation failed');
    });

    it('lighthouse placeholder', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('nf'));
      const d = await (await POST(makeReq({ reports: ['lighthouse'] }))).json();
      expect(d.data.results[0].message).toContain('placeholder');
    });

    it('real lighthouse', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: '12' })
        .mockResolvedValueOnce({ stdout: 'd' });
      mockExistsSync.mockImplementation(
        (p: string) =>
          typeof p === 'string' &&
          (p.includes('lighthouse-report.report.json') ||
            p.includes('lighthouse-report.report.html')),
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          categories: {
            performance: { score: 0.95 },
            accessibility: { score: 0.92 },
            'best-practices': { score: 0.88 },
            seo: { score: 0.97 },
          },
        }),
      );
      const d = await (
        await POST(makeReq({ reports: ['lighthouse'] }))
      ).json();
      expect(d.data.results[0].message).toContain('Perf: 95%');
    });

    it('Chrome errors', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: '12' })
        .mockRejectedValueOnce(new Error('Chrome not found'));
      const d = await (
        await POST(makeReq({ reports: ['lighthouse'] }))
      ).json();
      expect(d.data.results[0].message).toContain('Chrome');
    });

    it('synthetic perf', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('k6'));
      const d = await (
        await POST(makeReq({ reports: ['performance'] }))
      ).json();
      expect(d.data.results[0].message).toContain('Synthetic benchmarks');
    });

    it('k6 testing', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: 'k6 v0.50' })
        .mockResolvedValueOnce({ stdout: 'ok' });
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('load-test.js'),
      );
      const d = await (
        await POST(makeReq({ reports: ['performance'] }))
      ).json();
      expect(d.data.results[0].message).toContain('k6 load testing');
    });

    it('unknown type', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '/root\n' });
      const d = await (await POST(makeReq({ reports: ['bad'] }))).json();
      expect(d.data.results[0].message).toContain('Unknown report type');
    });

    it('multiple reports', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: 'All files |  85 |  80 |  90 |  85' })
        .mockRejectedValueOnce(new Error('k6'));
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('coverage-summary.json'),
      );
      const d = await (
        await POST(makeReq({ reports: ['coverage', 'performance'] }))
      ).json();
      expect(d.data.results).toHaveLength(2);
    });

    it('tracks job progress', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('k6'));
      await POST(makeReq({ reports: ['performance'], jobId: 'j1' }));
      expect(mockSetJob).toHaveBeenCalled();
    });

    it('json parse failure', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('f'));
      const req = { json: vi.fn().mockRejectedValue(new Error('bad')) } as any;
      const d = await (await POST(req)).json();
      expect(d.data.results[0].report).toBe('coverage');
    });

    it('500 on errors', async () => {
      mockNextResponseJson
        .mockImplementationOnce(() => { throw new Error('fail'); })
        .mockImplementation((body, init) => ({
          json: () => Promise.resolve(body),
          body,
          status: init?.status || 200,
          headers: new Map(),
        }));
      const res = await POST(makeReq({}));
      expect(res.status).toBe(500);
    });

    it('comprehensive scope', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockRejectedValueOnce(new Error('f'));
      const d = await (
        await POST(makeReq({ reports: ['coverage'], scope: 'comprehensive' }))
      ).json();
      expect(d.data.scope).toBe('comprehensive');
    });

    it('lighthouse JSON not found', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '/root\n' })
        .mockResolvedValueOnce({ stdout: '12' })
        .mockResolvedValueOnce({ stdout: 'd' });
      const d = await (
        await POST(makeReq({ reports: ['lighthouse'] }))
      ).json();
      expect(d.data.results[0].message).toContain('JSON not found');
    });
  });
});
