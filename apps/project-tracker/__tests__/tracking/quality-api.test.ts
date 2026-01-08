import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      appendFile: vi.fn(),
      stat: vi.fn(),
    },
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: '', stderr: '' })),
  };
});

// Import after mocking
const { GET, POST } = await import('../../app/api/tracking/quality/route');

const mockFs = fs as unknown as {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  appendFile: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

// Sample data - matches debt-analysis.json structure from debt-analyzer.js
const SAMPLE_DEBT_ANALYSIS = {
  timestamp: '2026-01-06T10:00:00Z',
  status: 'warning',
  healthScore: 75,
  summary: { total: 15, open: 10, inProgress: 2, resolved: 3, critical: 2, overdue: 0, expiringSoon: 1 },
  bySeverity: { critical: 2, high: 5, medium: 6, low: 2 },
  trending: { trend: 'stable', change: 0, percentChange: '0.0', history: [] },
};

const SAMPLE_COVERAGE = {
  total: {
    lines: { pct: 85.5 },
    branches: { pct: 72.3 },
    functions: { pct: 90.1 },
    statements: { pct: 84.2 },
  },
};

const SAMPLE_SONARQUBE = {
  qualityGate: { status: 'OK' },
  bugs: 3,
  vulnerabilities: 1,
  codeSmells: 25,
  duplications: 2.5,
};

const SAMPLE_PHANTOM = {
  phantom_count: 2,
  valid_count: 45,
};

const SAMPLE_DEBT_HISTORY = {
  snapshots: [
    { date: '2026-01-05', totals: { total: 15 } },
    { date: '2026-01-04', totals: { total: 16 } },
    { date: '2026-01-03', totals: { total: 14 } },
  ],
};

const SAMPLE_SONAR_HISTORY = {
  snapshots: [
    { date: '2026-01-05', bugs: 3 },
    { date: '2026-01-04', bugs: 5 },
    { date: '2026-01-03', bugs: 4 },
  ],
};

describe('Quality Metrics API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tracking/quality', () => {
    it('returns quality metrics successfully', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS)) // debt-ledger.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY)) // debt-history.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE)) // coverage-summary.json
        .mockResolvedValueOnce('') // coverage-history.jsonl (empty)
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE)) // latest.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY)) // sonarqube-history.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM)); // phantom-completion-audit.json

      mockFs.stat.mockResolvedValue({ mtime: new Date('2026-01-05T10:00:00Z') });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics).toBeDefined();
    });

    it('parses debt metrics correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.total_items).toBe(15);
      expect(data.metrics.debt.critical).toBe(2);
      expect(data.metrics.debt.high).toBe(5);
      expect(data.metrics.debt.medium).toBe(6);
      expect(data.metrics.debt.low).toBe(2);
      expect(data.metrics.debt.trend).toBe('stable');
    });

    it('parses coverage metrics correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.coverage.lines).toBe(85.5);
      expect(data.metrics.coverage.branches).toBe(72.3);
      expect(data.metrics.coverage.functions).toBe(90.1);
      expect(data.metrics.coverage.statements).toBe(84.2);
    });

    it('parses SonarQube metrics correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.sonarqube.qualityGate).toBe('OK');
      expect(data.metrics.sonarqube.bugs).toBe(3);
      expect(data.metrics.sonarqube.vulnerabilities).toBe(1);
      expect(data.metrics.sonarqube.codeSmells).toBe(25);
      expect(data.metrics.sonarqube.duplications).toBe(2.5);
    });

    it('parses phantom audit correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.phantomAudit.phantomCount).toBe(2);
      expect(data.metrics.phantomAudit.validCount).toBe(45);
    });

    it('includes history data for trending', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.history).toBeDefined();
      expect(Array.isArray(data.metrics.debt.history)).toBe(true);
      expect(data.metrics.sonarqube.history).toBeDefined();
      expect(Array.isArray(data.metrics.sonarqube.history)).toBe(true);
    });

    it('handles missing files gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics.debt.total_items).toBe(0);
      expect(data.metrics.coverage.lines).toBe(0);
      expect(data.metrics.sonarqube.bugs).toBe(0);
    });

    it('returns lastUpdated timestamp', async () => {
      const updateTime = new Date('2026-01-05T12:00:00Z');
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: updateTime });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.lastUpdated).toBe(updateTime.toISOString());
      expect(data.metrics.coverage.lastUpdated).toBe(updateTime.toISOString());
    });
  });

  describe('POST /api/tracking/quality', () => {
    it('refreshes all metrics when type=all', async () => {
      // Setup mocks for GET call after refresh
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=all', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.message).toContain('refreshed');
    });

    it('refreshes only debt metrics when type=debt', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=debt', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
    });

    it('refreshes only sonar metrics when type=sonar', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=sonar', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
    });

    it('refreshes coverage when type=coverage', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE)) // For saveCoverageSnapshot
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });
      mockFs.appendFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=coverage', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
    });

    it('returns metrics data after refresh', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_HISTORY))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=all', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.metrics).toBeDefined();
      expect(data.metrics.debt).toBeDefined();
      expect(data.metrics.coverage).toBeDefined();
      expect(data.metrics.sonarqube).toBeDefined();
    });
  });
});
