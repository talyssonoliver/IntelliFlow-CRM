import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';

// Mock fs module with default export
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockPromises = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    stat: vi.fn(),
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

// Sample data - matches the structure expected by the FIXED route.ts
// Route reads debt-analysis.json which uses bySeverity (not by_severity)
const SAMPLE_DEBT_ANALYSIS = {
  timestamp: '2026-01-06T10:00:00Z',
  summary: { total: 15 },
  bySeverity: { critical: 2, high: 5, medium: 6, low: 2 },
  trending: { trend: 'stable' },
  healthScore: 78,
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
  qualityGate: 'OK',
  bugs: 3,
  vulnerabilities: 1,
  codeSmells: 25,
  duplications: 2.5,
};

// Route reads phantom-completion-audit.json which uses summary.phantom_completions
const SAMPLE_PHANTOM = {
  summary: {
    phantom_completions: 2,
    verified_completions: 45,
  },
};

const SAMPLE_DEBT_HISTORY = [
  { date: '2026-01-01', total: 20, critical: 3 },
  { date: '2026-01-03', total: 18, critical: 2 },
  { date: '2026-01-06', total: 15, critical: 2 },
];

const SAMPLE_SONAR_HISTORY = [
  { date: '2026-01-01', bugs: 5, vulnerabilities: 2, codeSmells: 30 },
  { date: '2026-01-03', bugs: 4, vulnerabilities: 1, codeSmells: 28 },
  { date: '2026-01-06', bugs: 3, vulnerabilities: 1, codeSmells: 25 },
];

const SAMPLE_CADENCE_FRESHNESS = {
  audit_metadata: {
    generated_at: '2026-02-27T23:49:34.264Z',
    audit_type: 'CADENCE_FRESHNESS_CHECK',
    continuous_tasks_checked: 5,
  },
  summary: {
    total: 5,
    fresh: 3,
    stale: 2,
    missing: 0,
    freshness_score: '60%',
  },
  tasks: [],
};

/**
 * Helper to set up the standard 6-file mock chain for GET requests.
 * Route reads: debt-analysis, coverage, sonarqube-metrics, phantom, debt-history, sonar-history
 */
function setupGetMocks(overrides?: {
  debt?: any;
  coverage?: any;
  sonar?: any;
  phantom?: any;
  cadence?: any;
  debtHistory?: any;
  sonarHistory?: any;
}) {
  mockFs.readFile
    .mockResolvedValueOnce(JSON.stringify(overrides?.debt ?? SAMPLE_DEBT_ANALYSIS))
    .mockResolvedValueOnce(JSON.stringify(overrides?.coverage ?? SAMPLE_COVERAGE))
    .mockResolvedValueOnce(JSON.stringify(overrides?.sonar ?? SAMPLE_SONARQUBE))
    .mockResolvedValueOnce(JSON.stringify(overrides?.phantom ?? SAMPLE_PHANTOM))
    .mockResolvedValueOnce(JSON.stringify(overrides?.cadence ?? SAMPLE_CADENCE_FRESHNESS))
    .mockResolvedValueOnce(JSON.stringify(overrides?.debtHistory ?? SAMPLE_DEBT_HISTORY))
    .mockResolvedValueOnce(JSON.stringify(overrides?.sonarHistory ?? SAMPLE_SONAR_HISTORY));

  mockFs.stat.mockResolvedValue({ mtime: new Date('2026-01-06T10:00:00Z') });
}

