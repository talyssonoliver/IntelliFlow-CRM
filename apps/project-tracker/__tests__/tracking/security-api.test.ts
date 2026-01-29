import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';

// Mock fs module with default export
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockPromises = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
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
  spawn: vi.fn(),
}));

vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: '', stderr: '' })),
  };
});

// Import after mocking
const { GET, POST } = await import('../../app/api/tracking/security/route');

const mockFs = fs as unknown as {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

// Sample data
const SAMPLE_AUDIT_DATA = {
  metadata: {
    vulnerabilities: {
      critical: 0,
      high: 2,
      moderate: 5,
      low: 3,
      total: 10,
    },
  },
  scanDate: '2026-01-06T10:00:00Z',
};

const SAMPLE_GITLEAKS_DATA = {
  leaksFound: 0,
  filesScanned: 150,
  findings: [],
  scanDate: '2026-01-06T10:00:00Z',
};

const SAMPLE_SONAR_DATA = {
  success: true,
  vulnerabilities: 1,
  securityHotspots: 3,
  securityRating: 'A',
  sonarAvailable: true,
};

const SAMPLE_OUTDATED_DATA = {
  major: 3,
  minor: 8,
  patch: 15,
  total: 26,
  packages: [
    { name: 'typescript', current: '4.9.5', latest: '5.3.3', type: 'major' },
    { name: 'react', current: '18.2.0', latest: '18.3.0', type: 'minor' },
    { name: 'lodash', current: '4.17.20', latest: '4.17.21', type: 'patch' },
  ],
  scanDate: '2026-01-06T10:00:00Z',
};

const SAMPLE_BASELINE_DATA = {
  critical: 0,
  high: 2,
  date: '2026-01-05T12:00:00Z',
  history: [
    { date: '2026-01-05T12:00:00Z', total: 10, critical: 0, secretLeaks: 0, sastVulns: 1 },
    { date: '2026-01-04T12:00:00Z', total: 12, critical: 1, secretLeaks: 0, sastVulns: 2 },
  ],
};

const SAMPLE_SCAN_STATE_IDLE = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  currentStep: null,
  progress: {
    dependency_check: 'pending',
    outdated_check: 'pending',
    secret_scan: 'pending',
    sast_scan: 'pending',
  },
  errors: [],
  scanId: null,
};

const SAMPLE_SCAN_STATE_RUNNING = {
  status: 'running',
  startedAt: new Date().toISOString(),
  completedAt: null,
  currentStep: 'Running dependency audit...',
  progress: {
    dependency_check: 'running',
    outdated_check: 'pending',
    secret_scan: 'pending',
    sast_scan: 'pending',
  },
  errors: [],
  scanId: 'scan-123',
};

const SAMPLE_SCAN_STATE_COMPLETED = {
  status: 'completed',
  startedAt: '2026-01-06T09:00:00Z',
  completedAt: '2026-01-06T09:05:00Z',
  currentStep: null,
  progress: {
    dependency_check: 'completed',
    outdated_check: 'completed',
    secret_scan: 'completed',
    sast_scan: 'completed',
  },
  errors: [],
  scanId: 'scan-456',
};

