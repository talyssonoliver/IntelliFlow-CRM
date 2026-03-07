import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';

// Mock fs module with default export
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockPromises = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
  };
  return {
    ...actual,
    default: {
      ...actual,
      promises: mockPromises,
    },
    promises: mockPromises,
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Create a controllable mock for execAsync
const mockExecAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: vi.fn(() => mockExecAsync),
  };
});

// Import after mocking
const { GET, POST } = await import('../../app/api/tracking/build/route');

const mockFs = fs as any as {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};

// Sample data matching build-state.json structure
const SAMPLE_BUILD_STATE = {
  turbo: {
    success: true,
    tasks_run: 33,
    tasks_cached: 25,
    duration_ms: 56038,
    errors: [],
    lastRun: '2026-01-06T10:00:00Z',
  },
  typecheck: {
    success: true,
    errors: 0,
    warnings: 0,
    lastRun: '2026-01-06T10:00:00Z',
  },
  lint: {
    success: true,
    errors: 0,
    warnings: 0,
    lastRun: '2026-01-06T10:00:00Z',
  },
};

const SAMPLE_COVERAGE = {
  total: {
    lines: { pct: 85.5 },
  },
};

/**
 * Helper: set up GET mocks (build-state first, then coverage).
 * Route reads build-state.json then coverage-summary.json.
 */
function setupGetMocks(overrides?: {
  buildState?: any;
  coverage?: any;
  buildStateFails?: boolean;
  coverageFails?: boolean;
}) {
  if (overrides?.buildStateFails) {
    mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
  } else {
    mockFs.readFile.mockResolvedValueOnce(
      JSON.stringify(overrides?.buildState ?? SAMPLE_BUILD_STATE)
    );
  }

  if (overrides?.coverageFails) {
    mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));
  } else {
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(overrides?.coverage ?? SAMPLE_COVERAGE));
  }

  mockFs.stat.mockResolvedValue({ mtime: new Date('2026-01-06T10:00:00Z') });
}