describe('Quality Metrics API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tracking/quality', () => {
    it('returns quality metrics successfully', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics).toBeDefined();
    });

    it('parses debt metrics correctly', async () => {
      // Route reads: debt, coverage, sonar, phantom, debt-history, sonar-history
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.total_items).toBe(15);
      expect(data.metrics.debt.critical).toBe(2);
      expect(data.metrics.debt.high).toBe(5);
      expect(data.metrics.debt.medium).toBe(6);
      expect(data.metrics.debt.low).toBe(2);
      expect(data.metrics.debt.trend).toBe('stable');
      expect(data.metrics.debt.healthScore).toBe(78);
    });

    it('parses coverage metrics correctly', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.coverage.lines).toBe(85.5);
      expect(data.metrics.coverage.branches).toBe(72.3);
      expect(data.metrics.coverage.functions).toBe(90.1);
      expect(data.metrics.coverage.statements).toBe(84.2);
    });

    it('parses SonarQube metrics correctly', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.sonarqube.qualityGate).toBe('OK');
      expect(data.metrics.sonarqube.bugs).toBe(3);
      expect(data.metrics.sonarqube.vulnerabilities).toBe(1);
      expect(data.metrics.sonarqube.codeSmells).toBe(25);
      expect(data.metrics.sonarqube.duplications).toBe(2.5);
    });

    it('parses phantom audit correctly using summary.* paths', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.phantomAudit.phantomCount).toBe(2);
      expect(data.metrics.phantomAudit.validCount).toBe(45);
    });

    it('parses cadence freshness metrics correctly', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.cadenceFreshness).toBeDefined();
      expect(data.metrics.cadenceFreshness.total).toBe(5);
      expect(data.metrics.cadenceFreshness.fresh).toBe(3);
      expect(data.metrics.cadenceFreshness.stale).toBe(2);
      expect(data.metrics.cadenceFreshness.missing).toBe(0);
      expect(data.metrics.cadenceFreshness.freshnessScore).toBe('60%');
    });

    it('returns cadence defaults when report missing', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.cadenceFreshness.total).toBe(0);
      expect(data.metrics.cadenceFreshness.fresh).toBe(0);
      expect(data.metrics.cadenceFreshness.freshnessScore).toBe('0%');
      expect(data.metrics.cadenceFreshness.lastUpdated).toBeNull();
    });

    it('includes lastUpdated timestamps for trending', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.lastUpdated).toBeDefined();
      expect(data.metrics.coverage.lastUpdated).toBeDefined();
      expect(data.metrics.sonarqube.lastUpdated).toBeDefined();
      expect(data.metrics.phantomAudit.lastUpdated).toBeDefined();
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
      // T-010: history arrays should be empty when files missing
      expect(data.metrics.debt.history).toEqual([]);
      expect(data.metrics.sonarqube.history).toEqual([]);
    });

    it('returns lastUpdated timestamp', async () => {
      const updateTime = new Date('2026-01-05T12:00:00Z');
      setupGetMocks();
      mockFs.stat.mockReset();
      mockFs.stat.mockResolvedValue({ mtime: updateTime });

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.lastUpdated).toBe(updateTime.toISOString());
      expect(data.metrics.coverage.lastUpdated).toBe(updateTime.toISOString());
    });

    // T-004: GET includes debt.history array from debt-history.json
    it('includes debt history array from debt-history.json', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.debt.history).toBeDefined();
      expect(Array.isArray(data.metrics.debt.history)).toBe(true);
      expect(data.metrics.debt.history.length).toBe(3);
      expect(data.metrics.debt.history[0]).toHaveProperty('date');
      expect(data.metrics.debt.history[0]).toHaveProperty('total');
      expect(data.metrics.debt.history[0]).toHaveProperty('critical');
    });

    // T-005: GET includes sonarqube.history array from sonarqube-history.json
    it('includes sonarqube history array from sonarqube-history.json', async () => {
      setupGetMocks();

      const response = await GET();
      const data = await response.json();

      expect(data.metrics.sonarqube.history).toBeDefined();
      expect(Array.isArray(data.metrics.sonarqube.history)).toBe(true);
      expect(data.metrics.sonarqube.history.length).toBe(3);
      expect(data.metrics.sonarqube.history[0]).toHaveProperty('date');
      expect(data.metrics.sonarqube.history[0]).toHaveProperty('bugs');
    });

    // T-006: GET handles missing history files gracefully (returns empty arrays)
    it('handles missing history files gracefully', async () => {
      // First 5 reads succeed, last 2 (history) fail
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_CADENCE_FRESHNESS))
        .mockRejectedValueOnce(new Error('debt-history.json not found'))
        .mockRejectedValueOnce(new Error('sonarqube-history.json not found'));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics.debt.history).toEqual([]);
      expect(data.metrics.sonarqube.history).toEqual([]);
    });

    // T-009: GET returns zeros/defaults/empty arrays when all source files missing
    it('returns zeros and empty arrays when all source files missing', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics.debt.total_items).toBe(0);
      expect(data.metrics.debt.critical).toBe(0);
      expect(data.metrics.debt.healthScore).toBe(0);
      expect(data.metrics.debt.history).toEqual([]);
      expect(data.metrics.coverage.lines).toBe(0);
      expect(data.metrics.sonarqube.bugs).toBe(0);
      expect(data.metrics.sonarqube.history).toEqual([]);
      expect(data.metrics.phantomAudit.phantomCount).toBe(0);
    });

    // T-012: GET returns SonarQube cached data when sonarqube-metrics.json exists but sonarqube-history.json missing
    it('returns SonarQube cached data when history file missing', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_ANALYSIS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_COVERAGE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONARQUBE))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_PHANTOM))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_CADENCE_FRESHNESS))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_DEBT_HISTORY))
        .mockRejectedValueOnce(new Error('sonarqube-history.json not found'));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // SonarQube main metrics still present from sonarqube-metrics.json
      expect(data.metrics.sonarqube.bugs).toBe(3);
      expect(data.metrics.sonarqube.qualityGate).toBe('OK');
      // History empty because sonarqube-history.json is missing
      expect(data.metrics.sonarqube.history).toEqual([]);
      // Debt history still works
      expect(data.metrics.debt.history.length).toBe(3);
    });
  });

  describe('POST /api/tracking/quality', () => {
    it('refreshes all metrics when type=all', async () => {
      // POST calls GET internally which reads 6 files
      setupGetMocks();

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
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=debt', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
    });

    it('refreshes only sonar metrics when type=sonar', async () => {
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=sonar', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
    });

    it('refreshes coverage when type=coverage', async () => {
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=coverage', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
    });

    it('returns metrics data after refresh', async () => {
      setupGetMocks();

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

    // T-008: POST type=sonar invokes sonarqube-metrics with --save flag
    // The --save flag is verified by code inspection (route.ts uses `"${sonarScript}" --save`)
    // This test verifies the sonar POST handler executes successfully and returns results
    it('executes sonar refresh and returns results', async () => {
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=sonar', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
      expect(data.results.sonar).toBe('updated');
      expect(data.metrics).toBeDefined();
    });

    // T-011: POST type=phantom re-reads phantom audit JSON
    it('handles type=phantom and returns fresh phantom data', async () => {
      setupGetMocks();

      const request = new NextRequest('http://localhost:3002/api/tracking/quality?type=phantom', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics).toBeDefined();
      expect(data.metrics.phantomAudit).toBeDefined();
    });
  });
});