describe('Security API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tracking/security', () => {
    it('returns security metrics successfully', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA)) // pnpm-audit-latest.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA)) // pnpm-outdated-latest.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA)) // gitleaks-latest.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA)) // sonarqube-metrics.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA)) // vulnerability-baseline.json
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE)); // scan-state.json

      mockFs.stat.mockResolvedValue({ mtime: new Date('2026-01-06T10:00:00Z') });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics).toBeDefined();
    });

    it('parses vulnerability counts correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.vulnerabilities.critical).toBe(0);
      expect(data.metrics.vulnerabilities.high).toBe(2);
      expect(data.metrics.vulnerabilities.moderate).toBe(5);
      expect(data.metrics.vulnerabilities.low).toBe(3);
      expect(data.metrics.vulnerabilities.total).toBe(10);
    });

    it('parses outdated dependencies correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.outdatedDeps.major).toBe(3);
      expect(data.metrics.outdatedDeps.minor).toBe(8);
      expect(data.metrics.outdatedDeps.patch).toBe(15);
      expect(data.metrics.outdatedDeps.total).toBe(26);
      expect(data.metrics.outdatedDeps.packages).toHaveLength(3);
      expect(data.metrics.outdatedDeps.packages[0].name).toBe('typescript');
      expect(data.metrics.outdatedDeps.packages[0].type).toBe('major');
    });

    it('parses secret scan results correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.secretScan.leaksFound).toBe(0);
      expect(data.metrics.secretScan.filesScanned).toBe(150);
    });

    it('parses SAST scan results correctly', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.sastScan.vulnerabilities).toBe(1);
      expect(data.metrics.sastScan.securityHotspots).toBe(3);
      expect(data.metrics.sastScan.securityRating).toBe('A');
      expect(data.metrics.sastScan.available).toBe(true);
    });

    it('calculates compliance correctly when passing', async () => {
      const auditNoCritical = {
        ...SAMPLE_AUDIT_DATA,
        metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, total: 0 } },
      };
      const outdatedNoMajor = { major: 0, minor: 5, patch: 10, total: 15, packages: [] };
      const gitleaksClean = { ...SAMPLE_GITLEAKS_DATA, leaksFound: 0 };
      const sonarClean = { ...SAMPLE_SONAR_DATA, vulnerabilities: 0 };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(auditNoCritical))
        .mockResolvedValueOnce(JSON.stringify(outdatedNoMajor))
        .mockResolvedValueOnce(JSON.stringify(gitleaksClean))
        .mockResolvedValueOnce(JSON.stringify(sonarClean))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.compliance.owasp_top10).toBe(true);
      expect(data.metrics.compliance.dependency_check).toBe(true);
      expect(data.metrics.compliance.secret_scan).toBe(true);
      expect(data.metrics.compliance.deps_current).toBe(true);
    });

    it('calculates compliance correctly when failing', async () => {
      const auditWithCritical = {
        metadata: { vulnerabilities: { critical: 2, high: 3, moderate: 0, low: 0, total: 5 } },
      };
      const outdatedWithMajor = { major: 3, minor: 5, patch: 10, total: 18, packages: [] };
      const gitleaksWithLeaks = { leaksFound: 3, findings: [{}, {}, {}] };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(auditWithCritical))
        .mockResolvedValueOnce(JSON.stringify(outdatedWithMajor))
        .mockResolvedValueOnce(JSON.stringify(gitleaksWithLeaks))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.compliance.owasp_top10).toBe(false); // Critical vulns found
      expect(data.metrics.compliance.dependency_check).toBe(true); // Audit ran
      expect(data.metrics.compliance.secret_scan).toBe(false); // Leaks found
      expect(data.metrics.compliance.deps_current).toBe(false); // Major updates pending
    });

    it('handles missing files gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.metrics.vulnerabilities.total).toBe(0);
      expect(data.metrics.secretScan.leaksFound).toBe(0);
      expect(data.metrics.outdatedDeps.total).toBe(0);
      expect(data.metrics.outdatedDeps.packages).toEqual([]);
    });

    it('handles missing outdated data gracefully', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockRejectedValueOnce(new Error('No outdated data')) // pnpm-outdated-latest.json missing
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics.outdatedDeps.major).toBe(0);
      expect(data.metrics.outdatedDeps.minor).toBe(0);
      expect(data.metrics.outdatedDeps.patch).toBe(0);
      expect(data.metrics.outdatedDeps.total).toBe(0);
      expect(data.metrics.outdatedDeps.packages).toEqual([]);
      // deps_current should be true when no outdated data (assume current)
      expect(data.metrics.compliance.deps_current).toBe(true);
    });

    it('returns scan status when ?status=true', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_RUNNING));
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security?status=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.scan).toBeDefined();
      expect(data.scan.status).toBe('running');
      expect(data.scan.scanId).toBe('scan-123');
    });

    it('returns completed scan status', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_COMPLETED));
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security?status=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.scan.status).toBe('completed');
      expect(data.scan.progress.dependency_check).toBe('completed');
      expect(data.scan.progress.outdated_check).toBe('completed');
      expect(data.scan.progress.secret_scan).toBe('completed');
      expect(data.scan.progress.sast_scan).toBe('completed');
    });

    it('includes scan history from baseline', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.scanHistory).toBeDefined();
      expect(Array.isArray(data.metrics.scanHistory)).toBe(true);
      expect(data.metrics.scanHistory.length).toBe(2);
    });

    it('includes baseline data', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.baseline).toBeDefined();
      expect(data.metrics.baseline.critical).toBe(0);
      expect(data.metrics.baseline.high).toBe(2);
    });

    it('handles alternative audit data format', async () => {
      const altAuditFormat = {
        vulnerabilities: {
          critical: 1,
          high: 4,
          medium: 6,
          low: 2,
        },
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(altAuditFormat))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.vulnerabilities.critical).toBe(1);
      expect(data.metrics.vulnerabilities.high).toBe(4);
      expect(data.metrics.vulnerabilities.moderate).toBe(6); // medium mapped to moderate
    });

    it('returns lastUpdated timestamps', async () => {
      const updateTime = new Date('2026-01-06T12:00:00Z');

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: updateTime });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.lastScan).toBe(updateTime.toISOString());
      expect(data.metrics.secretScan.lastScan).toBe(updateTime.toISOString());
      expect(data.metrics.outdatedDeps.lastScan).toBe(updateTime.toISOString());
    });

    it('returns scanState with progress info', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_RUNNING));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.scanState).toBeDefined();
      expect(data.scanState.status).toBe('running');
      expect(data.scanState.progress).toBeDefined();
      expect(data.scanState.progress.outdated_check).toBeDefined();
    });
  });

  describe('POST /api/tracking/security', () => {
    it('starts a new scan when idle', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.message).toContain('started');
      expect(data.scanId).toBeDefined();
      expect(data.pollUrl).toBe('/api/tracking/security?status=true');
    });

    it('starts a new scan when previous scan completed', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_COMPLETED));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.scanId).toBeDefined();
    });

    it('returns 409 when scan already running', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_RUNNING));

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.status).toBe('busy');
      expect(data.message).toContain('already running');
      expect(data.scan).toBeDefined();
    });

    it('allows override for stale scans (>10 minutes)', async () => {
      const staleStartTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes ago
      const staleScanState = {
        ...SAMPLE_SCAN_STATE_RUNNING,
        startedAt: staleStartTime,
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(staleScanState));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.scanId).toBeDefined();
    });

    it('initializes scan state correctly on POST', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Verify scan was started correctly
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.scanId).toBeDefined();
      expect(data.scanId).toMatch(/^scan-\d+$/);
      expect(data.pollUrl).toBe('/api/tracking/security?status=true');

      // Verify writeFile was called (state was persisted)
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('handles gracefully when scan state file missing', async () => {
      // When scan-state.json doesn't exist, getScanState returns default state
      // and scan can still start
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT')); // scan-state.json missing
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Should still start successfully (uses default idle state)
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.scanId).toBeDefined();
    });

    it('returns valid scan response format', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Verify complete response structure
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('scanId');
      expect(data).toHaveProperty('pollUrl');
      expect(typeof data.scanId).toBe('string');
      expect(data.pollUrl).toContain('/api/tracking/security');
    });

    it('creates security directory if not exists', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });

      await POST(request);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('security'),
        { recursive: true }
      );
    });
  });

  describe('Scan State Management', () => {
    it('returns default state when scan-state.json missing', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const request = new NextRequest('http://localhost:3002/api/tracking/security?status=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.scan.status).toBe('idle');
      expect(data.scan.scanId).toBeNull();
    });

    it('preserves progress states during polling', async () => {
      const midScanState = {
        status: 'running',
        startedAt: new Date().toISOString(),
        completedAt: null,
        currentStep: 'Running secret scan...',
        progress: {
          dependency_check: 'completed',
          outdated_check: 'completed',
          secret_scan: 'running',
          sast_scan: 'pending',
        },
        errors: [],
        scanId: 'scan-789',
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(midScanState));
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security?status=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.scan.progress.dependency_check).toBe('completed');
      expect(data.scan.progress.outdated_check).toBe('completed');
      expect(data.scan.progress.secret_scan).toBe('running');
      expect(data.scan.progress.sast_scan).toBe('pending');
      expect(data.scan.currentStep).toBe('Running secret scan...');
    });

    it('includes errors in scan state', async () => {
      const failedScanState = {
        status: 'failed',
        startedAt: '2026-01-06T09:00:00Z',
        completedAt: '2026-01-06T09:02:00Z',
        currentStep: null,
        progress: {
          dependency_check: 'completed',
          outdated_check: 'completed',
          secret_scan: 'failed',
          sast_scan: 'skipped',
        },
        errors: ['gitleaks not installed'],
        scanId: 'scan-fail',
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(failedScanState));
      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security?status=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.scan.status).toBe('failed');
      expect(data.scan.errors).toContain('gitleaks not installed');
      expect(data.scan.progress.outdated_check).toBe('completed');
      expect(data.scan.progress.secret_scan).toBe('failed');
      expect(data.scan.progress.sast_scan).toBe('skipped');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty gitleaks findings array', async () => {
      const emptyFindings = { findings: [], filesScanned: 100 };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(emptyFindings))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.secretScan.leaksFound).toBe(0);
    });

    it('handles sonar unavailable state', async () => {
      const sonarUnavailable = {
        success: false,
        sonarAvailable: false,
        error: 'SonarQube not running',
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(sonarUnavailable))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.sastScan.available).toBe(false);
      expect(data.metrics.sastScan.securityRating).toBe('N/A');
    });

    it('handles null baseline data', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_OUTDATED_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockRejectedValueOnce(new Error('No baseline')) // baseline missing
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.baseline).toBeNull();
      expect(data.metrics.scanHistory).toEqual([]);
    });

    it('handles empty outdated packages list', async () => {
      const noOutdated = { major: 0, minor: 0, patch: 0, total: 0, packages: [] };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(noOutdated))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.outdatedDeps.total).toBe(0);
      expect(data.metrics.outdatedDeps.packages).toEqual([]);
      expect(data.metrics.compliance.deps_current).toBe(true);
    });

    it('handles outdated data with only minor/patch updates', async () => {
      const onlyMinorPatch = {
        major: 0,
        minor: 5,
        patch: 10,
        total: 15,
        packages: [
          { name: 'lodash', current: '4.17.20', latest: '4.18.0', type: 'minor' },
          { name: 'axios', current: '1.5.0', latest: '1.5.1', type: 'patch' },
        ],
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_AUDIT_DATA))
        .mockResolvedValueOnce(JSON.stringify(onlyMinorPatch))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_GITLEAKS_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SONAR_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_BASELINE_DATA))
        .mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));

      mockFs.stat.mockResolvedValue({ mtime: new Date() });

      const request = new NextRequest('http://localhost:3002/api/tracking/security');
      const response = await GET(request);
      const data = await response.json();

      expect(data.metrics.outdatedDeps.major).toBe(0);
      expect(data.metrics.outdatedDeps.minor).toBe(5);
      expect(data.metrics.outdatedDeps.patch).toBe(10);
      expect(data.metrics.compliance.deps_current).toBe(true); // No major updates = compliant
    });

    it('handles concurrent POST requests correctly', async () => {
      // First request starts scan
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_SCAN_STATE_IDLE));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const request1 = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });
      const response1 = await POST(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(200);
      expect(data1.scanId).toBeDefined();

      // Second request should see running state
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({
        ...SAMPLE_SCAN_STATE_RUNNING,
        scanId: data1.scanId,
      }));

      const request2 = new NextRequest('http://localhost:3002/api/tracking/security', {
        method: 'POST',
      });
      const response2 = await POST(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(409);
      expect(data2.status).toBe('busy');
    });
  });
});