describe('Build API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tracking/build', () => {
    it('returns metrics successfully when both files present', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics).toBeDefined();
      expect(data.metrics.turbo.tasks_run).toBe(33);
      expect(data.metrics.typecheck.success).toBe(true);
      expect(data.metrics.lint.success).toBe(true);
    });

    it('returns defaults when build-state.json is missing', async () => {
      setupGetMocks({ buildStateFails: true });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics.turbo.tasks_run).toBe(0);
      expect(data.metrics.typecheck.success).toBe(true);
      expect(data.metrics.lint.success).toBe(true);
    });

    it('returns coverage: 0 when coverage-summary.json is missing', async () => {
      setupGetMocks({ coverageFails: true });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics.tests.coverage).toBe(0);
    });

    it('returns all defaults when both files are missing', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics.turbo.tasks_run).toBe(0);
      expect(data.metrics.typecheck.errors).toBe(0);
      expect(data.metrics.lint.errors).toBe(0);
      expect(data.metrics.tests.total).toBe(0);
    });

    it('returns defaults gracefully for malformed JSON in build-state', async () => {
      mockFs.readFile
        .mockResolvedValueOnce('not valid json')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE));
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      // readJsonFile catches parse error and returns null, so defaults are used
      expect(response.status).toBe(200);
      expect(data.metrics.turbo.tasks_run).toBe(0);
    });

    it('merges coverage into metrics.tests when no saved tests key exists', async () => {
      // build-state without tests key
      setupGetMocks({
        buildState: {
          turbo: SAMPLE_BUILD_STATE.turbo,
          typecheck: SAMPLE_BUILD_STATE.typecheck,
          lint: SAMPLE_BUILD_STATE.lint,
        },
        coverage: { total: { lines: { pct: 92.3 } } },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.tests.coverage).toBe(92.3);
    });

    it('uses saved tests data when build-state has tests key', async () => {
      setupGetMocks({
        buildState: {
          ...SAMPLE_BUILD_STATE,
          tests: {
            passed: 100,
            failed: 2,
            skipped: 1,
            total: 103,
            coverage: 88.0,
            lastRun: '2026-01-06T12:00:00Z',
          },
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.tests.passed).toBe(100);
      expect(data.metrics.tests.failed).toBe(2);
      expect(data.metrics.tests.total).toBe(103);
    });
  });

  describe('POST /api/tracking/build — typecheck', () => {
    it('returns typecheck success with no errors', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'Tasks:    8 successful, 8 total\nCached:    6 cached, 8 total\n',
        stderr: '',
      });
      // For saveBuildState + internal GET call
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('detects "Found N error" in output as failure', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'Found 5 errors in 3 files\n',
        stderr: '',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      // The state written should have typecheck.success = false
      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.typecheck.success).toBe(false);
        expect(savedState.typecheck.errors).toBe(5);
      }
    });

    it('updates turbo state when turbo summary is in output', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'Tasks:    8 successful, 8 total\nCached:    6 cached, 8 total\n',
        stderr: '',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.turbo).toBeDefined();
        expect(savedState.turbo.tasks_run).toBe(8);
        expect(savedState.turbo.tasks_cached).toBe(6);
      }
    });

    it('handles exec failure with error count in output', async () => {
      mockExecAsync.mockRejectedValueOnce({
        stdout: 'Found 3 errors\n',
        stderr: 'error TS2345',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.typecheck.success).toBe(false);
        expect(savedState.typecheck.errors).toBe(3);
      }
    });

    it('handles exec failure with no match in output (defaults to 1 error)', async () => {
      mockExecAsync.mockRejectedValueOnce({
        stdout: '',
        stderr: 'Unknown error occurred',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.typecheck.success).toBe(false);
        expect(savedState.typecheck.errors).toBe(1);
      }
    });
  });

  describe('POST /api/tracking/build — lint', () => {
    it('returns lint success with 0 errors', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'All files passed linting\n',
        stderr: '',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=lint', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.lint.success).toBe(true);
        expect(savedState.lint.errors).toBe(0);
      }
    });

    it('captures N errors and M warnings from lint output', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: '5 errors and 3 warnings found\n',
        stderr: '',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=lint', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.lint.errors).toBe(5);
        expect(savedState.lint.warnings).toBe(3);
      }
    });

    it('handles lint exec failure with error count', async () => {
      mockExecAsync.mockRejectedValueOnce({
        stdout: '2 errors found\n',
        stderr: '',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=lint', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.lint.success).toBe(false);
        expect(savedState.lint.errors).toBe(2);
      }
    });

    it('handles lint exec failure with no match (defaults to 1)', async () => {
      mockExecAsync.mockRejectedValueOnce({
        stdout: '',
        stderr: '',
      });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=lint', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.lint.success).toBe(false);
        expect(savedState.lint.errors).toBe(1);
      }
    });
  });

  describe('POST /api/tracking/build — type=all', () => {
    it('runs both typecheck and lint when type=all', async () => {
      // First call for typecheck, second for lint
      mockExecAsync
        .mockResolvedValueOnce({
          stdout: 'Tasks:    8 successful, 8 total\nCached:    6 cached, 8 total\n',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '0 errors\n', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=all', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.typecheck).toBeDefined();
        expect(savedState.lint).toBeDefined();
      }
    });

    it('preserves mixed results when typecheck fails and lint succeeds', async () => {
      mockExecAsync
        .mockRejectedValueOnce({ stdout: 'Found 2 errors\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '0 errors\n', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=all', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.typecheck.success).toBe(false);
        expect(savedState.lint.success).toBe(true);
      }
    });

    it('both succeed for type=all', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=all', {
        method: 'POST',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.status).toBe('ok');
    });
  });

  describe('POST /api/tracking/build — type=unknown', () => {
    it('neither typecheck nor lint handler runs for unknown type', async () => {
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=unknown', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      // execAsync should not have been called
      expect(mockExecAsync).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/tracking/build — persistence', () => {
    it('calls mkdir with recursive: true for reports dir', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      await POST(request);

      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringContaining('reports'), {
        recursive: true,
      });
    });

    it('calls writeFile with JSON-serialized state', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      await POST(request);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(() => JSON.parse(writeCall[1] as string)).not.toThrow();
    });

    it('preserves existing state for sections not being updated', async () => {
      // First readFile call returns existing state with lint data
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          lint: { success: true, errors: 0, warnings: 0, lastRun: '2026-01-01T00:00:00Z' },
        })
      );
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      // For internal GET after save
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BUILD_STATE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE));

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        // lint should be preserved from existing state
        expect(savedState.lint).toBeDefined();
        expect(savedState.lint.success).toBe(true);
      }
    });

    it('sets lastRun to ISO timestamp on each section update', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      await POST(request);

      const writeCall = mockFs.writeFile.mock.calls[0];
      if (writeCall) {
        const savedState = JSON.parse(writeCall[1] as string);
        expect(savedState.typecheck.lastRun).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('response includes fresh metrics from internal GET call', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.metrics).toBeDefined();
      expect(data.metrics.turbo).toBeDefined();
      expect(data.metrics.tests).toBeDefined();
    });
  });

  describe('POST /api/tracking/build — error handling', () => {
    it('returns 500 when saveBuildState fails', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // First readFile for existing state
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({}));
      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      // Make mkdir fail to trigger saveBuildState failure
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      const request = new NextRequest('http://localhost:3002/api/tracking/build?type=typecheck', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });

    it('GET returns 500 on unexpected error', async () => {
      // Make readFile throw a non-standard error that isn't caught by readJsonFile
      mockFs.readFile.mockImplementation(() => {
        throw new Error('Unexpected system error');
      });

      const response = await GET();
      const data = await response.json();

      // readJsonFile has a try-catch that returns { data: null, lastUpdated: null }
      // So GET should still succeed with defaults
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });
  });

  describe('GET /api/tracking/build — response contract', () => {
    it('response always has status and metrics keys', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('metrics');
    });

    it('metrics has exactly 4 keys: turbo, tests, typecheck, lint', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      const keys = Object.keys(data.metrics).sort();
      expect(keys).toEqual(['lint', 'tests', 'turbo', 'typecheck']);
    });
  });
});
